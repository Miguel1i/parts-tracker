"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/* Underline tabs: labels sit on a hairline; the active one gets a 2px signal bar. */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn("flex gap-4 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  [
    "group/tabs-list flex w-fit max-w-full text-muted-foreground",
    "data-[orientation=horizontal]:items-end data-[orientation=horizontal]:gap-x-6",
    "data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
  ],
  {
    variants: {
      variant: {
        /** Ruled: the hairline spans the list. */
        default:
          "data-[orientation=horizontal]:border-b data-[orientation=vertical]:border-l border-border",
        /** Bare: only the active bar shows. */
        line: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold",
        "border-transparent transition-colors duration-150 motion-reduce:transition-none",
        "hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:pointer-events-none disabled:opacity-45",
        "data-[orientation=horizontal]:-mb-px data-[orientation=horizontal]:h-10 data-[orientation=horizontal]:border-b-2",
        "data-[orientation=vertical]:-ml-px data-[orientation=vertical]:h-9 data-[orientation=vertical]:border-l-2 data-[orientation=vertical]:pl-3",
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "focus-visible:outline-ring flex-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-4",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
