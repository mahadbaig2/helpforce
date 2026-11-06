import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, fileError, users } from "./domain";
import { samplePdf } from "./sample-pdf";
import { FIXTURE_PDFS } from "./seed";
import {
  attachmentFile,
  createDocument,
  decide,
  endSession,
  findDocument,
  listDocuments,
  requireUser,
  resubmitDocument,
  startSession,
  summarise,
  userForSession,
  type Upload,
} from "./store";

// The whole mock API, written against the standard Request/Response so it
// can be tested without Next.js. app/api/[[...path]]/route.ts only delegates.

export const SESSION_COOKIE = "helpforce-session";

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

function errorResponse(error: unknown) {
  const e =
    error instanceof ApiError
      ? error
      : new ApiError(500, "SERVER_ERROR", "Something went wrong on the server. Please try again.");
  if (!(error instanceof ApiError)) console.error(error);
  return json({ code: e.code, message: e.message }, e.status);
}

function cookie(req: Request, name: string) {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Reject cross-site form posts: the session cookie must only be used by this app. */
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new ApiError(403, "FORBIDDEN", "This request came from another site and was blocked.");
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    throw new ApiError(400, "VALIDATION", "The request could not be read.");
  }
}

async function documentFields(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "VALIDATION", "The form could not be read. Please try again.");
  }
  const entry = form.get("file");
  let file: Upload | undefined;
  if (entry instanceof File && entry.size) {
    const problem = fileError(entry);
    if (problem) throw new ApiError(entry.size > 10 * 1024 * 1024 ? 413 : 400, "UPLOAD_FAILED", problem);
    const buffer = Buffer.from(await entry.arrayBuffer());
    if (buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new ApiError(400, "UPLOAD_FAILED", "This file is not a valid PDF. Choose another file.");
    // Repeatable failure for demonstrating that typed text survives an upload error.
    if (entry.name.toLowerCase().includes("fail-upload"))
      throw new ApiError(503, "UPLOAD_FAILED", "The upload service did not respond. Choose the file again and retry.");
    file = { buffer, name: entry.name.replace(/[^\w.\- ]/g, "_") };
  }
  return {
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    type: String(form.get("type") ?? ""),
    version: Number(form.get("version")),
    file,
  };
}

async function attachment(id: string, token?: string) {
  const user = requireUser(token);
  const doc = findDocument(id, user);
  if (!doc.attachment) throw new ApiError(404, "NOT_FOUND", "This document has no attachment.");
  const upload = attachmentFile(doc.id);
  const buffer =
    upload?.buffer ??
    (FIXTURE_PDFS.has(doc.id)
      ? await readFile(join(process.cwd(), "fixtures", "seed-pdfs", `${doc.id}.pdf`))
      : samplePdf(doc));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.attachment.name.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function handle(req: Request, path: string[]): Promise<Response> {
  try {
    const token = cookie(req, SESSION_COOKIE);
    const [resource, id, action] = path;

    if (req.method === "GET") {
      if (resource === "users" && path.length === 1) return json(users);
      if (resource === "session" && path.length === 1) return json({ user: userForSession(token) ?? null });
      if (resource === "documents" && path.length === 1) return json({ documents: listDocuments(requireUser(token)) });
      if (resource === "documents" && path.length === 2) return json({ document: findDocument(id, requireUser(token)) });
      if (resource === "documents" && action === "attachment" && path.length === 3) return attachment(id, token);
      throw new ApiError(404, "NOT_FOUND", "There is no such API endpoint.");
    }

    if (req.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    sameOrigin(req);

    if (resource === "login" && path.length === 1) {
      const { user, token: next } = startSession(String((await readJson(req)).userId ?? ""));
      return json({ user }, 200, {
        "Set-Cookie": `${SESSION_COOKIE}=${next}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      });
    }
    if (resource === "logout" && path.length === 1) {
      endSession(token);
      return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
    }

    const user = requireUser(token);
    if (resource === "documents" && path.length === 1)
      return json({ document: createDocument(user, await documentFields(req)) }, 201);
    if (resource === "documents" && path.length === 3) {
      const doc = findDocument(id, user);
      if (action === "resubmit") return json({ document: resubmitDocument(user, doc, await documentFields(req)) });
      if (action === "approve" || action === "reject") {
        const data = await readJson(req);
        const reason = typeof data.reason === "string" ? data.reason : undefined;
        return json({ document: decide(user, doc, action, Number(data.version), reason) });
      }
      if (action === "summarise") return json(await summarise(user, doc));
    }
    throw new ApiError(404, "NOT_FOUND", "There is no such API endpoint.");
  } catch (error) {
    return errorResponse(error);
  }
}
