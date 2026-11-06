import { randomUUID } from "node:crypto";
import {
  ApiError,
  checkVersion,
  mayView,
  summaryPoints,
  transition,
  users,
  validateDocument,
  visibleDocuments,
  type Action,
  type Document,
  type DocumentType,
  type Status,
  type User,
} from "./domain";
import { seedDocuments } from "./seed";

export type Upload = { buffer: Buffer; name: string };
type Store = {
  documents: Document[];
  files: Map<string, Upload>;
  sessions: Map<string, string>;
  summaryCount: number;
};

/** Timing of the mock summariser. Tests shorten the delay. */
export const summaryConfig = {
  /** 2–4 seconds, cycling so the slow case is easy to see. */
  delayMs: (request: number) => 2000 + (request % 3) * 1000,
  /** Every fifth request fails (20%), deterministic so it can be demonstrated. */
  fails: (request: number) => request % 5 === 0,
};

const fresh = (): Store => ({
  documents: seedDocuments(),
  files: new Map(),
  sessions: new Map(),
  summaryCount: 0,
});

// Kept on globalThis so hot reloads in development do not wipe sessions.
const holder = globalThis as typeof globalThis & { helpforceStore?: Store };
export const store = (): Store => (holder.helpforceStore ??= fresh());
export function resetStore() {
  holder.helpforceStore = fresh();
}

export function startSession(userId: string) {
  const user = users.find((u) => u.id === userId);
  if (!user) throw new ApiError(400, "VALIDATION", "Choose one of the listed accounts.");
  const token = randomUUID();
  store().sessions.set(token, user.id);
  return { user, token };
}
export const endSession = (token?: string) => token && store().sessions.delete(token);

export function userForSession(token?: string) {
  const id = store().sessions.get(token ?? "");
  return users.find((u) => u.id === id);
}
export function requireUser(token?: string): User {
  const user = userForSession(token);
  if (!user)
    throw new ApiError(401, "UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  return user;
}
export function findDocument(id: string, user: User) {
  const doc = store().documents.find((d) => d.id === id);
  if (!doc) throw new ApiError(404, "NOT_FOUND", "This document does not exist.");
  if (!mayView(user, doc))
    throw new ApiError(403, "FORBIDDEN", "You do not have access to this document. Clerks can only open their own documents.");
  return doc;
}
export const listDocuments = (user: User) => visibleDocuments(user, store().documents);
export const attachmentFile = (id: string) => store().files.get(id);

function record(doc: Document, user: User, action: Action, from: Status | null, reason?: string) {
  const now = new Date().toISOString();
  doc.audit.push({
    id: randomUUID(),
    actorId: user.id,
    actor: user.name,
    actorRole: user.role,
    action,
    at: now,
    from,
    to: doc.status,
    ...(reason ? { reason } : {}),
  });
  // Summary activity is recorded but is not a change to the document.
  if (!action.startsWith("summary")) {
    doc.updatedAt = now;
    doc.version++;
  }
}

type DocumentInput = { title: string; body: string; type: string; file?: Upload };

function attach(doc: Document, file?: Upload) {
  if (!file) return;
  doc.attachment = { name: file.name, size: file.buffer.length, mime: "application/pdf" };
  store().files.set(doc.id, file);
}

export function createDocument(user: User, data: DocumentInput) {
  if (user.role !== "clerk") throw new ApiError(403, "FORBIDDEN", "Only Clerks can create documents.");
  validateDocument(data.title, data.body, data.type);
  const now = new Date().toISOString();
  const doc: Document = {
    id: `HF-${randomUUID().slice(0, 6).toUpperCase()}`,
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
  attach(doc, data.file);
  record(doc, user, "submitted", null);
  store().documents.unshift(doc);
  return doc;
}

export function resubmitDocument(user: User, doc: Document, data: DocumentInput & { version: number }) {
  const next = transition(user, doc, "resubmit");
  checkVersion(doc, data.version);
  validateDocument(data.title, data.body, data.type);
  const from = doc.status;
  doc.title = data.title.trim();
  doc.body = data.body.trim();
  doc.type = data.type as DocumentType;
  doc.status = next;
  doc.waitingSince = new Date().toISOString();
  attach(doc, data.file);
  record(doc, user, "resubmitted", from);
  return doc;
}

export function decide(user: User, doc: Document, action: "approve" | "reject", version: number, reason?: string) {
  checkVersion(doc, version);
  const next = transition(user, doc, action, reason);
  const from = doc.status;
  doc.status = next;
  doc.waitingSince = new Date().toISOString();
  record(doc, user, action === "approve" ? "approved" : "rejected", from, reason?.trim() || undefined);
  return doc;
}

export async function summarise(user: User, doc: Document) {
  if (user.role === "clerk")
    throw new ApiError(403, "FORBIDDEN", "AI summaries are available to Officers and Senior Officers only.");
  const request = ++store().summaryCount;
  // Summarise the text as it was when asked, even if it changes meanwhile.
  const { version, body } = doc;
  record(doc, user, "summary requested", doc.status);
  await new Promise((resolve) => setTimeout(resolve, summaryConfig.delayMs(request)));
  if (summaryConfig.fails(request)) {
    record(doc, user, "summary failed", doc.status);
    throw new ApiError(503, "SUMMARY_FAILED", "The summary service did not respond. You can try again, or carry on reading the document.");
  }
  record(doc, user, "summary generated", doc.status);
  return { points: summaryPoints(body), version };
}
