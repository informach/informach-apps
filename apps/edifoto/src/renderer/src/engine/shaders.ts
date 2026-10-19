/**
 * GLSL for the compositor. Every pass draws one full-screen triangle into a document-sized
 * target. Texture space equals image space: row 0 / v = 0 is the TOP of the image, so render
 * targets can be read back without flipping. Only the display pass flips for the screen.
 */

export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** Blend math: W3C compositing formulas plus the Photoshop-only modes. Indices follow BLEND_MODES. */
const BLEND_FUNCS = `
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / max(l - n, 1e-6);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(x - l, 1e-6);
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float sat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 setSat(vec3 c, float s) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  return mx > mn ? (c - mn) * s / (mx - mn) : vec3(0.0);
}

float burn(float b, float s) { return b >= 1.0 ? 1.0 : (s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s)); }
float dodge(float b, float s) { return b <= 0.0 ? 0.0 : (s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s))); }
float hardL(float b, float s) { return s <= 0.5 ? b * 2.0 * s : b + (2.0 * s - 1.0) - b * (2.0 * s - 1.0); }
float softL(float b, float s) {
  if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b);
  float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b);
  return b + (2.0 * s - 1.0) * (d - b);
}
float vivid(float b, float s) { return s <= 0.5 ? burn(b, 2.0 * s) : dodge(b, 2.0 * (s - 0.5)); }
float pinL(float b, float s) { return s <= 0.5 ? min(b, 2.0 * s) : max(b, 2.0 * s - 1.0); }
float divideF(float b, float s) { return s <= 0.0 ? (b > 0.0 ? 1.0 : 0.0) : min(1.0, b / s); }

vec3 blend(int m, vec3 b, vec3 s) {
  if (m == 2) return min(b, s);
  if (m == 3) return b * s;
  if (m == 4) return vec3(burn(b.r, s.r), burn(b.g, s.g), burn(b.b, s.b));
  if (m == 5) return max(b + s - 1.0, 0.0);
  if (m == 6) return (s.r + s.g + s.b) < (b.r + b.g + b.b) ? s : b;
  if (m == 7) return max(b, s);
  if (m == 8) return b + s - b * s;
  if (m == 9) return vec3(dodge(b.r, s.r), dodge(b.g, s.g), dodge(b.b, s.b));
  if (m == 10) return min(b + s, 1.0);
  if (m == 11) return (s.r + s.g + s.b) > (b.r + b.g + b.b) ? s : b;
  if (m == 12) return vec3(hardL(s.r, b.r), hardL(s.g, b.g), hardL(s.b, b.b));
  if (m == 13) return vec3(softL(b.r, s.r), softL(b.g, s.g), softL(b.b, s.b));
  if (m == 14) return vec3(hardL(b.r, s.r), hardL(b.g, s.g), hardL(b.b, s.b));
  if (m == 15) return vec3(vivid(b.r, s.r), vivid(b.g, s.g), vivid(b.b, s.b));
  if (m == 16) return clamp(b + 2.0 * s - 1.0, 0.0, 1.0);
  if (m == 17) return vec3(pinL(b.r, s.r), pinL(b.g, s.g), pinL(b.b, s.b));
  // Photoshop's rule on 8-bit values (b + s >= 255), tolerant to float rounding at the edge.
  if (m == 18) return step(1.0 - 0.5 / 255.0, b + s);
  if (m == 19) return abs(b - s);
  if (m == 20) return b + s - 2.0 * b * s;
  if (m == 21) return max(b - s, 0.0);
  if (m == 22) return vec3(divideF(b.r, s.r), divideF(b.g, s.g), divideF(b.b, s.b));
  if (m == 23) return setLum(setSat(s, sat(b)), lum(b));
  if (m == 24) return setLum(setSat(b, sat(s)), lum(b));
  if (m == 25) return setLum(s, lum(b));
  if (m == 26) return setLum(b, lum(s));
  return s;
}
`;

/** Light and color corrections, in the order a photographer would apply them. */
const ADJUST_FUNCS = `
uniform float uCurve[5];
float curve(float v) { float x=clamp(v,0.0,1.0)*4.0; int i=min(3,int(floor(x))); return mix(uCurve[i],uCurve[i+1],x-float(i)); }
uniform vec3 uLvlBlack;
uniform vec3 uLvlWhite;
uniform float uLvlGamma;
uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemp;
uniform float uTint;
uniform float uVibrance;
uniform float uSaturation;
uniform float uHue;
uniform bool uGray;
uniform bool uInvert;

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

vec3 adjust(vec3 c) {
  c = clamp((c - uLvlBlack) / max(uLvlWhite - uLvlBlack, 1e-4), 0.0, 1.0);
  c = pow(c, vec3(1.0 / uLvlGamma));
  c = vec3(curve(c.r),curve(c.g),curve(c.b));
  if (uExposure != 0.0 || uTemp != 0.0 || uTint != 0.0) {
    vec3 l = toLinear(c) * exp2(uExposure);
    l *= vec3(1.0 + uTemp * 0.25, 1.0 - uTint * 0.2, 1.0 - uTemp * 0.25);
    c = clamp(toSrgb(l), 0.0, 1.0);
  }
  if (uBrightness != 0.0) c = pow(c, vec3(exp2(-uBrightness)));
  if (uContrast != 0.0) {
    float f = uContrast >= 0.0 ? 1.0 + uContrast * 1.5 : 1.0 + uContrast;
    c = clamp((c - 0.5) * f + 0.5, 0.0, 1.0);
  }
  if (uShadows != 0.0 || uHighlights != 0.0) {
    float l = lum(c);
    float d = uShadows * 0.45 * pow(1.0 - l, 2.0) + uHighlights * 0.45 * pow(l, 2.0);
    float nl = clamp(l + d, 0.0, 1.0);
    c = l > 0.002 ? clamp(c * (nl / l), 0.0, 1.0) : clamp(c + d, 0.0, 1.0);
  }
  if (uHue != 0.0) {
    float a = radians(uHue);
    float cs = cos(a), sn = sin(a);
    vec3 k = vec3(0.57735);
    c = clamp(c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs), 0.0, 1.0);
  }
  if (uVibrance != 0.0 || uSaturation != 0.0) {
    float l = lum(c);
    float amount = 1.0 + uSaturation + uVibrance * (1.0 - sat(c)) * (uVibrance > 0.0 ? 1.0 : 0.6);
    c = clamp(mix(vec3(l), c, max(amount, 0.0)), 0.0, 1.0);
  }
  if (uGray) c = vec3(lum(c));
  if (uInvert) c = 1.0 - c;
  return c;
}
`;

/**
 * One layer composited onto the backdrop. The source is a texture (image/text placed with an
 * inverse transform), a solid color, a gradient computed here, or — for adjustment layers —
 * the backdrop itself run through adjust().
 */
export const LAYER_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uBackdrop;
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform mat3 uToMask;
uniform vec2 uTarget;
uniform vec2 uDoc;
uniform int uKind;
uniform int uMode;
uniform float uAlpha;
uniform bool uHasMask;
uniform mat3 uToLayer;
uniform vec4 uColor;
uniform int uStops;
uniform vec4 uStopColor[8];
uniform float uStopPos[8];
uniform vec2 uG0;
uniform vec2 uG1;
${BLEND_FUNCS}
${ADJUST_FUNCS}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec4 gradientAt(float t) {
  t = clamp(t, 0.0, 1.0);
  vec4 c = uStopColor[0];
  for (int i = 1; i < 8; i++) {
    if (i >= uStops) break;
    float p0 = uStopPos[i - 1];
    float p1 = uStopPos[i];
    if (t >= p0) c = p1 > p0 ? mix(uStopColor[i - 1], uStopColor[i], clamp((t - p0) / (p1 - p0), 0.0, 1.0)) : uStopColor[i];
  }
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec2 p = uv * uDoc;
  vec4 cb = texelFetch(uBackdrop, ivec2(gl_FragCoord.xy), 0);
  vec2 maskUv = (uToMask * vec3(p, 1.0)).xy;
  float m = uHasMask ? ((maskUv.x < 0.0 || maskUv.y < 0.0 || maskUv.x > 1.0 || maskUv.y > 1.0) ? 0.0 : texture(uMask, maskUv).r) : 1.0;

  if (uKind == 4) {
    if (cb.a <= 0.0) { outColor = cb; return; }
    vec3 a = adjust(cb.rgb);
    float as = uAlpha * m;
    vec3 r = (uMode <= 1) ? a : blend(uMode, cb.rgb, a);
    outColor = vec4(mix(cb.rgb, r, as), cb.a);
    return;
  }

  vec4 s;
  if (uKind == 0) {
    vec2 q = (uToLayer * vec3(p, 1.0)).xy;
    s = (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? vec4(0.0) : texture(uSrc, q);
  } else if (uKind == 1) {
    s = uColor;
  } else if (uKind == 2) {
    vec2 d = uG1 - uG0;
    s = gradientAt(dot(p - uG0, d) / max(dot(d, d), 1e-6));
  } else {
    s = gradientAt(length(p - uG0) / max(uG1.x, 1e-6));
  }

  float as = s.a * uAlpha * m;
  int mode = uMode;
  if (mode == 1) { as = hash(floor(p)) < as ? 1.0 : 0.0; mode = 0; }
  vec3 bc = mode == 0 ? s.rgb : blend(mode, cb.rgb, s.rgb);
  vec3 cs = (1.0 - cb.a) * s.rgb + cb.a * bc;
  float ao = as + cb.a * (1.0 - as);
  vec3 co = as * cs + cb.a * (1.0 - as) * cb.rgb;
  outColor = ao > 0.0 ? vec4(co / ao, ao) : vec4(0.0);
}`;

/** Clears a target to transparent (or copies nothing): used to start the stack. */
export const CLEAR_FS = `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }`;

/** Draws the composite on screen: pan/zoom, checkerboard behind transparency, workspace around it. */
export const DISPLAY_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uImage;
uniform vec2 uCanvas;
uniform vec2 uPan;
uniform float uZoom;
uniform vec2 uDoc;
uniform vec3 uBg;
uniform float uDpr;
void main() {
  vec2 sp = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 dp = (sp - uPan) / uZoom;
  if (dp.x < 0.0 || dp.y < 0.0 || dp.x >= uDoc.x || dp.y >= uDoc.y) { outColor = vec4(uBg, 1.0); return; }
  vec4 c = texture(uImage, dp / uDoc);
  vec2 cell = floor(sp / (8.0 * uDpr));
  float chk = mod(cell.x + cell.y, 2.0) < 1.0 ? 0.92 : 0.78;
  outColor = vec4(mix(vec3(chk), c.rgb, c.a), 1.0);
}`;
