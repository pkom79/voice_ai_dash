/**
 * Billing Calculation Engine
 *
 * Core billing logic for calculating charges, applying wallet credits,
 * and managing monthly billing cycles.
 */

import { supabase } from '../lib/supabase';
import { createPPUInvoice } from './stripe';
import { roundToCents } from './stripe';

// ============================================
// USAGE TRACKING
// ============================================

/**
 * Log usage for a call
 */
export async function logCallUsage(
  userId: string,
  callId: string,
  durationSeconds: number,
  ratePerMinuteCents: number
): Promise<void> {
  // Calculate cost
  const minutes = durationSeconds / 60;
  const costCents = roundToCents(minutes * ratePerMinuteCents);

  // Insert usage log
  await supabase.from('usage_logs').insert({
    user_id: userId,
    call_id: callId,
    seconds_used: durationSeconds,
    rate_at_time_cents: ratePerMinuteCents,
    cost_cents: costCents,
  });

  // Update month_spent_cents
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('month_spent_cents')
    .eq('user_id', userId)
    .maybeSingle();

  if (billing) {
    await supabase
      .from('billing_accounts')
      .update({
        month_spent_cents: (billing.month_spent_cents || 0) + costCents,
      })
      .eq('user_id', userId);
  }
}

// ============================================
// MONTHLY BILLING CALCULATIONS
// ============================================

/**
 * Calculate total PPU charge for a billing period
 */
export async function calculateMonthlyPPUCharge(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  totalCents: number;
  totalMinutes: number;
  avgRateCents: number;
}> {
  // Get all usage logs for the period
  const { data: logs, error } = await supabase
    .from('usage_logs')
    .select('seconds_used, cost_cents, rate_at_time_cents')
    .eq('user_id', userId)
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString());

  if (error || !logs || logs.length === 0) {
    return { totalCents: 0, totalMinutes: 0, avgRateCents: 0 };
  }

  // Sum up costs
  const totalCents = logs.reduce((sum, log) => sum + (log.cost_cents || 0), 0);
  const totalSeconds = logs.reduce((sum, log) => sum + (log.seconds_used || 0), 0);
  const totalMinutes = totalSeconds / 60;

  // Calculate average rate
  const avgRateCents =
    totalMinutes > 0 ? Math.round(totalCents / totalMinutes) : 0;

  return {
    totalCents: roundToCents(totalCents),
    totalMinutes: Math.round(totalMinutes * 100) / 100,
    avgRateCents,
  };
}

/**
 * Process monthly PPU billing close (run on 1st of month)
 */
export async function processMonthlyPPUClose(userId: string): Promise<boolean> {
  // Get billing info
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('inbound_plan, outbound_plan, wallet_cents, inbound_rate_cents, outbound_rate_cents')
    .eq('user_id', userId)
    .maybeSingle();

  const hasPPU =
    !!billing &&
    (billing.inbound_plan === 'inbound_pay_per_use' ||
      billing.outbound_plan === 'outbound_pay_per_use');

  // Only process PPU accounts
  if (!billing || !hasPPU) {
    return false;
  }

  // Calculate period (previous month)
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodStart = new Date(periodEnd);
  periodStart.setMonth(periodStart.getMonth() - 1);

  // Calculate charges
  const { totalCents, totalMinutes, avgRateCents } = await calculateMonthlyPPUCharge(
    userId,
    periodStart,
    periodEnd
  );

  // If no usage, skip
  if (totalCents === 0) {
    await supabase.rpc('reset_monthly_billing_tracking', { p_user_id: userId });
    return true;
  }

  // Create invoice with wallet application
  try {
    await createPPUInvoice(
      userId,
      totalCents,
      billing.wallet_cents || 0,
      periodStart,
      periodEnd,
      {
        minutes: totalMinutes,
        rate:
          avgRateCents ||
          billing.inbound_rate_cents ||
          billing.outbound_rate_cents ||
          100,
      }
    );

    // Reset monthly tracking
    await supabase.rpc('reset_monthly_billing_tracking', { p_user_id: userId });

    return true;
  } catch (error) {
    console.error('Error processing monthly PPU close:', error);
    return false;
  }
}

// ============================================
// WALLET MANAGEMENT
// ============================================

/**
 * Add credits to wallet (from checkout or admin)
 */
export async function addWalletCredits(
  userId: string,
  amountCents: number,
  reason: string,
  adminId?: string,
  stripePaymentId?: string
): Promise<boolean> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('wallet_cents, month_added_cents')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing) {
    return false;
  }

  const balanceBefore = billing.wallet_cents || 0;
  const balanceAfter = balanceBefore + amountCents;

  // Update wallet
  await supabase
    .from('billing_accounts')
    .update({
      wallet_cents: balanceAfter,
      month_added_cents: (billing.month_added_cents || 0) + amountCents,
    })
    .eq('user_id', userId);

  // Log transaction
  await supabase.rpc('log_wallet_transaction', {
    p_user_id: userId,
    p_type: adminId ? 'admin_credit' : 'top_up',
    p_amount_cents: amountCents,
    p_balance_before_cents: balanceBefore,
    p_balance_after_cents: balanceAfter,
    p_reason: reason,
    p_admin_id: adminId || null,
    p_stripe_payment_id: stripePaymentId || null,
  });

  return true;
}

/**
 * Deduct credits from wallet (admin adjustment)
 */
export async function deductWalletCredits(
  userId: string,
  amountCents: number,
  reason: string,
  adminId: string
): Promise<boolean> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('wallet_cents')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing) {
    return false;
  }

  const balanceBefore = billing.wallet_cents || 0;
  const balanceAfter = Math.max(0, balanceBefore - amountCents);

  // Update wallet
  await supabase
    .from('billing_accounts')
    .update({ wallet_cents: balanceAfter })
    .eq('user_id', userId);

  // Log transaction
  await supabase.rpc('log_wallet_transaction', {
    p_user_id: userId,
    p_type: 'admin_debit',
    p_amount_cents: amountCents,
    p_balance_before_cents: balanceBefore,
    p_balance_after_cents: balanceAfter,
    p_reason: reason,
    p_admin_id: adminId,
  });

  return true;
}

// ============================================
// ESTIMATE CALCULATIONS
// ============================================

/**
 * Estimate next PPU payment
 */
export async function estimateNextPPUPayment(
  userId: string
): Promise<{
  estimatedDate: Date;
  estimatedAmountCents: number;
  currentUsageCents: number;
}> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('month_spent_cents, wallet_cents')
    .eq('user_id', userId)
    .maybeSingle();

  const now = new Date();
  const nextBillingDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const currentUsageCents = billing?.month_spent_cents || 0;
  const walletCents = billing?.wallet_cents || 0;

  // Estimate: current usage minus wallet available
  const estimatedCharge = Math.max(0, currentUsageCents - walletCents);

  return {
    estimatedDate: nextBillingDate,
    estimatedAmountCents: roundToCents(estimatedCharge),
    currentUsageCents: roundToCents(currentUsageCents),
  };
}

// ============================================
// GRACE PERIOD MANAGEMENT
// ============================================

/**
 * Set grace period for failed payment
 */
export async function setGracePeriod(
  userId: string,
  daysFromNow: number = 7
): Promise<void> {
  const graceUntil = new Date();
  graceUntil.setDate(graceUntil.getDate() + daysFromNow);

  await supabase
    .from('billing_accounts')
    .update({ grace_until: graceUntil.toISOString() })
    .eq('user_id', userId);
}

/**
 * Clear grace period after successful payment
 */
export async function clearGracePeriod(userId: string): Promise<void> {
  await supabase
    .from('billing_accounts')
    .update({ grace_until: null })
    .eq('user_id', userId);
}

/**
 * Check if user is in grace period
 */
export async function isInGracePeriod(userId: string): Promise<boolean> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('grace_until')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing?.grace_until) {
    return false;
  }

  const graceDate = new Date(billing.grace_until);
  return graceDate > new Date();
}

/**
 * Check if grace period has expired
 */
export async function hasGracePeriodExpired(userId: string): Promise<boolean> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('grace_until')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing?.grace_until) {
    return false;
  }

  const graceDate = new Date(billing.grace_until);
  return graceDate <= new Date();
}
