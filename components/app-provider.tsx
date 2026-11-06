"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { roleLabel, type Document, type User } from "@/lib/domain";
import { api, ApiFailure, postJson } from "@/lib/client/api";
import { defaultFilters, type QueueFilters } from "@/lib/queue";
import AppShell from "./app-shell";
import LoginScreen from "./login-screen";
import { ErrorState, LoadingState } from "./states";

export type Notice = {
  id: number;
  tone: "success" | "error" | "info";
  text: string;
  link?: { href: string; label: string };
  createdAt: number;
};

export type AppState = {
  user: User;
  accounts: User[];
  documents: Document[];
  documentsStatus: "loading" | "ready" | "error";
  documentsError: string;
  refreshDocuments: () => Promise<void>;
  notices: Notice[];
  notify: (notice: Omit<Notice, "id" | "createdAt">) => void;
  dismiss: (id: number) => void;
  /**
   * Central handling for API failures. 401 signs the user out (drafts stay on
   * this device); 403 and 409 explain what happened and reload fresh data.
   * Returns the failure so the caller can also react locally.
   */
  handleError: (error: unknown) => ApiFailure;
  filters: QueueFilters;
  setFilters: (update: Partial<QueueFilters>) => void;
  ownerName: (id: string) => string;
  signOut: () => Promise<void>;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}

const toFailure = (error: unknown) =>
  error instanceof ApiFailure ? error : new ApiFailure(0, "ERROR", error instanceof Error ? error.message : "Something went wrong.");

export default function AppProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"checking" | "failed" | "ready">("checking");
  const [startupError, setStartupError] = useState("");
  const [accounts, setAccounts] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsStatus, setDocumentsStatus] = useState<AppState["documentsStatus"]>("loading");
  const [documentsError, setDocumentsError] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [filters, setFilterState] = useState<QueueFilters>(defaultFilters);
  const noticeId = useRef(0);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const notify = useCallback((notice: Omit<Notice, "id" | "createdAt">) => {
    const id = ++noticeId.current;
    // Replace an identical message rather than stacking duplicates.
    setNotices((all) => [...all.filter((n) => n.text !== notice.text), { ...notice, id, createdAt: Date.now() }].slice(-3));
  }, []);
  const dismiss = useCallback((id: number) => setNotices((all) => all.filter((n) => n.id !== id)), []);

  // Messages belong to the screen they were raised on; drop older ones on navigation.
  useEffect(() => {
    setNotices((all) => all.filter((n) => Date.now() - n.createdAt < 1500));
  }, [pathname]);

  const signedOut = useCallback((message: string) => {
    setUser(null);
    setDocuments([]);
    setDocumentsStatus("loading");
    setSessionMessage(message);
  }, []);

  const loadDocuments = useCallback(async () => {
    const data = await api<{ documents: Document[] }>("documents");
    setDocuments(data.documents);
    setDocumentsStatus("ready");
    setDocumentsError("");
  }, []);

  /** Re-reads the session: catches sign-outs and account switches in another tab. */
  const syncSession = useCallback(async () => {
    const { user: current } = await api<{ user: User | null }>("session");
    const previous = userRef.current;
    if (!current) {
      if (previous) signedOut("Your session has ended. Please sign in again. Any unsent text you typed is saved on this device.");
      return null;
    }
    if (previous && previous.id !== current.id)
      notify({ tone: "info", text: `You are now signed in as ${current.name} (${roleLabel(current.role)}) because the account was changed in another tab.` });
    setUser(current);
    return current;
  }, [notify, signedOut]);

  const handleError = useCallback(
    (error: unknown) => {
      const failure = toFailure(error);
      if (failure.status === 401) {
        signedOut("Your session has ended. Please sign in again. Any unsent text you typed is saved on this device.");
      } else if (failure.status === 403 || failure.status === 409) {
        notify({
          tone: "error",
          text: `${failure.message} ${failure.status === 409 ? "The latest version has been loaded." : "The page has been refreshed with what you are allowed to see."}`,
        });
        void syncSession()
          .then((current) => (current ? loadDocuments() : undefined))
          .catch(() => undefined);
      }
      return failure;
    },
    [loadDocuments, notify, signedOut, syncSession],
  );

  const refreshDocuments = useCallback(async () => {
    try {
      await loadDocuments();
    } catch (error) {
      const failure = handleError(error);
      if (failure.status !== 401) {
        setDocumentsStatus("error");
        setDocumentsError(failure.message);
      }
    }
  }, [handleError, loadDocuments]);

  const start = useCallback(async () => {
    setPhase("checking");
    try {
      const [all, session] = await Promise.all([api<User[]>("users"), api<{ user: User | null }>("session")]);
      setAccounts(all);
      setUser(session.user);
      setPhase("ready");
    } catch (error) {
      setStartupError(toFailure(error).message);
      setPhase("failed");
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (user) void refreshDocuments();
  }, [user?.id, refreshDocuments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back to the tab: pick up decisions made elsewhere.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible")
        void syncSession()
          .then((current) => (current ? loadDocuments() : undefined))
          .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user, syncSession, loadDocuments]);

  const signIn = useCallback(async (id: string) => {
    const { user: next } = await postJson<{ user: User }>("login", { userId: id });
    setSessionMessage("");
    setNotices([]);
    setDocumentsStatus("loading");
    setUser(next);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("logout", { method: "POST" });
    } catch {
      // Even if the server is unreachable, forget the session locally.
    } finally {
      setFilterState(defaultFilters);
      signedOut("");
    }
  }, [signedOut]);

  const setFilters = useCallback((update: Partial<QueueFilters>) => setFilterState((f) => ({ ...f, ...update })), []);
  const ownerName = useCallback((id: string) => accounts.find((a) => a.id === id)?.name ?? "Unknown Clerk", [accounts]);

  const value = useMemo<AppState | null>(
    () =>
      user
        ? {
            user,
            accounts,
            documents,
            documentsStatus,
            documentsError,
            refreshDocuments,
            notices,
            notify,
            dismiss,
            handleError,
            filters,
            setFilters,
            ownerName,
            signOut,
          }
        : null,
    [user, accounts, documents, documentsStatus, documentsError, refreshDocuments, notices, notify, dismiss, handleError, filters, setFilters, ownerName, signOut],
  );

  if (phase === "checking") return <LoadingState label="Loading Helpforce" fullPage />;
  if (phase === "failed")
    return (
      <main className="page-center">
        <ErrorState title="Helpforce could not start" message={startupError} onRetry={start} />
      </main>
    );
  if (!value) return <LoginScreen accounts={accounts} message={sessionMessage} onSignIn={signIn} />;
  return (
    <AppContext.Provider value={value}>
      <AppShell>{children}</AppShell>
    </AppContext.Provider>
  );
}
