"use client";
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
type Workspace = "inbox" | "pipeline" | "handled" | "all";
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

export default function Home() {
  const [accounts, setAccounts] = useState<User[]>([]),
    [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Document[]>([]),
    [doc, setDoc] = useState<Document | null>(null);
  const [view, setView] = useState<View>("list"),
    [busy, setBusy] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace>("inbox");
  const [expandedLanes, setExpandedLanes] = useState<string[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [sort, setSort] = useState("attention"),
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
          setSort(session.user.role === "clerk" ? "attention" : "oldest");
          setWorkspace(session.user.role === "clerk" ? "pipeline" : "inbox");
          await loadList();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [loadList]);
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
      setSort(signedIn.role === "clerk" ? "attention" : "oldest");
      setWorkspace(signedIn.role === "clerk" ? "pipeline" : "inbox");
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
    setWorkspace("inbox");
  }
  function goWorkspace(next: Workspace) {
    setWorkspace(next);
    setView("list");
    setPage(1);
    setError("");
    if (next === "pipeline") {
      setFrom("");
      setTo("");
    }
    if (next === "handled") setSort("newest");
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
    .sort((a, b) => {
      if (sort === "attention" && user?.role === "clerk") {
        const priority = (d: Document) =>
          d.status === "Returned"
            ? 0
            : d.status === "Pending Officer"
              ? 1
              : d.status === "Pending Senior Officer"
                ? 2
                : 3;
        const order = priority(a) - priority(b);
        if (order) return order;
      }
      return (
        (Date.parse(a.waitingSince) - Date.parse(b.waitingSince)) *
        (sort === "newest" ? -1 : 1)
      );
    });
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
        <nav aria-label="Primary">
          <button
            className={`nav ${workspace === "inbox" && view === "list" ? "active" : ""}`}
            onClick={() => goWorkspace("inbox")}
          >
            ▤ {user.role === "clerk" ? "Needs attention" : "My review queue"}
          </button>
          <button
            className={`nav ${workspace === "pipeline" && view === "list" ? "active" : ""}`}
            onClick={() => goWorkspace("pipeline")}
          >
            ◫ Document pipeline
          </button>
          {user.role !== "clerk" && (
            <button
              className={`nav ${workspace === "handled" && view === "list" ? "active" : ""}`}
              onClick={() => goWorkspace("handled")}
            >
              ↗ My decisions
            </button>
          )}
          {user.role === "clerk" && (
            <button className="nav" onClick={() => editor()}>
              ＋ Create document
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
          <button onClick={signOut}>Sign out</button>
        </div>
        <header className="topbar">
          Workspace <span>/</span>{" "}
          {view === "list"
            ? workspace === "pipeline"
              ? "Document pipeline"
              : workspace === "handled"
                ? "My decisions"
                : user.role === "clerk"
                  ? "Needs attention"
                  : "My review queue"
            : view === "create"
              ? "New document"
              : view === "edit"
                ? "Edit document"
                : doc?.id}
        </header>
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
                    {user.role === "clerk"
                      ? "YOUR DOCUMENTS"
                      : "APPROVAL WORKSPACE"}
                  </p>
                  <h1>
                    {user.role === "clerk"
                      ? "My documents"
                      : "Document approvals"}
                  </h1>
                  <p className="muted">
                    {user.role === "clerk"
                      ? "See what needs a change and follow every submission through approval."
                      : `Review your queue and follow documents after your ${role(user)} decision.`}
                  </p>
                </div>
                {user.role === "clerk" && (
                  <button className="button primary" onClick={() => editor()}>
                    ＋ Create document
                  </button>
                )}
              </div>
              <section
                className="overview"
                aria-label="Document status overview"
              >
                <div className="overview-lead">
                  <span>NEEDS ACTION</span>
                  <strong>
                    {items.filter((d) => needsAction(user, d)).length}
                  </strong>
                  <small>
                    {user.role === "clerk"
                      ? "Returned to you"
                      : `Waiting for ${role(user)} review`}
                  </small>
                </div>
                {statuses.map((status) => (
                  <button
                    key={status}
                    className="overview-state"
                    onClick={() => goWorkspace("pipeline")}
                  >
                    <span
                      className={`status-dot ${status.replaceAll(" ", "-").toLowerCase()}`}
                    />{" "}
                    <span>{status}</span>
                    <strong>
                      {items.filter((d) => d.status === status).length}
                    </strong>
                  </button>
                ))}
              </section>
              <div className="workspace-bar">
                <div className="workspace-tabs" aria-label="Document views">
                  <button
                    aria-pressed={workspace === "inbox"}
                    className={workspace === "inbox" ? "selected" : ""}
                    onClick={() => goWorkspace("inbox")}
                  >
                    {user.role === "clerk"
                      ? "Needs attention"
                      : "My review queue"}{" "}
                    <span>
                      {items.filter((d) => needsAction(user, d)).length}
                    </span>
                  </button>
                  <button
                    aria-pressed={workspace === "pipeline"}
                    className={workspace === "pipeline" ? "selected" : ""}
                    onClick={() => goWorkspace("pipeline")}
                  >
                    Pipeline
                  </button>
                  {user.role !== "clerk" && (
                    <button
                      aria-pressed={workspace === "handled"}
                      className={workspace === "handled" ? "selected" : ""}
                      onClick={() => goWorkspace("handled")}
                    >
                      My decisions{" "}
                      <span>
                        {items.filter((d) => handledBy(user, d)).length}
                      </span>
                    </button>
                  )}
                  <button
                    aria-pressed={workspace === "all"}
                    className={workspace === "all" ? "selected" : ""}
                    onClick={() => goWorkspace("all")}
                  >
                    All documents
                  </button>
                </div>
                <button
                  className="refresh-button"
                  onClick={() => loadList().catch((e) => setError(e.message))}
                >
                  ↻ Refresh
                </button>
              </div>
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
                    Swipe sideways to see each approval stage.
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
                                .slice(0, expanded ? undefined : 6)
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
                                    {status === "Returned" && reasonFor(d) && (
                                      <p className="card-reason">
                                        Returned: {reasonFor(d)}
                                      </p>
                                    )}
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
                          {lane.length > 6 && (
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
              {workspace !== "pipeline" && (
                <section className="panel list-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {workspace === "handled"
                          ? "Decisions you made"
                          : workspace === "all"
                            ? "All documents"
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
                        {user.role === "clerk" && (
                          <option value="attention">
                            Needs attention first
                          </option>
                        )}
                        <option value="oldest">Oldest first</option>
                        <option value="newest">Newest first</option>
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
                              <th>
                                {workspace === "inbox" && user.role !== "clerk"
                                  ? "Waiting"
                                  : "Updated"}
                              </th>
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
                                  <td>
                                    {workspace !== "inbox" ||
                                    user.role === "clerk" ? (
                                      date(d.updatedAt)
                                    ) : (
                                      <span
                                        className={
                                          workingDays(d.waitingSince) > 5
                                            ? "overdue"
                                            : ""
                                        }
                                      >
                                        {workingDays(d.waitingSince)} working
                                        days
                                        {workingDays(d.waitingSince) > 5
                                          ? " · Overdue"
                                          : ""}
                                      </span>
                                    )}
                                  </td>
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
                      <strong>
                        {workspace === "inbox" &&
                        !search &&
                        filter === "all" &&
                        !from &&
                        !to
                          ? "Nothing needs your action"
                          : "No matching documents"}
                      </strong>
                      <p>
                        {workspace === "inbox" &&
                        !search &&
                        filter === "all" &&
                        !from &&
                        !to
                          ? "Use Pipeline to follow documents already passed to another stage."
                          : "Try clearing the filters or check back later."}
                      </p>
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
                <div>
                  <section className="panel paper">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">OFFICIAL DOCUMENT</p>
                        <h2>Document content</h2>
                      </div>
                      <span className="muted">Version {doc.version}</span>
                    </div>
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
                  </section>
                  {doc.attachment && (
                    <section className="panel attachment">
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">ATTACHMENT</p>
                          <h2>{doc.attachment.name}</h2>
                        </div>
                        <a
                          href={`/api/documents/${doc.id}/attachment`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open PDF ↗
                        </a>
                      </div>
                      <iframe
                        title={`Preview of ${doc.attachment.name}`}
                        src={`/api/documents/${doc.id}/attachment`}
                      />
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
                </div>
                <aside>
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
