# Aithya Shared Projects implementation and verification

The local branch starts at `94d045c` on `final-blueprint-studio`, which contains the photographed Blueprint directory. The directory keeps its original wordmark, header links, project rows and creation actions. Opening a project uses the five in-project screens and defaults to Midnight Glass until the user chooses a theme. This branch has no remote release.

## Phase 1. Consolidation

The root npm commands now use the same portal as the Studio Vercel build. The Shared Projects directory, project shell, bulletin, and Project Today use React and TypeScript. Existing working screens still supply sign-in, invitations, policies, private chats, tasks, reports, and provider settings while their React ports are being verified. The old root prototype remains in source. No existing table is removed.

Changed files include the root and Studio package manifests, Studio HTML and build scripts, and `src/shared.js`.

## Phase 2. Design and approvals

The project shell and collaboration screens use Midnight Glass with light and Blueprint choices still available. A setup draft now lives in this browser tab and is cleared on cancel, sign-out, or approval. Old account drafts can still be resumed. A plan proposal can be edited or dismissed before approval. Once saved, the same screen offers ten seconds to undo. Undo compares the revision timestamp before reverting. Existing setup and sign-in links remain valid.

Changed files include `ui/shared.css`, `src/studio-appearance.js`, `src/shared-planning.js`, and `src/portal/ProjectShell.tsx`.

## Phase 3. Rules and Work

Rules shows the deadline, brief, requirements, documents, judging criteria and project AI policy. Manually verified requirements may include a source document and page. Text-based imports preserve a source quote, and a PDF page appears when exactly one page matches. The approved values and citations are stored together. A later edit suppresses the old citation until it is confirmed again. Provider scans are marked unverified. Work links directly to Plan, the task board and contextual AI help. The version check rejects stale task updates.

Changed files include `src/shared.js`, `src/shared-rulebook.js`, `src/blueprint.js`, `src/portal/status.js` and the additive portal migration.

## Phase 4. Team

The bulletin uses the existing project messages, polls, and RLS. It detects a short list of post types with simple text rules, allows changes, pins open blockers and the deadline, filters by tasks and mentions, flags duplicates, and places older posts under Include archived. Chat keeps the general room, private conversations and attachments, and adds a room per task on the migrated schema. On a failed send the composer retains the draft so the member can retry in place. Thread summaries, task proposals and decisions have editable drafts based on cited messages. Teammates may leave, and leaders can transfer leadership or remove a member with an explicit reassignment for open work.

Changed files include `src/portal/Bulletin.tsx`, `src/blueprint.js`, and the bulletin and task-thread fields in the migration. Posting, resolving, filtering and sending in a task thread passed at 360 px with browser fixtures. Cross-account RLS and stale-write checks passed in a local Postgres-compatible runtime using the migration sequence and stubbed Supabase platform services.

## Phase 5. Today and Submit

Project Today displays upcoming work, recent unread bulletin items, and a seven-day post digest. It computes a next action from assigned open tasks and their dependencies. New bulletin messages arrive via Realtime. Submit opens the existing readiness and evidence checklist, with the repository and deployment status strip. The header reads remaining Studio Gemini assist requests after checking membership. Personal provider trackers remain accessible during verification.

Changed files include `src/portal/Today.tsx`, `src/portal/status.js`, `server/project-usage.mjs`, and the Worker and Vercel adapters.

## Phase 6. Performance and edge cases

For the same Blueprint version and mobile Lighthouse harness with gzip enabled, the initial browser JavaScript before sign-in fell from 115,351 bytes to about 97 KB and Lighthouse moved from 95 to 99. The Shared Projects directory, project shell and individual views load after sign-in. The first signed-in project visit still loads more than 150 KB once its React and view chunks are included. Real-device interaction timing remains unmeasured.

The local migrations add the member-scoped project snapshot, idempotent approval, rulebook citations, bulletin and task-thread metadata, task version checks, leader-scoped plan undo, and team lifecycle operations. Existing RLS applies to reads. Team changes check an authenticated actor and current project membership. Draft approval, cross-project isolation, and leave and transfer behavior passed in the local database fixture and were rolled back.

| Case | Behavior and coverage |
| --- | --- |
| Refresh or Back during setup | Tab storage retains typed values. The browser test refreshes before approving and verifies that no database draft write was attempted. |
| Double project approval | Same draft ID returns the existing project. The database fixture verifies it. |
| Expired, revoked, accepted or wrong-email invites | The existing invite claim flow and email matching stay in use. The local database fixture claimed an invitation whose input email used uppercase. Hosted end-to-end invitation testing is pending. |
| No tasks, rules or deadline | Each view has an empty state and an entry point to fill it. Date-only project deadline is interpreted as end of day in India. |
| Scanned, oversized, protected or non-English source | Existing Gemini opt-in accepts scans within the 8 MB limit. If unreadable, the form retains a manual route. New multilingual extraction accuracy is unmeasured. |
| Provider failure or quota | Existing tests verify refund behavior, including invalid output and partially reserved usage. The importer labels results with their source and review status. |
| Concurrent edits | Task version filters reject stale updates. Cross-account database tests verify that an outsider cannot read or resolve a post. |
| Weak connection, long text, mobile | The composer keeps a failed send available for retry on the current screen. Retrying with the same message ID avoids duplicates after ambiguous text delivery. The browser fixture checks widths at 360 px. A persisted offline queue and multi-device unread counters are pending. |
| Member removal and leadership transfer | The local fixture verifies authorized transfer, disallowed transfers by ordinary members, reassignment of open tasks and loss of project access after leaving. Reinviting a removed teammate requires a separate consent flow. |

## Pending verification

The AI Edge Function adapter and its origin and identity checks were verified locally. A deployment must set the matching project runtime database connection, team-key encryption secret, and exact allowed origins before enabling Edge routing. Production-specific environment values stay in Supabase and Vercel settings.

The starter evaluation corpus records the existing extractor’s limits. New Gemini thread proposals stay switched off until provider evaluation. The app can quote local messages for review in the meantime. Live database checks, multilingual model accuracy, cross-device unread state, offline retry after closing a tab, full porting of the remaining legacy screens to React, and verification of all standalone-screen replacements remain pending. Interviews depend on participant availability.
