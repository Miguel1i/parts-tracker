/*
 * Desktop rail state. The source of truth is `data-rail="collapsed"` on <html>, set before
 * first paint by RAIL_SCRIPT (inlined by the root layout) from the `rail` cookie, so the rail
 * never jumps on load. The layout can't read cookies itself (Cache Components); CSS keys off
 * the attribute and `useRail` mirrors it for aria/tooltip state.
 */
export const RAIL_COOKIE = "rail";
export const RAIL_SCRIPT = `try{if(/(?:^|;\s*)${RAIL_COOKIE}=collapsed(?:;|$)/.test(document.cookie))document.documentElement.dataset.rail="collapsed"}catch(e){}`;
