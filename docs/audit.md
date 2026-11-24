# Frontend and data audit

Baseline is final-blueprint-studio at 94d045c. The screenshot identifies the shared workspace through the Aithya wordmark, inline Project insights and Shared projects navigation, and the Blueprint theme. The root Vite entry starts a separate React onboarding flow.

| Area | Baseline evidence | Change needed |
| --- | --- | --- |
| Dashboard | src/App.tsx imports a static task board, Recharts, React Flow, DnD and a form to log a brief. Its tabs change a selected label. | Use the working shared routes and records at the root. Keep access to working legacy tools until verified. |
| Build | Root has npm and pnpm locks. The Studio subproject has a separate npm build. | Use npm for the portal and deployment. Check imports and lockfile together. Keep the canonical migrations in aithya-studio/supabase. |
| Redundant code | Both clients have an auth setup and wizard. The old vanilla index/app/notebook files mentioned in the brief are still present on this base. The routed shared workspace uses ui/shared.html and src/shared.js. logSupabaseSetup is a pure string getter despite its name. | Route normal entry points to the same UI and reuse the working session/invitation handlers. |
| Initial transfer | The Studio shared client is built as one browser bundle. PDF.js and its worker are already separate assets. Root App.tsx statically imports graph and chart libraries. | Keep PDF parsing on demand. Exclude the mock dashboard and its dependencies from the production entry. |
| Queries | shared.js loadProject assembles twelve base requests, a capability probe and optional invitations. ProjectAccess.tsx separately looks up the same profile twice. | Read related records in one member-scoped database request. Avoid fetching invitation tokens or unrelated message bodies. |
| Setup | shared.js queueDraft writes project_drafts on input, on moving steps and on leaving the form. Existing account drafts can contain real work. | Keep pending edits in tab storage scoped by user. Publish on explicit approval. Support resuming older server drafts. |
| Collaboration | blueprint.js handles group chat, polls, private files and Realtime. personal-studio.js implements private conversations. final-workspace.js corkboard links planning evidence rather than team posts. | Reuse messages, votes and file permissions. Add typed posts, task context, and discoverable filters. |
| AI | server/quota.mjs already refunds reserved calls on errors. rulebook-limits.js defines 8 MiB. server/github.mjs already uses ETags. | Keep these protections. Ground proposals in supplied text, evaluate before enabling new model actions. |
| Styles and navigation | shared.css has layered Blueprint overrides. Existing projects have deep links such as /shared?project=…&sheet=Chats. | Preserve the photographed header, project rows, theme choices and inbound links. Default the directory to Blueprint and use Midnight Glass inside new project views unless the member has chosen a theme. |
