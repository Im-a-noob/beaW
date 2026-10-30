'use client';

import React from 'react';
import { SimulationConfig, DEFAULT_CONFIG } from '@/lib/FluidSolver';
import {
  Play,
  Pause,
  StepForward,
  RotateCcw,
  Sliders,
  Box,
  Gauge,
} from 'lucide-react';

interface ControlPanelProps {
  config: SimulationConfig;
  isRunning: boolean;
  onToggleRun: () => void;
  onStepFrame: () => void;
  onResetDam: () => void;
  onUpdateConfig: (partial: Partial<SimulationConfig>) => void;
  onApplyPreset: (presetName: string, presetConfig: Partial<SimulationConfig>) => void;
  activePreset: string;
}

export default function ControlPanel({
  config,
  isRunning,
  onToggleRun,
  onStepFrame,
  onResetDam,
  onUpdateConfig,
  onApplyPreset,
  activePreset,
}: ControlPanelProps) {
  const presets: { id: string; label: string; cfg: Partial<SimulationConfig> }[] = [
    {
      id: 'kleefsman',
      label: 'Kleefsman (2005) Benchmark',
      cfg: { ...DEFAULT_CONFIG },
    },
    {
      id: 'high_head',
      label: 'High-Head Surge (H=0.76m)',
      cfg: {
        ...DEFAULT_CONFIG,
        damWidth: 1.35,
        damHeight: 0.76,
        obstacleEnabled: true,
        obstacleX: 2.395,
      },
    },
    {
      id: 'free_bore',
      label: 'Unobstructed Bore',
      cfg: {
        ...DEFAULT_CONFIG,
        obstacleEnabled: false,
      },
    },
    {
      id: 'viscous',
      label: 'Viscous Fluid (ν=1.5e-3)',
      cfg: {
        ...DEFAULT_CONFIG,
        viscosity: 0.0015,
      },
    },
  ];

  return (
    <aside className="flex flex-col gap-4 bg-[#0B0E17] border border-slate-800 rounded-md p-4">
      {/* 1. Solver Execution & Playback Controls */}
      <div className="flex flex-col gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            Solver Execution
          </span>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            Time-Scale: {config.timeScale}x
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onToggleRun}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
              isRunning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onStepFrame}
            disabled={isRunning}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-mono font-medium bg-[#111827] text-slate-200 border border-slate-700 hover:border-slate-500 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
          >
            <StepForward className="w-3.5 h-3.5" />
            <span>Step</span>
          </button>

          <button
            type="button"
            onClick={onResetDam}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-mono font-medium bg-[#111827] text-slate-200 border border-slate-700 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Dam</span>
          </button>
        </div>

        {/* Slow Motion Selector (0.25x, 0.5x, 1.0x) */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs font-mono text-slate-400">Playback Speed</span>
          <div className="flex items-center gap-1 bg-[#07090E] p-1 rounded border border-slate-800">
            {[0.25, 0.5, 1.0].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onUpdateConfig({ timeScale: spd })}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                  config.timeScale === spd
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Benchmark Case Presets */}
      <div className="flex flex-col gap-2 pb-4 border-b border-slate-800">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300">
          Benchmark Presets
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onApplyPreset(p.id, p.cfg)}
              className={`px-2.5 py-1.5 text-left text-[11px] font-mono rounded border transition-colors truncate ${
                activePreset === p.id
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 font-medium'
                  : 'bg-[#07090E] text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Physical Fluid & Dam Parameters */}
      <div className="flex flex-col gap-3 pb-4 border-b border-slate-800">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          Physical & Dam Parameters
        </span>

        {/* Gravity g */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-mono">
            <label htmlFor="slider-gravity" className="text-slate-400">
              Gravity (g)
            </label>
            <span className="text-slate-200 tabular-nums">
              -{config.gravity.toFixed(2)} m/s²
            </span>
          </div>
          <input
            id="slider-gravity"
            type="range"
            min="1.0"
            max="20.0"
            step="0.01"
            value={config.gravity}
            onChange={(e) => onUpdateConfig({ gravity: parseFloat(e.target.value) })}
            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
          />
        </div>

        {/* Kinematic Viscosity */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-mono">
            <label htmlFor="slider-viscosity" className="text-slate-400">
              Kinematic Viscosity (ν)
            </label>
            <span className="text-slate-200 tabular-nums">
              {config.viscosity.toExponential(1)} m²/s
            </span>
          </div>
          <input
            id="slider-viscosity"
            type="range"
            min="0.000001"
            max="0.002"
            step="0.00005"
            value={config.viscosity}
            onChange={(e) => onUpdateConfig({ viscosity: parseFloat(e.target.value) })}
            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
          />
        </div>

        {/* Density Ratio */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-mono">
            <label htmlFor="slider-density-ratio" className="text-slate-400">
              Density Ratio (ρ_w / ρ_a)
            </label>
            <span className="text-slate-200 tabular-nums">
              {config.densityRatio.toFixed(0)} : 1
            </span>
          </div>
          <input
            id="slider-density-ratio"
            type="range"
            min="50"
            max="1000"
            step="2"
            value={config.densityRatio}
            onChange={(e) =>
              onUpdateConfig({ densityRatio: parseFloat(e.target.value) })
            }
            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
          />
        </div>

        {/* Initial Water Column Width */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-mono">
            <label htmlFor="slider-dam-width" className="text-slate-400">
              Dam Column Width (L_0)
            </label>
            <span className="text-slate-200 tabular-nums">
              {config.damWidth.toFixed(3)} m
            </span>
          </div>
          <input
            id="slider-dam-width"
            type="range"
            min="0.50"
            max="1.80"
            step="0.004"
            value={config.damWidth}
            onChange={(e) => onUpdateConfig({ damWidth: parseFloat(e.target.value) })}
            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
          />
        </div>

        {/* Initial Water Column Height */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-mono">
            <label htmlFor="slider-dam-height" className="text-slate-400">
              Dam Column Height (H_0)
            </label>
            <span className="text-slate-200 tabular-nums">
              {config.damHeight.toFixed(3)} m
            </span>
          </div>
          <input
            id="slider-dam-height"
            type="range"
            min="0.25"
            max="0.85"
            step="0.005"
            value={config.damHeight}
            onChange={(e) => onUpdateConfig({ damHeight: parseFloat(e.target.value) })}
            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
          />
        </div>
      </div>

      {/* 4. Obstacle Geometry & Position Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            Obstacle Boundary
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({ obstacleEnabled: !config.obstacleEnabled })
            }
            aria-pressed={config.obstacleEnabled}
            className={`px-2.5 py-0.5 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              config.obstacleEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {config.obstacleEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <div
          className={`flex flex-col gap-3 transition-opacity ${
            config.obstacleEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
          }`}
        >
          {/* Obstacle X Position */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs font-mono">
              <label htmlFor="slider-obs-x" className="text-slate-400">
                Obstacle Front Face (x_obs)
              </label>
              <span className="text-slate-200 tabular-nums">
                {config.obstacleX.toFixed(3)} m
              </span>
            </div>
            <input
              id="slider-obs-x"
              type="range"
              min="1.65"
              max="2.85"
              step="0.005"
              value={config.obstacleX}
              onChange={(e) =>
                onUpdateConfig({ obstacleX: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          {/* Obstacle Width */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs font-mono">
              <label htmlFor="slider-obs-w" className="text-slate-400">
                Obstacle Width (W_obs)
              </label>
              <span className="text-slate-200 tabular-nums">
                {config.obstacleWidth.toFixed(3)} m
              </span>
            </div>
            <input
              id="slider-obs-w"
              type="range"
              min="0.08"
              max="0.40"
              step="0.003"
              value={config.obstacleWidth}
              onChange={(e) =>
                onUpdateConfig({ obstacleWidth: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          {/* Obstacle Height */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs font-mono">
              <label htmlFor="slider-obs-h" className="text-slate-400">
                Obstacle Height (H_obs)
              </label>
              <span className="text-slate-200 tabular-nums">
                {config.obstacleHeight.toFixed(3)} m
              </span>
            </div>
            <input
              id="slider-obs-h"
              type="range"
              min="0.08"
              max="0.40"
              step="0.003"
              value={config.obstacleHeight}
              onChange={(e) =>
                onUpdateConfig({ obstacleHeight: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
