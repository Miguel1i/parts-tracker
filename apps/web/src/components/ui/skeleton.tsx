import * as React from "react";

import { cn } from "@/lib/utils";

/* Placeholder block: muted fill with faint diagonal hatching that drifts (static under reduced motion). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "bg-muted rounded-[4px] bg-[length:16px_16px]",
        "bg-[image:linear-gradient(135deg,var(--skeleton-stripe)_25%,transparent_25%,transparent_50%,var(--skeleton-stripe)_50%,var(--skeleton-stripe)_75%,transparent_75%,transparent)]",
        "[--skeleton-stripe:color-mix(in_oklab,var(--foreground)_5%,transparent)]",
        "animate-stripes motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
