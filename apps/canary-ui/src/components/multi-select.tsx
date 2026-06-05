"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export interface MultiSelectOption {
  icon?: ReactNode;
  label: string;
  value: string;
}

// A single-select dropdown sharing the multi-select's look (used for sort): the
// trigger shows the current value; the popover lists options with a checkmark on
// the active one and closes on pick.
export function SingleSelect({
  ariaLabel,
  className,
  onChange,
  options,
  triggerIcon,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  onChange: (value: string) => void;
  options: MultiSelectOption[];
  triggerIcon?: ReactNode;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn(
            "h-8 gap-1.5 border-dashed font-medium data-[state=open]:border-solid",
            className
          )}
          size="sm"
          variant="outline"
        >
          {triggerIcon}
          <span className="flex-1 truncate text-left">
            {current?.label ?? "Select"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {options.map((o) => {
          const isSel = o.value === value;
          return (
            <button
              aria-pressed={isSel}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-well aria-pressed:bg-well/60"
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              type="button"
            >
              {o.icon ? (
                <span className="flex shrink-0 items-center">{o.icon}</span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {isSel ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// A faceted multi-select filter: a dashed trigger with a count, then a popover
// with a search box and a checkbox list (icons + selected highlight). Mirrors
// the reference "Type" filter — search at top, options below, clear at bottom.
export function MultiSelect({
  emptyText = "No matches.",
  label,
  onChange,
  options,
  searchPlaceholder,
  selected,
}: {
  emptyText?: string;
  label: string;
  onChange: (next: string[]) => void;
  options: MultiSelectOption[];
  searchPlaceholder?: string;
  selected: string[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  return (
    <Popover onOpenChange={() => setQuery("")}>
      <PopoverTrigger asChild>
        <Button
          className="h-8 gap-1.5 border-dashed font-medium data-[state=open]:border-solid"
          size="sm"
          variant="outline"
        >
          {label}
          {selected.length > 0 ? (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[11px] text-on-primary tabular-nums">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-0 p-0">
        <div className="relative border-border border-b">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
            value={query}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <div className="px-2 py-6 text-center text-[13px] text-faint italic">
              {emptyText}
            </div>
          ) : (
            shown.map((o) => {
              const isSel = selected.includes(o.value);
              return (
                <button
                  aria-pressed={isSel}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-well aria-pressed:bg-well/60"
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  type="button"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                      isSel
                        ? "border-primary bg-primary text-on-primary"
                        : "border-line-2"
                    )}
                  >
                    {isSel ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : null}
                  </span>
                  {o.icon ? (
                    <span className="flex shrink-0 items-center">{o.icon}</span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 ? (
          <div className="border-border border-t p-1">
            <button
              className="w-full rounded-md px-2 py-1.5 text-center text-[13px] text-muted-foreground transition-colors hover:bg-well"
              onClick={() => onChange([])}
              type="button"
            >
              Clear
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
