import { Icon } from "@/components/Icon";
import { WARREN_COLORS } from "@/lib/tokens";

type PaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
};

function visiblePages(currentPage: number, totalPages: number) {
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function Pagination({ page, pageSize, totalItems, isLoading = false, onPageChange, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className={["flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2", className]
        .filter(Boolean)
        .join(" ")}
      style={{ borderColor: WARREN_COLORS.line }}
    >
      <p className="text-[12px]" style={{ color: WARREN_COLORS.sub }}>
        Showing {from}-{to} of {totalItems}
        {isLast ? " - end of feed" : null}
      </p>
      <div className="flex items-center gap-1">
        <button
          aria-label="Previous page"
          className="warren-focus inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white disabled:opacity-40"
          disabled={isFirst || isLoading}
          onClick={() => onPageChange(page - 1)}
          style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.ink }}
          type="button"
        >
          <Icon name="chevronLeft" size={15} />
        </button>
        {visiblePages(page, totalPages).map((item) => (
          <button
            aria-current={item === page ? "page" : undefined}
            className="warren-focus h-8 min-w-8 rounded-lg px-2 text-[12px] font-bold tabular-nums"
            disabled={isLoading}
            key={item}
            onClick={() => onPageChange(item)}
            style={{
              background: item === page ? WARREN_COLORS.ink : WARREN_COLORS.cream,
              border: `1px solid ${item === page ? WARREN_COLORS.ink : WARREN_COLORS.line}`,
              color: item === page ? WARREN_COLORS.white : WARREN_COLORS.sub,
            }}
            type="button"
          >
            {item}
          </button>
        ))}
        <button
          aria-label="Next page"
          className="warren-focus inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white disabled:opacity-40"
          disabled={isLast || isLoading}
          onClick={() => onPageChange(page + 1)}
          style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.ink }}
          type="button"
        >
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </nav>
  );
}
