import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "@/lib/api-handler";
import { resetStore, store, summaryConfig } from "@/lib/store";

const ORIGIN = "http://localhost:3000";

async function call(method: string, path: string, opts: { cookie?: string; json?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) body = opts.form;
  const res = await handle(new Request(`${ORIGIN}/api/${path}`, { method, headers, body }), path.split("/"));
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, data: type.includes("json") ? await res.json() : null, res };
}

async function login(userId: string) {
  const { res } = await call("POST", "login", { json: { userId } });
  return res.headers.get("set-cookie")!.split(";")[0];
}

const pdf = (name: string, size?: number) =>
  new File([size ? new Uint8Array(size) : "%PDF-1.4\n%%EOF"], name, { type: "application/pdf" });

function form(fields: Record<string, string>, file?: File) {
  const data = new FormData();
  Object.entries(fields).forEach(([k, v]) => data.set(k, v));
  if (file) data.set("file", file);
  return data;
}

const firstWith = (status: string, ownerId?: string) =>
  store().documents.find((d) => d.status === status && (!ownerId || d.ownerId === ownerId))!;

beforeEach(() => {
  resetStore();
  summaryConfig.delayMs = () => 0;
  summaryConfig.fails = (n) => n % 5 === 0;
});

describe("mock API enforcement", () => {
  it("returns 401 without a session", async () => {
    expect((await call("GET", "documents")).status).toBe(401);
    expect((await call("POST", `documents/${firstWith("Pending Officer").id}/approve`, { json: { version: 1 } })).status).toBe(401);
  });

  it("returns 403 when a Clerk opens another Clerk's document or tries to approve", async () => {
    const cookie = await login("clerk-1");
    const other = firstWith("Pending Officer", "clerk-2");
    expect((await call("GET", `documents/${other.id}`, { cookie })).status).toBe(403);
    const own = firstWith("Pending Officer", "clerk-1");
    const res = await call("POST", `documents/${own.id}/approve`, { cookie, json: { version: own.version } });
    expect(res.status).toBe(403);
    expect(own.status).toBe("Pending Officer");
  });

  it("returns 403 when an Officer tries the Senior Officer's stage", async () => {
    const cookie = await login("officer-1");
    const doc = firstWith("Pending Senior Officer");
    expect((await call("POST", `documents/${doc.id}/approve`, { cookie, json: { version: doc.version } })).status).toBe(403);
  });

  it("returns 409 when someone else decided first, and leaves the document correct", async () => {
    const cookie = await login("officer-1");
    const doc = firstWith("Pending Officer");
    const opened = doc.version;
    const first = await call("POST", `documents/${doc.id}/approve`, { cookie, json: { version: opened } });
    expect(first.status).toBe(200);
    expect(first.data.document.status).toBe("Pending Senior Officer");
    const stale = await call("POST", `documents/${doc.id}/reject`, { cookie, json: { version: opened, reason: "late" } });
    expect(stale.status).toBe(409);
    expect(doc.status).toBe("Pending Senior Officer");
    expect(doc.audit.filter((e) => e.action === "rejected" && e.reason === "late")).toHaveLength(0);
  });

  it("locks approved documents against any change", async () => {
    const senior = await login("senior-1");
    const approved = firstWith("Approved");
    expect((await call("POST", `documents/${approved.id}/reject`, { cookie: senior, json: { version: approved.version, reason: "x" } })).status).toBe(409);
    const owner = await login(approved.ownerId);
    const res = await call("POST", `documents/${approved.id}/resubmit`, {
      cookie: owner,
      form: form({ title: "New", body: "New", type: "Policy", version: String(approved.version) }),
    });
    expect(res.status).toBe(409);
  });

  it("requires a reason to reject and records who did what in the audit", async () => {
    const cookie = await login("officer-1");
    const doc = firstWith("Pending Officer");
    expect((await call("POST", `documents/${doc.id}/reject`, { cookie, json: { version: doc.version, reason: " " } })).status).toBe(400);
    const res = await call("POST", `documents/${doc.id}/reject`, { cookie, json: { version: doc.version, reason: "Add costs" } });
    expect(res.status).toBe(200);
    expect(res.data.document.audit.at(-1)).toMatchObject({
      actorId: "officer-1",
      actorRole: "officer",
      action: "rejected",
      from: "Pending Officer",
      to: "Returned",
      reason: "Add costs",
    });
  });

  it("lets the owning Clerk resubmit a returned document, which restarts at the Officer", async () => {
    const doc = firstWith("Returned", "clerk-1");
    const cookie = await login("clerk-1");
    const res = await call("POST", `documents/${doc.id}/resubmit`, {
      cookie,
      form: form({ title: "Revised", body: "Revised body", type: "Finance", version: String(doc.version) }),
    });
    expect(res.status).toBe(200);
    expect(res.data.document).toMatchObject({ status: "Pending Officer", title: "Revised" });
    const otherClerk = await login("clerk-2");
    expect((await call("POST", `documents/${doc.id}/resubmit`, { cookie: otherClerk, form: form({}) })).status).toBe(403);
  });
});

describe("uploads", () => {
  it("creates a document with a PDF and rejects bad or oversized files without creating anything", async () => {
    const cookie = await login("clerk-1");
    const before = store().documents.length;
    const fields = { title: "Laptop request", body: "Four laptops", type: "Operations" };
    expect((await call("POST", "documents", { cookie, form: form(fields, new File(["hello"], "notes.txt", { type: "text/plain" })) })).status).toBe(400);
    expect((await call("POST", "documents", { cookie, form: form(fields, pdf("big.pdf", 10 * 1024 * 1024 + 1)) })).status).toBe(413);
    const failed = await call("POST", "documents", { cookie, form: form(fields, pdf("fail-upload.pdf")) });
    expect(failed.status).toBe(503);
    expect(failed.data.code).toBe("UPLOAD_FAILED");
    expect(store().documents.length).toBe(before);

    const ok = await call("POST", "documents", { cookie, form: form(fields, pdf("quote.pdf")) });
    expect(ok.status).toBe(201);
    expect(ok.data.document).toMatchObject({ status: "Pending Officer", attachment: { name: "quote.pdf" } });
    const file = await call("GET", `documents/${ok.data.document.id}/attachment`, { cookie });
    expect(file.res.headers.get("content-type")).toBe("application/pdf");
  });

  it("validates the title length on the server too", async () => {
    const cookie = await login("clerk-1");
    const res = await call("POST", "documents", { cookie, form: form({ title: "a".repeat(201), body: "b", type: "Policy" }) });
    expect(res.status).toBe(400);
  });
});

describe("AI summary endpoint", () => {
  it("is for approvers only and records every request, success and failure in the audit", async () => {
    const clerk = await login("clerk-1");
    const own = firstWith("Pending Officer", "clerk-1");
    expect((await call("POST", `documents/${own.id}/summarise`, { cookie: clerk })).status).toBe(403);

    const cookie = await login("officer-1");
    const doc = firstWith("Pending Officer");
    const version = doc.version;
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await call("POST", `documents/${doc.id}/summarise`, { cookie }));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 503]);
    expect(results[0].data.points[0]).toMatchObject({ paragraph: expect.any(Number), text: expect.any(String) });
    const actions = doc.audit.map((e) => e.action).filter((a) => a.startsWith("summary"));
    expect(actions.filter((a) => a === "summary requested")).toHaveLength(5);
    expect(actions.filter((a) => a === "summary generated")).toHaveLength(4);
    expect(actions.filter((a) => a === "summary failed")).toHaveLength(1);
    // A summary is not a change to the document.
    expect(doc.version).toBe(version);
  });
});

describe("request safety", () => {
  it("blocks cross-site posts", async () => {
    const res = await handle(
      new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }),
      ["login"],
    );
    expect(res.status).toBe(403);
  });
});
