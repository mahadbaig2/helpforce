"use client";
import { useRouter } from "next/navigation";
import PdfPreview from "@/components/pdf-preview";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  handledBy,
  needsAction,
  statuses,
  types,
  workingDays,
  type Document,
  type DocumentType,
  type SummaryPoint,
  type User,
} from "@/lib/domain";

type View = "list" | "create" | "edit" | "detail";
type Workspace = "home" | "inbox" | "pipeline" | "handled" | "all";
type Failure = Error & { status?: number };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/" + path, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || "Request failed") as Failure;
    error.status = response.status;
    throw error;
  }
  return data;
}
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const dateTime = (s: string) =>
  new Date(s).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const role = (u: User) =>
  u.role === "senior"
    ? "Senior Officer"
    : u.role === "officer"
      ? "Officer"
      : "Clerk";
const reasonFor = (d: Document) =>
  [...d.audit].reverse().find((e) => e.action === "rejected")?.reason;
const reviewGroups = [
  { id: "critical", title: "Critical", detail: "More than 10 working days" },
  { id: "urgent", title: "Urgent", detail: "6–10 working days" },
  { id: "recent", title: "Recent", detail: "Up to 5 working days" },
  { id: "all", title: "All", detail: "Every item needing your action" },
] as const;
type ReviewTab = (typeof reviewGroups)[number]["id"];
const reviewGroup = (d: Document) => {
  const days = workingDays(d.waitingSince);
  return days > 10 ? "critical" : days > 5 ? "urgent" : "recent";
};
function NavIcon({ name }: { name: "home" | "documents" | "compose" }) {
  return (
    <svg
      className="nav-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "home" ? (
        <>
          <path d="m3 10 9-7 9 7v10H3z" />
          <path d="M9 20v-7h6v7" />
        </>
      ) : name === "documents" ? (
        <>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      ) : (
        <>
          <path d="M5 4h10l4 4v12H5z" />
          <path d="M15 4v4h4M9 14h6M12 11v6" />
        </>
      )}
    </svg>
  );
}

export default function WorkspaceApp({
  initialWorkspace = "home",
}: {
  initialWorkspace?: Workspace;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<User[]>([]),
    [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Document[]>([]),
    [doc, setDoc] = useState<Document | null>(null);
  const [view, setView] = useState<View>("list"),
    [busy, setBusy] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [documentsOpen, setDocumentsOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedLanes, setExpandedLanes] = useState<string[]>([]);
  const [reviewTab, setReviewTab] = useState<ReviewTab>("critical");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(1);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [kind, setKind] = useState<DocumentType>("Policy"),
    [file, setFile] = useState<File | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null),
    [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const [summary, setSummary] = useState<SummaryPoint[] | null>(null),
    [summaryBusy, setSummaryBusy] = useState(false),
    [summaryError, setSummaryError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const loadList = useCallback(async () => {
    setItems((await api<{ documents: Document[] }>("documents")).documents);
  }, []);
  useEffect(() => {
    const onFocus = () => {
      if (user) loadList().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user, loadList]);
  const loadDoc = useCallback(async (id: string) => {
    const fresh = (await api<{ document: Document }>("documents/" + id))
      .document;
    setDoc(fresh);
    return fresh;
  }, []);
  useEffect(() => {
    Promise.all([api<User[]>("users"), api<{ user: User | null }>("session")])
      .then(async ([all, session]) => {
        setAccounts(all);
        setUser(session.user);
        if (session.user) {
          setSort("newest");
          setWorkspace(initialWorkspace);
          await loadList();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [loadList, initialWorkspace]);
  useEffect(() => {
    if (decision) dialog.current?.showModal();
    else dialog.current?.close();
  }, [decision]);
  async function signIn(id: string) {
    setBusy(true);
    setError("");
    try {
      const signedIn = (
        await api<{ user: User }>("login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id }),
        })
      ).user;
      setUser(signedIn);
      setSort("newest");
      setWorkspace(initialWorkspace);
      await loadList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    await api("logout", { method: "POST" });
    setUser(null);
    setItems([]);
    setDoc(null);
    setView("list");
    setWorkspace("home");
    router.push("/");
  }
  function goWorkspace(next: Workspace) {
    setMobileMenuOpen(false);
    setWorkspace(next);
    setView("list");
    setPage(1);
    setSearch("");
    setFilter("all");
    setFrom("");
    setTo("");
    setError("");
    setSort("newest");
    if (next === "inbox") setReviewTab("critical");
    router.push(
      next === "home"
        ? "/"
        : next === "inbox"
          ? "/reviews"
          : next === "pipeline"
            ? "/pipeline"
            : next === "handled"
              ? "/decisions"
              : "/documents",
    );
    loadList().catch((e) => setError(e.message));
  }
  async function open(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setSummary(null);
    setSummaryError("");
    setReviewed(false);
    try {
      await loadDoc(id);
      setView("detail");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editor(current?: Document) {
    setDoc(current ?? null);
    setTitle(current?.title ?? "");
    setBody(current?.body ?? "");
    setKind(current?.type ?? "Policy");
    setFile(null);
    setError("");
    setView(current ? "edit" : "create");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("title", title);
    data.set("body", body);
    data.set("type", kind);
    if (file) data.set("file", file);
    if (doc) data.set("version", String(doc.version));
    try {
      const result = await api<{ document: Document }>(
        doc ? `documents/${doc.id}/resubmit` : "documents",
        { method: "POST", body: data },
      );
      setDoc(result.document);
      await loadList();
      setView("detail");
      setNotice(
        doc ? "Resubmitted to the Officer." : "Submitted to the Officer.",
      );
      if (user?.role !== "clerk") {
        setWorkspace("handled");
        setSort("newest");
        setPage(1);
      }
    } catch (e) {
      const failure = e as Failure;
      setError(failure.message);
      if (failure.status === 409 || failure.status === 403) {
        if (doc) await loadDoc(doc.id).catch(() => {});
        await loadList();
      }
      if (failure.status === 401) setUser(null);
    } finally {
      setBusy(false);
    }
  }
  async function act() {
    if (!doc || !decision || !reviewed) return;
    const action = decision;
    setDecision(null);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ document: Document }>(
        `documents/${doc.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: doc.version, reason }),
        },
      );
      setDoc(result.document);
      await loadList();
      setNotice(
        action === "approve"
          ? "Document approved."
          : "Document returned to the Clerk.",
      );
      setReviewed(false);
      setReason("");
    } catch (e) {
      const failure = e as Failure;
      setError(failure.message);
      if (failure.status === 403 || failure.status === 409) {
        await loadDoc(doc.id);
        await loadList();
        setReviewed(false);
        setSummary(null);
      }
      if (failure.status === 401) setUser(null);
    } finally {
      setBusy(false);
    }
  }
  async function summarise() {
    if (!doc) return;
    setSummaryBusy(true);
    setSummaryError("");
    setSummary(null);
    try {
      setSummary(
        (
          await api<{ points: SummaryPoint[] }>(
            `documents/${doc.id}/summarise`,
            { method: "POST" },
          )
        ).points,
      );
      await loadDoc(doc.id);
    } catch (e) {
      setSummaryError((e as Error).message);
      await loadDoc(doc.id).catch(() => {});
    } finally {
      setSummaryBusy(false);
    }
  }
  const matching = items
    .filter(
      (d) =>
        d.title.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" || d.type === filter) &&
        (!from || d.waitingSince.slice(0, 10) >= from) &&
        (!to || d.waitingSince.slice(0, 10) <= to),
    )
    .sort(
      (a, b) =>
        (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) *
        (sort === "newest" ? -1 : 1),
    );
  const shown = matching.filter((d) =>
    !user
      ? false
      : workspace === "inbox"
        ? needsAction(user, d)
        : workspace === "handled"
          ? handledBy(user, d)
          : true,
  );
  const pages = Math.max(1, Math.ceil(shown.length / 12)),
    currentPage = Math.min(page, pages);
  const canDecide =
    !!user &&
    !!doc &&
    ((user.role === "officer" && doc.status === "Pending Officer") ||
      (user.role === "senior" && doc.status === "Pending Senior Officer"));
  const actionItems = user ? matching.filter((d) => needsAction(user, d)) : [];
  const tabItems = actionItems.filter(
    (d) => reviewTab === "all" || reviewGroup(d) === reviewTab,
  );
  const reviewPages = Math.max(1, Math.ceil(tabItems.length / 12));
  const reviewPage = Math.min(page, reviewPages);
  const renderReviewItem = (d: Document) => (
    <article className="review-item" key={d.id}>
      <div className="review-item-main">
        <div className="review-item-meta">
          <span>{d.type}</span>
          <span>{d.id}</span>
          <span>Updated {date(d.updatedAt)}</span>
        </div>
        <button className="review-item-title" onClick={() => open(d.id)}>
          {d.title}
        </button>
        <p>
          {user?.role === "clerk"
            ? "Returned for changes"
            : `Submitted by ${accounts.find((a) => a.id === d.ownerId)?.name ?? "Clerk"}`}{" "}
          · {workingDays(d.waitingSince)} working days in this stage
          {workingDays(d.waitingSince) > 5 && (
            <span className="waiting-flag"> · Over 5 working days</span>
          )}
        </p>
      </div>
      <button
        className="small-button"
        onClick={() => (user?.role === "clerk" ? editor(d) : open(d.id))}
      >
        {user?.role === "clerk" ? "Edit & resubmit" : "Review"} →
      </button>
    </article>
  );
  if (busy && accounts.length === 0)
    return <main className="loading-screen">Loading Helpforce…</main>;
  if (!user)
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="logo">
            H<span>✦</span>
          </div>
          <p className="eyebrow">DOCUMENT WORKFLOW</p>
          <h1>Welcome to Helpforce</h1>
          <p className="muted">Choose a demonstration account to continue.</p>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <div className="account-list">
            {accounts.map((a) => (
              <button
                key={a.id}
                className="account"
                onClick={() => signIn(a.id)}
                disabled={busy}
              >
                <span className="avatar">
                  {a.name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")}
                </span>
                <span>
                  <strong>{a.name}</strong>
                  <small>{role(a)}</small>
                </span>
                <span>→</span>
              </button>
            ))}
          </div>
          <p className="login-note">
            Local demonstration · No password required
          </p>
        </section>
      </main>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            H<span>✦</span>
          </div>
          <div>
            <strong>Helpforce</strong>
            <small>Document approvals</small>
          </div>
        </div>
        <nav aria-label="Primary" className="sidebar-nav">
          <button
            className={`nav nav-top ${workspace === "home" && view === "list" ? "active" : ""}`}
            onClick={() => goWorkspace("home")}
          >
            <NavIcon name="home" />
            <span>Dashboard</span>
          </button>
          <button
            className="nav nav-parent"
            aria-expanded={documentsOpen}
            aria-controls="document-navigation"
            onClick={() => setDocumentsOpen((value) => !value)}
          >
            <NavIcon name="documents" />
            <span>Documents</span>
            <svg
              className={`nav-chevron ${documentsOpen ? "open" : ""}`}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="m2 4 4 4 4-4" />
            </svg>
            <span className="nav-count">
              {items.filter((d) => needsAction(user, d)).length}
            </span>
          </button>
          {documentsOpen && (
            <div id="document-navigation" className="nav-children">
              <button
                className={`nav-child ${workspace === "inbox" ? "active" : ""}`}
                onClick={() => goWorkspace("inbox")}
              >
                <span>
                  {user.role === "clerk" ? "Needs attention" : "My reviews"}
                </span>
                <span className="nav-count">
                  {items.filter((d) => needsAction(user, d)).length}
                </span>
              </button>
              <button
                className={`nav-child ${workspace === "pipeline" ? "active" : ""}`}
                onClick={() => goWorkspace("pipeline")}
              >
                Pipeline
              </button>
              {user.role !== "clerk" && (
                <button
                  className={`nav-child ${workspace === "handled" ? "active" : ""}`}
                  onClick={() => goWorkspace("handled")}
                >
                  My decisions
                </button>
              )}
              <button
                className={`nav-child ${workspace === "all" ? "active" : ""}`}
                onClick={() => goWorkspace("all")}
              >
                All documents
              </button>
            </div>
          )}
          {user.role === "clerk" && (
            <button
              className={`nav nav-compose ${view === "create" ? "active" : ""}`}
              onClick={() => editor()}
            >
              <NavIcon name="compose" />
              <span>Create document</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((s) => s[0])
                .join("")}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{role(user)}</small>
            </span>
          </div>
          <button className="signout" onClick={signOut}>
            Sign out ↗
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="mobile-header">
          <strong>Helpforce</strong>
          <div className="mobile-header-actions">
            <button className="mobile-signout" onClick={signOut}>
              Sign out
            </button>
            <button
              className="mobile-menu-toggle"
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen((value) => !value)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {mobileMenuOpen ? (
                  <>
                    <path d="M4 4l12 12" />
                    <path d="M16 4L4 16" />
                  </>
                ) : (
                  <>
                    <path d="M3 5h14" />
                    <path d="M3 10h14" />
                    <path d="M3 15h14" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <nav
            id="mobile-navigation"
            className="mobile-navigation"
            aria-label="Mobile navigation"
          >
            <button onClick={() => goWorkspace("home")}>Home</button>
            <button onClick={() => goWorkspace("inbox")}>
              {user.role === "clerk" ? "Needs attention" : "My reviews"}
            </button>
            <button onClick={() => goWorkspace("pipeline")}>
              Document pipeline
            </button>
            {user.role !== "clerk" && (
              <button onClick={() => goWorkspace("handled")}>
                My decisions
              </button>
            )}
            <button onClick={() => goWorkspace("all")}>All documents</button>
            {user.role === "clerk" && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  editor();
                }}
              >
                Create document
              </button>
            )}
          </nav>
        )}
        <div className="content">
          {notice && (
            <div className="alert success" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {view === "list" && (
            <>
              <div className="heading">
                <div>
                  <p className="eyebrow">
                    {workspace === "home"
                      ? "YOUR WORKSPACE"
                      : user.role === "clerk"
                        ? "YOUR DOCUMENTS"
                        : "APPROVAL WORKSPACE"}
                  </p>
                  <h1>
                    {workspace === "home"
                      ? `Good to see you, ${user.name.split(" ")[0]}`
                      : workspace === "inbox"
                        ? user.role === "clerk"
                          ? "Needs attention"
                          : "My reviews"
                        : workspace === "pipeline"
                          ? "Document pipeline"
                          : workspace === "handled"
                            ? "My decisions"
                            : "All documents"}
                  </h1>
                  <p className="muted">
                    {workspace === "home"
                      ? "A clear view of what needs action and where your documents stand."
                      : workspace === "inbox"
                        ? "Work through your queue by time waiting at this stage."
                        : workspace === "pipeline"
                          ? "Follow documents through every approval stage."
                          : workspace === "handled"
                            ? "A record of documents you have reviewed."
                            : "Browse every document you can access."}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="refresh-button"
                    onClick={() => loadList().catch((e) => setError(e.message))}
                  >
                    ↻ Refresh
                  </button>
                  {user.role === "clerk" && (
                    <button className="button primary" onClick={() => editor()}>
                      ＋ Create document
                    </button>
                  )}
                </div>
              </div>
              {workspace === "home" && (
                <section
                  className="home-stats"
                  aria-label="Document statistics"
                >
                  <div className="lead-stat">
                    <span>Needs action</span>
                    <strong>
                      {items.filter((d) => needsAction(user, d)).length}
                    </strong>
                    <small>
                      {user.role === "clerk"
                        ? "Returned to you"
                        : "Waiting for your decision"}
                    </small>
                  </div>
                  <div>
                    <span>In review</span>
                    <strong>
                      {
                        items.filter(
                          (d) =>
                            d.status === "Pending Officer" ||
                            d.status === "Pending Senior Officer",
                        ).length
                      }
                    </strong>
                    <small>At either approval stage</small>
                  </div>
                  <div>
                    <span>Returned</span>
                    <strong>
                      {items.filter((d) => d.status === "Returned").length}
                    </strong>
                    <small>Awaiting Clerk changes</small>
                  </div>
                  <div>
                    <span>Approved</span>
                    <strong>
                      {items.filter((d) => d.status === "Approved").length}
                    </strong>
                    <small>Final and locked</small>
                  </div>
                </section>
              )}
              {workspace === "home" && (
                <div className="home-grid">
                  <section className="home-card home-reviews">
                    <div className="home-card-head">
                      <div>
                        <p className="eyebrow">NEXT ACTIONS</p>
                        <h2>
                          {user.role === "clerk"
                            ? "Returned to you"
                            : "Ready for review"}
                        </h2>
                        <p className="muted">
                          {actionItems.length
                            ? `${actionItems.length} document${actionItems.length === 1 ? "" : "s"} need your attention`
                            : "You're all caught up."}
                        </p>
                      </div>
                      <button
                        className="small-button"
                        onClick={() => goWorkspace("inbox")}
                      >
                        View reviews →
                      </button>
                    </div>
                    {actionItems.length ? (
                      actionItems.slice(0, 4).map(renderReviewItem)
                    ) : (
                      <div className="home-empty">
                        No action needed right now. Check the pipeline to follow
                        ongoing documents.
                      </div>
                    )}
                    {actionItems.length > 4 && (
                      <button
                        className="home-more"
                        onClick={() => goWorkspace("inbox")}
                      >
                        See all {actionItems.length} items →
                      </button>
                    )}
                  </section>
                  <aside className="home-card home-progress">
                    <p className="eyebrow">LATEST ACTIVITY</p>
                    <h2>Recently updated</h2>
                    <p className="muted">
                      Newest document changes across your workspace.
                    </p>
                    <div className="recent-list">
                      {matching.slice(0, 4).map((d) => (
                        <button key={d.id} onClick={() => open(d.id)}>
                          <strong>{d.title}</strong>
                          <span>
                            {d.status} · {date(d.updatedAt)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="home-more"
                      onClick={() => goWorkspace("all")}
                    >
                      Browse all documents →
                    </button>
                  </aside>
                </div>
              )}
              {workspace === "inbox" && (
                <section className="review-browser" aria-label="Review queue">
                  <div className="review-browser-head">
                    <div>
                      <p className="eyebrow">REVIEW QUEUE</p>
                      <h2>Find the next document</h2>
                      <p className="muted">
                        Priorities use working days at the current stage. Newest
                        updates appear first.
                      </p>
                    </div>
                    <span>{actionItems.length} matching</span>
                  </div>
                  <div className="review-filters">
                    <label className="review-search">
                      Search by title
                      <input
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Search documents…"
                      />
                    </label>
                    <label>
                      Type
                      <select
                        value={filter}
                        onChange={(e) => {
                          setFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="all">All types</option>
                        {types.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      From
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => {
                          setFrom(e.target.value);
                          setPage(1);
                        }}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => {
                          setTo(e.target.value);
                          setPage(1);
                        }}
                      />
                    </label>
                    <label>
                      Sort
                      <select
                        value={sort}
                        onChange={(e) => {
                          setSort(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                      </select>
                    </label>
                  </div>
                  <div
                    className="priority-pills"
                    role="group"
                    aria-label="Filter by waiting time"
                  >
                    {reviewGroups.map((group) => {
                      const count =
                        group.id === "all"
                          ? actionItems.length
                          : actionItems.filter(
                              (d) => reviewGroup(d) === group.id,
                            ).length;
                      return (
                        <button
                          key={group.id}
                          className={
                            reviewTab === group.id ? `active ${group.id}` : ""
                          }
                          aria-pressed={reviewTab === group.id}
                          title={group.detail}
                          onClick={() => {
                            setReviewTab(group.id);
                            setPage(1);
                          }}
                        >
                          {group.title}
                          <span>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="priority-description">
                    {
                      reviewGroups.find((group) => group.id === reviewTab)
                        ?.detail
                    }{" "}
                    · {tabItems.length} document
                    {tabItems.length === 1 ? "" : "s"}
                  </p>
                  <div className="review-results">
                    {tabItems.length ? (
                      tabItems
                        .slice((reviewPage - 1) * 12, reviewPage * 12)
                        .map(renderReviewItem)
                    ) : (
                      <div className="home-empty">
                        <strong>No documents in this view.</strong>
                        <p>
                          Choose another priority or adjust your search and
                          filters.
                        </p>
                      </div>
                    )}
                  </div>
                  {reviewPages > 1 && (
                    <div className="pagination">
                      <span>
                        Page {reviewPage} of {reviewPages}
                      </span>
                      <div>
                        <button
                          disabled={reviewPage <= 1}
                          onClick={() => setPage(reviewPage - 1)}
                        >
                          Previous
                        </button>
                        <button
                          disabled={reviewPage >= reviewPages}
                          onClick={() => setPage(reviewPage + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {workspace === "pipeline" && (
                <section
                  className="pipeline-section"
                  aria-label="Document pipeline"
                >
                  <div className="pipeline-intro">
                    <div>
                      <p className="eyebrow">LIVE WORKFLOW</p>
                      <h2>Where every document stands</h2>
                      <p className="muted">
                        {user.role === "clerk"
                          ? "Only your documents are shown."
                          : "All documents are visible; actions remain limited to your review stage."}
                      </p>
                    </div>
                    <div className="pipeline-search">
                      <label>
                        Search
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Find a document…"
                        />
                      </label>
                      <label>
                        Type
                        <select
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">All types</option>
                          {types.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <p className="board-hint">
                    Scroll sideways to see each approval stage.
                  </p>
                  <div className="pipeline-board">
                    {statuses.map((status) => {
                      const lane = matching.filter((d) => d.status === status);
                      const expanded = expandedLanes.includes(status);
                      return (
                        <section
                          className="pipeline-lane"
                          key={status}
                          aria-label={`${status}: ${lane.length} documents`}
                        >
                          <header>
                            <span
                              className={`status-dot ${status.replaceAll(" ", "-").toLowerCase()}`}
                            />
                            <h3>{status}</h3>
                            <span className="lane-count">{lane.length}</span>
                          </header>
                          <div className="lane-items">
                            {lane.length ? (
                              lane
                                .slice(0, expanded ? undefined : 3)
                                .map((d) => (
                                  <article className="pipeline-card" key={d.id}>
                                    <div className="card-meta">
                                      <span>{d.id}</span>
                                      <span>{d.type}</span>
                                    </div>
                                    <button
                                      className="card-title"
                                      onClick={() => open(d.id)}
                                    >
                                      {d.title}
                                    </button>
                                    <p>
                                      {
                                        accounts.find((a) => a.id === d.ownerId)
                                          ?.name
                                      }{" "}
                                      · {date(d.updatedAt)}
                                    </p>
                                    {needsAction(user, d) &&
                                      (user.role === "clerk" ? (
                                        <button
                                          className="card-action"
                                          onClick={() => editor(d)}
                                        >
                                          Edit and resubmit →
                                        </button>
                                      ) : (
                                        <span className="card-action">
                                          Needs your review
                                        </span>
                                      ))}
                                  </article>
                                ))
                            ) : (
                              <p className="lane-empty">
                                No documents match the filters.
                              </p>
                            )}
                          </div>
                          {lane.length > 3 && (
                            <button
                              className="lane-more"
                              onClick={() =>
                                setExpandedLanes((value) =>
                                  expanded
                                    ? value.filter((s) => s !== status)
                                    : [...value, status],
                                )
                              }
                            >
                              {expanded
                                ? "Show fewer"
                                : `Show all ${lane.length}`}
                            </button>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </section>
              )}
              {(workspace === "handled" || workspace === "all") && (
                <section className="panel list-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {workspace === "handled"
                          ? "Decisions you made"
                          : workspace === "all"
                            ? "Document register"
                            : user.role === "clerk"
                              ? "Returned documents"
                              : "Ready for your review"}
                      </h2>
                      <p className="muted">{shown.length} matching documents</p>
                    </div>
                  </div>
                  <div className="filters">
                    <label>
                      Search by title
                      <input
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Search documents…"
                      />
                    </label>
                    <label>
                      Type
                      <select
                        value={filter}
                        onChange={(e) => {
                          setFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="all">All types</option>
                        {types.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      From
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => {
                          setFrom(e.target.value);
                          setPage(1);
                        }}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => {
                          setTo(e.target.value);
                          setPage(1);
                        }}
                      />
                    </label>
                    <label>
                      Sort
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                      </select>
                    </label>
                  </div>
                  {busy ? (
                    <div className="empty">Loading documents…</div>
                  ) : shown.length ? (
                    <>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Document</th>
                              <th>Type</th>
                              <th>Status</th>
                              <th>Updated</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shown
                              .slice((currentPage - 1) * 12, currentPage * 12)
                              .map((d) => (
                                <tr key={d.id}>
                                  <td>
                                    <button
                                      className="text-link"
                                      onClick={() => open(d.id)}
                                    >
                                      {d.title}
                                    </button>
                                    <small>
                                      {d.id} ·{" "}
                                      {
                                        accounts.find((a) => a.id === d.ownerId)
                                          ?.name
                                      }
                                      {d.status === "Returned" && reasonFor(d)
                                        ? ` · Returned: ${reasonFor(d)}`
                                        : ""}
                                    </small>
                                  </td>
                                  <td>{d.type}</td>
                                  <td>
                                    <span
                                      className={`badge ${d.status.replaceAll(" ", "-").toLowerCase()}`}
                                    >
                                      {d.status}
                                    </span>
                                  </td>
                                  <td>{date(d.updatedAt)}</td>
                                  <td>
                                    <button
                                      className="small-button"
                                      onClick={() =>
                                        d.status === "Returned" &&
                                        user.role === "clerk"
                                          ? editor(d)
                                          : open(d.id)
                                      }
                                    >
                                      {d.status === "Returned" &&
                                      user.role === "clerk"
                                        ? "Edit & resubmit"
                                        : needsAction(user, d)
                                          ? "Review →"
                                          : "View →"}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="pagination">
                        <span>
                          Page {currentPage} of {pages}
                        </span>
                        <div>
                          <button
                            disabled={currentPage <= 1}
                            onClick={() => setPage(currentPage - 1)}
                          >
                            Previous
                          </button>
                          <button
                            disabled={currentPage >= pages}
                            onClick={() => setPage(currentPage + 1)}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <strong>No matching documents</strong>
                      <p>Try clearing the filters or check back later.</p>
                      <button
                        className="small-button"
                        onClick={() => {
                          setSearch("");
                          setFilter("all");
                          setFrom("");
                          setTo("");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
          {(view === "create" || view === "edit") && (
            <>
              <button
                className="back"
                onClick={() => setView(doc ? "detail" : "list")}
              >
                ← Back
              </button>
              <div className="heading">
                <div>
                  <p className="eyebrow">CLERK WORKSPACE</p>
                  <h1>
                    {view === "create"
                      ? "Create a document"
                      : "Edit and resubmit"}
                  </h1>
                  <p className="muted">
                    Your document will go to the Officer for review.
                  </p>
                </div>
              </div>
              {view === "edit" && doc && (
                <div className="alert notice">
                  <strong>Reason for return</strong>
                  <p>{reasonFor(doc)}</p>
                </div>
              )}
              <form className="form-panel" onSubmit={save}>
                <label>
                  Document title *
                  <input
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="A clear, descriptive title"
                  />
                  <small>{title.length}/200 characters</small>
                </label>
                <label>
                  Document type *
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as DocumentType)}
                  >
                    {types.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Document body *
                  <textarea
                    required
                    rows={12}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Explain the purpose, proposed action, and relevant details…"
                  />
                  <small>
                    Write in plain language so approvers can understand the
                    request.
                  </small>
                </label>
                <label>
                  Supporting PDF{" "}
                  <span className="muted">Optional · PDF up to 10 MB</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {doc?.attachment && (
                    <small>
                      Current file: {doc.attachment.name}. Leave blank to keep
                      it.
                    </small>
                  )}
                  {file && file.size > 10 * 1024 * 1024 && (
                    <small className="field-error">File exceeds 10 MB.</small>
                  )}
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setView(doc ? "detail" : "list")}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || (!!file && file.size > 10 * 1024 * 1024)}
                  >
                    {busy
                      ? "Submitting…"
                      : view === "create"
                        ? "Submit to Officer"
                        : "Resubmit to Officer"}
                  </button>
                </div>
              </form>
            </>
          )}
          {view === "detail" && doc && (
            <>
              <button
                className="back"
                onClick={() => {
                  setView("list");
                  loadList().catch((e) => setError(e.message));
                }}
              >
                ← Back to{" "}
                {workspace === "pipeline"
                  ? "pipeline"
                  : workspace === "handled"
                    ? "my decisions"
                    : workspace === "all"
                      ? "all documents"
                      : user.role === "clerk"
                        ? "needs attention"
                        : "my queue"}
              </button>
              <div className="heading detail-heading">
                <div>
                  <p className="eyebrow">DOCUMENT {doc.id}</p>
                  <h1>{doc.title}</h1>
                  <div className="meta">
                    <span
                      className={`badge ${doc.status.replaceAll(" ", "-").toLowerCase()}`}
                    >
                      {doc.status}
                    </span>
                    <span>{doc.type}</span>
                    <span>Created {date(doc.createdAt)}</span>
                    <span>
                      By {accounts.find((a) => a.id === doc.ownerId)?.name}
                    </span>
                  </div>
                </div>
              </div>
              <section
                className="workflow-progress"
                aria-label="Approval progress"
              >
                <div className="workflow-label">
                  <strong>Approval journey</strong>
                  <span>
                    {doc.status === "Returned"
                      ? "Returned to the Clerk for changes"
                      : doc.status === "Approved"
                        ? "Final approval complete"
                        : `Currently with the ${doc.status === "Pending Officer" ? "Officer" : "Senior Officer"}`}
                  </span>
                </div>
                <ol>
                  {[
                    "Submitted",
                    "Officer review",
                    "Senior Officer review",
                    "Final approval",
                  ].map((stage, index) => {
                    const position =
                      doc.status === "Pending Officer"
                        ? 1
                        : doc.status === "Pending Senior Officer"
                          ? 2
                          : doc.status === "Approved"
                            ? 4
                            : doc.audit.some(
                                  (event) =>
                                    event.from === "Pending Senior Officer" &&
                                    event.action === "rejected",
                                )
                              ? 2
                              : 1;
                    const done = doc.status === "Approved" || index < position;
                    const current =
                      doc.status !== "Approved" &&
                      doc.status !== "Returned" &&
                      index === position;
                    return (
                      <li
                        key={stage}
                        className={`${done ? "done" : ""} ${current ? "current" : ""}`}
                      >
                        <span className="step-marker">
                          {done ? "✓" : index + 1}
                        </span>
                        <span>{stage}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>
              {doc.status === "Approved" && (
                <div className="alert success">
                  Final approval complete. This document is locked.
                </div>
              )}
              {doc.status === "Returned" && (
                <div className="alert notice">
                  <strong>Returned for changes</strong>
                  <p>{reasonFor(doc)}</p>
                  {user.role === "clerk" && (
                    <button
                      className="small-button"
                      onClick={() => editor(doc)}
                    >
                      Edit and resubmit →
                    </button>
                  )}
                </div>
              )}
              <div className="detail-grid">
                <div className="document-column">
                  <section className="panel paper">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">OFFICIAL DOCUMENT</p>
                        <h2>
                          {doc.attachment
                            ? doc.attachment.name
                            : "Document body"}
                        </h2>
                      </div>
                      <span className="muted">Version {doc.version}</span>
                    </div>
                    {doc.attachment && (
                      <PdfPreview
                        key={`${doc.id}-${doc.version}`}
                        url={`/api/documents/${doc.id}/attachment`}
                        name={doc.attachment.name}
                      />
                    )}
                    <div className={doc.attachment ? "source-body" : ""}>
                      {doc.attachment && (
                        <div className="source-body-heading">
                          <h3>Original document body</h3>
                          <p>
                            Read this with the PDF. AI summary source links lead
                            here.
                          </p>
                        </div>
                      )}
                      {doc.body.split(/\n\s*\n/).map((p, i) => (
                        <p
                          className="body-paragraph"
                          id={`paragraph-${i}`}
                          tabIndex={-1}
                          key={i}
                        >
                          {p}
                        </p>
                      ))}
                    </div>
                  </section>
                </div>
                <aside className="review-rail">
                  {!canDecide && user.role !== "clerk" && (
                    <section className="panel context-panel">
                      <p className="eyebrow">CURRENT STATE</p>
                      <h2>{doc.status}</h2>
                      <p className="muted">
                        {handledBy(user, doc)
                          ? "Your decision is recorded in the history below. You can keep following this document here."
                          : "This document is visible for tracking. Decisions are available only when it reaches your review stage."}
                      </p>
                      <button
                        className="small-button"
                        onClick={() =>
                          goWorkspace(
                            handledBy(user, doc) ? "handled" : "pipeline",
                          )
                        }
                      >
                        {handledBy(user, doc)
                          ? "View my decisions"
                          : "View pipeline"}{" "}
                        →
                      </button>
                    </section>
                  )}
                  {canDecide && (
                    <section className="panel action-panel">
                      <p className="eyebrow">YOUR DECISION</p>
                      <h2>Make a decision</h2>
                      <p className="muted">
                        Read the original document
                        {doc.attachment ? " and attachment" : ""} before
                        deciding. The AI summary is only an aid.
                      </p>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={(e) => setReviewed(e.target.checked)}
                        />
                        I have reviewed the full original document
                        {doc.attachment ? " and attachment" : ""}.
                      </label>
                      <div className="action-buttons">
                        <button
                          className="button primary"
                          disabled={!reviewed || busy}
                          onClick={() => setDecision("approve")}
                        >
                          Approve
                        </button>
                        <button
                          className="button danger"
                          disabled={!reviewed || busy}
                          onClick={() => setDecision("reject")}
                        >
                          Return with reason
                        </button>
                      </div>
                    </section>
                  )}
                  {user.role !== "clerk" && (
                    <section className="panel summary">
                      <p className="eyebrow">ASSISTIVE TOOL</p>
                      <h2>AI-generated summary</h2>
                      <p className="muted">
                        Check every point against the original document before
                        deciding.
                      </p>
                      <button
                        className="button secondary"
                        disabled={summaryBusy}
                        onClick={summarise}
                      >
                        {summaryBusy
                          ? "Preparing summary…"
                          : summary
                            ? "Generate again"
                            : "Summarise"}
                      </button>
                      {summaryBusy && (
                        <p role="status" className="muted">
                          This may take a few seconds. You can keep reading.
                        </p>
                      )}
                      {summaryError && (
                        <p className="alert error" role="alert">
                          {summaryError}
                        </p>
                      )}
                      {summary && (
                        <ol className="summary-points">
                          {summary.map((point, i) => (
                            <li key={i}>
                              <p>{point.text}</p>
                              <a
                                href={`#paragraph-${point.paragraph}`}
                                onClick={() =>
                                  document
                                    .getElementById(
                                      `paragraph-${point.paragraph}`,
                                    )
                                    ?.focus()
                                }
                              >
                                View source paragraph ↗
                              </a>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                  )}
                  <section className="panel audit">
                    <p className="eyebrow">RECORD OF ACTIVITY</p>
                    <h2>Document history</h2>
                    <ol className="timeline">
                      {[...doc.audit].reverse().map((event) => (
                        <li key={event.id}>
                          <strong>
                            {event.actor} {event.action}
                          </strong>
                          <time>{dateTime(event.at)}</time>
                          <p>
                            {event.from
                              ? `${event.from} → ${event.to}`
                              : `Submitted for review · ${event.to}`}
                          </p>
                          {event.reason && (
                            <blockquote>“{event.reason}”</blockquote>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
      <dialog
        ref={dialog}
        className="decision-dialog"
        onClose={() => setDecision(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act();
          }}
        >
          <p className="eyebrow">CONFIRM DECISION</p>
          <h2>
            {decision === "approve"
              ? "Approve this document?"
              : "Return this document?"}
          </h2>
          <p className="muted">
            {decision === "approve"
              ? doc?.status === "Pending Senior Officer"
                ? "Final approval locks this document."
                : "This document will move to Senior Officer review."
              : "The Clerk will see your reason and can edit and resubmit."}
          </p>
          <p>
            <strong>{doc?.title}</strong>
          </p>
          {decision === "reject" && (
            <label>
              Reason for return *
              <textarea
                required
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain what the Clerk should change…"
              />
            </label>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setDecision(null)}
            >
              Cancel
            </button>
            <button
              className={`button ${decision === "reject" ? "danger" : "primary"}`}
              type="submit"
            >
              {decision === "approve" ? "Confirm approval" : "Return document"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
