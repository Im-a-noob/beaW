import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWaterSimulation,
  WaterColorMaps,
  generateStandaloneSdkSource,
} from './index';

test('@brae/water-sim creates simulation, runs steps, and fires onStep / onImpactPeak hooks', () => {
  const sim = createWaterSimulation({ damWidth: 1.228, damHeight: 0.55 });
  let stepCount = 0;
  let peakDetected = 0;

  const unsubStep = sim.onStep(() => {
    stepCount++;
  });
  const unsubPeak = sim.onImpactPeak((peak) => {
    peakDetected = peak;
  });

  const lastTelemetry = sim.runSteps(28, 1 / 60);
  assert.equal(stepCount, 28);
  assert.ok(lastTelemetry.time > 0.42);
  assert.ok(peakDetected > 3000, `Expected impact peak > 3000 Pa, got ${peakDetected}`);

  unsubStep();
  unsubPeak();
});

test('@brae/water-sim supports custom fluid blocks, custom virtual sensors, and snapshots', () => {
  const sim = createWaterSimulation();
  const initialParticles = sim.solver.numParticles;

  const added = sim.addFluidBlock({
    x0: 1.5,
    y0: 0.4,
    width: 0.2,
    height: 0.2,
    initialVelocity: [1.2, 0],
  });
  assert.ok(added > 50, 'addFluidBlock should inject new Lagrangian particles');
  assert.equal(sim.solver.numParticles, initialParticles + added);

  sim.addSensor({ id: 'mid_wave', type: 'wave_height', x: 0.5 });
  const h = sim.readSensor('mid_wave');
  assert.ok(h > 0.45 && h <= 0.6, `Expected reservoir wave height ~0.55m, got ${h}`);

  const snap = sim.exportSnapshot();
  assert.equal(snap.version, '1.0.0');
  assert.equal(snap.numParticles, sim.solver.numParticles);
});

test('@brae/water-sim colormaps and standalone SDK bundle generator return valid output', () => {
  const [r, g, b] = WaterColorMaps.phaseToRGB(0.8, 0.5);
  assert.ok(r >= 0 && g > 100 && b > 150);

  const sdkCode = generateStandaloneSdkSource();
  assert.ok(sdkCode.includes('export class BraeWaterSolver'));
  assert.ok(sdkCode.includes('DEFAULT_WATER_CONFIG'));
});
