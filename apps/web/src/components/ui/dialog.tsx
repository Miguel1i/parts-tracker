"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { modalFooter, modalHeader, modalPanel, scrim } from "@/components/ui/overlay";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(scrim, className)}
      {...props}
    />
  );
}

/** Square 28px close control in the panel's top-right corner. */
function CornerClose({ className }: { className?: string }) {
  const t = useTranslations("Ui");
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-ring absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-[4px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none [&_svg]:size-4",
        className,
      )}
    >
      <XIcon aria-hidden />
      <span className="sr-only">{t("close")}</span>
    </DialogPrimitive.Close>
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          modalPanel,
          showCloseButton && "[&_[data-slot=dialog-header]]:pr-12",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && <CornerClose />}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn(modalHeader, className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const t = useTranslations("Ui");
  return (
    <div data-slot="dialog-footer" className={cn(modalFooter, className)} {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close className="border-border bg-card hover:bg-accent focus-visible:outline-ring inline-flex h-9 items-center justify-center rounded-[4px] border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none">
          {t("close")}
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-xl font-bold leading-tight tracking-[-0.02em]", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground [&_a]:hover:text-foreground text-sm leading-snug [&_a]:underline [&_a]:underline-offset-2",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
