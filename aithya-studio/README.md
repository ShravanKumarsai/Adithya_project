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
