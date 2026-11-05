# Helpforce build plan

Work through these milestones in order. Check off a task only after its acceptance check passes. Keep commits small and meaningful and push them to the public repository as authorized. The submission deadline stated in the brief is Saturday, 7 November 2026 at 6:00 PM Pakistan time. Aim for the stated 5–7 hours and do not exceed nine hours of implementation effort.

Implementation is underway. Domain logic, the local API, role workspaces, core document flows, and summary UI are implemented. Automated logic tests, lint, and production build pass. The final accessibility/offline pass, screenshot files, and broader interaction tests remain open below.

## Milestone 0 — Baseline and design decisions

- [x] Read `PRD.md`, the source PDF, `AGENTS.md`, and relevant installed Next.js guides before code changes.
- [x] Inspect repository state, package scripts, existing components, and installed test options.
- [x] Confirm local mock API/store and attachment strategy, including reset and restart behavior.
- [x] Define a compact visual system: typography, spacing, color, status labels, focus, dialogs, tables, and responsive layout. Capture any important assumption for the submission README.

**Done when:** the workflow, route map, API boundaries, and visual direction are clear enough to implement without inventing behavior screen by screen.

## Milestone 1 — Domain model and deterministic fixture data

- [x] Define TypeScript types for users, roles, statuses, document types, documents, attachments, audit events, summary points, and structured API errors.
- [x] Implement pure permission and transition functions for create, edit/resubmit, approve, reject, and summarise eligibility.
- [x] Define version checks and audit event creation as part of each mutation.
- [x] Seed four users and 60+ coherent documents across statuses, owners, ages, PDFs, and repeated rejections. Give every document audit history.
- [x] Add focused tests for transition rules, role/owner denial, final lock, and stale versions.

**Done when:** tests prove the workflow and the fixture data can demonstrate every required state.

## Milestone 2 — Local mock API and session

- [x] Implement local login, session lookup, and logout. Keep actor identity server owned.
- [x] Implement document list/detail, create, update/resubmit, approve, reject, attachment preview/upload, audit, and summarise endpoints as needed by the UI.
- [x] Validate title length, required body/type, PDF MIME/content/size, and nonblank rejection reason at the API boundary.
- [x] Return structured `401`, `403`, and `409` responses. Use expected document versions on mutations; write state and audit together.
- [x] Add a repeatable way to exercise conflict and upload failure, plus tests for permissions and errors.

**Done when:** direct API calls cannot bypass role or state rules; a stale action returns `409` and the document remains correct.

## Milestone 3 — Shell, login, and feedback patterns

- [ ] Create the shared app shell with current user, role, navigation, logout, page titles, and responsive structure.
- [ ] Build the four user login chooser and role specific landing routes.
- [ ] Establish reusable status badges, form errors, loading/empty/error panels, toast or inline feedback, and accessible confirmation dialogs.
- [ ] Handle expired sessions and direct navigation to unauthorized routes.

**Done when:** keyboard navigation and focus are visible, and each account reaches only its appropriate workspace.

## Milestone 4 — Clerk workflow

- [ ] Build `My documents` with status and latest rejection reason.
- [ ] Build create form with title count, body, type, optional PDF, and clear validation.
- [ ] Build Returned edit/resubmit flow; preserve input after upload or submission failure.
- [ ] Build read only states for pending/approved documents and show a clear lock message for Approved.
- [ ] Verify ownership and error handling from UI through API.

**Done when:** either Clerk can create, track, correct, and resubmit only their own documents without losing entered text on an upload failure.

## Milestone 5 — Approval queue and document review

- [ ] Build Officer and Senior Officer queues with title search, date/type filtering, sorting, overdue working day label, and pagination for 60+ records.
- [ ] Build document detail with authoritative body, local PDF preview/fallback, status, rejection context, and audit timeline.
- [ ] Build approve/reject dialogs. Require rejection reason; require explicit original document review acknowledgment before approval.
- [ ] Refresh queue/detail after success, `403`, and `409`; clear stale acknowledgment after a conflict.
- [ ] Test decision transitions, required reason, and stale action recovery.

**Done when:** an approver can find and review the right item quickly, make a safe decision, and understand a conflict without guessing what happened.

## Milestone 6 — AI summary experience

- [ ] Implement local rule based summary with source paragraph/span references, 2–4 second delay, and about 20% failure.
- [ ] Write an audit event for every request, including failures.
- [ ] Build separate AI panel with loading, failure/retry, clear label, source links, and focus/scroll to original text.
- [ ] Keep original content usable while loading; never turn summary use into approval acknowledgment.
- [ ] Test summary traceability, failure/retry, and audit logging.

**Done when:** a reviewer can inspect every summary point in context, recover from failure, and approve only after explicitly acknowledging the original document.

## Milestone 7 — Accessibility, offline check, and delivery

- [ ] Review every screen at desktop and narrow viewport sizes; inspect table, form, dialog, attachment, and audit readability.
- [ ] Navigate the complete Clerk and approval flows using keyboard only; fix focus order, dialog focus, labels, contrast, and announcement issues.
- [ ] Verify loading, empty, and error states, including `401`, `403`, `409`, upload failure, and AI failure.
- [ ] Document repeatable evaluator steps for `403`, `409`, and upload failure without editing source code.
- [ ] Verify that a summary alone never enables approval, a conflict clears review acknowledgment, and PDF presence is reflected in the acknowledgment.
- [ ] Run lint, type/build checks, and at least five meaningful automated tests.
- [ ] Verify that the app makes no external runtime requests and works with network disabled after installation.
- [ ] Capture four to six representative screenshots: login, Clerk list/form or Returned state, queue, document review, audit, and AI summary.
- [ ] Write a submission README of at most one page with run/test instructions, decisions, errors, AI safeguard, and next day improvements.
- [ ] Review Git diff and commit history, then prepare the requested submission link or archive when explicitly requested.
- [ ] Provide the public repository link for submission to `usman@helpforce.ai`; the candidate sends the email.

**Done when:** a reviewer can start the app with the documented command, switch among four accounts, complete the full workflow, inspect errors and AI behavior, and understand the design decisions from the README.
