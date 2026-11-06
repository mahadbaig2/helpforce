"use client";

import { useState } from "react";
import { describeEvent, elapsed, isAiEvent, rejectionCount, type Audit, type Document } from "@/lib/domain";
import { AiBadge } from "./badges";
import { dateTime, shortDate } from "./document-table";

const marker: Record<Audit["action"], { label: string; tone: string }> = {
  submitted: { label: "Submitted", tone: "neutral" },
  resubmitted: { label: "Resubmitted", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Returned", tone: "warning" },
  "summary requested": { label: "AI summary asked for", tone: "ai" },
  "summary generated": { label: "AI summary shown", tone: "ai" },
  "summary failed": { label: "AI summary failed", tone: "ai" },
};

/**
 * Document history written for a non-technical reader: one plain sentence per
 * step, who did it and in what role, when, how long after the previous step,
 * the status change and any reason given.
 */
export default function AuditTimeline({ doc }: { doc: Document }) {
  const [newestFirst, setNewestFirst] = useState(false);
  const [showAi, setShowAi] = useState(true);
  const aiCount = doc.audit.filter(isAiEvent).length;
  const chronological = doc.audit.map((event, index) => ({ event, previous: doc.audit[index - 1] }));
  const visible = chronological.filter(({ event }) => showAi || !isAiEvent(event));
  const ordered = newestFirst ? [...visible].reverse() : visible;
  const first = doc.audit[0];
  const last = doc.audit[doc.audit.length - 1];
  const returns = rejectionCount(doc);

  return (
    <section className="panel audit" aria-labelledby="history-heading">
      <div className="panel-head">
        <div>
          <h2 id="history-heading">Document history</h2>
          <p className="muted">
            Submitted {first ? shortDate(first.at) : "—"} · {returns === 0 ? "never returned" : `returned ${returns === 1 ? "once" : `${returns} times`}`}
            {first && last ? ` · ${elapsed(first.at, doc.status === "Approved" ? last.at : new Date().toISOString())} ${doc.status === "Approved" ? "from submission to final approval" : "since submission"}` : ""}
          </p>
        </div>
        <div className="audit-controls">
          <button type="button" className="button ghost small" onClick={() => setNewestFirst((v) => !v)}>
            {newestFirst ? "Show oldest first" : "Show newest first"}
          </button>
          {aiCount > 0 && (
            <label className="check small">
              <input type="checkbox" checked={showAi} onChange={(e) => setShowAi(e.target.checked)} />
              Show AI summary activity ({aiCount})
            </label>
          )}
        </div>
      </div>
      <ol className="timeline" aria-label={`History, ${newestFirst ? "newest" : "oldest"} first`}>
        {ordered.map(({ event, previous }) => {
          const kind = marker[event.action];
          const statusChanged = event.from !== event.to;
          return (
            <li key={event.id} className={`timeline-item tone-${kind.tone}`}>
              <span className="timeline-dot" aria-hidden="true" />
              <div className="timeline-body">
                <p className="timeline-heading">
                  <span className={`event-label tone-${kind.tone}`}>{kind.label}</span>
                  {isAiEvent(event) && <AiBadge />}
                  <time dateTime={event.at}>{dateTime(event.at)}</time>
                  {previous && <span className="muted">· {elapsed(previous.at, event.at)} after the previous step</span>}
                </p>
                <p className="timeline-sentence">{describeEvent(event)}</p>
                <p className="timeline-status">
                  {statusChanged ? (
                    <>
                      Status: {event.from ? <span>{event.from}</span> : "new document"} <span aria-hidden="true">→</span>
                      <span className="visually-hidden">changed to</span> <strong>{event.to}</strong>
                    </>
                  ) : (
                    <>Status unchanged: {event.to}</>
                  )}
                </p>
                {event.reason && (
                  <blockquote className="timeline-reason">
                    <span>Reason given:</span> “{event.reason}”
                  </blockquote>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
