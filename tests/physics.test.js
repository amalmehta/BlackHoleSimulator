// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const BH = require('../js/physics.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test('key radii', () => {
  assert.equal(BH.R_HORIZON, 2);
  assert.equal(BH.R_PHOTON, 3);
  assert.equal(BH.R_ISCO, 6);
  close(BH.B_CRIT, 5.196152422706632, 1e-12, 'b_c = 3√3');
});

test('effective potential peaks at the photon sphere with value 1/b_c²', () => {
  let best = 0, bestR = 0;
  for (let r = 2.01; r < 10; r += 0.001) {
    const v = BH.effectivePotential(r);
    if (v > best) { best = v; bestR = r; }
  }
  close(bestR, 3, 2e-3, 'peak radius');
  close(best, 1 / 27, 1e-7, 'peak value');
});

test('rays below b_c fall in, rays above escape', () => {
  assert.equal(BH.traceRay2D(BH.B_CRIT - 0.05, { record: false }).fate, 'captured');
  assert.equal(BH.traceRay2D(BH.B_CRIT + 0.05, { record: false }).fate, 'escaped');
  assert.equal(BH.traceRay2D(2, { record: false }).fate, 'captured');
  assert.equal(BH.traceRay2D(15, { record: false }).fate, 'escaped');
});

test('near-critical rays wind around the photon sphere', () => {
  const t = BH.traceRay2D(BH.B_CRIT + 1e-4, { record: false });
  assert.equal(t.fate, 'escaped');
  assert.ok(t.swept > 2 * Math.PI, `swept ${t.swept} should exceed one full loop`);
});

test('exact deflection integral matches weak-field limit at large b', () => {
  for (const b of [200, 500, 1000]) {
    const exact = BH.deflectionExact(b);
    const second = 4 / b + (15 * Math.PI) / (4 * b * b); // second-order expansion
    close(exact, second, 0.02 * second, `b=${b}`);
  }
});

test('integrated ray agrees with the exact deflection integral', () => {
  for (const b of [7, 10, 20]) {
    // Start and stop far away so the missing tail of the bend is tiny.
    const t = BH.traceRay2D(b, { start: 4000, escape: 4000, stepK: 0.005, maxSteps: 200000, record: false });
    // The ray starts moving in +x and bends toward the hole (−y), so its
    // deflection is minus the direction it leaves in.
    const fromTrace = -t.exitAngle;
    const exact = BH.deflectionExact(b);
    close(fromTrace, exact, 0.004 + 0.002 * exact, `b=${b}`);
  }
});

test('angular momentum h = |x × v| is conserved along a ray', () => {
  const b = 6.5;
  let s = [-30, b, 0, 1, 0, 0];
  for (let i = 0; i < 4000; i++) {
    const r = Math.hypot(s[0], s[1]);
    if (r > 200) break;
    s = BH.rk4Step(s, b * b, 0.01 * r);
  }
  const h = Math.abs(s[0] * s[4] - s[1] * s[3]);
  close(h, b, 1e-6, 'h');
});

test('redshift factor', () => {
  // Face-on light (L = 0) from the ISCO to infinity: g = sqrt(1 - 3M/r) = sqrt(1/2).
  close(BH.redshiftFactor(6, 0, Infinity), Math.SQRT1_2, 1e-12, 'g at ISCO, L=0');
  // Approaching side is blueshifted relative to receding side.
  const L = BH.tangentialImpact(8);
  assert.ok(BH.redshiftFactor(8, L, Infinity) > 1);
  assert.ok(BH.redshiftFactor(8, -L, Infinity) < BH.redshiftFactor(8, 0, Infinity));
});

test('disk temperature: zero inside ISCO, peak of 1 at r = 49/36 r_in', () => {
  assert.equal(BH.diskTemperature(5.9), 0);
  close(BH.diskTemperature(6 * 49 / 36), 1, 1e-12, 'peak');
  assert.ok(BH.diskTemperature(8) < 1 && BH.diskTemperature(9) < 1);
  assert.ok(BH.diskTemperature(30) < BH.diskTemperature(12));
});

test('blackbody colours: cool is red, ~6500 K is near white, hot is blue', () => {
  const cool = BH.blackbodyRGB(2000);
  assert.ok(cool[0] === 1 && cool[2] < 0.2, `2000 K ${cool}`);
  const white = BH.blackbodyRGB(6500);
  for (const c of white) assert.ok(c > 0.85, `6500 K ${white}`);
  const hot = BH.blackbodyRGB(30000);
  assert.ok(hot[2] === 1 && hot[0] < 0.8, `30000 K ${hot}`);
  const lut = BH.blackbodyLUT(64);
  assert.equal(lut.length, 256);
});
