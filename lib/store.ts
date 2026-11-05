import { randomUUID } from "node:crypto";
import {
  ApiError,
  checkVersion,
  mayView,
  statuses,
  summaryPoints,
  transition,
  types,
  users,
  validateDocument,
  type Action,
  type Document,
  type DocumentType,
  type Status,
  type User,
} from "./domain";

type Store = {
  documents: Document[];
  files: Map<string, Buffer>;
  sessions: Map<string, string>;
  summaryCount: number;
};
const globalStore = globalThis as typeof globalThis & {
  helpforceStore?: Store;
};

function seed(): Store {
  const titles = [
    "Procurement policy update",
    "Quarterly budget release",
    "Regional office equipment",
    "Staff leave procedure",
    "Vendor renewal request",
    "Training programme approval",
    "Records retention schedule",
    "Travel reimbursement policy",
  ];
  const documents: Document[] = Array.from({ length: 68 }, (_, index) => {
    const status = statuses[index % statuses.length];
    const ownerId = Math.floor(index / 4) % 2 ? "clerk-2" : "clerk-1";
    const days = 1 + ((index * 3) % 24);
    const date = new Date(Date.now() - days * 86400000).toISOString();
    const type = types[Math.floor(index / 3) % types.length];
    const title = titles[Math.floor(index / 4) % titles.length];
    const body = `Purpose and background\n\nThis ${type.toLowerCase()} request describes the proposed change for the regional team. It explains why the current process needs review and who will be affected.\n\nProposed action\n\nApprove the revised ${title.toLowerCase()} for the next operating period. The Clerk will coordinate implementation after final approval.\n\nImpact and controls\n\nThe team will record any costs, notify affected colleagues, and review the outcome after thirty days.`;
    const audit: Document["audit"] = [
      {
        id: `seed-${index}-1`,
        actor: users.find((u) => u.id === ownerId)!.name,
        action: "submitted",
        at: date,
        from: null,
        to: "Pending Officer",
      },
    ];
    if (status === "Returned" && index % 8 === 2) {
      audit.push({
        id: `seed-${index}-early-return`,
        actor: "Sara Malik",
        action: "rejected",
        at: new Date(Date.parse(date) + 1200000).toISOString(),
        from: "Pending Officer",
        to: "Returned",
        reason: "Please provide more background.",
      });
      audit.push({
        id: `seed-${index}-retry`,
        actor: users.find((u) => u.id === ownerId)!.name,
        action: "resubmitted",
        at: new Date(Date.parse(date) + 2400000).toISOString(),
        from: "Returned",
        to: "Pending Officer",
      });
    }
    if (status !== "Pending Officer")
      audit.push({
        id: `seed-${index}-2`,
        actor: "Sara Malik",
        action: "approved",
        at: new Date(Date.parse(date) + 3600000).toISOString(),
        from: "Pending Officer",
        to: "Pending Senior Officer",
      });
    if (status === "Returned") {
      audit.push({
        id: `seed-${index}-3`,
        actor: "Omar Farooq",
        action: "rejected",
        at: new Date(Date.parse(date) + 7200000).toISOString(),
        from: "Pending Senior Officer",
        to: "Returned",
        reason: "Please clarify the expected costs and implementation date.",
      });
    }
    if (status === "Approved")
      audit.push({
        id: `seed-${index}-3`,
        actor: "Omar Farooq",
        action: "approved",
        at: new Date(Date.parse(date) + 7200000).toISOString(),
        from: "Pending Senior Officer",
        to: "Approved",
      });
    return {
      id: `HF-${String(index + 101).padStart(4, "0")}`,
      ownerId,
      title: `${title} ${index + 1}`,
      body,
      type,
      status,
      createdAt: date,
      updatedAt: date,
      waitingSince: date,
      version: 1,
      audit,
      ...(index % 5 === 0
        ? {
            attachment: {
              name: "Supporting-document.pdf",
              size: 1200,
              mime: "application/pdf",
            },
          }
        : {}),
    };
  });
  return { documents, files: new Map(), sessions: new Map(), summaryCount: 0 };
}
export const store =
  globalStore.helpforceStore ?? (globalStore.helpforceStore = seed());
export function userForSession(token?: string) {
  return users.find((u) => u.id === store.sessions.get(token ?? ""));
}
export function requireUser(token?: string): User {
  const user = userForSession(token);
  if (!user)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Your session ended. Sign in again.",
    );
  return user;
}
export function findDocument(id: string, user: User) {
  const doc = store.documents.find((d) => d.id === id);
  if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found.");
  if (!mayView(user, doc))
    throw new ApiError(403, "FORBIDDEN", "You cannot view this document.");
  return doc;
}
export function listDocuments(user: User) {
  return store.documents.filter((d) =>
    user.role === "clerk"
      ? d.ownerId === user.id
      : d.status ===
        (user.role === "officer"
          ? "Pending Officer"
          : "Pending Senior Officer"),
  );
}
function record(
  doc: Document,
  user: User,
  action: Action,
  from: Status | null,
  reason?: string,
  bumpVersion = true,
) {
  const now = new Date().toISOString();
  doc.audit.push({
    id: randomUUID(),
    actor: user.name,
    action,
    at: now,
    from,
    to: doc.status,
    ...(reason ? { reason } : {}),
  });
  if (bumpVersion) {
    doc.updatedAt = now;
    doc.version++;
  }
}
export function createDocument(
  user: User,
  data: {
    title: string;
    body: string;
    type: string;
    file?: Buffer;
    fileName?: string;
  },
) {
  if (user.role !== "clerk")
    throw new ApiError(403, "FORBIDDEN", "Only Clerks can create documents.");
  validateDocument(data.title, data.body, data.type);
  const now = new Date().toISOString();
  const id = `HF-${randomUUID().slice(0, 8).toUpperCase()}`;
  const doc: Document = {
    id,
    ownerId: user.id,
    title: data.title.trim(),
    body: data.body.trim(),
    type: data.type as DocumentType,
    status: "Pending Officer",
    createdAt: now,
    updatedAt: now,
    waitingSince: now,
    version: 0,
    audit: [],
  };
  if (data.file) {
    doc.attachment = {
      name: data.fileName || "Attachment.pdf",
      size: data.file.length,
      mime: "application/pdf",
    };
    store.files.set(id, data.file);
  }
  record(doc, user, "submitted", null);
  store.documents.unshift(doc);
  return doc;
}
export function updateDocument(
  user: User,
  doc: Document,
  data: {
    title: string;
    body: string;
    type: string;
    version: number;
    file?: Buffer;
    fileName?: string;
  },
) {
  checkVersion(doc, data.version);
  const next = transition(user, doc, "resubmit");
  validateDocument(data.title, data.body, data.type);
  const from = doc.status;
  doc.title = data.title.trim();
  doc.body = data.body.trim();
  doc.type = data.type as DocumentType;
  doc.status = next;
  doc.waitingSince = new Date().toISOString();
  if (data.file) {
    doc.attachment = {
      name: data.fileName || "Attachment.pdf",
      size: data.file.length,
      mime: "application/pdf",
    };
    store.files.set(doc.id, data.file);
  }
  record(doc, user, "resubmitted", from);
  return doc;
}
export function decide(
  user: User,
  doc: Document,
  action: "approve" | "reject",
  version: number,
  reason?: string,
) {
  checkVersion(doc, version);
  const next = transition(user, doc, action, reason);
  const from = doc.status;
  doc.status = next;
  doc.waitingSince = new Date().toISOString();
  record(
    doc,
    user,
    action === "approve" ? "approved" : "rejected",
    from,
    reason?.trim(),
  );
  return doc;
}
export async function summarise(user: User, doc: Document) {
  if (user.role === "clerk")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Summaries are available to approvers.",
    );
  const requestNumber = ++store.summaryCount;
  record(doc, user, "summary requested", doc.status, undefined, false);
  await new Promise((resolve) =>
    setTimeout(resolve, 2000 + (requestNumber % 3) * 1000),
  );
  if (requestNumber % 5 === 0) {
    record(doc, user, "summary failed", doc.status, undefined, false);
    throw new ApiError(
      503,
      "SUMMARY_FAILED",
      "The summary could not be prepared. You can retry or continue reading the document.",
    );
  }
  return summaryPoints(doc.body);
}
