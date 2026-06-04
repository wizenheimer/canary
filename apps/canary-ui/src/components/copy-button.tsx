"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

// Copy-to-clipboard button with a brief "Copied" confirmation. Used for request
// URLs, cURL commands, and response bodies. Clipboard needs a secure context;
// localhost qualifies.
export function CopyButton({
  className,
  label,
  text,
  title,
}: {
  className?: string;
  label?: string;
  text: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <Button
      className={cn("gap-1.5", className)}
      onClick={copy}
      size="sm"
      title={title ?? label ?? "Copy"}
      type="button"
      variant="outline"
    >
      {copied ? <Check className="text-pass" /> : <Copy />}
      {label ? <span>{copied ? "Copied" : label}</span> : null}
    </Button>
  );
}
