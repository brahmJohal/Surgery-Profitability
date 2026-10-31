# Production security checklist

## Apply before deployment

1. Run Supabase migrations `001` through `006` in order. Migration `006` keeps
   database tables behind RLS, revokes direct browser-table access, and records
   surgery and settings changes in `admin_audit_log`.
2. In Supabase Auth, set the exact production Site URL and Redirect URLs. Enable
   email rate limits and CAPTCHA if the hospital permits it.
3. Keep all Supabase Storage buckets private. Serve MOU documents only with
   short-lived signed URLs after checking that the user is Finance or Admin.
4. Use only `VITE_SUPABASE_URL` (HTTPS) and `VITE_SUPABASE_ANON_KEY` in the
   frontend. Never add `service_role`, payment-provider secrets, bank logins,
   webhook secrets, or encryption keys to Vite variables.
5. If payment webhooks are added, verify their raw-body signatures, enforce a
   replay-safe event ID, and update payment status only on the server.

## Current boundaries

- This project has no custom HTTP API routes or payment webhook endpoint, so
  rate limiting and CORS must be configured in Supabase/Auth and any future
  server function.
- Finance MOU and payout data currently use browser local storage. That is only
  acceptable for local testing. Before production, move it to Supabase tables
  protected by Finance/Admin RPCs and RLS; local storage cannot protect bank
  details from someone with access to the browser profile.
- Vercel security headers are defined in `vercel.json` for Vercel deployments.
