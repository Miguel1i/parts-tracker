"use client";

import { Cpu } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-10",
  md: "size-14",
  lg: "size-28 sm:size-36",
} as const;

/**
 * A product's picture from the shop page it was matched on (hot-linked, no referrer), on a
 * white tile so cut-out product shots read the same in both themes. Falls back to a quiet
 * placeholder when there's no image or it fails to load. Decorative: the name sits beside it.
 */
export function ProductThumb({
  src,
  size = "sm",
  className,
}: {
  src: string | null | undefined;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-[4px] border",
        show ? "bg-white" : "bg-muted text-muted-foreground",
        sizes[size],
        className,
      )}
    >
      {show ? (
        // Remote shop images on many hosts: next/image would need every host allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-contain p-[8%]"
        />
      ) : (
        <Cpu className={size === "lg" ? "size-8" : "size-4"} strokeWidth={1.5} />
      )}
    </span>
  );
}
