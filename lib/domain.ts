// Pure business rules shared by the mock API and the UI. Nothing here touches
// the network, storage or React, so every rule can be unit tested directly.

export type Role = "clerk" | "officer" | "senior";
export type Status =
  | "Pending Officer"
  | "Pending Senior Officer"
  | "Returned"
  | "Approved";
export type DocumentType = "Policy" | "Finance" | "Operations" | "Personnel";
export type Action =
  | "submitted"
  | "resubmitted"
  | "approved"
  | "rejected"
  | "summary requested"
  | "summary generated"
  | "summary failed";
export type User = { id: string; name: string; role: Role };
export type Audit = {
  id: string;
  actorId: string;
  actor: string;
  actorRole: Role;
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
  /** When the document entered its current status. */
  waitingSince: string;
  version: number;
  attachment?: Attachment;
  audit: Audit[];
};
export type SummaryPoint = {
  text: string;
  /** Index of the body paragraph the point was taken from. */
  paragraph: number;
  /** Heading of the section the paragraph belongs to, when there is one. */
  section?: string;
};

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

export const MAX_TITLE = 200;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Items waiting longer than this many working days are flagged. */
export const OVERDUE_WORKING_DAYS = 5;

export const roleLabel = (role: Role) =>
  role === "senior" ? "Senior Officer" : role === "officer" ? "Officer" : "Clerk";

export const statusDescription: Record<Status, string> = {
  "Pending Officer": "Waiting for the Officer",
  "Pending Senior Officer": "Waiting for the Senior Officer",
  Returned: "Returned to the Clerk for changes",
  Approved: "Approved and locked",
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Owned = Pick<Document, "ownerId">;
type Staged = Pick<Document, "ownerId" | "status">;

export function mayView(user: User, doc: Owned) {
  return user.role !== "clerk" || doc.ownerId === user.id;
}

export function visibleDocuments<T extends Owned>(user: User, documents: T[]) {
  return documents.filter((doc) => mayView(user, doc));
}

/** The status a role is responsible for deciding, if any. */
export function reviewStage(role: Role): Status | null {
  return role === "officer"
    ? "Pending Officer"
    : role === "senior"
      ? "Pending Senior Officer"
      : null;
}

export function needsAction(user: User, doc: Staged) {
  return user.role === "clerk"
    ? doc.ownerId === user.id && doc.status === "Returned"
    : doc.status === reviewStage(user.role);
}

export function canDecide(user: User, doc: Staged) {
  return user.role !== "clerk" && doc.status === reviewStage(user.role);
}

export function canEdit(user: User, doc: Staged) {
  return (
    user.role === "clerk" &&
    doc.ownerId === user.id &&
    doc.status === "Returned"
  );
}

export function handledBy(
  user: User,
  doc: { audit: Pick<Audit, "actorId" | "action">[] },
) {
  return (
    user.role !== "clerk" &&
    doc.audit.some(
      (event) =>
        event.actorId === user.id &&
        (event.action === "approved" || event.action === "rejected"),
    )
  );
}

export function latestRejection(doc: { audit: Audit[] }) {
  return [...doc.audit].reverse().find((e) => e.action === "rejected");
}

export function rejectionCount(doc: { audit: Pick<Audit, "action">[] }) {
  return doc.audit.filter((e) => e.action === "rejected").length;
}

export function transition(
  user: User,
  doc: Staged,
  action: "approve" | "reject" | "resubmit",
  reason?: string,
): Status {
  if (action === "resubmit") {
    if (user.role !== "clerk" || doc.ownerId !== user.id)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only the Clerk who owns this document can edit and resubmit it.",
      );
    if (doc.status !== "Returned")
      throw new ApiError(
        409,
        "CHANGED",
        `This document is no longer returned for changes. It is now "${doc.status}".`,
      );
    return "Pending Officer";
  }
  if (user.role === "clerk")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Clerks cannot approve or return documents.",
    );
  if (doc.status === "Approved" || doc.status === "Returned")
    throw new ApiError(
      409,
      "CHANGED",
      `This document is no longer awaiting a decision. It is now "${doc.status}".`,
    );
  if (doc.status !== reviewStage(user.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      `Only the ${doc.status === "Pending Officer" ? "Officer" : "Senior Officer"} can decide a document at the "${doc.status}" stage.`,
    );
  if (action === "reject") {
    if (!reason?.trim())
      throw new ApiError(
        400,
        "VALIDATION",
        "Enter a reason so the Clerk knows what to change.",
      );
    return "Returned";
  }
  return doc.status === "Pending Officer" ? "Pending Senior Officer" : "Approved";
}

export function checkVersion(doc: Pick<Document, "version">, version: number) {
  if (!Number.isFinite(version) || doc.version !== version)
    throw new ApiError(
      409,
      "CHANGED",
      "Someone else changed this document while you had it open, so your action was not applied.",
    );
}

export type FieldErrors = Partial<Record<"title" | "body" | "type" | "file", string>>;

/** Validation used by both the form (inline errors) and the API. */
export function documentErrors(input: {
  title: string;
  body: string;
  type: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = "Enter a title.";
  else if (title.length > MAX_TITLE)
    errors.title = `Shorten the title to ${MAX_TITLE} characters or fewer (currently ${title.length}).`;
  if (!input.body.trim()) errors.body = "Enter the document body.";
  if (!types.includes(input.type as DocumentType))
    errors.type = "Choose a document type.";
  return errors;
}

export function fileError(file: { name: string; size: number; type: string }) {
  const looksPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksPdf) return "Choose a PDF file. Other file types are not accepted.";
  if (file.size > MAX_UPLOAD_BYTES)
    return `This PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB. Choose a PDF of 10 MB or less.`;
  return undefined;
}

export function validateDocument(title: string, body: string, type: string) {
  const errors = documentErrors({ title, body, type });
  const first = Object.values(errors)[0];
  if (first) throw new ApiError(400, "VALIDATION", first);
}

/** Whole working days (Mon–Fri) elapsed after `since`, up to `until`. */
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

export const isOverdue = (doc: Pick<Document, "waitingSince">, now = new Date()) =>
  workingDays(doc.waitingSince, now) > OVERDUE_WORKING_DAYS;

export const paragraphs = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

const isHeading = (p: string) => p.length <= 60 && !/[.!?:]$/.test(p);

/**
 * Rule-based stand-in for a language model: take the first sentence of each
 * substantive paragraph and remember which paragraph it came from, so every
 * point can link back to its source.
 */
export function summaryPoints(body: string): SummaryPoint[] {
  let section: string | undefined;
  const points: SummaryPoint[] = [];
  paragraphs(body).forEach((text, index) => {
    if (isHeading(text)) {
      section = text;
      return;
    }
    const sentence = text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, "");
    if (sentence.length < 20) return;
    points.push({
      paragraph: index,
      text: sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence,
      ...(section ? { section } : {}),
    });
  });
  return points.slice(0, 5);
}

/** Plain-English sentence for an audit event, written for a manager. */
export function describeEvent(event: Pick<Audit, "actor" | "actorRole" | "action" | "from" | "to">) {
  const who = `${event.actor} (${roleLabel(event.actorRole)})`;
  switch (event.action) {
    case "submitted":
      return `${who} submitted the document for Officer review.`;
    case "resubmitted":
      return `${who} made the requested changes and resubmitted it. Review starts again with the Officer.`;
    case "approved":
      return event.to === "Approved"
        ? `${who} gave final approval. The document is now locked.`
        : `${who} approved it and passed it to the Senior Officer.`;
    case "rejected":
      return `${who} returned it to the Clerk for changes.`;
    case "summary requested":
      return `${who} asked for an AI summary to help with reading.`;
    case "summary generated":
      return `An AI summary was shown to ${event.actor}. It did not change the document or its status.`;
    case "summary failed":
      return `The AI summary requested by ${event.actor} could not be produced. Nothing changed.`;
  }
}

export const isAiEvent = (event: Pick<Audit, "action">) =>
  event.action.startsWith("summary");

/** Human duration such as "3 days" or "5 hours". */
export function elapsed(fromIso: string, toIso: string) {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
