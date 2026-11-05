"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Work waiting in the admin area (pending sign-ups, review queue), for the rail badges. The
 * admin layout loads the numbers on the server and publishes them here with
 * <PublishAdminCounts>; the rail lives outside that layout, so it can't receive them as props.
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

export function PublishAdminCounts({ counts }: { counts: AdminCounts }) {
  const { pendingUsers, pendingReview } = counts;
  useEffect(() => {
    current = { pendingUsers, pendingReview };
    listeners.forEach((fn) => fn());
  }, [pendingUsers, pendingReview]);
  return null;
}
