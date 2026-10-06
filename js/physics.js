/*
 * Black Hole Simulator — physics core.
 *
 * Schwarzschild spacetime in geometric units (G = c = M = 1), so:
 *   event horizon   r = 2
 *   photon sphere   r = 3
 *   ISCO            r = 6
 *   critical impact parameter b_c = 3*sqrt(3)
 *
 * Everything here is plain JavaScript with no DOM access, so the same
 * code runs in the browser (window.BH) and under Node for the tests
 * (module.exports). The GPU shader in renderer.js implements the same
 * ray equation; these functions are the reference it is checked against.
 */
(function (root) {
  'use strict';

  const M = 1;
  const R_HORIZON = 2 * M;
  const R_PHOTON = 3 * M;
  const R_ISCO = 6 * M;
  const B_CRIT = 3 * Math.sqrt(3) * M;

  // ---------------------------------------------------------------------------
  // Light rays
  // ---------------------------------------------------------------------------

  /*
   * Null geodesics in Schwarzschild obey the orbit equation
   *     d²u/dφ² + u = 3 M u²,   u = 1/r.
   * A Newtonian-looking particle with a central acceleration
   *     a = -3 M h² x / r⁵,   h = |x × v|
   * traces exactly the same curve (Binet's equation reproduces the line
   * above), so we can integrate rays in ordinary Cartesian space.
   * h is conserved, and equals the impact parameter b when |v| = 1 far away.
   */
  function rayAccel(x, y, z, h2) {
    const r2 = x * x + y * y + z * z;
    const r5 = r2 * r2 * Math.sqrt(r2);
    const k = -3 * M * h2 / r5;
    return [k * x, k * y, k * z];
  }

  // One RK4 step of the ray equation. s = [x, y, z, vx, vy, vz].
  function rk4Step(s, h2, dt) {
    const f = (q) => {
      const a = rayAccel(q[0], q[1], q[2], h2);
      return [q[3], q[4], q[5], a[0], a[1], a[2]];
    };
    const add = (q, d, k) => q.map((v, i) => v + d[i] * k);
    const k1 = f(s);
    const k2 = f(add(s, k1, dt / 2));
    const k3 = f(add(s, k2, dt / 2));
    const k4 = f(add(s, k3, dt));
    return s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }

  /*
   * Trace a ray in the plane, starting far to the left (x = -start) at
   * height b moving in +x. Returns its path, whether it fell in, and the
   * total angle it swept around the hole (deflection = swept - π).
   */
  function traceRay2D(b, opts) {
    const o = Object.assign({ start: 40, escape: 60, stepK: 0.01, maxSteps: 20000, record: true }, opts);
    let s = [-o.start, b, 0, 1, 0, 0];
    const h2 = b * b;
    const path = o.record ? [[s[0], s[1]]] : null;
    let swept = 0;
    let prevAng = Math.atan2(s[1], s[0]);
    let fate = 'unknown';
    for (let i = 0; i < o.maxSteps; i++) {
      const r = Math.hypot(s[0], s[1]);
      const dt = Math.max(o.stepK * r, 1e-4) * Math.min(1, Math.max(0.05, (r - R_HORIZON) / 2));
      s = rk4Step(s, h2, dt);
      const ang = Math.atan2(s[1], s[0]);
      let d = ang - prevAng;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      swept += d;
      prevAng = ang;
      if (path) path.push([s[0], s[1]]);
      const rn = Math.hypot(s[0], s[1]);
      if (rn <= R_HORIZON) { fate = 'captured'; break; }
      const outward = s[0] * s[3] + s[1] * s[4] > 0;
      if (rn > o.escape && outward) { fate = 'escaped'; break; }
    }
    // Direction the ray leaves in, measured from +x.
    const exitAngle = Math.atan2(s[4], s[3]);
    return { path, fate, swept: Math.abs(swept), exitAngle, state: s };
  }

  /*
   * Exact total deflection for impact parameter b > b_c:
   *   α(b) = 2 ∫₀^{u₀} du / sqrt(1/b² − u² + 2 M u³) − π
   * where u₀ is the smallest positive root (closest approach).
   * Substituting u = u₀ (1 − t²) removes the square-root singularity.
   */
  function closestApproachU(b) {
    // Smallest positive root of 2M u³ − u² + 1/b² = 0, between 0 and 1/(3M).
    const g = (u) => 2 * M * u * u * u - u * u + 1 / (b * b);
    let lo = 0, hi = 1 / (3 * M);
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (g(mid) > 0) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  function deflectionExact(b, n) {
    if (b <= B_CRIT) return Infinity;
    n = n || 4000;
    const u0 = closestApproachU(b);
    const F = (u) => 1 / (b * b) - u * u + 2 * M * u * u * u;
    // ∫₀^{u₀} du/√F(u) with u = u₀(1−t²), du = −2u₀ t dt, t ∈ [0,1]
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n; // midpoint rule — integrand is finite after substitution
      const u = u0 * (1 - t * t);
      const f = F(u);
      sum += (2 * u0 * t) / Math.sqrt(Math.max(f, 1e-300));
    }
    return 2 * (sum / n) - Math.PI;
  }

  // Weak-field (first order) deflection: Einstein's 4M/b.
  function deflectionWeak(b) { return 4 * M / b; }

  // Effective potential for light, in the form (dr/dλ)² = 1/b² − V(r).
  function effectivePotential(r) { return (1 - 2 * M / r) / (r * r); }

  // ---------------------------------------------------------------------------
  // Accretion disk
  // ---------------------------------------------------------------------------

  /*
   * Thin-disk temperature profile (Shakura–Sunyaev, zero torque at the
   * inner edge):  T⁴ ∝ r⁻³ (1 − sqrt(r_in / r)).
   * Returned normalised so the hottest ring is 1. The peak sits at r = 49/36 r_in.
   */
  function diskTemperature(r, rIn) {
    rIn = rIn || R_ISCO;
    if (r <= rIn) return 0;
    const f = (x) => Math.pow(Math.pow(x, -3) * (1 - Math.sqrt(rIn / x)), 0.25);
    return f(r) / f(rIn * 49 / 36);
  }

  // Keplerian angular velocity (exact in Schwarzschild for coordinate time).
  function orbitalOmega(r) { return Math.sqrt(M / (r * r * r)); }

  /*
   * Frequency ratio g = ν_observed / ν_emitted for light leaving a disk
   * element on a circular orbit at radius r, carrying angular momentum L
   * (per unit energy) about the disk axis, received by a static observer
   * at radius rObs (Infinity for a distant observer).
   *   g = 1 / ( u^t (1 − Ω L) · sqrt(1 − 2M/rObs) ),  u^t = 1/sqrt(1 − 3M/r)
   * With L = 0 this is pure gravitational + transverse-Doppler redshift.
   */
  function redshiftFactor(r, L, rObs) {
    const ut = 1 / Math.sqrt(1 - 3 * M / r);
    const obs = isFinite(rObs) ? Math.sqrt(1 - 2 * M / rObs) : 1;
    return 1 / (ut * (1 - orbitalOmega(r) * L) * obs);
  }

  // Impact parameter of a photon emitted tangentially at radius r.
  function tangentialImpact(r) { return r / Math.sqrt(1 - 2 * M / r); }

  // ---------------------------------------------------------------------------
  // Colour of a blackbody
  // ---------------------------------------------------------------------------

  // CIE 1931 colour-matching functions, multi-lobe Gaussian fit (Wyman et al. 2013).
  function lobe(l, mu, s1, s2) { const t = (l - mu) / (l < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
  function cieXYZ(l) {
    return [
      1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
      0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
      1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
    ];
  }

  // Planck spectral radiance up to a constant; λ in nm, T in kelvin.
  function planck(l, T) { return 1 / (Math.pow(l, 5) * (Math.exp(1.4388e7 / (l * T)) - 1)); }

  /*
   * Linear-sRGB chromaticity of a blackbody at temperature T, scaled so
   * the largest channel is 1 (brightness is handled separately).
   */
  function blackbodyRGB(T) {
    let X = 0, Y = 0, Z = 0;
    for (let l = 380; l <= 780; l += 5) {
      const p = planck(l, T);
      const c = cieXYZ(l);
      X += p * c[0]; Y += p * c[1]; Z += p * c[2];
    }
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    let bl = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    r = Math.max(r, 0); g = Math.max(g, 0); bl = Math.max(bl, 0);
    const m = Math.max(r, g, bl) || 1;
    return [r / m, g / m, bl / m];
  }

  // Lookup table for the shader: n entries, log-spaced between tMin and tMax.
  const LUT_T_MIN = 800, LUT_T_MAX = 60000;
  function blackbodyLUT(n) {
    n = n || 256;
    const out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const T = LUT_T_MIN * Math.pow(LUT_T_MAX / LUT_T_MIN, i / (n - 1));
      const c = blackbodyRGB(T);
      out.set([c[0], c[1], c[2], 1], i * 4);
    }
    return out;
  }

  // Linear → sRGB-encoded, for drawing colour swatches on a 2D canvas.
  function toSRGB(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

  const BH = {
    M, R_HORIZON, R_PHOTON, R_ISCO, B_CRIT,
    rayAccel, rk4Step, traceRay2D, closestApproachU, deflectionExact, deflectionWeak,
    effectivePotential, diskTemperature, orbitalOmega, redshiftFactor, tangentialImpact,
    cieXYZ, planck, blackbodyRGB, blackbodyLUT, LUT_T_MIN, LUT_T_MAX, toSRGB,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BH;
  else root.BH = BH;
})(typeof globalThis !== 'undefined' ? globalThis : this);
