"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export default function PdfPreview({
  url,
  name,
  onPageSeen,
  onUnavailable,
}: {
  url: string;
  name: string;
  /** Called once a page has rendered on screen, so reading progress can be tracked. */
  onPageSeen?: (page: number, total: number) => void;
  /** Called when the preview fails and the reader opens the original instead. */
  onUnavailable?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let document: PDFDocumentProxy | undefined;
    import("pdfjs-dist")
      .then(async ({ getDocument, GlobalWorkerOptions }) => {
        GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = getDocument({ url, withCredentials: true });
        try {
          document = await task.promise;
          if (active) setPdf(document);
          else await document.destroy();
        } catch {
          if (active) {
            setError("The PDF could not be previewed.");
            setLoading(false);
          }
        }
      })
      .catch(() => {
        if (active) {
          setError("The PDF viewer could not be loaded.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
      if (document) void document.destroy();
    };
  }, [url]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !width || !canvas.current) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    const render = async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (!active || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale: Math.min((width - 32) / base.width, 1.5) * zoom,
        });
        const surface = canvas.current;
        const context = surface.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const ratio = window.devicePixelRatio || 1;
        surface.width = Math.floor(viewport.width * ratio);
        surface.height = Math.floor(viewport.height * ratio);
        surface.style.width = `${viewport.width}px`;
        surface.style.height = `${viewport.height}px`;
        renderTask = pdfPage.render({
          canvas: surface,
          canvasContext: context,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        await renderTask.promise;
        if (active) {
          setError("");
          setLoading(false);
          onPageSeen?.(page, pdf.numPages);
        }
      } catch (cause) {
        if (
          active &&
          !(
            cause instanceof Error &&
            cause.name === "RenderingCancelledException"
          )
        ) {
          setError("The PDF could not be previewed.");
          setLoading(false);
        }
      }
    };
    void render();
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pdf, page, zoom, width, onPageSeen]);

  return (
    <div className="pdf-preview">
      <div className="pdf-toolbar">
        <strong title={name}>{name}</strong>
        <div className="pdf-controls">
          <button
            aria-label="Previous PDF page"
            disabled={!pdf || page <= 1}
            onClick={() => {
              setLoading(true);
              setPage((value) => value - 1);
            }}
          >
            ‹
          </button>
          <span aria-live="polite">{pdf ? `Page ${page} of ${pdf.numPages}` : "Loading PDF"}</span>
          <button
            aria-label="Next PDF page"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => {
              setLoading(true);
              setPage((value) => value + 1);
            }}
          >
            ›
          </button>
          <button
            aria-label="Zoom out"
            disabled={!pdf || zoom <= 0.8}
            onClick={() => {
              setLoading(true);
              setZoom((value) => Math.max(0.8, +(value - 0.2).toFixed(1)));
            }}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            disabled={!pdf || zoom >= 1.6}
            onClick={() => {
              setLoading(true);
              setZoom((value) => Math.min(1.6, +(value + 0.2).toFixed(1)));
            }}
          >
            +
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open full size<span className="visually-hidden"> (opens in a new tab)</span> ↗
          </a>
        </div>
      </div>
      <div
        className="pdf-stage"
        ref={frame}
        aria-label={`PDF preview of ${name}`}
      >
        {loading && !error && (
          <p className="pdf-loading" role="status">
            Loading PDF preview…
          </p>
        )}
        {error && (
          <p className="pdf-loading" role="alert">
            {error}{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={onUnavailable}>
              Open the original PDF (opens in a new tab)
            </a>
            .
          </p>
        )}
        <canvas ref={canvas} aria-label={`${name}, page ${page}`} role="img" />
      </div>
    </div>
  );
}
