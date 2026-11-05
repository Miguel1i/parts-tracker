"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/* A squared toggle: a ruled slot with a square slider that turns signal when on. */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch peer relative inline-flex shrink-0 items-center rounded-[3px] border p-[2px]",
        "border-input bg-muted transition-colors duration-150 motion-reduce:transition-none",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        // Larger hit area than the drawn control.
        "after:absolute after:-inset-x-2 after:-inset-y-2",
        "h-5 w-9 data-[size=sm]:h-4 data-[size=sm]:w-7",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-muted-foreground pointer-events-none block rounded-[2px] transition-transform duration-150 motion-reduce:transition-none",
          "data-[state=checked]:bg-primary-foreground",
          "size-3.5 data-[state=checked]:translate-x-4",
          "group-data-[size=sm]/switch:size-2.5 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
