"use client";

// Dependency-free SVG monthly LINE chart (≤6 points). Fixed viewBox + width:100% →
// scales cleanly from 380px to desktop. Forest-green line + labelled dots; the current
// partial (MTD) point is a hollow dot reached by a dashed segment so it can't be misread
// as a full month. Colors are CSS vars so it tracks the brand theme.

export interface ChartPoint {
  label: string;
  units: number;
  partial?: boolean;
}

export function SalesChart({ data }: { data: ChartPoint[] }) {
  const W = 340,
    H = 210,
    padL = 10,
    padR = 10,
    padTop = 24,
    padBottom = 36;
  const n = Math.max(data.length, 1);
  const chartH = H - padTop - padBottom;
  const baseY = H - padBottom;
  const max = Math.max(...data.map((d) => d.units), 1);
  const slot = (W - padL - padR) / n;

  const pts = data.map((d, i) => ({
    ...d,
    x: padL + slot * i + slot / 2,
    y: baseY - (d.units / max) * chartH,
  }));

  const lastPartial = Boolean(pts[pts.length - 1]?.partial) && pts.length >= 2;
  const solidPts = lastPartial ? pts.slice(0, -1) : pts;
  const solidPath = solidPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Monthly units sold" className="block h-auto">
      <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="var(--border)" strokeWidth={1} />

      {/* solid line through the complete months */}
      {solidPts.length >= 2 && (
        <path d={solidPath} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* dashed segment into the partial (MTD) point */}
      {lastPartial && (
        <line
          x1={pts[pts.length - 2].x}
          y1={pts[pts.length - 2].y}
          x2={pts[pts.length - 1].x}
          y2={pts[pts.length - 1].y}
          stroke="var(--brand)"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
      )}

      {pts.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          {/* hollow dot for MTD, filled forest-green otherwise */}
          <circle
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill={p.partial ? "var(--card)" : "var(--brand)"}
            stroke="var(--brand)"
            strokeWidth={p.partial ? 2 : 1}
          />
          <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
            {p.units}
          </text>
          <text x={p.x} y={baseY + 15} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
            {p.label}
          </text>
          {p.partial && (
            <text x={p.x} y={baseY + 27} textAnchor="middle" fontSize={9} fontStyle="italic" fill="var(--muted-foreground)">
              MTD
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
