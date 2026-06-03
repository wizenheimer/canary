"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { artifactUrl, fmtBytes, fmtClock, fmtMs } from "@/lib/format";
import type { SessionManifest } from "@/lib/manifest";
import type { ConsoleEntry } from "@/lib/parse-console";
import type { HarSummary } from "@/lib/parse-har";
import { cn } from "@/lib/utils";
import { Notice, Spinner, StatusBadge } from "./ui";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
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

interface DetailResponse {
  console: ConsoleEntry[];
  folder: string | null;
  har: HarSummary;
  manifest: SessionManifest;
  note: string;
  rootId: string;
  tags: string[];
}

const TABS = [
  ["summary", "Summary"],
  ["steps", "Steps"],
  ["screenshots", "Screenshots"],
  ["execution", "Execution"],
  ["commands", "Commands"],
  ["videos", "Videos"],
  ["console", "Console"],
  ["network", "Network"],
  ["artifacts", "Artifacts"],
] as const;

type TabId = (typeof TABS)[number][0];

const MIN_BAR_W = 1.5;

// Shared cell styling so the data tables keep the report's generous padding and
// uppercase column heads.
const TABLE_CLASS =
  "[&_th]:px-6 [&_th]:py-3 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-faint [&_td]:px-6 [&_td]:py-3 [&_td]:align-top";

function Panel({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count?: ReactNode;
  title?: string;
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
      {title ? (
        <div className="flex items-center gap-2.5 border-border border-b px-6 py-4">
          <h2 className="font-bold text-[13px] text-muted-foreground uppercase tracking-wider">
            {title}
          </h2>
          {count == null ? null : (
            <span className="ml-auto text-[13px] text-faint tabular-nums">
              {count}
            </span>
          )}
        </div>
      ) : null}
      {children}
    </div>
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
  const [tab, setTab] = useState<TabId>("summary");

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
      <main className="mx-auto max-w-[1200px] px-4 pt-12 pb-24 sm:px-8 lg:px-16">
        <Notice error>
          Could not load session: {error}.{" "}
          <Link className="inline-flex items-center gap-1" href="/">
            <ArrowLeft className="size-4" /> Back to sessions
          </Link>
        </Notice>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 pt-12 pb-24 sm:px-8 lg:px-16">
        <Spinner label="Loading session…" />
      </main>
    );
  }

  const m = data.manifest;
  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-12 pb-24 sm:px-8 lg:px-16">
      <header className="mb-8 text-center">
        <div className="font-medium text-muted-foreground text-sm">
          <Link className="hover:text-foreground" href="/">
            Canary
          </Link>{" "}
          <span className="mx-2 text-faint">›</span> {m.id}
        </div>
        <h1 className="mt-3.5 mb-5 break-words font-bold text-[clamp(28px,5vw,48px)] leading-[1.08] tracking-tight">
          {m.name ?? m.id}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-3.5">
          <StatusBadge status={m.status} />
          <span className="text-base text-muted-foreground">
            {fmtMs(m.durationMs)} duration
          </span>
        </div>
        {data.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {data.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
        {data.note ? (
          <p className="mt-3 text-[13px] text-muted-foreground">{data.note}</p>
        ) : null}
      </header>

      <Tabs onValueChange={(v) => setTab(v as TabId)} value={tab}>
        <TabsList
          className="mb-8 h-auto w-full flex-wrap justify-center gap-x-7 gap-y-1 rounded-none border-border border-b pb-0"
          variant="line"
        >
          {TABS.map(([tid, label]) => (
            <TabsTrigger
              className="flex-none rounded-none px-0.5 pb-3.5 font-semibold text-[15px] text-muted-foreground after:bottom-[-1px] after:h-[3px] after:bg-primary data-active:text-foreground"
              key={tid}
              value={tid}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary">
          <Summary m={m} />
        </TabsContent>
        <TabsContent value="steps">
          <Steps m={m} />
        </TabsContent>
        <TabsContent value="screenshots">
          <Screenshots m={m} rootId={rootId} />
        </TabsContent>
        <TabsContent value="execution">
          <Execution m={m} />
        </TabsContent>
        <TabsContent value="commands">
          <Commands m={m} />
        </TabsContent>
        <TabsContent value="videos">
          <Videos m={m} rootId={rootId} />
        </TabsContent>
        <TabsContent value="console">
          <ConsoleTab entries={data.console} />
        </TabsContent>
        <TabsContent value="network">
          <NetworkTab har={data.har} />
        </TabsContent>
        <TabsContent value="artifacts">
          <Artifacts m={m} rootId={rootId} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Summary({ m }: { m: SessionManifest }) {
  const s = m.summary;
  const cells: { bad: boolean; label: string; value: string }[] = [
    { bad: false, label: "Steps", value: String(s.stepsTotal) },
    { bad: false, label: "Passed", value: String(s.stepsPassed) },
    { bad: s.stepsFailed > 0, label: "Failed", value: String(s.stepsFailed) },
    { bad: false, label: "Duration", value: fmtMs(m.durationMs) },
    {
      bad: s.consoleErrors > 0,
      label: "Console errors",
      value: String(s.consoleErrors),
    },
    {
      bad: s.networkFailures > 0,
      label: "Network failures",
      value: String(s.networkFailures),
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {cells.map((c) => (
        <Card className="gap-1 p-6 shadow-none" key={c.label}>
          <div
            className={cn(
              "font-bold text-3xl tabular-nums leading-tight tracking-tight",
              c.bad && "text-fail"
            )}
          >
            {c.value}
          </div>
          <div className="font-medium text-muted-foreground text-sm">
            {c.label}
          </div>
        </Card>
      ))}
    </section>
  );
}

function Steps({ m }: { m: SessionManifest }) {
  return (
    <Panel
      count={`${m.summary.stepsPassed}/${m.summary.stepsTotal} passed`}
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
    <figure className="m-0">
      <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-lg border border-border bg-well">
        <img
          alt={cur.cap}
          className="block h-auto max-h-[62vh] w-auto max-w-full"
          src={cur.src}
        />
      </div>
      <figcaption className="my-3.5 break-words text-center font-medium text-muted-foreground text-sm">
        {cur.cap}
      </figcaption>
      <div className="flex flex-wrap justify-center gap-3">
        {items.map((it, i) => (
          <button
            className={cn(
              "h-[84px] w-[132px] overflow-hidden rounded border-2 border-transparent bg-well p-0",
              i === active && "border-primary"
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
    </figure>
  );
}

function Execution({ m }: { m: SessionManifest }) {
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
  const flags = Object.entries(m.capture)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .join(" · ");
  return (
    <>
      <Panel count={`${fmtMs(m.durationMs)} total`} title="Timeline">
        <div className="px-6 py-4">
          {rows.length === 0 ? (
            <Empty>No steps recorded.</Empty>
          ) : (
            rows.map(({ off, step, w }, i) => (
              <div
                className="flex items-center gap-4 py-1.5"
                key={`${i}-${step.name}`}
              >
                <span className="w-[200px] shrink-0 truncate font-semibold text-sm">
                  {step.name}
                </span>
                <span className="relative h-3.5 flex-1 rounded-full bg-well">
                  <span
                    className={cn(
                      "absolute top-0 h-3.5 min-w-1 rounded-full",
                      step.status === "fail" ? "bg-fail" : "bg-primary"
                    )}
                    style={{
                      left: `${off.toFixed(2)}%`,
                      width: `${w.toFixed(2)}%`,
                    }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-[13px] text-faint tabular-nums">
                  {fmtMs(step.durationMs)}
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>
      <Panel title="Environment">
        <Table className={TABLE_CLASS}>
          <TableBody>
            <TableRow>
              <TableCell className="w-[150px] font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Status
              </TableCell>
              <TableCell>
                <StatusBadge small status={m.status} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Browser
              </TableCell>
              <TableCell>
                {m.environment.browser} ·{" "}
                {m.environment.headless ? "headless" : "headed"}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Playwright
              </TableCell>
              <TableCell className="font-mono">
                {m.environment.playwrightVersion}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Platform
              </TableCell>
              <TableCell className="font-mono">
                {m.environment.platform}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Captured
              </TableCell>
              <TableCell>{flags || "none"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Started
              </TableCell>
              <TableCell className="tabular-nums">
                {fmtClock(m.createdAt)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Ended
              </TableCell>
              <TableCell className="tabular-nums">
                {fmtClock(m.endedAt)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Duration
              </TableCell>
              <TableCell className="tabular-nums">
                {fmtMs(m.durationMs)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Panel>
    </>
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
                <pre className="mx-6 mt-1 mb-3.5 overflow-auto whitespace-pre-wrap rounded border border-border bg-well-2 p-3.5 font-mono text-xs leading-relaxed">
                  {step.script}
                </pre>
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
  return (
    <Panel
      count={`${vids.length} file${vids.length === 1 ? "" : "s"}`}
      title="Videos"
    >
      {vids.length === 0 ? (
        <Empty>No video captured.</Empty>
      ) : (
        <div className="flex flex-col gap-6 px-6 py-4">
          {vids.map((v) => (
            <div key={v.path}>
              <video
                className="block w-full max-w-[760px] rounded-md border border-border bg-black"
                controls
                preload="metadata"
                src={artifactUrl(rootId, m.id, v.path)}
              >
                <track kind="captions" />
              </video>
              <div className="mt-2 flex items-center gap-3 text-[13px]">
                <span className="break-all text-muted-foreground">
                  {v.path}
                </span>
                <span className="text-faint text-xs tabular-nums">
                  {fmtBytes(v.bytes)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ConsoleTab({ entries }: { entries: ConsoleEntry[] }) {
  return (
    <Panel
      count={`${entries.length} message${entries.length === 1 ? "" : "s"}`}
      title="Console"
    >
      {entries.length === 0 ? (
        <Empty>No console output captured.</Empty>
      ) : (
        <Table className={TABLE_CLASS}>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: "120px" }}>Type</TableHead>
              <TableHead>Message</TableHead>
              <TableHead style={{ width: "220px" }}>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e, i) => {
              const isErr = e.kind === "pageerror" || e.type === "error";
              const label =
                e.kind === "pageerror" ? "pageerror" : (e.type ?? "log");
              const text = e.message ?? e.text ?? "";
              const src = e.url ? `${e.url}${e.line ? `:${e.line}` : ""}` : "";
              return (
                <TableRow
                  className={isErr ? "bg-fail-bg hover:bg-fail-bg" : undefined}
                  key={i}
                >
                  <TableCell>
                    <Badge variant="secondary">{label}</Badge>
                  </TableCell>
                  <TableCell className="break-words font-mono">
                    {text}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {src}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function NetworkTab({ har }: { har: HarSummary }) {
  const list = har.entries.length > 0 ? har.entries : har.slowest;
  return (
    <Panel
      count={`${har.total} request${har.total === 1 ? "" : "s"} · ${
        har.failed
      } failed`}
      title="Network"
    >
      {list.length === 0 ? (
        <Empty>No network activity captured.</Empty>
      ) : (
        <Table className={TABLE_CLASS}>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: "72px" }}>Status</TableHead>
              <TableHead style={{ width: "96px" }}>Method</TableHead>
              <TableHead style={{ width: "88px" }}>Time</TableHead>
              <TableHead>URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r, i) => (
              <TableRow
                className={
                  r.status === 0 || r.status >= 400
                    ? "bg-fail-bg hover:bg-fail-bg"
                    : undefined
                }
                key={i}
              >
                <TableCell className="tabular-nums">
                  {r.status || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.method}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {fmtMs(r.durationMs)}
                </TableCell>
                <TableCell className="max-w-[420px] truncate text-muted-foreground">
                  {r.url}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function ArtifactRow({
  children,
  hint,
  label,
  size,
}: {
  children: ReactNode;
  hint?: ReactNode;
  label: string;
  size?: string;
}) {
  return (
    <div className="border-border border-b px-6 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="min-w-[120px] font-semibold">{label}</span>
        {children}
        {size ? (
          <span className="text-faint text-xs tabular-nums">{size}</span>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-2 text-[13px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function Artifacts({ m, rootId }: { m: SessionManifest; rootId: string }) {
  const url = (p: string) => artifactUrl(rootId, m.id, p);
  const { trace, har, console: consoleRef } = m.artifacts;
  return (
    <Panel title="Artifacts">
      {trace ? (
        <ArtifactRow
          hint={
            <>
              Download, then view with{" "}
              <code className="rounded-sm border border-border bg-well-2 px-1.5 py-0.5 font-mono text-xs">
                npx playwright show-trace
              </code>
              .
            </>
          }
          label="Trace"
          size={fmtBytes(trace.bytes)}
        >
          <Button asChild size="sm" variant="outline">
            <a href={url(trace.path)}>{trace.path}</a>
          </Button>
        </ArtifactRow>
      ) : null}
      {har ? (
        <ArtifactRow label="Network HAR" size={fmtBytes(har.bytes)}>
          <Button asChild size="sm" variant="outline">
            <a href={url(har.path)}>{har.path}</a>
          </Button>
        </ArtifactRow>
      ) : null}
      {consoleRef ? (
        <ArtifactRow label="Console log" size={fmtBytes(consoleRef.bytes)}>
          <Button asChild size="sm" variant="outline">
            <a href={url(consoleRef.path)}>{consoleRef.path}</a>
          </Button>
        </ArtifactRow>
      ) : null}
      <ArtifactRow
        hint="Machine-readable record referencing every artifact."
        label="Results index"
      >
        <Button asChild size="sm" variant="outline">
          <a href={url("results.json")}>results.json</a>
        </Button>
      </ArtifactRow>
      {m.report ? (
        <ArtifactRow
          hint="The self-contained HTML report."
          label="Original report"
        >
          <Button asChild size="sm" variant="outline">
            <a href={url(m.report.path)}>{m.report.path}</a>
          </Button>
        </ArtifactRow>
      ) : null}
    </Panel>
  );
}
