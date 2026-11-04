/**
 * A same-origin path to return to after sign-in, or "/" for anything else (absolute URLs,
 * protocol-relative `//host`, backslash tricks, control characters), so `?next=` can't become
 * an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}
