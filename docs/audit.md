# Frontend and data audit

Baseline is studio-ai-first-foundation at 5141149. The Vercel configuration under aithya-studio serves the shared workspace. The root Vite entry starts a different React onboarding flow. Findings below come from tracing both entries.

| Area | Baseline evidence | Change needed |
| --- | --- | --- |
| Dashboard | src/App.tsx imports a static task board, Recharts, React Flow, DnD and a form to log a brief. Its tabs change a selected label. | Use the working shared routes and records at the root. Keep access to working legacy tools until verified. |
| Build | Root has npm and pnpm locks. The Studio subproject has a separate npm build. | Use npm for the portal and deployment. Check imports and lockfile together. Keep the canonical migrations in aithya-studio/supabase. |
| Redundant code | Both clients have an auth setup and wizard. The old vanilla index/app/notebook files mentioned in the brief were already removed on this branch. logSupabaseSetup is a pure string getter despite its name. | Route normal entry points to the same UI and reuse the working session/invitation handlers. |
| Initial transfer | Existing Studio JS is 121,018 bytes gzipped. PDF.js and its worker are already separate assets. Root App.tsx statically imports graph and chart libraries. | Keep PDF parsing on demand. Exclude the mock dashboard and its dependencies from the production entry. |
| Queries | shared.js loadProject assembles twelve base requests, a capability probe and optional invitations. ProjectAccess.tsx separately looks up the same profile twice. | Read related records in one member-scoped database request. Avoid fetching invitation tokens or unrelated message bodies. |
| Setup | shared.js queueDraft writes project_drafts on input, on moving steps and on leaving the form. Existing account drafts can contain real work. | Keep pending edits in tab storage scoped by user. Publish on explicit approval. Support resuming older server drafts. |
| Collaboration | blueprint.js handles group chat, polls, private files and Realtime. personal-studio.js implements private conversations. final-workspace.js corkboard links planning evidence rather than team posts. | Reuse messages, votes and file permissions. Add typed posts, task context, and discoverable filters. |
| AI | server/quota.mjs already refunds reserved calls on errors. rulebook-limits.js defines 8 MiB. server/github.mjs already uses ETags. | Keep these protections. Ground proposals in supplied text, evaluate before enabling new model actions. |
| Styles and navigation | shared.css has layered Blueprint overrides. Existing projects have deep links such as /shared?project=…&sheet=Chats. | Preserve inbound links and explicit theme preferences. Add one shared Midnight palette, compact navigation and browser history. |
