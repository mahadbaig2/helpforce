import { describe, expect, it } from "vitest";
import { rejectionCount, statuses, workingDays } from "@/lib/domain";
import { seedDocuments } from "@/lib/seed";

const docs = seedDocuments(Date.parse("2026-11-06T12:00:00Z"));
const now = new Date("2026-11-06T12:00:00Z");

describe("seed data", () => {
  it("meets the brief: 60+ documents across every status, PDFs, repeat rejections and long waits", () => {
    expect(docs.length).toBeGreaterThanOrEqual(60);
    for (const status of statuses) expect(docs.some((d) => d.status === status)).toBe(true);
    expect(docs.filter((d) => d.attachment).length).toBeGreaterThan(5);
    expect(docs.filter((d) => rejectionCount(d) > 1).length).toBeGreaterThan(3);
    expect(docs.filter((d) => d.status !== "Approved" && workingDays(d.waitingSince, now) > 10).length).toBeGreaterThan(3);
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });

  it("gives every document a coherent, chronological audit trail", () => {
    for (const d of docs) {
      expect(d.audit[0]).toMatchObject({ action: "submitted", from: null, to: "Pending Officer", actorId: d.ownerId });
      let status = d.audit[0].to;
      for (const event of d.audit.slice(1)) {
        expect(event.from).toBe(status);
        status = event.to;
        if (event.action === "rejected") expect(event.reason).toBeTruthy();
      }
      expect(status).toBe(d.status);
      const times = d.audit.map((e) => Date.parse(e.at));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(d.version).toBe(d.audit.filter((e) => !e.action.startsWith("summary")).length);
    }
  });
});
