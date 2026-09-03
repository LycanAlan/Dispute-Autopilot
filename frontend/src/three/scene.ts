/*
 * scene.ts
 *
 * The one Three.js scene sections 1 to 5 share. One WebGLRenderer, one
 * THREE.Points, one BufferGeometry built once from points.bin. Sections never
 * construct their own renderer; they call getScene() to reach this one and
 * only ever change its camera and its uniforms.
 *
 * World layout, fixed so every section agrees on where a point sits:
 *
 *   data x (time, 0..1)        -> world X, centred, WORLD.width wide
 *   data y (log amount, 0..1)  -> world Z, centred, WORLD.depth deep
 *   data z (p_chargeback, 0..1)-> world Y, 0 at the floor, WORLD.height tall
 *
 * Risk becomes height on purpose: tilting the camera down at it in section 4
 * is what turns the flat cloud into a landscape.
 */
import * as THREE from 'three';

import type { PointCloud } from '../core/data';
import { readPalette } from './colors';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import type { Vec3 } from './util';

export const WORLD = {
  width: 13,
  depth: 8,
  height: 5.5,
} as const;

/** The fixed data -> world mapping every scene section renders against. */
export function toWorld(x: number, y: number, z: number): Vec3 {
  return [(x - 0.5) * WORLD.width, z * WORLD.height, (y - 0.5) * WORLD.depth];
}

export interface CameraState {
  position: Vec3;
  lookAt: Vec3;
  fov?: number;
}

export interface CloudUniforms {
  materialize?: number;
  labelMix?: number;
  riskMix?: number;
  collapse?: number;
  collapseTarget?: Vec3;
  pointSize?: number;
  opacity?: number;
}

export interface SweepState {
  /** World X of each plane. */
  ax: number;
  bx: number;
  /** 0..1 opacity for each plane, independent so one can lead the other in. */
  aOpacity: number;
  bOpacity: number;
}

const BASE_POINT_SIZE = 6.4;

export class SceneController {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private readonly planeA: THREE.Mesh;
  private readonly planeB: THREE.Mesh;
  private readonly raw: Float32Array;
  private readonly stride: number;
  readonly count: number;

  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frame = 0;
  private running = false;

  constructor(cloud: PointCloud) {
    this.raw = cloud.data;
    this.stride = cloud.stride;
    this.count = cloud.count;

    const palette = readPalette();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scene-canvas';

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      // Without this, the browser is free to clear the drawing buffer the
      // instant a frame is presented, ahead of the next render(). A live
      // display recomposites fast enough that this is invisible; an
      // external screenshot tool sampling the canvas asynchronously (as
      // ?still=1 filming does, and as headless verification does) can land
      // on that just-cleared, empty buffer instead of the last drawn frame.
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(palette.charcoal, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 2, 16);
    this.camera.lookAt(0, 1, 0);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);
    const labels = new Float32Array(this.count);
    const risks = new Float32Array(this.count);

    for (let i = 0; i < this.count; i += 1) {
      const o = i * this.stride;
      const x = this.raw[o] ?? 0;
      const y = this.raw[o + 1] ?? 0;
      const z = this.raw[o + 2] ?? 0;
      const label = this.raw[o + 3] ?? 0;
      const world = toWorld(x, y, z);
      const p = i * 3;
      positions[p] = world[0];
      positions[p + 1] = world[1];
      positions[p + 2] = world[2];
      labels[i] = label;
      risks[i] = z;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aLabel', new THREE.BufferAttribute(labels, 1));
    geometry.setAttribute('aRisk', new THREE.BufferAttribute(risks, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uMaterialize: { value: 0 },
        uLabelMix: { value: 0 },
        uRiskMix: { value: 0 },
        uCollapse: { value: 0 },
        uCollapseTarget: { value: new THREE.Vector3(0, 0, 0) },
        uPointSize: { value: BASE_POINT_SIZE },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uOpacity: { value: 0.92 },
        uColorNeutral: { value: palette.bone.clone() },
        uColorFraud: { value: palette.accept.clone() },
        uColorLow: { value: palette.contest.clone() },
        uColorMid: { value: palette.review.clone() },
        uColorHigh: { value: palette.accept.clone() },
      },
    });

    this.points = new THREE.Points(geometry, this.material);
    this.scene.add(this.points);

    // A thin ribbon, not rotated to face along X: every camera angle used in
    // sections 3 to 5 looks mostly down -Z, and a plane whose normal is X
    // sits edge on to that view and all but disappears. Facing the plane at
    // the camera instead, as a narrow vertical bar at the boundary's world
    // X, reads clearly as a marker without needing a camera rewrite.
    const planeGeo = new THREE.PlaneGeometry(0.14, WORLD.height * 1.4);
    const planeMatA = new THREE.MeshBasicMaterial({
      color: palette.bone,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const planeMatB = planeMatA.clone();
    this.planeA = new THREE.Mesh(planeGeo, planeMatA);
    this.planeB = new THREE.Mesh(planeGeo, planeMatB);
    this.planeA.position.y = (WORLD.height * 1.4) / 2 - WORLD.height * 0.15;
    this.planeB.position.y = this.planeA.position.y;
    this.scene.add(this.planeA, this.planeB);
  }

  /** Moves the shared canvas into `container` if it is not already there. */
  claim(container: HTMLElement): void {
    if (this.container === container) return;
    this.container = container;
    container.appendChild(this.canvas);
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private resize(): void {
    if (!this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamera(state: CameraState): void {
    this.camera.position.set(state.position[0], state.position[1], state.position[2]);
    this.camera.lookAt(state.lookAt[0], state.lookAt[1], state.lookAt[2]);
    if (state.fov !== undefined && state.fov !== this.camera.fov) {
      this.camera.fov = state.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setUniforms(state: CloudUniforms): void {
    const u = this.material.uniforms;
    if (state.materialize !== undefined) u['uMaterialize'].value = state.materialize;
    if (state.labelMix !== undefined) u['uLabelMix'].value = state.labelMix;
    if (state.riskMix !== undefined) u['uRiskMix'].value = state.riskMix;
    if (state.collapse !== undefined) u['uCollapse'].value = state.collapse;
    if (state.collapseTarget !== undefined) {
      const t = state.collapseTarget;
      (u['uCollapseTarget'].value as THREE.Vector3).set(t[0], t[1], t[2]);
    }
    if (state.pointSize !== undefined) u['uPointSize'].value = state.pointSize;
    if (state.opacity !== undefined) u['uOpacity'].value = state.opacity;
  }

  setSweep(state: SweepState): void {
    this.planeA.position.x = state.ax;
    this.planeB.position.x = state.bx;
    (this.planeA.material as THREE.MeshBasicMaterial).opacity = state.aOpacity * 0.16;
    (this.planeB.material as THREE.MeshBasicMaterial).opacity = state.bOpacity * 0.16;
  }

  /** Renders one frame right now, without waiting for the internal loop. */
  renderNow(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Starts the internal render loop. Safe to call more than once. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = (): void => {
      if (!this.running) return;
      this.renderNow();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }
}

let singleton: SceneController | null = null;
let singletonFailed = false;

/**
 * Gets or creates the shared scene. Returns null if WebGL could not be
 * created at all, which a section treats exactly like ?flat=1: draw the
 * canvas fallback instead of leaving the section blank.
 */
export function getScene(cloud: PointCloud): SceneController | null {
  if (singleton) return singleton;
  if (singletonFailed) return null;
  try {
    singleton = new SceneController(cloud);
    singleton.start();
    return singleton;
  } catch (err) {
    singletonFailed = true;
    console.error('[three] could not create the shared scene, falling back to flat:', err);
    return null;
  }
}
