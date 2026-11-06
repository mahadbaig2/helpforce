"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Document } from "@/lib/domain";
import { ApiFailure, postJson } from "@/lib/client/api";
import { useApp } from "./app-provider";

export type ReadingProgress = {
  bodyRead: boolean;
  hasPdf: boolean;
  pdfPagesSeen: number;
  pdfPages: number | null;
  pdfRead: boolean;
};

type Decision = "approve" | "reject";

/**
 * Approve / return controls. Both stay locked until the reader has scrolled to
 * the end of the body, viewed every PDF page, and confirmed reading the
 * original themselves. The AI summary does not count towards any of this.
 */
export default function DecisionPanel({
  doc,
  progress,
  onDecided,
  onConflict,
}: {
  doc: Document;
  progress: ReadingProgress;
  onDecided: (doc: Document, decision: Decision) => void;
  onConflict: () => void;
}) {
  const { handleError } = useApp();
  const [ticked, setTicked] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonId = useId();
  const requirementsId = useId();

  const readingDone = progress.bodyRead && (!progress.hasPdf || progress.pdfRead);
  const finalStage = doc.status === "Pending Senior Officer";

  // The confirmation only counts while the reading steps are complete.
  const confirmed = ticked && readingDone;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (decision && !d.open) d.showModal?.();
    if (!decision && d.open) d.close();
  }, [decision]);

  function open(next: Decision) {
    setSubmitError("");
    setReasonError("");
    setDecision(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!decision) return;
    if (decision === "reject" && !reason.trim()) {
      setReasonError("Enter a reason so the Clerk knows what to change.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const { document } = await postJson<{ document: Document }>(`documents/${doc.id}/${decision}`, {
        version: doc.version,
        reason: decision === "reject" ? reason.trim() : undefined,
      });
      const made = decision;
      setDecision(null);
      setReason("");
      onDecided(document, made);
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : new ApiFailure(0, "ERROR", "The decision could not be saved.");
      if (failure.status === 400) setReasonError(failure.message);
      else if ([401, 403, 409].includes(failure.status)) {
        setDecision(null);
        handleError(failure);
        if (failure.status !== 401) onConflict();
      } else setSubmitError(`${failure.message} Your decision has not been recorded.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel decision" aria-labelledby="decision-heading">
      <h2 id="decision-heading">Your decision</h2>
      <p className="muted">
        {finalStage ? "You are the final approver. Approval locks the document." : "Approving sends the document to the Senior Officer."}
      </p>
      <ul className="checklist" id={requirementsId} aria-label="Before you decide">
        <li className={progress.bodyRead ? "done" : ""}>
          <span aria-hidden="true">{progress.bodyRead ? "✓" : "○"}</span>
          {progress.bodyRead ? "Read the document text to the end" : "Scroll to the end of the document text"}
          <span className="visually-hidden">{progress.bodyRead ? " (done)" : " (not done yet)"}</span>
        </li>
        {progress.hasPdf && (
          <li className={progress.pdfRead ? "done" : ""}>
            <span aria-hidden="true">{progress.pdfRead ? "✓" : "○"}</span>
            {progress.pdfRead
              ? "Viewed every page of the PDF"
              : `View every page of the PDF${progress.pdfPages ? ` (${progress.pdfPagesSeen} of ${progress.pdfPages} viewed)` : ""}`}
            <span className="visually-hidden">{progress.pdfRead ? " (done)" : " (not done yet)"}</span>
          </li>
        )}
      </ul>
      <label className={`check ${readingDone ? "" : "is-disabled"}`}>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!readingDone}
          aria-describedby={requirementsId}
          onChange={(e) => setTicked(e.target.checked)}
        />
        I have read the full original document{progress.hasPdf ? " and its PDF" : ""} myself. I am not relying on the AI summary.
      </label>
      <div className="decision-buttons">
        <button type="button" className="button primary" disabled={!confirmed} onClick={() => open("approve")}>
          {finalStage ? "Give final approval…" : "Approve…"}
        </button>
        <button type="button" className="button danger" disabled={!confirmed} onClick={() => open("reject")}>
          Return with reason…
        </button>
      </div>
      {!confirmed && <p className="hint">The buttons unlock once the steps above are done.</p>}

      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="dialog-title"
        onClose={() => setDecision(null)}
        onCancel={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        {decision && (
          <form onSubmit={submit} noValidate>
            <h2 id="dialog-title">
              {decision === "approve" ? (finalStage ? "Give final approval?" : "Approve this document?") : "Return this document to the Clerk?"}
            </h2>
            <p className="dialog-doc">
              <strong>{doc.title}</strong> <span className="muted">({doc.id})</span>
            </p>
            <p>
              {decision === "approve"
                ? finalStage
                  ? "This is final. The document will be locked and can no longer be edited, returned or approved again."
                  : "The document will move to the Senior Officer for final approval. You cannot undo this."
                : "The Clerk will see your reason, make changes and resubmit. Review then starts again with the Officer."}
            </p>
            {decision === "reject" && (
              <div className="field">
                <label htmlFor={reasonId}>Reason for return (required)</label>
                <textarea
                  id={reasonId}
                  rows={4}
                  value={reason}
                  autoFocus
                  aria-invalid={!!reasonError}
                  aria-describedby={reasonError ? `${reasonId}-error` : undefined}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reasonError) setReasonError("");
                  }}
                  placeholder="Explain what needs to change"
                />
                {reasonError && (
                  <p className="field-error" id={`${reasonId}-error`}>
                    {reasonError}
                  </p>
                )}
              </div>
            )}
            {submitError && (
              <p className="alert alert-error" role="alert">
                {submitError}
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="button secondary" autoFocus={decision === "approve"} onClick={() => setDecision(null)} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className={`button ${decision === "approve" ? "primary" : "danger"}`} disabled={submitting}>
                {submitting ? "Saving…" : decision === "approve" ? (finalStage ? "Yes, give final approval" : "Yes, approve") : "Return document"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
