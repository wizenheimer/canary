"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

export interface Paged<T> {
  page: number;
  pageCount: number;
  pageSize: number;
  setPage: (p: number) => void;
  slice: T[];
  start: number;
  total: number;
}

// Client-side pagination: slice `items` into pages. The rendered page is always
// clamped to the available range, so a shrinking (filtered) set falls back onto
// the last valid page rather than going blank.
export function usePaged<T>(items: T[], pageSize: number): Paged<T> {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(page, pageCount - 1);
  const start = safe * pageSize;
  return {
    page: safe,
    pageCount,
    pageSize,
    setPage,
    slice: items.slice(start, start + pageSize),
    start,
    total: items.length,
  };
}

export function Pager<T>({ paged }: { paged: Paged<T> }) {
  const { page, pageCount, pageSize, setPage, start, total } = paged;
  if (total === 0) {
    return null;
  }
  const from = start + 1;
  const to = Math.min(start + pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 px-1 text-[13px] text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            Page {page + 1} / {pageCount}
          </span>
          <Button
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
