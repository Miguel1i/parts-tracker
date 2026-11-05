"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Tables read like a datasheet: no outer box, mono micro-caps column labels over an ink rule,
 * hairlines between rows. Numeric cells are mono + tabular: pass `numeric`, or any cell already
 * marked `text-right` / `tabular-nums` picks it up automatically.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b-foreground [&_tr]:hover:bg-transparent", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-b-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-foreground border-t font-semibold [&>tr]:last:border-b-0 [&>tr]:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-border border-b transition-colors duration-100 motion-reduce:transition-none",
        "hover:bg-accent/60 has-aria-expanded:bg-accent/60 data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

const numericClass = "text-right font-mono tabular-nums";

function TableHead({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 whitespace-nowrap px-3 text-left align-middle",
        "text-muted-foreground font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em]",
        "[&:has([role=checkbox])]:pr-0",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "whitespace-nowrap px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0",
        "[&.tabular-nums]:font-mono [&.text-right]:font-mono [&.text-right]:tabular-nums",
        numeric && numericClass,
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        "text-muted-foreground mt-3 text-left font-mono text-[0.6875rem] uppercase tracking-[0.08em]",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
