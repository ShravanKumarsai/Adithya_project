# Aithya Studio

The repository activity workspace is at `/`. The Supabase shared workspace is at `/shared`.

## Build

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

Set `GEMINI_SETUP_API_KEY` as a secret on the Sites deployment to enable Gemini scanning from All Projects and Project setup. This credential is used solely by the setup rulebook route. The route accepts an explicitly selected PDF, JPEG, PNG, or WebP up to 8 MB and returns suggested setup details for review. Text and text-based PDFs can also be read locally. Existing project planning keeps using the encrypted per-project credential supplied by its leader.

## Blueprint workspace on Vercel

Run `npm ci`, `npm run build`, then `node vercel-build.mjs` from this directory. Vercel serves the sheets at /shared and routes authenticated /api requests to api/studio.mjs. Postgres storage requires AITHYA_DATABASE_URL with the aithya_vercel_app role. PROJECT_GEMINI_KEY_SECRET protects per-project tokens. GEMINI_SETUP_API_KEY is used only for rulebook import. The blueprint features require no additional provider secrets.

The blueprint_sheets migration adds task skills and dependencies, milestones, evidence, messages, votes, private attachment metadata, an AI audit table, and member-scoped Realtime. Digests use UTC. A minute-by-minute pg_cron job posts scheduled summaries and records overdue milestones. Team chat downloads use authenticated Storage requests. Drafts from POST /api/assist use the project policy and encrypted team key. Basic drafts work offline from Gemini. Shared meeting notes entered in the Chat sheet can be submitted for summarization. Private learning goals and portfolios are excluded from AI input.

The collaboration checks in tests/blueprint-access.sql run inside a rolled-back transaction with separate owner, member and outsider identities.

## Night Studio and personal workspaces

The shared workspace groups project sheets into Workspace, Teamwork, Project and Studio. The default Night Studio theme and the light theme both fit narrow screens. Vercel serves an installation manifest for the mobile home-screen experience.

Apply `20261122153000_studio_personal_workspaces.sql` after the blueprint migration to enable personal dashboards, participant-only direct chats, project profiles, opt-in AI credit tracking and integration settings. The project pages detect whether this migration is available. Project leads manage encrypted Gemini and Vercel keys in Settings. Public GitHub repositories remain available through Activity.

The existing `/api/assist` route reads project data with the caller's Supabase permissions. Setup drafts and self-profile analysis use the configured platform Gemini key when the project AI policy allows it. Regular assistance uses the project's encrypted Gemini key. Private chats and attachments stay out of assistant requests. AI credit tracking uses manually entered allowances and reset windows.

Run `tests/personal-workspaces-access.sql` against an isolated test schema to exercise private threads and shared credits. The test transaction rolls back its records.

## Project reporting and consolidated chats

The Chats sheet opens the team channel and private threads from the same inbox. Team chat actions include shared polls, task proposals, task and milestone edits, and report sharing. Group and private attachments use separate private buckets. Project membership and thread participation are checked in Supabase policies.

The Report sheet computes a project summary from accepted members, tasks, completion timestamps, time entries, successful Studio assistance calls and explicitly shared AI usage windows. Export or share the generated report, or turn your own contribution into a portfolio case study. Usage from external AI accounts comes from member-entered values. Earlier completed tasks without a timestamp have unknown punctuality.

The production migrations follow the blueprint and personal workspace migrations in date order. Run `tests/clean-workspace-access.sql` against a database with those migrations to exercise completion timestamps and privacy. Portfolio appearance preferences are stored in the local browser and applied to downloaded HTML.

## Final blueprint workflow

The project rail follows the final 18-sheet order. Blueprint, Light and Midnight support a shared accent and icon-size preference under Portfolio. The detective planning board keeps its own palette, renders dependency strings and stores each member's own study notes.

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
