import { cn } from "@/lib/utils";

/*
 * The Parts Tracker mark: a solid chip (die with three pins top and bottom) carrying a falling
 * price line that ends in a dot: "parts, watched for price drops". Built on a 32px grid so
 * it stays crisp as a 16px favicon. Ink follows `currentColor`; the line uses the signal colour.
 */
const PINS = "M10 2.5v3M16 2.5v3M22 2.5v3M10 26.5v3M16 26.5v3M22 26.5v3";
const TRACE = "M8.5 11h5l3.5 5h3.5l3 4.5";

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d={PINS} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="3.5" y="5.5" width="25" height="21" rx="4.5" fill="currentColor" />
      <path
        d={TRACE}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.5" cy="20.5" r="2.2" fill="var(--primary)" />
    </svg>
  );
}

/** Mark + wordmark ("parts" heavy, "tracker" light). `compact` hides the wordmark. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("text-foreground inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      {!compact && (
        <span className="text-[1.0625rem] leading-none tracking-[-0.03em]">
          <span className="sr-only">Parts Tracker</span>
          <span aria-hidden className="font-extrabold">
            parts
          </span>
          <span aria-hidden className="text-muted-foreground font-medium">
            tracker
          </span>
        </span>
      )}
    </span>
  );
}
