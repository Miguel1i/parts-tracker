import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="bg-muted text-muted-foreground mb-4 grid size-12 place-items-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && (
        <div className="text-muted-foreground mt-1 max-w-md text-balance text-sm">{children}</div>
      )}
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {description && <p className="text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}
