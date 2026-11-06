"use client";

import { useEffect, useRef, useState } from "react";
import type { Document, SummaryPoint } from "@/lib/domain";
import { ApiFailure, isAbort, postJson } from "@/lib/client/api";
import { useApp } from "./app-provider";
import { AiBadge } from "./badges";

const TIMEOUT_MS = 15000;

type State =
  | { phase: "idle" }
  | { phase: "loading"; startedAt: number }
  | { phase: "failed"; message: string }
  | { phase: "done"; points: SummaryPoint[]; version: number };

/**
 * Optional AI reading aid. Visually separate from the document, every point
 * links to its source paragraph, it never blocks reading or deciding, and it
 * cannot satisfy the "I have read the document" requirement.
 *
 * Mounted per document: leaving the page aborts the request, so a late
 * response can never land on a different document.
 */
export default function SummaryPanel({
  doc,
  paragraphTitle,
  onCite,
  onActivity,
}: {
  doc: Document;
  paragraphTitle: (index: number) => string | undefined;
  onCite: (paragraph: number) => void;
  /** Called when the request finishes, so the audit history can refresh. */
  onActivity: () => void;
}) {
  const { handleError } = useApp();
  const [state, setState] = useState<State>({ phase: "idle" });
  const [seconds, setSeconds] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (state.phase !== "loading") return;
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - state.startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [state]);

  async function request() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(new DOMException("timeout", "TimeoutError")), TIMEOUT_MS);
    setSeconds(0);
    setState({ phase: "loading", startedAt: Date.now() });
    try {
      const result = await postJson<{ points: SummaryPoint[]; version: number }>(`documents/${doc.id}/summarise`, {}, { signal: abort.signal });
      setState({ phase: "done", points: result.points, version: result.version });
    } catch (error) {
      if (abort.signal.aborted && abort.signal.reason instanceof DOMException && abort.signal.reason.name === "TimeoutError") {
        setState({ phase: "failed", message: "The summary is taking too long, so it was stopped. You can try again, or carry on reading." });
      } else if (abort.signal.aborted || isAbort(error)) {
        return; // Cancelled by the user or by leaving the page.
      } else {
        const failure = error instanceof ApiFailure && [401, 403].includes(error.status) ? handleError(error) : (error as Error);
        setState({ phase: "failed", message: failure.message });
      }
    } finally {
      clearTimeout(timeout);
    }
    if (!abort.signal.aborted || abort.signal.reason?.name === "TimeoutError") onActivity();
  }

  function cancel() {
    controller.current?.abort();
    setState({ phase: "idle" });
  }

  const stale = state.phase === "done" && state.version !== doc.version;

  return (
    <section className="ai-panel" aria-labelledby="ai-heading" aria-busy={state.phase === "loading"}>
      <div className="ai-panel-head">
        <AiBadge />
        <h2 id="ai-heading">AI summary</h2>
      </div>
      <p className="ai-disclaimer">
        <strong>Not part of the document.</strong> Generated automatically and may be incomplete or wrong. It cannot be
        used to approve: you must read the document itself.
      </p>
      {state.phase === "idle" && (
        <button type="button" className="button ai" onClick={request}>
          Summarise
        </button>
      )}
      {state.phase === "loading" && (
        <div className="ai-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>
            Preparing summary… {seconds > 0 && <span>{seconds}s</span>}
            <br />
            <span className="muted">Keep reading — you do not need to wait.</span>
          </p>
          <button type="button" className="button ghost small" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {state.phase === "failed" && (
        <div className="ai-error" role="alert">
          <p>{state.message}</p>
          <button type="button" className="button secondary small" onClick={request}>
            Try again
          </button>
        </div>
      )}
      {state.phase === "done" && (
        <>
          {stale && (
            <p className="alert alert-info" role="status">
              The document changed after this summary was made. Generate a new one.
            </p>
          )}
          {state.points.length === 0 ? (
            <p className="muted">The document is too short to summarise. Read it in full.</p>
          ) : (
            <ol className="ai-points">
              {state.points.map((point, i) => (
                <li key={`${point.paragraph}-${i}`}>
                  <p>{point.text}</p>
                  <a
                    href={`#para-${point.paragraph}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onCite(point.paragraph);
                    }}
                  >
                    Source: {point.section ?? paragraphTitle(point.paragraph) ?? `paragraph ${point.paragraph + 1}`}
                    <span className="visually-hidden"> — go to paragraph {point.paragraph + 1} in the document</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="button ghost small" onClick={request}>
            Generate again
          </button>
        </>
      )}
    </section>
  );
}
