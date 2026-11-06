import { describe, expect, it } from "vitest";
import type { Document } from "@/lib/domain";
import { applyQueue, defaultFilters, localDay, paginate, priorityOf, sortDocuments } from "@/lib/queue";

const now = new Date("2026-11-06T12:00:00Z"); // a Friday
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const docs: Pick<Document, "id" | "title" | "type" | "waitingSince">[] = [
  { id: "HF-1", title: "Budget release", type: "Finance", waitingSince: daysAgo(2) },
  { id: "HF-2", title: "Leave procedure", type: "Personnel", waitingSince: daysAgo(9) },
  { id: "HF-3", title: "Annual budget", type: "Finance", waitingSince: daysAgo(20) },
];

describe("approval queue", () => {
  it("groups by working days waiting: up to 5 on time, 6–10 overdue, over 10 critical", () => {
    expect(docs.map((d) => priorityOf(d, now))).toEqual(["recent", "urgent", "critical"]);
  });

  it("sorts longest-waiting first by default and supports title order", () => {
    expect(sortDocuments(docs, "waiting-longest").map((d) => d.id)).toEqual(["HF-3", "HF-2", "HF-1"]);
    expect(sortDocuments(docs, "waiting-shortest").map((d) => d.id)).toEqual(["HF-1", "HF-2", "HF-3"]);
    expect(sortDocuments(docs, "title-asc").map((d) => d.title)).toEqual(["Annual budget", "Budget release", "Leave procedure"]);
  });

  it("filters by title search, type and date reached, and counts each priority", () => {
    const result = applyQueue(docs, { ...defaultFilters, search: "budget", type: "Finance" }, now);
    expect(result.items.map((d) => d.id)).toEqual(["HF-3", "HF-1"]);
    expect(result.counts).toEqual({ all: 2, critical: 1, urgent: 0, recent: 1 });
    const dated = applyQueue(docs, { ...defaultFilters, from: localDay(daysAgo(10)) }, now);
    expect(dated.items.map((d) => d.id)).toEqual(["HF-2", "HF-1"]);
    const critical = applyQueue(docs, { ...defaultFilters, priority: "critical" }, now);
    expect(critical.items.map((d) => d.id)).toEqual(["HF-3"]);
  });

  it("paginates 60+ items and clamps the page", () => {
    const many = Array.from({ length: 64 }, (_, i) => i);
    expect(paginate(many, 1)).toMatchObject({ pages: 5, start: 1, end: 15 });
    expect(paginate(many, 99)).toMatchObject({ page: 5, start: 61, end: 64 });
    expect(paginate([], 1)).toMatchObject({ pages: 1, start: 0, end: 0 });
  });
});
