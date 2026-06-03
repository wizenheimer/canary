"use client";

import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { type ComponentType, useMemo, useState } from "react";
import type { ConsoleEntry } from "@/lib/parse-console";
import { cn } from "@/lib/utils";
import { Pager, usePaged } from "./pager";
import { Input } from "./ui/input";

type Level = "error" | "warning" | "info" | "log";

const LEVELS: { id: Level | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "error", label: "Errors" },
  { id: "warning", label: "Warnings" },
  { id: "info", label: "Info" },
  { id: "log", label: "Logs" },
];

const ICON: Record<Level, ComponentType<{ className?: string }> | null> = {
  error: CircleAlert,
  info: Info,
  log: null,
  warning: TriangleAlert,
};

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

export function ConsoleTab({ entries }: { entries: ConsoleEntry[] }) {
  const [level, setLevel] = useState<Level | "all">("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => entries.map((e) => ({ entry: e, level: levelOf(e) })),
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

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-border border-b px-4 py-2.5">
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
                <span className="ml-1 text-faint tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        <Input
          className="ml-auto h-8 w-48"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter messages"
          type="search"
          value={query}
        />
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
        <div className="divide-y divide-border/60 font-mono text-[12px]">
          {paged.slice.map(({ entry, level: lvl }, i) => {
            const Icon = ICON[lvl];
            const src = sourceOf(entry);
            return (
              <div
                className={cn(
                  "flex items-start gap-2 px-4 py-1.5",
                  lvl === "error" && "bg-fail-bg",
                  lvl === "warning" && "bg-warn-bg"
                )}
                key={i}
              >
                <span className="mt-0.5 w-4 shrink-0">
                  {Icon ? (
                    <Icon
                      className={cn(
                        "size-3.5",
                        lvl === "error" && "text-fail",
                        lvl === "warning" && "text-warn",
                        lvl === "info" && "text-muted-foreground"
                      )}
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 whitespace-pre-wrap break-words",
                    lvl === "error" && "text-on-fail",
                    lvl === "warning" && "text-warn"
                  )}
                >
                  {textOf(entry)}
                </span>
                {src ? (
                  <span className="shrink-0 truncate text-[11px] text-faint">
                    {src}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {entries.length > 0 && visible.length > 0 ? (
        <div className="border-border border-t px-4 py-2.5">
          <Pager paged={paged} />
        </div>
      ) : null}
    </div>
  );
}
