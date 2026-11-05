import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError, users } from "@/lib/domain";
import {
  createDocument,
  decide,
  findDocument,
  listDocuments,
  requireUser,
  store,
  summarise,
  updateDocument,
  userForSession,
} from "@/lib/store";

type Context = { params: Promise<{ path?: string[] }> };
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function errorResponse(error: unknown) {
  const e =
    error instanceof ApiError
      ? error
      : new ApiError(
          500,
          "SERVER_ERROR",
          "Something went wrong. Please try again.",
        );
  return json({ code: e.code, message: e.message }, e.status);
}
function actor(req: NextRequest) {
  return requireUser(req.cookies.get("helpforce-session")?.value);
}
function safeOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin)
    throw new ApiError(403, "FORBIDDEN", "This request was not allowed.");
}
async function fields(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  let buffer: Buffer | undefined;
  let fileName: string | undefined;
  if (file instanceof File && file.size) {
    if (file.size > 10 * 1024 * 1024)
      throw new ApiError(
        400,
        "UPLOAD_FAILED",
        "The PDF must be 10 MB or smaller. Your text has been kept.",
      );
    buffer = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
    if (
      file.type !== "application/pdf" ||
      buffer.subarray(0, 5).toString() !== "%PDF-"
    )
      throw new ApiError(
        400,
        "UPLOAD_FAILED",
        "Choose a valid PDF file. Your text has been kept.",
      );
    if (fileName.toLowerCase().includes("fail-upload"))
      throw new ApiError(
        503,
        "UPLOAD_FAILED",
        "Demo upload failure. Your text has been kept; choose a different file and retry.",
      );
  }
  return {
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    type: String(form.get("type") ?? ""),
    version: Number(form.get("version")),
    file: buffer,
    fileName,
  };
}
function samplePdf() {
  const stream =
    "BT /F1 18 Tf 72 720 Td (Helpforce supporting document) Tj /F1 11 Tf 0 -35 Td (Local sample PDF for review.) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(output);
}
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const path = (await ctx.params).path ?? [];
    if (path[0] === "users" && path.length === 1) return json(users);
    if (path[0] === "session")
      return json({
        user:
          userForSession(req.cookies.get("helpforce-session")?.value) ?? null,
      });
    const user = actor(req);
    if (path[0] === "documents" && path.length === 1)
      return json({ documents: listDocuments(user) });
    if (path[0] === "documents" && path.length === 2)
      return json({ document: findDocument(path[1], user) });
    if (path[0] === "documents" && path[2] === "attachment") {
      const doc = findDocument(path[1], user);
      if (!doc.attachment)
        throw new ApiError(404, "NOT_FOUND", "No attachment is available.");
      const buffer = store.files.get(doc.id) ?? samplePdf();
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${doc.attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    throw new ApiError(404, "NOT_FOUND", "Page not found.");
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    safeOrigin(req);
    const path = (await ctx.params).path ?? [];
    if (path[0] === "login") {
      const { userId } = await req.json();
      const user = users.find((u) => u.id === userId);
      if (!user)
        throw new ApiError(400, "VALIDATION", "Choose a valid account.");
      const token = randomUUID();
      store.sessions.set(token, user.id);
      const response = json({ user });
      response.headers.set(
        "Set-Cookie",
        `helpforce-session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      );
      return response;
    }
    const user = actor(req);
    if (path[0] === "logout") {
      const token = req.cookies.get("helpforce-session")?.value;
      if (token) store.sessions.delete(token);
      const response = json({ ok: true });
      response.headers.set(
        "Set-Cookie",
        "helpforce-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      );
      return response;
    }
    if (path[0] === "documents" && path.length === 1)
      return json({ document: createDocument(user, await fields(req)) }, 201);
    if (path[0] === "documents" && path[2] === "resubmit")
      return json({
        document: updateDocument(
          user,
          findDocument(path[1], user),
          await fields(req),
        ),
      });
    if (
      path[0] === "documents" &&
      (path[2] === "approve" || path[2] === "reject")
    ) {
      const data = await req.json();
      return json({
        document: decide(
          user,
          findDocument(path[1], user),
          path[2],
          Number(data.version),
          data.reason,
        ),
      });
    }
    if (path[0] === "documents" && path[2] === "summarise") {
      const doc = findDocument(path[1], user);
      const points = await summarise(user, doc);
      return json({ points, version: doc.version });
    }
    throw new ApiError(404, "NOT_FOUND", "Page not found.");
  } catch (error) {
    return errorResponse(error);
  }
}
