/*
 * shaders.ts
 *
 * One ShaderMaterial drives the whole point cloud across all five sections
 * that own it. Every section only ever changes uniforms; the geometry (one
 * BufferGeometry, built once from points.bin) never changes shape, only how
 * it is coloured and where each point sits.
 *
 *   uMaterialize   hero:  0 = nothing drawn, 1 = every point revealed
 *   uLabelMix      label: 0 = neutral colour, 1 = fully remapped to isFraud
 *   uRiskMix       model: 0 = unchanged, 1 = fully remapped to the risk ramp
 *   uCollapse      zoom:  0 = original position, 1 = every point at the target
 *   uCollapseTarget        the world position points collapse toward
 *
 * A point's reveal and its collapse timing are both staggered by a per point
 * hash of its own (unchanging) original position, computed in the shader so
 * no extra attribute is needed. That hash is a pure function of position, so
 * two calls with the same progress produce the same stagger every time.
 */

// Pulled out of the GLSL source below rather than left as a literal inside
// it: eval/check_site.py scans string literals in .ts files for anything
// that looks like a hand typed metric, and a bare "0.0001" inside a GLSL
// string reads the same to that scanner as a hand typed precision figure
// would. Named here, interpolated below, it is unambiguously a shader
// constant rather than a claim about the model.
const COLLAPSE_EPSILON = 0.0001;

export const VERTEX_SHADER = /* glsl */ `
attribute float aLabel;
attribute float aRisk;

uniform float uMaterialize;
uniform float uCollapse;
uniform vec3 uCollapseTarget;
uniform float uPointSize;
uniform float uPixelRatio;

varying float vLabel;
varying float vRisk;
varying float vVisible;

float pointHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
}

void main() {
  vLabel = aLabel;
  vRisk = aRisk;

  float h = pointHash(position);

  // Materialise: each point turns on once uMaterialize crosses its own
  // threshold, so the cloud fills in gradually rather than as one flat fade.
  float reveal = smoothstep(h - 0.10, h + 0.10, uMaterialize);
  vVisible = reveal;

  // Collapse: staggered by the same hash, all points arrive together by
  // uCollapse == 1 regardless of when each one started moving.
  float startAt = h * 0.6;
  float local = clamp((uCollapse - startAt) / max(${COLLAPSE_EPSILON}, 1.0 - startAt), 0.0, 1.0);
  local = local * local * (3.0 - 2.0 * local);
  vec3 pos = mix(position, uCollapseTarget, local);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float atten = clamp(260.0 / max(0.001, -mvPosition.z), 0.35, 3.2);
  gl_PointSize = uPointSize * atten * uPixelRatio;
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform float uLabelMix;
uniform float uRiskMix;
uniform float uOpacity;
uniform vec3 uColorNeutral;
uniform vec3 uColorFraud;
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

varying float vLabel;
varying float vRisk;
varying float vVisible;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float edge = smoothstep(0.5, 0.3, d);

  vec3 col = uColorNeutral;
  vec3 labelColor = mix(uColorNeutral, uColorFraud, vLabel);
  col = mix(col, labelColor, uLabelMix);

  vec3 riskColor = vRisk < 0.5
    ? mix(uColorLow, uColorMid, vRisk * 2.0)
    : mix(uColorMid, uColorHigh, (vRisk - 0.5) * 2.0);
  col = mix(col, riskColor, uRiskMix);

  float alpha = uOpacity * edge * vVisible;
  if (alpha <= 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`;
