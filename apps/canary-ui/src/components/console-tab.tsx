"use client";

import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { type ComponentType, type ReactNode, useMemo, useState } from "react";
import { fmtTimeOfDay } from "@/lib/format";
import type { ConsoleEntry } from "@/lib/parse-console";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { Pager, usePaged } from "./pager";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Level = "error" | "warning" | "info" | "log";

const LEVELS: { id: Level | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "error", label: "Errors" },
  { id: "warning", label: "Warnings" },
  { id: "info", label: "Info" },
  { id: "log", label: "Logs" },
];

const LEVEL_LABEL: Record<Level, string> = {
  error: "Error",
  info: "Info",
  log: "Log",
  warning: "Warning",
};

const ICON: Record<Level, ComponentType<{ className?: string }> | null> = {
  error: CircleAlert,
  info: Info,
  log: null,
  warning: TriangleAlert,
};

function iconColor(level: Level): string {
  if (level === "error") {
    return "text-fail";
  }
  if (level === "warning") {
    return "text-warn";
  }
  if (level === "info") {
    return "text-muted-foreground";
  }
  return "text-faint";
}

function levelOf(e: ConsoleEntry): Level {
  if (e.kind === "pageerror") {
    return "error";
  }
  const t = (e.type ?? "log").toLowerCase();
  if (t === "error") {
    return "error";
  }
  if (t === "warning" || t === "warn") {
    return "warning";
  }
  if (t === "info") {
    return "info";
  }
  return "log";
}

function textOf(e: ConsoleEntry): string {
  return e.message ?? e.text ?? "";
}

function sourceOf(e: ConsoleEntry): string {
  if (!e.url) {
    return "";
  }
  return e.line ? `${e.url}:${e.line}` : e.url;
}

// Compact a source location to a DevTools-style tail ("host/lastSegment:line"),
// mirroring the URL helpers in network-tab.tsx. A raw `truncate` would show the
// useless head of the URL; this keeps the meaningful tail. Pure + total: never
// throws, never empties a present source.
function compactSource(src: string): string {
  if (!src) {
    return "";
  }
  const lineMatch = src.match(/:(\d+)$/);
  const line = lineMatch ? `:${lineMatch[1]}` : "";
  const base = lineMatch ? src.slice(0, lineMatch.index) : src;

  let label: string;
  try {
    const u = new URL(base);
    const seg = u.pathname.split("/").filter(Boolean).at(-1);
    label = seg ? `${u.host}/${seg}` : u.host;
  } catch {
    // Not an absolute URL (bare path, webpack-internal:///…, etc.): strip a
    // scheme-ish prefix and keep the last path segment.
    const stripped = base.replace(/^[a-z]+:\/+/i, "") || base;
    label = stripped.split("/").filter(Boolean).at(-1) ?? stripped;
  }
  return `${label}${line}`;
}

interface Row {
  entry: ConsoleEntry;
  idx: number;
  level: Level;
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="mb-5 last:mb-0">
      <h4 className="mb-1.5 font-bold text-[11px] text-faint uppercase tracking-wide">
        {title}
      </h4>
      {children}
    </div>
  );
}

function MetaRow({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,120px)_1fr] gap-3 py-1.5">
      <dt className="truncate font-medium text-[12px] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("break-all text-[12px]", mono && "font-mono")}>
        {value}
      </dd>
    </div>
  );
}

function ConsoleRow({
  compact,
  hasTime,
  onSelect,
  row,
  selected,
}: {
  compact: boolean;
  hasTime: boolean;
  onSelect: (idx: number) => void;
  row: Row;
  selected: boolean;
}) {
  const { entry, idx, level } = row;
  const Icon = ICON[level];
  const src = sourceOf(entry);
  const time = fmtTimeOfDay(entry.ts);
  let gridCols = "grid-cols-[16px_minmax(0,1fr)_fit-content(40%)]";
  if (compact) {
    gridCols = "grid-cols-[16px_minmax(0,1fr)]";
  } else if (hasTime) {
    gridCols = "grid-cols-[16px_auto_minmax(0,1fr)_fit-content(40%)]";
  }
  return (
    <button
      className={cn(
        "grid w-full items-center gap-x-2 px-3 py-1 text-left transition-colors hover:bg-well/60",
        gridCols,
        selected && "bg-well"
      )}
      onClick={() => onSelect(idx)}
      type="button"
    >
      <span className="flex items-center justify-center">
        {Icon ? <Icon className={cn("size-3.5", iconColor(level))} /> : null}
      </span>
      {!compact && hasTime ? (
        <span className="whitespace-nowrap text-[11px] text-faint tabular-nums">
          {time}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{textOf(entry)}</span>
      {!compact && src ? (
        <span
          className="truncate text-right text-[11px] text-faint"
          title={src}
        >
          {compactSource(src)}
        </span>
      ) : null}
    </button>
  );
}

function ConsoleDetail({
  entry,
  level,
  onClose,
}: {
  entry: ConsoleEntry;
  level: Level;
  onClose: () => void;
}) {
  const Icon = ICON[level];
  const msg = textOf(entry);
  const time = fmtTimeOfDay(entry.ts);
  return (
    <div className="fade-in-0 max-lg:slide-in-from-bottom-2 lg:slide-in-from-right-4 flex w-full animate-in flex-col border-border border-t duration-200 lg:w-[480px] lg:max-w-[50%] lg:border-t-0 lg:border-l">
      <div className="flex shrink-0 items-center gap-2 border-border border-b px-4 py-2.5">
        {Icon ? (
          <Icon className={cn("size-4 shrink-0", iconColor(level))} />
        ) : null}
        <span className="min-w-0 flex-1 truncate font-semibold text-sm">
          {LEVEL_LABEL[level]}
        </span>
        <CopyButton label="Copy" text={msg} title="Copy message" />
        <Button
          aria-label="Close details"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <X />
        </Button>
      </div>

      <div className="scrollbar-none max-h-[60vh] overflow-auto overscroll-none px-4 py-3 lg:max-h-none lg:min-h-0 lg:flex-1">
        <Section title="Message">
          <pre className="overflow-auto whitespace-pre-wrap rounded border border-border bg-well-2 p-3 font-mono text-[12px]">
            {msg}
          </pre>
        </Section>
        <Section title="Details">
          <dl className="divide-y divide-border/60">
            <MetaRow label="Level" value={LEVEL_LABEL[level]} />
            {time ? <MetaRow label="Time" mono value={time} /> : null}
            {entry.url ? (
              <MetaRow label="Source" mono value={entry.url} />
            ) : null}
            {entry.line ? (
              <MetaRow
                label="Location"
                mono
                value={`${entry.line}:${entry.col ?? 0}`}
              />
            ) : null}
            {entry.kind ? <MetaRow label="Kind" value={entry.kind} /> : null}
          </dl>
        </Section>
      </div>
    </div>
  );
}

export function ConsoleTab({ entries }: { entries: ConsoleEntry[] }) {
  const [level, setLevel] = useState<Level | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const rows = useMemo<Row[]>(
    () => entries.map((e, idx) => ({ entry: e, idx, level: levelOf(e) })),
    [entries]
  );

  const counts = useMemo(() => {
    const c: Record<Level, number> = { error: 0, info: 0, log: 0, warning: 0 };
    for (const r of rows) {
      c[r.level]++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (level !== "all" && r.level !== level) {
        return false;
      }
      if (q && !textOf(r.entry).toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, level, query]);

  const paged = usePaged(visible, 50);

  const hasTime = useMemo(() => rows.some((r) => r.entry.ts != null), [rows]);

  const sel =
    selected == null ? null : (rows.find((r) => r.idx === selected) ?? null);
  const compact = sel != null;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 flex-col gap-2.5 border-border border-b px-4 py-3">
        <Input
          className="h-8 w-full"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter messages"
          type="search"
          value={query}
        />
        <div className="flex flex-wrap gap-1">
          {LEVELS.map((l) => {
            const n = l.id === "all" ? rows.length : counts[l.id];
            return (
              <button
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium text-[12px] text-muted-foreground hover:bg-well",
                  level === l.id && "bg-primary/15 text-foreground"
                )}
                key={l.id}
                onClick={() => setLevel(l.id)}
                type="button"
              >
                {l.label}
                {(l.id === "all" || n > 0) && (
                  <span className="ml-1 text-faint tabular-nums">{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {entries.length === 0 && (
        <div className="p-10 text-center text-faint italic">
          No console output captured.
        </div>
      )}
      {entries.length > 0 && visible.length === 0 && (
        <div className="p-8 text-center text-[13px] text-faint italic">
          No messages match the filter.
        </div>
      )}
      {entries.length > 0 && visible.length > 0 && (
        <>
          <div className="flex min-h-0 flex-col lg:flex-row">
            <div className="scrollbar-none min-w-0 flex-1 divide-y divide-border/60 overflow-y-auto overscroll-none font-mono text-[12px]">
              {paged.slice.map((row) => (
                <ConsoleRow
                  compact={compact}
                  hasTime={hasTime}
                  key={row.idx}
                  onSelect={(i) =>
                    setSelected((prev) => (prev === i ? null : i))
                  }
                  row={row}
                  selected={row.idx === selected}
                />
              ))}
            </div>
            {sel ? (
              <ConsoleDetail
                entry={sel.entry}
                level={sel.level}
                onClose={() => setSelected(null)}
              />
            ) : null}
          </div>
          <div className="shrink-0 border-border border-t px-4 py-2.5">
            <Pager paged={paged} />
          </div>
        </>
      )}
    </div>
  );
}
