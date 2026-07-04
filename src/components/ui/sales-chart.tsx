"use client";

// Dependency-free SVG monthly bar chart (≤6 bars). Fixed viewBox + width:100% → scales
// cleanly from 380px to desktop. Forest-green bars; the partial (MTD) month is sage +
// labelled; zero months render a faint stub so "0" reads honestly. Colors are CSS vars
// so it tracks the brand theme.

export interface ChartBar {
  label: string;
  units: number;
  partial?: boolean;
}

export function SalesChart({ data }: { data: ChartBar[] }) {
  const W = 340,
    H = 210,
    padL = 8,
    padR = 8,
    padTop = 22,
    padBottom = 36;
  const n = Math.max(data.length, 1);
  const chartH = H - padTop - padBottom;
  const baseY = H - padBottom;
  const max = Math.max(...data.map((d) => d.units), 1);
  const slot = (W - padL - padR) / n;
  const bw = Math.min(slot * 0.6, 52);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Monthly units sold"
      className="block h-auto"
    >
      <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="var(--border)" strokeWidth={1} />
      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const h = (d.units / max) * chartH;
        const drawn = d.units > 0;
        const y = drawn ? baseY - h : baseY - 2;
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={cx - bw / 2}
              y={y}
              width={bw}
              height={drawn ? h : 2}
              rx={2}
              fill={d.partial ? "var(--brand-sage)" : "var(--brand)"}
              opacity={drawn ? 1 : 0.3}
            />
            <text x={cx} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
              {d.units}
            </text>
            <text x={cx} y={baseY + 15} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
              {d.label}
            </text>
            {d.partial && (
              <text x={cx} y={baseY + 27} textAnchor="middle" fontSize={9} fontStyle="italic" fill="var(--muted-foreground)">
                MTD
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
