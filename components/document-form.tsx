"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  canEdit,
  documentErrors,
  fileError,
  latestRejection,
  MAX_TITLE,
  roleLabel,
  types,
  type Document,
  type FieldErrors,
} from "@/lib/domain";
import { api, ApiFailure } from "@/lib/client/api";
import { clearDraft, loadDraft, saveDraft } from "@/lib/client/drafts";
import { useApp } from "./app-provider";
import { dateTime } from "./document-table";
import PageHeader from "./page-header";
import { ErrorState, LoadingState } from "./states";

const fieldOrder = ["title", "type", "body", "file"] as const;
const labels = { title: "Title", type: "Document type", body: "Document text", file: "Supporting PDF" };

/** Wrapper: for an edit, load the document and check it can be edited first. */
export default function DocumentForm({ id }: { id?: string }) {
  const { user, handleError } = useApp();
  const [state, setState] = useState<{ phase: "loading" | "ready" | "error"; doc?: Document; failure?: ApiFailure }>({
    phase: id ? "loading" : "ready",
  });

  useEffect(() => {
    if (!id) return;
    let active = true;
    api<{ document: Document }>(`documents/${id}`)
      .then(({ document }) => active && setState({ phase: "ready", doc: document }))
      .catch((error) => {
        const failure = error instanceof ApiFailure ? error : new ApiFailure(0, "ERROR", "The document could not be loaded.");
        if (failure.status === 401) handleError(failure);
        if (active) setState({ phase: "error", failure });
      });
    return () => {
      active = false;
    };
  }, [id, handleError]);

  if (user.role !== "clerk")
    return (
      <>
        <PageHeader title={id ? "Edit document" : "Create document"} />
        <ErrorState
          title="Only Clerks can create or edit documents"
          message={`You are signed in as ${roleLabel(user.role)}. Approvers review documents but do not write them.`}
          backHref="/reviews"
          backLabel="Go to approval queue"
        />
      </>
    );
  if (state.phase === "loading") return <LoadingState label="Loading document" />;
  if (state.phase === "error")
    return (
      <>
        <PageHeader title="Document unavailable" />
        <ErrorState message={state.failure!.message} backHref="/documents" backLabel="Go to my documents" />
      </>
    );
  if (state.doc && !canEdit(user, state.doc))
    return (
      <>
        <PageHeader title="This document cannot be edited" />
        <ErrorState
          title="This document cannot be edited"
          message={
            state.doc.status === "Approved"
              ? "It has final approval and is locked."
              : `It is at the “${state.doc.status}” stage. You can only edit a document after it is returned to you.`
          }
          backHref={`/documents/${state.doc.id}`}
          backLabel="View the document"
        />
      </>
    );
  return <Editor key={state.doc?.id ?? "new"} doc={state.doc} />;
}

function Editor({ doc }: { doc?: Document }) {
  const { user, handleError, notify, refreshDocuments } = useApp();
  const router = useRouter();
  // Restore unsent text from this device, e.g. after a failed upload, an expired session or a refresh.
  const [initial] = useState(() => {
    const original = { title: doc?.title ?? "", body: doc?.body ?? "", type: doc?.type ?? "" };
    const draft = loadDraft(user.id, doc?.id);
    const differs = draft && (draft.title !== original.title || draft.body !== original.body || draft.type !== original.type);
    return differs ? { ...draft, restored: draft.savedAt } : { ...original, restored: null };
  });
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [type, setType] = useState<string>(initial.type);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [restored, setRestored] = useState<string | null>(initial.restored);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Copy what is typed to this device shortly after each change.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (title || body) {
        if (saveDraft(user.id, doc?.id, { title, body, type })) setSavedAt(new Date().toISOString());
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [title, body, type, user.id, doc?.id]);

  useEffect(() => {
    if (Object.keys(errors).length || formError) summary.current?.focus();
  }, [errors, formError]);

  function discardDraft() {
    clearDraft(user.id, doc?.id);
    setTitle(doc?.title ?? "");
    setBody(doc?.body ?? "");
    setType(doc?.type ?? "");
    setRestored(null);
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setErrors((e) => ({ ...e, file: next ? fileError(next) : undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: FieldErrors = { ...documentErrors({ title, body, type }), ...(file && fileError(file) ? { file: fileError(file) } : {}) };
    setFormError("");
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const data = new FormData();
    data.set("title", title);
    data.set("body", body);
    data.set("type", type);
    if (file) data.set("file", file);
    if (doc) data.set("version", String(doc.version));
    try {
      const { document } = await api<{ document: Document }>(doc ? `documents/${doc.id}/resubmit` : "documents", { method: "POST", body: data });
      clearDraft(user.id, doc?.id);
      await refreshDocuments();
      notify({
        tone: "success",
        text: `${doc ? "Resubmitted" : "Submitted"} “${document.title}” to the Officer.`,
        path: `/documents/${document.id}`,
      });
      router.push(`/documents/${document.id}`);
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : new ApiFailure(0, "ERROR", "Submission failed.");
      if (failure.code === "UPLOAD_FAILED") {
        setErrors({ file: failure.message });
        setFormError("The PDF could not be uploaded. Everything you typed is still here.");
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
      } else if (failure.status === 400) {
        setFormError(failure.message);
      } else if ([401, 403, 409].includes(failure.status)) {
        handleError(failure);
        if (failure.status !== 401)
          setFormError(`${failure.message} Your text is saved on this device as a draft.`);
      } else {
        setFormError(`${failure.message} Nothing was submitted. Your text is still here, so you can try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const errorList = fieldOrder.filter((f) => errors[f]);
  const rejection = doc ? latestRejection(doc) : undefined;
  const describedBy = (field: keyof FieldErrors, hint?: string) =>
    [hint, errors[field] ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <Link className="back-link" href={doc ? `/documents/${doc.id}` : "/documents"}>
        ← {doc ? "Back to document" : "Back to my documents"}
      </Link>
      <PageHeader
        eyebrow={doc ? `${doc.id} · Returned for changes` : "New document"}
        title={doc ? "Edit and resubmit" : "Create a document"}
        description="When you submit, the document goes to the Officer for the first review."
      />
      {rejection?.reason && (
        <div className="banner banner-returned">
          <p>
            <strong>
              What {rejection.actor} ({roleLabel(rejection.actorRole)}) asked you to change:
            </strong>{" "}
            “{rejection.reason}”
          </p>
        </div>
      )}
      {restored && (
        <div className="alert alert-info" role="status">
          <p>We restored the unsent text you were writing on {dateTime(restored)}.</p>
          <button type="button" className="button ghost small" onClick={discardDraft}>
            Discard it and start again
          </button>
        </div>
      )}
      {(errorList.length > 0 || formError) && (
        <div className="error-summary" role="alert" tabIndex={-1} ref={summary} aria-labelledby="error-summary-title">
          <h2 id="error-summary-title">{formError || "Please fix the following"}</h2>
          {errorList.length > 0 && (
            <ul>
              {errorList.map((f) => (
                <li key={f}>
                  <a href={`#field-${f}`}>
                    {labels[f]}: {errors[f]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <form className="panel form" onSubmit={submit} noValidate aria-busy={submitting}>
        <div className="field">
          <label htmlFor="field-title">Title (required)</label>
          <input
            id="field-title"
            value={title}
            maxLength={MAX_TITLE + 50}
            aria-invalid={!!errors.title}
            aria-describedby={describedBy("title", "title-count")}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
          <p id="title-count" className={`hint ${title.trim().length > MAX_TITLE ? "over" : ""}`}>
            {title.trim().length} of {MAX_TITLE} characters
          </p>
          {errors.title && <p className="field-error" id="title-error">{errors.title}</p>}
        </div>
        <div className="field">
          <label htmlFor="field-type">Document type (required)</label>
          <select id="field-type" value={type} aria-invalid={!!errors.type} aria-describedby={describedBy("type")} onChange={(e) => setType(e.target.value)}>
            <option value="">Choose a type</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {errors.type && <p className="field-error" id="type-error">{errors.type}</p>}
        </div>
        <div className="field">
          <label htmlFor="field-body">Document text (required)</label>
          <textarea
            id="field-body"
            rows={14}
            value={body}
            aria-invalid={!!errors.body}
            aria-describedby={describedBy("body", "body-hint")}
            onChange={(e) => setBody(e.target.value)}
          />
          <p id="body-hint" className="hint">
            Use a blank line between paragraphs. A short line on its own becomes a section heading.
          </p>
          {errors.body && <p className="field-error" id="body-error">{errors.body}</p>}
        </div>
        <div className="field">
          <label htmlFor="field-file">Supporting PDF (optional, up to 10 MB)</label>
          <input
            id="field-file"
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            aria-invalid={!!errors.file}
            aria-describedby={describedBy("file", "file-hint")}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />
          <p id="file-hint" className="hint">
            {doc?.attachment ? `Current file: ${doc.attachment.name}. Leave this empty to keep it. ` : ""}
            Files are not kept in drafts, so choose the PDF again if you come back later.
          </p>
          {file && !errors.file && (
            <p className="hint">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
          {errors.file && <p className="field-error" id="file-error">{errors.file}</p>}
        </div>
        <div className="form-actions">
          <p className="hint" aria-live="polite">
            {savedAt ? `Draft saved on this device at ${new Date(savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
          <Link className="button secondary" href={doc ? `/documents/${doc.id}` : "/documents"}>
            Cancel
          </Link>
          <button type="submit" className="button primary" disabled={submitting}>
            {submitting ? "Submitting…" : doc ? "Resubmit to Officer" : "Submit to Officer"}
          </button>
        </div>
      </form>
    </>
  );
}
