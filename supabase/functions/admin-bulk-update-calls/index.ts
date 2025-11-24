import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { auth: { persistSession: false } }
        );

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            { auth: { persistSession: false } }
        );

        // Auth Check
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) throw new Error("Missing authorization header");

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
        if (authError || !user) throw new Error("Invalid token");

        // Admin Check
        const { data: userData, error: userError } = await supabaseAdmin
            .from("users")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

        if (userError || userData?.role !== "admin") {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: corsHeaders });
        }

        const { action, callIds, rate } = await req.json();

        if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
            throw new Error("No calls selected");
        }

        console.log(`Admin ${user.id} performing ${action} on ${callIds.length} calls`);

        if (action === 'delete') {
            // Fetch calls to preserve highlevel_call_id for deleted_calls table
            const { data: callsToDelete, error: fetchError } = await supabaseAdmin
                .from("calls")
                .select("id, user_id, highlevel_call_id")
                .in("id", callIds);

            if (fetchError) throw fetchError;

            // Add to deleted_calls
            const deletedCallsRecords = callsToDelete
                .filter((c: any) => c.highlevel_call_id)
                .map((c: any) => ({
                    user_id: c.user_id,
                    highlevel_call_id: c.highlevel_call_id,
                }));

            if (deletedCallsRecords.length > 0) {
                await supabaseAdmin.from("deleted_calls").upsert(deletedCallsRecords, { onConflict: 'user_id,highlevel_call_id' });
            }

            // Delete calls
            const { error: deleteError } = await supabaseAdmin
                .from("calls")
                .delete()
                .in("id", callIds);

            if (deleteError) throw deleteError;

        } else if (action === 'make_free') {
            const { error: updateError } = await supabaseAdmin
                .from("calls")
                .update({ cost: 0 })
                .in("id", callIds);

            if (updateError) throw updateError;

        } else if (action === 'set_rate') {
            if (typeof rate !== 'number') throw new Error("Rate is required for set_rate action");

            // Fetch calls to get duration
            const { data: callsToUpdate, error: fetchError } = await supabaseAdmin
                .from("calls")
                .select("id, duration")
                .in("id", callIds);

            if (fetchError) throw fetchError;

            // Update each call
            // Note: For large batches, this loop might be slow. 
            // Ideally we'd use a SQL function, but this is safe and simple for now.
            for (const call of callsToUpdate) {
                const durationSeconds = call.duration || 0;
                const durationMinutes = durationSeconds / 60;
                const newCost = parseFloat(((durationMinutes * rate) / 100).toFixed(2)); // rate is in cents

                await supabaseAdmin
                    .from("calls")
                    .update({ cost: newCost })
                    .eq("id", call.id);
            }
        } else {
            throw new Error("Invalid action");
        }

        // Log Audit
        await supabaseAdmin.from("audit_logs").insert({
            admin_user_id: user.id,
            action: `bulk_${action}`,
            details: {
                count: callIds.length,
                call_ids: callIds,
                rate: rate
            }
        });

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Error in bulk update:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
