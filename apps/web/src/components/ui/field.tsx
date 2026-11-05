"use client";

import { useMemo } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/* Form layout pieces: label over control, help text under it, errors in the rise colour. */

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "text-foreground mb-2",
        "data-[variant=legend]:text-base data-[variant=legend]:font-bold data-[variant=legend]:tracking-[-0.01em]",
        "data-[variant=label]:text-[13px] data-[variant=label]:font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 *:data-[slot=field-group]:gap-4",
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva("group/field flex w-full gap-1.5 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal: [
        "flex-row items-center gap-3 *:data-[slot=field-label]:flex-auto",
        "has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=switch]]:mt-0.5",
      ],
      responsive: [
        "flex-col *:w-full [&>.sr-only]:w-auto",
        "@md/field-group:flex-row @md/field-group:items-center @md/field-group:gap-3 @md/field-group:*:w-auto",
        "@md/field-group:*:data-[slot=field-label]:flex-auto @md/field-group:has-[>[data-slot=field-content]]:items-start",
      ],
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex flex-1 flex-col gap-1 leading-snug", className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
        // A label wrapping a whole field becomes a selectable ruled option.
        "has-[>[data-slot=field]]:border-input has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-[4px] has-[>[data-slot=field]]:border",
        "has-[>[data-slot=field]]:hover:bg-accent *:data-[slot=field]:p-3",
        "has-[>[data-slot=field]]:has-[:focus-visible]:outline-ring has-[>[data-slot=field]]:has-[:focus-visible]:outline-2 has-[>[data-slot=field]]:has-[:focus-visible]:outline-offset-2",
        "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-[13px] font-semibold group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-muted-foreground text-left text-[13px] font-normal leading-normal",
        "group-data-[orientation=horizontal]/field:text-balance [[data-variant=legend]+&]:-mt-1",
        "[&>a]:decoration-primary/60 [&>a:hover]:text-foreground [&>a]:underline [&>a]:underline-offset-4",
        className,
      )}
      {...props}
    />
  );
}

/** A hairline with an optional mono micro-label sitting on it ("— OR —"). */
function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn("relative -my-1 flex h-5 items-center gap-3", className)}
      {...props}
    >
      <span aria-hidden className="bg-border h-px flex-1" />
      {children && (
        <>
          <span
            data-slot="field-separator-content"
            className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            {children}
          </span>
          <span aria-hidden className="bg-border h-px flex-1" />
        </>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (children) return children;
    const messages = [...new Set((errors ?? []).map((e) => e?.message).filter(Boolean))];
    if (messages.length === 0) return null;
    if (messages.length === 1) return messages[0];
    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    );
  }, [children, errors]);

  if (!content) return null;

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-destructive text-[13px] font-medium", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
