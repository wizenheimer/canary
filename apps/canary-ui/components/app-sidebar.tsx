"use client";

import {
  Check,
  ChevronsUpDown,
  Folder,
  Inbox,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { Root, Selection } from "./library";
import { LogoMark } from "./logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "./ui/sidebar";

// Keep the lime active accent from the old folder list. The button cva defaults
// active items to `data-active:bg-sidebar-accent` (grey); reusing the same
// `data-active:` variant lets tailwind-merge dedupe so lime wins.
const ACTIVE_ACCENT = "data-active:bg-primary/15 data-active:text-foreground";

interface AppSidebarProps {
  countForFolder: (path: string) => number;
  currentRootId: string;
  folders: string[];
  isDefaultRoot: boolean;
  onAddSource: () => void;
  onDeleteFolder: (path: string) => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onRemoveRoot: () => void;
  onRenameFolder: (path: string) => void;
  onSelect: (selection: Selection) => void;
  onSwitchRoot: (id: string) => void;
  roots: Root[];
  selection: Selection;
  sessionsCount: number;
  trashCount: number;
  unfiledCount: number;
}

export function AppSidebar({
  countForFolder,
  currentRootId,
  folders,
  isDefaultRoot,
  onAddSource,
  onDeleteFolder,
  onNewFolder,
  onRefresh,
  onRenameFolder,
  onRemoveRoot,
  onSelect,
  onSwitchRoot,
  roots,
  selection,
  sessionsCount,
  trashCount,
  unfiledCount,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="data-[state=open]:bg-sidebar-accent"
                  size="lg"
                >
                  <LogoMark className="size-8 rounded-md" />
                  <span className="flex-1 truncate font-bold text-lg tracking-tight group-data-[collapsible=icon]:hidden">
                    Canary
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
                side="bottom"
              >
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Sources
                </DropdownMenuLabel>
                {roots.map((r) => (
                  <DropdownMenuItem
                    key={r.id}
                    onSelect={() => onSwitchRoot(r.id)}
                  >
                    <span className="truncate">
                      {r.label}
                      {r.isDefault ? " (default)" : ""}
                    </span>
                    {r.id === currentRootId ? (
                      <Check className="ml-auto size-4 text-muted-foreground" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onAddSource}>
                  <Plus /> Add source…
                </DropdownMenuItem>
                {isDefaultRoot ? null : (
                  <DropdownMenuItem
                    onSelect={onRemoveRoot}
                    variant="destructive"
                  >
                    <Trash2 /> Remove source
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className={ACTIVE_ACCENT}
                isActive={selection.kind === "all"}
                onClick={() => onSelect({ kind: "all" })}
                tooltip="All sessions"
              >
                <Layers />
                <span>All sessions</span>
              </SidebarMenuButton>
              <SidebarMenuBadge>{sessionsCount}</SidebarMenuBadge>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className={ACTIVE_ACCENT}
                isActive={selection.kind === "unfiled"}
                onClick={() => onSelect({ kind: "unfiled" })}
                tooltip="Unfiled"
              >
                <Inbox />
                <span>Unfiled</span>
              </SidebarMenuButton>
              <SidebarMenuBadge>{unfiledCount}</SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Folders</SidebarGroupLabel>
          <SidebarGroupAction onClick={onNewFolder} title="New folder">
            <Plus />
            <span className="sr-only">New folder</span>
          </SidebarGroupAction>
          <SidebarMenu>
            {folders.map((path) => {
              const depth = path.split("/").length - 1;
              const label = path.split("/").at(-1) ?? path;
              const active =
                selection.kind === "folder" && selection.path === path;
              return (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    className={ACTIVE_ACCENT}
                    isActive={active}
                    onClick={() => onSelect({ kind: "folder", path })}
                    style={
                      depth > 0
                        ? { paddingLeft: `${8 + depth * 12}px` }
                        : undefined
                    }
                    tooltip={label}
                  >
                    <Folder />
                    <span>{label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="group-focus-within/menu-item:hidden group-hover/menu-item:hidden">
                    {countForFolder(path)}
                  </SidebarMenuBadge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover>
                        <MoreHorizontal />
                        <span className="sr-only">Folder actions</span>
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right">
                      <DropdownMenuItem onSelect={() => onRenameFolder(path)}>
                        Rename…
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onDeleteFolder(path)}
                        variant="destructive"
                      >
                        Delete folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          {folders.length === 0 ? (
            <p className="px-2 py-1 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
              No folders yet
            </p>
          ) : null}
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={ACTIVE_ACCENT}
                  isActive={selection.kind === "trash"}
                  onClick={() => onSelect({ kind: "trash" })}
                  size="sm"
                  tooltip="Trash"
                >
                  <Trash2 />
                  <span>Trash</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{trashCount}</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onRefresh}
                  size="sm"
                  tooltip="Refresh sessions"
                >
                  <RefreshCw />
                  <span>Refresh</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
