import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('Starting past due accounts processing...');

    const { data, error } = await supabase.rpc('process_past_due_accounts');

    if (error) {
      console.error('Error processing past due accounts:', error);
      throw error;
    }

    console.log('Past due accounts processing completed:', data);

    const result = data as {
      success: boolean;
      processed_count: number;
      cutoff_date: string;
      accounts: Array<{
        user_id: string;
        user_name: string;
        grace_until: string;
        days_past_due: number;
        unassignment_result: {
          success: boolean;
          agents_affected: number;
          phone_assignments_removed: number;
        };
      }>;
    };

    if (result.processed_count > 0) {
      console.log(`Successfully processed ${result.processed_count} past due accounts`);
      console.log('Accounts processed:', JSON.stringify(result.accounts, null, 2));
    } else {
      console.log('No past due accounts found that require processing');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${result.processed_count} past due accounts`,
        details: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Fatal error in past due processing:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
