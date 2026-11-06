"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  canDecide,
  canEdit,
  latestRejection,
  needsAction,
  paragraphs,
  roleLabel,
  statusDescription,
  type Document,
} from "@/lib/domain";
import { api, ApiFailure } from "@/lib/client/api";
import { applyQueue } from "@/lib/queue";
import PdfPreview from "./pdf-preview";
import { useApp } from "./app-provider";
import AuditTimeline from "./audit-timeline";
import { LockIcon, StatusBadge, WaitingTime } from "./badges";
import DecisionPanel, { type ReadingProgress } from "./decision-panel";
import { shortDate } from "./document-table";
import PageHeader from "./page-header";
import { ErrorState, LoadingState } from "./states";
import SummaryPanel from "./summary-panel";

type Reading = { version: number; bodyRead: boolean; pdfSeen: number[]; pdfTotal: number | null; pdfExternal: boolean };
const freshReading = (version: number): Reading => ({ version, bodyRead: false, pdfSeen: [], pdfTotal: null, pdfExternal: false });

type Load = { phase: "loading" } | { phase: "error"; failure: ApiFailure } | { phase: "ready"; doc: Document };

const stages = ["Submitted", "Officer review", "Senior Officer review", "Approved"];

function stageIndex(doc: Document) {
  if (doc.status === "Pending Officer") return 1;
  if (doc.status === "Pending Senior Officer") return 2;
  if (doc.status === "Approved") return 4;
  return latestRejection(doc)?.from === "Pending Senior Officer" ? 2 : 1;
}

function Progress({ doc }: { doc: Document }) {
  const position = stageIndex(doc);
  const returned = doc.status === "Returned";
  return (
    <ol className="stepper" aria-label="Approval progress">
      {stages.map((stage, i) => {
        const done = i < position || doc.status === "Approved";
        const current = i === position && !returned && doc.status !== "Approved";
        const stopped = returned && i === position;
        return (
          <li key={stage} className={done ? "done" : current ? "current" : stopped ? "stopped" : ""} aria-current={current ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">
              {done ? "✓" : stopped ? "!" : i + 1}
            </span>
            <span>
              {stage}
              <span className="visually-hidden">{done ? " (complete)" : current ? " (current)" : stopped ? " (returned here)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function DocumentView({ id }: { id: string }) {
  const { user, documents, filters, refreshDocuments, handleError, notify, ownerName } = useApp();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [outcome, setOutcome] = useState<{ text: string; nextId?: string } | null>(null);
  const [cited, setCited] = useState<number | null>(null);
  // Reading progress is tied to one version of the document; a newer version starts again.
  const [reading, setReading] = useState<Reading>(freshReading(-1));
  const endOfBody = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);

  /** Loads the latest copy. The first render already shows "loading". */
  const fetchDoc = useCallback(
    () =>
      api<{ document: Document }>(`documents/${id}`).then(
        ({ document }) => setLoad({ phase: "ready", doc: document }),
        (error) => {
          const failure = error instanceof ApiFailure ? error : new ApiFailure(0, "ERROR", "The document could not be loaded.");
          if (failure.status === 401) handleError(failure);
          setLoad({ phase: "error", failure });
        },
      ),
    [id, handleError],
  );

  useEffect(() => {
    void fetchDoc();
  }, [fetchDoc]);

  const version = load.phase === "ready" ? load.doc.version : -1;
  const read = reading.version === version ? reading : freshReading(version);
  const updateReading = useCallback(
    (change: (r: Reading) => Reading) => setReading((r) => change(r.version === version ? r : freshReading(version))),
    [version],
  );
  const bodyRead = read.bodyRead;

  // Mark the body as read once its last line has been on screen.
  useEffect(() => {
    const end = endOfBody.current;
    if (!end || bodyRead || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) updateReading((r) => ({ ...r, bodyRead: true }));
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [version, bodyRead, updateReading]);

  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  useEffect(() => {
    if (cited === null) return;
    const timer = setTimeout(() => setCited(null), 4000);
    return () => clearTimeout(timer);
  }, [cited]);

  const onPageSeen = useCallback(
    (page: number, total: number) =>
      updateReading((r) => (r.pdfSeen.includes(page) && r.pdfTotal === total ? r : { ...r, pdfTotal: total, pdfSeen: [...r.pdfSeen, page] })),
    [updateReading],
  );

  if (load.phase === "loading") return <LoadingState label="Loading document" />;
  if (load.phase === "error") {
    const { failure } = load;
    const title =
      failure.status === 403 ? "You do not have access to this document" : failure.status === 404 ? "Document not found" : "The document could not be loaded";
    return (
      <>
        <PageHeader title={title} />
        <ErrorState
          title={title}
          message={failure.message}
          onRetry={
            failure.status === 403 || failure.status === 404
              ? undefined
              : () => {
                  setLoad({ phase: "loading" });
                  void fetchDoc();
                }
          }
          backHref="/documents"
          backLabel={user.role === "clerk" ? "Go to my documents" : "Go to all documents"}
        />
      </>
    );
  }

  const current = load.doc;
  const parts = paragraphs(current.body);
  const deciding = canDecide(user, current);
  const editable = canEdit(user, current);
  const rejection = latestRejection(current);
  const progress: ReadingProgress = {
    // Without IntersectionObserver (very old browsers) reading cannot be tracked, so it is not required.
    bodyRead: bodyRead || typeof IntersectionObserver === "undefined",
    hasPdf: !!current.attachment,
    pdfPagesSeen: read.pdfSeen.length,
    pdfPages: read.pdfTotal,
    pdfRead: read.pdfExternal || (read.pdfTotal !== null && read.pdfSeen.length >= read.pdfTotal),
  };
  const headingOf = (index: number) => {
    for (let i = index - 1; i >= 0; i--) if (parts[i].length <= 60 && !/[.!?:]$/.test(parts[i])) return parts[i];
    return undefined;
  };

  function cite(index: number) {
    setCited(index);
    const target = document.getElementById(`para-${index}`);
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }

  function decided(updated: Document, decision: "approve" | "reject") {
    setLoad({ phase: "ready", doc: updated });
    void refreshDocuments();
    const next = applyQueue(
      documents.filter((d) => d.id !== updated.id && needsAction(user, d)),
      { ...filters, priority: "all" },
    ).items[0];
    setOutcome({
      text:
        decision === "reject"
          ? `Returned to ${ownerName(updated.ownerId)} with your reason.`
          : updated.status === "Approved"
            ? "Final approval recorded. The document is now locked."
            : "Approved and sent to the Senior Officer.",
      nextId: next?.id,
    });
    notify({ tone: "success", text: `Decision recorded for ${updated.id}.` });
  }

  return (
    <>
      <Link className="back-link" href={needsAction(user, current) || deciding ? "/reviews" : "/documents"}>
        ← Back to {needsAction(user, current) || deciding ? (user.role === "clerk" ? "documents needing changes" : "approval queue") : "documents"}
      </Link>
      <PageHeader eyebrow={`${current.type} · ${current.id}`} title={current.title}>
        <div className="doc-facts">
          <StatusBadge status={current.status} />
          <span>{statusDescription[current.status]}</span>
          <span>Created by {ownerName(current.ownerId)}</span>
          <span>Submitted {shortDate(current.createdAt)}</span>
          {current.status !== "Approved" && <WaitingTime doc={current} />}
        </div>
      </PageHeader>
      <Progress doc={current} />

      {current.status === "Approved" && (
        <p className="banner banner-locked">
          <LockIcon /> <strong>Final approval complete.</strong> This document is locked: it cannot be edited, returned or approved again.
        </p>
      )}
      {current.status === "Returned" && rejection && (
        <div className="banner banner-returned">
          <p>
            <strong>
              Returned by {rejection.actor} ({roleLabel(rejection.actorRole)}) on {shortDate(rejection.at)}.
            </strong>{" "}
            Reason: “{rejection.reason}”
          </p>
          {editable && (
            <Link className="button primary small" href={`/documents/${current.id}/edit`}>
              Edit and resubmit
            </Link>
          )}
        </div>
      )}

      <div className="doc-layout">
        <article className="paper" aria-labelledby="paper-heading">
          <header className="paper-head">
            <h2 id="paper-heading">Official document</h2>
            <span className="muted">Version {current.version}</span>
          </header>
          {current.attachment && (
            <section aria-label="PDF attachment" className="paper-attachment">
              <h3>Attachment: {current.attachment.name}</h3>
              <PdfPreview
                key={`${current.id}-${current.version}`}
                url={`/api/documents/${current.id}/attachment`}
                name={current.attachment.name}
                onPageSeen={onPageSeen}
                onUnavailable={() => updateReading((r) => ({ ...r, pdfExternal: true }))}
              />
            </section>
          )}
          <section aria-label="Document text" className="paper-body">
            <h3 className={current.attachment ? undefined : "visually-hidden"}>Document text</h3>
            {parts.map((text, i) =>
              text.length <= 60 && !/[.!?:]$/.test(text) ? (
                <h4 key={i} id={`para-${i}`} tabIndex={-1} className={cited === i ? "cited" : undefined}>
                  {text}
                </h4>
              ) : (
                <p key={i} id={`para-${i}`} tabIndex={-1} className={cited === i ? "cited" : undefined}>
                  {text}
                </p>
              ),
            )}
            <div ref={endOfBody} className="end-of-body">
              End of document text
            </div>
          </section>
        </article>

        <aside className="doc-rail" aria-label="Actions">
          {outcome && (
            <div className="panel outcome" ref={outcomeRef} tabIndex={-1} role="status">
              <h2>Decision recorded</h2>
              <p>{outcome.text}</p>
              {outcome.nextId ? (
                <Link className="button primary" href={`/documents/${outcome.nextId}`}>
                  Review next document
                </Link>
              ) : (
                <p className="muted">Your queue is now empty.</p>
              )}
              <Link className="text-link" href="/reviews">
                Back to approval queue
              </Link>
            </div>
          )}
          {deciding && (
            <DecisionPanel
              key={current.version}
              doc={current}
              progress={progress}
              onDecided={decided}
              onConflict={() => void fetchDoc()}
            />
          )}
          {!deciding && !outcome && user.role !== "clerk" && current.status !== "Approved" && (
            <div className="panel">
              <h2>No decision needed from you</h2>
              <p className="muted">
                This document is at the “{current.status}” stage.{" "}
                {current.status === "Returned" ? "It is with the Clerk for changes." : "Only the person at that stage can decide it."}
              </p>
            </div>
          )}
          {user.role === "clerk" && !editable && current.status !== "Approved" && (
            <div className="panel">
              <h2>With the approvers</h2>
              <p className="muted">You can edit this document only if it is returned to you.</p>
            </div>
          )}
          {user.role !== "clerk" && (
            <SummaryPanel key={current.id} doc={current} paragraphTitle={headingOf} onCite={cite} onActivity={() => void fetchDoc()} />
          )}
        </aside>
      </div>
      <AuditTimeline doc={current} />
    </>
  );
}
