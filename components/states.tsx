import Link from "next/link";
import type { ReactNode } from "react";

export function LoadingState({ label, fullPage }: { label: string; fullPage?: boolean }) {
  const content = (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
  return fullPage ? <main className="page-center">{content}</main> : content;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  backHref,
  backLabel,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="state state-error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="state-actions">
        {onRetry && (
          <button type="button" className="button secondary" onClick={onRetry}>
            Try again
          </button>
        )}
        {backHref && (
          <Link className="button secondary" href={backHref}>
            {backLabel ?? "Go back"}
          </Link>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
