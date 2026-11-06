import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { AppContext, type AppState } from "@/components/app-provider";
import { ApiFailure } from "@/lib/client/api";
import { users, type Document } from "@/lib/domain";
import { defaultFilters } from "@/lib/queue";
import { seedDocuments } from "@/lib/seed";

export const [clerk, otherClerk, officer, senior] = users;

export function appState(overrides: Partial<AppState> = {}): AppState {
  return {
    user: officer,
    accounts: users,
    documents: [],
    documentsStatus: "ready",
    documentsError: "",
    refreshDocuments: vi.fn(async () => {}),
    notices: [],
    notify: vi.fn(),
    dismiss: vi.fn(),
    handleError: vi.fn((e: unknown) => (e instanceof ApiFailure ? e : new ApiFailure(0, "ERROR", String(e)))),
    filters: defaultFilters,
    setFilters: vi.fn(),
    ownerName: (id: string) => users.find((u) => u.id === id)?.name ?? "?",
    signOut: vi.fn(async () => {}),
    ...overrides,
  };
}

export function renderWithApp(ui: ReactNode, overrides: Partial<AppState> = {}) {
  const state = appState(overrides);
  return { state, ...render(<AppContext.Provider value={state}>{ui}</AppContext.Provider>) };
}

export const seeded = (status: Document["status"], ownerId?: string) =>
  structuredClone(seedDocuments().find((d) => d.status === status && (!ownerId || d.ownerId === ownerId))!);

type Reply = { status?: number; body: unknown; delay?: number };
/** Replaces fetch with scripted replies matched by URL substring. */
export function mockFetch(routes: Record<string, Reply | ((init?: RequestInit) => Reply)>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`Unexpected fetch ${url}`);
    const route = routes[key];
    const reply = typeof route === "function" ? route(init) : route;
    if (reply.delay)
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, reply.delay);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}
