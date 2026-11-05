"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts as till receipts: surface slip, 1px rule, a 3px status bar on the left
 * (success = green, error = red, everything else = ink) and a mono uppercase type
 * label where sonner would put an icon. Sonner keeps stacking/swipe; we own the look.
 */

const label = "font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.08em]";

const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const t = useTranslations("Ui.toast");

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      className="toaster group"
      gap={10}
      icons={{
        success: <span className={label}>{t("success")}</span>,
        error: <span className={label}>{t("error")}</span>,
        info: <span className={label}>{t("info")}</span>,
        warning: <span className={label}>{t("warning")}</span>,
        loading: <span className={loadingLabel}>{t("loading")}</span>,
      }}
      {...props}
      toastOptions={{
        ...toastOptions,
        unstyled: true,
        classNames: {
          toast: [
            "group/toast bg-popover text-popover-foreground border-border w-(--width) flex items-start gap-3 rounded-[4px] border border-l-[3px] border-l-foreground py-3 pl-3.5 pr-4 text-sm",
            "shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]",
            "data-[type=success]:border-l-success data-[type=error]:border-l-destructive",
          ].join(" "),
          icon: "mt-0.5 flex shrink-0 items-center group-data-[type=success]/toast:text-success group-data-[type=error]/toast:text-destructive",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "font-semibold leading-snug",
          description: "text-muted-foreground text-[13px] leading-snug",
          actionButton:
            "bg-foreground text-background focus-visible:outline-ring ml-auto h-7 shrink-0 self-center rounded-[4px] px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2",
          cancelButton:
            "border-border hover:bg-accent focus-visible:outline-ring h-7 shrink-0 self-center rounded-[4px] border px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2",
          closeButton:
            "bg-popover border-border text-muted-foreground hover:text-foreground absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-[2px] border [&_svg]:size-3",
          ...toastOptions?.classNames,
        },
      }}
    />
  );
};

const loadingLabel = `${label} text-muted-foreground animate-pulse motion-reduce:animate-none`;

export { Toaster };
