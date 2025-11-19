# Copilot Instructions for Voice AI Dash

## Project Overview
- React + TypeScript SPA (Vite) with Supabase backend and Edge Functions.
- Domain focus: HighLevel voice agents, call logs, billing, OAuth, and user activity analytics.
- Frontend lives in `src/`, backend logic in `supabase/functions/` and `supabase/migrations/`.
- Source of truth for domain details is `README.md` – keep it in sync when changing behavior.

## Architecture & Data Flow
- Auth: Supabase Auth via `AuthContext` + `ProtectedRoute`.
  - Key files: `src/contexts/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`.
- HighLevel integration: all API calls go through `oauthService` + HighLevel service + Edge Functions.
  - OAuth & tokens: `src/services/oauth.ts` (uses `api_keys`, `oauth_states` tables).
  - HighLevel API: `src/services/highlevel.ts` (agents, calls, phone numbers, sync status).
  - Edge Functions: `supabase/functions/*` (e.g. `oauth-authorize`, `oauth-token`, `sync-highlevel-calls`, `fetch-available-agents`, `get-call-recording`).
- Billing: Stripe + wallet system backed by Supabase tables.
  - Engine: `src/services/billingEngine.ts`, `src/services/stripe.ts`.
  - Edge Functions: `supabase/functions/stripe-*`, `sync-billing-balance`, `recalculate-call-costs`, `reset-user-calls`.
- Activity tracking: `src/services/activityLogger.ts`, `src/components/ActivityTab.tsx` with tables `user_activity_logs`, `user_connection_events`, `user_integration_errors`.

## RLS & Security
- **All tables have RLS enabled** – never bypass via service-role keys in frontend.
- For any new queries, mirror patterns in migrations and existing services:
  - Admin access: `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')`.
  - Client access: filter by `user_id = auth.uid()` (or explicit join via `user_agents`, `user_phone_numbers`).
- When changing schema or policies, also update relevant migrations and the "Row Level Security (RLS)" section in `README.md`.

## Branding & White‑Label Rules
- **Critical**: client‑facing UI must never mention "HighLevel", "GHL", or similar.
  - Client pages: `src/pages/Dashboard.tsx`, `CallsPage.tsx`, `ProfilePage.tsx`, `BillingPage.tsx`, `OAuthCallback.tsx`, `components/DashboardLayout.tsx`.
  - Use generic terms like "Connection", "Service", "Platform", "API connection".
- Admin‑only areas may reference HighLevel explicitly:
  - `src/pages/AdminUsersPage.tsx`, `AdminConfigPage.tsx`, `AdminCallsAnalytics.tsx`, services under `src/services/`, and all `supabase/functions/`.
- UI should follow patterns in `README.md` under **Brand Identity**, **Typography & Layout**, and **Component Patterns`** (badge styles, buttons, cards, dark mode).

## Frontend Conventions
- Use React function components with hooks, TypeScript types/interfaces, and Tailwind classes.
- Global layout & theme: `src/components/DashboardLayout.tsx` (sidebar, header, dark mode toggle, global sync button for non‑admin users).
- Global sync behavior:
  - State in `src/contexts/SyncContext.tsx`.
  - Sync triggers Edge Functions (primarily `sync-highlevel-calls`) and updates `sync_status` for the current user.
  - When adding data that should refresh on sync, hook into `SyncContext` rather than adding page‑local sync buttons.
- Follow established UI patterns:
  - **Modals**: `NotificationModal` and `ConfirmationModal` in `src/components/` (use them instead of ad‑hoc modals/alerts).
  - **Loading states**: use `Loader2` with the shared pattern from `README.md`.
  - **Tables, filters, stat cards**: copy patterns from `Dashboard.tsx`, `CallsPage.tsx`, `AdminUsersPage.tsx`.

## Backend & Edge Functions
- All external API calls (HighLevel, Stripe, Resend) from server side should live in `supabase/functions/*` or dedicated `src/services/*` modules.
- HighLevel tokens:
  - Store only in `api_keys` (managed by `oauthService` and OAuth Edge Functions).
  - Always obtain tokens via `oauthService.getValidAccessToken` / the corresponding Edge Function; do **not** store tokens in React state.
- When adding or changing Edge Functions:
  - Keep CORS handling consistent with existing functions like `fetch-available-agents` and `get-call-recording`.
  - Respect existing JSON response shapes used by the frontend (check `UserDetailsPage.tsx`, `AdminUsersPage.tsx`, `Dashboard.tsx`, `CallsPage.tsx`).

## Billing & Costs
- Cost and billing behavior is centralized – avoid re‑implementing pricing logic in random components.
  - For call cost and display values, follow the rules described in `README.md` under **Call Syncing & Cost Calculation** and use the logic in `sync-highlevel-calls` / `billingEngine`.
  - Any feature that depends on call costs should read from the `calls` table and billing tables (not recompute from duration).

## Developer Workflows
- Local dev:
  - Frontend: `npm install` then `npm run dev` (Vite).
  - Supabase: install CLI, `supabase link --project-ref pjlrcchptrkymevoiolu`, then use `supabase db push` / `db pull` and `supabase functions deploy <name>`.
- GitHub Actions workflows under `.github/workflows/` call edge functions for daily/weekly emails and token maintenance; if you change payload shapes, update both the function and the workflow.

## When Making Changes
- Prefer extending existing services/components over creating new ad‑hoc modules.
  - Example: new HighLevel calls → add methods to `HighLevelService` and re‑use token logic.
  - New admin tools → extend `UserDetailsPage.tsx` or `AdminUsersPage.tsx` tabs instead of creating separate pages.
- After changing schema, always:
  - Add/modify a migration in `supabase/migrations/`.
  - Consider RLS impact and update policies.
  - Update `README.md` sections for Database Schema, RLS, and Critical Dependencies if behavior changes.

## Diagnostics & Debugging Philosophy
- Aim for production‑grade, scalable solutions – avoid one‑off hacks, mock data, or manual DB edits as “fixes”.
- When a feature breaks (DB/RLS/API errors) and it’s not a trivial syntax issue:
  - Add **server‑side diagnostics** first (Edge Functions and services): log status codes, truncated response bodies, and key IDs (user, location, agent, call) – never tokens or secrets.
  - Use existing observability tables instead of inventing new ones:
    - `user_activity_logs` for user actions and system events.
    - `user_connection_events` for connection/OAuth lifecycle.
    - `user_integration_errors` for external API/DB failures with structured `error_source`, `error_code`, `request_data`, `response_data` (safely truncated).
  - Keep client‑facing messages friendly and generic; push detailed context into logs/activity tables or admin‑only UIs.
- For recurring issues, prefer improving flows (schema, RLS, edge function contracts) over adding special‑case conditionals tied to specific users or records.
- Avoid manual data seeding/fixing in production tables; if specific reference data is required, codify it via migrations or clearly documented admin tools.

## Quick Pointers
- Project structure & key files summary: see `README.md` → **Support & Documentation** → **Project Structure** and **Key Files Reference**.
- For examples of complex flows, refer to:
  - OAuth: `src/services/oauth.ts`, `supabase/functions/oauth-*`.
  - Call syncing: `src/services/highlevel.ts`, `supabase/functions/sync-highlevel-calls`.
  - Activity logging: `src/services/activityLogger.ts`, `ActivityTab.tsx`.
  - Email notifications: `supabase/functions/send-email/*` and related check/send functions, plus `README.md` Email sections.
