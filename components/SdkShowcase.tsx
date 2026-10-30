'use client';

import React, { useState } from 'react';
import {
  SimulationConfig,
  FluidSolver,
} from '@/lib/FluidSolver';
import {
  generateStandaloneSdkSource,
  WaterSimulationSnapshot,
} from '@/lib/water-sim';
import {
  Code2,
  Copy,
  Check,
  Download,
  Droplets,
  Terminal,
  FileJson,
  Package,
} from 'lucide-react';

interface SdkShowcaseProps {
  config: SimulationConfig;
  solverRef: React.MutableRefObject<FluidSolver>;
  onTriggerPulseAdded: () => void;
}

type SdkTab = 'core' | 'threejs' | 'canvas2d' | 'sandbox';

export default function SdkShowcase({
  config,
  solverRef,
  onTriggerPulseAdded,
}: SdkShowcaseProps) {
  const [activeTab, setActiveTab] = useState<SdkTab>('core');
  const [copied, setCopied] = useState(false);
  const [snapshotJson, setSnapshotJson] = useState<string | null>(null);
  const [pulseCount, setPulseCount] = useState<number>(0);

  const coreSnippet = `import { createWaterSimulation, WaterColorMaps } from '@/lib/water-sim';

// 1. Initialize 2D/3D Multiphase VoF-FLIP Water Simulation Engine
const sim = createWaterSimulation({
  gravity: ${config.gravity},          // m/s²
  viscosity: ${config.viscosity},      // m²/s
  waterDensity: ${config.waterDensity},   // kg/m³
  damWidth: ${config.damWidth.toFixed(3)},       // m (Initial water column width)
  damHeight: ${config.damHeight.toFixed(3)},      // m (Initial water column height)
  obstacleEnabled: ${config.obstacleEnabled},
  obstacleX: ${config.obstacleX.toFixed(3)},      // m (Obstacle front face)
  obstacleWidth: ${config.obstacleWidth.toFixed(3)},  // m
  obstacleHeight: ${config.obstacleHeight.toFixed(3)}, // m
});

// 2. Register custom virtual wave-height or impact pressure sensors
sim.addSensor({ id: 'crest_gauge', type: 'wave_height', x: 1.732 })
   .addSensor({ id: 'wall_impact', type: 'pressure', x: ${config.obstacleX.toFixed(3)}, y: 0.021 });

// 3. Subscribe to impact pressure peak & step telemetry
sim.onImpactPeak((peakPa, timeSec) => {
  console.log(\`[P1 Impact Peak] \${peakPa.toFixed(1)} Pa at t = \${timeSec.toFixed(3)}s\`);
});

// 4. Advance simulation in your animation loop (60 FPS)
const telemetry = sim.step(1 / 60);
console.log('Wave Height H1:', telemetry.h1, 'm | Courant CFL:', telemetry.cfl);`;

  const threejsSnippet = `import * as THREE from 'three';
import { createWaterSimulation, WaterColorMaps } from '@/lib/water-sim';

const sim = createWaterSimulation({ damWidth: ${config.damWidth.toFixed(3)}, damHeight: ${config.damHeight.toFixed(3)} });
const { solver } = sim;

// Create InstancedMesh for 3D Lagrangian Water Particles
const geo = new THREE.IcosahedronGeometry(0.02, 1);
const mat = new THREE.MeshStandardMaterial({ roughness: 0.18, metalness: 0.1 });
const particlesMesh = new THREE.InstancedMesh(geo, mat, solver.maxParticles);
const dummy = new THREE.Object3D();
const color = new THREE.Color();

function animate() {
  requestAnimationFrame(animate);
  sim.step(1 / 60);

  for (let p = 0; p < solver.numParticles; p++) {
    dummy.position.set(solver.px[p], solver.py[p], (p % 5 - 2) * 0.16);
    dummy.updateMatrix();
    particlesMesh.setMatrixAt(p, dummy.matrix);

    const speed = Math.hypot(solver.pu[p], solver.pv[p]);
    const [r, g, b] = WaterColorMaps.phaseToRGB(1.0, speed);
    particlesMesh.setColorAt(p, color.setRGB(r / 255, g / 255, b / 255));
  }
  particlesMesh.count = solver.numParticles;
  particlesMesh.instanceMatrix.needsUpdate = true;
  if (particlesMesh.instanceColor) particlesMesh.instanceColor.needsUpdate = true;
}`;

  const canvas2dSnippet = `import { createWaterSimulation, WaterColorMaps } from '@/lib/water-sim';

const sim = createWaterSimulation();
const { solver } = sim;
const offCanvas = document.createElement('canvas');
offCanvas.width = solver.nx;  // 161 MAC cells
offCanvas.height = solver.ny; // 50 MAC cells
const ctx = offCanvas.getContext('2d')!;
const imgData = ctx.createImageData(solver.nx, solver.ny);

export function renderEulerianField(targetCtx: CanvasRenderingContext2D, width: number, height: number) {
  sim.step(1 / 60);
  const data = imgData.data;

  for (let i = 0; i < solver.nx; i++) {
    for (let j = 0; j < solver.ny; j++) {
      const idx = solver.cellIndex(i, j);
      const pIdx = ((solver.ny - 1 - j) * solver.nx + i) * 4;
      const [r, g, b] = WaterColorMaps.pressureToRGB(solver.pressure[idx]);
      data[pIdx] = r;
      data[pIdx + 1] = g;
      data[pIdx + 2] = b;
      data[pIdx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  targetCtx.drawImage(offCanvas, 0, 0, width, height);
}`;

  const currentCode =
    activeTab === 'core'
      ? coreSnippet
      : activeTab === 'threejs'
        ? threejsSnippet
        : canvas2dSnippet;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadSdk = () => {
    const source = generateStandaloneSdkSource(config);
    const blob = new Blob([source], { type: 'text/typescript;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brae-water-sim.ts';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInjectWaterBlock = () => {
    const s = solverRef.current;
    const stepX = s.dx * 0.5;
    const stepY = s.dy * 0.5;
    let added = 0;
    // Inject a 0.36m x 0.24m falling water pulse at x in [1.45m, 1.81m], y in [0.58m, 0.82m]
    for (let x = 1.45; x <= 1.81; x += stepX) {
      for (let y = 0.58; y <= 0.82; y += stepY) {
        if (s.numParticles >= s.maxParticles) break;
        const idx = s.numParticles++;
        s.px[idx] = x;
        s.py[idx] = y;
        s.pu[idx] = 0.85;
        s.pv[idx] = -1.2;
        added++;
      }
    }
    setPulseCount((c) => c + added);
    onTriggerPulseAdded();
  };

  const handleCaptureSnapshot = () => {
    const s = solverRef.current;
    const snap: WaterSimulationSnapshot = {
      version: '1.0.0',
      time: Number(s.time.toFixed(3)),
      stepCount: s.stepCount,
      config: { ...s.config },
      numParticles: s.numParticles,
      peakP1: Number(s.peakP1.toFixed(1)),
      peakP1Time: Number(s.peakP1Time.toFixed(3)),
    };
    setSnapshotJson(JSON.stringify(snap, null, 2));
  };

  return (
    <section
      id="sdk"
      aria-label="Water Simulation Library SDK"
      className="bg-[#0B0E17] border border-slate-800 rounded-md overflow-hidden"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#0F1420] border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-mono font-bold text-slate-100">
              @brae/water-sim — Standalone Water Simulation Library (SDK)
            </h2>
          </div>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono text-slate-400">
            Module: <code className="text-cyan-300">@/lib/water-sim</code> · Zero Dependencies · TypeScript / Three.js / Canvas 2D
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInjectWaterBlock}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/25 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>sim.addFluidBlock() (+Wave Pulse)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadSdk}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download brae-water-sim.ts</span>
          </button>
        </div>
      </div>

      {/* SDK Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left 8 Cols: Code Generator & Integration Snippets */}
        <div className="lg:col-span-8 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[#07090E] border-b border-slate-800/80">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('core')}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'core'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1. Core Engine API
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('threejs')}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'threejs'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2. Three.js 3D Adapter
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('canvas2d')}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'canvas2d'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3. Canvas 2D Adapter
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white bg-slate-800/80 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Snippet</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-4 bg-[#05070B] text-[11.5px] font-mono leading-relaxed text-slate-200 overflow-x-auto select-all">
            <code>{currentCode}</code>
          </pre>
        </div>

        {/* Right 4 Cols: API Reference & Interactive Runtime Console */}
        <div className="lg:col-span-4 p-4 flex flex-col justify-between gap-4 bg-[#0B0E17]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Exported Library Classes & Hooks
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                v1.0.0 Ready
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs font-mono">
              <div className="p-2.5 bg-[#07090E] border border-slate-800/90 rounded">
                <div className="text-cyan-300 font-semibold">
                  createWaterSimulation(config?)
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5 font-sans">
                  Creates a headless VoF-FLIP solver instance with event listeners{' '}
                  <code className="font-mono text-slate-300">onStep()</code> and{' '}
                  <code className="font-mono text-slate-300">onImpactPeak()</code>.
                </p>
              </div>

              <div className="p-2.5 bg-[#07090E] border border-slate-800/90 rounded">
                <div className="text-sky-300 font-semibold">
                  sim.addFluidBlock(spec) · sim.addSensor(spec)
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5 font-sans">
                  Dynamically injects new water volumes with initial velocity vectors
                  or registers virtual pressure/wave gauges at{' '}
                  <code className="font-mono text-slate-300">(x, y)</code>.
                </p>
              </div>

              <div className="p-2.5 bg-[#07090E] border border-slate-800/90 rounded">
                <div className="text-amber-300 font-semibold">
                  WaterColorMaps (phase | velocity | pressure)
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5 font-sans">
                  Zero-allocation RGB transfer functions for Three.js{' '}
                  <code className="font-mono text-slate-300">InstancedMesh</code> and
                  Canvas <code className="font-mono text-slate-300">ImageData</code>.
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Live Runtime Test Controls */}
          <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Live SDK Runtime Inspector
              </span>
              {pulseCount > 0 && (
                <span className="text-[11px] font-mono text-cyan-300 tabular-nums">
                  +{pulseCount} particles injected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-mono bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded transition-colors whitespace-nowrap"
              >
                <FileJson className="w-3.5 h-3.5 text-cyan-400" />
                <span>Inspect sim.exportSnapshot()</span>
              </button>
            </div>

            {snapshotJson && (
              <pre className="p-2.5 bg-[#05070B] border border-slate-800 rounded text-[10.5px] font-mono text-emerald-300 max-h-[120px] overflow-y-auto">
                {snapshotJson}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
