import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * A card is a ruled panel: surface fill, one hairline, 6px corners, no shadow.
 * Horizontal/vertical padding live in CSS vars so header, content and footer line up.
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card border-border bg-card py-(--card-py) text-card-foreground flex flex-col gap-4 rounded-[6px] border text-sm",
        "[--card-px:--spacing(5)] [--card-py:--spacing(5)] sm:[--card-px:--spacing(6)]",
        "data-[size=sm]:gap-3 data-[size=sm]:[--card-px:--spacing(4)] data-[size=sm]:[--card-py:--spacing(4)]",
        "has-data-[slot=card-footer]:pb-0",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header px-(--card-px) grid auto-rows-min items-start gap-1",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-(--card-py)",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-snug tracking-[-0.01em] group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm leading-relaxed", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-(--card-px)", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "border-border px-(--card-px) flex items-center gap-2 rounded-b-[5px] border-t border-dashed py-3.5",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
