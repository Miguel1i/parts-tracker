import * as React from "react";

import { fieldBoxClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldBoxClass,
        "field-sizing-content flex min-h-20 px-3 py-2 leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
