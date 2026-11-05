"use client";

import { useCallback, useSyncExternalStore } from "react";

import { RAIL_COOKIE } from "@/lib/rail";

const EVENT = "rail-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const getSnapshot = () => document.documentElement.dataset.rail === "collapsed";
const getServerSnapshot = () => false;

export function useRail() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    const next = !getSnapshot();
    const root = document.documentElement;
    if (next) root.dataset.rail = "collapsed";
    else delete root.dataset.rail;
    document.cookie = `${RAIL_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { collapsed, toggle };
}
