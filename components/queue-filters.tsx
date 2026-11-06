"use client";

import { types } from "@/lib/domain";
import { defaultFilters, priorities, sortLabels, type Priority, type QueueFilters, type SortKey } from "@/lib/queue";

export default function QueueFilterBar({
  filters,
  onChange,
  counts,
  showPriority = true,
}: {
  filters: QueueFilters;
  onChange: (update: Partial<QueueFilters>) => void;
  counts?: Record<Priority, number>;
  showPriority?: boolean;
}) {
  const active =
    filters.search || filters.type !== "all" || filters.from || filters.to || filters.priority !== "all";
  return (
    <div className="filters" role="search" aria-label="Filter documents">
      <div className="filter-grid">
        <label className="field field-search">
          <span>Search by title or reference</span>
          <input type="search" value={filters.search} onChange={(e) => onChange({ search: e.target.value })} placeholder="e.g. budget, HF-0105" />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={filters.type} onChange={(e) => onChange({ type: e.target.value })}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reached stage from</span>
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
        </label>
        <label className="field">
          <span>Reached stage to</span>
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
        </label>
        <label className="field">
          <span>Sort</span>
          <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
            {Object.entries(sortLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-row">
        {showPriority && counts && (
          <div className="pills" role="group" aria-label="Waiting time">
            {priorities.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pill pill-${p.id}`}
                aria-pressed={filters.priority === p.id}
                onClick={() => onChange({ priority: p.id })}
              >
                {p.label} <span className="pill-count">{counts[p.id]}</span>
                <span className="visually-hidden">: {p.detail}</span>
              </button>
            ))}
          </div>
        )}
        {active && (
          <button
            type="button"
            className="button ghost small"
            onClick={() => onChange({ ...defaultFilters, sort: filters.sort })}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
