import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * "Nothing here yet", printed like a torn-off receipt: a dashed (perforated) 1px border, an
 * optional mono kicker, one sentence and an optional action. No icon circle — `icon` is kept
 * for API compatibility and shown small beside the kicker only when one is given.
 */
export function EmptyState({
  icon: Icon,
  title,
  kicker,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  /** Mono micro label above the title, e.g. "404" or "— No builds". */
  kicker?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-foreground/30 rounded-[6px] border border-dashed px-6 py-10 sm:px-10 sm:py-12",
        className,
      )}
    >
      {kicker && (
        <p className="text-muted-foreground mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
          {Icon && <Icon aria-hidden className="size-3.5" />}
          {kicker}
        </p>
      )}
      <h2 className="max-w-xl text-balance text-xl font-bold tracking-[-0.01em]">{title}</h2>
      {children && (
        <div className="text-muted-foreground mt-2 max-w-xl text-pretty text-[15px] leading-6">
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * Page title block: optional mono kicker ("03 — Builds"), a large tight title, a one-line
 * description, optional actions on the right, and a full-width rule underneath.
 */
export function PageHeader({
  title,
  description,
  kicker,
  actions,
}: {
  title: string;
  description?: string;
  kicker?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-border mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker && (
          <p className="text-primary mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
            {kicker}
          </p>
        )}
        <h1 className="break-words text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] md:text-[40px]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-2 max-w-2xl text-[15px] leading-6">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
