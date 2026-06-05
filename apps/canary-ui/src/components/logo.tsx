import { cn } from "@/lib/utils";

// The Canary logomark — a black rounded tile holding the pastel spark, the same
// mark as public/icon.svg / the favicon. The spark is a periwinkle→sky→mint
// gradient (the brand pastel set). Used on its own (e.g. the collapsed sidebar)
// and inside the full wordmark lockup below. The spark is sized relative to the
// tile so it scales with any `size-*` override.
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex aspect-square size-5 shrink-0 items-center justify-center rounded-[5px] bg-ink-strong",
        className
      )}
    >
      <span className="size-1/2 rounded-full bg-[linear-gradient(135deg,#9fa1ff,#aee2ff,#d9f9df)]" />
    </span>
  );
}

// The full brand lockup: logomark + wordmark. Shared by the top bar and the
// expanded sidebar so the brand reads the same everywhere.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 font-bold text-foreground text-lg tracking-tight",
        className
      )}
    >
      <LogoMark />
      Canary
    </span>
  );
}
