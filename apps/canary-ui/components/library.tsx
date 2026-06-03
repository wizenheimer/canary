"use client";

import {
  Check,
  ChevronDown,
  Folder,
  FolderPlus,
  Inbox,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import Link from "next/link";
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
import { Pager, usePaged } from "./pager";
import { TopBar } from "./top-bar";
import { Notice, Spinner, StatusBadge } from "./ui";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Textarea } from "./ui/textarea";

interface Root {
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

type Selection =
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

type StatusFilter = "all" | "passed" | "failed" | "aborted";

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
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

export default function Library() {
  const [roots, setRoots] = useState<Root[]>([]);
  const [currentRootId, setCurrentRootId] = useState<string | null>(null);
  const [list, setList] = useState<ListResponse | null>(null);
  const [trash, setTrash] = useState<SessionCard[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [view, setView] = useState<"card" | "table">("table");

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

  // Restore the persisted list view (defaults to table for first-time users).
  useEffect(() => {
    const saved = window.localStorage.getItem("canary.sessionView");
    if (saved === "card" || saved === "table") {
      setView(saved);
    }
  }, []);

  const changeView = (v: "card" | "table") => {
    setView(v);
    window.localStorage.setItem("canary.sessionView", v);
  };

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
  const visible = sessions
    .filter((c) => matchesSelection(c, selection))
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => matchesSearch(c, search));
  const paged = usePaged(visible, 24);

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

  if (!currentRootId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-10">
        {error ? <Notice error>Could not load: {error}</Notice> : <Spinner />}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pt-10 pb-20">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="group flex items-center gap-2 rounded-md font-bold text-2xl tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
              >
                <span className="max-w-[60vw] truncate">{selectionTitle}</span>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[70vh] min-w-64 overflow-y-auto"
            >
              <DropdownMenuLabel>Source</DropdownMenuLabel>
              {roots.map((r) => (
                <DropdownMenuItem key={r.id} onSelect={() => switchRoot(r.id)}>
                  <span className="truncate">
                    {r.label}
                    {r.isDefault ? " (default)" : ""}
                  </span>
                  {r.id === currentRootId ? (
                    <Check className="ml-auto size-4 text-muted-foreground" />
                  ) : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => setDialog({ type: "addRoot" })}>
                <Plus /> Add source…
              </DropdownMenuItem>
              {list?.root.isDefault ? null : (
                <DropdownMenuItem onSelect={removeRoot} variant="destructive">
                  <Trash2 /> Remove source
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Folders</DropdownMenuLabel>
              <FolderItem
                active={selection.kind === "all"}
                count={sessions.length}
                icon={<Layers className="size-3.5" />}
                label="All sessions"
                onSelect={() => setSelection({ kind: "all" })}
              />
              <FolderItem
                active={selection.kind === "unfiled"}
                count={countFor({ kind: "unfiled" })}
                icon={<Inbox className="size-3.5" />}
                label="Unfiled"
                onSelect={() => setSelection({ kind: "unfiled" })}
              />
              {folders.map((path) => {
                const depth = path.split("/").length - 1;
                const label = path.split("/").at(-1) ?? path;
                return (
                  <FolderItem
                    active={
                      selection.kind === "folder" && selection.path === path
                    }
                    count={countFor({ kind: "folder", path })}
                    depth={depth}
                    icon={<Folder className="size-3.5" />}
                    key={path}
                    label={label}
                    onSelect={() => setSelection({ kind: "folder", path })}
                  />
                );
              })}
              <FolderItem
                active={selection.kind === "trash"}
                count={list?.trashCount ?? 0}
                icon={<Trash2 className="size-3.5" />}
                label="Trash"
                onSelect={() => setSelection({ kind: "trash" })}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDialog({ type: "newFolder" })}
              >
                <FolderPlus /> New folder…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {selection.kind === "folder" && (
            <>
              <Button
                onClick={() =>
                  setDialog({ path: selection.path, type: "renameFolder" })
                }
                size="sm"
                variant="outline"
              >
                Rename
              </Button>
              <Button
                onClick={async () => {
                  await overlayOp({ op: "deleteFolder", path: selection.path });
                  setSelection({ kind: "all" });
                }}
                size="sm"
                variant="destructive"
              >
                Delete folder
              </Button>
            </>
          )}
          {selection.kind === "trash" && trash.length > 0 && (
            <Button
              onClick={() => trashOp({ action: "empty" })}
              size="sm"
              variant="destructive"
            >
              Empty trash
            </Button>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-64 pl-8"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, id, tag, note…"
              type="search"
              value={search}
            />
          </div>
          <Select
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            value={statusFilter}
          >
            <SelectTrigger className="w-[150px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="aborted">Aborted</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          {viewingTrash ? null : (
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]",
                  view === "table"
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-well"
                )}
                onClick={() => changeView("table")}
                type="button"
              >
                <TableIcon className="size-4" /> Table
              </button>
              <button
                className={cn(
                  "flex items-center gap-1.5 border-border border-l px-2.5 py-1.5 text-[13px]",
                  view === "card"
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-well"
                )}
                onClick={() => changeView("card")}
                type="button"
              >
                <LayoutGrid className="size-4" /> Cards
              </button>
            </div>
          )}
        </div>

        {error ? <Notice error>{error}</Notice> : null}

        {viewingTrash ? (
          <TrashGrid
            onDelete={(id) => trashOp({ action: "delete", id })}
            onRestore={(id) => trashOp({ action: "restore", id })}
            sessions={trash}
          />
        ) : (
          <SessionList
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
              setDialog({ id: c.id, name: c.name, tags: c.tags, type: "tags" })
            }
            onTrash={(id) => trashOp({ action: "trash", id })}
            rootId={currentRootId}
            sessions={paged.slice}
            view={view}
          />
        )}
        {viewingTrash ? null : (
          <div className="mt-4">
            <Pager paged={paged} />
          </div>
        )}
      </main>

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
    </div>
  );
}

function FolderItem({
  active,
  count,
  depth = 0,
  icon,
  label,
  onSelect,
}: {
  active: boolean;
  count: number;
  depth?: number;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className={cn(active && "bg-primary/15 font-medium")}
      onSelect={onSelect}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <span className="flex w-4 justify-center text-faint">{icon}</span>
      <span className="truncate">{label}</span>
      <span className="ml-auto pl-3 text-faint text-xs tabular-nums">
        {count}
      </span>
    </DropdownMenuItem>
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

function SessionList({
  view,
  ...props
}: SessionListProps & { view: "card" | "table" }) {
  return view === "table" ? (
    <SessionTable {...props} />
  ) : (
    <SessionGrid {...props} />
  );
}

function SessionGrid({
  onMove,
  onNote,
  onTags,
  onTrash,
  rootId,
  sessions,
}: SessionListProps) {
  if (sessions.length === 0) {
    return <Notice>No sessions here yet.</Notice>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      {sessions.map((c) => (
        <Card
          className="gap-3 p-5 shadow-none transition-colors hover:border-ink-strong"
          key={c.id}
        >
          <div className="flex items-start gap-2.5">
            <StatusBadge small status={c.status} />
            <Link
              className="min-w-0 break-words font-semibold text-base tracking-tight hover:underline"
              href={`/s/${rootId}/${c.id}`}
            >
              {c.name}
            </Link>
            <div className="ml-auto">
              <SessionActionsMenu
                c={c}
                onMove={onMove}
                onNote={onNote}
                onTags={onTags}
                onTrash={onTrash}
              />
            </div>
          </div>
          <div className="text-[13px] text-muted-foreground">
            {fmtRelative(c.createdAt)} · {fmtMs(c.durationMs)}
          </div>
          <div className="flex flex-wrap gap-3.5 text-[13px] text-muted-foreground tabular-nums">
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
          </div>
          {c.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function SessionTable({
  onMove,
  onNote,
  onTags,
  onTrash,
  rootId,
  sessions,
}: SessionListProps) {
  if (sessions.length === 0) {
    return <Notice>No sessions here yet.</Notice>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table className="[&_td]:whitespace-nowrap [&_td]:px-4 [&_td]:py-2.5 [&_td]:align-middle [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-2.5 [&_th]:font-semibold [&_th]:text-[11px] [&_th]:text-faint [&_th]:uppercase [&_th]:tracking-wide">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[84px]">Status</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Folder</TableHead>
            <TableHead className="text-right">Steps</TableHead>
            <TableHead className="text-right">Console</TableHead>
            <TableHead className="text-right">Network</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Tags</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <StatusBadge small status={c.status} />
              </TableCell>
              <TableCell className="max-w-[280px]">
                <Link
                  className="block truncate font-medium hover:underline"
                  href={`/s/${rootId}/${c.id}`}
                >
                  {c.name}
                </Link>
              </TableCell>
              <TableCell className="max-w-[160px] truncate text-muted-foreground">
                {c.folder ?? "—"}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {c.stepsPassed}/{c.stepsTotal}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  c.consoleErrors > 0 ? "font-semibold text-fail" : "text-faint"
                )}
              >
                {c.consoleErrors}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  c.networkFailures > 0
                    ? "font-semibold text-fail"
                    : "text-faint"
                )}
              >
                {c.networkFailures}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {fmtMs(c.durationMs)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {fmtRelative(c.createdAt)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1">
                  {c.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                  {c.tags.length > 3 ? (
                    <Badge variant="secondary">+{c.tags.length - 3}</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <SessionActionsMenu
                  c={c}
                  onMove={onMove}
                  onNote={onNote}
                  onTags={onTags}
                  onTrash={onTrash}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TrashGrid({
  onDelete,
  onRestore,
  sessions,
}: {
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  sessions: SessionCard[];
}) {
  if (sessions.length === 0) {
    return <Notice>Trash is empty.</Notice>;
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
          <Select onValueChange={setMoveTarget} value={moveTarget}>
            <SelectTrigger className="w-full" id="d-move">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unfiled__">Unfiled</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
