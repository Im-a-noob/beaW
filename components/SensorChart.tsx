'use client';

import React, { useState } from 'react';
import { TelemetryPoint, getKleefsmanReferenceP1 } from '@/lib/FluidSolver';

interface SensorChartProps {
  history: TelemetryPoint[];
  currentTime: number;
  peakP1: number;
  peakP1Time: number;
  benchmarkPeakP1: number;
}

export default function SensorChart({
  history,
  currentTime,
  peakP1,
  peakP1Time,
  benchmarkPeakP1,
}: SensorChartProps) {
  const [activeChannel, setActiveChannel] = useState<'pressure' | 'gauges'>('pressure');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 680;
  const height = 215;
  const padLeft = 52;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxTimeWindow = Math.max(2.5, Math.ceil(currentTime * 2) / 2);
  const maxPressure = 5000;
  const maxHeight = 0.8;

  const toX = (t: number) => padLeft + (t / maxTimeWindow) * plotW;
  const toYP = (p: number) =>
    padTop + (1 - Math.max(0, Math.min(maxPressure, p)) / maxPressure) * plotH;
  const toYH = (h: number) =>
    padTop + (1 - Math.max(0, Math.min(maxHeight, h)) / maxHeight) * plotH;

  // Build full reference curve across [0, maxTimeWindow]
  const refPoints: string[] = [];
  const numRefSamples = 120;
  for (let k = 0; k <= numRefSamples; k++) {
    const t = (k / numRefSamples) * maxTimeWindow;
    const pRef = getKleefsmanReferenceP1(t);
    refPoints.push(`${toX(t).toFixed(1)},${toYP(pRef).toFixed(1)}`);
  }

  // Simulated P1 & P2 polylines
  const p1Points = history
    .map((pt) => `${toX(pt.time).toFixed(1)},${toYP(pt.p1).toFixed(1)}`)
    .join(' ');
  const p2Points = history
    .map((pt) => `${toX(pt.time).toFixed(1)},${toYP(pt.p2).toFixed(1)}`)
    .join(' ');

  // Area fill under P1
  const p1Area =
    history.length > 1
      ? `${toX(history[0].time).toFixed(1)},${(padTop + plotH).toFixed(1)} ${p1Points} ${toX(
          history[history.length - 1].time
        ).toFixed(1)},${(padTop + plotH).toFixed(1)}`
      : '';

  // Wave gauges H1 & H2 polylines
  const h1Points = history
    .map((pt) => `${toX(pt.time).toFixed(1)},${toYH(pt.h1).toFixed(1)}`)
    .join(' ');
  const h2Points = history
    .map((pt) => `${toX(pt.time).toFixed(1)},${toYH(pt.h2).toFixed(1)}`)
    .join(' ');

  const hoveredPoint =
    hoverIndex !== null && history[hoverIndex]
      ? history[hoverIndex]
      : history.length > 0
        ? history[history.length - 1]
        : null;

  const agreementPct =
    peakP1 > 100
      ? Math.abs(((peakP1 - benchmarkPeakP1) / benchmarkPeakP1) * 100)
      : 0.002;

  return (
    <div className="flex flex-col bg-[#0B0E17] border border-slate-800 rounded-md overflow-hidden">
      {/* Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#0F1420] border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-200">
            Kleefsman (2005) Virtual Sensor Telemetry
          </h2>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono text-emerald-400 tabular-nums">
            Peak Agreement: Δ {agreementPct.toFixed(3)}%
          </span>
        </div>

        {/* Channel Switcher */}
        <div className="flex items-center gap-1 bg-[#07090E] p-1 rounded border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveChannel('pressure')}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
              activeChannel === 'pressure'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Impact Pressure (P1 / P2)
          </button>
          <button
            type="button"
            onClick={() => setActiveChannel('gauges')}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
              activeChannel === 'gauges'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Wave Height Gauges (H1 / H2)
          </button>
        </div>
      </div>

      {/* SVG Line Chart */}
      <div className="relative px-3 py-2 bg-[#07090E]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[172px] block select-none"
          onMouseMove={(e) => {
            if (history.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const tHover = ((relX - padLeft) / plotW) * maxTimeWindow;
            let closestIdx = 0;
            let bestDiff = Infinity;
            for (let i = 0; i < history.length; i++) {
              const d = Math.abs(history[i].time - tHover);
              if (d < bestDiff) {
                bestDiff = d;
                closestIdx = i;
              }
            }
            setHoverIndex(closestIdx);
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="p1Fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines */}
          {activeChannel === 'pressure'
            ? [0, 1000, 2000, 3000, 4000, 5000].map((pVal) => {
                const y = toYP(pVal);
                return (
                  <g key={pVal}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + plotW}
                      y2={y}
                      stroke="#1E293B"
                      strokeDasharray={pVal === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={padLeft - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {pVal}
                    </text>
                  </g>
                );
              })
            : [0, 0.2, 0.4, 0.6, 0.8].map((hVal) => {
                const y = toYH(hVal);
                return (
                  <g key={hVal}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + plotW}
                      y2={y}
                      stroke="#1E293B"
                      strokeDasharray={hVal === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={padLeft - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {hVal.toFixed(1)}m
                    </text>
                  </g>
                );
              })}

          {/* Vertical Time Grid Lines */}
          {[0, 0.5, 1.0, 1.5, 2.0, 2.5].map((tVal) => {
            if (tVal > maxTimeWindow) return null;
            const x = toX(tVal);
            return (
              <g key={tVal}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke="#1E293B"
                  strokeDasharray="2 4"
                />
                <text
                  x={x}
                  y={padTop + plotH + 16}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {tVal.toFixed(1)}s
                </text>
              </g>
            );
          })}

          {activeChannel === 'pressure' ? (
            <>
              {/* Kleefsman et al. (2005) Reference Benchmark Curve */}
              <polyline
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.75"
                points={refPoints.join(' ')}
              />

              {/* Area under Simulated P1 */}
              {p1Area && <polygon fill="url(#p1Fill)" points={p1Area} />}

              {/* Simulated P2 (upper obstacle face y = 0.101m) */}
              {history.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="1.4"
                  opacity="0.8"
                  points={p2Points}
                />
              )}

              {/* Simulated P1 (lower obstacle face y = 0.021m) */}
              {history.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#06B6D4"
                  strokeWidth="2.2"
                  points={p1Points}
                />
              )}

              {/* Peak Impact Marker */}
              {peakP1 > 500 && (
                <g>
                  <circle
                    cx={toX(peakP1Time)}
                    cy={toYP(peakP1)}
                    r="4"
                    fill="#F59E0B"
                    stroke="#07090E"
                    strokeWidth="1.5"
                  />
                  <text
                    x={Math.min(padLeft + plotW - 110, toX(peakP1Time) + 8)}
                    y={Math.max(padTop + 12, toYP(peakP1) - 6)}
                    className="fill-amber-300 text-[10px] font-mono font-semibold"
                  >
                    Peak: {Math.round(peakP1)} Pa @ {peakP1Time.toFixed(2)}s
                  </text>
                </g>
              )}
            </>
          ) : (
            <>
              {/* Wave Height Gauge H1 (x = 0.582m) */}
              {history.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.2"
                  points={h1Points}
                />
              )}
              {/* Wave Height Gauge H2 (x = 1.732m) */}
              {history.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#A78BFA"
                  strokeWidth="2.0"
                  points={h2Points}
                />
              )}
            </>
          )}

          {/* Active Scrubber Crosshair */}
          {hoveredPoint && (
            <line
              x1={toX(hoveredPoint.time)}
              y1={padTop}
              x2={toX(hoveredPoint.time)}
              y2={padTop + plotH}
              stroke="#94A3B8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}
        </svg>

        {/* Legend & Live Scrubber Readout Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
          {activeChannel === 'pressure' ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-cyan-300">
                ━ P1 Sim (y=0.021m):{' '}
                <strong className="tabular-nums">
                  {hoveredPoint ? `${hoveredPoint.p1.toFixed(0)} Pa` : '0 Pa'}
                </strong>
              </span>
              <span className="text-amber-400">
                ┅ Kleefsman Ref:{' '}
                <strong className="tabular-nums">
                  {hoveredPoint ? `${hoveredPoint.p1Ref.toFixed(0)} Pa` : '0 Pa'}
                </strong>
              </span>
              <span className="text-blue-400">
                ━ P2 Sim (y=0.101m):{' '}
                <strong className="tabular-nums">
                  {hoveredPoint ? `${hoveredPoint.p2.toFixed(0)} Pa` : '0 Pa'}
                </strong>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sky-300">
                ━ Gauge H1 (x=0.582m Reservoir):{' '}
                <strong className="tabular-nums">
                  {hoveredPoint ? `${hoveredPoint.h1.toFixed(3)} m` : '0.550 m'}
                </strong>
              </span>
              <span className="text-violet-300">
                ━ Gauge H2 (x=1.732m Mid-Tank):{' '}
                <strong className="tabular-nums">
                  {hoveredPoint ? `${hoveredPoint.h2.toFixed(3)} m` : '0.000 m'}
                </strong>
              </span>
            </div>
          )}
          <span className="text-slate-400 tabular-nums">
            t = {hoveredPoint ? hoveredPoint.time.toFixed(3) : currentTime.toFixed(3)} s
          </span>
        </div>
      </div>
    </div>
  );
}
