"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { anchoredMotion, floatingSurface, menuItem, microLabel } from "@/components/ui/overlay";

/**
 * Trigger matches text inputs (38px, radius 4, 1px rule, surface fill); the list opens
 * below it like a dropdown menu, at least as wide as the trigger. The chosen row is
 * marked with a small signal-coloured square.
 */

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn(className)} {...props} />;
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input bg-card text-foreground flex w-fit select-none items-center justify-between gap-2 whitespace-nowrap rounded-[4px] border px-3 text-left text-sm",
        "data-[size=default]:h-[38px] data-[size=sm]:h-[30px] data-[size=sm]:px-2.5",
        "hover:border-foreground/40 focus-visible:outline-ring transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none",
        "aria-invalid:border-destructive data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="text-muted-foreground -mr-0.5" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const popper = position === "popper";
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        align={align}
        sideOffset={popper ? sideOffset : undefined}
        className={cn(
          floatingSurface,
          "relative z-50 min-w-36 overflow-hidden rounded-[6px]",
          popper
            ? cn(
                anchoredMotion,
                "max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin)",
              )
            : "max-h-[min(24rem,var(--radix-select-content-available-height))]",
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport data-position={position} className="p-1">
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(microLabel, "px-2 pb-1.5 pt-2.5", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(menuItem, "w-full pr-8", className)}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 flex size-2 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator className="bg-primary block size-2 rounded-[1px]" />
      </span>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

const scrollButton =
  "bg-popover text-muted-foreground flex cursor-default items-center justify-center py-1 [&_svg]:size-4";

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(scrollButton, className)}
      {...props}
    >
      <ChevronUpIcon aria-hidden />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(scrollButton, className)}
      {...props}
    >
      <ChevronDownIcon aria-hidden />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
