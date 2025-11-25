import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncAllRequest {
    batch?: number; // 1-4, which quarter of users to sync
    dryRun?: boolean;
    force?: boolean; // Skip failure check and sync all users
}

// Configuration
const MAX_CONSECUTIVE_FAILURES = 3;
const DELAY_BETWEEN_USERS_MS = 2000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
        const { batch = 1, dryRun = false, force = false }: SyncAllRequest =
            await req.json().catch(() => ({}));

        console.log(`Starting sync-all-active-users - batch: ${batch}, dryRun: ${dryRun}, force: ${force}`);

        // Validate batch number
        if (batch < 1 || batch > 4) {
            throw new Error("Batch must be between 1 and 4");
        }

        // Get all users with active OAuth connections
        const { data: activeConnections, error: connError } = await supabase
            .from("api_keys")
            .select(`
        user_id,
        token_expires_at,
        users!api_keys_user_id_fkey!inner (
          id,
          first_name,
          last_name,
          business_name,
          is_active,
          role
        )
      `)
            .eq("service", "highlevel")
            .eq("is_active", true)
            .gt("token_expires_at", new Date().toISOString());

        if (connError) {
            console.error("Error fetching active connections:", connError);
            throw connError;
        }

        if (!activeConnections || activeConnections.length === 0) {
            console.log("No active OAuth connections found");
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "No active connections to sync",
                    usersProcessed: 0,
                    batch,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Filter to only include non-admin active users
        const eligibleUsers = activeConnections.filter((conn: any) =>
            conn.users?.is_active === true && conn.users?.role !== 'admin'
        );

        console.log(`Found ${eligibleUsers.length} eligible users with active connections`);

        // Stagger: only sync users where hash(user_id) % 4 == (batch - 1)
        const batchUsers = eligibleUsers.filter((conn: any) => {
            const hash = simpleHash(conn.user_id);
            return (hash % 4) === (batch - 1);
        });

        console.log(`Batch ${batch}: Processing ${batchUsers.length} users out of ${eligibleUsers.length} total`);

        // Check for consecutive sync failures (unless force=true)
        const skippedUsers: any[] = [];
        const usersToSync: any[] = [];

        if (force) {
            usersToSync.push(...batchUsers);
        } else {
            for (const conn of batchUsers) {
                const failureCount = await getConsecutiveSyncFailures(supabase, conn.user_id);

                if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
                    console.log(`Skipping user ${conn.user_id} due to ${failureCount} consecutive failures`);
                    skippedUsers.push({
                        userId: conn.user_id,
                        userName: `${conn.users?.first_name || ''} ${conn.users?.last_name || ''}`.trim(),
                        businessName: conn.users?.business_name,
                        failureCount,
                    });
                } else {
                    usersToSync.push(conn);
                }
            }
        }

        // Notify admins about newly skipped users (first time hitting the threshold)
        const newlySkippedUsers = await notifyAdminsAboutSkippedUsers(supabase, supabaseUrl, supabaseServiceKey, skippedUsers);

        // Process syncs
        const results: any[] = [];
        let successCount = 0;
        let failureCount = 0;

        for (const conn of usersToSync) {
            const userName = `${conn.users?.first_name || ''} ${conn.users?.last_name || ''}`.trim();

            if (dryRun) {
                console.log(`[DRY RUN] Would sync user ${conn.user_id} (${userName})`);
                results.push({
                    userId: conn.user_id,
                    userName,
                    status: 'dry_run',
                });
                continue;
            }

            console.log(`Syncing user ${conn.user_id} (${userName})...`);

            // Call sync-highlevel-calls with retry logic
            const syncResult = await syncUserWithRetry(
                supabaseUrl,
                supabaseServiceKey,
                conn.user_id,
                userName
            );

            if (syncResult.success) {
                successCount++;
                // Clear consecutive failure count on success
                await clearSyncFailures(supabase, conn.user_id);
                results.push({
                    userId: conn.user_id,
                    userName,
                    status: 'success',
                    attempts: syncResult.attempts,
                });
            } else {
                failureCount++;
                // Log the failure
                await logSyncFailure(supabase, conn.user_id, syncResult.error || 'Unknown error');
                results.push({
                    userId: conn.user_id,
                    userName,
                    status: 'failure',
                    error: syncResult.error,
                    attempts: syncResult.attempts,
                });
            }

            // Delay between users to respect rate limits
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_USERS_MS));
        }

        console.log(`Sync batch ${batch} completed - success: ${successCount}, failed: ${failureCount}, skipped: ${skippedUsers.length}`);

        return new Response(
            JSON.stringify({
                success: true,
                batch,
                dryRun,
                totalEligible: eligibleUsers.length,
                batchSize: batchUsers.length,
                usersProcessed: usersToSync.length,
                successCount,
                failureCount,
                skippedCount: skippedUsers.length,
                newlySkippedNotified: newlySkippedUsers.length,
                skippedUsers: skippedUsers.map(u => ({ userId: u.userId, failureCount: u.failureCount })),
                results,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error in sync-all-active-users:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

// Simple hash function for user ID to determine batch
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

// Get count of consecutive sync failures for a user
async function getConsecutiveSyncFailures(supabase: any, userId: string): Promise<number> {
    const { data, error } = await supabase
        .from("user_integration_errors")
        .select("id, created_at, resolved")
        .eq("user_id", userId)
        .eq("error_source", "sync-all-active-users")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(MAX_CONSECUTIVE_FAILURES);

    if (error || !data) return 0;

    // Count consecutive unresolved failures
    return data.length;
}

// Log a sync failure to user_integration_errors
async function logSyncFailure(supabase: any, userId: string, errorMessage: string): Promise<void> {
    try {
        await supabase.from("user_integration_errors").insert({
            user_id: userId,
            error_type: "sync_failure",
            error_source: "sync-all-active-users",
            error_message: errorMessage.substring(0, 500),
            error_code: "SYNC_FAILED",
            request_data: { timestamp: new Date().toISOString() },
            response_data: {},
            resolved: false,
        });
    } catch (e) {
        console.error("Failed to log sync failure:", e);
    }
}

// Clear sync failures for a user (mark as resolved)
async function clearSyncFailures(supabase: any, userId: string): Promise<void> {
    try {
        await supabase
            .from("user_integration_errors")
            .update({ resolved: true, resolved_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("error_source", "sync-all-active-users")
            .eq("resolved", false);
    } catch (e) {
        console.error("Failed to clear sync failures:", e);
    }
}

// Sync a user with retry logic
async function syncUserWithRetry(
    supabaseUrl: string,
    serviceKey: string,
    userId: string,
    userName: string
): Promise<{ success: boolean; error?: string; attempts: number }> {
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`Sync attempt ${attempt}/${MAX_RETRIES} for user ${userName}`);

            const response = await fetch(`${supabaseUrl}/functions/v1/sync-highlevel-calls`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": serviceKey,
                    "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                    userId,
                    syncType: "auto",
                }),
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`Sync successful for user ${userName}`);
                return { success: true, attempts: attempt };
            }

            lastError = await response.text();
            console.log(`Sync attempt ${attempt} failed for ${userName}: ${lastError.substring(0, 200)}`);

            // Check for permanent failures
            if (lastError.includes("No valid OAuth token") ||
                lastError.includes("Token expired") ||
                lastError.includes("unauthorized")) {
                return { success: false, error: lastError, attempts: attempt };
            }

            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        } catch (e) {
            lastError = e instanceof Error ? e.message : 'Network error';
            console.log(`Sync attempt ${attempt} threw exception for ${userName}: ${lastError}`);

            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }

    return { success: false, error: lastError, attempts: MAX_RETRIES };
}

// Notify admins about users being skipped due to consecutive failures
async function notifyAdminsAboutSkippedUsers(
    supabase: any,
    supabaseUrl: string,
    serviceKey: string,
    skippedUsers: any[]
): Promise<any[]> {
    if (skippedUsers.length === 0) return [];

    // Check which users were already notified about being skipped
    const { data: recentNotifications } = await supabase
        .from("admin_notifications")
        .select("user_id")
        .eq("notification_type", "sync_skipped")
        .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const alreadyNotifiedIds = new Set(recentNotifications?.map((n: any) => n.user_id) || []);
    const newlySkipped = skippedUsers.filter(u => !alreadyNotifiedIds.has(u.userId));

    if (newlySkipped.length === 0) return [];

    // Get admin emails
    const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true);

    if (!admins || admins.length === 0) {
        console.warn("No admin users found for skip notification");
        return [];
    }

    const adminIds = admins.map((a: any) => a.id);
    const { data: adminEmailRows } = await supabase
        .from("user_notification_emails")
        .select("email, user_id")
        .in("user_id", adminIds)
        .eq("admin_hl_disconnected", true)
        .eq("is_primary", true);

    const adminEmails: string[] = (adminEmailRows || []).map((row: any) => row.email).filter(Boolean);

    if (adminEmails.length === 0) {
        console.warn("No admin email addresses configured for skip notifications");
        return [];
    }

    // Build email content
    const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <h2 style="color: #1f2937;">Sync Skipped Due to Repeated Failures</h2>
      <p style="color: #4b5563;">The following user(s) have been temporarily skipped from automatic sync due to ${MAX_CONSECUTIVE_FAILURES} or more consecutive failures:</p>
      
      <table border="1" cellpadding="12" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 20px 0; border-color: #e5e7eb;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="text-align: left; color: #374151;">User</th>
            <th style="text-align: left; color: #374151;">Business</th>
            <th style="text-align: left; color: #374151;">Consecutive Failures</th>
          </tr>
        </thead>
        <tbody>
          ${newlySkipped.map(user => `
            <tr>
              <td style="color: #1f2937;">${user.userName || 'Unknown'}</td>
              <td style="color: #6b7280;">${user.businessName || 'N/A'}</td>
              <td>
                <span style="padding: 4px 8px; border-radius: 4px; background-color: #fef3c7; color: #92400e;">
                  ${user.failureCount} failures
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <p style="color: #4b5563;">
        <strong>Action Required:</strong> Please review these accounts in the Admin Users page. 
        You can reset their sync status using the "Reset Sync Failures" button to re-enable automatic syncing.
      </p>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        This notification is sent once per 24 hours per affected user.
      </p>
    </div>
  `;

    // Send email to each admin
    for (const email of adminEmails) {
        try {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": serviceKey,
                    "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                    to: email,
                    subject: `⚠️ Voice AI Dash: ${newlySkipped.length} User(s) Skipped from Sync`,
                    html: emailHtml,
                    userId: admins[0].id,
                    emailType: "admin_hl_disconnected",
                }),
            });
        } catch (e) {
            console.error(`Failed to send skip notification to ${email}:`, e);
        }
    }

    // Record notifications sent
    for (const user of newlySkipped) {
        try {
            await supabase.from("admin_notifications").insert({
                user_id: user.userId,
                notification_type: "sync_skipped",
                email_sent_to: adminEmails,
                message: `User skipped from sync due to ${user.failureCount} consecutive failures`,
            });
        } catch (e) {
            console.error("Failed to record admin notification:", e);
        }
    }

    console.log(`Sent skip notification to ${adminEmails.length} admin(s) about ${newlySkipped.length} user(s)`);
    return newlySkipped;
}
