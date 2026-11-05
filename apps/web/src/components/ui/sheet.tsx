"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { scrim } from "@/components/ui/overlay";

/** Edge-docked drawer (Radix Dialog). Square on the docked edges, ruled on the open edge. */

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay data-slot="sheet-overlay" className={cn(scrim, className)} {...props} />
  );
}

const sideClasses = {
  right:
    "inset-y-0 right-0 h-full w-[85%] max-w-sm border-l data-[state=open]:slide-in-from-right-2 data-[state=closed]:slide-out-to-right-2",
  left: "inset-y-0 left-0 h-full w-[85%] max-w-sm border-r data-[state=open]:slide-in-from-left-2 data-[state=closed]:slide-out-to-left-2",
  top: "inset-x-0 top-0 max-h-[85dvh] border-b data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[6px] border-t data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2",
} as const;

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  const t = useTranslations("Ui");
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "bg-popover text-popover-foreground border-border fixed z-50 flex flex-col overflow-y-auto text-sm shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)] outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150 motion-reduce:animate-none",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-ring absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-[4px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none [&_svg]:size-4"
          >
            <XIcon aria-hidden />
            <span className="sr-only">{t("close")}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("border-border flex flex-col gap-1 border-b px-5 pb-4 pr-12 pt-5", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("border-border mt-auto flex flex-col gap-2 border-t px-5 py-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "text-foreground text-xl font-bold leading-tight tracking-[-0.02em]",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm leading-snug", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
