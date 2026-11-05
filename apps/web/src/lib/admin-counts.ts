"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Work waiting in the admin area (pending sign-ups, review queue), for the rail badges. The
 * admin layout loads the numbers on the server and publishes them here with
 * <PublishAdminCounts> (elsewhere the rail fetches them once); the rail lives outside that
 * layout, so it can't receive them as props.
 */
export type AdminCounts = { pendingUsers: number; pendingReview: number };

let current: AdminCounts | null = null;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAdminCounts() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

function publish(counts: AdminCounts) {
  current = counts;
  listeners.forEach((fn) => fn());
}

/** Fresh counts from the admin layout (on every /admin render). */
export function PublishAdminCounts({ counts }: { counts: AdminCounts }) {
  const { pendingUsers, pendingReview } = counts;
  useEffect(() => publish({ pendingUsers, pendingReview }), [pendingUsers, pendingReview]);
  return null;
}

/** Outside /admin: load the counts once per page load for an admin's rail. */
export function useLoadAdminCounts(enabled: boolean) {
  useEffect(() => {
    if (!enabled || current) return;
    const ctrl = new AbortController();
    fetch("/api/admin/counts", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AdminCounts>) : null))
      .then((c) => {
        if (c && !current) publish(c);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [enabled]);
}
