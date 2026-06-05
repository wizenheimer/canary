import { FileImage, Filter, Play, Search, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Empty-state illustrations, ported in spirit from the userplay set but
// re-skinned for canary's "High-Contrast Precision" palette: white cards on a
// tonal well, depth from 1px outlines (no shadows, no gradients), and a soft
// periwinkle (--primary) used only as a fill for active/status affordances —
// never as text on white. Each variant is a small, on-brand mockup of
// what *would* live in the empty surface (a session list, a network waterfall,
// a terminal, …). Light-only, matching the app.
type EmptyStateIllustrationVariant =
  | "commands"
  | "console"
  | "filter"
  | "media"
  | "network"
  | "screenshots"
  | "search"
  | "sessions"
  | "steps"
  | "trash"
  | "video";

type Size = "large" | "panel";

// The window chrome: a white "screen" inside a tonal well, with neutral
// traffic-light dots and an optional URL/search bar. Mirrors the report's
// framed aesthetic.
function Frame({
  children,
  size,
  search = false,
}: {
  children: ReactNode;
  size: Size;
  search?: boolean;
}) {
  const panel = size === "panel";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-xl border border-line-2 bg-well",
        panel ? "w-44 p-2.5" : "w-64 p-3"
      )}
    >
      <div className="overflow-hidden rounded-lg border border-line bg-card">
        <div
          className={cn(
            "flex items-center gap-1.5 border-line border-b px-2.5",
            panel ? "h-6" : "h-7"
          )}
        >
          <span className="size-1.5 rounded-full bg-line-2" />
          <span className="size-1.5 rounded-full bg-line-2" />
          <span className="size-1.5 rounded-full bg-line-2" />
          {search ? (
            <div className="ml-1 flex h-3.5 flex-1 items-center rounded bg-well px-1.5">
              <Search className="size-2 text-faint" strokeWidth={2.5} />
            </div>
          ) : null}
        </div>
        <div className={panel ? "p-2.5" : "p-3"}>{children}</div>
      </div>
    </div>
  );
}

// Skeleton bars: Bar is the stronger (title) tone, FaintBar the lighter (meta)
// tone. Both stay well within the tonal-well range so nothing competes with the
// real content the surface will eventually hold.
function Bar({ className }: { className?: string }) {
  return <span className={cn("block rounded-full bg-line-2", className)} />;
}

function FaintBar({ className }: { className?: string }) {
  return <span className={cn("block rounded-full bg-well-2", className)} />;
}

function statusDot(status: "pass" | "fail" | "muted") {
  if (status === "pass") {
    return "bg-primary";
  }
  if (status === "fail") {
    return "bg-fail";
  }
  return "bg-line-2";
}

const LIST_ROWS = [
  { status: "pass" as const, sub: "w-1/2", title: "w-3/4" },
  { status: "fail" as const, sub: "w-2/5", title: "w-2/3" },
  { status: "muted" as const, sub: "w-1/3", title: "w-1/2" },
];

// A list with a leading status dot, two text lines, and a trailing pill — the
// shape shared by the session grid and the steps panel.
function ListRows({ size }: { size: Size }) {
  const panel = size === "panel";
  const rows = panel ? LIST_ROWS.slice(0, 2) : LIST_ROWS;
  return (
    <div className={panel ? "space-y-2" : "space-y-2.5"}>
      {rows.map((r, i) => (
        <div className="flex items-center gap-2" key={i}>
          <span
            className={cn(
              "shrink-0 rounded-full",
              panel ? "size-1.5" : "size-2",
              statusDot(r.status)
            )}
          />
          <div className="flex-1 space-y-1">
            <Bar className={cn(panel ? "h-1" : "h-1.5", r.title)} />
            <FaintBar className={cn("h-1", r.sub)} />
          </div>
          <FaintBar
            className={cn("shrink-0 rounded", panel ? "h-2.5 w-5" : "h-3 w-7")}
          />
        </div>
      ))}
    </div>
  );
}

// A centered icon medallion over two bars — for "nothing matched" / "nothing
// here" states (search, filter, trash).
function Centered({ icon: Icon, size }: { icon: typeof Search; size: Size }) {
  const panel = size === "panel";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        panel ? "min-h-16 gap-2" : "min-h-24 gap-2.5"
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full border border-line-2 bg-well text-faint",
          panel ? "size-7" : "size-9"
        )}
      >
        <Icon className={panel ? "size-3.5" : "size-4"} strokeWidth={1.75} />
      </span>
      <Bar className={panel ? "h-1 w-14" : "h-1.5 w-20"} />
      <FaintBar className={panel ? "h-1 w-20" : "h-1 w-28"} />
    </div>
  );
}

// A video frame with a centered play button and a scrubber whose played portion
// is the one sanctioned periwinkle accent.
function Player({ size }: { size: Size }) {
  const panel = size === "panel";
  return (
    <div className={panel ? "space-y-1.5" : "space-y-2"}>
      <div className="grid aspect-video place-items-center rounded border border-line bg-well">
        <span
          className={cn(
            "grid place-items-center rounded-full border border-line-2 bg-card text-faint",
            panel ? "size-6" : "size-8"
          )}
        >
          <Play
            className={cn(
              "translate-x-px fill-current",
              panel ? "size-2.5" : "size-3.5"
            )}
            strokeWidth={0}
          />
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-well-2">
          <span className="block h-full w-1/3 rounded-full bg-primary" />
        </span>
        <FaintBar className="h-1 w-5" />
      </div>
    </div>
  );
}

// A row of image tiles — the per-step screenshot strip.
function Screens({ size }: { size: Size }) {
  const panel = size === "panel";
  return (
    <div className={cn("grid grid-cols-3", panel ? "gap-1.5" : "gap-2")}>
      {[0, 1, 2].map((i) => (
        <div
          className="grid aspect-[4/3] place-items-center rounded border border-line bg-well text-faint"
          key={i}
        >
          <FileImage
            className={panel ? "size-3" : "size-3.5"}
            strokeWidth={1.75}
          />
        </div>
      ))}
    </div>
  );
}

// A terminal block. Lines are bars behind a faint `$` prompt; the final line
// ends in a periwinkle cursor (the active affordance). Used for the commands panel.
function TerminalLines({ size }: { size: Size }) {
  const panel = size === "panel";
  const widths = panel ? ["w-2/3", "w-1/2"] : ["w-3/4", "w-1/2", "w-2/3"];
  return (
    <div
      className={cn(
        "rounded border border-line bg-well",
        panel ? "space-y-1.5 p-2" : "space-y-2 p-2.5"
      )}
    >
      {widths.map((w, i) => (
        <div className="flex items-center gap-1.5" key={i}>
          <span
            className={cn(
              "shrink-0 font-mono text-faint leading-none",
              panel ? "text-[8px]" : "text-[10px]"
            )}
          >
            $
          </span>
          <Bar className={cn(panel ? "h-1" : "h-1.5", w)} />
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "shrink-0 font-mono text-faint leading-none",
            panel ? "text-[8px]" : "text-[10px]"
          )}
        >
          $
        </span>
        <Bar className={panel ? "h-1 w-1/4" : "h-1.5 w-1/3"} />
        <span
          className={cn(
            "rounded-sm bg-primary",
            panel ? "h-2 w-1" : "h-2.5 w-1"
          )}
        />
      </div>
    </div>
  );
}

// Console output: log lines behind level dots (error / warn / log).
function ConsoleLines({ size }: { size: Size }) {
  const panel = size === "panel";
  const rows = panel
    ? [
        { dot: "bg-fail", w: "w-2/3" },
        { dot: "bg-warn", w: "w-1/2" },
      ]
    : [
        { dot: "bg-fail", w: "w-3/4" },
        { dot: "bg-warn", w: "w-1/2" },
        { dot: "bg-line-2", w: "w-2/3" },
      ];
  return (
    <div
      className={cn(
        "rounded border border-line bg-well",
        panel ? "space-y-1.5 p-2" : "space-y-2 p-2.5"
      )}
    >
      {rows.map((r, i) => (
        <div className="flex items-center gap-1.5" key={i}>
          <span
            className={cn(
              "shrink-0 rounded-full",
              panel ? "size-1" : "size-1.5",
              r.dot
            )}
          />
          <Bar className={cn(panel ? "h-1" : "h-1.5", r.w)} />
        </div>
      ))}
    </div>
  );
}

const WATERFALL_LARGE = [
  { off: "ml-0", status: "pass" as const, w: "w-1/2" },
  { off: "ml-4", status: "pass" as const, w: "w-2/5" },
  { off: "ml-8", status: "fail" as const, w: "w-1/4" },
];

// A request waterfall: a method pill, an offset timing bar, and a status dot.
function Waterfall({ size }: { size: Size }) {
  const panel = size === "panel";
  const rows = panel ? WATERFALL_LARGE.slice(0, 2) : WATERFALL_LARGE;
  return (
    <div className={panel ? "space-y-2" : "space-y-2.5"}>
      {rows.map((r, i) => (
        <div className="flex items-center gap-1.5" key={i}>
          <FaintBar
            className={cn(
              "shrink-0 rounded-sm",
              panel ? "h-2 w-5" : "h-2.5 w-6"
            )}
          />
          <span className="relative h-1.5 flex-1 rounded-full bg-well-2">
            <span
              className={cn(
                "absolute top-0 h-1.5 rounded-full bg-line-2",
                r.off,
                r.w
              )}
            />
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full",
              panel ? "size-1.5" : "size-2",
              statusDot(r.status)
            )}
          />
        </div>
      ))}
    </div>
  );
}

export function EmptyStateIllustration({
  size = "large",
  variant,
}: {
  size?: Size;
  variant: EmptyStateIllustrationVariant;
}) {
  switch (variant) {
    case "sessions":
    case "steps":
      return (
        <Frame size={size}>
          <ListRows size={size} />
        </Frame>
      );
    case "search":
      return (
        <Frame search size={size}>
          <Centered icon={Search} size={size} />
        </Frame>
      );
    case "filter":
      return (
        <Frame search size={size}>
          <Centered icon={Filter} size={size} />
        </Frame>
      );
    case "trash":
      return (
        <Frame size={size}>
          <Centered icon={Trash2} size={size} />
        </Frame>
      );
    case "media":
    case "video":
      return (
        <Frame size={size}>
          <Player size={size} />
        </Frame>
      );
    case "screenshots":
      return (
        <Frame size={size}>
          <Screens size={size} />
        </Frame>
      );
    case "commands":
      return (
        <Frame size={size}>
          <TerminalLines size={size} />
        </Frame>
      );
    case "console":
      return (
        <Frame size={size}>
          <ConsoleLines size={size} />
        </Frame>
      );
    case "network":
      return (
        <Frame size={size}>
          <Waterfall size={size} />
        </Frame>
      );
    default:
      return null;
  }
}

export type { EmptyStateIllustrationVariant };
