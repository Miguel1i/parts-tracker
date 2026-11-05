import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/*
 * Buttons are printed, not glowing: a flat ink block (or a ruled outline) with square-ish
 * corners and a semibold label. Hover shifts the tone instead of fading the button out.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[4px] border border-transparent text-sm font-semibold leading-none tracking-[-0.005em]",
    "transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background hover:bg-[color-mix(in_oklab,var(--foreground)_82%,var(--primary))] aria-expanded:bg-[color-mix(in_oklab,var(--foreground)_82%,var(--primary))]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary)_90%,var(--foreground))] aria-expanded:bg-[color-mix(in_oklab,var(--secondary)_90%,var(--foreground))]",
        outline:
          "border-input bg-card text-foreground hover:border-foreground/50 hover:bg-accent aria-expanded:border-foreground/50 aria-expanded:bg-accent",
        ghost: "text-foreground hover:bg-accent aria-expanded:bg-accent",
        destructive:
          "border-destructive/60 bg-transparent text-destructive hover:border-destructive hover:bg-destructive hover:text-background",
        link: "h-auto! border-0 px-0! text-foreground underline decoration-primary/60 decoration-[1.5px] underline-offset-[5px] hover:decoration-primary",
      },
      size: {
        default: "h-9 px-4",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] gap-1.5 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[30px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Link) with button styling instead of a <button>. */
    asChild?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
