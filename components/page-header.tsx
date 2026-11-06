"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Page title block. On every screen change it moves keyboard focus to the
 * heading (so focus is never stranded on a removed button) and sets the
 * browser tab title.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A new screen starts at the top, with focus on its heading.
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <header className="page-header">
      <title>{`${title} · Helpforce`}</title>
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {description && <p className="page-description">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
