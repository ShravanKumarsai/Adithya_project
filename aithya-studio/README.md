# DraftDeck

[Open the live app](https://adithya-project.vercel.app/shared) · [Deployed application source](https://github.com/ShravanKumarsai/Adithya_project/commit/aa2c669efd99e00d8dbcc065ec34bd893d1b4c78)

DraftDeck helps hackathon teams go from a rulebook to a reviewed plan, a working build, and a final contribution report.

## Walkthrough

| Area | What to try |
| --- | --- |
| Shared projects and My profile | Sign in with Google or email and password. Complete one profile manually or with Gemini, then create a project or join with an invitation. |
| Rules | Paste rules or upload a supported PDF or image. Review extracted requirements, judging criteria, milestones, and AI rules before saving. |
| Today and Overview | Check blockers, deadlines, and readiness. The hackathon clock counts down in IST. Time used follows elapsed time, and Work done follows completed tasks. |
| Work | Plan and assign tasks, set priorities and dependencies, track milestones, and review suggestions from the AI Mentor. Activity shows commits and deployments when GitHub and Vercel are connected. |
| Team | Use the bulletin, group chat, or private threads to share files, run polls, and propose work changes. Chat shows a Team lead badge. |
| Submit | Review submission evidence in Ship Check. After the deadline, the lead can publish a report to participants’ portfolios. Deletion requires the saved report and exact project name. Participants keep their reports. |

Only the project lead can add or replace the team Gemini key. Accepted teammates can see the daily DraftDeck request allowance and reset time in the project header. This counter measures DraftDeck requests. Personal Codex and Claude Code connections are available per project using local connectors. One-time account-wide pairing requires a production migration that has yet to be applied.

## Run locally

From this folder, use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:4173/shared. The local server serves static assets. Use the hosted app for the complete backend experience. The browser tests exercise authenticated workflows with fixtures.

## Deployment and checks

The repository includes the package manifest and lockfile, Vercel configuration, and Supabase migrations. Vercel builds with `npm run build:static` and serves `public-vercel`. A separate deployment needs its own configured Supabase environment and server-side settings. Store `AITHYA_DATABASE_URL`, `PROJECT_GEMINI_KEY_SECRET`, and, for guided onboarding and rulebook scanning, `GEMINI_SETUP_API_KEY` in the host’s environment settings. Keep real credentials out of Git.

```sh
npm run lint
npm run typecheck
npm test
npm run build:static
npx playwright install chromium
npm run test:browser
```

## Development and release history

The notes below describe earlier implementation stages. Use the setup and feature summary above for the submitted release.

### Build

Run `npm ci` and `npm run build`. The build bundles the shared frontend and embeds the web assets into the Sites Worker at `dist/server/index.js`.

## Shared workspace

The application uses Supabase project `ekqfotmlnqqrbcizjtfz`. Its public client is in `src/lib/supabase.js`. The publishable key is intended for browser use. Project access is enforced through Postgres RLS and membership checks in privileged functions.

Implemented workflows include account registration and recovery, cloud draft autosave, idempotent draft publication, membership-bound invitations, profile and availability editing, skill reviews, requirement traceability, shared tasks, personal learning goals, private document uploads, archive/restore, and append-only project activity.

The application stores invitation token hashes. Only the creation response contains the raw token. Email-bound claims require the signed-in account to have a verified email. Links expire after seven days. Rotation revokes the previous pending invitation. Creation is limited to 30 invitations per user per hour.

Documents use the private `project-documents` bucket with a 15 MB limit. Leaders upload files and members retrieve them through short-lived signed download links.

## Deployment configuration

The Sites access policy currently restricts the hosted site to its owner. A teammate needs hosted-site access in addition to an accepted Aithya project invitation.

Configure the Supabase Auth Site URL and allowed redirect URLs to include:

`https://aithya-build-studio.easybuckle.chatgpt.site/shared`

Email signup and email confirmation are enabled. Email delivery, recovery redirect configuration, and browser-based registration/login have not been verified end to end.

The existing repository activity view uses public GitHub reads. Optional server secrets `OPENAI_API_KEY` and `VERCEL_TOKEN` enable the previously implemented provider paths. The shared workspace does not run AI planning or automatically act on project policies.

## Verification

The production bundle passes syntax checks. Transactional database checks used separate temporary owner, member, and outsider identities and rolled back all fixtures. They covered draft publication retries, invitation identity binding, one-time claiming, revocation, project and document isolation, profile validation rollback, skill review retention, and private learning goals.

Browser visual testing remains unverified because the managed preview relay timed out. No claim is made that email delivery or a real two-account browser flow has passed.

Migration source is retained under `supabase/migrations/`. Hosted migration versions are assigned by Supabase when applied.

## Notifications, planning, and portfolios

The shared workspace bell groups recent project events and stores a read position per project and account.

Gemini planning runs in the Sites Worker. Project leaders can save, replace, or remove a team-provided Gemini API key in the Planning tab. The Sites Worker encrypts each project key using AES-256-GCM and `PROJECT_GEMINI_KEY_SECRET`. Keep this deployment secret stable across releases. There is no shared Gemini credential. `GEMINI_MODEL` can override the default `gemini-3.5-flash-lite`. The project leader must enable external APIs and explicitly permit Gemini planning. The server checks the project policy and Supabase permissions before sending the limited project context. Generated drafts require a separate save action. Edit the predefined templates in `prompts/*.json` and rebuild to publish changes.

Portfolio profiles and case studies stay private to their Supabase owner. The editor previews the selected content and exports a standalone HTML copy for sharing or printing.


## Scanned rulebooks and photos

Set `GEMINI_SETUP_API_KEY` as a server secret for rulebook import and the project and account setup conversations. Rulebook import accepts a PDF, JPEG, PNG, or WebP up to 8 MB. Project setup chat accepts up to four supported PDFs or images totaling 3 MB per message. Gemini returns editable suggestions that stay in the draft until approval. Text and text-based PDFs can also be read locally by the rulebook importer. Existing project planning uses the encrypted per-project credential supplied by its leader.

## Blueprint workspace on Vercel

Run `npm ci`, `npm run build`, then `node vercel-build.mjs` from this directory. Vercel serves the sheets at `/shared` and routes authenticated `/api` requests to `api/studio.mjs`. Postgres storage requires `AITHYA_DATABASE_URL` with the `aithya_vercel_app` role. `PROJECT_GEMINI_KEY_SECRET` protects per-project tokens. Set `GEMINI_SETUP_API_KEY` for site-wide rulebook import and guided setup.

The blueprint_sheets migration adds task skills and dependencies, milestones, evidence, messages, votes, private attachment metadata, an AI audit table, and member-scoped Realtime. Digests use UTC. A minute-by-minute pg_cron job posts scheduled summaries and records overdue milestones. Team chat downloads use authenticated Storage requests. Drafts from POST /api/assist use the project policy and encrypted team key. Basic drafts work offline from Gemini. Shared meeting notes entered in the Chat sheet can be submitted for summarization. Private learning goals and portfolios are excluded from AI input.

The collaboration checks in tests/blueprint-access.sql run inside a rolled-back transaction with separate owner, member and outsider identities.

## Personal workspaces

The shared workspace groups project sheets into Today, Rules, Work, Team, and Submit. Light and Blueprint fit narrow screens. Vercel serves an installation manifest for the mobile home-screen experience.

Apply `20261122153000_studio_personal_workspaces.sql` after the blueprint migration to enable personal dashboards, participant-only direct chats, project profiles, opt-in AI credit tracking and integration settings. The project pages detect whether this migration is available. Project leads manage encrypted Gemini and Vercel keys in Settings. Public GitHub repositories remain available through Activity.

The existing `/api/assist` route reads project data with the caller's Supabase permissions. Setup drafts and self-profile analysis use the configured platform Gemini key when the project AI policy allows it. Regular assistance uses the project's encrypted Gemini key. Private chats and attachments stay out of assistant requests. AI credit tracking uses manually entered allowances and reset windows.

Run `tests/personal-workspaces-access.sql` against an isolated test schema to exercise private threads and shared credits. The test transaction rolls back its records.

## Project reporting and consolidated chats

The Chats sheet opens the team channel and private threads from the same inbox. Team chat actions include shared polls, task proposals, task and milestone edits, and report sharing. Group and private attachments use separate private buckets. Project membership and thread participation are checked in Supabase policies.

The Report sheet computes a project summary from accepted members, tasks, completion timestamps, time entries, successful Studio assistance calls and explicitly shared AI usage windows. Export or share the generated report, or turn your own contribution into a portfolio case study. Usage from external AI accounts comes from member-entered values. Earlier completed tasks without a timestamp have unknown punctuality.

The production migrations follow the blueprint and personal workspace migrations in date order. Run `tests/clean-workspace-access.sql` against a database with those migrations to exercise completion timestamps and privacy. Portfolio appearance preferences are stored in the local browser and applied to downloaded HTML.

## Final blueprint workflow

The workspace rail opens Project insights, Shared projects, Portfolio, AI usage, My profile, and Settings. The Work area opens Board, Plan, and Timeline directly. Light and Blueprint support shared accent and icon-size preferences under Portfolio.

## Guided setup and Google sign-in

Enable the Google provider in Supabase Auth with the Google OAuth client configured for the Supabase callback URL. Allow each intended Studio URL ending in `/shared` in Supabase Auth's redirect list. Apply `20261124135038_portal_collaboration.sql`, `20261124141456_portal_team_lifecycle.sql`, and `20261124150400_guided_studio_onboarding.sql` in order. The guided setup migration enables private account interviews, single-use join links, task priorities, and delivery records. Vercel deployment connections remain optional for team members.

The final-workflows migration adds team stand-ups, private study notes, timeline proposal approval, and immutable close snapshots with private portfolio history. The companion GitHub token migration adds encrypted repository credentials in the server-only runtime schema. The same authenticated /api/assist route handles Quick add, case-file explanations, task ideas, daily digests, stand-up merges and report notes. The project policy controls AI access and all draft workflows have Basic results. There are no new environment secrets.

Run `tests/final-workspace-access.sql` after the earlier collaboration checks. It uses a rolled-back transaction to exercise study-note privacy, pin authorization, recipient-only proposal decisions, retry safety and leader-only report close.

### Live Claude subscription usage

Open a shared project, go to **AI credits**, and choose **Connect Claude Code**. Follow the connector instructions in the dialog. The generated token is scoped to the connection and stays private. Use **Replace sync token** or **Disconnect** to revoke it.

For eligible Claude subscriptions, the connector reads the 5-hour and weekly usage windows that Claude Code reports through its official status line. Claude Code reports them after its first response. Once a window ends, Aithya shows that its reset time has passed and waits for the next provider reading. The notification bell uses the provider-reported timestamp, even with Claude Code or the browser closed. Refill alerts are private and can be turned off in project Settings. Other tools can be tracked manually.

[Claude Code status-line documentation](https://code.claude.com/docs/en/statusline#rate-limit-usage)

### AI credits connectors

**AI credits → Live usage** offers downloadable setup for Claude Code and ChatGPT-signed-in Codex CLI. On macOS/Linux, run the personalized download with Python 3.8+ using the command in the setup dialog. Claude setup updates the status line, backs up user settings once, and preserves an existing custom status-line command. Codex syncs once a minute while the connector terminal is open. The connector sends only quota percentages and reset timestamps, and each project controls who can view its readings. Delete the personal installer after setup. Disconnecting in Aithya revokes its token.

Codex readings cover the Codex allowance. For regular ChatGPT chats, Gemini, Copilot, or another tool, use **Add manual tracker** to record messages, requests, or tokens and set a scheduled reset reminder.

[Codex App Server account API](https://developers.openai.com/codex/app-server/#accounts)

## AI-first redesign foundation

The first review phase replaces the Worker’s source splicing with module imports, consolidates the active styles into `ui/shared.css`, and adds a responsive workspace shell. Today uses task assignments, dependencies, due dates and the private notification feed. Its next action is selected from workspace data. External AI generation remains separate.

### Legacy data

The unused notebook frontend and its API routes are retired. The historical D1 migrations and their `project_notes` and `workspace_projects` tables are retained. The Vercel equivalents and stored notebook files are retained too. No DROP, DELETE or data migration is part of this change. If legacy records are needed, export the tables and file objects through the hosting provider’s authenticated dashboard, confirm the exported row and file counts, and keep the originals until the export is verified. Confirm a retention or removal plan before changing these stores.

### Tests

Run `npm ci`, `npm run lint`, `npm test`, and `npm run build && node vercel-build.mjs`. Then run `npx playwright install chromium` and `npm run test:browser`. The browser test uses fixtures for Supabase and integrations. It exercises the redesigned mobile shell, keyboard tabs and command palette, rulebook review, and Today. It does not send email or consume provider usage.

### Rulebook and task review

Project setup starts with a source step. Import a PDF, photo, or pasted rules, then review the filled brief, rules, and policy fields. Manual entry opens the same review step. The Plan area has an AI plan sheet with template cards and data disclosure. Saving a generated plan and adding selected tasks are separate actions. A lead can edit task titles and link each task to a requirement before adding them. Project setup shows existing task coverage and gaps.

The Worker serves existing Gemini capabilities through `POST /api/ai/<capability>` alongside previous routes for compatibility. Structured drafts still use their provider-specific validators and policy checks. Recognized credentials and email addresses are removed from text before planning or assistance requests. The file importer sends the selected PDF or image as disclosed in the import dialog. This release adds no new database tables or RLS rules.
