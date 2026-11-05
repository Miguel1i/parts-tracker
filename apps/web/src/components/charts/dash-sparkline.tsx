/**
 * A tiny trend line: no axes, a step path (prices hold between changes), a gap where there is no
 * price, and a dot on the latest value. Plain SVG so it works in server and client components.
 */
export function Sparkline({
  values,
  label,
  width = 96,
  height = 28,
  className,
}: {
  values: (number | null)[];
  /** Spoken summary, e.g. "Last 30 days: down 3%". */
  label: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const pad = 4;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (values.length - 1);
  const y = (v: number) =>
    hi === lo ? height / 2 : height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad);

  const segments: string[] = [];
  let current = "";
  let prevY = 0;
  values.forEach((v, i) => {
    if (v == null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    const py = y(v);
    current = current
      ? `${current}H${x(i).toFixed(1)}V${py.toFixed(1)}`
      : `M${x(i).toFixed(1)} ${py.toFixed(1)}`;
    prevY = py;
  });
  if (current) segments.push(current);
  const lastIdx = values.map((v) => v != null).lastIndexOf(true);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
    >
      {segments.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--chart-merchant-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      <circle
        cx={x(lastIdx)}
        cy={prevY}
        r={3}
        fill="var(--chart-merchant-1)"
        stroke="var(--card)"
        strokeWidth={2}
      />
    </svg>
  );
}

/** Percent change from the first to the last value, or null. */
export function sparkChangePct(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2 || nums[0] === 0) return null;
  return ((nums[nums.length - 1]! - nums[0]!) / nums[0]!) * 100;
}

/** The aria-label of a 30-day sparkline; `t` is `Charts.spark` (keys down, up, flat). */
export function sparkLabel(
  t: (key: "down" | "up" | "flat", values: { pct: number }) => string,
  values: (number | null)[],
): string {
  const change = sparkChangePct(values);
  const pct = change == null ? 0 : Math.round(Math.abs(change));
  return t(change == null || pct === 0 ? "flat" : change < 0 ? "down" : "up", { pct });
}
