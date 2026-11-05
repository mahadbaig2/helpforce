export type Role = "clerk" | "officer" | "senior";
export type Status =
  "Pending Officer" | "Pending Senior Officer" | "Returned" | "Approved";
export type DocumentType = "Policy" | "Finance" | "Operations" | "Personnel";
export type Action =
  | "submitted"
  | "resubmitted"
  | "approved"
  | "rejected"
  | "summary requested"
  | "summary failed";
export type User = { id: string; name: string; role: Role };
export type Audit = {
  id: string;
  actor: string;
  action: Action;
  at: string;
  from: Status | null;
  to: Status;
  reason?: string;
};
export type Attachment = { name: string; size: number; mime: string };
export type Document = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  type: DocumentType;
  status: Status;
  createdAt: string;
  updatedAt: string;
  waitingSince: string;
  version: number;
  attachment?: Attachment;
  audit: Audit[];
};
export type SummaryPoint = { text: string; paragraph: number };

export const users: User[] = [
  { id: "clerk-1", name: "Ayesha Khan", role: "clerk" },
  { id: "clerk-2", name: "Bilal Ahmed", role: "clerk" },
  { id: "officer-1", name: "Sara Malik", role: "officer" },
  { id: "senior-1", name: "Omar Farooq", role: "senior" },
];
export const types: DocumentType[] = [
  "Policy",
  "Finance",
  "Operations",
  "Personnel",
];
export const statuses: Status[] = [
  "Pending Officer",
  "Pending Senior Officer",
  "Returned",
  "Approved",
];

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function mayView(user: User, doc: Document) {
  return user.role !== "clerk" || doc.ownerId === user.id;
}

export function visibleDocuments(user: User, documents: Document[]) {
  return documents.filter((doc) => mayView(user, doc));
}

export function needsAction(user: User, doc: Document) {
  return user.role === "clerk"
    ? doc.ownerId === user.id && doc.status === "Returned"
    : doc.status ===
        (user.role === "officer"
          ? "Pending Officer"
          : "Pending Senior Officer");
}

export function handledBy(user: User, doc: Document) {
  return (
    user.role !== "clerk" &&
    doc.audit.some(
      (event) =>
        event.actor === user.name &&
        (event.action === "approved" || event.action === "rejected"),
    )
  );
}

export function transition(
  user: User,
  doc: Document,
  action: "approve" | "reject" | "resubmit",
  reason?: string,
): Status {
  if (action === "resubmit") {
    if (user.role !== "clerk" || doc.ownerId !== user.id)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only the owning Clerk can resubmit this document.",
      );
    if (doc.status !== "Returned")
      throw new ApiError(
        409,
        "CHANGED",
        "This document is no longer returned.",
      );
    return "Pending Officer";
  }
  if (
    (doc.status === "Pending Officer" && user.role !== "officer") ||
    (doc.status === "Pending Senior Officer" && user.role !== "senior")
  ) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role cannot make this decision.",
    );
  }
  if (
    doc.status !== "Pending Officer" &&
    doc.status !== "Pending Senior Officer"
  )
    throw new ApiError(
      409,
      "CHANGED",
      "This document is no longer awaiting approval.",
    );
  if (action === "reject") {
    if (!reason?.trim())
      throw new ApiError(
        400,
        "VALIDATION",
        "Enter a reason for returning the document.",
      );
    return "Returned";
  }
  return doc.status === "Pending Officer"
    ? "Pending Senior Officer"
    : "Approved";
}

export function checkVersion(doc: Document, version: number) {
  if (doc.version !== version)
    throw new ApiError(
      409,
      "CHANGED",
      "This document changed since you opened it. Review the latest version before trying again.",
    );
}

export function validateDocument(title: string, body: string, type: string) {
  if (!title.trim() || title.trim().length > 200)
    throw new ApiError(
      400,
      "VALIDATION",
      "Enter a title of 1 to 200 characters.",
    );
  if (!body.trim())
    throw new ApiError(400, "VALIDATION", "Enter the document body.");
  if (!types.includes(type as DocumentType))
    throw new ApiError(400, "VALIDATION", "Choose a document type.");
}

export function workingDays(since: string, until = new Date()) {
  let count = 0;
  const date = new Date(since);
  date.setUTCHours(0, 0, 0, 0);
  const end = new Date(until);
  end.setUTCHours(0, 0, 0, 0);
  for (
    date.setUTCDate(date.getUTCDate() + 1);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) count++;
  }
  return count;
}

export function summaryPoints(body: string): SummaryPoint[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph, index) => ({
      paragraph: index,
      text: paragraph
        .trim()
        .split(/[.!?](?:\s|$)/)[0]
        .slice(0, 180),
    }))
    .filter((p) => p.text.length > 25)
    .slice(0, 4);
}
