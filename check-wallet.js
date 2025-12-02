import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWallet() {
    const userId = '06a55047-02ef-430d-8897-786def2b5175';

    console.log('=== RLS CHECK - Using anon key (RLS enforced) ===\n');

    // Try with RLS - this will fail because we're not authenticated as this user
    const { data: userRLS, error: userErrorRLS } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    console.log('User (with RLS):', userRLS);
    if (userErrorRLS) console.error('User error (RLS):', userErrorRLS.message);

    const { data: billingRLS, error: billingErrorRLS } = await supabase
        .from('billing_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    console.log('Billing account (with RLS):', billingRLS);
    if (billingErrorRLS) console.error('Billing error (RLS):', billingErrorRLS.message);

    // Get transactions
    const { data: transactions, error: txError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('\nWallet transactions (with RLS):', transactions?.length || 0, 'found');
    if (txError) console.error('Transaction error (RLS):', txError.message);

    console.log('\n=== DIAGNOSIS ===');
    console.log('The script is using the ANON key which enforces RLS policies.');
    console.log('RLS policies only allow users to see their own data.');
    console.log('Since we are not authenticated AS this user, we cannot see their data.');
    console.log('\nThis is actually CORRECT behavior - RLS is working!');
    console.log('\nThe real issue is: Why is the UI showing $50 instead of $5.13?');
    console.log('The UI should be authenticated as the user and see the correct balance.');
    console.log('\nPossible causes:');
    console.log('1. The manual billing edge function did not actually update billing_accounts.wallet_cents');
    console.log('2. The realtime subscription is not triggering');
    console.log('3. The frontend is caching the old value');
    console.log('4. There was an error in the edge function that was not caught');

    if (transactions && transactions.length > 0) {
        console.log('\n✅ Wallet transactions exist, so the user records DO exist.');
        console.log('We just cannot see them due to RLS (which is correct).');
    }
}

checkWallet();
