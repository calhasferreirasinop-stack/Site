import React, { useMemo } from 'react';

export type RiskDirection = 'flat' | 'down' | 'up' | 'left90' | 'right90' | 'left45' | 'right45';

export interface Risk {
    direction: RiskDirection;
    sizeCm: number;
}

interface BendCanvasProps {
    risks: Risk[];
    maxWidthCm?: number;
}

const SCALE = 3.5; // pixels per cm
const START_X = 40;
const START_Y = 120;
const CANVAS_W = 500;
const CANVAS_H = 240;

// Directions as angle increments (degrees, relative)
const DIRECTION_ANGLES: Record<RiskDirection, number> = {
    flat: 0,
    right90: 90,
    left90: -90,
    up: 180,
    down: 0,
    right45: 45,
    left45: -45,
};

const DIRECTION_LABELS: Record<RiskDirection, string> = {
    flat: '→ Plano',
    right90: '↘ 90° Dir',
    left90: '↙ 90° Esq',
    right45: '↗ 45° Dir',
    left45: '↖ 45° Esq',
    up: '↑ Cima',
    down: '↓ Baixo',
};

const DIRECTION_ICONS: Record<RiskDirection, string> = {
    flat: '➡',
    right90: '↘',
    left90: '↙',
    right45: '↗',
    left45: '↖',
    up: '⬆',
    down: '⬇',
};

export { DIRECTION_LABELS, DIRECTION_ICONS };

interface Point { x: number; y: number; }

function computePath(risks: Risk[]): Point[] {
    const points: Point[] = [{ x: START_X, y: START_Y }];
    let currentAngle = 0; // 0 = rightward (flat)

    for (const risk of risks) {
        const prev = points[points.length - 1];
        const angleChange = DIRECTION_ANGLES[risk.direction] || 0;
        currentAngle += angleChange;
        const radians = (currentAngle * Math.PI) / 180;
        const dist = risk.sizeCm * SCALE;
        const next: Point = {
            x: prev.x + Math.cos(radians) * dist,
            y: prev.y + Math.sin(radians) * dist,
        };
        points.push(next);
    }
    return points;
}

export default function BendCanvas({ risks, maxWidthCm = 120 }: BendCanvasProps) {
    const points = useMemo(() => computePath(risks), [risks]);
    const totalWidthCm = risks.reduce((sum, r) => sum + r.sizeCm, 0);
    const isOverLimit = totalWidthCm > maxWidthCm;

    const pathD = points.length > 1
        ? `M ${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`
        : '';

    // Compute bounding box for auto-centering
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, CANVAS_W);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, CANVAS_H);
    const viewBox = `${minX - 20} ${minY - 20} ${maxX - minX + 40} ${maxY - minY + 40}`;

    return (
        <div className="relative w-full">
            <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-300 bg-gradient-to-br from-slate-900 to-slate-800 ${isOverLimit ? 'border-red-500' : 'border-slate-700'}`}>
                <svg
                    width="100%"
                    viewBox={viewBox}
                    className="w-full"
                    style={{ minHeight: 180, maxHeight: 260 }}
                >
                    {/* Grid lines */}
                    {Array.from({ length: 30 }).map((_, i) => (
                        <line
                            key={`v${i}`}
                            x1={minX + i * 20} y1={minY} x2={minX + i * 20} y2={maxY}
                            stroke="rgba(255,255,255,0.04)" strokeWidth="1"
                        />
                    ))}
                    {Array.from({ length: 20 }).map((_, i) => (
                        <line
                            key={`h${i}`}
                            x1={minX} y1={minY + i * 20} x2={maxX} y2={minY + i * 20}
                            stroke="rgba(255,255,255,0.04)" strokeWidth="1"
                        />
                    ))}

                    {/* Sheet shadow/fill */}
                    {pathD && risks.length > 0 && (
                        <polyline
                            points={points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                            fill="none"
                            stroke={isOverLimit ? 'rgba(239,68,68,0.25)' : 'rgba(99,179,237,0.15)'}
                            strokeWidth={14}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {/* Main path */}
                    {pathD && (
                        <polyline
                            points={points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                            fill="none"
                            stroke={isOverLimit ? '#ef4444' : '#63b3ed'}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: isOverLimit ? 'drop-shadow(0 0 6px #ef4444)' : 'drop-shadow(0 0 6px #63b3ed)' }}
                        />
                    )}

                    {/* Points with labels */}
                    {points.map((pt, i) => (
                        <g key={i}>
                            <circle
                                cx={pt.x} cy={pt.y} r={i === 0 ? 6 : 4}
                                fill={i === 0 ? '#48bb78' : isOverLimit ? '#ef4444' : '#63b3ed'}
                                stroke="white" strokeWidth="2"
                            />
                            {i > 0 && risks[i - 1] && (
                                <text
                                    x={(points[i - 1].x + pt.x) / 2}
                                    y={(points[i - 1].y + pt.y) / 2 - 8}
                                    textAnchor="middle"
                                    fill="rgba(255,255,255,0.7)"
                                    fontSize="10"
                                    fontWeight="bold"
                                >
                                    {risks[i - 1].sizeCm}cm
                                </text>
                            )}
                        </g>
                    ))}

                    {/* Start label */}
                    {points.length > 0 && (
                        <text x={START_X - 5} y={START_Y - 12} textAnchor="middle" fill="#48bb78" fontSize="10" fontWeight="bold">
                            INÍCIO
                        </text>
                    )}
                </svg>

                {/* Overlay info */}
                <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center pointer-events-none">
                    <div className={`text-xs font-bold px-3 py-1 rounded-full ${isOverLimit ? 'bg-red-500 text-white' : 'bg-white/10 text-white/70'}`}>
                        {totalWidthCm.toFixed(1)} cm / {maxWidthCm} cm
                    </div>
                    {risks.length === 0 && (
                        <div className="text-white/30 text-xs italic">Adicione riscos para visualizar a dobra</div>
                    )}
                    {isOverLimit && (
                        <div className="text-red-400 text-xs font-bold animate-pulse">⚠ Excede largura da chapa!</div>
                    )}
                </div>
            </div>
        </div>
    );
}
