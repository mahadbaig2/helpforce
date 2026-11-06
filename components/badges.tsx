import { isOverdue, statusDescription, workingDays, type Document, type Status } from "@/lib/domain";
import { priorityOf } from "@/lib/queue";

const slug = (status: Status) => status.replaceAll(" ", "-").toLowerCase();

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${slug(status)}`} title={statusDescription[status]}>
      {status === "Approved" && <LockIcon />}
      {status}
    </span>
  );
}

/** Waiting time at the current stage, with a text flag (not colour alone) when overdue. */
export function WaitingTime({ doc }: { doc: Pick<Document, "waitingSince" | "status"> }) {
  if (doc.status === "Approved") return <span className="muted">Complete</span>;
  const days = workingDays(doc.waitingSince);
  const level = priorityOf(doc);
  return (
    <span className="waiting">
      <span>
        {days} working {days === 1 ? "day" : "days"}
      </span>
      {isOverdue(doc) && (
        <span className={`flag flag-${level}`}>
          <WarningIcon />
          {level === "critical" ? "Critical: over 10 days" : "Overdue: over 5 days"}
        </span>
      )}
    </span>
  );
}

export function LockIcon() {
  return (
    <svg className="icon" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function WarningIcon() {
  return (
    <svg className="icon" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 2 1.5 13.5h13z" />
      <path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
    </svg>
  );
}

export function AiBadge() {
  return (
    <span className="ai-badge">
      <svg className="icon" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" />
      </svg>
      AI-generated
    </span>
  );
}
