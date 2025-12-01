-- Add RPC to summarize billing balances and outstanding usage
create or replace function public.get_billing_summary(p_user_id uuid)
returns table (
  wallet_cents bigint,
  total_usage_cents bigint,
  total_billed_cents bigint,
  outstanding_balance_cents bigint
) as $$
begin
  -- Current wallet balance from billing_accounts
  select coalesce(ba.wallet_cents, 0) into wallet_cents
  from billing_accounts ba
  where ba.user_id = p_user_id;

  -- Total usage (all time) from usage_logs
  select coalesce(sum(ul.cost_cents), 0) into total_usage_cents
  from usage_logs ul
  where ul.user_id = p_user_id;

  -- Total billed (all time) from billing_invoices that represent usage billing
  select coalesce(sum(bi.amount_cents), 0) into total_billed_cents
  from billing_invoices bi
  where bi.user_id = p_user_id
    and bi.status in ('open', 'paid')
    and (bi.metadata ->> 'manual_billing') is not null;

  outstanding_balance_cents := greatest(0, total_usage_cents - total_billed_cents);
  return next;
end;
$$ language plpgsql security definer;

grant execute on function public.get_billing_summary(uuid) to authenticated, service_role;
