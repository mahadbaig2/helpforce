"use client";

import Link from "next/link";
import { canEdit, latestRejection, needsAction, rejectionCount, type Document } from "@/lib/domain";
import { useApp } from "./app-provider";
import { StatusBadge, WaitingTime } from "./badges";

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Accessible table used by the approval queue and the document registers. */
export default function DocumentTable({ docs, caption, showStatus = true }: { docs: Document[]; caption: string; showStatus?: boolean }) {
  const { user, ownerName } = useApp();
  return (
    <div className="table-wrap">
      <table className="doc-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Type</th>
            {showStatus && <th scope="col">Status</th>}
            <th scope="col">In this stage since</th>
            <th scope="col">Waiting</th>
            <th scope="col">
              <span className="visually-hidden">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const rejection = d.status === "Returned" ? latestRejection(d) : undefined;
            const returns = rejectionCount(d);
            const editable = canEdit(user, d);
            const actionable = needsAction(user, d);
            return (
              <tr key={d.id} className={actionable ? "row-actionable" : undefined}>
                <th scope="row" className="doc-cell">
                  <Link href={`/documents/${d.id}`} className="doc-title">
                    {d.title}
                  </Link>
                  <span className="doc-meta">
                    {d.id} · {ownerName(d.ownerId)}
                    {d.attachment ? " · PDF attached" : ""}
                    {returns > 0 ? ` · Returned ${returns === 1 ? "once" : `${returns} times`} so far` : ""}
                  </span>
                  {rejection?.reason && (
                    <span className="doc-reason">
                      <strong>Latest reason for return:</strong> “{rejection.reason}” — {rejection.actor}
                    </span>
                  )}
                </th>
                <td>{d.type}</td>
                {showStatus && (
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                )}
                <td>
                  <time dateTime={d.waitingSince}>{shortDate(d.waitingSince)}</time>
                </td>
                <td>
                  <WaitingTime doc={d} />
                </td>
                <td className="action-cell">
                  {editable ? (
                    <Link className="button small primary" href={`/documents/${d.id}/edit`} aria-label={`Edit and resubmit ${d.title}`}>
                      Edit &amp; resubmit
                    </Link>
                  ) : (
                    <Link
                      className={`button small ${actionable ? "primary" : "secondary"}`}
                      href={`/documents/${d.id}`}
                      aria-label={`${actionable ? "Review" : "View"} ${d.title}`}
                    >
                      {actionable ? "Review" : "View"}
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
