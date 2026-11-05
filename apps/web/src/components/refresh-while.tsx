"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** Re-renders the page's server data every `ms` while `active` (e.g. a scrape run is pending). */
export function RefreshWhile({ active, ms = 10_000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), ms);
    return () => clearInterval(timer);
  }, [active, ms, router]);
  return null;
}
