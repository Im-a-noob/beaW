'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FluidSolver, ProbeSample } from '@/lib/FluidSolver';
import {
  Crosshair,
  Eye,
  Sparkles,
  Compass,
  Box,
  Layers,
  Camera,
} from 'lucide-react';

export type RenderMode = 'phase' | 'velocity' | 'pressure';
export type CameraPreset = 'isometric' | 'impact' | 'side' | 'top';

interface SimulationCanvasProps {
  solverRef: React.MutableRefObject<FluidSolver>;
  isRunning: boolean;
  renderMode: RenderMode;
  onRenderModeChange: (mode: RenderMode) => void;
  showVectors: boolean;
  onToggleVectors: () => void;
  showParticles: boolean;
  onToggleParticles: () => void;
  showSensors: boolean;
  onToggleSensors: () => void;
  onTelemetryTick: (fps: number) => void;
}

// Pre-allocated module-scope scratch objects (Zero GC in render loop)
const _dummy = new THREE.Object3D();
const _vecDummy = new THREE.Object3D();
const _color = new THREE.Color();
const _dirVec = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function velocityColorRGB(speed: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, speed / 4.5));
  if (t < 0.25) {
    const u = t / 0.25;
    return [lerp(14, 28, u), lerp(42, 118, u), lerp(110, 235, u)];
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    return [lerp(28, 6, u), lerp(118, 212, u), lerp(235, 212, u)];
  } else if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    return [lerp(6, 245, u), lerp(212, 158, u), lerp(212, 11, u)];
  } else {
    const u = (t - 0.75) / 0.25;
    return [lerp(245, 255, u), lerp(158, 245, u), lerp(11, 220, u)];
  }
}

function pressureColorRGB(p: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, p / 4500));
  if (t < 0.25) {
    const u = t / 0.25;
    return [lerp(20, 37, u), lerp(36, 99, u), lerp(95, 235, u)];
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    return [lerp(37, 6, u), lerp(99, 198, u), lerp(235, 220, u)];
  } else if (t < 0.78) {
    const u = (t - 0.5) / 0.28;
    return [lerp(6, 245, u), lerp(198, 158, u), lerp(220, 11, u)];
  } else {
    const u = (t - 0.78) / 0.22;
    return [lerp(245, 244, u), lerp(158, 63, u), lerp(11, 94, u)];
  }
}

function createCalibrationFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0D1322';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle minor grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Major meter markings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    const meterStep = canvas.width / 3.22;
    for (let m = 0; m <= 3; m++) {
      const px = m * meterStep;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export default function SimulationCanvas({
  solverRef,
  isRunning,
  renderMode,
  onRenderModeChange,
  showVectors,
  onToggleVectors,
  showParticles,
  onToggleParticles,
  showSensors,
  onToggleSensors,
  onTelemetryTick,
}: SimulationCanvasProps) {
  const [viewDimension, setViewDimension] = useState<'3d' | '2d'>('3d');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [probe, setProbe] = useState<ProbeSample | null>(null);

  const webglMountRef = useRef<HTMLDivElement | null>(null);
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);

  // Refs for loop access without re-mounting WebGLRenderer
  const isRunningRef = useRef(isRunning);
  const renderModeRef = useRef(renderMode);
  const showVectorsRef = useRef(showVectors);
  const showParticlesRef = useRef(showParticles);
  const showSensorsRef = useRef(showSensors);
  const viewDimensionRef = useRef(viewDimension);
  const cameraPresetRef = useRef<CameraPreset | null>(null);
  const onTelemetryTickRef = useRef(onTelemetryTick);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    renderModeRef.current = renderMode;
  }, [renderMode]);

  useEffect(() => {
    showVectorsRef.current = showVectors;
  }, [showVectors]);

  useEffect(() => {
    showParticlesRef.current = showParticles;
  }, [showParticles]);

  useEffect(() => {
    showSensorsRef.current = showSensors;
  }, [showSensors]);

  useEffect(() => {
    viewDimensionRef.current = viewDimension;
  }, [viewDimension]);

  useEffect(() => {
    onTelemetryTickRef.current = onTelemetryTick;
  }, [onTelemetryTick]);

  const handleSelectCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    cameraPresetRef.current = preset;
  };

  // Mount Three.js 3D Scene + 2D Fallback Canvas Loop once
  useEffect(() => {
    const mountEl = webglMountRef.current;
    if (!mountEl) return;

    const solver = solverRef.current;
    const tankL = solver.domainWidth; // 3.22 m
    const tankH = solver.domainHeight; // 1.00 m
    const tankD = 0.96; // 0.96 m spanwise 3D depth
    const centerX = tankL * 0.5; // 1.61 m

    // 1. Detect Software WebGL (SwiftShader / llvmpipe) per threejs skill
    const isSoftwareGl = (() => {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initW = mountEl.clientWidth || 920;
    const initH = mountEl.clientHeight || 355;
    renderer.setSize(initW, initH);
    renderer.domElement.setAttribute('data-testid', 'cfd-3d-webgl-canvas');
    renderer.domElement.className = 'w-full h-full block cursor-grab active:cursor-grabbing';
    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    // 2. Scene, Fog & Studio RoomEnvironment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.065);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // 3. Camera & OrbitControls (Framed closely on the 3.22m MARIN wave tank)
    const camera = new THREE.PerspectiveCamera(35, initW / initH, 0.05, 35);
    camera.position.set(1.68, 1.08, 2.28);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(centerX, 0.36, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 0.5;
    controls.maxDistance = 7.0;
    controls.update();

    controls.addEventListener('start', () => {
      cameraPresetRef.current = null;
    });

    // 4. Studio 3-Point Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.95);
    hemiLight.position.set(centerX, 4.0, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.4);
    keyLight.position.set(2.8, 3.8, 2.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    keyLight.shadow.camera.left = -2.2;
    keyLight.shadow.camera.right = 2.2;
    keyLight.shadow.camera.top = 1.6;
    keyLight.shadow.camera.bottom = -1.6;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.3);
    rimLight.position.set(-1.2, 2.2, -2.5);
    scene.add(rimLight);

    // 5. Composite Multi-Part MARIN Experimental Wave Tank Assembly (THREE.Group)
    const tankGroup = new THREE.Group();
    scene.add(tankGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const floorTex = createCalibrationFloorTexture(maxAniso);

    // Part 1: Heavy Steel Laboratory Base Plinth
    const plinthGeo = new THREE.BoxGeometry(tankL + 0.14, 0.055, tankD + 0.14);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.78,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.set(centerX, -0.03, 0);
    plinthMesh.receiveShadow = true;
    tankGroup.add(plinthMesh);

    // Part 2: Calibrated Floor Coordinate Deck (offset +0.003 on Y to avoid Z-fighting)
    const floorDeckGeo = new THREE.PlaneGeometry(tankL, tankD);
    const floorDeckMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTex,
      roughness: 0.65,
      metalness: 0.2,
    });
    const floorDeckMesh = new THREE.Mesh(floorDeckGeo, floorDeckMat);
    floorDeckMesh.rotation.x = -Math.PI / 2;
    floorDeckMesh.position.set(centerX, 0.003, 0);
    floorDeckMesh.receiveShadow = true;
    tankGroup.add(floorDeckMesh);

    // Part 3: Structural Anodized Aluminum Vertical Stanchions (6 columns)
    const columnGeo = new THREE.BoxGeometry(0.032, tankH + 0.04, 0.032);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.28,
      metalness: 0.85,
    });
    const colXPositions = [0, centerX, tankL];
    const colZPositions = [-tankD * 0.5 - 0.016, tankD * 0.5 + 0.016];
    for (const cx of colXPositions) {
      for (const cz of colZPositions) {
        const col = new THREE.Mesh(columnGeo, frameMat);
        col.position.set(cx, tankH * 0.5, cz);
        tankGroup.add(col);
      }
    }

    // Part 4: Top Longitudinal Tie-Rails
    const topRailGeo = new THREE.BoxGeometry(tankL + 0.06, 0.024, 0.026);
    for (const cz of colZPositions) {
      const rail = new THREE.Mesh(topRailGeo, frameMat);
      rail.position.set(centerX, tankH + 0.012, cz);
      tankGroup.add(rail);
    }

    // Part 5: Transparent Acrylic Observation Tank Wireframe & Back Wall
    const glassWallGeo = new THREE.BoxGeometry(tankL, tankH, tankD);
    const glassEdges = new THREE.EdgesGeometry(glassWallGeo);
    const glassEdgeLines = new THREE.LineSegments(
      glassEdges,
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.4,
      })
    );
    glassEdgeLines.position.set(centerX, tankH * 0.5, 0);
    tankGroup.add(glassEdgeLines);

    const backGlassGeo = new THREE.PlaneGeometry(tankL, tankH);
    const backGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const backGlass = new THREE.Mesh(backGlassGeo, backGlassMat);
    backGlass.position.set(centerX, tankH * 0.5, -tankD * 0.5);
    tankGroup.add(backGlass);

    // Part 6: Dam Release Gate Gantry at x = damWidth
    const damGateGroup = new THREE.Group();
    const gatePostGeo = new THREE.BoxGeometry(0.02, tankH + 0.1, 0.02);
    const gateBeamGeo = new THREE.BoxGeometry(0.028, 0.028, tankD + 0.06);
    const gateMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.75,
    });
    const postFront = new THREE.Mesh(gatePostGeo, gateMat);
    postFront.position.set(0, (tankH + 0.1) * 0.5, tankD * 0.5 + 0.018);
    const postBack = new THREE.Mesh(gatePostGeo, gateMat);
    postBack.position.set(0, (tankH + 0.1) * 0.5, -tankD * 0.5 - 0.018);
    const topCrossbar = new THREE.Mesh(gateBeamGeo, gateMat);
    topCrossbar.position.set(0, tankH + 0.09, 0);
    damGateGroup.add(postFront, postBack, topCrossbar);
    damGateGroup.position.set(solver.config.damWidth, 0, 0);
    tankGroup.add(damGateGroup);

    // 6. Composite 6-Part Obstacle & Pressure Transducer Assembly (THREE.Group)
    const obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);

    const obsHullGeo = new THREE.BoxGeometry(1, 1, 0.44);
    const obsHullMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.68,
    });
    const obsHullMesh = new THREE.Mesh(obsHullGeo, obsHullMat);
    obsHullMesh.position.set(0.5, 0.5, 0);
    obsHullMesh.castShadow = !isSoftwareGl;
    obsHullMesh.receiveShadow = true;
    obstacleGroup.add(obsHullMesh);

    const obsCapGeo = new THREE.BoxGeometry(1.02, 0.06, 0.46);
    const obsCapMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.65,
      metalness: 0.35,
    });
    const obsCapMesh = new THREE.Mesh(obsCapGeo, obsCapMat);
    obsCapMesh.position.set(0.5, 0.99, 0);
    obstacleGroup.add(obsCapMesh);

    const obsFlangeGeo = new THREE.BoxGeometry(1.08, 0.04, 0.5);
    const obsFlangeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.25,
    });
    const obsFlangeMesh = new THREE.Mesh(obsFlangeGeo, obsFlangeMat);
    obsFlangeMesh.position.set(0.5, 0.02, 0);
    obstacleGroup.add(obsFlangeMesh);

    const sensorPortGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.022, 16);
    sensorPortGeo.rotateZ(Math.PI / 2);
    const p1Mat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.5,
    });
    const p2Mat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.5,
    });
    const p1Mesh = new THREE.Mesh(sensorPortGeo, p1Mat);
    const p2Mesh = new THREE.Mesh(sensorPortGeo, p2Mat);
    scene.add(p1Mesh, p2Mesh);

    // 7. Wave Height Gauges H1 (x=0.582m) & H2 (x=1.732m) Assembly
    const gaugesGroup = new THREE.Group();
    scene.add(gaugesGroup);

    const probeRodGeo = new THREE.CylinderGeometry(0.006, 0.006, tankH, 8);
    const probeRodMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.2,
      metalness: 0.9,
    });
    const h1Rod = new THREE.Mesh(probeRodGeo, probeRodMat);
    h1Rod.position.set(solver.h1X, tankH * 0.5, 0);
    const h2Rod = new THREE.Mesh(probeRodGeo, probeRodMat);
    h2Rod.position.set(solver.h2X, tankH * 0.5, 0);

    const ringGeo = new THREE.TorusGeometry(0.03, 0.007, 8, 20);
    ringGeo.rotateX(Math.PI / 2);
    const h1RingMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const h2RingMat = new THREE.MeshStandardMaterial({
      color: 0xa78bfa,
      emissive: 0xa78bfa,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const h1Ring = new THREE.Mesh(ringGeo, h1RingMat);
    const h2Ring = new THREE.Mesh(ringGeo, h2RingMat);
    gaugesGroup.add(h1Rod, h2Rod, h1Ring, h2Ring);

    // 8. 3D Continuous Extruded Free-Surface Water Volume Ribbon + Front Wall Liquid Cross-Section
    const nx = solver.nx;
    const nzSlices = 12;
    const waterRibbonGeo = new THREE.PlaneGeometry(
      tankL,
      tankD * 0.94,
      nx - 1,
      nzSlices - 1
    );
    waterRibbonGeo.rotateX(-Math.PI / 2);
    const ribbonCount = waterRibbonGeo.attributes.position.count;
    const ribbonColors = new Float32Array(ribbonCount * 3);
    waterRibbonGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(ribbonColors, 3)
    );

    const waterSurfaceMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.16,
      metalness: 0.15,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });
    const waterSurfaceMesh = new THREE.Mesh(waterRibbonGeo, waterSurfaceMat);
    waterSurfaceMesh.position.set(centerX, 0, 0);
    scene.add(waterSurfaceMesh);

    // Front Sidewall Water Cross-Section Curtain (gives solid 3D aquarium volume look)
    const frontWallWaterGeo = new THREE.PlaneGeometry(tankL, tankH, nx - 1, 1);
    const fwCount = frontWallWaterGeo.attributes.position.count;
    const fwColors = new Float32Array(fwCount * 3);
    frontWallWaterGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(fwColors, 3)
    );
    const frontWallWaterMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const frontWallWaterMesh = new THREE.Mesh(
      frontWallWaterGeo,
      frontWallWaterMat
    );
    frontWallWaterMesh.position.set(centerX, 0, tankD * 0.47);
    scene.add(frontWallWaterMesh);

    // 9. 3D Volumetric Fluid Particles (THREE.InstancedMesh — Low-poly Icosahedron for fast software/GPU rendering)
    const max3dParticles = 1850;
    const sphereGeo = new THREE.IcosahedronGeometry(0.022, 0);
    const particleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.08,
    });
    const particleInstanced = new THREE.InstancedMesh(
      sphereGeo,
      particleMat,
      max3dParticles
    );
    particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particleInstanced.frustumCulled = false;
    for (let i = 0; i < max3dParticles; i++) {
      particleInstanced.setColorAt(i, _color.setHex(0x0284c7));
    }
    scene.add(particleInstanced);

    // 10. 3D Velocity Vector Glyphs (THREE.InstancedMesh of Cones)
    const maxVectors = 360;
    const coneGeo = new THREE.ConeGeometry(0.015, 0.07, 6);
    const vectorMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.45,
      roughness: 0.3,
    });
    const vectorInstanced = new THREE.InstancedMesh(
      coneGeo,
      vectorMat,
      maxVectors
    );
    vectorInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    vectorInstanced.frustumCulled = false;
    scene.add(vectorInstanced);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Offscreen 2D canvas for 2D Slice Mode
    const offCanvas2d = document.createElement('canvas');
    offCanvas2d.width = solver.nx;
    offCanvas2d.height = solver.ny;
    const offCtx2d = offCanvas2d.getContext('2d');
    const imgData2d = offCtx2d
      ? offCtx2d.createImageData(solver.nx, solver.ny)
      : null;

    const colHeights = new Float32Array(nx);
    const colSpeeds = new Float32Array(nx);
    const colPressures = new Float32Array(nx);

    function syncSceneFromSolver(s: FluidSolver) {
      damGateGroup.position.x = s.config.damWidth;

      obstacleGroup.visible = s.config.obstacleEnabled;
      if (s.config.obstacleEnabled) {
        obstacleGroup.position.set(s.config.obstacleX, 0, 0);
        obstacleGroup.scale.set(
          s.config.obstacleWidth,
          s.config.obstacleHeight,
          1
        );
      }

      const sensorsVis = showSensorsRef.current;
      gaugesGroup.visible = sensorsVis;
      p1Mesh.visible = sensorsVis && s.config.obstacleEnabled;
      p2Mesh.visible = sensorsVis && s.config.obstacleEnabled;

      if (sensorsVis) {
        h1Ring.position.set(s.h1X, Math.max(0.02, s.h1Value), 0);
        h2Ring.position.set(s.h2X, Math.max(0.02, s.h2Value), 0);

        if (s.config.obstacleEnabled) {
          const p1Y = Math.min(s.config.obstacleHeight * 0.22, 0.028);
          const p2Y = Math.min(s.config.obstacleHeight * 0.72, 0.105);
          p1Mesh.position.set(s.config.obstacleX - 0.008, p1Y, 0);
          p2Mesh.position.set(s.config.obstacleX - 0.008, p2Y, 0);

          const isSpike = s.p1Value > 800;
          p1Mat.color.setHex(isSpike ? 0xf59e0b : 0x06b6d4);
          p1Mat.emissive.setHex(isSpike ? 0xf59e0b : 0x06b6d4);
          p1Mat.emissiveIntensity = isSpike ? 1.8 : 0.9;
        }
      }

      const mode = renderModeRef.current;
      for (let i = 0; i < nx; i++) {
        let maxH = 0;
        let maxSpd = 0;
        let maxP = 0;
        for (let j = s.ny - 2; j >= 1; j--) {
          const idx = s.cellIndex(i, j);
          const a = s.smoothAlpha[idx];
          if (a > 0.2 && maxH === 0) {
            maxH = (j + 0.5) * s.dy;
          }
          if (a > 0.1) {
            if (s.cellSpeed[idx] > maxSpd) maxSpd = s.cellSpeed[idx];
            if (s.pressure[idx] > maxP) maxP = s.pressure[idx];
          }
        }
        colHeights[i] = maxH;
        colSpeeds[i] = maxSpd;
        colPressures[i] = maxP;
      }

      // Update Top Water Surface Ribbon & Front Sidewall Curtain
      const posAttr = waterRibbonGeo.attributes.position as THREE.BufferAttribute;
      const colAttr = waterRibbonGeo.attributes.color as THREE.BufferAttribute;
      const fwPos = frontWallWaterGeo.attributes.position as THREE.BufferAttribute;
      const fwCol = frontWallWaterGeo.attributes.color as THREE.BufferAttribute;

      for (let ix = 0; ix < nx; ix++) {
        let hSmooth = colHeights[ix];
        if (ix > 0 && ix < nx - 1) {
          hSmooth =
            0.25 * colHeights[ix - 1] + 0.5 * hSmooth + 0.25 * colHeights[ix + 1];
        }

        if (mode === 'phase') {
          const crest = Math.min(1, colSpeeds[ix] / 3.5);
          _color.setRGB(
            lerp(0.01, 0.18, crest),
            lerp(0.42, 0.82, crest),
            lerp(0.76, 0.96, crest)
          );
        } else if (mode === 'velocity') {
          const [r, g, b] = velocityColorRGB(colSpeeds[ix]);
          _color.setRGB(r / 255, g / 255, b / 255);
        } else {
          const [r, g, b] = pressureColorRGB(colPressures[ix]);
          _color.setRGB(r / 255, g / 255, b / 255);
        }

        // Front wall curtain (row 0 = top surface, row 1 = bottom floor y=0.004)
        const topV = ix;
        const botV = nx + ix;
        fwPos.setY(topV, Math.max(0.004, hSmooth));
        fwPos.setY(botV, 0.004);
        fwCol.setXYZ(topV, _color.r, _color.g, _color.b);
        fwCol.setXYZ(botV, _color.r * 0.55, _color.g * 0.55, _color.b * 0.65);

        for (let iz = 0; iz < nzSlices; iz++) {
          const vIdx = iz * nx + ix;
          const zNorm = iz / (nzSlices - 1) - 0.5;
          const zWorld = zNorm * tankD * 0.94;
          const xWorld = (ix / (nx - 1)) * tankL;
          let h = hSmooth;

          if (
            s.config.obstacleEnabled &&
            xWorld >= s.config.obstacleX - 0.15 &&
            xWorld <= s.config.obstacleX + s.config.obstacleWidth + 0.35 &&
            h > 0.02
          ) {
            const centerFactor = Math.exp(-Math.pow(zWorld / 0.22, 2));
            const ripple =
              0.035 *
              centerFactor *
              Math.cos(zWorld * 14.0 - s.time * 9.0) *
              Math.min(1, colSpeeds[ix] / 2.0);
            h = Math.max(0.005, h + ripple);
          }

          posAttr.setY(vIdx, h > 0.015 ? h : -0.02);
          colAttr.setXYZ(vIdx, _color.r, _color.g, _color.b);
        }
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      waterRibbonGeo.computeVertexNormals();
      fwPos.needsUpdate = true;
      fwCol.needsUpdate = true;

      // Update 3D Volumetric Fluid Particles
      particleInstanced.visible = showParticlesRef.current;
      if (showParticlesRef.current) {
        let instIdx = 0;
        const zLayers = [-0.34, -0.11, 0.11, 0.34];
        const pStep = Math.max(
          1,
          Math.ceil((s.numParticles * zLayers.length) / max3dParticles)
        );

        for (let p = 0; p < s.numParticles && instIdx < max3dParticles; p++) {
          const px = s.px[p];
          const py = s.py[p];
          const pu = s.pu[p];
          const pv = s.pv[p];
          const speed = Math.sqrt(pu * pu + pv * pv);

          for (let lz = 0; lz < zLayers.length; lz++) {
            if ((p * zLayers.length + lz) % pStep !== 0) continue;
            if (instIdx >= max3dParticles) break;

            const hash = Math.sin(p * 12.9898 + lz * 78.233) * 43758.5453;
            const frac = hash - Math.floor(hash);
            let pz = zLayers[lz] + (frac - 0.5) * 0.18;

            if (
              s.config.obstacleEnabled &&
              px > s.config.obstacleX - 0.08 &&
              px < s.config.obstacleX + s.config.obstacleWidth + 0.25 &&
              Math.abs(pz) < 0.24
            ) {
              pz += (pz >= 0 ? 1 : -1) * 0.045 * Math.min(1, speed / 2.5);
            }

            _dummy.position.set(px, py, pz);
            const scale = 0.85 + 0.3 * frac + Math.min(0.3, speed * 0.05);
            _dummy.scale.setScalar(scale);
            _dummy.updateMatrix();
            particleInstanced.setMatrixAt(instIdx, _dummy.matrix);

            if (mode === 'phase') {
              if (speed > 2.3) {
                _color.setRGB(0.65, 0.92, 0.99);
              } else if (speed > 1.1) {
                _color.setRGB(0.08, 0.72, 0.95);
              } else {
                _color.setRGB(0.01, 0.42, 0.78);
              }
            } else if (mode === 'velocity') {
              const [r, g, b] = velocityColorRGB(speed);
              _color.setRGB(r / 255, g / 255, b / 255);
            } else {
              const ci = Math.max(0, Math.min(s.nx - 1, Math.floor(px / s.dx)));
              const cj = Math.max(0, Math.min(s.ny - 1, Math.floor(py / s.dy)));
              const cellP = s.pressure[s.cellIndex(ci, cj)];
              const [r, g, b] = pressureColorRGB(cellP);
              _color.setRGB(r / 255, g / 255, b / 255);
            }
            particleInstanced.setColorAt(instIdx, _color);
            instIdx++;
          }
        }
        particleInstanced.count = instIdx;
        particleInstanced.instanceMatrix.needsUpdate = true;
        if (particleInstanced.instanceColor) {
          particleInstanced.instanceColor.needsUpdate = true;
        }
      }

      // Update 3D Velocity Vector Arrows
      vectorInstanced.visible = showVectorsRef.current;
      if (showVectorsRef.current) {
        let vCount = 0;
        const zPlanes = [-0.2, 0.2];
        for (let i = 3; i < s.nx - 3; i += 6) {
          for (let j = 2; j < s.ny - 2; j += 4) {
            const cIdx = s.cellIndex(i, j);
            if (s.smoothAlpha[cIdx] < 0.15) continue;
            const u = s.cellU[cIdx];
            const v = s.cellV[cIdx];
            const spd = Math.sqrt(u * u + v * v);
            if (spd < 0.1) continue;

            for (const zp of zPlanes) {
              if (vCount >= maxVectors) break;
              _vecDummy.position.set(
                (i + 0.5) * s.dx,
                (j + 0.5) * s.dy,
                zp
              );
              _dirVec.set(u, v, 0).normalize();
              _vecDummy.quaternion.setFromUnitVectors(_upVec, _dirVec);
              const sScale = Math.min(1.6, 0.55 + spd * 0.28);
              _vecDummy.scale.set(1, sScale, 1);
              _vecDummy.updateMatrix();
              vectorInstanced.setMatrixAt(vCount++, _vecDummy.matrix);
            }
          }
        }
        vectorInstanced.count = vCount;
        vectorInstanced.instanceMatrix.needsUpdate = true;
      }
    }

    // Perform an immediate initial sync and render so the canvas is never blank on mount
    syncSceneFromSolver(solver);
    renderer.render(scene, camera);

    // Software-WebGL Paced Loop Helper (`afterDraw`) from threejs skill
    let frameId = 0;
    let lastTime = performance.now();
    let lastHudSync = performance.now();
    let smoothedFps = 60;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        let polls = 0;
        const poll = () => {
          polls++;
          gl.flush();
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED && polls < 6) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 45);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 45);
      }
    }

    function render2dSlice(s: FluidSolver) {
      const canvas = canvas2dRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const padLeft = 48;
      const padRight = 24;
      const padTop = 24;
      const padBottom = 30;
      const plotW = W - padLeft - padRight;
      const plotH = H - padTop - padBottom;

      ctx.fillStyle = '#07090E';
      ctx.fillRect(0, 0, W, H);

      if (offCtx2d && imgData2d) {
        const data = imgData2d.data;
        const mode = renderModeRef.current;
        for (let i = 0; i < s.nx; i++) {
          for (let j = 0; j < s.ny; j++) {
            const cIdx = s.cellIndex(i, j);
            const py = s.ny - 1 - j;
            const pIdx = (py * s.nx + i) * 4;
            if (s.solid[cIdx] === 0) {
              data[pIdx] = 17;
              data[pIdx + 1] = 24;
              data[pIdx + 2] = 39;
              data[pIdx + 3] = 255;
              continue;
            }
            const alpha = s.smoothAlpha[cIdx];
            if (alpha <= 0.02) {
              data[pIdx] = 9;
              data[pIdx + 1] = 13;
              data[pIdx + 2] = 22;
              data[pIdx + 3] = 255;
              continue;
            }
            if (mode === 'phase') {
              const [r, g, b] =
                alpha < 0.45
                  ? [14, 165, 233]
                  : [
                      lerp(34, 3, (alpha - 0.45) / 0.55),
                      lerp(211, 105, (alpha - 0.45) / 0.55),
                      lerp(238, 161, (alpha - 0.45) / 0.55),
                    ];
              data[pIdx] = r;
              data[pIdx + 1] = g;
              data[pIdx + 2] = b;
              data[pIdx + 3] = 255;
            } else if (mode === 'velocity') {
              const [r, g, b] = velocityColorRGB(s.cellSpeed[cIdx]);
              data[pIdx] = r;
              data[pIdx + 1] = g;
              data[pIdx + 2] = b;
              data[pIdx + 3] = 255;
            } else {
              const [r, g, b] = pressureColorRGB(s.pressure[cIdx]);
              data[pIdx] = r;
              data[pIdx + 1] = g;
              data[pIdx + 2] = b;
              data[pIdx + 3] = 255;
            }
          }
        }
        offCtx2d.putImageData(imgData2d, 0, 0);
        ctx.drawImage(offCanvas2d, padLeft, padTop, plotW, plotH);
      }

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(padLeft, padTop, plotW, plotH);
    }

    function tick() {
      const now = performance.now();
      const dtMs = Math.max(1, now - lastTime);
      lastTime = now;
      const deltaSec = Math.min(0.12, dtMs / 1000);
      smoothedFps = 0.9 * smoothedFps + 0.1 * Math.min(120, 1000 / dtMs);

      const s = solverRef.current;
      if (isRunningRef.current) {
        // Advance physics proportional to elapsed wall-clock time so software WebGL & 60Hz GPUs progress at real-time speed
        const stepsToRun = isSoftwareGl
          ? Math.max(1, Math.min(4, Math.round(deltaSec * 45)))
          : 1;
        for (let k = 0; k < stepsToRun; k++) {
          s.step(1 / 60);
        }
      }

      if (now - lastHudSync >= 90) {
        lastHudSync = now;
        onTelemetryTickRef.current(Math.round(smoothedFps));
      }

      if (viewDimensionRef.current === '2d') {
        render2dSlice(s);
        frameId = requestAnimationFrame(tick);
        return;
      }

      // Smooth Camera Preset Transitions via THREE.MathUtils.damp
      const activePreset = cameraPresetRef.current;
      if (activePreset) {
        if (activePreset === 'isometric') {
          _camTargetPos.set(1.68, 1.08, 2.28);
          _camTargetLook.set(centerX, 0.36, 0);
        } else if (activePreset === 'impact') {
          _camTargetPos.set(s.config.obstacleX - 0.58, 0.52, 0.95);
          _camTargetLook.set(s.config.obstacleX + 0.05, 0.18, 0);
        } else if (activePreset === 'side') {
          _camTargetPos.set(centerX, 0.48, 2.65);
          _camTargetLook.set(centerX, 0.42, 0);
        } else if (activePreset === 'top') {
          _camTargetPos.set(centerX, 3.15, 0.01);
          _camTargetLook.set(centerX, 0.0, 0);
        }

        const dampFactor = 8.0;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          _camTargetPos.x,
          dampFactor,
          deltaSec
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          _camTargetPos.y,
          dampFactor,
          deltaSec
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          _camTargetPos.z,
          dampFactor,
          deltaSec
        );
        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          _camTargetLook.x,
          dampFactor,
          deltaSec
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          _camTargetLook.y,
          dampFactor,
          deltaSec
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          _camTargetLook.z,
          dampFactor,
          deltaSec
        );

        if (camera.position.distanceToSquared(_camTargetPos) < 0.0005) {
          cameraPresetRef.current = null;
        }
      }

      controls.update();
      syncSceneFromSolver(s);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    const handleResize = () => {
      if (!mountEl) return;
      const w = mountEl.clientWidth || 920;
      const h = mountEl.clientHeight || 355;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      // Immediately re-render after setSize so the WebGL buffer is never blank
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      floorTex.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      floorDeckGeo.dispose();
      floorDeckMat.dispose();
      columnGeo.dispose();
      frameMat.dispose();
      waterRibbonGeo.dispose();
      waterSurfaceMat.dispose();
      frontWallWaterGeo.dispose();
      frontWallWaterMat.dispose();
      sphereGeo.dispose();
      particleMat.dispose();
      coneGeo.dispose();
      vectorMat.dispose();
      renderer.dispose();
    };
  }, [solverRef]);

  const handlePointerProbe = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    const s = solverRef.current;
    setProbe(s.sampleAt(relX * s.domainWidth, relY * s.domainHeight));
  };

  return (
    <div className="flex flex-col bg-[#0B0E17] border border-slate-800 rounded-md overflow-hidden">
      {/* Viewport Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#0F1420] border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* 3D Volumetric vs 2D Slice Switcher */}
          <div className="flex items-center gap-0.5 bg-[#07090E] p-0.5 rounded border border-slate-800">
            <button
              type="button"
              onClick={() => setViewDimension('3d')}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                viewDimension === '3d'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box className="w-3 h-3" />
              <span>3D Volumetric</span>
            </button>
            <button
              type="button"
              onClick={() => setViewDimension('2d')}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                viewDimension === '2d'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>2D Slice</span>
            </button>
          </div>

          {/* Render Mode Segmented Selector */}
          <div className="flex items-center gap-1 bg-[#07090E] p-0.5 rounded border border-slate-800/80">
            <button
              type="button"
              onClick={() => onRenderModeChange('phase')}
              className={`px-2 py-1 text-[11px] font-mono transition-colors rounded whitespace-nowrap shrink-0 ${
                renderMode === 'phase'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Phase (α)
            </button>
            <button
              type="button"
              onClick={() => onRenderModeChange('velocity')}
              className={`px-2 py-1 text-[11px] font-mono transition-colors rounded whitespace-nowrap shrink-0 ${
                renderMode === 'velocity'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Velocity (|U|)
            </button>
            <button
              type="button"
              onClick={() => onRenderModeChange('pressure')}
              className={`px-2 py-1 text-[11px] font-mono transition-colors rounded whitespace-nowrap shrink-0 ${
                renderMode === 'pressure'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pressure (p)
            </button>
          </div>
        </div>

        {/* Camera Presets & Layer Visibility Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {viewDimension === '3d' && (
            <div className="flex items-center gap-1 bg-[#07090E] p-0.5 rounded border border-slate-800 mr-1">
              <Camera className="w-3 h-3 text-slate-400 ml-1.5" />
              {(
                [
                  { id: 'isometric', label: 'Orbit 3D' },
                  { id: 'impact', label: 'P1 Impact' },
                  { id: 'side', label: 'Profile' },
                  { id: 'top', label: 'Top' },
                ] as { id: CameraPreset; label: string }[]
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => handleSelectCameraPreset(cam.id)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === cam.id
                      ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleVectors}
            aria-pressed={showVectors}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              showVectors
                ? 'bg-slate-800 text-cyan-300 border-cyan-500/40'
                : 'bg-[#07090E] text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3 h-3" />
            <span>Vectors</span>
          </button>
          <button
            type="button"
            onClick={onToggleParticles}
            aria-pressed={showParticles}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              showParticles
                ? 'bg-slate-800 text-cyan-300 border-cyan-500/40'
                : 'bg-[#07090E] text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Particles</span>
          </button>
          <button
            type="button"
            onClick={onToggleSensors}
            aria-pressed={showSensors}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              showSensors
                ? 'bg-slate-800 text-cyan-300 border-cyan-500/40'
                : 'bg-[#07090E] text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Sensors</span>
          </button>
        </div>
      </div>

      {/* Main 3D WebGL / 2D Slice Viewport Stage */}
      <div
        className="relative w-full aspect-[16/5.6] min-h-[245px] bg-[#07090E]"
        onMouseMove={handlePointerProbe}
        onMouseLeave={() => setProbe(null)}
      >
        {/* Isolated WebGL Mount Container (never torn down by React HUD updates) */}
        <div
          ref={webglMountRef}
          className={`w-full h-full ${viewDimension === '3d' ? 'block' : 'hidden'}`}
        />

        {/* 2D Slice Fallback Canvas */}
        <canvas
          ref={canvas2dRef}
          width={980}
          height={340}
          className={`w-full h-full cursor-crosshair ${
            viewDimension === '2d' ? 'block' : 'hidden'
          }`}
        />

        {/* Top-Left 3D Controls Hint Badge (No backdrop-blur over WebGL) */}
        {viewDimension === '3d' && (
          <div className="pointer-events-none absolute top-2.5 left-3.5 bg-[#0B0E17]/95 border border-slate-800 px-2.5 py-1 rounded text-[10px] font-mono text-slate-300 flex items-center gap-2">
            <span className="text-cyan-400 font-semibold">3D MARIN TANK</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">
              Drag to Orbit · Scroll to Zoom · Right-Drag to Pan
            </span>
          </div>
        )}

        {/* Continuous Color Scale Legend Overlay (Solid rgba background, zero backdrop-blur) */}
        <div className="pointer-events-none absolute top-2.5 right-4 bg-[#0B0E17]/95 border border-slate-800 px-2.5 py-1 rounded flex items-center gap-2.5 text-[10px] font-mono text-slate-300">
          {renderMode === 'phase' && (
            <>
              <span className="text-slate-400">α Phase:</span>
              <span className="text-slate-500">0.0 (Air)</span>
              <div className="w-20 h-2 rounded-xs bg-gradient-to-r from-[#090D16] via-[#22D3EE] to-[#0369A1]" />
              <span className="text-cyan-300">1.0 (Water)</span>
            </>
          )}
          {renderMode === 'velocity' && (
            <>
              <span className="text-slate-400">|U| Speed:</span>
              <span className="text-slate-500">0.0</span>
              <div className="w-20 h-2 rounded-xs bg-gradient-to-r from-[#0A1226] via-[#06B6D4] to-[#F59E0B]" />
              <span className="text-amber-300">4.5 m/s</span>
            </>
          )}
          {renderMode === 'pressure' && (
            <>
              <span className="text-slate-400">p Pressure:</span>
              <span className="text-slate-500">0</span>
              <div className="w-20 h-2 rounded-xs bg-gradient-to-r from-[#0C1020] via-[#06B6D4] via-[#F59E0B] to-[#F43F5E]" />
              <span className="text-rose-400">4500 Pa</span>
            </>
          )}
        </div>
      </div>

      {/* Dedicated Non-Overlapping Probe & Mesh Status Bar Below Canvas */}
      <div className="px-3.5 py-1.5 bg-[#0F1420] border-t border-slate-800/90 text-[11px] font-mono text-slate-300 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          {probe ? (
            <div className="flex items-center gap-3 tabular-nums">
              <span>
                Probe (x={probe.x.toFixed(2)}m, y={probe.y.toFixed(2)}m)
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-cyan-300">α = {probe.alpha.toFixed(2)}</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-300">
                |U| = {probe.speed.toFixed(2)} m/s ({probe.u.toFixed(2)}, {probe.v.toFixed(2)})
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300">p = {probe.pressure} Pa</span>
            </div>
          ) : (
            <span className="text-slate-400">
              3D Domain: 3.22m × 1.00m × 0.96m · 161 × 50 VoF-FLIP Grid + 3D Instanced Particles · Hover tank to inspect fields
            </span>
          )}
        </div>
        <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
          P1 @ (2.395m, 0.021m)
        </span>
      </div>
    </div>
  );
}
