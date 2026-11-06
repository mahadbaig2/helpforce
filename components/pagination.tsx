export default function Pagination({
  page,
  pages,
  start,
  end,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  start: number;
  end: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <p aria-live="polite">
        Showing {start}–{end} of {total}
      </p>
      {pages > 1 && (
        <div className="pagination-buttons">
          <button type="button" className="button secondary small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous<span className="visually-hidden"> page</span>
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="button secondary small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next<span className="visually-hidden"> page</span>
          </button>
        </div>
      )}
    </nav>
  );
}
