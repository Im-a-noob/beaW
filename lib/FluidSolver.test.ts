import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FluidSolver,
  getKleefsmanReferenceP1,
  DEFAULT_CONFIG,
} from './FluidSolver';

test('FluidSolver initializes with Kleefsman et al. (2005) geometry and dam column', () => {
  const solver = new FluidSolver();
  assert.equal(solver.domainWidth, 3.22);
  assert.equal(solver.domainHeight, 1.0);
  assert.equal(solver.config.damWidth, DEFAULT_CONFIG.damWidth);
  assert.equal(solver.config.damHeight, DEFAULT_CONFIG.damHeight);
  assert.ok(solver.numParticles > 3000, 'Dam should contain > 3000 fluid particles');
  assert.equal(solver.time, 0);
  assert.ok(solver.h1Value > 0.45, 'Initial reservoir height gauge H1 should be ~0.55m');
  assert.equal(solver.h2Value, 0, 'Initial mid-tank gauge H2 should be 0m');
});

test('FluidSolver advances time, computes CFL, and records P1 impact spike around t = 0.41s', () => {
  const solver = new FluidSolver();
  // Step forward to t ~ 0.45s (27 frames at 60Hz)
  for (let frame = 0; frame < 28; frame++) {
    solver.step(1 / 60);
  }

  assert.ok(solver.time > 0.42, 'Simulated time should advance past 0.42s');
  assert.ok(solver.maxVelocity > 1.0, 'Fluid velocity should accelerate under gravity');
  assert.ok(solver.cfl > 0, 'CFL Courant number should be positive');
  assert.ok(solver.peakP1 > 3000, `Peak impact pressure at P1 (${solver.peakP1} Pa) should exceed 3000 Pa`);
  assert.ok(solver.history.length > 10, 'Telemetry history should record time-series points');
  assert.ok(Math.abs(solver.massErrorPct) < 0.05, 'Mass conservation error should stay < 0.05%');
});

test('FluidSolver reset restores initial state and respects updated parameters', () => {
  const solver = new FluidSolver();
  solver.step(1 / 60);
  solver.step(1 / 60);
  assert.ok(solver.time > 0);

  solver.updateConfig({ damWidth: 1.5, damHeight: 0.65, obstacleEnabled: false });
  solver.reset();

  assert.equal(solver.time, 0);
  assert.equal(solver.peakP1, 0);
  assert.equal(solver.config.obstacleEnabled, false);
  const sampleAtObstacle = solver.sampleAt(2.45, 0.08);
  assert.equal(sampleAtObstacle.isSolid, false, 'Obstacle cells should be fluid when obstacleEnabled is false');
});

test('getKleefsmanReferenceP1 matches benchmark profile', () => {
  assert.equal(getKleefsmanReferenceP1(0.1), 0);
  const peak = getKleefsmanReferenceP1(0.415);
  assert.ok(peak > 4200 && peak <= 4300, `Reference peak should be ~4285 Pa, got ${peak}`);
  const plateau = getKleefsmanReferenceP1(0.8);
  assert.ok(plateau > 900 && plateau < 2000, `Post-impact plateau should be ~1300 Pa, got ${plateau}`);
});
