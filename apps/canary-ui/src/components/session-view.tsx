"use client";

import {
  Activity,
  ArrowLeft,
  Braces,
  ChevronRight,
  Download,
  FileText,
  Film,
  ListChecks,
  Network,
  Package,
  Play,
  SquareChevronRight,
  Terminal,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { artifactUrl, fmtBytes, fmtClock, fmtMs } from "@/lib/format";
import type { SessionManifest } from "@/lib/manifest";
import type { NetworkRequest } from "@/lib/network";
import type { ConsoleEntry } from "@/lib/parse-console";
import type { HarSummary } from "@/lib/parse-har";
import { cn } from "@/lib/utils";
import { ConsoleTab } from "./console-tab";
import { NetworkTab } from "./network-tab";
import { TopBar } from "./top-bar";
import { EmptyState, Notice, Spinner, StatusBadge } from "./ui";
import { Badge } from "./ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { Button } from "./ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

// Both are heavy; load them only when their tab is opened. (React.lazy
// replaces next/dynamic — the island is client-only, so ssr:false is implicit;
// the null fallback matches next/dynamic's default empty loading state.)
const VideoPlayerLazy = lazy(() =>
  import("./video-player").then((m) => ({ default: m.VideoPlayer }))
);
const CodeBlockLazy = lazy(() =>
  import("./code-block").then((m) => ({ default: m.CodeBlock }))
);

function VideoPlayer(props: ComponentProps<typeof VideoPlayerLazy>) {
  return (
    <Suspense fallback={null}>
      <VideoPlayerLazy {...props} />
    </Suspense>
  );
}

function CodeBlock(props: ComponentProps<typeof CodeBlockLazy>) {
  return (
    <Suspense fallback={null}>
      <CodeBlockLazy {...props} />
    </Suspense>
  );
}

interface DetailResponse {
  console: ConsoleEntry[];
  folder: string | null;
  har: HarSummary;
  manifest: SessionManifest;
  network: NetworkRequest[];
  note: string;
  rootId: string;
  tags: string[];
}

const TABS = [
  ["summary", "Summary", FileText],
  ["steps", "Steps", ListChecks],
  ["commands", "Commands", SquareChevronRight],
  ["console", "Console", Terminal],
  ["network", "Network", Network],
  ["artifacts", "Artifacts", Package],
] as const;

type TabId = (typeof TABS)[number][0];

// The active tab lives in the URL (?tab=) so a deep link opens the same view.
const TAB_PARSER = parseAsStringLiteral(TABS.map((t) => t[0])).withDefault(
  "summary"
);

const MIN_BAR_W = 1.5;

const TABLE_CLASS =
  "[&_th]:px-6 [&_th]:py-3 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-faint [&_td]:px-6 [&_td]:py-3 [&_td]:align-top";

const SHELL = "mx-auto w-full max-w-[1200px] flex-1 px-6 pt-10 pb-20";

// A labelled section: the heading sits above a subtle bordered region (cleaner
// than wrapping every block in a title-bar card).
function Panel({
  children,
  count,
  fill,
  title,
}: {
  children: ReactNode;
  count?: ReactNode;
  fill?: boolean;
  title?: string;
}) {
  return (
    <section className={cn("mb-8", fill && "mb-0 flex min-h-0 flex-col")}>
      {title ? (
        <div className="mb-3 flex shrink-0 items-baseline gap-3">
          <h2 className="font-semibold text-sm tracking-tight">{title}</h2>
          {count == null ? null : (
            <span className="text-[13px] text-faint tabular-nums">{count}</span>
          )}
        </div>
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-card",
          // In fill mode the card shrinks to the tab height (instead of
          // growing past it) and scrolls its rows internally.
          fill && "scrollbar-none min-h-0 overflow-y-auto overscroll-none"
        )}
      >
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-10 text-center text-faint italic">{children}</div>;
}

export default function SessionView({
  id,
  rootId,
}: {
  id: string;
  rootId: string;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useQueryState("tab", TAB_PARSER);
  const [leftPct, setLeftPct] = useState(58);
  const splitRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!(draggingRef.current && splitRef.current)) {
        return;
      }
      const rect = splitRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(72, Math.max(28, pct)));
    }
    function onUp() {
      draggingRef.current = false;
      document.body.style.removeProperty("user-select");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startResize = () => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    const params = new URLSearchParams({ id, root: rootId });
    fetch(`/api/session?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const detail = (await r.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(detail.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<DetailResponse>;
      })
      .then((d) => {
        if (active) {
          setData(d);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      active = false;
    };
  }, [id, rootId]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <main className={SHELL}>
          <Notice error>
            Could not load session: {error}.{" "}
            <a className="inline-flex items-center gap-1" href="/">
              <ArrowLeft className="size-4" /> Back to sessions
            </a>
          </Notice>
        </main>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <main className={SHELL}>
          <Spinner label="Loading session…" />
        </main>
      </div>
    );
  }

  const m = data.manifest;
  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <TopBar>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <a href="/">Sessions</a>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {data.folder ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="hidden sm:inline-flex">
                  {data.folder}
                </BreadcrumbItem>
              </>
            ) : null}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-[44vw] truncate">
                {m.name ?? m.id}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </TopBar>
      <div
        className="flex flex-1 flex-col lg:min-h-0 lg:flex-row"
        ref={splitRef}
        style={{ "--left-w": `${leftPct}%` } as CSSProperties}
      >
        <div className="scrollbar-none overscroll-none border-border max-lg:border-b lg:w-[var(--left-w)] lg:shrink-0 lg:overflow-y-auto">
          <MediaPanel m={m} rootId={rootId} />
        </div>
        <button
          aria-label="Resize panels"
          className="group/resize hidden w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent lg:flex"
          onPointerDown={startResize}
          type="button"
        >
          <span className="h-full border-border/70 border-l border-dotted transition-colors group-hover/resize:border-primary" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <Tabs
            className="flex min-h-0 flex-1 flex-col gap-0"
            onValueChange={(v) => setTab(v as TabId)}
            value={tab}
          >
            <TabsList
              className="justify-center-safe scrollbar-none h-auto w-full shrink-0 gap-x-6 overflow-x-auto overscroll-none rounded-none border-border border-b px-5 py-0"
              variant="line"
            >
              {TABS.map(([tid, label]) => (
                <TabsTrigger
                  className="flex-none rounded-none px-0.5 py-3 font-medium text-[13px] text-muted-foreground after:bottom-[-1px] after:h-0.5 after:bg-primary data-active:text-foreground"
                  key={tid}
                  value={tid}
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Each tab owns its scrolling: document tabs scroll as a whole,
                list tabs pin their filters/headers and scroll only the rows.
                The min-h-0/overflow classes are inert below lg, where the
                page scrolls naturally. */}
            <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
              <TabsContent
                className="scrollbar-none min-h-0 overflow-y-auto overscroll-none"
                value="summary"
              >
                <Summary m={m} note={data.note} tags={data.tags} />
              </TabsContent>
              <TabsContent className="flex min-h-0 flex-col" value="steps">
                <Steps m={m} />
              </TabsContent>
              <TabsContent
                className="scrollbar-none min-h-0 overflow-y-auto overscroll-none"
                value="commands"
              >
                <Commands m={m} />
              </TabsContent>
              <TabsContent className="flex min-h-0 flex-col" value="console">
                <ConsoleTab entries={data.console} />
              </TabsContent>
              <TabsContent className="flex min-h-0 flex-col" value="network">
                <NetworkTab
                  failed={data.har.failed}
                  requests={data.network}
                  total={data.har.total}
                />
              </TabsContent>
              <TabsContent
                className="scrollbar-none min-h-0 overflow-y-auto overscroll-none"
                value="artifacts"
              >
                <Artifacts m={m} rootId={rootId} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// Clean key-value sections (label + value rows with a quiet hover) — the
// detail view's panels read as info lists, not bordered stat cards.
function InfoSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 font-semibold text-sm tracking-tight">{title}</h2>
      <dl className="-mx-2">{children}</dl>
    </section>
  );
}

function InfoRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex gap-4 rounded-md px-2 py-2 transition-colors hover:bg-well/60">
      <dt className="w-40 shrink-0 text-[13px] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[13px]">{children}</dd>
    </div>
  );
}

function Summary({
  m,
  note,
  tags,
}: {
  m: SessionManifest;
  note: string;
  tags: string[];
}) {
  const s = m.summary;
  return (
    <>
      <InfoSection title="Overview">
        <InfoRow label="Status">
          <StatusBadge small status={m.status} />
        </InfoRow>
        <InfoRow label="Steps">
          <span className="tabular-nums">
            {s.stepsPassed}/{s.stepsTotal} passed
          </span>
        </InfoRow>
        <InfoRow label="Failed">
          <span
            className={cn(
              "tabular-nums",
              s.stepsFailed > 0 && "font-semibold text-fail"
            )}
          >
            {s.stepsFailed}
          </span>
        </InfoRow>
        <InfoRow label="Duration">
          <span className="tabular-nums">{fmtMs(m.durationMs)}</span>
        </InfoRow>
        <InfoRow label="Console errors">
          <span
            className={cn(
              "tabular-nums",
              s.consoleErrors > 0 && "font-semibold text-fail"
            )}
          >
            {s.consoleErrors}
          </span>
        </InfoRow>
        <InfoRow label="Network failures">
          <span
            className={cn(
              "tabular-nums",
              s.networkFailures > 0 && "font-semibold text-fail"
            )}
          >
            {s.networkFailures}
          </span>
        </InfoRow>
      </InfoSection>
      {note ? (
        <InfoSection title="Notes">
          <p className="px-2 text-[13px] text-foreground leading-relaxed">
            {note}
          </p>
        </InfoSection>
      ) : null}
      <Timeline m={m} />
      <Environment m={m} tags={tags} />
    </>
  );
}

function Steps({ m }: { m: SessionManifest }) {
  return (
    <Panel
      count={`${m.summary.stepsPassed}/${m.summary.stepsTotal} passed`}
      fill
      title="Steps"
    >
      {m.steps.length === 0 ? (
        <Empty>No steps recorded.</Empty>
      ) : (
        m.steps.map((step, i) => {
          const n = step.actions.length;
          return (
            <div
              className="flex items-center gap-3.5 border-border border-b px-6 py-4 last:border-0 hover:bg-primary/5"
              key={`${i}-${step.name}`}
            >
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  step.status === "pass" && "bg-primary",
                  step.status === "fail" && "bg-fail",
                  step.status !== "pass" &&
                    step.status !== "fail" &&
                    "bg-line-2"
                )}
              />
              <span className="min-w-0 break-words font-semibold tracking-tight">
                {step.name}
              </span>
              <span className="ml-auto whitespace-nowrap text-[13px] text-faint tabular-nums">
                exit {step.exitCode} · {fmtMs(step.durationMs)}
                {n > 0 ? ` · ${n} action${n === 1 ? "" : "s"}` : ""}
              </span>
            </div>
          );
        })
      )}
    </Panel>
  );
}

function Screenshots({ m, rootId }: { m: SessionManifest; rootId: string }) {
  const items = m.steps.flatMap((step) =>
    step.screenshot
      ? [{ cap: step.name, src: artifactUrl(rootId, m.id, step.screenshot) }]
      : []
  );
  const [active, setActive] = useState(0);
  if (items.length === 0) {
    return (
      <Panel>
        <Empty>No screenshots captured.</Empty>
      </Panel>
    );
  }
  const cur = items[Math.min(active, items.length - 1)] ?? items[0];
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-sm tracking-tight">
          Screenshots{" "}
          <span className="text-faint tabular-nums">
            {items.length > 1 ? `${active + 1} / ${items.length}` : ""}
          </span>
        </h2>
        <Button asChild size="sm" variant="outline">
          <a download href={cur.src}>
            <Download /> Download
          </a>
        </Button>
      </div>
      <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-lg border border-border bg-well">
        <img
          alt={cur.cap}
          className="block h-auto max-h-[62vh] w-auto max-w-full"
          src={cur.src}
        />
      </div>
      {items.length > 1 ? (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
          {items.map((it, i) => (
            <button
              className={cn(
                "h-16 w-[104px] shrink-0 overflow-hidden rounded-md border-2 bg-well p-0 transition-colors",
                i === active
                  ? "border-primary"
                  : "border-transparent hover:border-line-2"
              )}
              key={`${i}-${it.src}`}
              onClick={() => setActive(i)}
              type="button"
            >
              <img
                alt={it.cap}
                className="block size-full object-cover"
                src={it.src}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Timeline({ m }: { m: SessionManifest }) {
  const t0 = Date.parse(m.createdAt);
  const span = Math.max(m.durationMs, 1);
  let cursor = 0;
  const rows = m.steps.map((step) => {
    const start = Date.parse(step.startedAt);
    let off: number;
    if (Number.isNaN(start) || Number.isNaN(t0)) {
      off = (cursor / span) * 100;
    } else {
      off = ((start - t0) / span) * 100;
    }
    // Advance the fallback cursor for every step so an invalid-timestamp step
    // after valid ones lands after them, not stacked at offset 0.
    cursor += step.durationMs;
    off = Math.min(Math.max(off, 0), 100);
    let w = Math.max((step.durationMs / span) * 100, MIN_BAR_W);
    if (off + w > 100) {
      w = Math.max(100 - off, MIN_BAR_W);
    }
    return { off, step, w };
  });
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-semibold text-sm tracking-tight">Timeline</h2>
        <span className="text-[13px] text-faint tabular-nums">
          {fmtMs(m.durationMs)} total
        </span>
      </div>
      {rows.length === 0 ? (
        <Empty>No steps recorded.</Empty>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map(({ off, step, w }, i) => (
            <div
              className="flex items-center gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-well/60"
              key={`${i}-${step.name}`}
            >
              <span className="w-40 shrink-0 truncate font-medium text-sm">
                {step.name}
              </span>
              <span className="relative h-2.5 flex-1 rounded-full bg-well">
                <span
                  className={cn(
                    "absolute top-0 h-2.5 min-w-1 rounded-full",
                    step.status === "fail" ? "bg-fail" : "bg-primary"
                  )}
                  style={{
                    left: `${off.toFixed(2)}%`,
                    width: `${w.toFixed(2)}%`,
                  }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-[13px] text-faint tabular-nums">
                {fmtMs(step.durationMs)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Environment({ m, tags }: { m: SessionManifest; tags: string[] }) {
  const flags = Object.entries(m.capture)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .join(" · ");
  return (
    <InfoSection title="Environment">
      <InfoRow label="Browser">
        {m.environment.browser} ·{" "}
        {m.environment.headless ? "headless" : "headed"}
      </InfoRow>
      <InfoRow label="Playwright">
        <span className="font-mono">{m.environment.playwrightVersion}</span>
      </InfoRow>
      <InfoRow label="Platform">
        <span className="font-mono">{m.environment.platform}</span>
      </InfoRow>
      <InfoRow label="Captured">{flags || "none"}</InfoRow>
      <InfoRow label="Started">
        <span className="tabular-nums">{fmtClock(m.createdAt)}</span>
      </InfoRow>
      <InfoRow label="Ended">
        <span className="tabular-nums">{fmtClock(m.endedAt)}</span>
      </InfoRow>
      {tags.length > 0 ? (
        <InfoRow label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        </InfoRow>
      ) : null}
    </InfoSection>
  );
}

function Commands({ m }: { m: SessionManifest }) {
  const steps = m.steps.filter(
    (s) => (s.script && s.script.trim().length > 0) || s.actions.length > 0
  );
  if (steps.length === 0) {
    return (
      <Panel>
        <Empty>
          No commands captured. Enable trace capture to record Playwright
          actions.
        </Empty>
      </Panel>
    );
  }
  return (
    <>
      {steps.map((step, i) => (
        <Panel
          count={`${step.actions.length} action${
            step.actions.length === 1 ? "" : "s"
          } · ${fmtMs(step.durationMs)}`}
          key={`${i}-${step.name}`}
          title={step.name}
        >
          {step.script && step.script.trim().length > 0 ? (
            <Collapsible className="border-border border-b">
              <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-6 py-3.5 font-bold text-[11px] text-muted-foreground uppercase tracking-wide">
                <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                Script
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-6 pb-4">
                  <CodeBlock code={step.script} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          {step.actions.length > 0 ? (
            <Table className={TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: "220px" }}>Action</TableHead>
                  <TableHead>Params</TableHead>
                  <TableHead style={{ width: "88px" }}>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {step.actions.map((a, j) => (
                  <TableRow
                    className={
                      a.error ? "bg-fail-bg hover:bg-fail-bg" : undefined
                    }
                    key={`${a.apiName}-${j}`}
                  >
                    <TableCell>
                      <Badge variant="secondary">{a.apiName}</Badge>
                    </TableCell>
                    <TableCell className="break-words font-mono text-muted-foreground">
                      {a.params}
                      {a.error ? (
                        <div className="mt-1 text-[13px] text-fail">
                          {a.error}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.durationMs === undefined ? "—" : fmtMs(a.durationMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>No Playwright actions recorded.</Empty>
          )}
        </Panel>
      ))}
    </>
  );
}

function Videos({ m, rootId }: { m: SessionManifest; rootId: string }) {
  const vids = m.artifacts.videos;
  const [active, setActive] = useState(0);
  if (vids.length === 0) {
    return (
      <Panel title="Videos">
        <Empty>No video captured.</Empty>
      </Panel>
    );
  }
  const cur = vids[Math.min(active, vids.length - 1)] ?? vids[0];
  const srcOf = (p: string) => artifactUrl(rootId, m.id, p);
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-sm tracking-tight">
          Videos{" "}
          <span className="text-faint tabular-nums">
            {vids.length > 1 ? `${active + 1} / ${vids.length}` : ""}
          </span>
        </h2>
        <Button asChild size="sm" variant="outline">
          <a download href={srcOf(cur.path)}>
            <Download /> Download
          </a>
        </Button>
      </div>
      <VideoPlayer
        key={cur.path}
        src={srcOf(cur.path)}
        type={cur.path.endsWith(".mp4") ? "video/mp4" : "video/webm"}
      />
      {vids.length > 1 ? (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
          {vids.map((v, i) => (
            <button
              className={cn(
                "flex h-16 w-[104px] shrink-0 items-center justify-center rounded-md border-2 bg-well transition-colors",
                i === active
                  ? "border-primary text-foreground"
                  : "border-transparent text-faint hover:border-line-2"
              )}
              key={v.path}
              onClick={() => setActive(i)}
              type="button"
            >
              <Play className="size-5" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// The left half of the split detail view: one media stage that plays the
// recording(s) and steps through every screenshot, with a thumbnail filmstrip
// to jump between them. The right half keeps the full tab set.
function MediaPanel({ m, rootId }: { m: SessionManifest; rootId: string }) {
  const items = [
    ...m.artifacts.videos.map((v, i) => ({
      cap: m.artifacts.videos.length > 1 ? `Recording ${i + 1}` : "Recording",
      kind: "video" as const,
      src: artifactUrl(rootId, m.id, v.path),
      type: v.path.endsWith(".mp4") ? "video/mp4" : "video/webm",
    })),
    ...m.steps.flatMap((step) =>
      step.screenshot
        ? [
            {
              cap: step.name,
              kind: "image" as const,
              src: artifactUrl(rootId, m.id, step.screenshot),
            },
          ]
        : []
    ),
  ];
  const [active, setActive] = useState(0);

  if (items.length === 0) {
    return (
      <EmptyState
        description="This session didn’t capture a video or any screenshots."
        icon={Film}
        title="No media"
      />
    );
  }

  const cur = items[Math.min(active, items.length - 1)] ?? items[0];

  return (
    <div className="flex flex-col gap-4 p-6">
      {cur.kind === "video" ? (
        <VideoPlayer src={cur.src} type={cur.type} />
      ) : (
        <div className="flex items-center justify-center overflow-hidden rounded-lg border border-border bg-well">
          <img
            alt={cur.cap}
            className="block max-h-[68vh] w-auto max-w-full object-contain"
            src={cur.src}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium text-muted-foreground text-sm">
          {cur.cap}
        </span>
        <Button asChild size="sm" variant="outline">
          <a download href={cur.src}>
            <Download /> Download
          </a>
        </Button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {items.map((it, i) => (
          <button
            className={cn(
              "relative h-16 w-[104px] shrink-0 overflow-hidden rounded-md border-2 bg-well transition-colors",
              i === active
                ? "border-primary"
                : "border-transparent hover:border-line-2"
            )}
            key={`${it.kind}-${i}-${it.src}`}
            onClick={() => setActive(i)}
            type="button"
          >
            {it.kind === "video" ? (
              <span className="flex size-full items-center justify-center text-faint">
                <Play className="size-5" />
              </span>
            ) : (
              <img
                alt={it.cap}
                className="block size-full object-cover"
                src={it.src}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ArtifactItem {
  hint?: ReactNode;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  path: string;
  size?: string;
}

function ArtifactCard({
  hint,
  href,
  icon: Icon,
  label,
  path,
  size,
}: ArtifactItem) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-ink-strong">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-well text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-sm">{label}</span>
          {size ? (
            <span className="text-[12px] text-faint tabular-nums">{size}</span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          <span className="truncate font-mono text-faint">{path}</span>
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      </div>
      <Button asChild className="shrink-0" size="sm" variant="outline">
        <a download href={href}>
          <Download /> Download
        </a>
      </Button>
    </div>
  );
}

function Artifacts({ m, rootId }: { m: SessionManifest; rootId: string }) {
  const url = (p: string) => artifactUrl(rootId, m.id, p);
  const { trace, har, console: consoleRef } = m.artifacts;
  const shotCount = m.steps.filter((s) => s.screenshot).length;
  const groups: { items: ArtifactItem[]; title: string }[] = [
    {
      items: trace
        ? [
            {
              hint: (
                <>
                  View with{" "}
                  <code className="rounded-sm border border-border bg-well-2 px-1.5 py-0.5 font-mono text-xs">
                    npx playwright show-trace
                  </code>
                  .
                </>
              ),
              href: url(trace.path),
              icon: Activity,
              label: "Playwright trace",
              path: trace.path,
              size: fmtBytes(trace.bytes),
            },
          ]
        : [],
      title: "Trace",
    },
    {
      items: [
        ...(har
          ? [
              {
                href: url(har.path),
                icon: Network,
                label: "Network HAR",
                path: har.path,
                size: fmtBytes(har.bytes),
              },
            ]
          : []),
        ...(consoleRef
          ? [
              {
                href: url(consoleRef.path),
                icon: Terminal,
                label: "Console log",
                path: consoleRef.path,
                size: fmtBytes(consoleRef.bytes),
              },
            ]
          : []),
      ],
      title: "Network & logs",
    },
    {
      items: [
        {
          hint: "Machine-readable record referencing every artifact.",
          href: url("results.json"),
          icon: Braces,
          label: "Results index",
          path: "results.json",
        },
        ...(m.report
          ? [
              {
                hint: "The self-contained HTML report.",
                href: url(m.report.path),
                icon: FileText,
                label: "Original report",
                path: m.report.path,
              },
            ]
          : []),
      ],
      title: "Report & data",
    },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      {groups.map((g) => (
        <section className="mb-8" key={g.title}>
          <h2 className="mb-3 font-semibold text-sm tracking-tight">
            {g.title}
          </h2>
          <div className="flex flex-col gap-2.5">
            {g.items.map((it) => (
              <ArtifactCard key={it.label} {...it} />
            ))}
          </div>
        </section>
      ))}
      {m.artifacts.videos.length > 0 ? <Videos m={m} rootId={rootId} /> : null}
      {shotCount > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold text-sm tracking-tight">
            Screenshots{" "}
            <span className="text-faint tabular-nums">{shotCount}</span>
          </h2>
          <Screenshots m={m} rootId={rootId} />
        </section>
      ) : null}
    </>
  );
}
