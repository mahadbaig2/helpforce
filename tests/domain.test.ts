import { describe, expect, it } from "vitest";
import {
  canDecide,
  canEdit,
  checkVersion,
  describeEvent,
  documentErrors,
  fileError,
  handledBy,
  needsAction,
  summaryPoints,
  transition,
  users,
  visibleDocuments,
  workingDays,
  type Status,
} from "@/lib/domain";

const [clerk, otherClerk, officer, senior] = users;
const doc = (status: Status = "Pending Officer") => ({ ownerId: clerk.id, status, version: 2 });

describe("approval workflow", () => {
  it("moves Officer approval to the Senior Officer and final approval to Approved", () => {
    expect(transition(officer, doc(), "approve")).toBe("Pending Senior Officer");
    expect(transition(senior, doc("Pending Senior Officer"), "approve")).toBe("Approved");
  });

  it("returns a rejected document to its Clerk, who restarts it at the Officer", () => {
    expect(transition(officer, doc(), "reject", "Missing costs")).toBe("Returned");
    expect(transition(senior, doc("Pending Senior Officer"), "reject", "No date")).toBe("Returned");
    expect(transition(clerk, doc("Returned"), "resubmit")).toBe("Pending Officer");
  });

  it("refuses the wrong role with 403", () => {
    expect(() => transition(clerk, doc(), "approve")).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => transition(senior, doc(), "approve")).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => transition(officer, doc("Pending Senior Officer"), "approve")).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => transition(otherClerk, doc("Returned"), "resubmit")).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("treats a decision on an already decided document as a 409 conflict", () => {
    expect(() => transition(senior, doc("Approved"), "approve")).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => transition(officer, doc("Returned"), "reject", "x")).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => transition(clerk, doc("Approved"), "resubmit")).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => checkVersion(doc(), 1)).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => checkVersion(doc(), Number.NaN)).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("requires a non-blank reason to return a document", () => {
    expect(() => transition(officer, doc(), "reject", "   ")).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("only offers decisions and edits to the right person at the right stage", () => {
    expect(canDecide(officer, doc())).toBe(true);
    expect(canDecide(senior, doc())).toBe(false);
    expect(canDecide(officer, doc("Approved"))).toBe(false);
    expect(canEdit(clerk, doc("Returned"))).toBe(true);
    expect(canEdit(otherClerk, doc("Returned"))).toBe(false);
    expect(canEdit(clerk, doc("Approved"))).toBe(false);
  });
});

describe("visibility", () => {
  it("shows Clerks only their own documents and approvers everything", () => {
    const docs = [doc("Returned"), doc("Approved"), { ...doc(), ownerId: otherClerk.id }];
    expect(visibleDocuments(clerk, docs)).toEqual(docs.slice(0, 2));
    expect(visibleDocuments(officer, docs)).toHaveLength(3);
    expect(needsAction(clerk, docs[0])).toBe(true);
    expect(needsAction(officer, docs[2])).toBe(true);
    expect(needsAction(senior, docs[2])).toBe(false);
  });

  it("finds decisions an approver made by user id", () => {
    const decided = { audit: [{ actorId: officer.id, action: "rejected" as const }] };
    const summarised = { audit: [{ actorId: officer.id, action: "summary requested" as const }] };
    expect(handledBy(officer, decided)).toBe(true);
    expect(handledBy(officer, summarised)).toBe(false);
    expect(handledBy(senior, decided)).toBe(false);
  });
});

describe("validation", () => {
  it("validates title length, body and type", () => {
    expect(documentErrors({ title: " ", body: "x", type: "Policy" }).title).toMatch(/Enter a title/);
    expect(documentErrors({ title: "a".repeat(201), body: "x", type: "Policy" }).title).toMatch(/200/);
    expect(documentErrors({ title: "a".repeat(200), body: "x", type: "Policy" })).toEqual({});
    expect(documentErrors({ title: "Ok", body: "  ", type: "Nope" })).toEqual({
      body: expect.any(String),
      type: expect.any(String),
    });
  });

  it("accepts PDFs up to 10 MB only", () => {
    expect(fileError({ name: "a.pdf", type: "application/pdf", size: 10 * 1024 * 1024 })).toBeUndefined();
    expect(fileError({ name: "a.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(fileError({ name: "a.docx", type: "application/msword", size: 10 })).toMatch(/PDF/);
  });
});

describe("waiting time", () => {
  it("counts working days and skips weekends", () => {
    // Friday → Monday is one working day.
    expect(workingDays("2026-11-06T12:00:00Z", new Date("2026-11-09T12:00:00Z"))).toBe(1);
    // Monday → next Monday is five.
    expect(workingDays("2026-11-02T09:00:00Z", new Date("2026-11-09T09:00:00Z"))).toBe(5);
    expect(workingDays("2026-11-09T09:00:00Z", new Date("2026-11-09T17:00:00Z"))).toBe(0);
  });
});

describe("AI summary points", () => {
  it("keeps the source paragraph index and section heading for every point", () => {
    const points = summaryPoints(
      "Purpose\n\nThe office needs four new laptops. Old ones fail.\n\nCost\n\nThe total cost is PKR 840,000 for all four.",
    );
    expect(points).toEqual([
      { paragraph: 1, section: "Purpose", text: "The office needs four new laptops" },
      { paragraph: 3, section: "Cost", text: "The total cost is PKR 840,000 for all four" },
    ]);
  });
});

describe("audit wording", () => {
  it("describes events in plain English with the actor's role", () => {
    const base = { actor: "Sara Malik", actorRole: "officer" as const };
    expect(describeEvent({ ...base, action: "approved", from: "Pending Officer", to: "Pending Senior Officer" })).toBe(
      "Sara Malik (Officer) approved it and passed it to the Senior Officer.",
    );
    expect(
      describeEvent({ actor: "Omar Farooq", actorRole: "senior", action: "approved", from: "Pending Senior Officer", to: "Approved" }),
    ).toMatch(/final approval.*locked/);
    expect(describeEvent({ ...base, action: "summary requested", from: "Pending Officer", to: "Pending Officer" })).toMatch(/AI summary/);
  });
});
