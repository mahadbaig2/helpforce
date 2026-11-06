"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { handledBy, needsAction, type Document } from "@/lib/domain";
import { applyQueue, paginate } from "@/lib/queue";
import { useApp } from "./app-provider";
import DocumentTable from "./document-table";
import PageHeader from "./page-header";
import Pagination from "./pagination";
import QueueFilterBar from "./queue-filters";
import { EmptyState, ErrorState, LoadingState } from "./states";

type Scope = "queue" | "all" | "decisions";

export default function DocumentList({ scope }: { scope: Scope }) {
  const { user, documents, documentsStatus, documentsError, refreshDocuments, filters, setFilters } = useApp();
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters]);

  const clerk = user.role === "clerk";
  if (scope === "decisions" && clerk)
    return (
      <>
        <PageHeader title="My decisions" />
        <ErrorState
          title="Not available for Clerks"
          message="This screen lists approval decisions, which only Officers and Senior Officers make."
          backHref="/documents"
          backLabel="Go to my documents"
        />
      </>
    );

  const copy = {
    queue: clerk
      ? {
          title: "Needs my changes",
          eyebrow: "Returned to you",
          description: "Documents an approver returned to you. Read the reason, make the changes and resubmit.",
          empty: "Nothing has been returned to you.",
        }
      : {
          title: "Approval queue",
          eyebrow: user.role === "officer" ? "Officer review" : "Senior Officer review",
          description: `Documents waiting for your decision at the “${user.role === "officer" ? "Pending Officer" : "Pending Senior Officer"}” stage. The longest-waiting items are shown first; anything over 5 working days is flagged.`,
          empty: "Your queue is empty. Nothing is waiting for your decision.",
        },
    all: {
      title: clerk ? "My documents" : "All documents",
      eyebrow: "Register",
      description: clerk
        ? "Every document you have created, with its current status and the latest reason for return."
        : "Every document in the system. You can only decide documents at your review stage.",
      empty: clerk ? "You have not created any documents yet." : "There are no documents yet.",
    },
    decisions: {
      title: "My decisions",
      eyebrow: "History",
      description: "Documents you have approved or returned. Open one to follow where it is now.",
      empty: "You have not approved or returned any documents yet.",
    },
  }[scope];

  const base: Document[] = documents.filter((d) =>
    scope === "queue" ? needsAction(user, d) : scope === "decisions" ? handledBy(user, d) : true,
  );
  const { items, counts } = applyQueue(base, filters);
  const view = paginate(items, page);

  return (
    <>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <>
            <button type="button" className="button secondary" onClick={() => void refreshDocuments()}>
              Refresh
            </button>
            {clerk && (
              <Link className="button primary" href="/documents/new">
                Create document
              </Link>
            )}
          </>
        }
      />
      {scope === "queue" && !clerk && (
        <p className="callout">
          Decisions are made one document at a time. There is no bulk approval, because each approval confirms that
          you have read that document and its attachment.
        </p>
      )}
      {documentsStatus === "loading" ? (
        <LoadingState label="Loading documents" />
      ) : documentsStatus === "error" ? (
        <ErrorState title="Documents could not be loaded" message={documentsError} onRetry={() => void refreshDocuments()} />
      ) : base.length === 0 ? (
        <EmptyState title={copy.empty}>
          {clerk && scope !== "decisions" && (
            <Link className="button primary" href="/documents/new">
              Create a document
            </Link>
          )}
        </EmptyState>
      ) : (
        <section className="panel" aria-label={copy.title}>
          <QueueFilterBar filters={filters} onChange={setFilters} counts={counts} />
          {items.length === 0 ? (
            <EmptyState title="No documents match these filters">
              <p>Try a different search, type, date range or waiting-time group.</p>
            </EmptyState>
          ) : (
            <>
              <DocumentTable docs={view.pageItems} caption={copy.title} showStatus={scope !== "queue"} />
              <Pagination {...view} total={items.length} onPage={setPage} />
            </>
          )}
        </section>
      )}
    </>
  );
}
