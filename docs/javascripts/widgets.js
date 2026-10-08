/* Primer widgets: small interactive figures driven by the LUMEN-like surrogate (lumen-model.js).
 * Each <div class="re-widget" data-widget="NAME"> is filled by WIDGETS[NAME]. Colours come from the
 * theme's --viz-* tokens, so light and dark mode work without edits. Shared helpers are exported as
 * window.ReViz for the Engine Lab (lab.js). */
(function () {
  "use strict";
  const M = () => window.LumenModel;

  /* ---------- shared helpers ---------- */
  const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
  const series = (i) => css(`--viz-s${i}`);
  const root = (() => {
    const s = document.querySelector('script[src*="javascripts/lumen-model.js"]');
    return s ? s.src.replace(/javascripts\/lumen-model\.js.*$/, "") : "";
  })();
  let dataPromise = null;
  function loadData() {
    if (!dataPromise) dataPromise = fetch(root + "assets/lab/model.json").then((r) => r.json());
    return dataPromise;
  }
  const policyCache = {};
  function loadPolicy(name) {
    if (!policyCache[name]) policyCache[name] = fetch(root + `assets/lab/policies/${name}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return policyCache[name];
  }
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  }
  function slider(label, min, max, step, value, fmt, onInput) {
    const val = el("span", { class: "re-ctl-val" }, fmt(value));
    const input = el("input", { type: "range", min, max, step, value });
    input.addEventListener("input", () => { val.textContent = fmt(+input.value); onInput(+input.value); });
    const wrap = el("label", { class: "re-ctl" }, el("span", {}, label), input, val);
    wrap.input = input;
    wrap.set = (v) => { input.value = v; val.textContent = fmt(+v); };
    return wrap;
  }
  function select(label, options, value, onChange) {
    const s = el("select", {});
    for (const [v, t] of options) { const o = el("option", { value: v }, t); if (v === value) o.selected = true; s.append(o); }
    s.addEventListener("change", () => onChange(s.value));
    const wrap = el("label", { class: "re-ctl" }, el("span", {}, label), s);
    wrap.select = s;
    return wrap;
  }
  function canvas(height) {
    const c = el("canvas", { class: "re-canvas" });
    c.style.height = height + "px";
    return c;
  }
  function setup(c) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 600, h = c.clientHeight || 200;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.font = `11px ${css("--viz-font") || "sans-serif"}`;
    return [g, w, h];
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, raw = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= (n || 5)) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  /* Line chart: opts = {x, lines:[{y, color, dash, width, label}], bands:[{y0,y1,color}], hlines:[{y,color,dash,label}],
   * vlines:[{x,color,dash}], ylim, xlim, ylabel, xlabel, cursor} */
  function plot(c, o) {
    const [g, w, h] = setup(c);
    const L = 46, R = 10, T = 8, B = o.xlabel ? 30 : 20;
    const xs = o.x;
    const xlim = o.xlim || [xs[0], xs[xs.length - 1]];
    let ylim = o.ylim;
    if (!ylim) {
      let lo = Infinity, hi = -Infinity;
      for (const l of o.lines) for (const v of l.y) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      for (const hl of o.hlines || []) { lo = Math.min(lo, hl.y); hi = Math.max(hi, hl.y); }
      const pad = (hi - lo) * 0.08 || 0.5;
      ylim = [lo - pad, hi + pad];
    }
    const X = (v) => L + (v - xlim[0]) / (xlim[1] - xlim[0]) * (w - L - R);
    const Y = (v) => T + (1 - (v - ylim[0]) / (ylim[1] - ylim[0])) * (h - T - B);
    g.strokeStyle = css("--viz-grid"); g.lineWidth = 1; g.fillStyle = css("--viz-ink-2");
    g.textAlign = "right"; g.textBaseline = "middle";
    for (const v of niceTicks(ylim[0], ylim[1], Math.max(2, Math.floor((h - T - B) / 28)))) {
      g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(w - R, Y(v)); g.stroke();
      g.fillText(+v.toPrecision(4), L - 5, Y(v));
    }
    g.textAlign = "center"; g.textBaseline = "top";
    for (const v of niceTicks(xlim[0], xlim[1], Math.max(3, Math.floor((w - L - R) / 70)))) g.fillText(+v.toPrecision(4), X(v), h - B + 4);
    if (o.xlabel) g.fillText(o.xlabel, (L + w - R) / 2, h - 13);
    if (o.ylabel) { g.save(); g.translate(11, (T + h - B) / 2); g.rotate(-Math.PI / 2); g.fillText(o.ylabel, 0, -6); g.restore(); }
    g.save(); g.beginPath(); g.rect(L, T, w - L - R, h - T - B); g.clip();
    for (const b of o.bands || []) { g.fillStyle = b.color; g.globalAlpha = b.alpha ?? 0.14; g.fillRect(L, Y(b.y1), w - L - R, Y(b.y0) - Y(b.y1)); g.globalAlpha = 1; }
    for (const hl of o.hlines || []) {
      g.strokeStyle = hl.color || css("--viz-ink-2"); g.setLineDash(hl.dash || [4, 4]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(L, Y(hl.y)); g.lineTo(w - R, Y(hl.y)); g.stroke();
      if (hl.label) {
        // Label above the line, or below it when the line runs along the top of the plot.
        const below = Y(hl.y) - 14 < T;
        g.fillStyle = hl.color || css("--viz-ink-2"); g.textAlign = "right"; g.textBaseline = below ? "top" : "bottom";
        g.fillText(hl.label, w - R - 4, Y(hl.y) + (below ? 3 : -2));
      }
    }
    g.setLineDash([]);
    for (const vl of o.vlines || []) {
      g.strokeStyle = vl.color || css("--viz-axis"); g.setLineDash(vl.dash || [3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(vl.x), T); g.lineTo(X(vl.x), h - B); g.stroke();
      if (vl.label) { g.fillStyle = vl.color || css("--viz-ink-2"); g.textAlign = "left"; g.textBaseline = "top"; g.fillText(vl.label, X(vl.x) + 3, T + 2); }
    }
    g.setLineDash([]);
    for (const l of o.lines) {
      const lx = l.x || xs;
      g.strokeStyle = l.color; g.lineWidth = l.width || 2; g.setLineDash(l.dash || []); g.globalAlpha = l.alpha ?? 1;
      g.beginPath();
      let pen = false;
      for (let i = 0; i < l.y.length; i++) {
        if (!Number.isFinite(l.y[i])) { pen = false; continue; }
        const px = X(lx[i]), py = Y(l.y[i]);
        if (l.step && pen) g.lineTo(px, Y(l.y[i - 1]));
        if (pen) g.lineTo(px, py); else { g.moveTo(px, py); pen = true; }
      }
      g.stroke(); g.globalAlpha = 1;
    }
    g.setLineDash([]);
    if (o.cursor != null) { g.strokeStyle = css("--viz-ink"); g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath(); g.moveTo(X(o.cursor), T); g.lineTo(X(o.cursor), h - B); g.stroke(); g.globalAlpha = 1; }
    g.restore();
    g.strokeStyle = css("--viz-axis"); g.lineWidth = 1; g.beginPath(); g.moveTo(L, T); g.lineTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
    return { X, Y, L, R, T, B, w, h, xlim, ylim, invX: (px) => xlim[0] + (px - L) / (w - L - R) * (xlim[1] - xlim[0]) };
  }
  function legend(items) {
    return el("div", { class: "re-legend" }, ...items.map(([color, text, dash]) => el("span", {}, el("i", { class: dash ? "dash" : "", style: `border-color:${color}` }), text)));
  }
  function onTheme(fn) {
    new MutationObserver(fn).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
    let t = null;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fn, 120); });
  }
  const fmt = (d) => (v) => (+v).toFixed(d);

  const WIDGETS = {};

  /* ---------- 1. valve plane: iso-lines of p_cc and ROF over (TFV, TOV) ---------- */
  WIDGETS["valve-plane"] = async (box) => {
    const D = await loadData(), m = M(), p = D.params;
    const N = 21, xt = [], xo = [];
    for (let i = 0; i < N; i++) { xt.push(0.15 + i * (0.65 - 0.15) / (N - 1)); xo.push(0.1 + i * (0.5 - 0.1) / (N - 1)); }
    // Steady states by continuation: each cell starts Newton from its neighbour's solution, and cells
    // where Newton did not converge are left out of the contours.
    const P = [], R = [];
    const converged = (s, x1, x2) => {
      const d = m.derivatives(s, x1, x2, p)[0];
      return Math.abs(d[m.W_O]) < 1e-3 && Math.abs(d[m.W_F]) < 1e-3 && Math.abs(d[m.T_W]) < 1e-3;
    };
    let rowStart = m.steadyState(xt[0], xo[0], p);
    for (let j = 0; j < N; j++) {
      const rp = [], rr = [];
      let guess = rowStart = m.steadyState(xt[0], xo[j], p, rowStart);
      for (let i = 0; i < N; i++) {
        const s = m.steadyState(xt[i], xo[j], p, guess);
        const o = m.outputs(s, p), ok = converged(s, xt[i], xo[j]);
        if (ok) guess = s;
        // Outside the mixture-ratio limits (thesis Table 5.1) the cell is shaded, not contoured.
        const inside = ok && o.rof >= 2.5 && o.rof <= 4.0;
        rp.push(inside ? o.p_cc : NaN); rr.push(inside ? o.rof : NaN);
      }
      P.push(rp); R.push(rr);
    }
    let cur = [0.3, 0.21];
    const c = canvas(330), ro = el("div", { class: "re-readout" });
    box.append(c, legend([[series(1), "chamber pressure p_cc [bar]"], [series(2), "mixture ratio ROF", true], [css("--viz-grid"), "ROF outside 2.5–4 (shaded)"]]), ro,
      el("div", { class: "re-note" }, "Drag the point. Each valve moves along one axis, but neither axis follows a single line: both valves change both outputs. ",
        el("b", {}, "Surrogate"), " steady states, other valves frozen at the 40 bar point of thesis Table 4.6."));
    function contour(g, X, Y, F, levels, color, dash) {
      g.strokeStyle = color; g.lineWidth = 1.6; g.setLineDash(dash ? [5, 4] : []); g.fillStyle = color;
      for (const lv of levels) {
        const segs = [];
        for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
          const v = [F[j][i], F[j][i + 1], F[j + 1][i + 1], F[j + 1][i]];
          const pts = [[xt[i], xo[j]], [xt[i + 1], xo[j]], [xt[i + 1], xo[j + 1]], [xt[i], xo[j + 1]]];
          const cross = [];
          for (let k = 0; k < 4; k++) {
            const a = v[k], b = v[(k + 1) % 4];
            if ((a - lv) * (b - lv) < 0) { const f = (lv - a) / (b - a); const A = pts[k], B = pts[(k + 1) % 4]; cross.push([A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1])]); }
          }
          if (cross.length >= 2) segs.push([cross[0], cross[1]]);
        }
        g.beginPath();
        for (const [a, b] of segs) { g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); }
        g.stroke();
        const mid = segs[Math.floor(segs.length * 0.62)];
        if (mid) { g.textAlign = "center"; g.textBaseline = "bottom"; g.fillText(lv, X(mid[0][0]), Y(mid[0][1]) - 2); }
      }
      g.setLineDash([]);
    }
    let frame = null;
    function draw() {
      const fr = plot(c, { x: [0.15, 0.65], lines: [], xlim: [0.15, 0.65], ylim: [0.1, 0.5], xlabel: "TFV opening (fuel turbine valve)", ylabel: "TOV opening" });
      const g = c.getContext("2d");
      g.save(); g.beginPath(); g.rect(fr.L, fr.T, fr.w - fr.L - fr.R, fr.h - fr.T - fr.B); g.clip();
      g.fillStyle = css("--viz-grid");
      const dx = (xt[1] - xt[0]) / 2, dy = (xo[1] - xo[0]) / 2;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!Number.isFinite(R[j][i]))
        g.fillRect(fr.X(xt[i] - dx), fr.Y(xo[j] + dy), fr.X(xt[i] + dx) - fr.X(xt[i] - dx) + 0.5, fr.Y(xo[j] - dy) - fr.Y(xo[j] + dy) + 0.5);
      contour(g, fr.X, fr.Y, P, [30, 35, 40, 45, 50], series(1), false);
      contour(g, fr.X, fr.Y, R, [2.6, 3.0, 3.4, 3.8], series(2), true);
      g.restore();
      g.fillStyle = css("--viz-ink"); g.strokeStyle = css("--md-default-bg-color"); g.lineWidth = 2;
      g.beginPath(); g.arc(fr.X(cur[0]), fr.Y(cur[1]), 6, 0, 2 * Math.PI); g.fill(); g.stroke();
      frame = fr;
      const o = m.outputs(m.steadyState(cur[0], cur[1], p), p);
      ro.replaceChildren(...[["TFV", cur[0].toFixed(2)], ["TOV", cur[1].toFixed(2)], ["p_cc [bar]", o.p_cc.toFixed(1)], ["ROF", o.rof.toFixed(2)],
        ["fuel pump [rpm]", Math.round(o.n_ftp)], ["oxidiser pump [rpm]", Math.round(o.n_otp)], ["turbine inlet [K]", Math.round(o.t_rc)]]
        .map(([k, v]) => el("div", { class: "re-ro" }, el("span", {}, k), el("b", {}, v))));
    }
    function pick(e) {
      if (!frame) return;
      const r = c.getBoundingClientRect();
      const x = frame.invX(e.clientX - r.left);
      const y = frame.ylim[0] + (1 - (e.clientY - r.top - frame.T) / (frame.h - frame.T - frame.B)) * (frame.ylim[1] - frame.ylim[0]);
      cur = [Math.min(Math.max(x, 0.15), 0.65), Math.min(Math.max(y, 0.1), 0.5)];
      draw();
    }
    let drag = false;
    c.addEventListener("pointerdown", (e) => { drag = true; c.setPointerCapture(e.pointerId); pick(e); });
    c.addEventListener("pointermove", (e) => { if (drag) pick(e); });
    c.addEventListener("pointerup", () => { drag = false; });
    draw(); onTheme(draw);
  };

  /* ---------- 1b. the engine on the test stand: move the valves, fire it ---------- */
  WIDGETS.stand = async (box) => {
    const D = await loadData(), m = M(), p = D.params;
    if (!window.ReStand) return;
    let u = [p.x_tfv_ref, p.x_tov_ref], s = null;
    const holder = el("div", {});
    const fire = el("button", { class: "re-btn re-primary", type: "button" }, "Shut down");
    box.append(el("div", { class: "re-controls" },
      slider("TFV", 0.15, 0.65, 0.01, u[0], fmt(2), (v) => { u[0] = v; update(); }),
      slider("TOV", 0.1, 0.5, 0.01, u[1], fmt(2), (v) => { u[1] = v; update(); }), fire), holder,
      el("div", { class: "re-note" }, "LUMEN on DLR's P8.3 bench, side view, at the steady state the two valves hold (", el("b", {}, "surrogate"),
        "). Open TOV and watch the flame turn bluer as the mixture ratio rises; open TFV and the pressure rises while the mixture ratio falls and the flame turns orange. Flame, steam and colours are coarse guesses; the ",
        el("a", { href: root + "primer/8-lab/" }, "Engine Lab"), " replays whole episodes on the same stand."));
    const stand = window.ReStand.create(holder, { state: "run", maxHeight: 380, runLabel: "steady state" });
    // the button's icon: play to ignite, a stop square to shut down
    function label(btn, ignite) {
      const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "hud-ic");
      s.innerHTML = ignite ? '<path d="M8 5.6v12.8a.9.9 0 0 0 1.4.75l9.6-6.4a.9.9 0 0 0 0-1.5L9.4 4.85A.9.9 0 0 0 8 5.6z" fill="currentColor" stroke="none"/>' : '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>';
      btn.replaceChildren(s, document.createTextNode(ignite ? " Ignite" : " Shut down"));
    }
    label(fire, false);
    fire.addEventListener("click", () => {
      if (stand.state === "run" || stand.state === "ignition" || stand.state === "spinup") { stand.shutdown(); label(fire, true); }
      else { stand.ignite(); label(fire, false); }
    });
    function update() {
      s = m.steadyState(u[0], u[1], p, s);
      const o = m.outputs(s, p);
      stand.setRow(Object.assign({}, o, { t: 0, t_turbine: o.t_rc, violations: { rof: o.rof > 4 || o.rof < 2.5, t_turbine: o.t_rc > 700, n_otp: o.n_otp > 28000, n_ftp: o.n_ftp > 50000, p_rc: o.p_rc < 46 } }));
      stand.setOverlay(["LUMEN at P8.3 · steady state", `p_cc ${o.p_cc.toFixed(1)} bar · ROF ${o.rof.toFixed(2)}`]);
    }
    update();
  };

  /* ---------- 2. the cycle: schematic with live steady-state flows ---------- */
  WIDGETS.cycle = async (box) => {
    const D = await loadData(), m = M(), p = D.params;
    let u = [0.3, 0.21];
    const svgWrap = el("div", {});
    const ctl = el("div", { class: "re-controls" },
      slider("TFV", 0.15, 0.65, 0.01, u[0], fmt(2), (v) => { u[0] = v; draw(); }),
      slider("TOV", 0.1, 0.5, 0.01, u[1], fmt(2), (v) => { u[1] = v; draw(); }));
    box.append(ctl, svgWrap, el("div", { class: "re-note" }, "Arrow width is mass flow; dashed lines are the turbopump shafts. The warm methane leaving the cooling channels is split between the two turbines, the vent (BPV) and the injector; what the turbines get sets the pump speeds, and the pumps set both propellant flows. ",
      el("b", {}, "Surrogate"), " steady state."));
    function draw() {
      const s = m.steadyState(u[0], u[1], p), o = m.outputs(s, p);
      const ink = css("--viz-ink"), ink2 = css("--viz-ink-2"), fuel = series(1), ox = series(2), hot = series(4), bg = css("--re-panel") || css("--md-default-bg-color");
      const wv = (f) => (1.5 + 5.5 * f).toFixed(1);
      const box_ = (x, y, w, h, t, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${ink2}" stroke-width="1.2"/><text x="${x + w / 2}" y="${y + h / 2 - (sub ? 5 : -4)}" text-anchor="middle" font-size="12" font-weight="600" fill="${ink}">${t}</text>` + (sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="11" fill="${ink2}">${sub}</text>` : "");
      const arrow = (d, color, f, label, lx, ly, anchor) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${wv(f)}" stroke-linecap="round" marker-end="url(#ah)" opacity="0.9"/>` + (label ? `<text x="${lx}" y="${ly}" font-size="11" fill="${ink2}" text-anchor="${anchor || "start"}">${label}</text>` : "");
      const tf = o.m_tf, to = o.m_to, warmInj = o.m_inj - p.m_byp;
      svgWrap.innerHTML = `<svg viewBox="0 0 760 340" width="100%" role="img" aria-label="Expander-bleed cycle schematic with live flows" style="font-family:${css("--viz-font")}">
        <defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${ink2}"/></marker></defs>
        <path d="M500 96 C500 -6 85 -6 85 26" fill="none" stroke="${ink2}" stroke-dasharray="3 4" stroke-width="1.2"/>
        <path d="M500 226 C500 336 85 336 85 314" fill="none" stroke="${ink2}" stroke-dasharray="3 4" stroke-width="1.2"/>
        ${arrow("M150 52 L204 52", fuel, o.m_rc / 2.5, o.m_rc.toFixed(2) + " kg/s", 177, 40, "middle")}
        ${arrow("M85 78 L85 190 C85 240 400 258 604 260", fuel, p.m_byp / 2.5, "FCV bypass " + p.m_byp.toFixed(2), 93, 150)}
        ${arrow("M290 80 L290 132", hot, o.m_rc / 2.5)}
        ${arrow("M372 150 L434 122", hot, tf / 2.5, tf.toFixed(2), 396, 124, "middle")}
        ${arrow("M372 172 L434 200", hot, to / 2.5, to.toFixed(2), 396, 205, "middle")}
        ${arrow("M342 134 C380 80 560 28 604 34", hot, o.m_bpv / 2.5, "BPV " + o.m_bpv.toFixed(2), 440, 64, "middle")}
        ${arrow("M562 114 L606 52", hot, tf / 2.5)}
        ${arrow("M562 198 C600 190 640 120 650 64", hot, to / 2.5)}
        ${arrow("M290 190 C290 250 450 278 604 278", hot, warmInj / 2.5, "warm fuel to injector " + warmInj.toFixed(2), 330, 238)}
        ${arrow("M150 292 L604 304", ox, o.m_lox / 6, "LOX " + o.m_lox.toFixed(2) + " kg/s", 160, 282)}
        ${box_(20, 26, 130, 52, "Fuel pump", Math.round(o.n_ftp) + " rpm")}
        ${box_(20, 262, 130, 52, "LOX pump", Math.round(o.n_otp) + " rpm")}
        ${box_(210, 28, 160, 52, "Cooling channels", (o.q_wall / 1e6).toFixed(2) + " MW in")}
        ${box_(210, 132, 160, 58, "Warm methane", Math.round(o.t_rc) + " K, " + o.p_rc.toFixed(0) + " bar")}
        ${box_(440, 96, 122, 46, "Fuel turbine", "TFV " + u[0].toFixed(2))}
        ${box_(440, 180, 122, 46, "LOX turbine", "TOV " + u[1].toFixed(2))}
        ${box_(610, 14, 130, 46, "Vent", (o.m_tf + o.m_to + o.m_bpv).toFixed(2) + " kg/s")}
        ${box_(610, 244, 130, 76, "Chamber", o.p_cc.toFixed(1) + " bar, ROF " + o.rof.toFixed(2))}
      </svg>`;
    }
    draw(); onTheme(draw);
  };

  /* ---------- 3. valve: command, dead time, rate limits ---------- */
  WIDGETS.valve = async (box) => {
    const D = await loadData(), m = M();
    const st = { step: 0.1, delay: D.params.valve_delay, vmax: D.params.valve_vmax, amax: D.params.valve_amax };
    const c = canvas(240);
    box.append(el("div", { class: "re-controls" },
      slider("step", 0.02, 0.4, 0.01, st.step, fmt(2), (v) => { st.step = v; draw(); }),
      slider("dead time [s]", 0, 0.15, 0.005, st.delay, fmt(3), (v) => { st.delay = v; draw(); }),
      slider("max speed [1/s]", 0.5, 4, 0.1, st.vmax, fmt(1), (v) => { st.vmax = v; draw(); }),
      slider("max accel. [1/s²]", 5, 40, 1, st.amax, fmt(0), (v) => { st.amax = v; draw(); })),
      c, legend([[css("--viz-ink-2"), "command", true], [series(1), "valve position"]]),
      el("div", { class: "re-note" }, "The valve model of the surrogate: a dead time, then a positioner that moves at most at the maximum speed, brakes before the target and settles without overshoot (LUMEN's valves have \"no overshoot\", thesis p. 56). DLR randomised dead time over 0.03–0.08 s and speed and acceleration by ±6–8 % in training (thesis Table A.3)."));
    function draw() {
      const p = Object.assign({}, D.params, { valve_delay: st.delay, valve_vmax: st.vmax, valve_amax: st.amax });
      const s = new Array(10).fill(0); s[m.X_TFV] = 0.3;
      const dt = 0.002, t = [], x = [], cmd = [];
      for (let k = 0; k <= 500; k++) {
        const tt = k * dt, u = tt >= 0.1 + st.delay ? 0.3 + st.step : 0.3;
        const err = u - s[0];
        const vDes = Math.sign(err) * Math.min(Math.sqrt(2 * p.valve_brake * p.valve_amax * Math.abs(err)), p.valve_vmax, Math.abs(err) / p.valve_tau_pos);
        s[1] += dt * Math.min(Math.max((vDes - s[1]) / p.valve_tau, -p.valve_amax), p.valve_amax);
        s[0] += dt * s[1];
        t.push(tt); x.push(s[0]); cmd.push(tt >= 0.1 ? 0.3 + st.step : 0.3);
      }
      plot(c, { x: t, lines: [{ y: cmd, color: css("--viz-ink-2"), dash: [5, 4], step: true }, { y: x, color: series(1) }], xlabel: "time [s]", ylabel: "opening", ylim: [0.28, 0.32 + st.step] });
    }
    draw(); onTheme(draw);
  };

  /* ---------- 4. step responses: fast TOV, slow TFV ---------- */
  WIDGETS.steps = async (box) => {
    const D = await loadData();
    const OUT = { p_cc: ["chamber pressure", "bar", 19.3, 0.4], rof: ["mixture ratio", "", 5.4, 0.6], m_lng: ["LNG pump flow", "kg/s", 15.5, 0.5], m_lox: ["LOX pump flow", "kg/s", 19.5, 0.5], t_lng: ["injection temperature", "K", 23.8, null] };
    let key = "p_cc";
    const c = canvas(260);
    box.append(el("div", { class: "re-controls" }, select("output", Object.entries(OUT).map(([k, v]) => [k, v[0]]), key, (v) => { key = v; draw(); })), c,
      legend([[series(2), "TOV +0.1 at t = 0"], [series(1), "TFV +0.1 at t = 0"], [css("--viz-ink-2"), "thesis Table 4.7 settling time (DLR model)", true]]),
      el("div", { class: "re-note" }, "Change from the 40 bar point after a +0.1 step of one valve, on the ", el("b", {}, "surrogate"), ". Its dynamics were fitted to DLR's settling times (dashed lines) and to the 6.5 bar pressure overshoot after a TFV step (thesis p. 73)."));
    function draw() {
      const S = D.steps, [name, unit, tsF, tsO] = OUT[key];
      const d = (arr) => arr.map((v) => v - arr[0]);
      const vl = [{ x: tsF, color: series(1), label: `TFV ${tsF} s` }];
      if (tsO != null) vl.push({ x: tsO, color: series(2), label: `TOV ${tsO} s` });
      plot(c, { x: S.TFV.t, lines: [{ y: d(S.TOV[key]), color: series(2) }, { y: d(S.TFV[key]), color: series(1) }], xlabel: "time after the step [s]", ylabel: `Δ ${name}${unit ? " [" + unit + "]" : ""}`, vlines: vl, hlines: [{ y: 0, color: css("--viz-axis"), dash: [] }] });
    }
    draw(); onTheme(draw);
  };

  /* ---------- 5. operating map: what the two valves can hold, and the constraints ---------- */
  WIDGETS.envelope = async (box) => {
    const D = await loadData(), T = D.trim, m = M();
    let field = "x_tfv";
    const FIELDS = { x_tfv: ["TFV opening", 0.1, 0.8], x_tov: ["TOV opening", 0.1, 0.7], t_w: ["turbine inlet temperature [K]", 250, 800], n_ftp: ["fuel pump speed [rpm]", 25000, 50000], n_otp: ["LOX pump speed [rpm]", 15000, 28000], p_rc: ["cooling-channel pressure [bar]", 40, 80] };
    const c = canvas(320), info = el("div", { class: "re-readout" }), scale = el("div", { class: "re-legend" });
    box.append(el("div", { class: "re-controls" }, select("colour by", Object.entries(FIELDS).map(([k, v]) => [k, v[0]]), field, (v) => { field = v; draw(); })), c, scale, info,
      el("div", { class: "re-note" }, "Each cell is a steady state of the ", el("b", {}, "surrogate"), " held by TFV and TOV alone (the other four valves frozen at their 40 bar positions). Crossed cells break a limit of thesis Table 5.1 or leave the valve range the environment allows (TFV 0.1–0.7, TOV 0.1–0.5). The dashed box is the reference range of the 2×2 task: 35–50 bar, ROF 3.0–3.8. Hover a cell."));
    const seq = css("--viz-seq").split(",").map((s) => s.trim());
    let fr = null;
    const bad = (cell) => !cell || cell.t_w > 700 || cell.n_ftp > 50000 || cell.n_otp > 28000 || cell.p_rc < 46 || cell.x_tfv > 0.7 || cell.x_tov > 0.5 || cell.x_tfv < 0.1 || cell.x_tov < 0.1;
    function draw() {
      const P = T.p_cc, R = T.rof, dp = P[1] - P[0], dr = R[1] - R[0];
      fr = plot(c, { x: [P[0] - dp / 2, P[P.length - 1] + dp / 2], lines: [], ylim: [R[0] - dr / 2, R[R.length - 1] + dr / 2], xlabel: "chamber pressure [bar]", ylabel: "mixture ratio" });
      const g = c.getContext("2d"), [fname, lo, hi] = FIELDS[field];
      const fmtv = (v) => (hi > 100 ? Math.round(v).toLocaleString("en") : v.toFixed(2));
      scale.replaceChildren(el("span", {}, fmtv(lo)), el("span", { style: `display:inline-block;width:9rem;height:0.7rem;border-radius:3px;background:linear-gradient(90deg,${seq.join(",")})` }),
        el("span", {}, fmtv(hi) + " " + fname), el("span", {}, "✕ breaks a limit or the valve range"));
      P.forEach((pc, i) => R.forEach((r, j) => {
        const cell = T.points[i][j];
        const x0 = fr.X(pc - dp / 2), x1 = fr.X(pc + dp / 2), y0 = fr.Y(r + dr / 2), y1 = fr.Y(r - dr / 2);
        if (cell) {
          const f = Math.min(Math.max((cell[field] - lo) / (hi - lo), 0), 0.999);
          g.fillStyle = seq[Math.floor(f * seq.length)];
          g.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
        }
        if (bad(cell)) {
          g.strokeStyle = css("--viz-s8"); g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(x0 + 4, y0 + 4); g.lineTo(x1 - 4, y1 - 4); g.moveTo(x1 - 4, y0 + 4); g.lineTo(x0 + 4, y1 - 4); g.stroke();
        }
      }));
      g.strokeStyle = css("--viz-ink"); g.setLineDash([6, 4]); g.lineWidth = 1.5;
      g.strokeRect(fr.X(35), fr.Y(3.8), fr.X(50) - fr.X(35), fr.Y(3.0) - fr.Y(3.8)); g.setLineDash([]);
    }
    c.addEventListener("pointermove", (e) => {
      if (!fr) return;
      const r = c.getBoundingClientRect();
      const pc = fr.invX(e.clientX - r.left);
      const rof = fr.ylim[0] + (1 - (e.clientY - r.top - fr.T) / (fr.h - fr.T - fr.B)) * (fr.ylim[1] - fr.ylim[0]);
      const i = Math.round((pc - T.p_cc[0]) / (T.p_cc[1] - T.p_cc[0])), j = Math.round((rof - T.rof[0]) / (T.rof[1] - T.rof[0]));
      const cell = T.points[i] && T.points[i][j];
      if (!cell) { info.replaceChildren(el("div", { class: "re-ro bad" }, el("span", {}, "no steady state"), el("b", {}, "unreachable"))); return; }
      const ro = (k, v, ok) => el("div", { class: "re-ro " + (ok === undefined ? "" : ok ? "ok" : "bad") }, el("span", {}, k), el("b", {}, v));
      info.replaceChildren(ro("point", `${T.p_cc[i]} bar, ${(+T.rof[j]).toFixed(1)}`), ro("TFV / TOV", cell.x_tfv.toFixed(2) + " / " + cell.x_tov.toFixed(2), cell.x_tfv <= 0.7 && cell.x_tov <= 0.5),
        ro("turbine inlet", Math.round(cell.t_w) + " K", cell.t_w <= 700), ro("FTP", Math.round(cell.n_ftp) + " rpm", cell.n_ftp <= 50000), ro("OTP", Math.round(cell.n_otp) + " rpm", cell.n_otp <= 28000), ro("p_RC", cell.p_rc.toFixed(1) + " bar", cell.p_rc >= 46));
    });
    draw(); onTheme(draw);
  };

  /* ---------- 6. sensors: what the controller sees ---------- */
  WIDGETS.sensors = async (box) => {
    const D = await loadData(), m = M(), p = D.params;
    const st = { delay: 0.2, noise: 0.005 };
    const model = new m.EngineModel(p, 0.005);
    model.reset(p.x_tfv_ref, p.x_tov_ref);
    const t = [], truth = [];
    for (let k = 0; k < 120; k++) { if (k === 20) model.command(p.x_tfv_ref, p.x_tov_ref + 0.08); const o = model.advance(0.05); t.push((k + 1) * 0.05); truth.push(o.rof); }
    const c = canvas(240);
    box.append(el("div", { class: "re-controls" },
      slider("ROF sensor delay [s]", 0, 0.3, 0.05, st.delay, fmt(2), (v) => { st.delay = v; draw(); }),
      slider("noise σ (ROF)", 0, 0.1, 0.005, st.noise, fmt(3), (v) => { st.noise = v; draw(); })),
      c, legend([[series(2), "true mixture ratio"], [series(1), "what the controller reads (every 0.1 s)"]]),
      el("div", { class: "re-note" }, "A TOV step at t = 1 s on the ", el("b", {}, "surrogate"), ". Mixture ratio is a ratio of two flow-meter readings, so it is both delayed and noisy: DLR randomised the flow-meter delays over 0.1–0.25 s (Table A.3), and on the real engine the steady-state noise of ROF was 3.0 % of its value (σ ≈ 0.1), ten times that of chamber pressure (thesis p. 116)."));
    function draw() {
      const r = m.rng(7), lag = Math.round(st.delay / 0.05), tm = [], meas = [];
      for (let k = 1; k < t.length; k += 2) { tm.push(t[k]); meas.push(truth[Math.max(0, k - lag)] + r.normal(0, st.noise)); }
      plot(c, { x: t, lines: [{ y: truth, color: series(2) }, { x: tm, y: meas, color: series(1), step: true, width: 1.6 }], xlabel: "time [s]", ylabel: "ROF" });
    }
    draw(); onTheme(draw);
  };

  /* ---------- 7. reward: the exponential tracking term ---------- */
  WIDGETS.reward = async (box) => {
    const st = { delta: 12, e: 1.0 };
    const c = canvas(230), ro = el("div", { class: "re-readout" });
    box.append(el("div", { class: "re-controls" },
      slider("δ (sharpness)", 2, 30, 1, st.delta, fmt(0), (v) => { st.delta = v; draw(); }),
      slider("error on both outputs [%]", 0, 10, 0.1, st.e, fmt(1), (v) => { st.e = v; draw(); })),
      c, ro, el("div", { class: "re-note" }, "Tracking reward per output, exp(−δ·|y − y_ref|/y_ref) − 1 (thesis eq. 5.7, δ = 12 in Table A.2). It is 0 at zero error, falls steeply for small errors and saturates at −1, so a large error is not punished much more than a medium one."));
    function draw() {
      const e = [], r = [], r6 = [], r24 = [];
      for (let i = 0; i <= 200; i++) { const x = i * 0.25; e.push(x); r.push(Math.exp(-st.delta * x / 100) - 1); r6.push(Math.exp(-6 * x / 100) - 1); r24.push(Math.exp(-24 * x / 100) - 1); }
      const now = Math.exp(-st.delta * st.e / 100) - 1;
      plot(c, { x: e, lines: [{ y: r6, color: css("--viz-axis"), width: 1.2 }, { y: r24, color: css("--viz-axis"), width: 1.2 }, { y: r, color: series(1) }], ylim: [-1.05, 0.05], xlabel: "absolute percentage error [%]", ylabel: "reward per output", vlines: [{ x: st.e, color: series(2) }] });
      ro.replaceChildren(...[["per output", now.toFixed(3)], ["per step, both outputs", (2 * now).toFixed(3)], ["30 s episode (300 steps)", (600 * now).toFixed(0)]]
        .map(([k, v]) => el("div", { class: "re-ro" }, el("span", {}, k), el("b", {}, v))));
    }
    draw(); onTheme(draw);
  };

  function init() {
    document.querySelectorAll(".re-widget[data-widget]").forEach((box) => {
      const fn = WIDGETS[box.dataset.widget];
      if (box.dataset.ready || !fn || !window.LumenModel) return;  // the Lab is lab.js's
      box.dataset.ready = "1";
      Promise.resolve(fn(box)).catch((err) => box.append(el("div", { class: "re-note" }, "Widget failed to load: " + err.message)));
    });
  }
  window.ReViz = { css, series, el, slider, select, canvas, plot, legend, onTheme, loadData, loadPolicy, fmt, WIDGETS };
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
