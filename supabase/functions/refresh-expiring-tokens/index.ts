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

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000]; // 2s, 4s delays between retries

// Helper function to perform token refresh with retries
async function refreshTokenWithRetry(
  userId: string,
  userEmail: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ success: boolean; data?: any; error?: string; attempts: number }> {
  let lastError: string = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${MAX_RETRIES} to refresh token for user ${userEmail}`);
      console.log(`Calling oauth-refresh at: ${supabaseUrl}/functions/v1/oauth-refresh`);

      const refreshResponse = await fetch(
        `${supabaseUrl}/functions/v1/oauth-refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      console.log(`oauth-refresh response status: ${refreshResponse.status}`);

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        console.log(`Successfully refreshed token for user ${userEmail} on attempt ${attempt}`);
        return { success: true, data: refreshData, attempts: attempt };
      }

      const errorText = await refreshResponse.text();
      lastError = errorText;

      // Check for permanent failures - don't retry these
      const isPermanentFailure =
        errorText.includes('invalid_grant') ||
        errorText.includes('Invalid JWT') ||
        errorText.includes('revoked') ||
        errorText.includes('unauthorized_client');

      if (isPermanentFailure) {
        console.log(`Permanent failure for user ${userEmail}, not retrying: ${errorText.substring(0, 200)}`);
        return { success: false, error: errorText, attempts: attempt };
      }

      console.log(`Attempt ${attempt} failed for user ${userEmail}: ${errorText.substring(0, 200)}`);

      // Wait before next retry (if not last attempt)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (fetchError) {
      lastError = fetchError instanceof Error ? fetchError.message : 'Network error';
      console.log(`Attempt ${attempt} threw exception for user ${userEmail}: ${lastError}`);

      // Wait before next retry (if not last attempt)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return { success: false, error: lastError, attempts: MAX_RETRIES };
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

          // Attempt token refresh with retry logic
          const refreshResult = await refreshTokenWithRetry(
            token.user_id,
            token.user_email,
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );

          if (refreshResult.success && refreshResult.data) {
            // Calculate new expiration time
            const newExpiresAt = new Date(Date.now() + (refreshResult.data.expires_in * 1000));

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
              attempts: refreshResult.attempts,
            });
          } else {
            const errorMessage = refreshResult.error?.substring(0, 500) || 'Unknown error';
            console.error(`Failed to refresh token for user ${token.user_email} after ${refreshResult.attempts} attempts:`, errorMessage);

            // Log failed refresh
            await supabase.rpc('log_token_refresh', {
              p_user_id: token.user_id,
              p_refresh_status: 'failure',
              p_token_expires_at: null,
              p_error_message: errorMessage,
              p_refreshed_by: scheduledBy,
            });

            tokensFailed++;
            results.push({
              userId: token.user_id,
              userEmail: token.user_email,
              status: 'failure',
              error: errorMessage,
              attempts: refreshResult.attempts,
            });
          }

          // Small delay between users to avoid rate limiting
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
                "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
