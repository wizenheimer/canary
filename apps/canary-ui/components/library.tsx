"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMs, fmtRelative } from "@/lib/format";
import type { SessionCard } from "@/lib/sessions";
import { Modal, Notice, Spinner, StatusBadge } from "./ui";

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

type Dialog =
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
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

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

  // Close any open card menu on an outside click.
  useEffect(() => {
    if (!menuId) {
      return;
    }
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

  const switchRoot = (id: string) => {
    setCurrentRootId(id);
    setSelection({ kind: "all" });
    setList(null);
    void postJson("/api/roots", { action: "select", id });
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

  if (!currentRootId) {
    return (
      <main className="notice">
        {error ? <Notice error>Could not load: {error}</Notice> : <Spinner />}
      </main>
    );
  }

  const folders = list?.folders ?? [];
  const sessions = list?.sessions ?? [];
  const visible = sessions
    .filter((c) => matchesSelection(c, selection))
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => matchesSearch(c, search));

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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="spark" /> Canary
        </div>

        <div className="side-h">Source</div>
        <select
          className="root-switch"
          onChange={(e) => switchRoot(e.target.value)}
          value={currentRootId}
        >
          {roots.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
              {r.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button
            className="btn"
            onClick={() => setDialog({ type: "addRoot" })}
            type="button"
          >
            + Add folder
          </button>
          {list?.root.isDefault ? null : (
            <button
              className="btn"
              onClick={async () => {
                await postJson("/api/roots", {
                  action: "remove",
                  id: currentRootId,
                });
                setCurrentRootId(null);
                setList(null);
                await loadRoots();
              }}
              type="button"
            >
              Remove
            </button>
          )}
        </div>

        <div className="side-h">
          Folders
          <button
            className="add"
            onClick={() => setDialog({ type: "newFolder" })}
            title="New folder"
            type="button"
          >
            +
          </button>
        </div>
        <ul className="tree">
          <li>
            <button
              className={`node ${selection.kind === "all" ? "is-active" : ""}`}
              onClick={() => setSelection({ kind: "all" })}
              type="button"
            >
              <span className="twist" /> All sessions
              <span className="ct">{sessions.length}</span>
            </button>
          </li>
          <li>
            <button
              className={`node ${selection.kind === "unfiled" ? "is-active" : ""}`}
              onClick={() => setSelection({ kind: "unfiled" })}
              type="button"
            >
              <span className="twist" /> Unfiled
              <span className="ct">{countFor({ kind: "unfiled" })}</span>
            </button>
          </li>
          {folders.map((path) => {
            const depth = path.split("/").length - 1;
            const label = path.split("/").at(-1) ?? path;
            const isActive =
              selection.kind === "folder" && selection.path === path;
            return (
              <li key={path}>
                <button
                  className={`node ${isActive ? "is-active" : ""}`}
                  onClick={() => setSelection({ kind: "folder", path })}
                  style={{ paddingLeft: `${8 + depth * 16}px` }}
                  type="button"
                >
                  <span className="twist">📁</span> {label}
                  <span className="ct">
                    {countFor({ kind: "folder", path })}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              className={`node ${selection.kind === "trash" ? "is-active" : ""}`}
              onClick={() => setSelection({ kind: "trash" })}
              type="button"
            >
              <span className="twist">🗑</span> Trash
              <span className="ct">{list?.trashCount ?? 0}</span>
            </button>
          </li>
        </ul>
      </aside>

      <main className="main">
        <div className="toolbar">
          <h1>{selectionTitle}</h1>
          {selection.kind === "folder" && (
            <>
              <button
                className="btn"
                onClick={() =>
                  setDialog({ path: selection.path, type: "renameFolder" })
                }
                type="button"
              >
                Rename
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  await overlayOp({ op: "deleteFolder", path: selection.path });
                  setSelection({ kind: "all" });
                }}
                type="button"
              >
                Delete folder
              </button>
            </>
          )}
          {selection.kind === "trash" && trash.length > 0 && (
            <button
              className="btn danger"
              onClick={() => trashOp({ action: "empty" })}
              type="button"
            >
              Empty trash
            </button>
          )}
          <span className="grow" />
          <input
            className="search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, id, tag, note…"
            type="search"
            value={search}
          />
          <select
            className="filter"
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            value={statusFilter}
          >
            <option value="all">All statuses</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="aborted">Aborted</option>
          </select>
        </div>

        {error ? <Notice error>{error}</Notice> : null}

        {viewingTrash ? (
          <TrashGrid
            onDelete={(id) => trashOp({ action: "delete", id })}
            onRestore={(id) => trashOp({ action: "restore", id })}
            sessions={trash}
          />
        ) : (
          <SessionGrid
            menuId={menuId}
            onMenu={setMenuId}
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
            sessions={visible}
          />
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

function SessionGrid({
  menuId,
  onMenu,
  onMove,
  onNote,
  onTags,
  onTrash,
  rootId,
  sessions,
}: {
  menuId: string | null;
  onMenu: (id: string | null) => void;
  onMove: (c: SessionCard) => void;
  onNote: (c: SessionCard) => void;
  onTags: (c: SessionCard) => void;
  onTrash: (id: string) => void;
  rootId: string;
  sessions: SessionCard[];
}) {
  if (sessions.length === 0) {
    return <Notice>No sessions here yet.</Notice>;
  }
  return (
    <div className="grid">
      {sessions.map((c) => (
        <div className="scard" key={c.id}>
          <div className="scard-top">
            <StatusBadge small status={c.status} />
            <Link className="sname2" href={`/s/${rootId}/${c.id}`}>
              {c.name}
            </Link>
            <div className="menu">
              <button
                className="kebab"
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu(menuId === c.id ? null : c.id);
                }}
                type="button"
              >
                ⋯
              </button>
              {menuId === c.id ? (
                <div className="menu-pop">
                  <button onClick={() => onMove(c)} type="button">
                    Move to folder…
                  </button>
                  <button onClick={() => onTags(c)} type="button">
                    Edit tags…
                  </button>
                  <button onClick={() => onNote(c)} type="button">
                    Edit note…
                  </button>
                  <hr />
                  <button
                    className="danger"
                    onClick={() => onTrash(c.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="when">
            {fmtRelative(c.createdAt)} · {fmtMs(c.durationMs)}
          </div>
          <div className="stats">
            <span>
              {c.stepsPassed}/{c.stepsTotal} steps
            </span>
            {c.consoleErrors > 0 ? (
              <span className="bad">{c.consoleErrors} console</span>
            ) : null}
            {c.networkFailures > 0 ? (
              <span className="bad">{c.networkFailures} network</span>
            ) : null}
            {c.folder ? <span>📁 {c.folder}</span> : null}
          </div>
          {c.tags.length > 0 ? (
            <div className="tagrow">
              {c.tags.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
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
    <div className="grid">
      {sessions.map((c) => (
        <div className="scard" key={c.id}>
          <div className="scard-top">
            <StatusBadge small status={c.status} />
            <span className="sname2">{c.name}</span>
          </div>
          <div className="when">{fmtRelative(c.createdAt)}</div>
          <div className="stats" style={{ marginTop: "auto" }}>
            <button
              className="btn"
              onClick={() => onRestore(c.id)}
              type="button"
            >
              Restore
            </button>
            <button
              className="btn danger"
              onClick={() => onDelete(c.id)}
              type="button"
            >
              Delete forever
            </button>
          </div>
        </div>
      ))}
    </div>
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
  dialog: Dialog;
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

  if (dialog.type === "addRoot") {
    return (
      <Modal onClose={onClose} title="Add a source folder">
        <label htmlFor="d-path">Folder path</label>
        <input
          id="d-path"
          onChange={(e) => setText(e.target.value)}
          placeholder="/path/to/sessions"
          value={text}
        />
        <label htmlFor="d-label">Label (optional)</label>
        <input
          id="d-label"
          onChange={(e) => setText2(e.target.value)}
          placeholder="My archive"
          value={text2}
        />
        <div className="actions">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={() => onAddRoot(text.trim(), text2.trim())}
            type="button"
          >
            Add
          </button>
        </div>
      </Modal>
    );
  }

  if (dialog.type === "newFolder") {
    return (
      <Modal onClose={onClose} title="New folder">
        <label htmlFor="d-folder">Folder path (use / for nesting)</label>
        <input
          id="d-folder"
          onChange={(e) => setText(e.target.value)}
          placeholder="Work/Checkout"
          value={text}
        />
        <div className="actions">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={() => onCreateFolder(text.trim())}
            type="button"
          >
            Create
          </button>
        </div>
      </Modal>
    );
  }

  if (dialog.type === "renameFolder") {
    return (
      <Modal onClose={onClose} title="Rename folder">
        <label htmlFor="d-rename">New path</label>
        <input
          id="d-rename"
          onChange={(e) => setText(e.target.value)}
          value={text}
        />
        <div className="actions">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={() => onRenameFolder(dialog.path, text.trim())}
            type="button"
          >
            Rename
          </button>
        </div>
      </Modal>
    );
  }

  if (dialog.type === "move") {
    return (
      <Modal onClose={onClose} title={`Move "${dialog.name}"`}>
        <label htmlFor="d-move">Folder</label>
        <select
          id="d-move"
          onChange={(e) => setMoveTarget(e.target.value)}
          value={moveTarget}
        >
          <option value="__unfiled__">Unfiled</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <label htmlFor="d-move-new">…or a new folder path</label>
        <input
          id="d-move-new"
          onChange={(e) => setMoveNew(e.target.value)}
          placeholder="Work/Checkout"
          value={moveNew}
        />
        <div className="actions">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => {
              if (moveNew.trim()) {
                onMove(dialog.id, moveNew.trim());
              } else if (moveTarget === "__unfiled__") {
                onMove(dialog.id, null);
              } else {
                onMove(dialog.id, moveTarget);
              }
            }}
            type="button"
          >
            Move
          </button>
        </div>
      </Modal>
    );
  }

  if (dialog.type === "tags") {
    return (
      <Modal onClose={onClose} title={`Tags for "${dialog.name}"`}>
        <label htmlFor="d-tags">Comma-separated tags</label>
        <input
          id="d-tags"
          onChange={(e) => setText(e.target.value)}
          placeholder="smoke, nightly"
          value={text}
        />
        <div className="actions">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn"
            onClick={() =>
              onTags(
                dialog.id,
                text
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0)
              )
            }
            type="button"
          >
            Save
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={`Note for "${dialog.name}"`}>
      <label htmlFor="d-note">Note</label>
      <textarea
        id="d-note"
        onChange={(e) => setText(e.target.value)}
        value={text}
      />
      <div className="actions">
        <button className="btn" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="btn"
          onClick={() => onNote(dialog.id, text)}
          type="button"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
