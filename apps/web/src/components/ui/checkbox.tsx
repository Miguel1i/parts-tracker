"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative flex size-4 shrink-0 items-center justify-center rounded-[2px] border",
        "bg-card text-primary-foreground border-[color-mix(in_oklab,var(--input),var(--foreground)_30%)]",
        "transition-colors duration-100 motion-reduce:transition-none",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        "after:absolute after:-inset-2",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center"
      >
        <CheckIcon
          strokeWidth={3.25}
          className="size-3 group-data-[state=indeterminate]/checkbox:hidden"
        />
        <MinusIcon
          strokeWidth={3.25}
          className="hidden size-3 group-data-[state=indeterminate]/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
