"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
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
  pass: "border-lime-edge bg-primary text-on-primary",
  passed: "border-lime-edge bg-primary text-on-primary",
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
