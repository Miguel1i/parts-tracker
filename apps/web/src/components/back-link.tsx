import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** "‹ Back to …" above a detail page's header. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      // Typed routes: callers pass a known path.
      href={href as "/"}
      className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
