# Helpforce document approvals — product requirements

## Purpose and scope

Build an offline capable, local demonstration of an official document approval workflow. A Clerk authors and submits a document, an Officer reviews it, and a Senior Officer makes the final decision. The experience must make the next action obvious, show why a document was returned, protect irreversible decisions, and leave a readable account of what happened. This is a frontend take home with a realistic mock API, not a production identity or storage system.

The source brief was supplied separately to the development team; this PRD captures its functional requirements so a repository clone remains usable without that local PDF. This document also records proposed implementation decisions. If a choice below conflicts with the original brief, the brief wins. The eventual submission README is a separate artifact limited to one page.

## People and outcomes

| Person | Primary job | First screen |
| --- | --- | --- |
| Clerk (two seeded accounts) | Create, track, correct, and resubmit their own documents | My documents |
| Officer | Review documents awaiting first approval | Officer queue |
| Senior Officer | Make the final approval decision | Senior Officer queue |

Use plain language in the UI. A Clerk should be able to see what needs attention, why a document was returned, and the exact action to take without knowing workflow terminology. Show status as text, never color alone. Maintain a consistent page title, role identity, back path, and action placement.

## Workflow

| Current state | Actor and action | New state | Notes |
| --- | --- | --- | --- |
| New draft | Clerk submits | Pending Officer | Validate title, body, type, and optional PDF. A new draft can live in form state until submitted. |
| Pending Officer | Officer approves | Pending Senior Officer | Confirm before mutation. |
| Pending Officer | Officer rejects with reason | Returned | Return to owning Clerk. |
| Pending Senior Officer | Senior Officer approves | Approved | Final and locked. |
| Pending Senior Officer | Senior Officer rejects with reason | Returned | Return to owning Clerk. |
| Returned | Owning Clerk edits and resubmits | Pending Officer | Restart at Officer, even after a Senior Officer rejection. |

The four persisted statuses are Pending Officer, Pending Senior Officer, Returned, and Approved. There is no delete, withdrawal, undo, or bulk approval in the initial scope. Approval is always document by document because each decision requires review of the original content and any attachment. The queue should make it easy to move to the next item after a decision.

## Core screens and behavior

### Login and application shell

- A simple local login lets the evaluator select one of four seeded users. Show their name and role after login; provide logout and role appropriate navigation.
- Unauthenticated access to protected data and mutations returns `401`. The UI explains session expiry and returns to login without a cryptic failure.
- Each role sees only relevant pages and actions. Direct URLs and API calls are also checked server side.

### Clerk: My documents and editor

- List only documents owned by the current Clerk. Display title, type, status, last update, and the latest rejection reason when returned. Put `Edit and resubmit` on returned items. Explain empty states and allow opening a document for detail and audit history.
- Create with a title of at most 200 characters, required body, document type, and optional PDF of at most 10 MB. Make field constraints visible before submission. Validate again at the API boundary.
- A returned document can be edited and resubmitted by its owner. Other states are read only. Preserve title, body, type, and form context if an attachment upload or submission fails; allow retry without retyping. An approved document is visibly locked.
- The PDF should be viewable inline from the document page and have a download/open fallback. Only local URLs or bundled assets are allowed.

### Officer and Senior Officer: approval queue

- Each role has a focused queue of items awaiting its own approval level, plus a read-only pipeline of documents across every status and a record of its own past decisions. A decision moves the item out of the actionable queue but never makes it disappear from tracking. Show title, owner, type, submitted/waiting date, status, and a text label for items waiting over five working days.
- Search by title; filter by date and document type; sort by date or waiting time. Support 60+ seeded documents with a clear page size and pagination, preserving filter state when returning from detail.
- Show loading, no items, no filter matches, and request error states. Date filtering semantics and timezone should be visible and consistent. Calculate working days by excluding Saturday and Sunday; document that public holidays are not modeled.

### Document detail and decisions

- Present the title, full body, status, owner, timestamps, optional inline PDF preview, latest rejection reason where relevant, and audit timeline. Make original content the primary reading surface.
- Approve and reject controls appear only for the eligible role and status. Both remain disabled until the reviewer acknowledges reading the original document. Rejection requires a nonblank reason. Confirmation dialogs identify the document and describe the resulting status; final Senior Officer approval explicitly says it locks the document.
- Require an explicit full document review acknowledgment before either decision. The acknowledgment says the user reviewed the original body and attachment where present. It is an honest declaration, not a claim that scrolling proves reading. A summary request is optional; its loading or failure must not trap the reviewer.
- On `403`, explain the permission issue and refresh the document/queue. On `409`, say the document changed, refresh its latest version, and require a fresh review and confirmation before another action. On uncertain network failure, avoid claiming success.

### Audit history

- Every document has a chronological, manager readable timeline: actor name and role, plain language action, local date/time, before and after status, and rejection reason when relevant.
- Create, submit, edit/resubmit, approve, reject, and every AI summary request are recorded. Record summary requests even if generation fails. Avoid showing raw status codes or implementation jargon in the timeline.

### AI assistance

- Officers and Senior Officers can request `Summarise` from the document page. A local mock endpoint waits 2–4 seconds, returns a deterministic/rule based summary, and fails around one request in five. No model download or hosted API is needed.
- Label the result `AI-generated summary` and visually separate it from the official document. Each summary point links to a specific source paragraph or span in the body and moves focus/scroll to it. A point must not invent a claim without a source span.
- The request runs asynchronously so the document and other controls stay usable. Show progress, a clear retry action on failure, and preserve the original body and PDF regardless of summary state. Log every request in audit history.
- Approval always requires the full document review acknowledgment and confirmation. The summary cannot satisfy that acknowledgment automatically. Explain this choice in the submission README.
- Verify that requesting or viewing a summary does not enable approval, and that a conflict clears any earlier review acknowledgment. This is a declaration by the reviewer, not proof of reading.

## Mock data and API contract

- Seed exactly four local users: two Clerks, one Officer, one Senior Officer. Seed at least 60 deterministic documents distributed across all statuses, including PDFs, repeated rejections, and items older than ten days. Every seeded document has a coherent audit history.
- Keep a server owned document store, session identity, and attachment storage local. API endpoints enforce ownership, role, current status, input validation, and expected document version. The browser never supplies an authoritative role or edits the store directly.
- Mutations require an expected version. A stale version or changed status returns `409`; an unauthorized role/owner returns `403`; a missing session returns `401`. Return structured error codes and plain language messages. Successful mutations increment the version and append an audit event atomically within the mock store.
- Document whether edits survive server restart. In-memory seeded state is acceptable for the exercise, but attachments and document records must stay consistent during a running session. If a local file store is used, keep generated data out of Git and include a reset path for demos.
- Provide a deliberate way to demonstrate upload failure and conflict/error states during evaluation, without relying on an external service.
- The Git repository is public. The final submission should link to it and be emailed to `usman@helpforce.ai` by the candidate; do not send email automatically.

## Quality and acceptance criteria

- Every screen and async region has meaningful loading, empty, and error states. Failed upload retains typed input. Keyboard only navigation reaches all actions; focus is visible; dialogs manage focus; status and validation messages are announced appropriately; text contrast is usable.
- Run without internet access after dependencies are installed. Bundle fonts/icons/assets; make no runtime requests to CDNs, hosted auth, analytics, or AI services. A documented `npm install && npm run dev` path starts the app.
- Include at least five automated tests of meaningful logic or interactions, not rendering snapshots. Cover transitions, ownership/role checks, stale version conflicts, required rejection reason, form preservation, or summary audit behavior.
- Submit code, four to six screenshots of key screens, and a README of no more than one page. The README explains run/test commands, important design choices including no bulk approval, permission/conflict handling, AI review safeguard, and what another day would improve.
- Prefer React and TypeScript within this existing Next.js project. Read the installed Next.js documentation under `node_modules/next/dist/docs/` before implementing framework features, as required by `AGENTS.md`.

## Out of scope and open implementation choices

- No production authentication, external database, real language model, email, notifications, public holidays calendar, or multiuser realtime transport.
- Choose the smallest local attachment store that supports reliable PDF preview and 10 MB validation. Specify its restart behavior in the README.
- Decide exact pagination size, type values, and layout details during implementation, keeping the behavior above stable and documenting consequential assumptions.
