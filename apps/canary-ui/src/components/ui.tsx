"use client";

import { CircleAlert, Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  EmptyStateIllustration,
  type EmptyStateIllustrationVariant,
} from "./empty-state-illustration";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";

// Status pill SVG, ported from the report's statusIcon().
export function StatusIcon({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <svg
        aria-hidden="true"
        className="block shrink-0"
        height="15"
        viewBox="0 0 16 16"
        width="15"
      >
        <circle cx="8" cy="8" fill="currentColor" r="8" />
        <path
          d="M4.5 8.3l2.4 2.3 4.6-4.9"
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg
        aria-hidden="true"
        className="block shrink-0"
        height="15"
        viewBox="0 0 16 16"
        width="15"
      >
        <circle cx="8" cy="8" fill="currentColor" r="8" />
        <path
          d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="block shrink-0"
      height="15"
      viewBox="0 0 16 16"
      width="15"
    >
      <circle cx="8" cy="8" fill="currentColor" r="8" />
      <path
        d="M5 8h6"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

// Brand status colors, applied on top of the shadcn Badge base.
const STATUS_CLASS: Record<string, string> = {
  aborted: "border-[#ecdcae] bg-warn-bg text-warn",
  fail: "border-[#f3c4c0] bg-fail-bg text-on-fail",
  failed: "border-[#f3c4c0] bg-fail-bg text-on-fail",
  pass: "border-primary-edge bg-primary text-on-primary",
  passed: "border-primary-edge bg-primary text-on-primary",
};

export function StatusBadge({
  small,
  status,
}: {
  small?: boolean;
  status: string;
}) {
  const color = STATUS_CLASS[status] ?? "";
  if (small) {
    return (
      <Badge className={cn("rounded-full capitalize", color)}>{status}</Badge>
    );
  }
  return (
    <Badge
      className={cn(
        "h-auto gap-2 rounded-full px-4 py-2 font-bold text-[13px] tracking-wide",
        color
      )}
    >
      <StatusIcon status={status} />
      {status.toUpperCase()}
    </Badge>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-faint">
      <Loader2 className="size-4 animate-spin" />
      {label ?? "Loading…"}
    </div>
  );
}

export function Notice({
  children,
  error,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  if (error) {
    return (
      <Alert className="my-2" variant="destructive">
        <CircleAlert />
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    );
  }
  return <div className="p-10 text-center text-faint italic">{children}</div>;
}

// A designed empty state: an on-brand illustration (or a tonal icon medallion)
// over a title + a short one-line description, with an optional action. Reused
// for empty lists, filtered-to-nothing, the empty trash, and the per-section
// panels inside a session (size="panel").
export function EmptyState({
  action,
  description,
  icon: Icon,
  illustration,
  size = "large",
  title,
}: {
  action?: ReactNode;
  description?: string;
  icon?: LucideIcon;
  illustration?: EmptyStateIllustrationVariant;
  size?: "large" | "panel";
  title: string;
}) {
  const panel = size === "panel";
  let visual: ReactNode = null;
  if (illustration) {
    visual = (
      <div className={panel ? "mb-4" : "mb-6"}>
        <EmptyStateIllustration size={size} variant={illustration} />
      </div>
    );
  } else if (Icon) {
    visual = (
      <div className="relative mb-4 flex size-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/10" />
        <span className="flex size-12 items-center justify-center rounded-full border border-line-2 bg-card text-faint">
          <Icon className="size-6" strokeWidth={1.5} />
        </span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        panel ? "px-4 py-10" : "px-6 py-20"
      )}
    >
      {visual}
      <h3 className="font-semibold text-foreground text-sm tracking-tight">
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-xs text-[13px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
