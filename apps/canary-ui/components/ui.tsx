"use client";

import { type ReactNode, useEffect } from "react";

// Status pill SVG, ported from the report's statusIcon().
export function StatusIcon({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <svg
        aria-hidden="true"
        className="ico"
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
        className="ico"
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
      className="ico"
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

export function StatusBadge({
  small,
  status,
}: {
  small?: boolean;
  status: string;
}) {
  if (small) {
    return <span className={`badge sm ${status}`}>{status}</span>;
  }
  return (
    <span className={`badge ${status}`}>
      <StatusIcon status={status} />
      {status.toUpperCase()}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="notice">{label ?? "Loading…"}</div>;
}

export function Notice({
  children,
  error,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return <div className={error ? "notice err" : "notice"}>{children}</div>;
}

// Centered modal. Closes on Escape (window listener) or via its own buttons —
// no click handlers on non-interactive elements (keeps a11y lint clean).
export function Modal({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay-back">
      <div aria-modal="true" className="dialog" role="dialog">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
