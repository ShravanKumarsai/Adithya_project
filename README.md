# Aithya Project Platform

Aithya is a Midnight Glass project-building and collaboration platform. The existing React dashboard remains in place; authenticated project setup and team onboarding now use Supabase records.

## Stack

- React + Vite + TypeScript
- Tailwind CSS, Framer Motion, Lucide
- Supabase Auth, Postgres, Storage, and Edge Functions

## Local frontend setup

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and public anon key:
   ```powershell
   Copy-Item .env.example .env.local
   ```
   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. Start the frontend:
   ```powershell
   npm run dev
   ```

Without both real frontend values, the authentication and database flows remain disabled; placeholder credentials are not treated as a successful connection.

For a local visual preview of the post-login dashboard without connecting an account, run Vite and open `http://localhost:5173/?preview=dashboard`. This preview is available only in development and uses sample dashboard data.

## Supabase setup for project onboarding

The migration in `supabase/migrations/20261104220000_project_onboarding.sql` creates profiles, projects, team memberships, requirements, AI constraints, private documents, invitations, and project-scoped skills. It also creates the private `project-documents` Storage bucket, RLS policies, and the database functions used for atomic project setup, member onboarding, invitation claim, and finalization.

Install the Supabase CLI separately, authenticate, then from the repository root:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase functions deploy invitations
```

The `invitations` Edge Function requires `SUPABASE_SERVICE_ROLE_KEY` as a server-side secret. Never put this value in `.env.local`, any `VITE_*` variable, or frontend code. The function also verifies the caller's Supabase Auth session and checks project-leader authorization before creating or revoking invitations.

Configure Supabase Auth's site URL and allowed redirect URLs for the Vite development URL and deployed site. Email confirmation and password recovery links return to the site origin.

## Implemented in this stage

- Supabase email/password registration, login, logout, session restoration, and password recovery/update.
- Protected project views; an account can be a member of multiple projects.
- Project initiation wizard for project details, hackathon rules, AI-use constraints, workflow status, team size, roles, and preliminary skills.
- Private Storage uploads for PDF rulebooks and supporting files (15 MB per file).
- One project membership per invited teammate and one leader membership per project.
- Authenticated invitations with random tokens, SHA-256 token hashes in the database, seven-day expiry, identity checks, claiming, resend/rotation, and revocation.
- Member profile, availability, interests, preferred technologies, self-assessed skills, and evidence.
- Project-leader skill verification with a separate verified level, evidence note, verifier, and timestamp.
- Team onboarding progress and a leader-only finalization flow with an explicit incomplete-profile warning.
- Dashboard project name and roster loaded from Supabase; unrelated charts and task-board data remain prototype data.

## Current limitations

- Invitation links are generated for the leader to copy and share. An email delivery provider is not configured.
- The project workflow can be entered or uploaded, or marked as requiring later workflow generation. No AI workflow/document analysis is run.
- Skill verification is recorded by the project leader with an evidence note; Aithya does not independently validate external work or credentials.
- Dashboard metrics, charts, task board, and learning tracks remain mock data.
- This repository has no configured live Supabase credentials. Two-account, live RLS, Storage, Edge Function, and expiry tests must be run against a configured Supabase project before treating those integrations as operational.

## Validation

```powershell
npm run build
npm run lint
```

## Drafdeck v2 portal

Use npm from the repository root. Run `npm run install:studio` to install the portal, then `npm run dev` for the local UI or `npm run build` for the Vercel-compatible output in `aithya-studio/public-vercel`. The local server serves the frontend and connects to Supabase for authenticated data. Provider calls require the hosted server adapter and its secrets. The v2 [implementation report](docs/portal-v2.md) documents the migration and verification.
