"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { artifactUrl, fmtBytes, fmtClock, fmtMs } from "@/lib/format";
import type { SessionManifest } from "@/lib/manifest";
import type { ConsoleEntry } from "@/lib/parse-console";
import type { HarSummary } from "@/lib/parse-har";
import { Notice, Spinner, StatusBadge } from "./ui";

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
      <main className="page">
        <Notice error>
          Could not load session: {error}.{" "}
          <Link href="/">← Back to sessions</Link>
        </Notice>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page">
        <Spinner label="Loading session…" />
      </main>
    );
  }

  const m = data.manifest;
  return (
    <main className="page">
      <header className="rhead">
        <div className="crumb">
          <Link href="/">Canary</Link> <span className="sep">›</span> {m.id}
        </div>
        <h1 className="title">{m.name ?? m.id}</h1>
        <div className="status-row">
          <StatusBadge status={m.status} />
          <span className="dur">{fmtMs(m.durationMs)} duration</span>
        </div>
        {data.tags.length > 0 ? (
          <div className="status-row" style={{ marginTop: "12px" }}>
            {data.tags.map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        ) : null}
        {data.note ? (
          <p className="hint" style={{ textAlign: "center" }}>
            {data.note}
          </p>
        ) : null}
      </header>

      <nav className="tabs">
        {TABS.map(([tid, label]) => (
          <button
            className={`tab ${tab === tid ? "is-active" : ""}`}
            key={tid}
            onClick={() => setTab(tid)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <div>
        {tab === "summary" ? <Summary m={m} /> : null}
        {tab === "steps" ? <Steps m={m} /> : null}
        {tab === "screenshots" ? <Screenshots m={m} rootId={rootId} /> : null}
        {tab === "execution" ? <Execution m={m} /> : null}
        {tab === "commands" ? <Commands m={m} /> : null}
        {tab === "videos" ? <Videos m={m} rootId={rootId} /> : null}
        {tab === "console" ? <ConsoleTab entries={data.console} /> : null}
        {tab === "network" ? <NetworkTab har={data.har} /> : null}
        {tab === "artifacts" ? <Artifacts m={m} rootId={rootId} /> : null}
      </div>
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
    <section className="kpis">
      {cells.map((c) => (
        <div className="kpi" key={c.label}>
          <div className={c.bad ? "n fail" : "n"}>{c.value}</div>
          <div className="l">{c.label}</div>
        </div>
      ))}
    </section>
  );
}

function Steps({ m }: { m: SessionManifest }) {
  return (
    <div className="card">
      <div className="card-h">
        <h2>Steps</h2>
        <span className="count">
          {m.summary.stepsPassed}/{m.summary.stepsTotal} passed
        </span>
      </div>
      {m.steps.length === 0 ? (
        <div className="empty">No steps recorded.</div>
      ) : (
        m.steps.map((step, i) => {
          const n = step.actions.length;
          return (
            <div className="srow" key={`${i}-${step.name}`}>
              <span className={`dot ${step.status}`} />
              <span className="sname">{step.name}</span>
              <span className="smeta">
                exit {step.exitCode} · {fmtMs(step.durationMs)}
                {n > 0 ? ` · ${n} action${n === 1 ? "" : "s"}` : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
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
      <div className="card">
        <div className="empty">No screenshots captured.</div>
      </div>
    );
  }
  const cur = items[Math.min(active, items.length - 1)] ?? items[0];
  return (
    <figure className="gallery">
      <div className="stage">
        <img alt={cur.cap} src={cur.src} />
      </div>
      <figcaption className="shot-cap">{cur.cap}</figcaption>
      <div className="thumbs">
        {items.map((it, i) => (
          <button
            className={`thumb ${i === active ? "is-active" : ""}`}
            key={`${i}-${it.src}`}
            onClick={() => setActive(i)}
            type="button"
          >
            <img alt={it.cap} src={it.src} />
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
      <div className="card">
        <div className="card-h">
          <h2>Timeline</h2>
          <span className="count">{fmtMs(m.durationMs)} total</span>
        </div>
        <div className="timeline">
          {rows.length === 0 ? (
            <div className="empty">No steps recorded.</div>
          ) : (
            rows.map(({ off, step, w }, i) => (
              <div className="trow" key={`${i}-${step.name}`}>
                <span className="tname">{step.name}</span>
                <span className="track">
                  <span
                    className={`bar ${step.status}`}
                    style={{
                      left: `${off.toFixed(2)}%`,
                      width: `${w.toFixed(2)}%`,
                    }}
                  />
                </span>
                <span className="tmeta">{fmtMs(step.durationMs)}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-h">
          <h2>Environment</h2>
        </div>
        <table>
          <tbody>
            <tr>
              <td className="tag" style={{ width: "150px" }}>
                Status
              </td>
              <td>
                <StatusBadge small status={m.status} />
              </td>
            </tr>
            <tr>
              <td className="tag">Browser</td>
              <td>
                {m.environment.browser} ·{" "}
                {m.environment.headless ? "headless" : "headed"}
              </td>
            </tr>
            <tr>
              <td className="tag">Playwright</td>
              <td className="mono">{m.environment.playwrightVersion}</td>
            </tr>
            <tr>
              <td className="tag">Platform</td>
              <td className="mono">{m.environment.platform}</td>
            </tr>
            <tr>
              <td className="tag">Captured</td>
              <td>{flags || "none"}</td>
            </tr>
            <tr>
              <td className="tag">Started</td>
              <td className="num">{fmtClock(m.createdAt)}</td>
            </tr>
            <tr>
              <td className="tag">Ended</td>
              <td className="num">{fmtClock(m.endedAt)}</td>
            </tr>
            <tr>
              <td className="tag">Duration</td>
              <td className="num">{fmtMs(m.durationMs)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Commands({ m }: { m: SessionManifest }) {
  const steps = m.steps.filter(
    (s) => (s.script && s.script.trim().length > 0) || s.actions.length > 0
  );
  if (steps.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          No commands captured. Enable trace capture to record Playwright
          actions.
        </div>
      </div>
    );
  }
  return (
    <>
      {steps.map((step, i) => (
        <div className="card" key={`${i}-${step.name}`}>
          <div className="card-h">
            <h2>{step.name}</h2>
            <span className="count">
              {step.actions.length} action{step.actions.length === 1 ? "" : "s"}{" "}
              · {fmtMs(step.durationMs)}
            </span>
          </div>
          {step.script && step.script.trim().length > 0 ? (
            <details className="scriptbox">
              <summary>Script</summary>
              <pre>{step.script}</pre>
            </details>
          ) : null}
          {step.actions.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th style={{ width: "220px" }}>Action</th>
                  <th>Params</th>
                  <th style={{ width: "88px" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {step.actions.map((a, i) => (
                  <tr
                    className={a.error ? "err" : ""}
                    key={`${a.apiName}-${i}`}
                  >
                    <td>
                      <span className="chip">{a.apiName}</span>
                    </td>
                    <td className="mono cmd-params">
                      {a.params}
                      {a.error ? (
                        <div className="cmd-err">{a.error}</div>
                      ) : null}
                    </td>
                    <td className="num">
                      {a.durationMs === undefined ? "—" : fmtMs(a.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No Playwright actions recorded.</div>
          )}
        </div>
      ))}
    </>
  );
}

function Videos({ m, rootId }: { m: SessionManifest; rootId: string }) {
  const vids = m.artifacts.videos;
  return (
    <div className="card">
      <div className="card-h">
        <h2>Videos</h2>
        <span className="count">
          {vids.length} file{vids.length === 1 ? "" : "s"}
        </span>
      </div>
      {vids.length === 0 ? (
        <div className="empty">No video captured.</div>
      ) : (
        <div className="vids">
          {vids.map((v) => (
            <div className="vid" key={v.path}>
              <video
                controls
                preload="metadata"
                src={artifactUrl(rootId, m.id, v.path)}
              >
                <track kind="captions" />
              </video>
              <div className="vmeta">
                <span className="url">{v.path}</span>
                <span className="sz">{fmtBytes(v.bytes)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsoleTab({ entries }: { entries: ConsoleEntry[] }) {
  return (
    <div className="card">
      <div className="card-h">
        <h2>Console</h2>
        <span className="count">
          {entries.length} message{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="empty">No console output captured.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: "120px" }}>Type</th>
              <th>Message</th>
              <th style={{ width: "220px" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isErr = e.kind === "pageerror" || e.type === "error";
              const label =
                e.kind === "pageerror" ? "pageerror" : (e.type ?? "log");
              const text = e.message ?? e.text ?? "";
              const src = e.url ? `${e.url}${e.line ? `:${e.line}` : ""}` : "";
              return (
                <tr className={isErr ? "err" : ""} key={i}>
                  <td>
                    <span className="chip">{label}</span>
                  </td>
                  <td className="mono">{text}</td>
                  <td className="src truncate">{src}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NetworkTab({ har }: { har: HarSummary }) {
  const list = har.entries.length > 0 ? har.entries : har.slowest;
  return (
    <div className="card">
      <div className="card-h">
        <h2>Network</h2>
        <span className="count">
          {har.total} request{har.total === 1 ? "" : "s"} · {har.failed} failed
        </span>
      </div>
      {list.length === 0 ? (
        <div className="empty">No network activity captured.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: "72px" }}>Status</th>
              <th style={{ width: "96px" }}>Method</th>
              <th style={{ width: "88px" }}>Time</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr
                className={r.status === 0 || r.status >= 400 ? "err" : ""}
                key={i}
              >
                <td className="num">{r.status || "—"}</td>
                <td>
                  <span className="chip">{r.method}</span>
                </td>
                <td className="num">{fmtMs(r.durationMs)}</td>
                <td className="url truncate">{r.url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Artifacts({ m, rootId }: { m: SessionManifest; rootId: string }) {
  const url = (p: string) => artifactUrl(rootId, m.id, p);
  const { trace, har, console: consoleRef } = m.artifacts;
  return (
    <div className="card">
      <div className="card-h">
        <h2>Artifacts</h2>
      </div>
      {trace ? (
        <div className="art">
          <div className="art-row">
            <span className="k">Trace</span>
            <a className="btn" href={url(trace.path)}>
              {trace.path}
            </a>
            <span className="sz">{fmtBytes(trace.bytes)}</span>
          </div>
          <div className="hint">
            Download, then view with <code>npx playwright show-trace</code>.
          </div>
        </div>
      ) : null}
      {har ? (
        <div className="art">
          <div className="art-row">
            <span className="k">Network HAR</span>
            <a className="btn" href={url(har.path)}>
              {har.path}
            </a>
            <span className="sz">{fmtBytes(har.bytes)}</span>
          </div>
        </div>
      ) : null}
      {consoleRef ? (
        <div className="art">
          <div className="art-row">
            <span className="k">Console log</span>
            <a className="btn" href={url(consoleRef.path)}>
              {consoleRef.path}
            </a>
            <span className="sz">{fmtBytes(consoleRef.bytes)}</span>
          </div>
        </div>
      ) : null}
      <div className="art">
        <div className="art-row">
          <span className="k">Results index</span>
          <a className="btn" href={url("results.json")}>
            results.json
          </a>
        </div>
        <div className="hint">
          Machine-readable record referencing every artifact.
        </div>
      </div>
      {m.report ? (
        <div className="art">
          <div className="art-row">
            <span className="k">Original report</span>
            <a className="btn" href={url(m.report.path)}>
              {m.report.path}
            </a>
          </div>
          <div className="hint">The self-contained HTML report.</div>
        </div>
      ) : null}
    </div>
  );
}
