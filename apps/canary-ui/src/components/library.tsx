"use client";

import {
  ArrowUpDown,
  Film,
  Folder,
  Monitor,
  MoreHorizontal,
  Search,
} from "lucide-react";
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { fmtMs, fmtRelative } from "@/lib/format";
import type { SessionCard } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./app-sidebar";
import {
  MultiSelect,
  type MultiSelectOption,
  SingleSelect,
} from "./multi-select";
import { Pager, usePaged } from "./pager";
import { EmptyState, Notice, Spinner, StatusBadge, StatusIcon } from "./ui";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export interface Root {
  id: string;
  isDefault?: boolean;
  label: string;
  path: string;
}

interface ListResponse {
  folders: string[];
  root: Root;
  sessions: SessionCard[];
  trashCount: number;
}

export type Selection =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "folder"; path: string }
  | { kind: "trash" };

type DialogState =
  | { type: "addRoot" }
  | { type: "newFolder" }
  | { type: "renameFolder"; path: string }
  | { type: "move"; id: string; current: string | null; name: string }
  | { type: "tags"; id: string; tags: string[]; name: string }
  | { type: "note"; id: string; note: string; name: string };

type StatusValue = "passed" | "failed" | "aborted";

type SortKey = "newest" | "oldest" | "name" | "duration";

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function artifactSrc(rootId: string, id: string, rel: string): string {
  const params = new URLSearchParams({ id, path: rel, root: rootId });
  return `/api/artifact?${params}`;
}

function inFolder(card: SessionCard, path: string): boolean {
  return card.folder === path || (card.folder?.startsWith(`${path}/`) ?? false);
}

function matchesSelection(card: SessionCard, sel: Selection): boolean {
  switch (sel.kind) {
    case "all":
      return true;
    case "unfiled":
      return card.folder === null;
    case "folder":
      return inFolder(card, sel.path);
    default:
      return false;
  }
}

function matchesSearch(card: SessionCard, q: string): boolean {
  if (!q) {
    return true;
  }
  const hay = [card.name, card.id, card.note ?? "", ...card.tags]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function sortComparator(sort: SortKey) {
  return (a: SessionCard, b: SessionCard) => {
    switch (sort) {
      case "oldest":
        return a.createdAt.localeCompare(b.createdAt);
      case "name":
        return a.name.localeCompare(b.name);
      case "duration":
        return b.durationMs - a.durationMs;
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  };
}

// ?sel encoding: "all" is the default (omitted), "unfiled"/"trash" map to those
// views, and anything else is a folder path stored verbatim.
function toSelection(sel: string): Selection {
  switch (sel) {
    case "unfiled":
      return { kind: "unfiled" };
    case "trash":
      return { kind: "trash" };
    case "all":
      return { kind: "all" };
    default:
      return { kind: "folder", path: sel };
  }
}

function fromSelection(s: Selection): string | null {
  if (s.kind === "folder") {
    return s.path;
  }
  if (s.kind === "all") {
    return null;
  }
  return s.kind;
}

// Filters + the active selection live in the URL (?q, ?status, ?tags, ?sort,
// ?sel) so any view of the dashboard is shareable; transient UI stays local.
const STATUS_OPTIONS: MultiSelectOption[] = [
  {
    value: "passed",
    label: "Passed",
    icon: <span className="block size-2 rounded-full bg-primary" />,
  },
  {
    value: "failed",
    label: "Failed",
    icon: <span className="block size-2 rounded-full bg-fail" />,
  },
  {
    value: "aborted",
    label: "Aborted",
    icon: <span className="block size-2 rounded-full bg-warn" />,
  },
];
const STATUS_PARSER = parseAsArrayOf(
  parseAsStringLiteral(["passed", "failed", "aborted"] as const)
).withDefault([]);
const TAGS_PARSER = parseAsArrayOf(parseAsString).withDefault([]);
const SORT_PARSER = parseAsStringLiteral([
  "newest",
  "oldest",
  "name",
  "duration",
] as const).withDefault("newest");
const SORT_OPTIONS: MultiSelectOption[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Name (A–Z)", value: "name" },
  { label: "Longest first", value: "duration" },
];
// Quiet status indicator for the list cards — a small tinted StatusIcon on the
// right edge whose label lives in a tooltip, instead of a loud inline badge.
const STATUS_COLOR: Record<string, string> = {
  aborted: "text-warn",
  failed: "text-fail",
  passed: "text-primary",
};

function StatusHint({ status }: { status: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={status}
          className={cn("inline-flex", STATUS_COLOR[status] ?? "text-faint")}
          role="img"
        >
          <StatusIcon status={status} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="capitalize">{status}</TooltipContent>
    </Tooltip>
  );
}

export default function Library() {
  const [roots, setRoots] = useState<Root[]>([]);
  const [currentRootId, setCurrentRootId] = useState<string | null>(null);
  const [list, setList] = useState<ListResponse | null>(null);
  const [trash, setTrash] = useState<SessionCard[]>([]);
  const [sel, setSel] = useQueryState("sel", parseAsString.withDefault("all"));
  const selection = toSelection(sel);
  const setSelection = useCallback(
    (s: Selection) => {
      void setSel(fromSelection(s));
    },
    [setSel]
  );
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [statuses, setStatuses] = useQueryState("status", STATUS_PARSER);
  const [tags, setTags] = useQueryState("tags", TAGS_PARSER);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [sort, setSort] = useQueryState("sort", SORT_PARSER);

  // Monotonic token so an out-of-order loadList response (after a rapid root
  // switch) can't overwrite the current root's list.
  const loadSeq = useRef(0);

  const loadRoots = useCallback(async () => {
    try {
      const r = await fetch("/api/roots");
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      const data = (await r.json()) as {
        lastRootId?: string;
        roots?: Root[];
      };
      if (!Array.isArray(data.roots)) {
        throw new Error("malformed /api/roots response");
      }
      const { roots: loaded } = data;
      setRoots(loaded);
      setCurrentRootId(
        (prev) => prev ?? data.lastRootId ?? loaded[0]?.id ?? null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadList = useCallback(async (rootId: string) => {
    const seq = ++loadSeq.current;
    setError(null);
    try {
      const r = await fetch(`/api/sessions?root=${encodeURIComponent(rootId)}`);
      // A newer load started while this one was in flight — drop the stale result.
      if (seq !== loadSeq.current) {
        return;
      }
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as ListResponse;
      if (seq !== loadSeq.current) {
        return;
      }
      setList(data);
    } catch (e) {
      if (seq !== loadSeq.current) {
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadTrashList = useCallback(async (rootId: string) => {
    try {
      const r = await fetch(
        `/api/sessions?root=${encodeURIComponent(rootId)}&view=trash`
      );
      if (r.ok) {
        const d = (await r.json()) as { sessions: SessionCard[] };
        setTrash(d.sessions);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadRoots();
  }, [loadRoots]);

  useEffect(() => {
    if (currentRootId) {
      loadList(currentRootId);
    }
  }, [currentRootId, loadList]);

  const viewingTrash = selection.kind === "trash";
  useEffect(() => {
    if (currentRootId && viewingTrash) {
      loadTrashList(currentRootId);
    }
  }, [currentRootId, viewingTrash, loadTrashList]);

  const switchRoot = (id: string) => {
    setCurrentRootId(id);
    setSelection({ kind: "all" });
    setList(null);
    void postJson("/api/roots", { action: "select", id });
  };

  const removeRoot = async () => {
    if (!currentRootId) {
      return;
    }
    await postJson("/api/roots", { action: "remove", id: currentRootId });
    setCurrentRootId(null);
    setList(null);
    await loadRoots();
  };

  const overlayOp = async (body: Record<string, unknown>) => {
    if (!currentRootId) {
      return;
    }
    await postJson("/api/overlay", { ...body, root: currentRootId });
    await loadList(currentRootId);
  };

  const trashOp = async (body: Record<string, unknown>) => {
    if (!currentRootId) {
      return;
    }
    await postJson("/api/trash", { ...body, root: currentRootId });
    await loadList(currentRootId);
    if (selection.kind === "trash") {
      await loadTrashList(currentRootId);
    }
  };

  const folders = list?.folders ?? [];
  const sessions = list?.sessions ?? [];
  const allTags = [...new Set(sessions.flatMap((c) => c.tags))].sort();
  const visible = sessions
    .filter((c) => matchesSelection(c, selection))
    .filter((c) => statuses.length === 0 || statuses.includes(c.status))
    .filter((c) => tags.length === 0 || c.tags.some((t) => tags.includes(t)))
    .filter((c) => matchesSearch(c, search))
    .sort(sortComparator(sort));
  const paged = usePaged(visible, 24);
  const hasFilters =
    search.trim().length > 0 || statuses.length > 0 || tags.length > 0;
  const clearFilters = () => {
    void setSearch("");
    void setStatuses([]);
    void setTags([]);
  };
  const emptySessions = hasFilters ? (
    <EmptyState
      action={
        <Button onClick={clearFilters} size="sm" variant="outline">
          Clear filters
        </Button>
      }
      description="Try a different search or filter."
      illustration="search"
      title="No matching sessions"
    />
  ) : (
    <EmptyState
      description="Recorded sessions show up here."
      illustration="sessions"
      title="No sessions yet"
    />
  );

  const countFor = (sel: Selection) =>
    sessions.filter((c) => matchesSelection(c, sel)).length;

  const selectionTitle = (() => {
    switch (selection.kind) {
      case "all":
        return "All sessions";
      case "unfiled":
        return "Unfiled";
      case "folder":
        return selection.path;
      default:
        return "Trash";
    }
  })();

  const selectionSubtitle = (() => {
    switch (selection.kind) {
      case "all":
        return "View and manage your testing sessions.";
      case "unfiled":
        return "Sessions not yet filed into a folder.";
      case "folder":
        return "Sessions filed in this folder.";
      default:
        return "Deleted sessions, kept until you empty the trash.";
    }
  })();

  if (!currentRootId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-10">
        {error ? <Notice error>Could not load: {error}</Notice> : <Spinner />}
      </main>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar
        countForFolder={(path) => countFor({ kind: "folder", path })}
        currentRootId={currentRootId}
        folders={folders}
        isDefaultRoot={list?.root.isDefault ?? false}
        onAddSource={() => setDialog({ type: "addRoot" })}
        onDeleteFolder={async (path) => {
          await overlayOp({ op: "deleteFolder", path });
          setSelection({ kind: "all" });
        }}
        onNewFolder={() => setDialog({ type: "newFolder" })}
        onRefresh={() => {
          loadList(currentRootId);
          if (viewingTrash) {
            loadTrashList(currentRootId);
          }
        }}
        onRemoveRoot={removeRoot}
        onRenameFolder={(path) => setDialog({ path, type: "renameFolder" })}
        onSelect={setSelection}
        onSwitchRoot={switchRoot}
        roots={roots}
        selection={selection}
        sessionsCount={sessions.length}
        trashCount={list?.trashCount ?? 0}
        unfiledCount={countFor({ kind: "unfiled" })}
      />
      {/* Pin the header + filter bar on desktop and scroll only the session
          grid; below md the page scrolls naturally (the min-h-0/overflow
          classes are inert without the viewport-height constraint). */}
      <SidebarInset className="md:h-svh md:overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2.5 border-border border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="min-w-0 py-1">
            <h1 className="truncate font-bold text-lg leading-tight tracking-tight">
              {selectionTitle}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground leading-snug">
              {selectionSubtitle}
            </p>
          </div>
        </header>

        <div className="flex min-h-0 w-full flex-1 flex-col px-4 pt-4 pb-20 md:pb-4">
          <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-full pl-8"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, id, tag, note…"
                type="search"
                value={search}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <MultiSelect
                label="Status"
                onChange={(next) => void setStatuses(next as StatusValue[])}
                options={STATUS_OPTIONS}
                selected={statuses}
              />
              {allTags.length > 0 ? (
                <MultiSelect
                  label="Tags"
                  onChange={(next) => void setTags(next)}
                  options={allTags.map((t) => ({ label: t, value: t }))}
                  selected={tags}
                />
              ) : null}
              <SingleSelect
                ariaLabel="Sort sessions"
                onChange={(v) => void setSort(v as SortKey)}
                options={SORT_OPTIONS}
                triggerIcon={
                  <ArrowUpDown className="size-3.5 text-muted-foreground" />
                }
                value={sort}
              />
            </div>
            <div className="hidden sm:block sm:flex-1" />
            {viewingTrash && trash.length > 0 ? (
              <Button
                onClick={() => trashOp({ action: "empty" })}
                size="sm"
                variant="destructive"
              >
                Empty trash
              </Button>
            ) : null}
          </div>

          {error ? <Notice error>{error}</Notice> : null}

          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-none">
            {viewingTrash ? (
              <TrashGrid
                emptyState={
                  <EmptyState
                    description="Deleted sessions land here."
                    illustration="trash"
                    title="Trash is empty"
                  />
                }
                onDelete={(id) => trashOp({ action: "delete", id })}
                onRestore={(id) => trashOp({ action: "restore", id })}
                sessions={trash}
              />
            ) : (
              <SessionGrid
                emptyState={emptySessions}
                onMove={(c) =>
                  setDialog({
                    current: c.folder,
                    id: c.id,
                    name: c.name,
                    type: "move",
                  })
                }
                onNote={(c) =>
                  setDialog({
                    id: c.id,
                    name: c.name,
                    note: c.note ?? "",
                    type: "note",
                  })
                }
                onTags={(c) =>
                  setDialog({
                    id: c.id,
                    name: c.name,
                    tags: c.tags,
                    type: "tags",
                  })
                }
                onTrash={(id) => trashOp({ action: "trash", id })}
                rootId={currentRootId}
                sessions={paged.slice}
              />
            )}
          </div>
          {viewingTrash || visible.length === 0 ? null : (
            <div className="mt-4 shrink-0">
              <Pager paged={paged} />
            </div>
          )}
        </div>
      </SidebarInset>

      {dialog ? (
        <Dialogs
          dialog={dialog}
          folders={folders}
          onAddRoot={async (dir, label) => {
            const r = await postJson("/api/roots", {
              action: "add",
              label,
              path: dir,
            });
            if (r.ok) {
              const { root } = (await r.json()) as { root: Root };
              setCurrentRootId(root.id);
              setSelection({ kind: "all" });
              setList(null);
              await loadRoots();
            }
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
          onCreateFolder={async (path) => {
            await overlayOp({ op: "createFolder", path });
            setDialog(null);
          }}
          onMove={async (id, folder) => {
            await overlayOp({ folder, id, op: "move" });
            setDialog(null);
          }}
          onNote={async (id, note) => {
            await overlayOp({ id, note, op: "note" });
            setDialog(null);
          }}
          onRenameFolder={async (from, to) => {
            await overlayOp({ from, op: "renameFolder", to });
            if (selection.kind === "folder" && selection.path === from) {
              setSelection({ kind: "folder", path: to });
            }
            setDialog(null);
          }}
          onTags={async (id, tags) => {
            await overlayOp({ id, op: "tags", tags });
            setDialog(null);
          }}
        />
      ) : null}
    </SidebarProvider>
  );
}

interface SessionListProps {
  onMove: (c: SessionCard) => void;
  onNote: (c: SessionCard) => void;
  onTags: (c: SessionCard) => void;
  onTrash: (id: string) => void;
  rootId: string;
  sessions: SessionCard[];
}

function SessionActionsMenu({
  c,
  onMove,
  onNote,
  onTags,
  onTrash,
}: { c: SessionCard } & Omit<SessionListProps, "rootId" | "sessions">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Session actions" size="icon-sm" variant="ghost">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onMove(c)}>
          Move to folder…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onTags(c)}>
          Edit tags…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onNote(c)}>
          Edit note…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onTrash(c.id)} variant="destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionThumb({
  alt,
  hasVideo,
  src,
}: {
  alt: string;
  hasVideo: boolean;
  src: string | null;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-20 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-well text-faint">
      {hasVideo ? <Film className="size-5" /> : <Monitor className="size-5" />}
      {src && !failed ? (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: <img onError> is the standard broken-thumbnail fallback, not a user interaction
        <img
          alt={alt}
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
          src={src}
        />
      ) : null}
    </div>
  );
}

function SessionGrid({
  emptyState,
  onMove,
  onNote,
  onTags,
  onTrash,
  rootId,
  sessions,
}: SessionListProps & { emptyState: ReactNode }) {
  if (sessions.length === 0) {
    return <>{emptyState}</>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {sessions.map((c) => (
        <div
          className="group flex items-center gap-3 rounded-xl border border-border bg-card transition-colors hover:border-ink-strong"
          key={c.id}
        >
          <a
            className="flex min-w-0 flex-1 items-center gap-4 rounded-l-xl py-4 pl-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/s/${rootId}/${c.id}`}
          >
            <SessionThumb
              alt={`Preview of ${c.name}`}
              hasVideo={c.hasVideo}
              src={c.thumbnail ? artifactSrc(rootId, c.id, c.thumbnail) : null}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-base tracking-tight">
                  {c.name}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
                <span>{fmtRelative(c.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <span>{fmtMs(c.durationMs)}</span>
                <span className="hidden flex-wrap items-center gap-x-2 gap-y-1 sm:flex">
                  <span aria-hidden="true">·</span>
                  <span>
                    {c.stepsPassed}/{c.stepsTotal} steps
                  </span>
                  {c.consoleErrors > 0 ? (
                    <span className="font-semibold text-fail">
                      {c.consoleErrors} console
                    </span>
                  ) : null}
                  {c.networkFailures > 0 ? (
                    <span className="font-semibold text-fail">
                      {c.networkFailures} network
                    </span>
                  ) : null}
                  {c.folder ? (
                    <span className="flex items-center gap-1">
                      <Folder className="size-3.5" /> {c.folder}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </a>
          <div className="flex shrink-0 items-center gap-2.5 py-4 pr-4">
            <span className="hidden items-center gap-2 sm:flex">
              {c.tags.slice(0, 2).map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
              {c.tags.length > 2 ? (
                <Badge variant="secondary">+{c.tags.length - 2}</Badge>
              ) : null}
            </span>
            <StatusHint status={c.status} />
            <SessionActionsMenu
              c={c}
              onMove={onMove}
              onNote={onNote}
              onTags={onTags}
              onTrash={onTrash}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrashGrid({
  emptyState,
  onDelete,
  onRestore,
  sessions,
}: {
  emptyState: ReactNode;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  sessions: SessionCard[];
}) {
  if (sessions.length === 0) {
    return <>{emptyState}</>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      {sessions.map((c) => (
        <Card className="gap-3 p-5 shadow-none" key={c.id}>
          <div className="flex items-start gap-2.5">
            <StatusBadge small status={c.status} />
            <span className="min-w-0 break-words font-semibold text-base tracking-tight">
              {c.name}
            </span>
          </div>
          <div className="text-[13px] text-muted-foreground">
            {fmtRelative(c.createdAt)}
          </div>
          <div className="mt-auto flex gap-2">
            <Button onClick={() => onRestore(c.id)} size="sm" variant="outline">
              Restore
            </Button>
            <Button
              onClick={() => onDelete(c.id)}
              size="sm"
              variant="destructive"
            >
              Delete forever
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DialogLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label
      className="mt-3 mb-1.5 block font-semibold text-muted-foreground text-xs uppercase tracking-wide"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

function Dialogs({
  dialog,
  folders,
  onAddRoot,
  onClose,
  onCreateFolder,
  onMove,
  onNote,
  onRenameFolder,
  onTags,
}: {
  dialog: DialogState;
  folders: string[];
  onAddRoot: (dir: string, label: string) => void;
  onClose: () => void;
  onCreateFolder: (path: string) => void;
  onMove: (id: string, folder: string | null) => void;
  onNote: (id: string, note: string) => void;
  onRenameFolder: (from: string, to: string) => void;
  onTags: (id: string, tags: string[]) => void;
}) {
  const [text, setText] = useState(() => {
    if (dialog.type === "renameFolder") {
      return dialog.path;
    }
    if (dialog.type === "tags") {
      return dialog.tags.join(", ");
    }
    if (dialog.type === "note") {
      return dialog.note;
    }
    return "";
  });
  const [text2, setText2] = useState("");
  const [moveTarget, setMoveTarget] = useState(() =>
    dialog.type === "move" ? (dialog.current ?? "__unfiled__") : "__unfiled__"
  );
  const [moveNew, setMoveNew] = useState("");

  const body = (() => {
    if (dialog.type === "addRoot") {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Add a source folder</DialogTitle>
          </DialogHeader>
          <DialogLabel htmlFor="d-path">Folder path</DialogLabel>
          <Input
            id="d-path"
            onChange={(e) => setText(e.target.value)}
            placeholder="/path/to/sessions"
            value={text}
          />
          <DialogLabel htmlFor="d-label">Label (optional)</DialogLabel>
          <Input
            id="d-label"
            onChange={(e) => setText2(e.target.value)}
            placeholder="My archive"
            value={text2}
          />
          <DialogFooter>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!text.trim()}
              onClick={() => onAddRoot(text.trim(), text2.trim())}
            >
              Add
            </Button>
          </DialogFooter>
        </>
      );
    }
    if (dialog.type === "newFolder") {
      return (
        <>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <DialogLabel htmlFor="d-folder">
            Folder path (use / for nesting)
          </DialogLabel>
          <Input
            id="d-folder"
            onChange={(e) => setText(e.target.value)}
            placeholder="Work/Checkout"
            value={text}
          />
          <DialogFooter>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!text.trim()}
              onClick={() => onCreateFolder(text.trim())}
            >
              Create
            </Button>
          </DialogFooter>
        </>
      );
    }
    if (dialog.type === "renameFolder") {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <DialogLabel htmlFor="d-rename">New path</DialogLabel>
          <Input
            id="d-rename"
            onChange={(e) => setText(e.target.value)}
            value={text}
          />
          <DialogFooter>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!text.trim()}
              onClick={() => onRenameFolder(dialog.path, text.trim())}
            >
              Rename
            </Button>
          </DialogFooter>
        </>
      );
    }
    if (dialog.type === "move") {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Move &ldquo;{dialog.name}&rdquo;</DialogTitle>
          </DialogHeader>
          <DialogLabel htmlFor="d-move">Folder</DialogLabel>
          <SingleSelect
            ariaLabel="Move to folder"
            className="w-full justify-between"
            onChange={setMoveTarget}
            options={[
              { label: "Unfiled", value: "__unfiled__" },
              ...folders.map((f) => ({ label: f, value: f })),
            ]}
            value={moveTarget}
          />
          <DialogLabel htmlFor="d-move-new">…or a new folder path</DialogLabel>
          <Input
            id="d-move-new"
            onChange={(e) => setMoveNew(e.target.value)}
            placeholder="Work/Checkout"
            value={moveNew}
          />
          <DialogFooter>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (moveNew.trim()) {
                  onMove(dialog.id, moveNew.trim());
                } else if (moveTarget === "__unfiled__") {
                  onMove(dialog.id, null);
                } else {
                  onMove(dialog.id, moveTarget);
                }
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </>
      );
    }
    if (dialog.type === "tags") {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Tags for &ldquo;{dialog.name}&rdquo;</DialogTitle>
          </DialogHeader>
          <DialogLabel htmlFor="d-tags">Comma-separated tags</DialogLabel>
          <Input
            id="d-tags"
            onChange={(e) => setText(e.target.value)}
            placeholder="smoke, nightly"
            value={text}
          />
          <DialogFooter>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() =>
                onTags(
                  dialog.id,
                  text
                    .split(",")
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0)
                )
              }
            >
              Save
            </Button>
          </DialogFooter>
        </>
      );
    }
    return (
      <>
        <DialogHeader>
          <DialogTitle>Note for &ldquo;{dialog.name}&rdquo;</DialogTitle>
        </DialogHeader>
        <DialogLabel htmlFor="d-note">Note</DialogLabel>
        <Textarea
          id="d-note"
          onChange={(e) => setText(e.target.value)}
          value={text}
        />
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={() => onNote(dialog.id, text)}>Save</Button>
        </DialogFooter>
      </>
    );
  })();

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-md">{body}</DialogContent>
    </Dialog>
  );
}
