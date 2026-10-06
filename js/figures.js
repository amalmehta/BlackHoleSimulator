/*
 * Black Hole Simulator — interactive figures for the article.
 *
 * Every figure is a plain 2D canvas drawn from js/physics.js, with a hover
 * tooltip and (for the line charts) a data table under it.
 */
(function (root) {
  'use strict';

  const BH = root.BH;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let C = {};
  const readColors = () => {
    C = {
      s1: css('--series-1'), s2: css('--series-2'), s3: css('--series-3'),
      text: css('--text'), muted: css('--text-muted'), grid: css('--grid'), axis: css('--axis'),
      surface: css('--surface'), highlight: css('--highlight'),
    };
  };
  const FONT = '12px ui-sans-serif, -apple-system, "Segoe UI", sans-serif';

  // ---- shared plumbing -------------------------------------------------------

  // Size a canvas to its CSS box at device resolution; returns a 2D context in CSS pixels.
  function fit(canvas) {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function tooltip(fig, html, x, y) {
    const tip = fig.querySelector('.tooltip');
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const box = fig.querySelector('canvas').getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = x + 14 + tw > box.width ? x - 14 - tw : x + 14;
    tip.style.left = `${left + fig.querySelector('canvas').offsetLeft}px`;
    tip.style.top = `${y + fig.querySelector('canvas').offsetTop - 10}px`;
  }

  // A line chart frame: linear scales, recessive grid, axis labels.
  function frame(canvas, xr, yr, opts) {
    const { ctx, w, h } = fit(canvas);
    const m = Object.assign({ l: 52, r: 18, t: 14, b: 40 }, opts && opts.margin);
    const P = { x0: m.l, x1: w - m.r, y0: h - m.b, y1: m.t };
    const sx = (v) => P.x0 + (v - xr[0]) / (xr[1] - xr[0]) * (P.x1 - P.x0);
    const sy = (v) => P.y0 - (v - yr[0]) / (yr[1] - yr[0]) * (P.y0 - P.y1);
    const ix = (px) => xr[0] + (px - P.x0) / (P.x1 - P.x0) * (xr[1] - xr[0]);
    ctx.font = FONT;
    ctx.lineWidth = 1;
    // grid + ticks
    ctx.strokeStyle = C.grid;
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of opts.yTicks) {
      ctx.beginPath(); ctx.moveTo(P.x0, sy(v)); ctx.lineTo(P.x1, sy(v)); ctx.stroke();
      ctx.fillText(opts.yFmt ? opts.yFmt(v) : v, P.x0 - 8, sy(v));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of opts.xTicks) ctx.fillText(opts.xFmt ? opts.xFmt(v) : v, sx(v), P.y0 + 8);
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(P.x0, P.y0); ctx.lineTo(P.x1, P.y0); ctx.stroke();
    // axis titles
    ctx.fillStyle = C.muted;
    ctx.fillText(opts.xLabel, (P.x0 + P.x1) / 2, P.y0 + 24);
    ctx.save();
    ctx.translate(14, (P.y0 + P.y1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.yLabel, 0, 0);
    ctx.restore();
    return { ctx, w, h, P, sx, sy, ix };
  }

  function line(f, pts, color, opts) {
    const { ctx, sx, sy, P } = f;
    ctx.save();
    ctx.beginPath(); ctx.rect(P.x0, P.y1 - 2, P.x1 - P.x0, P.y0 - P.y1 + 4); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (opts && opts.dash) ctx.setLineDash(opts.dash);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
    ctx.stroke();
    ctx.restore();
  }

  function dot(ctx, x, y, color) {
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C.surface; ctx.stroke();
  }

  function crosshair(f, px) {
    const { ctx, P } = f;
    ctx.save();
    ctx.strokeStyle = C.axis; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(px, P.y1); ctx.lineTo(px, P.y0); ctx.stroke();
    ctx.restore();
  }

  function label(ctx, text, x, y, color, align) {
    ctx.font = FONT; ctx.fillStyle = color || C.text;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function table(fig, head, rows) {
    const t = fig.querySelector('table');
    if (!t) return;
    t.innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }

  // Redraw on resize and on hover; returns a function that redraws with the last hover.
  function figure(id, draw) {
    const fig = document.getElementById(id);
    if (!fig) return () => {};
    const canvas = fig.querySelector('canvas');
    let hover = null;
    const redraw = () => draw(fig, canvas, hover);
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      hover = [e.clientX - r.left, e.clientY - r.top];
      redraw();
    });
    canvas.addEventListener('pointerleave', () => { hover = null; tooltip(fig, null); redraw(); });
    new ResizeObserver(redraw).observe(canvas);
    return redraw;
  }

  const fmt = (v, d) => v.toFixed(d === undefined ? 2 : d);

  // ---- Figure: effective potential ------------------------------------------

  function potential() {
    const slider = document.getElementById('b-pot');
    const out = document.getElementById('b-pot-out');
    const xr = [2, 16], yr = [0, 0.045];
    const curve = [];
    for (let r = 2; r <= 16; r += 0.02) curve.push([r, BH.effectivePotential(r)]);

    const redraw = figure('fig-potential', (fig, canvas, hover) => {
      const b = parseFloat(slider.value);
      const E = 1 / (b * b);
      const f = frame(canvas, xr, yr, {
        xTicks: [2, 4, 6, 8, 10, 12, 14, 16], yTicks: [0, 0.01, 0.02, 0.03, 0.04],
        xLabel: 'distance r (units of M)', yLabel: 'V(r)', yFmt: (v) => v.toFixed(2),
      });
      const { ctx, sx, sy, P } = f;
      // forbidden region: where V(r) > 1/b²
      ctx.fillStyle = C.highlight;
      for (let i = 1; i < curve.length; i++) {
        if (curve[i][1] > E) {
          const x0 = sx(curve[i - 1][0]), x1 = sx(curve[i][0]);
          ctx.fillRect(x0, sy(Math.min(curve[i][1], yr[1])), x1 - x0 + 0.5, sy(E) - sy(Math.min(curve[i][1], yr[1])));
        }
      }
      line(f, curve, C.s1);
      line(f, [[2, E], [16, E]], C.s2, { dash: [6, 4] });
      label(ctx, '1/b²', P.x1 - 4, sy(E) - 10, C.text, 'right');
      // photon sphere peak
      dot(ctx, sx(3), sy(1 / 27), C.s1);
      label(ctx, 'photon sphere: r = 3M, V = 1/27', sx(3) + 10, sy(1 / 27) - 2);

      let msg;
      if (b > BH.B_CRIT) {
        const rMin = 1 / BH.closestApproachU(b);
        dot(ctx, sx(rMin), sy(E), C.s2);
        msg = `b = ${fmt(b)} M. The ray comes in from the right, hits the curve at r = ${fmt(rMin)} M and turns back out.`;
      } else {
        msg = `b = ${fmt(b)} M is below b<sub>c</sub> = ${fmt(BH.B_CRIT, 3)} M. The line clears the peak, so nothing stops the ray: it falls in.`;
      }
      out.innerHTML = msg;

      if (hover && hover[0] >= P.x0 && hover[0] <= P.x1) {
        const r = Math.max(2.001, f.ix(hover[0]));
        const v = BH.effectivePotential(r);
        crosshair(f, sx(r));
        dot(ctx, sx(r), sy(v), C.s1);
        tooltip(fig, `<b>r = ${fmt(r)} M</b><br>V(r) = ${v.toFixed(4)}<br>${v > E ? 'forbidden for this b' : 'allowed'}`, sx(r), sy(v));
      }
    });
    slider.addEventListener('input', redraw);
    const fig = document.getElementById('fig-potential');
    table(fig, ['r (M)', 'V(r)'], [2.5, 3, 4, 5, 6, 8, 10, 12, 16].map((r) => [r, BH.effectivePotential(r).toFixed(5)]));
  }

  // ---- Figure: ray diagram ---------------------------------------------------

  function rays() {
    const fig = document.getElementById('fig-rays');
    if (!fig) return;
    const slider = document.getElementById('b-ray');
    const out = document.getElementById('b-ray-out');
    const bundle = [];
    for (let b = -10.5; b <= 10.51; b += 0.75) {
      const t = BH.traceRay2D(Math.abs(b), { start: 24, escape: 32, stepK: 0.01 });
      const path = b < 0 ? t.path.map(([x, y]) => [x, -y]) : t.path;
      bundle.push({ b, fate: t.fate, bend: t.fate === 'escaped' ? BH.deflectionExact(Math.abs(b)) : 0, path });
    }
    let chosen = null;
    const choose = () => {
      const b = parseFloat(slider.value);
      const t = BH.traceRay2D(b, { start: 24, escape: 32, stepK: 0.004, maxSteps: 60000 });
      // The traced path starts and ends at finite distance, so take the bend
      // from the exact integral rather than from the path.
      const bend = BH.deflectionExact(b);
      chosen = { b, fate: t.fate, path: t.path, len: 0 };
      // cumulative length for the travelling photon
      const L = [0];
      for (let i = 1; i < t.path.length; i++) L.push(L[i - 1] + Math.hypot(t.path[i][0] - t.path[i - 1][0], t.path[i][1] - t.path[i - 1][1]));
      chosen.cum = L; chosen.len = L[L.length - 1];
      out.innerHTML = t.fate === 'captured'
        ? `b = ${fmt(b)} M &lt; b<sub>c</sub>: the ray crosses the horizon.`
        : `b = ${fmt(b)} M: the ray escapes, bent by ${fmt(bend)} rad (${Math.round(bend * 180 / Math.PI)}°)${bend > 2 * Math.PI ? `, looping the hole ${Math.floor(bend / (2 * Math.PI))}×` : ''}.`;
    };
    choose();

    const canvas = fig.querySelector('canvas');
    let hover = null, phase = 0;
    function draw() {
      const { ctx, w, h } = fit(canvas);
      const scale = Math.min(w / 36, h / 22);
      const X = (x) => w / 2 + x * scale, Y = (y) => h / 2 - y * scale;
      ctx.save();
      // faint shadow band
      ctx.fillStyle = C.highlight;
      ctx.fillRect(0, Y(BH.B_CRIT), X(0), Y(-BH.B_CRIT) - Y(BH.B_CRIT));
      // bundle
      ctx.lineWidth = 1.5;
      for (const r of bundle) {
        ctx.strokeStyle = r.fate === 'captured' ? C.s2 : C.s1;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        r.path.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // photon sphere, ISCO
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X(0), Y(0), 3 * scale, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([1, 4]);
      ctx.beginPath(); ctx.arc(X(0), Y(0), 6 * scale, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
      // horizon
      ctx.fillStyle = '#000'; ctx.strokeStyle = C.text; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(0), Y(0), 2 * scale, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      label(ctx, 'horizon 2M', X(0), Y(0), C.text, 'center');
      label(ctx, 'photon sphere 3M', X(2.3), Y(-3.4), C.muted);
      label(ctx, 'ISCO 6M', X(4.4), Y(-4.8), C.muted);
      // chosen ray + travelling photon
      if (chosen) {
        ctx.strokeStyle = C.text; ctx.lineWidth = 2.5;
        ctx.beginPath();
        chosen.path.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
        const target = (phase % 1) * chosen.len;
        let i = 1;
        while (i < chosen.cum.length - 1 && chosen.cum[i] < target) i++;
        const [px, py] = chosen.path[i];
        ctx.beginPath(); ctx.arc(X(px), Y(py), 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff6d8'; ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 14; ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      // hover: nearest ray of the bundle
      if (hover) {
        let best = null, bestD = 12;
        for (const r of bundle) {
          for (let i = 0; i < r.path.length; i += 4) {
            const d = Math.hypot(X(r.path[i][0]) - hover[0], Y(r.path[i][1]) - hover[1]);
            if (d < bestD) { bestD = d; best = r; }
          }
        }
        if (best) {
          ctx.strokeStyle = best.fate === 'captured' ? C.s2 : C.s1; ctx.lineWidth = 3;
          ctx.beginPath();
          best.path.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
          ctx.stroke();
          tooltip(fig, `<b>b = ${fmt(best.b)} M</b><br>${best.fate === 'captured' ? 'falls in' : `escapes, bent ${fmt(best.bend)} rad (${Math.round(best.bend * 180 / Math.PI)}°)`}`, hover[0], hover[1]);
        } else tooltip(fig, null);
      }
    }
    let visible = false;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    let last = performance.now();
    (function tick(now) {
      requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!visible) return;
      phase += dt / Math.max(2.5, chosen.len / 14);
      draw();
    })(last);
    canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); hover = [e.clientX - r.left, e.clientY - r.top]; });
    canvas.addEventListener('pointerleave', () => { hover = null; tooltip(fig, null); });
    slider.addEventListener('input', () => { choose(); phase = 0; });
    document.querySelector('[data-action="snap-bc"]')?.addEventListener('click', () => {
      slider.value = (BH.B_CRIT + 0.01).toFixed(2); choose(); phase = 0;
    });
  }

  // ---- Figure: deflection angle ----------------------------------------------

  function deflection() {
    const xr = [3, 30], yr = [0, 7];
    const exact = [], weak = [];
    for (let i = 0; i <= 260; i++) {
      const b = BH.B_CRIT + 1e-4 + Math.pow(i / 260, 2.2) * (30 - BH.B_CRIT);
      exact.push([b, BH.deflectionExact(b, 3000)]);
    }
    for (let b = 3; b <= 30; b += 0.1) weak.push([b, BH.deflectionWeak(b)]);

    figure('fig-deflect', (fig, canvas, hover) => {
      const f = frame(canvas, xr, yr, {
        xTicks: [5, 10, 15, 20, 25, 30], yTicks: [0, 1, 2, 3, 4, 5, 6, 7],
        xLabel: 'impact parameter b (units of M)', yLabel: 'bend α (radians)',
      });
      const { ctx, sx, sy, P } = f;
      ctx.fillStyle = C.highlight;
      ctx.fillRect(P.x0, P.y1, sx(BH.B_CRIT) - P.x0, P.y0 - P.y1);
      label(ctx, 'captured', (P.x0 + sx(BH.B_CRIT)) / 2, P.y1 + 12, C.muted, 'center');
      ctx.save(); ctx.strokeStyle = C.axis; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(sx(BH.B_CRIT), P.y1); ctx.lineTo(sx(BH.B_CRIT), P.y0); ctx.stroke(); ctx.restore();
      label(ctx, 'b꜀ = 3√3 M', sx(BH.B_CRIT) + 6, sy(6.5), C.muted);
      line(f, weak, C.s2, { dash: [6, 4] });
      line(f, exact, C.s1);
      label(ctx, 'exact', sx(7.2), sy(BH.deflectionExact(7.2)) - 4, C.text);
      label(ctx, 'weak field 4M/b', sx(5.6), sy(BH.deflectionWeak(5.6)) + 16, C.text);
      label(ctx, 'π: ray turns back', P.x1, sy(Math.PI) - 9, C.muted, 'right');
      ctx.save(); ctx.strokeStyle = C.grid; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(P.x0, sy(Math.PI)); ctx.lineTo(P.x1, sy(Math.PI)); ctx.stroke(); ctx.restore();

      if (hover && hover[0] >= P.x0 && hover[0] <= P.x1) {
        const b = f.ix(hover[0]);
        crosshair(f, sx(b));
        const w = BH.deflectionWeak(b);
        if (w < yr[1]) dot(ctx, sx(b), sy(w), C.s2);
        let html = `<b>b = ${fmt(b)} M</b><br>`;
        if (b > BH.B_CRIT) {
          const e = BH.deflectionExact(b, 3000);
          if (e < yr[1]) dot(ctx, sx(b), sy(e), C.s1);
          html += `<span class="sw" style="background:${C.s1}"></span>exact ${fmt(e, 3)} rad<br>`;
          html += `<span class="sw" style="background:${C.s2}"></span>weak field ${fmt(w, 3)} rad<br>`;
          html += `weak field is ${Math.round((1 - w / e) * 100)}% low`;
        } else html += 'captured: falls in';
        tooltip(fig, html, sx(b), hover[1]);
      }
    });
    const fig = document.getElementById('fig-deflect');
    table(fig, ['b (M)', 'exact α (rad)', '4M/b (rad)'],
      [5.2, 5.3, 5.5, 6, 7, 8, 10, 15, 20, 30, 100].map((b) => [b, BH.deflectionExact(b).toFixed(4), BH.deflectionWeak(b).toFixed(4)]));
  }

  // ---- Figure: disk redshift ---------------------------------------------------

  function redshift() {
    const xr = [6, 30], yr = [0.4, 1.6];
    const series = [
      { name: 'approaching side', color: () => C.s1, g: (r) => BH.redshiftFactor(r, BH.tangentialImpact(r), Infinity) },
      { name: 'face-on', color: () => C.s3, g: (r) => BH.redshiftFactor(r, 0, Infinity) },
      { name: 'receding side', color: () => C.s2, g: (r) => BH.redshiftFactor(r, -BH.tangentialImpact(r), Infinity) },
    ];
    const pts = series.map((s) => { const p = []; for (let r = 6.05; r <= 30; r += 0.1) p.push([r, s.g(r)]); return p; });

    figure('fig-redshift', (fig, canvas, hover) => {
      const f = frame(canvas, xr, yr, {
        xTicks: [6, 10, 15, 20, 25, 30], yTicks: [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6],
        xLabel: 'disk radius r (units of M)', yLabel: 'g = ν_seen / ν_emitted', yFmt: (v) => v.toFixed(1),
      });
      const { ctx, sx, sy, P } = f;
      ctx.save(); ctx.strokeStyle = C.axis; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(P.x0, sy(1)); ctx.lineTo(P.x1, sy(1)); ctx.stroke(); ctx.restore();
      label(ctx, 'no shift', P.x1 - 2, sy(1) - 9, C.muted, 'right');
      series.forEach((s, i) => line(f, pts[i], s.color()));
      label(ctx, 'approaching', sx(7.4), sy(series[0].g(7.4)) - 12, C.text);
      label(ctx, 'face-on', sx(24), sy(series[1].g(24)) + 13, C.text);
      label(ctx, 'receding', sx(7.4), sy(series[2].g(7.4)) + 14, C.text);

      if (hover && hover[0] >= P.x0 && hover[0] <= P.x1) {
        const r = Math.max(6.05, f.ix(hover[0]));
        crosshair(f, sx(r));
        let html = `<b>r = ${fmt(r, 1)} M</b><br>`;
        for (const s of series) {
          const g = s.g(r);
          dot(ctx, sx(r), sy(g), s.color());
          html += `<span class="sw" style="background:${s.color()}"></span>${s.name}: g = ${fmt(g, 3)}, brightness ×${fmt(g ** 4, 2)}<br>`;
        }
        tooltip(fig, html, sx(r), hover[1]);
      }
    });
    const fig = document.getElementById('fig-redshift');
    table(fig, ['r (M)', 'approaching g', 'face-on g', 'receding g'],
      [6.05, 7, 8, 10, 15, 20, 30].map((r) => [r, ...series.map((s) => s.g(r).toFixed(3))]));
  }

  // ---- Figure: blackbody colour strip -----------------------------------------

  function blackbody() {
    const T0 = 1000, T1 = 30000;
    const toX = (T, w) => Math.log(T / T0) / Math.log(T1 / T0) * w;
    const toT = (x, w) => T0 * Math.pow(T1 / T0, x / w);
    const css3 = (c) => `rgb(${c.map((v) => Math.round(BH.toSRGB(Math.min(1, v)) * 255)).join(',')})`;
    const redraw = figure('fig-blackbody', (fig, canvas, hover) => {
      const { ctx, w, h } = fit(canvas);
      const barH = h - 34;
      for (let x = 0; x < w; x++) { ctx.fillStyle = css3(BH.blackbodyRGB(toT(x + 0.5, w))); ctx.fillRect(x, 0, 1.5, barH); }
      ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textBaseline = 'top';
      for (const T of [1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000]) {
        const x = toX(T, w);
        ctx.textAlign = x < 20 ? 'left' : x > w - 20 ? 'right' : 'center';
        ctx.fillRect(x, barH, 1, 5);
        ctx.fillText(`${T >= 1000 ? T / 1000 + 'k' : T}`, x, barH + 8);
      }
      const Tset = root.Settings ? root.Settings.values.diskTemperature : 7000;
      const xs = toX(Tset, w);
      ctx.fillStyle = C.text; ctx.fillRect(xs - 1, 0, 2, barH);
      ctx.textAlign = xs > w - 120 ? 'right' : 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#000'; ctx.fillText(`disk peak ${Tset.toLocaleString()} K`, xs + (xs > w - 120 ? -6 : 6), 6);
      if (hover) {
        const T = toT(Math.max(0, Math.min(w, hover[0])), w);
        const c = BH.blackbodyRGB(T);
        tooltip(fig, `<span class="sw big" style="background:${css3(c)}"></span><b>${Math.round(T).toLocaleString()} K</b><br>linear RGB ${c.map((v) => v.toFixed(2)).join(', ')}`, hover[0], hover[1]);
      }
    });
    if (root.Settings) root.Settings.onChange((k) => { if (k === 'diskTemperature') redraw(); });
  }

  function init() {
    readColors();
    potential();
    rays();
    deflection();
    redshift();
    blackbody();
  }

  root.Figures = { init };
})(typeof globalThis !== 'undefined' ? globalThis : this);
