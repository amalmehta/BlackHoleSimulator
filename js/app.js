/*
 * Black Hole Simulator — the live view at the top of the page.
 *
 * Owns the orbit camera (drag to orbit, pinch / ⌥-scroll / buttons to zoom),
 * the render loop (paused while the view is off screen) and the HUD.
 */
(function (root) {
  'use strict';

  const S = root.Settings.values;
  const cam = { dist: 30, yaw: 0.6, pitch: 0.12 };
  const DIST_MIN = 6, DIST_MAX = 80, PITCH_MAX = 1.45;

  function init() {
    const canvas = document.getElementById('sim');
    const hud = document.getElementById('hud');
    let renderer;
    try {
      renderer = new root.BlackHoleRenderer(canvas);
    } catch (e) {
      document.getElementById('sim-error').hidden = false;
      document.getElementById('sim-error-text').textContent = e.message;
      console.error(e);
      return;
    }

    // ---- controls -------------------------------------------------------------
    const pointers = new Map();
    let dragging = false, lastPinch = 0;
    const zoom = (factor) => { cam.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, cam.dist * factor)); };

    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      canvas.setPointerCapture(e.pointerId);
      dragging = true;
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const [px, py] = pointers.get(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastPinch) zoom(lastPinch / d);
        lastPinch = d;
        return;
      }
      cam.yaw -= (e.clientX - px) * 0.005;
      cam.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, cam.pitch + (e.clientY - py) * 0.005));
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      lastPinch = 0;
      if (!pointers.size) { dragging = false; canvas.classList.remove('dragging'); }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    // Plain scrolling keeps scrolling the page; trackpad pinch (ctrlKey) or ⌥/⌘-scroll zooms.
    canvas.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.altKey || e.metaKey)) return;
      e.preventDefault();
      zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    document.querySelector('[data-action="zoom-in"]').addEventListener('click', () => zoom(1 / 1.15));
    document.querySelector('[data-action="zoom-out"]').addEventListener('click', () => zoom(1.15));
    document.querySelector('[data-action="reset-view"]').addEventListener('click', () => Object.assign(cam, { dist: 30, yaw: 0.6, pitch: 0.12 }));

    // "Try it" buttons in the article change one setting and jump back up.
    document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => {
      const [key, val] = b.dataset.try.split('=');
      const cur = S[key];
      root.Settings.set(key, typeof cur === 'boolean' ? (val === undefined ? !cur : val === 'true') : parseFloat(val));
      if (b.dataset.view) Object.assign(cam, JSON.parse(b.dataset.view));
      document.getElementById('simulator').scrollIntoView({ behavior: 'smooth' });
    }));

    // ---- loop -------------------------------------------------------------------
    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);

    let last = performance.now(), simTime = 0, fps = 60, hudTimer = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible) return;
      simTime += dt * S.timeScale;
      if (S.autoRotate && !dragging) cam.yaw += dt * S.rotateSpeed * 0.5;

      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      renderer.resize(w, h, S.renderScale);
      renderer.render(root.orbitCamera(cam.dist, cam.yaw, cam.pitch, S.fov), S, simTime);

      fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
      if ((hudTimer += dt) > 0.25) {
        hudTimer = 0;
        hud.textContent = `r = ${cam.dist.toFixed(1)} M · ${Math.round(cam.pitch * 180 / Math.PI)}° above disk · ${Math.round(fps)} fps`;
      }
    }
    requestAnimationFrame(frame);
  }

  root.SimulatorApp = { init, camera: cam };
})(typeof globalThis !== 'undefined' ? globalThis : this);
