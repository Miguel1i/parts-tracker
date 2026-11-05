"use client";

import * as React from "react";
import { Separator as SeparatorPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/* A plain hairline rule; `dashed` gives the receipt-style perforation. */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  dashed = false,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & { dashed?: boolean }) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "border-border shrink-0",
        "data-[orientation=horizontal]:w-full data-[orientation=vertical]:self-stretch",
        dashed
          ? "border-dashed data-[orientation=horizontal]:border-t data-[orientation=vertical]:border-l"
          : "bg-border data-[orientation=horizontal]:h-px data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
