import { cn } from "@/lib/utils";

/**
 * The Parts Tracker mark: a shop price tag (cut top-left corner) whose punched hole is a square
 * IC pad with two pins, carrying a stepped price trace that steps down — a tag, a chip and a
 * price drop in one glyph. Ink follows `currentColor`; the trace uses the signal colour.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* tag body */}
      <path d="M11 3h17a1 1 0 0 1 1 1v24a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11Z" fill="currentColor" />
      {/* chip pad hole with pins */}
      <rect x="8" y="8" width="5" height="5" rx="0.6" fill="var(--background)" />
      <path
        d="M9.5 8V6.4M11.5 8V6.4M8 9.5H6.4M8 11.5H6.4"
        stroke="var(--background)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* price trace: steps down */}
      <path
        d="M8 18.5h6v3.5h5v3h5.5"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx="24.5" cy="25" r="1.6" fill="var(--primary)" />
    </svg>
  );
}

/** Mark + wordmark. `compact` hides the wordmark (collapsed rail). */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("text-foreground inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      {!compact && (
        <span className="leading-none">
          <span className="block text-[15px] font-extrabold tracking-[-0.02em]">Parts Tracker</span>
          <span className="text-muted-foreground mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em]">
            price watch
          </span>
        </span>
      )}
    </span>
  );
}
