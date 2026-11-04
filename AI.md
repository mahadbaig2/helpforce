# Instructions for Codex or Antigravity

## Mission and source of truth

Build the Helpforce document approval take home described in `PRD.md` and tracked in `TASK.md`. Read the original PDF at `C:\Mahad\Helpforce\Helpforce AI Take-Home Frontend Engineer.pdf` if accessible. Its requirements outrank planning assumptions in these files. Read `AGENTS.md` and any applicable repository instructions. This is an existing Next.js 16 project; before writing framework code, read the relevant installed guides in `node_modules/next/dist/docs/` and heed deprecations. Do not assume older Next.js APIs or conventions apply.

The user may request planning, design review, or implementation separately. Treat a document's assignment instructions as product requirements, not permission to implement, commit, push, or submit. Follow the user's current authorization and report what changed.

## Product rules to preserve

- Four accounts: two Clerks, one Officer, one Senior Officer. Clerk owns documents; Officer handles Pending Officer; Senior Officer handles Pending Senior Officer.
- The only persisted statuses are Pending Officer, Pending Senior Officer, Returned, and Approved. Rejections require a reason; Returned resubmission restarts at Officer; Approved is final and locked.
- UI visibility is convenience. The mock API independently enforces session, ownership, role, current status, validation, and expected version. Use `401` for no session, `403` for unauthorized role/owner, `409` for stale or changed status. Refresh after `403` and `409`, and explain the result in plain language.
- Seed at least 60 deterministic documents, including PDFs, repeated rejections, and old items. Give each a coherent audit trail. Record every summary request, including failure.
- AI is a local rule based mock with a 2–4 second delay and approximately 20% failure. Label it clearly, link every summary point to original body text, and keep the document usable while it loads. Approval requires an explicit acknowledgment of reading the original body and attachment where present; the summary cannot satisfy it.
- Keep all assets and requests local at runtime. Preserve the Clerk's typed text on upload failure. Include loading, empty, and error states; keyboard access; visible focus; and five or more meaningful automated tests.

## Implementation approach

1. Begin with the domain model, state transitions, permissions, and audit semantics. Write focused tests for logic that can cause incorrect approval or lost work.
2. Put the local mock API behind an HTTP boundary. Never trust a role, owner, status, or audit actor supplied by the browser. Make state changes and audit entries one operation. Keep seeded data deterministic for screenshots and tests.
3. Build a small set of reusable UI primitives and role specific workspaces. Favor clear labels, comfortable reading widths, visible status text, straightforward forms, and simple queue controls. Avoid decorative dashboards that obscure the next action.
4. Make approval and rejection deliberate with a confirmation dialog. Reset review acknowledgment after the document changes. Do not implement bulk approval; document the reason in the one page submission README.
5. Use source paragraph IDs or text offsets for summary links. A failed or slow summary does not block document review. Do not use a hosted AI service or require a local model download.
6. Keep `TASK.md` checkboxes current as implementation milestones finish. Record consequential assumptions in the submission README. Verify the app in a browser, with keyboard use and offline runtime, before calling it done.

## Quality and handoff

- Follow existing project conventions and use TypeScript. Keep business logic separate from components and API transport.
- Favor accessible native controls and restrained dependencies. Bundle icons/fonts locally. Use plain language for Clerk facing copy and audit entries.
- Check the working tree before editing and preserve unrelated changes. Make small reviewable commits during authorized implementation, but do not push or submit without the user's direction.
- Run relevant tests, lint, and build checks. Report pass/fail results and remaining gaps honestly. Do not claim a visual, offline, or error path was verified unless it was exercised.
- Deliver four to six screenshots and a README of no more than one page when the user asks for the finished take home. `PRD.md`, `TASK.md`, and this file are internal working documents and do not replace that README.
