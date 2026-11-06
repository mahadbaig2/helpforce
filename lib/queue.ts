import { workingDays, type Document } from "./domain";

export type SortKey = "waiting-longest" | "waiting-shortest" | "title-asc" | "title-desc";
export type Priority = "all" | "critical" | "urgent" | "recent";

export type QueueFilters = {
  search: string;
  type: string;
  /** Inclusive yyyy-mm-dd bounds on the date the item entered its current stage. */
  from: string;
  to: string;
  sort: SortKey;
  priority: Priority;
};

export const defaultFilters: QueueFilters = {
  search: "",
  type: "all",
  from: "",
  to: "",
  sort: "waiting-longest",
  priority: "all",
};

export const sortLabels: Record<SortKey, string> = {
  "waiting-longest": "Waiting longest first",
  "waiting-shortest": "Waiting shortest first",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
};

export const priorities: { id: Priority; label: string; detail: string }[] = [
  { id: "all", label: "All", detail: "Everything waiting for you" },
  { id: "critical", label: "Critical", detail: "More than 10 working days" },
  { id: "urgent", label: "Overdue", detail: "6–10 working days" },
  { id: "recent", label: "On time", detail: "Up to 5 working days" },
];

export function priorityOf(doc: Pick<Document, "waitingSince">, now = new Date()): Exclude<Priority, "all"> {
  const days = workingDays(doc.waitingSince, now);
  return days > 10 ? "critical" : days > 5 ? "urgent" : "recent";
}

/** Local calendar date (yyyy-mm-dd) so the date filter matches what users see. */
export function localDay(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Search, type and date filters (not priority), used for counts on the pills. */
export function filterDocuments<T extends Pick<Document, "title" | "type" | "waitingSince" | "id">>(
  docs: T[],
  f: Pick<QueueFilters, "search" | "type" | "from" | "to">,
) {
  const term = f.search.trim().toLowerCase();
  return docs.filter((d) => {
    if (term && !d.title.toLowerCase().includes(term) && !d.id.toLowerCase().includes(term)) return false;
    if (f.type !== "all" && d.type !== f.type) return false;
    const day = localDay(d.waitingSince);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
}

export function sortDocuments<T extends Pick<Document, "title" | "waitingSince" | "id">>(docs: T[], sort: SortKey) {
  const byWait = (a: T, b: T) => Date.parse(a.waitingSince) - Date.parse(b.waitingSince);
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title, "en", { numeric: true });
  const compare =
    sort === "waiting-longest"
      ? byWait
      : sort === "waiting-shortest"
        ? (a: T, b: T) => byWait(b, a)
        : sort === "title-asc"
          ? byTitle
          : (a: T, b: T) => byTitle(b, a);
  return [...docs].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id));
}

export function applyQueue<T extends Pick<Document, "title" | "type" | "waitingSince" | "id">>(
  docs: T[],
  f: QueueFilters,
  now = new Date(),
) {
  const filtered = filterDocuments(docs, f);
  const counts = { all: filtered.length, critical: 0, urgent: 0, recent: 0 } as Record<Priority, number>;
  filtered.forEach((d) => counts[priorityOf(d, now)]++);
  const visible = f.priority === "all" ? filtered : filtered.filter((d) => priorityOf(d, now) === f.priority);
  return { items: sortDocuments(visible, f.sort), counts };
}

export const PAGE_SIZE = 15;

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return {
    pageItems: items.slice((current - 1) * size, current * size),
    page: current,
    pages,
    start: items.length ? (current - 1) * size + 1 : 0,
    end: Math.min(current * size, items.length),
  };
}
