"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { needsAction, roleLabel } from "@/lib/domain";
import { useApp } from "./app-provider";
import { initials } from "./login-screen";

type NavItem = { href: string; label: string; count?: number };

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, documents, notices, dismiss, signOut } = useApp();
  const pathname = usePathname();
  // The mobile menu closes itself on navigation: it is "open" only for the page it was opened on.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;

  const actionCount = documents.filter((d) => needsAction(user, d)).length;
  const items: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/reviews", label: user.role === "clerk" ? "Needs my changes" : "Approval queue", count: actionCount },
    ...(user.role === "clerk" ? [{ href: "/documents/new", label: "Create document" }] : []),
    { href: "/documents", label: user.role === "clerk" ? "My documents" : "All documents" },
    { href: "/pipeline", label: "Pipeline" },
    ...(user.role !== "clerk" ? [{ href: "/decisions", label: "My decisions" }] : []),
  ];
  const isCurrent = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/documents"
        ? pathname === "/documents" || (pathname.startsWith("/documents/") && pathname !== "/documents/new")
        : pathname === href;

  const nav = (
    <ul className="nav-list">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="nav-link" aria-current={isCurrent(item.href) ? "page" : undefined}>
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className="nav-count" aria-label={`${item.count} waiting`}>
                {item.count}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            <strong>Helpforce</strong>
            <small>Document approvals</small>
          </span>
        </Link>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
        >
          {menuOpen ? "Close menu" : "Menu"}
        </button>
      </header>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <nav id="primary-navigation" aria-label="Main">
          {nav}
        </nav>
        <div className="profile">
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="profile-text">
            <strong>{user.name}</strong>
            <small>{roleLabel(user.role)}</small>
          </span>
          <button type="button" className="button ghost small" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main id="main" className="main" tabIndex={-1}>
        <div className="notices" aria-live="polite">
          {notices.map((n) => (
            <div key={n.id} className={`alert alert-${n.tone}`} role={n.tone === "error" ? "alert" : "status"}>
              <p>{n.text}</p>
              {n.link && (
                <Link href={n.link.href} className="alert-link">
                  {n.link.label}
                </Link>
              )}
              <button type="button" className="alert-dismiss" onClick={() => dismiss(n.id)} aria-label="Dismiss message">
                ×
              </button>
            </div>
          ))}
        </div>
        {children}
      </main>
    </div>
  );
}
