import { cn } from "@/lib/utils";

// The Canary wordmark: the lime "spark" dot + the name. Mirrors the brand mark
// the self-contained report and the old sidebar used.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 font-bold text-foreground text-lg tracking-tight",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full bg-primary ring-1 ring-lime-edge ring-inset"
      />
      Canary
    </span>
  );
}
