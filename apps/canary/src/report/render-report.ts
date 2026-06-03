import { formatDurationMs } from "@canary/cli-kit";
import { sessionStepSlug } from "@canary/protocol";
import type { SessionManifest } from "./manifest.js";
import type { ConsoleEntry } from "./parse-console.js";
import type { HarSummary } from "./parse-har.js";

export interface RenderContext {
  consoleEntries: ConsoleEntry[];
  parsedHar: HarSummary;
  screenshots: Record<string, string>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Duration formatting is shared with the CLI's `status`/`session list` output.
const fmtMs = formatDurationMs;

function fmtBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtClock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  return new Date(ms).toLocaleString();
}

// "High-Contrast Precision": centered single column, big title, lime status pill,
// and a horizontal tab nav with a lime active underline. Self-contained — inlined
// CSS + a tiny vanilla tab/gallery script (no fonts/CDN/framework). Surfaces are
// white on #f9f9f9, depth comes from 1px outlines + tonal wells (no shadows), and
// the lime accent (#e4f222) is reserved for status and the active tab.
const STYLE = `
:root{
  --surface:#f9f9f9; --card:#fff; --well:#f3f3f3; --well-2:#eeeeee;
  --ink:#1a1c1c; --ink-strong:#0a0a0a; --muted:#5f5e5e; --faint:#84856f;
  --line:#e5e5e5; --line-2:#d3d3c2;
  --primary:#e4f222; --on-primary:#0a0a0a;
  --pass:#2f6f12; --fail:#ba1a1a; --fail-bg:#ffdad6; --on-fail:#93000a;
  --warn:#8a5d00; --warn-bg:#fbf3e0;
  --r-sm:2px; --r:4px; --r-md:6px; --r-lg:8px; --r-full:9999px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--ink);
  font:16px/1.5 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
.page{max-width:1200px;margin:0 auto;padding:48px 64px 96px}
/* header */
.rhead{text-align:center;margin-bottom:30px}
.crumb{color:var(--muted);font-size:14px;font-weight:500;letter-spacing:.01em}
.crumb .sep{margin:0 8px;color:var(--faint)}
.title{font-size:clamp(28px,5vw,48px);line-height:1.08;font-weight:700;letter-spacing:-.02em;
  margin:14px 0 20px;color:var(--ink);word-break:break-word}
.status-row{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap}
.dur{color:var(--muted);font-size:16px}
/* badges */
.badge{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:var(--r-full);
  font-size:13px;font-weight:700;letter-spacing:.04em;border:1px solid transparent;white-space:nowrap}
.badge .ico{flex:0 0 auto;display:block}
.badge.sm{padding:3px 10px;font-size:11px;gap:5px;letter-spacing:.02em;text-transform:capitalize}
.badge.passed,.badge.pass{background:var(--primary);color:var(--on-primary);border-color:#cdd900}
.badge.failed,.badge.fail{background:var(--fail-bg);color:var(--on-fail);border-color:#f3c4c0}
.badge.aborted{background:var(--warn-bg);color:var(--warn);border-color:#ecdcae}
/* tabs */
.tabs{display:flex;justify-content:center;flex-wrap:wrap;gap:28px;
  border-bottom:1px solid var(--line);margin-bottom:40px}
.tab{appearance:none;border:0;background:transparent;font:inherit;font-size:15px;font-weight:600;
  color:var(--muted);cursor:pointer;padding:0 2px 14px;border-bottom:3px solid transparent;margin-bottom:-1px}
.tab:hover{color:var(--ink)}
.tab.is-active{color:var(--ink);border-bottom-color:var(--primary)}
/* panels */
.panel.is-hidden{display:none}
/* kpis */
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r-md);padding:22px 24px}
.kpi .n{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.kpi .n.fail{color:var(--fail)}
.kpi .l{margin-top:6px;color:var(--muted);font-size:14px;font-weight:500}
/* card */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;margin-bottom:24px}
.card-h{display:flex;align-items:center;gap:10px;padding:16px 24px;border-bottom:1px solid var(--line)}
h2{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0}
.card-h .count{margin-left:auto;color:var(--faint);font-size:13px;font-variant-numeric:tabular-nums}
.empty{color:var(--faint);font-style:italic;padding:40px 24px;text-align:center}
/* steps */
.srow{display:flex;align-items:center;gap:14px;padding:15px 24px;border-bottom:1px solid var(--line)}
.srow:last-child{border-bottom:0}
.srow:hover{background:rgba(228,242,34,.06)}
.dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:var(--line-2);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.dot.pass{background:var(--primary)}
.dot.fail{background:var(--fail);box-shadow:none}
.sname{font-weight:600;letter-spacing:-.005em;min-width:0;word-break:break-word}
.smeta{margin-left:auto;color:var(--faint);font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
/* screenshots gallery */
.gallery{margin:0}
.stage{background:var(--well);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;
  display:flex;align-items:center;justify-content:center;min-height:200px}
.stage img{display:block;max-width:100%;max-height:62vh;width:auto;height:auto}
#shot-cap{text-align:center;color:var(--muted);font-size:14px;font-weight:500;margin:14px 0 20px;word-break:break-word}
.thumbs{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.thumb{padding:0;border:2px solid transparent;border-radius:var(--r);background:var(--well);
  cursor:pointer;overflow:hidden;width:132px;height:84px}
.thumb img{display:block;width:100%;height:100%;object-fit:cover}
.thumb:hover{border-color:var(--line-2)}
.thumb.is-active{border-color:var(--primary)}
/* execution timeline */
.timeline{padding:18px 24px}
.trow{display:flex;align-items:center;gap:16px;padding:7px 0}
.tname{flex:0 0 200px;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.track{position:relative;flex:1;height:14px;background:var(--well);border-radius:var(--r-full)}
.bar{position:absolute;top:0;height:14px;border-radius:var(--r-full);min-width:4px}
.bar.pass{background:var(--primary)}
.bar.fail{background:var(--fail)}
.tmeta{flex:0 0 auto;color:var(--faint);font-size:13px;font-variant-numeric:tabular-nums;width:64px;text-align:right}
/* tables */
table{width:100%;border-collapse:collapse;font-size:14px}
thead th{text-align:left;padding:11px 24px;color:var(--faint);font-weight:600;font-size:11px;
  letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid var(--line)}
tbody td{padding:11px 24px;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:rgba(228,242,34,.05)}
tr.err td{background:var(--fail-bg)}
.tag{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.chip{display:inline-block;background:var(--well-2);border-radius:var(--r-full);padding:2px 10px;
  font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--ink)}
.num{font-variant-numeric:tabular-nums;color:var(--ink)}
.url,.src{color:var(--muted);word-break:break-all}
.truncate{max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* videos */
.vids{padding:18px 24px;display:flex;flex-direction:column;gap:24px}
.vid video{display:block;width:100%;max-width:760px;border:1px solid var(--line);border-radius:var(--r-md);background:#000}
.vmeta{display:flex;gap:12px;align-items:center;margin-top:8px;font-size:13px}
/* artifacts */
.art{padding:18px 24px;border-bottom:1px solid var(--line)}
.art:last-child{border-bottom:0}
.art-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.art .k{font-weight:600;min-width:120px}
.sz{color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid var(--line-2);
  border-radius:var(--r);background:var(--card);color:var(--ink);text-decoration:none;font-size:13px;font-weight:600}
.btn:hover{border-color:var(--ink-strong)}
.hint{font-size:13px;color:var(--muted);margin-top:8px}
code{background:var(--well-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:2px 7px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
/* commands */
.scriptbox{margin:0;padding:14px 24px;border-bottom:1px solid var(--line)}
.scriptbox summary{cursor:pointer;font-weight:700;font-size:11px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--muted)}
.scriptbox pre{margin:12px 0 2px;background:var(--well-2);border:1px solid var(--line);border-radius:var(--r);
  padding:14px 16px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px;line-height:1.55;color:var(--ink);white-space:pre-wrap;word-break:break-word}
.cmd-params{color:var(--muted);word-break:break-word}
.cmd-err{margin-top:4px;color:var(--on-fail);font-size:12px}
/* responsive: desktop → tablet → mobile (narrower rules come last so they win) */
@media (max-width:1024px){
  .page{padding:40px 32px 80px}
  .tabs{gap:22px}
}
@media (max-width:880px){
  .page{padding:32px 16px 64px}
  .tabs{gap:18px;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto}
  .tab{white-space:nowrap}
  .kpis{grid-template-columns:repeat(2,1fr)}
  .tname{flex-basis:120px}
  .card-h,thead th,tbody td,.srow,.timeline,.vids,.art{padding-left:16px;padding-right:16px}
}
@media (max-width:480px){
  .kpis{grid-template-columns:1fr}
  .title{margin:10px 0 16px}
}
`;

const TAB_SCRIPT = `
(function(){
  var tabs=document.querySelectorAll('[data-tab]');
  var panels=document.querySelectorAll('.panel');
  function show(id){
    for(var i=0;i<panels.length;i++){panels[i].classList.toggle('is-hidden',panels[i].id!=='panel-'+id);}
    for(var j=0;j<tabs.length;j++){tabs[j].classList.toggle('is-active',tabs[j].getAttribute('data-tab')===id);}
  }
  for(var k=0;k<tabs.length;k++){
    tabs[k].addEventListener('click',function(){var id=this.getAttribute('data-tab');show(id);history.replaceState(null,'','#'+id);});
  }
  var initial=(location.hash||'').replace('#','')||'summary';
  show(document.getElementById('panel-'+initial)?initial:'summary');
  var thumbs=document.querySelectorAll('.thumb');
  var main=document.getElementById('shot-main');
  var cap=document.getElementById('shot-cap');
  for(var t=0;t<thumbs.length;t++){
    thumbs[t].addEventListener('click',function(){
      var img=this.querySelector('img');
      if(main&&img){main.src=img.getAttribute('src');main.alt=this.getAttribute('data-cap')||'';}
      if(cap){cap.textContent=this.getAttribute('data-cap')||'';}
      for(var n=0;n<thumbs.length;n++){thumbs[n].classList.toggle('is-active',thumbs[n]===this);}
    });
  }
})();
`;

const TABS: [string, string][] = [
  ["summary", "Summary"],
  ["steps", "Steps"],
  ["screenshots", "Screenshots"],
  ["execution", "Execution"],
  ["commands", "Commands"],
  ["videos", "Videos"],
  ["console", "Console"],
  ["network", "Network"],
  ["artifacts", "Artifacts"],
];

function statusIcon(status: string): string {
  let inner: string;
  if (status === "passed") {
    inner =
      '<path d="M4.5 8.3l2.4 2.3 4.6-4.9" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (status === "failed") {
    inner =
      '<path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>';
  } else {
    inner =
      '<path d="M5 8h6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>';
  }
  return `<svg class="ico" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/>${inner}</svg>`;
}

function renderHeader(m: SessionManifest): string {
  return `
  <header class="rhead">
    <div class="crumb">Canary <span class="sep">›</span> ${escapeHtml(m.id)}</div>
    <h1 class="title">${escapeHtml(m.name ?? m.id)}</h1>
    <div class="status-row">
      <span class="badge ${m.status}">${statusIcon(m.status)}${m.status.toUpperCase()}</span>
      <span class="dur">${fmtMs(m.durationMs)} duration</span>
    </div>
  </header>`;
}

function renderTabs(): string {
  const buttons = TABS.map(
    ([id, label], i) =>
      `<button class="tab${i === 0 ? " is-active" : ""}" data-tab="${id}">${label}</button>`
  ).join("");
  return `<nav class="tabs">${buttons}</nav>`;
}

function renderSummary(m: SessionManifest): string {
  const s = m.summary;
  const cells: [string, string, string][] = [
    [String(s.stepsTotal), "Steps", ""],
    [String(s.stepsPassed), "Passed", ""],
    [String(s.stepsFailed), "Failed", s.stepsFailed > 0 ? "fail" : ""],
    [fmtMs(m.durationMs), "Duration", ""],
    [
      String(s.consoleErrors),
      "Console errors",
      s.consoleErrors > 0 ? "fail" : "",
    ],
    [
      String(s.networkFailures),
      "Network failures",
      s.networkFailures > 0 ? "fail" : "",
    ],
  ];
  const kpis = cells
    .map(
      ([value, label, cls]) =>
        `<div class="kpi"><div class="n ${cls}">${value}</div><div class="l">${label}</div></div>`
    )
    .join("");
  return `
  <section class="panel" id="panel-summary">
    <div class="kpis">${kpis}</div>
  </section>`;
}

function renderSteps(m: SessionManifest): string {
  const body =
    m.steps.length === 0
      ? '<div class="empty">No steps recorded.</div>'
      : m.steps
          .map((step) => {
            const n = step.actions.length;
            const note = n > 0 ? ` · ${n} action${n === 1 ? "" : "s"}` : "";
            return `
        <div class="srow">
          <span class="dot ${step.status}"></span>
          <span class="sname">${escapeHtml(step.name)}</span>
          <span class="smeta">exit ${step.exitCode} · ${fmtMs(step.durationMs)}${note}</span>
        </div>`;
          })
          .join("");
  return `
  <section class="panel is-hidden" id="panel-steps">
    <div class="card">
      <div class="card-h"><h2>Steps</h2><span class="count">${m.summary.stepsPassed}/${m.summary.stepsTotal} passed</span></div>
      ${body}
    </div>
  </section>`;
}

function renderScreenshots(
  m: SessionManifest,
  screenshots: Record<string, string>
): string {
  const items = m.steps
    .map((step) => ({
      cap: step.name,
      src: screenshots[sessionStepSlug(step.name)],
    }))
    .filter((it): it is { cap: string; src: string } => Boolean(it.src));
  const first = items[0];
  if (!first) {
    return `
  <section class="panel is-hidden" id="panel-screenshots">
    <div class="card"><div class="empty">No screenshots captured.</div></div>
  </section>`;
  }
  const thumbs = items
    .map(
      (it, i) =>
        `<button class="thumb${i === 0 ? " is-active" : ""}" data-cap="${escapeHtml(it.cap)}"><img alt="${escapeHtml(it.cap)}" src="${escapeHtml(it.src)}"/></button>`
    )
    .join("");
  return `
  <section class="panel is-hidden" id="panel-screenshots">
    <figure class="gallery">
      <div class="stage"><img alt="${escapeHtml(first.cap)}" id="shot-main" src="${escapeHtml(first.src)}"/></div>
      <figcaption id="shot-cap">${escapeHtml(first.cap)}</figcaption>
      <div class="thumbs">${thumbs}</div>
    </figure>
  </section>`;
}

function renderExecution(m: SessionManifest): string {
  const t0 = Date.parse(m.createdAt);
  const span = Math.max(m.durationMs, 1);
  const MIN_W = 1.5;
  let cursor = 0;
  const rows =
    m.steps.length === 0
      ? '<div class="empty">No steps recorded.</div>'
      : m.steps
          .map((step) => {
            const start = Date.parse(step.startedAt);
            let off: number;
            if (Number.isNaN(start) || Number.isNaN(t0)) {
              off = (cursor / span) * 100;
            } else {
              off = ((start - t0) / span) * 100;
            }
            // Advance the fallback cursor for EVERY step (not just invalid ones)
            // so an invalid-timestamp step following valid ones lands after
            // them, not stacked at offset 0.
            cursor += step.durationMs;
            off = Math.min(Math.max(off, 0), 100);
            let w = Math.max((step.durationMs / span) * 100, MIN_W);
            if (off + w > 100) {
              w = Math.max(100 - off, MIN_W);
            }
            return `
        <div class="trow">
          <span class="tname">${escapeHtml(step.name)}</span>
          <span class="track"><span class="bar ${step.status}" style="left:${off.toFixed(2)}%;width:${w.toFixed(2)}%"></span></span>
          <span class="tmeta">${fmtMs(step.durationMs)}</span>
        </div>`;
          })
          .join("");
  const flags = Object.entries(m.capture)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .join(" · ");
  return `
  <section class="panel is-hidden" id="panel-execution">
    <div class="card">
      <div class="card-h"><h2>Timeline</h2><span class="count">${fmtMs(m.durationMs)} total</span></div>
      <div class="timeline">${rows}</div>
    </div>
    <div class="card">
      <div class="card-h"><h2>Environment</h2></div>
      <table><tbody>
        <tr><td class="tag" style="width:150px">Status</td><td><span class="badge sm ${m.status}">${m.status}</span></td></tr>
        <tr><td class="tag">Browser</td><td>${escapeHtml(m.environment.browser)} · ${m.environment.headless ? "headless" : "headed"}</td></tr>
        <tr><td class="tag">Playwright</td><td class="mono">${escapeHtml(m.environment.playwrightVersion)}</td></tr>
        <tr><td class="tag">Platform</td><td class="mono">${escapeHtml(m.environment.platform)}</td></tr>
        <tr><td class="tag">Captured</td><td>${escapeHtml(flags || "none")}</td></tr>
        <tr><td class="tag">Started</td><td class="num">${escapeHtml(fmtClock(m.createdAt))}</td></tr>
        <tr><td class="tag">Ended</td><td class="num">${escapeHtml(fmtClock(m.endedAt))}</td></tr>
        <tr><td class="tag">Duration</td><td class="num">${fmtMs(m.durationMs)}</td></tr>
      </tbody></table>
    </div>
  </section>`;
}

function renderCommandsRow(
  action: SessionManifest["steps"][number]["actions"][number]
): string {
  const params = action.params ? escapeHtml(action.params) : "";
  const err = action.error
    ? `<div class="cmd-err">${escapeHtml(action.error)}</div>`
    : "";
  const time = action.durationMs === undefined ? "—" : fmtMs(action.durationMs);
  return `<tr class="${action.error ? "err" : ""}"><td><span class="chip">${escapeHtml(action.apiName)}</span></td><td class="mono cmd-params">${params}${err}</td><td class="num">${time}</td></tr>`;
}

function renderCommandStep(step: SessionManifest["steps"][number]): string {
  const hasScript = Boolean(step.script?.trim());
  const hasActions = step.actions.length > 0;
  if (!(hasScript || hasActions)) {
    return "";
  }
  const scriptBlock = hasScript
    ? `<details class="scriptbox"><summary>Script</summary><pre>${escapeHtml(step.script ?? "")}</pre></details>`
    : "";
  const body = hasActions
    ? `<table><thead><tr><th style="width:220px">Action</th><th>Params</th><th style="width:88px">Time</th></tr></thead><tbody>${step.actions
        .map(renderCommandsRow)
        .join("")}</tbody></table>`
    : '<div class="empty">No Playwright actions recorded for this step.</div>';
  const n = step.actions.length;
  return `
    <div class="card">
      <div class="card-h"><h2>${escapeHtml(step.name)}</h2><span class="count">${n} action${n === 1 ? "" : "s"} · ${fmtMs(step.durationMs)}</span></div>
      ${scriptBlock}
      ${body}
    </div>`;
}

// "What was sent": the per-step script + the Playwright actions recovered from
// the trace. Empty when trace capture was off and no scripts were recorded.
function renderCommands(m: SessionManifest): string {
  const cards = m.steps.map(renderCommandStep).join("");
  const body =
    cards.trim().length > 0
      ? cards
      : '<div class="card"><div class="empty">No commands captured. Enable trace capture to record Playwright actions.</div></div>';
  return `
  <section class="panel is-hidden" id="panel-commands">
    ${body}
  </section>`;
}

function renderVideos(m: SessionManifest): string {
  const videos = m.artifacts.videos;
  const body =
    videos.length === 0
      ? '<div class="empty">No video captured.</div>'
      : videos
          .map((v) => {
            const p = escapeHtml(v.path);
            return `<div class="vid"><video controls preload="metadata" src="./${p}"></video><div class="vmeta"><span class="url">${p}</span><span class="sz">${fmtBytes(v.bytes)}</span></div></div>`;
          })
          .join("");
  return `
  <section class="panel is-hidden" id="panel-videos">
    <div class="card">
      <div class="card-h"><h2>Videos</h2><span class="count">${videos.length} file${videos.length === 1 ? "" : "s"}</span></div>
      <div class="vids">${body}</div>
    </div>
  </section>`;
}

function renderConsole(entries: ConsoleEntry[]): string {
  let body: string;
  if (entries.length === 0) {
    body = '<div class="empty">No console output captured.</div>';
  } else {
    const rows = entries
      .map((e) => {
        const isErr = e.kind === "pageerror" || e.type === "error";
        const label = e.kind === "pageerror" ? "pageerror" : (e.type ?? "log");
        const text = e.message ?? e.text ?? "";
        const src = e.url ? `${e.url}${e.line ? `:${e.line}` : ""}` : "";
        return `<tr class="${isErr ? "err" : ""}"><td><span class="chip">${escapeHtml(label)}</span></td><td class="mono">${escapeHtml(text)}</td><td class="src truncate">${escapeHtml(src)}</td></tr>`;
      })
      .join("");
    body = `<table><thead><tr><th style="width:120px">Type</th><th>Message</th><th style="width:220px">Source</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  return `
  <section class="panel is-hidden" id="panel-console">
    <div class="card">
      <div class="card-h"><h2>Console</h2><span class="count">${entries.length} message${entries.length === 1 ? "" : "s"}</span></div>
      ${body}
    </div>
  </section>`;
}

function renderNetwork(har: HarSummary): string {
  // `slowest` is derived from `entries` (a slice of it), so it is empty whenever
  // entries is — the old `entries.length > 0 ? entries : slowest` fallback could
  // never fire. Render the full entry list directly.
  const list = har.entries;
  let body: string;
  if (list.length === 0) {
    body = '<div class="empty">No network activity captured.</div>';
  } else {
    const rows = list
      .map(
        (r) =>
          `<tr class="${r.status === 0 || r.status >= 400 ? "err" : ""}"><td class="num">${r.status || "—"}</td><td><span class="chip">${escapeHtml(r.method)}</span></td><td class="num">${fmtMs(r.durationMs)}</td><td class="url truncate">${escapeHtml(r.url)}</td></tr>`
      )
      .join("");
    body = `<table><thead><tr><th style="width:72px">Status</th><th style="width:96px">Method</th><th style="width:88px">Time</th><th>URL</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  return `
  <section class="panel is-hidden" id="panel-network">
    <div class="card">
      <div class="card-h"><h2>Network</h2><span class="count">${har.total} request${har.total === 1 ? "" : "s"} · ${har.failed} failed</span></div>
      ${body}
    </div>
  </section>`;
}

function renderArtifacts(m: SessionManifest): string {
  const items: string[] = [];
  if (m.artifacts.trace) {
    const p = escapeHtml(m.artifacts.trace.path);
    items.push(
      `<div class="art"><div class="art-row"><span class="k">Trace</span><a class="btn" href="./${p}">${p}</a><span class="sz">${fmtBytes(m.artifacts.trace.bytes)}</span></div><div class="hint">View with <code>npx playwright show-trace ./${p}</code></div></div>`
    );
  }
  if (m.artifacts.har) {
    const p = escapeHtml(m.artifacts.har.path);
    items.push(
      `<div class="art"><div class="art-row"><span class="k">Network HAR</span><a class="btn" href="./${p}">${p}</a><span class="sz">${fmtBytes(m.artifacts.har.bytes)}</span></div></div>`
    );
  }
  if (m.artifacts.console) {
    const p = escapeHtml(m.artifacts.console.path);
    items.push(
      `<div class="art"><div class="art-row"><span class="k">Console log</span><a class="btn" href="./${p}">${p}</a><span class="sz">${fmtBytes(m.artifacts.console.bytes)}</span></div></div>`
    );
  }
  items.push(
    `<div class="art"><div class="art-row"><span class="k">Results index</span><a class="btn" href="./results.json">results.json</a></div><div class="hint">Machine-readable record referencing every artifact — for tooling and viewers.</div></div>`
  );
  return `
  <section class="panel is-hidden" id="panel-artifacts">
    <div class="card">
      <div class="card-h"><h2>Artifacts</h2></div>
      ${items.join("")}
    </div>
  </section>`;
}

// Self-contained, centered, tabbed report. Small data (screenshots base64,
// console, network summary) is inlined; heavy artifacts (trace.zip, *.webm) are
// linked relatively to siblings in the session dir.
export function renderReport(
  manifest: SessionManifest,
  ctx: RenderContext
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Canary report — ${escapeHtml(manifest.name ?? manifest.id)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="page">
${renderHeader(manifest)}
${renderTabs()}
<main>
${renderSummary(manifest)}
${renderSteps(manifest)}
${renderScreenshots(manifest, ctx.screenshots)}
${renderExecution(manifest)}
${renderCommands(manifest)}
${renderVideos(manifest)}
${renderConsole(ctx.consoleEntries)}
${renderNetwork(ctx.parsedHar)}
${renderArtifacts(manifest)}
</main>
</div>
<script>${TAB_SCRIPT}</script>
</body>
</html>
`;
}
