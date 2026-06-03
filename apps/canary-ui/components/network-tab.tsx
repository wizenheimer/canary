"use client";

import { X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { fmtBytes, fmtMs } from "@/lib/format";
import type {
  NetworkHeader,
  NetworkRequest,
  NetworkResourceType,
} from "@/lib/network";
import { toCurl } from "@/lib/network";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { Pager, usePaged } from "./pager";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

type CategoryId =
  | "all"
  | "fetch"
  | "doc"
  | "css"
  | "js"
  | "font"
  | "img"
  | "media"
  | "other";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  types: NetworkResourceType[];
}[] = [
  { id: "all", label: "All", types: [] },
  { id: "fetch", label: "Fetch/XHR", types: ["fetch", "xhr"] },
  { id: "doc", label: "Doc", types: ["document"] },
  { id: "css", label: "CSS", types: ["stylesheet"] },
  { id: "js", label: "JS", types: ["script"] },
  { id: "font", label: "Font", types: ["font"] },
  { id: "img", label: "Img", types: ["image"] },
  { id: "media", label: "Media", types: ["media"] },
  { id: "other", label: "Other", types: ["websocket", "other"] },
];

const DETAIL_TABS = [
  ["headers", "Headers"],
  ["payload", "Payload"],
  ["response", "Response"],
  ["timing", "Timing"],
] as const;

type DetailTab = (typeof DETAIL_TABS)[number][0];

function requestName(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).at(-1);
    return seg || u.hostname;
  } catch {
    return url;
  }
}

function requestHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "";
  }
}

function isFailed(status: number): boolean {
  return status === 0 || status >= 400;
}

function HeaderRows({ items }: { items: NetworkHeader[] }) {
  return (
    <dl className="divide-y divide-border/60">
      {items.map((h, i) => (
        <div
          className="grid grid-cols-[minmax(0,180px)_1fr] gap-3 py-1.5"
          key={`${h.name}-${i}`}
        >
          <dt className="truncate font-medium text-[12px] text-muted-foreground">
            {h.name}
          </dt>
          <dd className="break-all font-mono text-[12px]">{h.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="mb-5">
      <h4 className="mb-1.5 font-bold text-[11px] text-faint uppercase tracking-wide">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Detail({
  req,
  onClose,
}: {
  req: NetworkRequest;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("headers");
  const general: NetworkHeader[] = [
    { name: "Request URL", value: req.url },
    { name: "Request Method", value: req.method },
    {
      name: "Status Code",
      value: `${req.status || "(failed)"} ${req.statusText}`.trim(),
    },
    { name: "Remote Address", value: req.remoteAddress || "—" },
    {
      name: "Type",
      value: `${req.resourceType}${req.mimeType ? ` · ${req.mimeType}` : ""}`,
    },
  ];

  return (
    <div className="flex w-full flex-col border-border border-t lg:w-[480px] lg:max-w-[50%] lg:border-t-0 lg:border-l">
      <div className="flex items-center gap-2 border-border border-b px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate font-semibold text-sm">
          {requestName(req.url)}
        </span>
        <CopyButton label="URL" text={req.url} title="Copy URL" />
        <CopyButton label="cURL" text={toCurl(req)} title="Copy as cURL" />
        <Button
          aria-label="Close details"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <X />
        </Button>
      </div>

      <div className="flex gap-4 border-border border-b px-4">
        {DETAIL_TABS.map(([id, label]) => (
          <button
            className={cn(
              "-mb-px border-transparent border-b-2 py-2 font-medium text-[13px] text-muted-foreground",
              tab === id && "border-primary text-foreground"
            )}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-[60vh] overflow-auto px-4 py-3 lg:max-h-[640px]">
        {tab === "headers" && (
          <>
            <Section title="General">
              <HeaderRows items={general} />
            </Section>
            {req.responseHeaders.length > 0 && (
              <Section title="Response Headers">
                <HeaderRows items={req.responseHeaders} />
              </Section>
            )}
            {req.requestHeaders.length > 0 && (
              <Section title="Request Headers">
                <HeaderRows items={req.requestHeaders} />
              </Section>
            )}
          </>
        )}

        {tab === "payload" &&
          (req.queryString.length === 0 && !req.requestBody ? (
            <p className="text-[13px] text-faint italic">No payload.</p>
          ) : (
            <>
              {req.queryString.length > 0 && (
                <Section title="Query String Parameters">
                  <HeaderRows items={req.queryString} />
                </Section>
              )}
              {req.requestBody && (
                <Section title="Request Body">
                  <pre className="overflow-auto whitespace-pre-wrap rounded border border-border bg-well-2 p-3 font-mono text-[12px]">
                    {req.requestBody}
                  </pre>
                </Section>
              )}
            </>
          ))}

        {tab === "response" &&
          (req.responseBody ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] text-faint">
                  {req.mimeType}
                  {req.responseBodyTruncated ? " · truncated" : ""}
                </span>
                <CopyButton label="Copy" text={req.responseBody} />
              </div>
              <pre className="overflow-auto whitespace-pre-wrap rounded border border-border bg-well-2 p-3 font-mono text-[12px]">
                {req.responseBody}
              </pre>
            </>
          ) : (
            <p className="text-[13px] text-faint italic">
              No text response body captured
              {req.mimeType ? ` (${req.mimeType})` : ""}.
            </p>
          ))}

        {tab === "timing" && (
          <HeaderRows
            items={[
              { name: "Duration", value: fmtMs(req.durationMs) },
              { name: "Response size", value: fmtBytes(req.responseSize) },
              { name: "Started", value: req.startedDateTime || "—" },
            ]}
          />
        )}
      </div>
    </div>
  );
}

function RequestTable({
  compact,
  maxDuration,
  onSelect,
  selected,
  visible,
}: {
  compact: boolean;
  maxDuration: number;
  onSelect: (index: number) => void;
  selected: number | null;
  visible: NetworkRequest[];
}) {
  return (
    <div className="min-w-0 flex-1 overflow-x-auto">
      <Table className="[&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-[11px] [&_th]:text-faint [&_th]:uppercase [&_th]:tracking-wide">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-16">Status</TableHead>
            {compact ? null : (
              <>
                <TableHead className="w-20">Method</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead className="w-28">Time</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow
              className={cn(
                "cursor-pointer",
                isFailed(r.status) && "bg-fail-bg hover:bg-fail-bg"
              )}
              data-state={r.index === selected ? "selected" : undefined}
              key={r.index}
              onClick={() => onSelect(r.index)}
            >
              <TableCell className="max-w-0">
                <div className="flex flex-col">
                  <span className="truncate font-medium">
                    {requestName(r.url)}
                  </span>
                  <span className="truncate text-[11px] text-faint">
                    {requestHost(r.url)}
                  </span>
                </div>
              </TableCell>
              <TableCell
                className={cn(
                  "tabular-nums",
                  isFailed(r.status) && "font-semibold text-fail"
                )}
              >
                {r.status || "—"}
              </TableCell>
              {compact ? null : (
                <>
                  <TableCell className="text-muted-foreground">
                    {r.method}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.resourceType}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {r.responseSize ? fmtBytes(r.responseSize) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-right text-faint tabular-nums">
                        {fmtMs(r.durationMs)}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-well">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.max(2, (r.durationMs / maxDuration) * 100)}%`,
                          }}
                        />
                      </span>
                    </div>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {visible.length === 0 ? (
        <div className="p-8 text-center text-[13px] text-faint italic">
          No requests match the filter.
        </div>
      ) : null}
    </div>
  );
}

export function NetworkTab({
  failed,
  requests,
  total,
}: {
  failed: number;
  requests: NetworkRequest[];
  total: number;
}) {
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const visible = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.id === category);
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (cat && cat.id !== "all" && !cat.types.includes(r.resourceType)) {
        return false;
      }
      if (q && !r.url.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [requests, category, query]);

  const maxDuration = useMemo(
    () => Math.max(1, ...requests.map((r) => r.durationMs)),
    [requests]
  );

  const paged = usePaged(visible, 50);
  const sel =
    selected == null ? null : requests.find((r) => r.index === selected);
  const compact = sel != null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-border border-b px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              className={cn(
                "rounded-full px-2.5 py-1 font-medium text-[12px] text-muted-foreground hover:bg-well",
                category === c.id && "bg-primary/15 text-foreground"
              )}
              key={c.id}
              onClick={() => setCategory(c.id)}
              type="button"
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Input
            className="h-8 w-48"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter URLs"
            type="search"
            value={query}
          />
          <span className="whitespace-nowrap text-[12px] text-faint tabular-nums">
            {total} request{total === 1 ? "" : "s"} · {failed} failed
          </span>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="p-10 text-center text-faint italic">
          No network activity captured.
        </div>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row">
            <RequestTable
              compact={compact}
              maxDuration={maxDuration}
              onSelect={setSelected}
              selected={selected}
              visible={paged.slice}
            />
            {sel ? (
              <Detail onClose={() => setSelected(null)} req={sel} />
            ) : null}
          </div>
          <div className="border-border border-t px-4 py-2.5">
            <Pager paged={paged} />
          </div>
        </>
      )}
    </div>
  );
}
