import { cn } from "@/lib/utils";

/**
 * Shared look for everything that floats above the page (docs/design.md, "Shape & surface"):
 * surface + 1px rule + one crisp shadow, no blur. Motion is a 4px fade/translate that
 * switches off under prefers-reduced-motion.
 */

/** Panel surface for menus, popovers, dialogs. Radius 6 unless a caller overrides it. */
export const floatingSurface =
  "bg-popover text-popover-foreground border border-border shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]";

/** Ink scrim behind modal surfaces (black in dark mode, where ink is light). */
export const scrim =
  "fixed inset-0 z-50 bg-foreground/45 dark:bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150 motion-reduce:animate-none";

/** Enter/leave for anchored floating content: fade + 4px nudge away from the anchor. */
export const anchoredMotion =
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 duration-150 motion-reduce:animate-none";

/** Shared row styling for menu-like items (dropdown, select). */
export const menuItem =
  "relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-[2px] px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** Mono uppercase micro label (11px, tracked) used for menu group labels. */
export const microLabel =
  "font-mono text-[0.6875rem] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground";

/**
 * Modal panel. Centred on desktop; on phones it docks to the bottom edge as a sheet
 * (full width, square bottom, 6px top corners). Width is a plain `max-w-*` so callers
 * can widen it with `className="max-w-2xl"`.
 */
export const modalPanel = cn(
  floatingSurface,
  "fixed z-50 grid w-full max-w-lg gap-4 p-5 text-sm outline-none",
  // phone: bottom sheet
  "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[6px] border-b-0 max-sm:max-w-none",
  // tablet/desktop: centred card
  "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[6px] sm:border-b",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-1 duration-150 motion-reduce:animate-none",
);

/** Header band: bleeds to the panel edges and sits on a hairline rule. */
export const modalHeader =
  "-mx-5 -mt-5 flex flex-col gap-1.5 border-b border-border px-5 pb-4 pt-5";

/** Footer band: hairline rule above, actions right-aligned (stacked full-width on phones). */
export const modalFooter =
  "-mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end";
