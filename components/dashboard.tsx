"use client";

import Link from "next/link";
import { isOverdue, latestRejection, needsAction, roleLabel } from "@/lib/domain";
import { sortDocuments } from "@/lib/queue";
import { useApp } from "./app-provider";
import { StatusBadge, WaitingTime } from "./badges";
import { shortDate } from "./document-table";
import PageHeader from "./page-header";
import { ErrorState, LoadingState } from "./states";

export default function Dashboard() {
  const { user, documents, documentsStatus, documentsError, refreshDocuments } = useApp();
  const clerk = user.role === "clerk";
  const actionable = sortDocuments(documents.filter((d) => needsAction(user, d)), "waiting-longest");
  const overdue = actionable.filter((d) => isOverdue(d)).length;
  const recent = [...documents].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const count = (status: string) => documents.filter((d) => d.status === status).length;

  return (
    <>
      <PageHeader
        eyebrow={`${roleLabel(user.role)} workspace`}
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={
          clerk
            ? "Track your documents and fix anything that has been returned to you."
            : "Work through documents waiting for your decision, oldest first."
        }
        actions={
          clerk ? (
            <Link className="button primary" href="/documents/new">
              Create document
            </Link>
          ) : (
            <Link className="button primary" href="/reviews">
              Open approval queue
            </Link>
          )
        }
      />
      {documentsStatus === "loading" ? (
        <LoadingState label="Loading your workspace" />
      ) : documentsStatus === "error" ? (
        <ErrorState title="Your workspace could not be loaded" message={documentsError} onRetry={() => void refreshDocuments()} />
      ) : (
        <>
          <section className="stats" aria-label="Summary">
            <Link href="/reviews" className="stat stat-lead">
              <span className="stat-label">{clerk ? "Returned to you" : "Waiting for you"}</span>
              <strong>{actionable.length}</strong>
              <span className="stat-note">{overdue ? `${overdue} overdue (over 5 working days)` : "None overdue"}</span>
            </Link>
            <div className="stat">
              <span className="stat-label">In review</span>
              <strong>{count("Pending Officer") + count("Pending Senior Officer")}</strong>
              <span className="stat-note">
                {count("Pending Officer")} with Officer · {count("Pending Senior Officer")} with Senior Officer
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Returned</span>
              <strong>{count("Returned")}</strong>
              <span className="stat-note">Waiting for Clerk changes</span>
            </div>
            <div className="stat">
              <span className="stat-label">Approved</span>
              <strong>{count("Approved")}</strong>
              <span className="stat-note">Final and locked</span>
            </div>
          </section>
          <div className="home-grid">
            <section className="panel" aria-labelledby="next-heading">
              <div className="panel-head">
                <h2 id="next-heading">{clerk ? "Returned to you" : "Next in your queue"}</h2>
                <Link href="/reviews" className="text-link">
                  See all {actionable.length}
                </Link>
              </div>
              {actionable.length === 0 ? (
                <p className="muted">{clerk ? "Nothing has been returned to you." : "Nothing is waiting for your decision."}</p>
              ) : (
                <ul className="item-list">
                  {actionable.slice(0, 5).map((d) => {
                    const reason = clerk ? latestRejection(d)?.reason : undefined;
                    return (
                      <li key={d.id}>
                        <Link href={clerk ? `/documents/${d.id}/edit` : `/documents/${d.id}`} className="item-link">
                          <strong>{d.title}</strong>
                          <span className="item-meta">
                            {d.id} · {d.type}
                          </span>
                          {reason && <span className="doc-reason">Reason: “{reason}”</span>}
                        </Link>
                        <WaitingTime doc={d} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="panel" aria-labelledby="recent-heading">
              <div className="panel-head">
                <h2 id="recent-heading">Recently updated</h2>
                <Link href="/documents" className="text-link">
                  {clerk ? "My documents" : "All documents"}
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="muted">No documents yet.</p>
              ) : (
                <ul className="item-list">
                  {recent.map((d) => (
                    <li key={d.id}>
                      <Link href={`/documents/${d.id}`} className="item-link">
                        <strong>{d.title}</strong>
                        <span className="item-meta">Updated {shortDate(d.updatedAt)}</span>
                      </Link>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
