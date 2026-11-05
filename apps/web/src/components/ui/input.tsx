import * as React from "react";

import { cn } from "@/lib/utils";

/** Shared look for text fields: a ruled surface box with a signal outline on focus. */
const fieldBoxClass = cn(
  "w-full min-w-0 rounded-[4px] border border-input bg-card text-[0.9375rem] text-foreground md:text-sm",
  "placeholder:text-muted-foreground transition-[border-color] duration-150 motion-reduce:transition-none",
  "hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_25%)]",
  "focus-visible:border-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
);

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBoxClass,
        "h-[38px] px-3 py-1",
        "[&[type=number]]:font-mono [&[type=number]]:tabular-nums",
        "file:text-foreground file:mr-3 file:h-full file:border-0 file:bg-transparent file:font-mono file:text-[0.6875rem] file:font-medium file:uppercase file:tracking-[0.08em]",
        className,
      )}
      {...props}
    />
  );
}

export { Input, fieldBoxClass };
