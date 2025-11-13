import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RefreshTokensRequest {
  hoursAhead?: number;
  scheduledBy?: string;
  dryRun?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { hoursAhead = 24, scheduledBy = 'manual_trigger', dryRun = false }: RefreshTokensRequest =
      await req.json().catch(() => ({}));

    console.log(`Starting token refresh check - hoursAhead: ${hoursAhead}, scheduledBy: ${scheduledBy}, dryRun: ${dryRun}`);

    // Create job run record
    const { data: jobRun, error: jobError } = await supabase
      .from('scheduled_job_runs')
      .insert({
        job_name: 'token_refresh',
        status: 'running',
        metadata: { hoursAhead, scheduledBy, dryRun },
      })
      .select()
      .single();

    if (jobError || !jobRun) {
      console.error('Failed to create job run record:', jobError);
      throw new Error('Failed to initialize job tracking');
    }

    const jobRunId = jobRun.id;

    try {
      // Get tokens that are expiring soon
      const { data: expiringTokens, error: fetchError } = await supabase
        .rpc('get_expiring_tokens', { hours_ahead: hoursAhead });

      if (fetchError) {
        console.error('Error fetching expiring tokens:', fetchError);
        throw fetchError;
      }

      console.log(`Found ${expiringTokens?.length || 0} tokens expiring within ${hoursAhead} hours`);

      let tokensRefreshed = 0;
      let tokensFailed = 0;
      const results: any[] = [];

      if (expiringTokens && expiringTokens.length > 0) {
        for (const token of expiringTokens) {
          console.log(`Processing token for user ${token.user_email} (expires in ${token.hours_until_expiry?.toFixed(2)} hours)`);

          if (dryRun) {
            console.log(`[DRY RUN] Would refresh token for user ${token.user_email}`);
            results.push({
              userId: token.user_id,
              userEmail: token.user_email,
              status: 'dry_run',
              hoursUntilExpiry: token.hours_until_expiry,
            });
            continue;
          }

          try {
            // Call the oauth-refresh edge function
            const refreshResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ userId: token.user_id }),
              }
            );

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              console.log(`Successfully refreshed token for user ${token.user_email}`);

              // Calculate new expiration time
              const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));

              // Log successful refresh
              await supabase.rpc('log_token_refresh', {
                p_user_id: token.user_id,
                p_refresh_status: 'success',
                p_token_expires_at: newExpiresAt.toISOString(),
                p_error_message: null,
                p_refreshed_by: scheduledBy,
              });

              tokensRefreshed++;
              results.push({
                userId: token.user_id,
                userEmail: token.user_email,
                status: 'success',
                newExpiresAt: newExpiresAt.toISOString(),
              });
            } else {
              const errorText = await refreshResponse.text();
              console.error(`Failed to refresh token for user ${token.user_email}:`, errorText);

              // Log failed refresh
              await supabase.rpc('log_token_refresh', {
                p_user_id: token.user_id,
                p_refresh_status: 'failure',
                p_token_expires_at: null,
                p_error_message: errorText.substring(0, 500),
                p_refreshed_by: scheduledBy,
              });

              tokensFailed++;
              results.push({
                userId: token.user_id,
                userEmail: token.user_email,
                status: 'failure',
                error: errorText,
              });
            }
          } catch (refreshError) {
            const errorMessage = refreshError instanceof Error ? refreshError.message : 'Unknown error';
            console.error(`Exception while refreshing token for user ${token.user_email}:`, errorMessage);

            // Log failed refresh
            await supabase.rpc('log_token_refresh', {
              p_user_id: token.user_id,
              p_refresh_status: 'failure',
              p_token_expires_at: null,
              p_error_message: errorMessage.substring(0, 500),
              p_refreshed_by: scheduledBy,
            });

            tokensFailed++;
            results.push({
              userId: token.user_id,
              userEmail: token.user_email,
              status: 'failure',
              error: errorMessage,
            });
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Update job run as completed
      await supabase
        .from('scheduled_job_runs')
        .update({
          status: 'completed',
          tokens_checked: expiringTokens?.length || 0,
          tokens_refreshed: tokensRefreshed,
          tokens_failed: tokensFailed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobRunId);

      console.log(`Token refresh job completed - checked: ${expiringTokens?.length || 0}, refreshed: ${tokensRefreshed}, failed: ${tokensFailed}`);

      // If there were failures, trigger notification function
      if (tokensFailed > 0 && !dryRun) {
        console.log('Triggering failure notification...');
        try {
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-refresh-failures`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ jobRunId }),
            }
          );
        } catch (notifyError) {
          console.error('Failed to send failure notification:', notifyError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          jobRunId,
          tokensChecked: expiringTokens?.length || 0,
          tokensRefreshed,
          tokensFailed,
          dryRun,
          results,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (processingError) {
      // Update job run as failed
      await supabase
        .from('scheduled_job_runs')
        .update({
          status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobRunId);

      throw processingError;
    }
  } catch (error) {
    console.error("Error in refresh-expiring-tokens:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
