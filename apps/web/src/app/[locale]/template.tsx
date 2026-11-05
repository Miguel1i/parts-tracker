/**
 * A template (unlike a layout) remounts on every navigation, so the page eases in each time:
 * a short fade and lift. Skipped for people who ask for reduced motion.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in motion-reduce:animate-none">{children}</div>;
}
