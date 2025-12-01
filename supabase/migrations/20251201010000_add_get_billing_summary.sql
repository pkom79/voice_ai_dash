-- Add RPC to summarize billing balances and outstanding usage
create or replace function public.get_billing_summary(p_user_id uuid)
returns table (
  wallet_cents bigint,
  total_usage_cents bigint,
  total_billed_cents bigint,
  outstanding_balance_cents bigint
) as $$
declare
  v_wallet_cents bigint;
  v_total_usage_cents bigint;
  v_total_billed_cents bigint;
begin
  -- Current wallet balance from billing_accounts
  select coalesce(ba.wallet_cents, 0) into v_wallet_cents
  from billing_accounts ba
  where ba.user_id = p_user_id;

  -- Total usage (all time) from calls table (more reliable than usage_logs)
  select coalesce(sum(c.cost * 100), 0)::bigint into v_total_usage_cents
  from calls c
  where c.user_id = p_user_id;

  -- Total billed (all time) from billing_invoices that represent usage billing
  select coalesce(sum(bi.amount_cents), 0)::bigint into v_total_billed_cents
  from billing_invoices bi
  where bi.user_id = p_user_id
    and bi.status in ('open', 'paid')
    and (bi.metadata ->> 'manual_billing') is not null;

  -- Assign to output columns
  wallet_cents := v_wallet_cents;
  total_usage_cents := v_total_usage_cents;
  total_billed_cents := v_total_billed_cents;
  outstanding_balance_cents := greatest(0, v_total_usage_cents - v_total_billed_cents);
  return next;
end;
$$ language plpgsql security definer;

grant execute on function public.get_billing_summary(uuid) to authenticated, service_role;
