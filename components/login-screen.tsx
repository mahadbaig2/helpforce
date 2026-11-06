"use client";

import { useState } from "react";
import { roleLabel, type User } from "@/lib/domain";
import { ApiFailure } from "@/lib/client/api";

const roleHelp: Record<User["role"], string> = {
  clerk: "Creates documents, edits and resubmits returned ones",
  officer: "First review: approves or returns with a reason",
  senior: "Final approval or return with a reason",
};

export const initials = (name: string) =>
  name
    .split(" ")
    .map((s) => s[0])
    .join("");

export default function LoginScreen({
  accounts,
  message,
  onSignIn,
}: {
  accounts: User[];
  message: string;
  onSignIn: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function choose(id: string) {
    setPending(id);
    setError("");
    try {
      await onSignIn(id);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Sign-in failed. Please try again.");
      setPending(null);
    }
  }

  return (
    <main className="login-page">
      <title>Sign in · Helpforce</title>
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          H
        </div>
        <p className="eyebrow">Document approvals</p>
        <h1 id="login-title">Sign in to Helpforce</h1>
        <p className="muted">Choose a demonstration account. No password is needed in this local demo.</p>
        {message && (
          <p className="alert alert-info" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <ul className="account-list" aria-label="Accounts">
          {accounts.map((a) => (
            <li key={a.id}>
              <button type="button" className="account" onClick={() => choose(a.id)} disabled={pending !== null}>
                <span className="avatar" aria-hidden="true">
                  {initials(a.name)}
                </span>
                <span className="account-text">
                  <strong>{a.name}</strong>
                  <span className="account-role">{roleLabel(a.role)}</span>
                  <span className="account-help">{roleHelp[a.role]}</span>
                </span>
                <span aria-hidden="true">{pending === a.id ? "…" : "→"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
