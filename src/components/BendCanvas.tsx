import React, { useMemo } from 'react';

// ─── 8 Directions ───────────────────────────────────────────────────────────
export type RiskDirection =
    | 'right' | 'downRight' | 'down' | 'downLeft'
    | 'left' | 'upLeft' | 'up' | 'upRight';

export interface Risk {
    direction: RiskDirection;
    sizeCm: number;
}

// Angle change relative to current heading (degrees)
const DIRECTION_ANGLES: Record<RiskDirection, number> = {
    right: 0,
    downRight: 45,
    down: 90,
    downLeft: 135,
    left: 180,
    upLeft: 225,   // -135
    up: 270,   // -90
    upRight: 315,   // -45
};

export const DIRECTION_LABELS: Record<RiskDirection, string> = {
    right: '→ Direita',
    downRight: '↘ Baixo-Dir',
    down: '↓ Baixo',
    downLeft: '↙ Baixo-Esq',
    left: '← Esquerda',
    upLeft: '↖ Cima-Esq',
    up: '↑ Cima',
    upRight: '↗ Cima-Dir',
};

export const DIRECTION_ICONS: Record<RiskDirection, string> = {
    right: '→',
    downRight: '↘',
    down: '↓',
    downLeft: '↙',
    left: '←',
    upLeft: '↖',
    up: '↑',
    upRight: '↗',
};

// Opposite direction map (for anti-reversal check)
export const OPPOSITE_DIRECTION: Record<RiskDirection, RiskDirection> = {
    right: 'left',
    left: 'right',
    up: 'down',
    down: 'up',
    upRight: 'downLeft',
    downLeft: 'upRight',
    upLeft: 'downRight',
    downRight: 'upLeft',
};

interface Point { x: number; y: number; }

// Compute path in "gutter units" (1 unit = 1 cm)
function computePath(risks: Risk[]): Point[] {
    const points: Point[] = [{ x: 0, y: 0 }];
    let currentAngle = 0; // 0 = rightward

    for (const risk of risks) {
        const prev = points[points.length - 1];
        // Use absolute angle from direction
        const targetAngle = DIRECTION_ANGLES[risk.direction];
        currentAngle = targetAngle;
        const radians = (currentAngle * Math.PI) / 180;
        points.push({
            x: prev.x + Math.cos(radians) * risk.sizeCm,
            y: prev.y + Math.sin(radians) * risk.sizeCm,
        });
    }
    return points;
}

interface BendCanvasProps {
    risks: Risk[];
    maxWidthCm?: number;
    svgRef?: React.RefObject<SVGSVGElement>;
}

export default function BendCanvas({ risks, maxWidthCm = 120, svgRef }: BendCanvasProps) {
    const points = useMemo(() => computePath(risks), [risks]);
    const totalWidthCm = risks.reduce((sum, r) => sum + r.sizeCm, 0);
    const isOverLimit = totalWidthCm > maxWidthCm;

    // ── Dynamic scaling ──────────────────────────────────────────────────────
    const CANVAS_W = 460;
    const CANVAS_H = 220;
    const PADDING = 36;

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const rawMinX = Math.min(...xs);
    const rawMaxX = Math.max(...xs);
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);

    // Ensure a minimum extent so a single tiny segment is still visible
    const rawW = Math.max(rawMaxX - rawMinX, 5);
    const rawH = Math.max(rawMaxY - rawMinY, 5);

    // Scale to fill the canvas
    const scaleX = (CANVAS_W - PADDING * 2) / rawW;
    const scaleY = (CANVAS_H - PADDING * 2) / rawH;
    const scale = Math.min(scaleX, scaleY, 12); // cap to avoid absurd zoom for single points

    const toSvg = (p: Point) => ({
        x: PADDING + (p.x - rawMinX) * scale,
        y: PADDING + (p.y - rawMinY) * scale,
    });

    const scaled = points.map(toSvg);

    const pathStr = scaled.length > 1
        ? scaled.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        : '';

    const strokeColor = isOverLimit ? '#ef4444' : '#63b3ed';
    const glowFilter = isOverLimit ? 'drop-shadow(0 0 6px #ef4444)' : 'drop-shadow(0 0 8px #63b3ed88)';

    return (
        <div className="relative w-full">
            <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-300 bg-gradient-to-br from-slate-900 to-slate-800 ${isOverLimit ? 'border-red-500' : 'border-slate-700'}`}>
                <svg
                    ref={svgRef}
                    width="100%"
                    viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                    className="w-full"
                    style={{ minHeight: 160, maxHeight: 240 }}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* Subtle grid */}
                    {Array.from({ length: 24 }).map((_, i) => (
                        <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={CANVAS_H}
                            stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
                    ))}
                    {Array.from({ length: 12 }).map((_, i) => (
                        <line key={`h${i}`} x1={0} y1={i * 20} x2={CANVAS_W} y2={i * 20}
                            stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
                    ))}

                    {/* Sheet shadow */}
                    {pathStr && (
                        <path d={pathStr} fill="none"
                            stroke={isOverLimit ? 'rgba(239,68,68,0.18)' : 'rgba(99,179,237,0.18)'}
                            strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                    )}

                    {/* Main path */}
                    {pathStr && (
                        <path d={pathStr} fill="none"
                            stroke={strokeColor} strokeWidth={3}
                            strokeLinecap="round" strokeLinejoin="round"
                            style={{ filter: glowFilter }} />
                    )}

                    {/* Points + dimension labels */}
                    {scaled.map((pt, i) => (
                        <g key={i}>
                            <circle cx={pt.x} cy={pt.y} r={i === 0 ? 7 : 5}
                                fill={i === 0 ? '#48bb78' : strokeColor}
                                stroke="white" strokeWidth="2" />
                            {/* Mid-segment label */}
                            {i > 0 && risks[i - 1] && (() => {
                                const prev = scaled[i - 1];
                                const mx = (prev.x + pt.x) / 2;
                                const my = (prev.y + pt.y) / 2;
                                // Offset perpendicular to segment for readability
                                const dx = pt.x - prev.x;
                                const dy = pt.y - prev.y;
                                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                                const nx = -dy / len * 14;
                                const ny = dx / len * 14;
                                return (
                                    <text x={mx + nx} y={my + ny} textAnchor="middle"
                                        fill="rgba(255,255,255,0.85)" fontSize="10" fontWeight="bold"
                                        style={{ paintOrder: 'stroke', stroke: '#1e293b', strokeWidth: 3 }}>
                                        {risks[i - 1].sizeCm}cm
                                    </text>
                                );
                            })()}
                        </g>
                    ))}

                    {/* Start label */}
                    {scaled.length > 0 && (
                        <text x={scaled[0].x} y={scaled[0].y - 14} textAnchor="middle"
                            fill="#48bb78" fontSize="9" fontWeight="bold">INÍCIO</text>
                    )}

                    {/* Empty state */}
                    {risks.length === 0 && (
                        <text x={CANVAS_W / 2} y={CANVAS_H / 2} textAnchor="middle"
                            fill="rgba(255,255,255,0.2)" fontSize="13">
                            Adicione riscos para visualizar a dobra
                        </text>
                    )}
                </svg>

                {/* Bottom info bar */}
                <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center pointer-events-none">
                    <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${isOverLimit ? 'bg-red-500 text-white' : 'bg-white/10 text-white/70'}`}>
                        {totalWidthCm.toFixed(1)} / {maxWidthCm} cm
                    </div>
                    {isOverLimit && (
                        <div className="text-red-400 text-xs font-bold animate-pulse">⚠ Excede chapa!</div>
                    )}
                </div>
            </div>
        </div>
    );
}
