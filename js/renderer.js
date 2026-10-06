/*
 * Black Hole Simulator — GPU renderer (WebGL 2).
 *
 * Pipeline per frame:
 *   1. scene pass   — one ray per pixel is traced backwards from the camera
 *                     through curved spacetime (RK4 on the same ray equation
 *                     as physics.js). Rays that cross the disk plane pick up
 *                     redshifted blackbody light; rays that escape sample a
 *                     procedural star field. Output is linear HDR (RGBA16F).
 *   2. bloom        — bright pass + three blurred mip levels.
 *   3. composite    — exposure, ACES tone mapping, sRGB, vignette, dither.
 */
(function (root) {
  'use strict';

  const VERT = `#version 300 es
  void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const SCENE = `#version 300 es
  precision highp float;
  uniform vec2  uRes;
  uniform vec3  uCamPos;
  uniform mat3  uCamRot;        // columns: right, up, forward
  uniform float uTanHalfFov;
  uniform float uTime;
  uniform float uDiskIn, uDiskOut, uTPeak;
  uniform int   uMaxSteps;
  uniform float uStepK;
  uniform float uGravity;       // 1 = curved rays, 0 = straight rays
  uniform bool  uShowDisk, uDoppler, uGravRedshift, uShowStars;
  uniform float uStarBright;
  uniform sampler2D uBB;        // blackbody chromaticity LUT
  uniform float uLogTMin, uLogTMax;
  out vec4 frag;

  // ---- hashing / noise -------------------------------------------------------
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                   mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                   mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  vec3 blackbody(float T) {
    float x = clamp((log(T) - uLogTMin) / (uLogTMax - uLogTMin), 0.0, 1.0);
    return texture(uBB, vec2(x, 0.5)).rgb;
  }

  // ---- background sky --------------------------------------------------------
  // d: escaped direction for this pixel. jx, jy: how d changes per pixel
  // (screen-space derivatives). Lensing can stretch the pixel's footprint on
  // the sky a lot, so each star is drawn in *pixel* space: find where the star
  // sits relative to this pixel, draw a ~1 px dot, and scale its flux by the
  // lensing magnification (nominal pixel area / footprint area).
  vec3 sky(vec3 d, vec3 jx, vec3 jy, float pix) {
    if (!uShowStars) return vec3(0.0);
    vec3 col = vec3(0.0);
    float a = dot(jx, jx), b = dot(jx, jy), c = dot(jy, jy);
    float det = a * c - b * b;
    float area = sqrt(max(det, 0.0));
    float mu = clamp(pix * pix / max(area, 1e-12), 0.0, 25.0);
    for (int l = 0; l < 3; l++) {
      float scale = 90.0 * pow(2.2, float(l));
      vec3 id = floor(d * scale);
      float h = hash13(id + float(l) * 41.0);
      if (h > 0.95 && det > 1e-20) {
        vec3 star = normalize(id + 0.5 + (hash33(id) - 0.5) * 0.7);
        vec3 delta = star - d;
        float r1 = dot(jx, delta), r2 = dot(jy, delta);
        vec2 px = vec2(c * r1 - b * r2, a * r2 - b * r1) / det;   // offset in pixels
        float mag = pow((h - 0.95) / 0.05, 10.0) * 2.0 / (1.0 + float(l)) + 0.015;
        float T = mix(3000.0, 14000.0, hash13(id * 1.7 + 3.0));
        col += blackbody(T) * mag * mu * exp(-dot(px, px) / (2.0 * 0.55 * 0.55));
      }
    }
    // A faint galactic band.
    vec3 n = normalize(vec3(0.25, 1.0, 0.35));
    float band = exp(-pow(dot(d, n) * 4.0, 2.0));
    float neb = fbm(d * 6.0) * fbm(d * 13.0 + 4.0);
    col += band * neb * vec3(0.50, 0.46, 0.48) * 0.16;
    col += band * fbm(d * 30.0) * 0.025 * vec3(0.9, 0.88, 0.95);
    return col * uStarBright;
  }

  // ---- the ray equation: a = -3 M h^2 x / r^5 (M = 1) -----------------------
  vec3 accel(vec3 x, float h2) {
    float r2 = dot(x, x);
    return -3.0 * h2 * x / (r2 * r2 * sqrt(r2));
  }

  // ---- accretion disk --------------------------------------------------------
  float diskTemp(float r) {   // normalised so the hottest ring is 1
    float rp = uDiskIn * 49.0 / 36.0;
    float f  = pow(pow(r, -3.0) * max(1.0 - sqrt(uDiskIn / r), 0.0), 0.25);
    float fp = pow(pow(rp, -3.0) * (1.0 - sqrt(uDiskIn / rp)), 0.25);
    return f / fp;
  }

  // Light (rgb) and opacity (a) of the disk where the ray crosses it.
  vec4 shadeDisk(vec3 hit, float L, float camFactor) {
    float r = length(hit.xz);
    float om = sqrt(1.0 / (r * r * r));
    // Frequency shift g = nu_obs / nu_emit (see physics.js redshiftFactor).
    float g = 1.0;
    if (uDoppler && uGravRedshift)      g = sqrt(1.0 - 3.0 / r) / (1.0 - om * L) / camFactor;
    else if (uGravRedshift)             g = sqrt(1.0 - 2.0 / r) / camFactor;
    else if (uDoppler)                  g = sqrt(1.0 - 1.0 / r) / (1.0 - om * L);

    // Turbulent, differentially rotating texture.
    float phi = atan(-hit.z, hit.x) - om * uTime;
    vec3 q = vec3(cos(phi) * 2.6, sin(phi) * 2.6, r * 0.9);
    float dens = fbm(q + vec3(0.0, 0.0, 0.0)) * 1.15;
    dens = mix(dens, fbm(vec3(cos(phi) * 7.0, sin(phi) * 7.0, r * 2.4)), 0.35);
    float edgeIn  = smoothstep(uDiskIn, uDiskIn + 0.6, r);
    float edgeOut = 1.0 - smoothstep(uDiskOut * 0.6, uDiskOut, r);
    float a = clamp((dens - 0.2) * 1.6, 0.0, 0.97) * edgeIn * edgeOut;

    float Tn = diskTemp(r);
    float Tobs = uTPeak * Tn * g;
    float I = pow(Tn * g, 4.0) * 0.8;
    return vec4(blackbody(max(Tobs, 900.0)) * I * (0.35 + 0.65 * dens), a);
  }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float pix = 2.0 * uTanHalfFov / uRes.y;          // angular size of a pixel
    vec3 dir = normalize(uCamRot * vec3(p * 2.0 * uTanHalfFov, 1.0));
    vec3 pos = uCamPos;
    vec3 hv = cross(pos, dir);
    float h2 = dot(hv, hv) * uGravity;
    float L = -hv.y;                                  // photon travels along -dir
    float rCam = length(uCamPos);
    float camFactor = sqrt(max(1.0 - 2.0 / rCam, 1e-4));
    float rEsc = max(rCam * 1.3, uDiskOut * 1.5);

    vec3 vel = dir;
    vec3 col = vec3(0.0);
    float trans = 1.0;                                // remaining transmittance
    bool escaped = false;

    for (int i = 0; i < 2000; i++) {
      if (i >= uMaxSteps) break;
      float r = length(pos);
      if (r < 2.0) break;                             // crossed the horizon
      if (r > rEsc && dot(pos, vel) > 0.0) { escaped = true; break; }
      float dt = uStepK * r * clamp((r - 2.0) * 0.5, 0.08, 1.0);

      // RK4
      vec3 k1v = accel(pos, h2),                   k1x = vel;
      vec3 k2v = accel(pos + 0.5 * dt * k1x, h2),  k2x = vel + 0.5 * dt * k1v;
      vec3 k3v = accel(pos + 0.5 * dt * k2x, h2),  k3x = vel + 0.5 * dt * k2v;
      vec3 k4v = accel(pos + dt * k3x, h2),        k4x = vel + dt * k3v;
      vec3 np = pos + dt / 6.0 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
      vel    += dt / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

      if (uShowDisk && pos.y * np.y < 0.0) {
        vec3 hit = mix(pos, np, pos.y / (pos.y - np.y));
        float rh = length(hit.xz);
        if (rh > uDiskIn && rh < uDiskOut) {
          vec4 d = shadeDisk(hit, L, camFactor);
          col += trans * d.a * d.rgb;
          trans *= 1.0 - d.a;
          if (trans < 0.01) break;
        }
      }
      pos = np;
    }
    // Derivatives are taken outside any branch so they are well defined.
    vec3 dOut = normalize(vel);
    vec3 jx = dFdx(dOut), jy = dFdy(dOut);
    if (escaped) col += trans * sky(dOut, jx, jy, pix);
    frag = vec4(col, 1.0);
  }`;

  const BRIGHT = `#version 300 es
  precision highp float;
  uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThreshold;
  out vec4 frag;
  void main() {
    vec2 uv = gl_FragCoord.xy * uTexel;
    vec3 c = texture(uSrc, uv).rgb;
    float l = max(c.r, max(c.g, c.b));
    float k = smoothstep(uThreshold, uThreshold * 2.5 + 0.01, l);
    frag = vec4(c * k, 1.0);
  }`;

  const DOWN = `#version 300 es
  precision highp float;
  uniform sampler2D uSrc; uniform vec2 uTexel;  // texel of destination
  out vec4 frag;
  void main() { frag = texture(uSrc, gl_FragCoord.xy * uTexel); }`;

  const BLUR = `#version 300 es
  precision highp float;
  uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uDir;
  out vec4 frag;
  void main() {
    vec2 uv = gl_FragCoord.xy * uTexel;
    // 9-tap Gaussian using linear filtering (5 fetches).
    vec3 c = texture(uSrc, uv).rgb * 0.2270270;
    c += texture(uSrc, uv + uDir * uTexel * 1.3846).rgb * 0.3162162;
    c += texture(uSrc, uv - uDir * uTexel * 1.3846).rgb * 0.3162162;
    c += texture(uSrc, uv + uDir * uTexel * 3.2308).rgb * 0.0702703;
    c += texture(uSrc, uv - uDir * uTexel * 3.2308).rgb * 0.0702703;
    frag = vec4(c, 1.0);
  }`;

  const COMPOSITE = `#version 300 es
  precision highp float;
  uniform sampler2D uScene, uB1, uB2, uB3;
  uniform vec2 uRes;
  uniform float uExposure, uBloom;
  out vec4 frag;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  vec3 srgb(vec3 c) { return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 c = texture(uScene, uv).rgb;
    vec3 b = texture(uB1, uv).rgb * 0.25 + texture(uB2, uv).rgb * 0.35 + texture(uB3, uv).rgb * 0.5;
    c = (c + b * uBloom) * uExposure;
    c = srgb(aces(c));
    vec2 v = uv - 0.5;
    c *= 1.0 - 0.35 * dot(v, v);
    c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    frag = vec4(c, 1.0);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(gl, fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { p, u: uniforms };
  }

  function makeTarget(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  class BlackHoleRenderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL 2 is not available in this browser.');
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This GPU cannot render to floating-point textures (EXT_color_buffer_float).');
      this.gl = gl;
      this.canvas = canvas;
      this.scene = program(gl, SCENE);
      this.bright = program(gl, BRIGHT);
      this.down = program(gl, DOWN);
      this.blur = program(gl, BLUR);
      this.comp = program(gl, COMPOSITE);
      this.vao = gl.createVertexArray();

      // Blackbody lookup table (256×1, RGBA16F).
      const n = 256;
      const lut = root.BH.blackbodyLUT(n);
      const half = new Uint16Array(lut.length);
      for (let i = 0; i < lut.length; i++) half[i] = toHalf(lut[i]);
      this.lut = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.lut);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, n, 1, 0, gl.RGBA, gl.HALF_FLOAT, half);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.targets = null;
      this.size = [0, 0, 0];
    }

    resize(width, height, scale) {
      const key = [width, height, scale].join();
      if (this.size.join() === key) return;
      this.size = [width, height, scale];
      const gl = this.gl;
      if (this.targets) for (const t of Object.values(this.targets)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
      this.canvas.width = width;
      this.canvas.height = height;
      const sw = Math.max(1, Math.round(width * scale)), sh = Math.max(1, Math.round(height * scale));
      const mk = (d) => [makeTarget(gl, Math.max(1, sw >> d), Math.max(1, sh >> d)), makeTarget(gl, Math.max(1, sw >> d), Math.max(1, sh >> d))];
      const [b1a, b1b] = mk(1), [b2a, b2b] = mk(2), [b3a, b3b] = mk(3);
      this.targets = { scene: makeTarget(gl, sw, sh), b1a, b1b, b2a, b2b, b3a, b3b };
    }

    pass(prog, target, uniforms, textures) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
      let unit = 0;
      for (const [name, tex] of Object.entries(textures || {})) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(prog.u[name], unit++);
      }
      for (const [name, v] of Object.entries(uniforms)) {
        const loc = prog.u[name];
        if (loc == null) continue;
        if (typeof v === 'boolean') gl.uniform1i(loc, v ? 1 : 0);
        else if (typeof v === 'number') (name === 'uMaxSteps' ? gl.uniform1i(loc, v) : gl.uniform1f(loc, v));
        else if (v.length === 2) gl.uniform2fv(loc, v);
        else if (v.length === 3) gl.uniform3fv(loc, v);
        else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
      }
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /*
     * cam: { pos:[x,y,z], rot: Float32Array(9) column-major, fov (radians) }
     * s:   settings object (see settings.js)
     */
    render(cam, s, time) {
      const T = this.targets, BH = root.BH;
      this.pass(this.scene, T.scene, {
        uRes: [T.scene.w, T.scene.h],
        uCamPos: cam.pos, uCamRot: cam.rot, uTanHalfFov: Math.tan(cam.fov / 2),
        uTime: time,
        uDiskIn: s.diskInner, uDiskOut: s.diskOuter, uTPeak: s.diskTemperature,
        uMaxSteps: s.maxSteps, uStepK: s.stepSize,
        uGravity: s.lensing ? 1 : 0,
        uShowDisk: s.showDisk, uDoppler: s.doppler, uGravRedshift: s.gravRedshift,
        uShowStars: s.showStars, uStarBright: s.starBrightness,
        uLogTMin: Math.log(BH.LUT_T_MIN), uLogTMax: Math.log(BH.LUT_T_MAX),
      }, { uBB: this.lut });

      const tx = (t) => [1 / t.w, 1 / t.h];
      if (s.bloom > 0) {
        this.pass(this.bright, T.b1a, { uTexel: tx(T.b1a), uThreshold: 0.6 }, { uSrc: T.scene.tex });
        this.pass(this.blur, T.b1b, { uTexel: tx(T.b1b), uDir: [1, 0] }, { uSrc: T.b1a.tex });
        this.pass(this.blur, T.b1a, { uTexel: tx(T.b1a), uDir: [0, 1] }, { uSrc: T.b1b.tex });
        this.pass(this.down, T.b2a, { uTexel: tx(T.b2a) }, { uSrc: T.b1a.tex });
        this.pass(this.blur, T.b2b, { uTexel: tx(T.b2b), uDir: [1, 0] }, { uSrc: T.b2a.tex });
        this.pass(this.blur, T.b2a, { uTexel: tx(T.b2a), uDir: [0, 1] }, { uSrc: T.b2b.tex });
        this.pass(this.down, T.b3a, { uTexel: tx(T.b3a) }, { uSrc: T.b2a.tex });
        this.pass(this.blur, T.b3b, { uTexel: tx(T.b3b), uDir: [1, 0] }, { uSrc: T.b3a.tex });
        this.pass(this.blur, T.b3a, { uTexel: tx(T.b3a), uDir: [0, 1] }, { uSrc: T.b3b.tex });
      }
      this.pass(this.comp, null, {
        uRes: [this.canvas.width, this.canvas.height], uExposure: s.exposure, uBloom: s.bloom,
      }, { uScene: T.scene.tex, uB1: T.b1a.tex, uB2: T.b2a.tex, uB3: T.b3a.tex });
    }
  }

  // float32 → IEEE half, for uploading the LUT.
  function toHalf(v) {
    const f = new Float32Array([v]), i = new Uint32Array(f.buffer)[0];
    const sign = (i >> 16) & 0x8000;
    let exp = ((i >> 23) & 0xff) - 127 + 15;
    const mant = i & 0x7fffff;
    if (exp <= 0) return sign;
    if (exp >= 31) return sign | 0x7c00;
    return sign | (exp << 10) | (mant >> 13);
  }

  /*
   * Orbit camera looking at the hole. yaw/pitch in radians, pitch measured
   * up from the disk plane.
   */
  function orbitCamera(dist, yaw, pitch, fovDeg) {
    const cp = Math.cos(pitch);
    const pos = [dist * cp * Math.sin(yaw), dist * Math.sin(pitch), dist * cp * Math.cos(yaw)];
    const f = pos.map((v) => -v / dist);
    // right = normalize(f × worldUp), up = right × f
    let r = [-f[2], 0, f[0]];
    const rl = Math.hypot(r[0], r[2]) || 1;
    r = r.map((v) => v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { pos, rot: new Float32Array([...r, ...u, ...f]), fov: fovDeg * Math.PI / 180 };
  }

  root.BlackHoleRenderer = BlackHoleRenderer;
  root.orbitCamera = orbitCamera;
})(typeof globalThis !== 'undefined' ? globalThis : this);
