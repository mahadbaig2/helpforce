// Unsent Clerk text is copied to this browser as the user types, so nothing
// is lost to a failed upload, an expired session, a refresh or navigation.

export type Draft = { title: string; body: string; type: string; savedAt: string };

const key = (userId: string, docId?: string) => `helpforce-draft:${userId}:${docId ?? "new"}`;

export function loadDraft(userId: string, docId?: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(userId, docId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, docId: string | undefined, draft: Omit<Draft, "savedAt">) {
  try {
    localStorage.setItem(key(userId, docId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(userId: string, docId?: string) {
  try {
    localStorage.removeItem(key(userId, docId));
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
