# Design decisions to carry into the submission README

- Home starts with real document counts: needs action, in review, returned, and approved. The counts are scoped to the documents visible to the current role.
- Desktop navigation lives in the sidebar. A compact Menu button exposes the same destinations on mobile, where the sidebar is hidden.
- Reviews default to the Critical pill and offer Urgent, Recent, and All. Search, type, waiting date range, and sort controls sit above the pills. Critical means more than 10 working days; Urgent means 6–10; Recent means up to 5. Items over 5 working days are explicitly flagged.
- The document view uses two columns. The original PDF or body has the wide reading area. Decision controls, AI summary, and a readable audit timeline share the right rail. This keeps the PDF large enough to read.
- Four distinct PDFs are bundled for seeded documents at different stages. A local PDF.js worker renders their pages and actual uploaded PDFs with page and zoom controls; the API continues to enforce role access. The original body remains present because the assessment requires it and summary citations must link to it.
- The assessment explicitly requires a **Summarise action** for Officers and Senior Officers, so the button remains. Summary generation is optional, delayed, may fail, and logs every request. It never unlocks approval: the reviewer must acknowledge reading the original document or PDF first.
- No bulk approval: each decision needs review of the original and a confirmation. Preserve the existing 403/409 refresh handling and unsaved Clerk form content on upload errors.
