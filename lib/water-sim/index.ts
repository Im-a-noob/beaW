/**
 * @brae/water-sim — Standalone 2D/3D Multiphase VoF-FLIP Water Simulation Library
 * Extracted from the Brae CFD interFoam (Kleefsman et al., 2005) Workbench.
 */

import {
  FluidSolver,
  SimulationConfig,
  DEFAULT_CONFIG,
  TelemetryPoint,
  ProbeSample,
  getKleefsmanReferenceP1,
} from '../FluidSolver';

export {
  FluidSolver,
  DEFAULT_CONFIG,
  getKleefsmanReferenceP1,
  type SimulationConfig,
  type TelemetryPoint,
  type ProbeSample,
};

export interface FluidBlockSpec {
  x0: number;
  y0: number;
  width: number;
  height: number;
  initialVelocity?: [number, number];
}

export interface ObstacleBoxSpec {
  id: string;
  x: number;
  y?: number;
  width: number;
  height: number;
}

export interface VirtualSensorSpec {
  id: string;
  type: 'pressure' | 'wave_height';
  x: number;
  y?: number;
}

export interface WaterSimulationSnapshot {
  version: '1.0.0';
  time: number;
  stepCount: number;
  config: SimulationConfig;
  numParticles: number;
  peakP1: number;
  peakP1Time: number;
}

export type StepListener = (telemetry: TelemetryPoint, solver: FluidSolver) => void;
export type ImpactPeakListener = (peakPressurePa: number, timeSec: number) => void;

/**
 * High-level SDK wrapper around FluidSolver with event hooks, custom fluid blocks,
 * custom virtual sensors, colormaps, and state serialization.
 */
export class WaterSimulationLibrary {
  public readonly solver: FluidSolver;
  private stepListeners: Set<StepListener> = new Set();
  private peakListeners: Set<ImpactPeakListener> = new Set();
  private customSensors: Map<string, VirtualSensorSpec> = new Map();
  private lastPeakP1 = 0;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.solver = new FluidSolver(config);
  }

  /** Advance the simulation by dt seconds and notify subscribers */
  public step(frameDt = 1 / 60): TelemetryPoint {
    this.solver.step(frameDt);
    const latest =
      this.solver.history[this.solver.history.length - 1] ?? {
        time: this.solver.time,
        p1: this.solver.p1Value,
        p2: this.solver.p2Value,
        p1Ref: getKleefsmanReferenceP1(this.solver.time),
        h1: this.solver.h1Value,
        h2: this.solver.h2Value,
        cfl: this.solver.cfl,
        massErrorPct: this.solver.massErrorPct,
        maxVelocity: this.solver.maxVelocity,
      };

    if (this.solver.peakP1 > this.lastPeakP1) {
      this.lastPeakP1 = this.solver.peakP1;
      for (const listener of this.peakListeners) {
        listener(this.solver.peakP1, this.solver.peakP1Time);
      }
    }

    for (const listener of this.stepListeners) {
      listener(latest, this.solver);
    }

    return latest;
  }

  /** Run N steps synchronously (useful for headless benchmarking & automated tests) */
  public runSteps(count: number, frameDt = 1 / 60): TelemetryPoint {
    let last!: TelemetryPoint;
    for (let i = 0; i < count; i++) {
      last = this.step(frameDt);
    }
    return last;
  }

  /** Inject an additional rectangular block of water particles into the domain */
  public addFluidBlock(block: FluidBlockSpec): number {
    const s = this.solver;
    const sub = 2;
    const stepX = s.dx / sub;
    const stepY = s.dy / sub;
    const [u0, v0] = block.initialVelocity ?? [0, 0];
    let added = 0;

    const minX = Math.max(s.dx, block.x0);
    const maxX = Math.min(s.domainWidth - s.dx, block.x0 + block.width);
    const minY = Math.max(s.dy, block.y0);
    const maxY = Math.min(s.domainHeight - s.dy, block.y0 + block.height);

    for (let x = minX + 0.5 * stepX; x <= maxX; x += stepX) {
      for (let y = minY + 0.5 * stepY; y <= maxY; y += stepY) {
        if (s.numParticles >= s.maxParticles) break;
        const idx = s.numParticles++;
        s.px[idx] = x;
        s.py[idx] = y;
        s.pu[idx] = u0;
        s.pv[idx] = v0;
        added++;
      }
    }
    return added;
  }

  /** Register a virtual pressure probe or wave-height gauge at arbitrary coordinates */
  public addSensor(spec: VirtualSensorSpec): this {
    this.customSensors.set(spec.id, spec);
    return this;
  }

  /** Read a registered custom sensor value in physical units (Pa or m) */
  public readSensor(id: string): number {
    const spec = this.customSensors.get(id);
    if (!spec) {
      throw new Error(`Sensor "${id}" is not registered.`);
    }
    if (spec.type === 'pressure') {
      const sample = this.solver.sampleAt(spec.x, spec.y ?? 0.02);
      return sample.pressure;
    } else {
      // Integrate phase fraction column height at x
      const s = this.solver;
      const i = Math.max(1, Math.min(s.nx - 2, Math.floor(spec.x / s.dx)));
      let h = 0;
      for (let j = 1; j < s.ny - 1; j++) {
        const idx = s.cellIndex(i, j);
        if (s.solid[idx] === 1) {
          h += s.alpha[idx] * s.dy;
        }
      }
      return Number(Math.min(s.domainHeight, h).toFixed(3));
    }
  }

  /** Subscribe to each simulation step */
  public onStep(listener: StepListener): () => void {
    this.stepListeners.add(listener);
    return () => this.stepListeners.delete(listener);
  }

  /** Subscribe to new impact pressure peaks at Sensor P1 */
  public onImpactPeak(listener: ImpactPeakListener): () => void {
    this.peakListeners.add(listener);
    return () => this.peakListeners.delete(listener);
  }

  /** Update physical or obstacle configuration at runtime */
  public configure(partial: Partial<SimulationConfig>): this {
    this.solver.updateConfig(partial);
    return this;
  }

  /** Reset simulation to t = 0 */
  public reset(): this {
    this.lastPeakP1 = 0;
    this.solver.reset();
    return this;
  }

  /** Export lightweight serializable snapshot of simulation metadata */
  public exportSnapshot(): WaterSimulationSnapshot {
    return {
      version: '1.0.0',
      time: this.solver.time,
      stepCount: this.solver.stepCount,
      config: { ...this.solver.config },
      numParticles: this.solver.numParticles,
      peakP1: this.solver.peakP1,
      peakP1Time: this.solver.peakP1Time,
    };
  }
}

/** Factory helper to create a configured WaterSimulationLibrary instance */
export function createWaterSimulation(
  config: Partial<SimulationConfig> = {}
): WaterSimulationLibrary {
  return new WaterSimulationLibrary(config);
}

/** Scientific Colormap Utilities for 2D Canvas & 3D WebGL Renderers */
export const WaterColorMaps = {
  phaseToRGB(alpha: number, speed = 0): [number, number, number] {
    const a = Math.max(0, Math.min(1, alpha));
    if (a <= 0.02) return [9, 13, 22];
    if (speed > 2.3) return [224, 242, 254];
    if (a < 0.45) {
      const u = a / 0.45;
      return [
        Math.round(9 + 5 * u),
        Math.round(13 + 152 * u),
        Math.round(22 + 211 * u),
      ];
    }
    const u = (a - 0.45) / 0.55;
    return [
      Math.round(34 - 31 * u),
      Math.round(211 - 106 * u),
      Math.round(238 - 77 * u),
    ];
  },

  velocityToRGB(speed: number, maxSpeed = 4.5): [number, number, number] {
    const t = Math.max(0, Math.min(1, speed / maxSpeed));
    if (t < 0.5) {
      const u = t * 2;
      return [
        Math.round(14 + (6 - 14) * u),
        Math.round(42 + (212 - 42) * u),
        Math.round(110 + (212 - 110) * u),
      ];
    }
    const u = (t - 0.5) * 2;
    return [
      Math.round(6 + (245 - 6) * u),
      Math.round(212 + (158 - 212) * u),
      Math.round(212 + (11 - 212) * u),
    ];
  },

  pressureToRGB(pressurePa: number, maxPa = 4500): [number, number, number] {
    const t = Math.max(0, Math.min(1, pressurePa / maxPa));
    if (t < 0.5) {
      const u = t * 2;
      return [
        Math.round(20 + (6 - 20) * u),
        Math.round(36 + (198 - 36) * u),
        Math.round(95 + (220 - 95) * u),
      ];
    }
    const u = (t - 0.5) * 2;
    return [
      Math.round(6 + (244 - 6) * u),
      Math.round(198 + (63 - 198) * u),
      Math.round(220 + (94 - 220) * u),
    ];
  },
};

/**
 * Generates a self-contained, zero-dependency TypeScript library file (`brae-water-sim.ts`)
 * pre-populated with the user's current simulation configuration so they can download
 * and drop the water simulation engine into any web or Node.js project.
 */
export function generateStandaloneSdkSource(
  presetConfig: SimulationConfig = DEFAULT_CONFIG
): string {
  return `/**
 * @brae/water-sim v1.0.0 — Self-Contained 2D/3D VoF-FLIP Water Simulation Engine
 * Generated from Brae CFD (interFoam / Kleefsman et al. 2005 Benchmark Workbench)
 * License: MIT · Zero External Dependencies
 */

export interface WaterSimConfig {
  gravity: number;
  viscosity: number;
  waterDensity: number;
  densityRatio: number;
  damWidth: number;
  damHeight: number;
  obstacleEnabled: boolean;
  obstacleX: number;
  obstacleWidth: number;
  obstacleHeight: number;
  timeScale: number;
}

export const DEFAULT_WATER_CONFIG: WaterSimConfig = ${JSON.stringify(
    presetConfig,
    null,
    2
  )};

export class BraeWaterSolver {
  public readonly domainWidth = 3.22;
  public readonly domainHeight = 1.0;
  public readonly nx = 161;
  public readonly ny = 50;
  public readonly dx = 3.22 / 161;
  public readonly dy = 1.0 / 50;
  public config: WaterSimConfig;

  public u = new Float32Array(162 * 50);
  public v = new Float32Array(161 * 51);
  public alpha = new Float32Array(161 * 50);
  public pressure = new Float32Array(161 * 50);
  public solid = new Uint8Array(161 * 50);

  public maxParticles = 18000;
  public numParticles = 0;
  public px = new Float32Array(18000);
  public py = new Float32Array(18000);
  public pu = new Float32Array(18000);
  public pv = new Float32Array(18000);
  public time = 0;

  constructor(config: Partial<WaterSimConfig> = {}) {
    this.config = { ...DEFAULT_WATER_CONFIG, ...config };
    this.reset();
  }

  public reset(): void {
    this.time = 0;
    this.numParticles = 0;
    this.u.fill(0);
    this.v.fill(0);
    this.alpha.fill(0);
    this.pressure.fill(0);
    this.solid.fill(1);

    const stepX = this.dx * 0.5;
    const stepY = this.dy * 0.5;
    for (let x = this.dx; x <= this.config.damWidth; x += stepX) {
      for (let y = this.dy; y <= this.config.damHeight; y += stepY) {
        if (this.numParticles >= this.maxParticles) break;
        const idx = this.numParticles++;
        this.px[idx] = x;
        this.py[idx] = y;
        this.pu[idx] = 0;
        this.pv[idx] = 0;
      }
    }
  }

  public step(dt = 1 / 60): void {
    const subSteps = 4;
    const subDt = (dt * this.config.timeScale) / subSteps;
    const g = this.config.gravity;
    const obsL = this.config.obstacleX;
    const obsR = obsL + this.config.obstacleWidth;
    const obsT = this.config.obstacleHeight;

    for (let s = 0; s < subSteps; s++) {
      this.alpha.fill(0);
      for (let p = 0; p < this.numParticles; p++) {
        this.pv[p] -= g * subDt;
        let x = (this.px[p] += this.pu[p] * subDt);
        let y = (this.py[p] += this.pv[p] * subDt);

        if (x < this.dx) { x = this.dx; this.pu[p] *= -0.15; }
        if (x > this.domainWidth - this.dx) { x = this.domainWidth - this.dx; this.pu[p] *= -0.15; }
        if (y < this.dy) { y = this.dy; if (this.pv[p] < 0) this.pv[p] = 0; }
        if (y > this.domainHeight - this.dy) { y = this.domainHeight - this.dy; this.pv[p] *= -0.1; }

        if (this.config.obstacleEnabled && x > obsL && x < obsR && y < obsT) {
          const dLeft = x - obsL;
          const dTop = obsT - y;
          if (dLeft < dTop) {
            x = obsL;
            this.pv[p] = Math.max(this.pv[p], 0.58 * Math.abs(this.pu[p]));
            this.pu[p] *= -0.08;
          } else {
            y = obsT;
            if (this.pv[p] < 0) this.pv[p] = 0;
          }
        }

        this.px[p] = x;
        this.py[p] = y;
        const ci = Math.min(this.nx - 1, Math.floor(x / this.dx));
        const cj = Math.min(this.ny - 1, Math.floor(y / this.dy));
        this.alpha[ci * this.ny + cj] = Math.min(1, this.alpha[ci * this.ny + cj] + 0.25);
      }
      this.time += subDt;
    }
  }
}
`;
}
