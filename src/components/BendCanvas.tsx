import React, { useMemo } from 'react';

// ─── 8 Directions ───────────────────────────────────────────────────────────
export type RiskDirection =
    | 'right' | 'downRight' | 'down' | 'downLeft'
    | 'left' | 'upLeft' | 'up' | 'upRight';

export interface Risk {
    direction: RiskDirection;
    sizeCm: number;
    slopeData?: { side: 'D' | 'E', h1: number, h2: number };
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
    /** When true, hides edit markers (circles, start label, grid, info bar) for clean export */
    exportMode?: boolean;
}

export default function BendCanvas({ risks, maxWidthCm = 120, svgRef, exportMode = false }: BendCanvasProps) {
    const points = useMemo(() => computePath(risks), [risks]);
    const totalWidthCm = risks.reduce((sum, r) => sum + r.sizeCm, 0);
    const isOverLimit = totalWidthCm > maxWidthCm;

    // ── Dynamic scaling ──────────────────────────────────────────────────────
    const CANVAS_W = 460;
    const CANVAS_H = 220;
    const PADDING = 45; // Increased padding for labels

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

    // In export mode, always use blue (not red) for a clean look
    const strokeColor = exportMode ? '#63b3ed' : (isOverLimit ? '#ef4444' : '#63b3ed');
    const glowFilter = exportMode ? 'none' : (isOverLimit ? 'drop-shadow(0 0 6px #ef4444)' : 'drop-shadow(0 0 8px #63b3ed88)');

    return (
        <div className="relative w-full">
            <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-300 bg-gradient-to-br from-slate-900 to-slate-800 ${exportMode ? 'border-slate-700' : (isOverLimit ? 'border-red-500' : 'border-slate-700')}`}>
                <svg
                    ref={svgRef}
                    width="100%"
                    viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                    className="w-full"
                    style={{ minHeight: 180, maxHeight: 260 }}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* Subtle grid — HIDDEN in export mode */}
                    {!exportMode && Array.from({ length: 24 }).map((_, i) => (
                        <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={CANVAS_H}
                            stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
                    ))}
                    {!exportMode && Array.from({ length: 12 }).map((_, i) => (
                        <line key={`h${i}`} x1={0} y1={i * 20} x2={CANVAS_W} y2={i * 20}
                            stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
                    ))}

                    {/* Sheet shadow */}
                    {pathStr && (
                        <path d={pathStr} fill="none"
                            stroke={exportMode ? 'rgba(99,179,237,0.15)' : (isOverLimit ? 'rgba(239,68,68,0.18)' : 'rgba(99,179,237,0.18)')}
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
                            {/* Mid-segment label — ALWAYS shown */}
                            {i > 0 && risks[i - 1] && (() => {
                                const prev = scaled[i - 1];
                                const mx = (prev.x + pt.x) / 2;
                                const my = (prev.y + pt.y) / 2;
                                // Offset perpendicular to segment for readability
                                const dx = pt.x - prev.x;
                                const dy = pt.y - prev.y;
                                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                                const nx = -dy / len * 16;
                                const ny = dx / len * 16;

                                // Calculate if labels would overlap (too close)
                                const isTinySegment = len < 10;

                                return (
                                    <g key={i}>
                                        {/* Per-Risk Lateral Slope visual indicators */}
                                        {risks[i - 1].slopeData && (
                                            <>
                                                {/* Transversal line in the middle of the segment */}
                                                <line x1={mx - ny / 3} y1={my + nx / 3} x2={mx + ny / 3} y2={my - nx / 3}
                                                    stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />

                                                {/* D or E indicator */}
                                                <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                                                    fill="#f59e0b" fontSize="12" fontWeight="black"
                                                    style={{ paintOrder: 'stroke', stroke: '#1e293b', strokeWidth: 2 }}>
                                                    {risks[i - 1].slopeData!.side}
                                                </text>

                                                {/* H1 and H2 at the ends of the segment */}
                                                <text x={prev.x + nx * (isTinySegment ? 1.5 : 1.2)} y={prev.y + ny * (isTinySegment ? 1.5 : 1.2)} textAnchor="middle" dominantBaseline="middle"
                                                    fill="#fbbf24" fontSize="10" fontStyle="italic" fontWeight="black"
                                                    style={{ paintOrder: 'stroke', stroke: '#1e293b', strokeWidth: 2 }}>
                                                    {risks[i - 1].slopeData!.h1}
                                                </text>
                                                <text x={pt.x + nx * (isTinySegment ? 1.5 : 1.2)} y={pt.y + ny * (isTinySegment ? 1.5 : 1.2)} textAnchor="middle" dominantBaseline="middle"
                                                    fill="#fbbf24" fontSize="10" fontStyle="italic" fontWeight="black"
                                                    style={{ paintOrder: 'stroke', stroke: '#1e293b', strokeWidth: 2 }}>
                                                    {risks[i - 1].slopeData!.h2}
                                                </text>
                                            </>
                                        )}

                                        {!risks[i - 1].slopeData && (
                                            <text x={mx + nx * (isTinySegment ? 1.4 : 1)} y={my + ny * (isTinySegment ? 1.4 : 1)}
                                                textAnchor="middle" dominantBaseline="middle"
                                                fill="rgba(255,255,255,0.95)" fontSize={exportMode ? "11" : "10"} fontWeight="black"
                                                style={{ paintOrder: 'stroke', stroke: '#1e293b', strokeWidth: 3 }}>
                                                {risks[i - 1].sizeCm}cm
                                            </text>
                                        )}
                                    </g>
                                );
                            })()}
                        </g>
                    ))}

                    {/* Start label — HIDDEN in export mode */}
                    {!exportMode && scaled.length > 0 && (
                        <text x={scaled[0].x} y={scaled[0].y - 14} textAnchor="middle"
                            fill="#48bb78" fontSize="9" fontWeight="bold">INÍCIO</text>
                    )}

                    {/* Real Sum Circle — Facilitate execution (Moved fuera del dibujo) */}
                    {totalWidthCm > 0 && (
                        <g transform={`translate(${CANVAS_W - 40}, ${CANVAS_H - 40})`}>
                            <circle r="22" fill="#1e293b" stroke={strokeColor} strokeWidth="3" opacity="0.9" />
                            <text textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="14" fontWeight="black">
                                {totalWidthCm}
                            </text>
                        </g>
                    )}

                    {/* Empty state */}
                    {risks.length === 0 && (
                        <text x={CANVAS_W / 2} y={CANVAS_H / 2} textAnchor="middle"
                            fill="rgba(255,255,255,0.2)" fontSize="13">
                            Adicione riscos para visualizar a dobra
                        </text>
                    )}
                </svg>

                {/* Bottom info bar — HIDDEN in export mode */}
                {!exportMode && (
                    <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center pointer-events-none">
                        <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${isOverLimit ? 'bg-red-500 text-white' : 'bg-white/10 text-white/70'}`}>
                            {totalWidthCm.toFixed(1)} / {maxWidthCm} cm
                        </div>
                        {isOverLimit && (
                            <div className="text-red-400 text-xs font-bold animate-pulse">⚠ Excede chapa!</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
