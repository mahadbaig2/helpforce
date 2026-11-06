"use client";

import Link from "next/link";
import { useState } from "react";
import { latestRejection, needsAction, statusDescription, statuses } from "@/lib/domain";
import { filterDocuments, sortDocuments } from "@/lib/queue";
import { useApp } from "./app-provider";
import { WaitingTime } from "./badges";
import PageHeader from "./page-header";
import { ErrorState, LoadingState } from "./states";

const PREVIEW = 4;

export default function PipelineBoard() {
  const { user, documents, documentsStatus, documentsError, refreshDocuments, ownerName } = useApp();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const matching = sortDocuments(filterDocuments(documents, { search, type: "all", from: "", to: "" }), "waiting-longest");

  return (
    <>
      <PageHeader
        eyebrow="Workflow"
        title="Pipeline"
        description={
          user.role === "clerk"
            ? "Where each of your documents is in the approval process."
            : "Where every document is. You can only decide documents at your own stage."
        }
      />
      {documentsStatus === "loading" ? (
        <LoadingState label="Loading pipeline" />
      ) : documentsStatus === "error" ? (
        <ErrorState title="The pipeline could not be loaded" message={documentsError} onRetry={() => void refreshDocuments()} />
      ) : (
        <>
          <label className="field field-inline">
            <span>Search by title or reference</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="board">
            {statuses.map((status) => {
              const lane = matching.filter((d) => d.status === status);
              const open = expanded.includes(status);
              const headingId = `lane-${status.replaceAll(" ", "-")}`;
              return (
                <section className="lane" key={status} aria-labelledby={headingId}>
                  <header className="lane-head">
                    <h2 id={headingId}>{status}</h2>
                    <span className="lane-count">{lane.length}</span>
                    <p className="lane-help">{statusDescription[status]}</p>
                  </header>
                  {lane.length === 0 ? (
                    <p className="muted lane-empty">No documents.</p>
                  ) : (
                    <ul className="lane-list">
                      {lane.slice(0, open ? undefined : PREVIEW).map((d) => {
                        const reason = status === "Returned" ? latestRejection(d)?.reason : undefined;
                        return (
                          <li key={d.id} className="card">
                            <Link href={`/documents/${d.id}`} className="card-title">
                              {d.title}
                            </Link>
                            <span className="item-meta">
                              {d.id} · {d.type} · {ownerName(d.ownerId)}
                            </span>
                            {reason && <span className="doc-reason">Reason: “{reason}”</span>}
                            <WaitingTime doc={d} />
                            {needsAction(user, d) && (
                              <Link
                                className="button small primary"
                                href={user.role === "clerk" ? `/documents/${d.id}/edit` : `/documents/${d.id}`}
                              >
                                {user.role === "clerk" ? "Edit & resubmit" : "Review"}
                                <span className="visually-hidden"> {d.title}</span>
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {lane.length > PREVIEW && (
                    <button
                      type="button"
                      className="button ghost small"
                      aria-expanded={open}
                      onClick={() => setExpanded((v) => (open ? v.filter((s) => s !== status) : [...v, status]))}
                    >
                      {open ? "Show fewer" : `Show all ${lane.length}`}
                      <span className="visually-hidden"> in {status}</span>
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
