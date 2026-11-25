import React from 'react';

interface DonutProgressProps {
  pct: number;
  size?: number;
}

export const DonutProgress: React.FC<DonutProgressProps> = ({ pct = 0, size = 26 }) => {
  const half = size / 2;
  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  const numericPct = Math.min(100, Math.max(0, +pct || 0));
  const off = circ * (1 - numericPct / 100);
  const col = numericPct >= 99.5 ? '#10b981' : numericPct > 0 ? '#f59e0b' : '#cbd5e1';
  const rot = `rotate(-90 ${half} ${half})`;

  return (
    <svg width={size} height={size} className="inline-block align-middle">
      <circle cx={half} cy={half} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke={col}
        strokeWidth="3.5"
        strokeDasharray={circ}
        strokeDashoffset={off}
        transform={rot}
        strokeLinecap="round"
      />
      {size >= 40 && (
        <text x={half} y={half + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#334155">
          {Math.round(numericPct)}%
        </text>
      )}
    </svg>
  );
};
