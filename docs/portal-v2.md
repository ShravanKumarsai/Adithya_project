# Drafdeck v2 implementation and verification

## Phase 1. Consolidation

The root npm commands now use the same portal as the Studio Vercel build. The project shell, bulletin, and Project Today use React and TypeScript. Existing working screens still supply sign-in, invitations, policies, private chats, tasks, reports, and provider settings while their React ports are being verified. The old root prototype remains in source. No existing table is removed.

Changed files include the root and Studio package manifests, Studio HTML and build scripts, and `src/shared.js`.

## Phase 2. Design and approvals

The project shell and collaboration screens use Midnight Glass with light and Blueprint choices still available. A setup draft now lives in this browser tab and is cleared on cancel, sign-out, or approval. Old account drafts can still be resumed. A plan proposal can be edited or dismissed before approval. Once saved, the same screen offers ten seconds to undo. Undo compares the revision timestamp before reverting. Existing setup and sign-in links remain valid.

Changed files include `ui/shared.css`, `src/studio-appearance.js`, `src/shared-planning.js`, and `src/portal/ProjectShell.tsx`.

## Phase 3. Rules and Work

Rules shows the deadline, brief, requirements, documents, judging criteria and project AI policy. Manually verified requirements may include a source document and page. Imported fields show the input source and whether the match is unverified. Model-generated quotes and page numbers require provider evaluation. Work links directly to Plan, the task board and contextual AI help. The version check rejects stale task updates.

Changed files include `src/shared.js`, `src/shared-rulebook.js`, `src/blueprint.js`, `src/portal/status.js` and the additive portal migration.

## Phase 4. Team

The bulletin uses the existing project messages, polls, and RLS. It detects a short list of post types with simple text rules, allows changes, pins open blockers and the deadline, filters by tasks and mentions, flags duplicates, and places older posts under Include archived. Chat keeps the general room, private conversations and attachments, and adds a room per task on the migrated schema. On a failed send the composer retains the draft so the member can retry in place.

Changed files include `src/portal/Bulletin.tsx`, `src/blueprint.js`, and the bulletin and task-thread fields in the migration. Posting, resolving, filtering and sending in a task thread passed at 360 px with browser fixtures. Cross-account RLS and stale-write checks passed in a local Postgres-compatible runtime using the migration sequence and stubbed Supabase platform services.

## Phase 5. Today and Submit

Project Today displays upcoming work and recent unread bulletin items, and computes a next action from assigned open tasks and their dependencies. Submit opens the existing readiness and evidence checklist, with the repository and deployment status strip. The header reads remaining Studio Gemini assist requests after checking membership. Personal provider trackers remain accessible during verification.

Changed files include `src/portal/Today.tsx`, `src/portal/status.js`, `server/project-usage.mjs`, and the Worker and Vercel adapters.

## Phase 6. Performance and edge cases

The old root React route had 391.81 kB of gzipped JavaScript. The prior production Studio bundle was about 121 kB. The new signed-out portal starts at approximately 96 kB. The shell, bulletin, Today, and legacy workspace views load separately after sign-in. Authenticated navigation also downloads the applicable React and view chunks, so it exceeds 150 kB on the first visit to a project. With gzip enabled for both builds, the Lighthouse mobile signed-out score rose from 98 on the prior Studio build to 99 on v2. Largest Contentful Paint fell from 2.29 s to 1.79 s and Total Blocking Time from 60 ms to 10 ms. A separate uncompressed run scored 79 for the prior Studio and 88 for v2. The previous root prototype did not register a contentful paint. Authenticated route speed and real-device latency still require verification.

The additive migration `20261124135038_portal_collaboration.sql` adds a member-scoped project snapshot, an idempotent approval RPC, bulletin and task-thread metadata, task version checks, and leader-scoped plan undo. It uses existing RLS for reads and verifies that a linked task belongs to the same project. The test fixture rolls back. Production migration approval is pending.

| Case | Behavior and coverage |
| --- | --- |
| Refresh or Back during setup | Tab storage retains typed values. The browser test refreshes before approving and verifies that no database draft write was attempted. |
| Double project approval | Same draft ID returns the existing project. The database fixture verifies it. |
| Expired, revoked, accepted or wrong-email invites | The existing invite claim flow and email matching stay in use. Production end-to-end invitation retesting is pending. |
| No tasks, rules or deadline | Each view has an empty state and an entry point to fill it. Date-only project deadline is interpreted as end of day in India. |
| Scanned, oversized, protected or non-English source | Existing Gemini opt-in accepts scans within the 8 MB limit. If unreadable, the form retains a manual route. New multilingual extraction accuracy is unmeasured. |
| Provider failure or quota | Existing tests verify refund behavior, including invalid output and partially reserved usage. The importer labels results with their source and review status. |
| Concurrent edits | Task version filters reject stale updates. Cross-account database tests verify that an outsider cannot read or resolve a post. |
| Weak connection, long text, mobile | The composer keeps a failed send available for retry on the current screen. Retrying with the same message ID avoids duplicates after ambiguous text delivery. The browser fixture checks widths at 360 px. A persisted offline queue and multi-device unread counters are pending. |
| Member removal and leadership transfer | Existing membership restrictions apply. New transfer and reassignment flows still require implementation and verification. |

Provider evaluation, full React conversion, AI Edge Functions, a complete per-item citation contract, and verification of the replacements for standalone legacy screens remain open. Interviews still depend on participant availability.
