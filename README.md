# Surgery Profitability Calculator

An internal web application for sales staff to check the estimated profit of a surgery before confirmation.

## Technology

- **Frontend:** React, TypeScript, Vite, CSS
- **Backend and database:** Supabase (PostgreSQL, authentication and APIs)
- **Hosting:** Vercel for the frontend; Supabase hosts the database and backend services

## What it does

1. Team members sign in with email and password; an admin maintains standard billing and fixed costs for every surgery.
2. Sales selects a surgery and enters the doctor share, referral share and extra rental.
3. The application calculates: `billing − fixed costs − payouts`.
4. Each saved calculation becomes part of the audit/history report.

## Local setup

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Create a Supabase project.
4. In Supabase SQL Editor, run the migrations in order: `supabase/migrations/001_initial_schema.sql`, then `supabase/migrations/002_online_and_offline_sales_roles.sql`.
5. Copy `.env.example` to `.env` and fill in the URL and anonymous key from Supabase Project Settings → API.
6. Run `npm run dev` and open the URL shown in the terminal.

Without `.env`, the calculator uses sample procedures for a visual demonstration but does not save data.

## Demo accounts

The local demonstration has admin, offline-sales, and online-sales accounts. Their shared password is `True@123`; the emails are `admin@truehospitals.com`, `offline.sales@truehospitals.com`, and `online.sales@truehospitals.com`. This local-only sign-in is for testing on a single Mac; it is not secure enough for a public deployment. For the live version, create the users in Supabase Authentication and assign `admin`, `offline_sales`, or `online_sales` in `profiles.role`.

## Deployment

Push this folder to GitHub, import it into Vercel, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables. Run both migrations in order in Supabase before going live.

## Important production next steps

- Add Supabase email/password or OTP login screens.
- Build an admin page to add and update procedures; the RLS policies already restrict these changes to admins.
- Add reports by date, sales person, doctor, and procedure.
- Do not put the Supabase `service_role` key in the frontend environment file.
