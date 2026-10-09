/* The test stand: LUMEN on DLR's P8.3 bench at Lampoldshausen, side view, animated.
 *
 * Driven by the surrogate's state (chamber pressure, mixture ratio, valve openings, pump speeds,
 * coolant temperature, flows, constraint violations). Layout after DLR's photos (Traudt et al., IAC 2024,
 * Figs. 3-4): horizontal firing out of the open side of the test cell, turbopumps on the frame,
 * a water-spray ring around the plume, steam downstream. The flame, smoke and colours are coarse
 * guesses, not measurements: plume length and brightness scale with chamber pressure, the colour
 * shifts from orange (fuel-rich) to blue-white (towards stoichiometric), shock diamonds space with
 * pressure, and the jet separates from the nozzle wall when throttled down (the nozzle extension is
 * designed for "no flow separation at nominal operating conditions (60 bar)", Deeken et al. 2021).
 * Start-up (GN2 spin-up, laser ignition, about 1.5 s pressure rise) and shutdown (about 0.5 s
 * pressure decay, then an LN2 purge) follow the shapes of DLR's hot-fire traces (IAC 2024, Fig. 5).
 *
 * Layers drawn on top of the hardware, each switchable: part names with their acronyms spelled out,
 * flow and temperature tags on the lines, the control loop (a controller cabinet, a sensor tap and
 * signal pulses at each control step), a thrust tag at the load cell, and callouts for events (start-up
 * phases, set-point steps, limits, malfunctions).
 * Hovering or tapping a part explains it with its live values.
 *
 * window.ReStand.create(parent, opts) -> { setRow(row), ignite(), shutdown(), setState(s), state,
 *   setOverlay(lines), setBadge(text, color), setRunLabel(text), setView({insets, focus}),
 *   setLayers({parts, flows, signals, callouts}), setController({label, kind, color, dt} | null),
 *   setPerturb({heat, tf, to, delay, delay0, sensorDelay, noise}), pulse(), callout(key, text, sub, anchor),
 *   setValveDrag(fn | null), zoomBy(f), resetZoom(), status(), advance(seconds), resize() }.
 * opts: { state, maxHeight, runLabel, fill (height from the parent), hud (no text overlay drawn on the
 *   canvas; the page shows it), onStatus(status) }. Needs nothing else; reads theme colours from the page. */
(function () {
  "use strict";
  const W = 1000, H = 420, GROUND = 372, AXIS = 262;
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], clamp(t, 0, 1))));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const isDark = () => document.body.getAttribute("data-md-color-scheme") === "slate";
  // ?capture=1 drives the animation from timers, so headless screenshots (virtual time) can show it moving.
  const CAPTURE = typeof location !== "undefined" && /[?&]capture=1/.test(location.search);
  const nextFrame = (cb) => (CAPTURE ? setTimeout(() => cb(performance.now()), 16) : requestAnimationFrame(cb));
  const LIM = () => (window.LumenModel && window.LumenModel.LIMITS) || { rof_min: 2.5, rof_max: 4.0, t_turbine_max: 700, n_otp_max: 28000, n_ftp_max: 50000, p_rc_min: 46 };
  const kRpm = (n) => `${(Math.round(n / 100) / 10).toFixed(1)}k`;
  // Thrust is proportional to chamber pressure: LUMEN's envelope of 35-80 bar is 58-133 % of its
  // nominal thrust at 60 bar (thesis Table 4.1), and the engine is "in the 25 kN thrust range" (thesis p. 5).
  const thrustN = (p) => 25000 * Math.max(0, p) / 60;
  const fmtN = (v) => `${Math.round(v / 10) * 10}`.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");

  // ---------------------------------------------------------------- engine geometry (world units)
  const G = { inj0: 368, cc0: 392, cc1: 446, thr: 468, exit: 556, rCC: 22, rT: 12, rE: 40 };
  function radiusAt(x) {
    if (x <= G.cc1) return G.rCC;
    if (x <= G.thr) return lerp(G.rCC, G.rT, (x - G.cc1) / (G.thr - G.cc1));
    const s = (x - G.thr) / (G.exit - G.thr);
    return G.rT + (G.rE - G.rT) * Math.pow(s, 0.62);
  }
  const OTP = { y: 165, pump: 190, turb: 246, rP: 22, rT: 18 };
  const FTP = { y: 318, pump: 190, turb: 246, rP: 22, rT: 18 };
  const RING = { x: 640, r: 74 };
  const CAB = { x: 470, y: 42, w: 62, h: 44 };  // the controller, drawn as a cabinet on the cell wall
  const SENSOR = { x: 418, y: AXIS - G.rCC - 9 };  // chamber pressure tap (and, in the drawing, the ROF read-out)
  // Pipes as polylines; kind sets the colour, flow() the speed of the moving dashes.
  const PIPES = [
    { id: "loxIn", kind: "lox", w: 7, pts: [[0, OTP.y], [OTP.pump - OTP.rP, OTP.y]] },
    { id: "lngIn", kind: "lng", w: 7, pts: [[0, FTP.y], [FTP.pump - FTP.rP, FTP.y]] },
    { id: "loxMain", kind: "lox", w: 6, pts: [[OTP.pump, OTP.y - OTP.rP], [OTP.pump, 128], [356, 128], [356, AXIS - 18], [G.inj0, AXIS - 18]] },
    { id: "lngMain", kind: "lng", w: 6, pts: [[FTP.pump + 10, FTP.y + FTP.rP - 3], [FTP.pump + 10, 354], [470, 354], [470, AXIS + G.rT + 7]] },
    { id: "fcv", kind: "lng", w: 3, pts: [[310, 354], [310, AXIS + 24], [G.inj0, AXIS + 24]] },
    { id: "ccOut", kind: "warm", w: 4, pts: [[G.cc0 + 4, AXIS - G.rCC - 6], [G.cc0 - 6, AXIS - G.rCC - 6], [G.inj0 + 2, AXIS - 8]] },
    { id: "hot", kind: "hot", w: 6, pts: [[G.exit - 8, AXIS - G.rE - 6], [G.exit - 8, 96], [300, 96]] },
    { id: "tov", kind: "hot", w: 5, pts: [[300, 96], [OTP.turb, 96], [OTP.turb, OTP.y - OTP.rT]] },
    { id: "tfv", kind: "hot", w: 5, pts: [[330, 96], [330, 236], [FTP.turb, 236], [FTP.turb, FTP.y - FTP.rT]] },
    { id: "exO", kind: "vent", w: 6, pts: [[OTP.turb + OTP.rT, OTP.y], [292, OTP.y], [292, 0]] },
    { id: "exF", kind: "vent", w: 6, pts: [[FTP.turb + FTP.rT, FTP.y], [292, FTP.y], [292, OTP.y]] },
  ];
  const PIPE_PART = { loxIn: "lox", loxMain: "lox", lngIn: "lng", lngMain: "lng", fcv: "fcv", ccOut: "jacket", hot: "hot", tov: "hot", tfv: "hot", exO: "exhaust", exF: "exhaust" };
  const VALVES = { tov: [OTP.turb, 120, "TOV"], tfv: [330, 168, "TFV"] };
  // Signal lines of the control loop (straight, so they read as wiring, not plumbing).
  const SIG = {
    meas: [[SENSOR.x, SENSOR.y], [SENSOR.x, 150], [CAB.x + 14, 150], [CAB.x + 14, CAB.y + CAB.h]],
    tov: [[CAB.x, CAB.y + 12], [VALVES.tov[0] + 26, VALVES.tov[1] - 7]],
    tfv: [[CAB.x, CAB.y + 32], [VALVES.tfv[0] + 26, VALVES.tfv[1] - 7]],
  };
  // Malfunctions (faults.py): where each one shows, and where a leak sprays from (x, y, direction).
  const FAULT_LEAK = { leak_fuel: [FTP.pump + 10, 342, 1], leak_lox: [OTP.pump, 138, -1] };
  const FAULT_AT = {
    stuck_tfv: [VALVES.tfv[0], VALVES.tfv[1], "tfv"], stuck_tov: [VALVES.tov[0], VALVES.tov[1], "tov"],
    actuator_delay: [VALVES.tfv[0], VALVES.tfv[1], "tfv"],
    bearing_ftp: [(FTP.pump + FTP.turb) / 2, FTP.y, "ftp"], bearing_otp: [(OTP.pump + OTP.turb) / 2, OTP.y, "otp"],
    leak_fuel: [FTP.pump + 10, 342, "ftp"], leak_lox: [OTP.pump, 138, "otp"],
    block_ft: [FTP.turb, FTP.y - FTP.rT, "ftp"], block_ot: [OTP.turb, OTP.y - OTP.rT, "otp"],
    heat: [(G.cc0 + G.cc1) / 2, AXIS - G.rCC, "chamber"], ageing: [OTP.turb, OTP.y, "otp"],
    sensor_pcc_bias: [SENSOR.x, SENSOR.y, "sensor"], sensor_pcc_drift: [SENSOR.x, SENSOR.y, "sensor"],
    sensor_pcc_frozen: [SENSOR.x, SENSOR.y, "sensor"], sensor_rof_gain: [SENSOR.x, SENSOR.y, "sensor"],
  };
  // Callout anchors: a world point and the direction (screen) in which the bubble sits.
  const ANCH = {
    chamber: [(G.cc0 + G.cc1) / 2, AXIS - G.rCC - 4, 0.15, -1], jacket: [(G.cc0 + G.thr) / 2, AXIS + G.rCC + 8, 0.2, 1],
    nozzle: [G.exit - 14, AXIS + G.rE + 4, 0.5, 1], plume: [G.exit + 170, AXIS - 28, 0.2, -1],
    tfv: [VALVES.tfv[0], VALVES.tfv[1] + 10, -0.35, 1], tov: [VALVES.tov[0], VALVES.tov[1] - 10, -0.2, -1],
    otp: [OTP.turb, OTP.y - OTP.rT, 0.1, -1], ftp: [FTP.turb, FTP.y + FTP.rT, 0.1, 1],
    cabinet: [CAB.x + CAB.w, CAB.y + CAB.h / 2, 1, 0.25], ring: [RING.x, AXIS - RING.r, 0.2, -1], hot: [430, 96, 0.3, -1],
    sensor: [SENSOR.x, SENSOR.y, -0.6, -1],
  };

  // ---------------------------------------------------------------- soft sprites for smoke and fire
  function sprite(rgb) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(rgb, 1));
    gr.addColorStop(0.45, rgba(rgb, 0.55));
    gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  function distToPolyline(px, py, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1), qx = ax + t * dx - px, qy = ay + t * dy - py;
      best = Math.min(best, Math.hypot(qx, qy));
    }
    return best;
  }
  function pointAlong(pts, s) {  // s in [0, 1] along the polyline length
    const seg = [];
    let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
    let d = clamp(s, 0, 1) * tot;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) { const t = seg[i] ? d / seg[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]; }
      d -= seg[i];
    }
    return pts[pts.length - 1];
  }

  function create(parent, opts) {
    opts = opts || {};
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    const cv = document.createElement("canvas");
    cv.className = "re-canvas re-stand";
    cv.setAttribute("role", "img");
    cv.style.touchAction = "pan-y";
    parent.appendChild(cv);
    const tip = document.createElement("div");
    tip.className = "re-stand-tip";
    tip.hidden = true;
    parent.appendChild(tip);
    const SPR = { white: sprite([255, 255, 255]), night: sprite([150, 160, 182]), grey: sprite([120, 118, 115]), soot: sprite([40, 36, 34]), fire: sprite([255, 110, 30]), flame: sprite([255, 205, 90]), blue: sprite([170, 200, 255]) };
    let dpr = 1, narrow = false;
    function resize() {
      const w = Math.max(240, parent.clientWidth || 800);
      narrow = w < 640;
      let h;
      if (opts.fill) h = Math.max(160, parent.clientHeight || 400);
      else {
        // narrow screens: show the engine and the plume (world x from 300), larger
        const VW = narrow ? W - 300 : W;
        h = clamp(Math.round(w * H / VW), narrow ? 200 : 260, opts.maxHeight || 470);
      }
      dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = h + "px";
      cv._w = w; cv._h = h;
      cam.ready = false;
    }

    // ---- state
    const S = {
      state: opts.state || "run",  // off | spinup | ignition | run | shutdown | purge
      since: 0, t: 0, row: null, vis: { p: 0, rof: 3.4 }, overlay: [], badge: null,
      parts: [], rot: { o: 0, f: 0 }, flowPhase: {}, jacketPhase: 0, nozzleHeat: 0, flash: 0, frost: 1, runLabel: opts.runLabel || "closed loop",
      layers: { parts: false, flows: false, signals: true, callouts: true }, controller: null, perturb: null,
      callouts: [], dots: [], lastPulse: -1, ledT: -1, hover: null, drag: null, valveDrag: null,
      faults: [], shake: 0, redFlash: 0, shocks: [],
    };
    for (const p of PIPES) S.flowPhase[p.id] = 0;
    const cam = { s: 1, ox: 0, oy: 0, ready: false };
    const view = { insets: { l: 0, r: 0, t: 0, b: 0 }, focus: null, zoom: 1, cx: null, cy: null };
    resize();
    const st = () => S.state;
    function go(state, announce) {
      S.state = state; S.since = 0;
      if (announce) sequenceCallout(state);
    }
    function sequenceCallout(state) {
      const c = {
        spinup: ["Start-up: GN2 spins the turbopumps", "gaseous nitrogen drives both turbines before ignition", "otp"],
        ignition: ["Laser ignition", "chamber pressure rises over about 1.5 s", "chamber"],
        run: [S.controller && S.controller.kind !== "open" ? `Closed loop: ${S.controller.label} has the valves` : "Main stage", S.controller && S.controller.kind === "open" ? "the valves follow a fixed schedule" : `it reads p_cc and ROF every ${(S.controller && S.controller.dt) || 0.05} s`, "cabinet"],
        shutdown: ["Shutdown", "main valves close; pressure decays in about 0.5 s", "chamber"],
        purge: ["LN2 purge", "liquid nitrogen flushes the lines and the chamber", "nozzle"],
      }[state];
      if (c) callout("seq", c[0], c[1], c[2]);
    }

    // ---- visual chamber pressure follows the simulation (run) or the start/stop sequence
    function targetP() {
      const p = S.row ? S.row.p_cc : 40;
      const tt = S.since;
      switch (S.state) {
        case "off": case "purge": return 0;
        case "spinup": return 0;
        case "ignition": return p * clamp(tt / 1.5, 0, 1) * (1 + 0.08 * Math.sin(Math.min(tt, 1.5) * 4));  // IAC 2024 Fig. 5: about 1.5 s
        case "shutdown": return S.vis.p0 * Math.exp(-tt / 0.18);  // about 0.5 s to a few bar
        default: return p;
      }
    }

    // ---- particles
    function emit(n, f) { for (let i = 0; i < n && S.parts.length < 520; i++) S.parts.push(f()); }
    const R = Math.random;
    function step(dt) {
      S.t += dt; S.since += dt;
      const run = S.state === "run" || S.state === "ignition" || S.state === "shutdown";
      // sequence transitions
      if (S.state === "spinup" && S.since > 1.0) { go("ignition", true); S.flash = 1; }
      if (S.state === "ignition" && S.since > 1.6) go("run", true);
      if (S.state === "shutdown" && S.since > 0.7) go("purge", true);
      if (S.state === "purge" && S.since > 3.5) go("off");
      const pt = targetP();
      if (S.state === "shutdown" && S.vis.p0 === undefined) S.vis.p0 = S.vis.p;
      if (S.state !== "shutdown") S.vis.p0 = undefined;
      S.vis.p = S.state === "run" ? lerp(S.vis.p, pt, 1 - Math.exp(-dt / 0.08)) : pt;
      if (S.row) S.vis.rof = lerp(S.vis.rof, S.row.rof, 1 - Math.exp(-dt / 0.1));
      const P = S.vis.p, on = P > 2;
      // pump rotation (visual: slowed down a lot, so the blades read as spinning, not as a blur)
      const spin = S.state === "spinup" ? clamp(S.since, 0, 1) * 0.35 : S.state === "off" || S.state === "purge" ? 0 : 1;
      const nO = S.row ? S.row.n_otp : 20000, nF = S.row ? S.row.n_ftp : 32000;
      S.rot.o += dt * spin * Math.max(P / 40, S.state === "spinup" ? 1 : 0) * nO / 2500;
      S.rot.f += dt * spin * Math.max(P / 40, S.state === "spinup" ? 1 : 0) * nF / 2500;
      const r = S.row || {};
      const flows = { lox: r.m_lox || 3.8, lng: r.m_lng || 2, warm: r.m_rc || 1.6, hot: (r.m_tf || 0.3) + (r.m_to || 0.3), tfv: r.m_tf || 0.3, tov: r.m_to || 0.3, vent: (r.m_tf || 0.3) + (r.m_to || 0.3) };
      const scaleFlow = run ? clamp(P / 40, 0, 1.4) : S.state === "spinup" ? 0.2 : 0;
      for (const p of PIPES) {
        const m = flows[p.id === "tfv" ? "tfv" : p.id === "tov" ? "tov" : p.kind] || 1;
        S.flowPhase[p.id] += dt * scaleFlow * 40 * Math.sqrt(m);
      }
      S.jacketPhase += dt * scaleFlow * 30 * Math.sqrt(flows.warm);
      S.flash = Math.max(0, S.flash - dt * 2.5);
      S.nozzleHeat = lerp(S.nozzleHeat, on ? clamp(P / 55, 0, 1) : 0, 1 - Math.exp(-dt / (on ? 1.5 : 6)));
      S.frost = lerp(S.frost, 1, dt * 0.05);
      // emitters
      const rof = S.vis.rof, rich = clamp((3.6 - rof) / 1.0, 0, 1);
      if (on) {
        const L = plumeLength(P);
        // water spray ring -> steam, the bigger the plume the more
        emit(Math.round(dt * (6 + P * 0.3)), () => ({ k: "steam", x: RING.x + 30 + R() * 60, y: AXIS + RING.r * (0.4 + 0.6 * R()), vx: 30 + R() * 40, vy: -10 - R() * 18, r: 12 + R() * 14, g: 10, life: 4 + R() * 3, age: 0, a: 0.3 }));
        // steam rising from the far plume
        emit(Math.round(dt * 9 * (P / 40)), () => ({ k: "steam", x: G.exit + L * (0.75 + R() * 0.5), y: AXIS - 20 + (R() - 0.5) * 50, vx: 40 + R() * 40, vy: -22 - R() * 22, r: 20 + R() * 20, g: 14, life: 3 + R() * 3, age: 0, a: 0.24 }));
        // afterburning of the fuel-rich exhaust in air: orange billows rising off the plume
        emit(Math.round(dt * (14 + 60 * rich) * clamp(P / 40, 0.3, 1.5)), () => ({ k: "fire", x: G.exit + L * (0.3 + R() * 0.6), y: AXIS - 8 - R() * 22, vx: 25 + R() * 30, vy: -50 - R() * 60, r: 5 + R() * 8, g: 10, life: 0.5 + R() * 0.7, age: 0, a: 0.45 + 0.35 * rich, s: R() * 6 }));
        // turbine exhaust from the vent stack
        emit(Math.round(dt * 8), () => ({ k: "vent", x: 292 + (R() - 0.5) * 6, y: 2, vx: 25 + R() * 20, vy: -8 - R() * 8, r: 6 + R() * 6, g: 8, life: 2.5 + R() * 1.5, age: 0, a: 0.22 }));
      }
      // cold propellant lines condense air: mist sinks off the LOX line and pump (always, more when flowing)
      emit(Math.round(dt * (S.state === "off" ? 3 : 6)), () => {
        const onLox = R() < 0.6, x = onLox ? R() * (OTP.pump - 10) : R() * (FTP.pump - 10);
        return { k: "mist", x, y: (onLox ? OTP.y : FTP.y) + 4, vx: 4 + R() * 6, vy: 6 + R() * 10, r: 8 + R() * 10, g: 5, life: 3 + R() * 2, age: 0, a: 0.18 };
      });
      // shutdown: LN2 purge gushes out of the nozzle, then drifts and lingers
      if (S.state === "purge" && S.since < 2.2) {
        const k = 1 - S.since / 2.2;
        emit(Math.round(dt * 70 * k), () => ({ k: "purge", x: G.exit + 4, y: AXIS + (R() - 0.5) * G.rE * 1.4, vx: 160 + R() * 180 * k, vy: (R() - 0.5) * 40 - 8, r: 10 + R() * 12, g: 22, life: 3 + R() * 3, age: 0, a: 0.4 }));
      }
      if (S.state === "shutdown") emit(Math.round(dt * 60), () => ({ k: "smoke", x: G.exit + R() * 120, y: AXIS + (R() - 0.5) * 50, vx: 60 + R() * 60, vy: -20 - R() * 20, r: 14 + R() * 14, g: 14, life: 3 + R() * 2, age: 0, a: 0.3 }));
      // malfunctions: sparks off a worn bearing, a jet out of a leak (faults.py)
      const live = S.state !== "off" && S.state !== "purge";
      for (const f of S.faults) {
        if (f.sev <= 0 || !live) continue;
        if (f.kind === "bearing_ftp" || f.kind === "bearing_otp") {
          const U = f.kind === "bearing_ftp" ? FTP : OTP, bx = (U.pump + U.turb) / 2;
          emit(Math.round(dt * 80 * Math.min(1, f.sev * 4) + R()), () => ({ k: "spark", x: bx + (R() - 0.5) * 14, y: U.y + (R() - 0.5) * 8, vx: (R() - 0.5) * 240, vy: -40 - R() * 170, r: 1, g: 0, life: 0.25 + R() * 0.45, age: 0, a: 1 }));
          if (R() < dt * 5) emit(1, () => ({ k: "smoke", x: bx, y: U.y - 10, vx: 6 + R() * 10, vy: -18 - R() * 12, r: 4 + R() * 4, g: 8, life: 1.6 + R(), age: 0, a: 0.3 }));
        } else if (f.kind === "block_ft" || f.kind === "block_ot") {  // a choked turbine nozzle: sparks at the inlet, soot out of the exhaust
          const U = f.kind === "block_ft" ? FTP : OTP, k = Math.min(1, f.sev * f.mag * 3);
          emit(Math.round(dt * 30 * k + R() * 0.6), () => ({ k: "spark", x: U.turb + (R() - 0.5) * 8, y: U.y - U.rT - 2, vx: (R() - 0.5) * 160, vy: -30 - R() * 120, r: 1, g: 0, life: 0.2 + R() * 0.35, age: 0, a: 1 }));
          if (R() < dt * 6 * k) emit(1, () => ({ k: "soot", x: U.turb + U.rT + 4, y: U.y - 4, vx: 14 + R() * 10, vy: -14 - R() * 10, r: 4 + R() * 3, g: 7, life: 1.8 + R(), age: 0, a: 0.4 }));
        } else if (f.kind === "ageing") {  // worn turbines: the odd spark and rust flakes on both
          for (const U of [OTP, FTP]) {
            if (R() < dt * 10 * f.sev) emit(1, () => ({ k: "spark", x: U.turb + (R() - 0.5) * 16, y: U.y + (R() - 0.5) * 12, vx: (R() - 0.5) * 120, vy: -20 - R() * 90, r: 1, g: 0, life: 0.2 + R() * 0.3, age: 0, a: 1 }));
            if (R() < dt * 3 * f.sev) emit(1, () => ({ k: "rust", x: U.turb + (R() - 0.5) * 20, y: U.y + U.rT * 0.6, vx: (R() - 0.5) * 10, vy: 10 + R() * 10, r: 1.6, g: 0, life: 2 + R(), age: 0, a: 0.9 }));
          }
        } else if ((f.kind === "stuck_tfv" || f.kind === "stuck_tov") && S.row) {  // the actuator motor strains against the frozen stem
          const key = f.kind.slice(6), [vx0, vy0] = VALVES[key], gap = Math.abs((S.row["u_" + key] ?? S.row["x_" + key]) - S.row["x_" + key]);
          if (gap > 0.01) emit(Math.round(dt * 40 * Math.min(1, gap * 8) + R() * 0.7), () => ({ k: "zap", x: vx0 + 18 + (R() - 0.5) * 12, y: vy0 + (R() - 0.5) * 10, vx: (R() - 0.5) * 120, vy: (R() - 0.5) * 120, r: 1, g: 0, life: 0.14 + R() * 0.18, age: 0, a: 1, s: R() * 10 }));
        } else if (f.kind === "leak_fuel" || f.kind === "leak_lox") {
          const [lx, ly, dir] = FAULT_LEAK[f.kind];
          emit(Math.round(dt * 110 * Math.min(1, f.sev * 4) + R()), () => ({ k: "leak", lox: f.kind === "leak_lox", x: lx + dir * 4, y: ly, vx: dir * (110 + R() * 140), vy: (R() - 0.7) * 80, r: 2 + R() * 3, g: 24, life: 0.7 + R() * 0.9, age: 0, a: 0.65 }));
        }
      }
      S.shake = Math.max(0, S.shake - dt * 2.6);
      S.redFlash = Math.max(0, S.redFlash - dt * 1.6);
      for (const k of S.shocks) k.age += dt;
      S.shocks = S.shocks.filter((k) => k.age < 0.9);
      // move
      const wind = 18;
      for (const q of S.parts) {
        q.age += dt;
        q.vx += (wind - q.vx) * dt * (q.k === "purge" ? 0.7 : 0.35);
        if (q.k === "fire") q.vy -= 10 * dt; else if (q.k === "mist") q.vy += 2 * dt;
        else if (q.k === "spark") q.vy += 420 * dt; else if (q.k === "leak") q.vy += 70 * dt; else if (q.k === "rust") q.vy += 30 * dt; else if (q.k === "zap") q.vy += 0; else q.vy -= 3 * dt;
        if (q.k === "spark") q.vx *= 1 - dt * 0.8; else q.vx += 0;
        q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.g * dt;
        if (q.k === "zap" || q.k === "rust") q.vx = q.k === "rust" ? q.vx * (1 - dt) : q.vx;
        if (q.k === "spark" && q.y > GROUND) { q.y = GROUND; q.vy *= -0.35; q.vx *= 0.6; }
        else if (q.k !== "mist" && q.k !== "vent" && q.y > GROUND - q.r * 0.3) q.y = GROUND - q.r * 0.3;
      }
      S.parts = S.parts.filter((q) => q.age < q.life && q.x < xR + 80 && q.y > yT - 80);
      // signal pulses and callouts
      for (const d of S.dots) d.age += dt;
      S.dots = S.dots.filter((d) => d.age < d.delay + 0.22);
      for (const c of S.callouts) c.age += dt;
      S.callouts = S.callouts.filter((c) => c.age < c.life);
      // camera eases towards the view that fits the free space between the panels
      const tc = targetCam();
      if (!cam.ready || reduce) { Object.assign(cam, tc); cam.ready = true; }
      else { const a = 1 - Math.exp(-dt / 0.22); cam.s = lerp(cam.s, tc.s, a); cam.ox = lerp(cam.ox, tc.ox, a); cam.oy = lerp(cam.oy, tc.oy, a); }
      emitStatus();
    }
    function plumeLength(P) { return 330 * Math.pow(clamp(P / 50, 0, 1.6), 1.1); }

    // ---------------------------------------------------------------- camera
    function targetCam() {
      const w = cv._w, h = cv._h, I = view.insets;
      const f0 = view.focus || (narrow && !opts.fill ? { x0: 300, x1: W, y0: 0, y1: H } : { x0: 0, x1: W, y0: 0, y1: H });
      const z = view.zoom, fw = (f0.x1 - f0.x0) / z, fh = (f0.y1 - f0.y0) / z;
      // zoomed in: a smaller box around the chosen centre, kept on the stand
      const keep = (c, half, lo, hi) => (hi - lo < 2 * half ? (lo + hi) / 2 : clamp(c, lo + half, hi - half));
      const cx = z > 1.001 ? keep(view.cx ?? (f0.x0 + f0.x1) / 2, fw / 2, -60, W + 160) : (f0.x0 + f0.x1) / 2;
      const cy = z > 1.001 ? keep(view.cy ?? (f0.y0 + f0.y1) / 2, fh / 2, -40, H + 30) : (f0.y0 + f0.y1) / 2;
      if (z > 1.001) { view.cx = cx; view.cy = cy; }
      const x0 = cx - fw / 2, y0 = cy - fh / 2;
      const aw = Math.max(60, w - I.l - I.r), ah = Math.max(60, h - I.t - I.b);
      const s = Math.min(aw / fw, ah / fh);
      return { s, ox: I.l + (aw - fw * s) / 2 - x0 * s, oy: I.t + (ah - fh * s) * (z > 1.001 ? 0.5 : f0.v ?? 0.5) - y0 * s };
    }
    const toS = (x, y) => [cam.ox + x * cam.s, cam.oy + y * cam.s];
    const toW = (px, py) => [(px - cam.ox) / cam.s, (py - cam.oy) / cam.s];

    // ---------------------------------------------------------------- drawing
    function palette() {
      const d = isDark();
      return d ? {
        sky0: [12, 18, 40], sky1: [36, 48, 82], forest0: [16, 24, 30], forest1: [10, 16, 20], ground: [38, 40, 44], gravel: [30, 32, 34],
        wall: [52, 56, 66], wall2: [44, 47, 56], roof: [70, 74, 84], floor: [60, 62, 68], steel: [128, 136, 150], steelDark: [86, 92, 104], ink: "#e4e8f2", ink2: "#a8b0c4",
        copper: [178, 104, 64], nickel: [150, 150, 158], halo: "rgba(10,14,28,0.78)", pill: "rgba(12,18,36,0.86)", dark: true,
      } : {
        sky0: [122, 172, 232], sky1: [204, 226, 247], forest0: [76, 120, 88], forest1: [52, 92, 64], ground: [150, 148, 140], gravel: [170, 162, 146],
        wall: [214, 214, 208], wall2: [196, 196, 190], roof: [178, 178, 172], floor: [186, 186, 180], steel: [150, 156, 166], steelDark: [104, 110, 122], ink: "#1d2236", ink2: "#4a5068",
        copper: [202, 108, 58], nickel: [168, 168, 176], halo: "rgba(255,255,255,0.82)", pill: "rgba(255,255,255,0.9)", dark: false,
      };
    }
    let xR = W, xL = 0, yT = 0, yB = H;  // visible world extent (wider than W when the canvas is letterboxed)
    function forest(g, C, y0, amp, seed, color) {
      g.fillStyle = rgba(color, 1);
      g.beginPath();
      g.moveTo(560, GROUND);
      for (let x = 560; x <= xR + 10; x += 6) {
        const h = amp * (0.55 + 0.45 * Math.sin(x * 0.045 + seed) * Math.sin(x * 0.013 + seed * 2)) + amp * 0.25 * Math.abs(Math.sin(x * 0.21 + seed));
        g.lineTo(x, y0 - h);
      }
      g.lineTo(xR + 10, GROUND);
      g.closePath();
      g.fill();
    }
    function pipePath(g, pts) { g.beginPath(); g.moveTo(pts[0][0] === 0 ? xL - 5 : pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }
    function pipeColor(kind, C, row) {
      if (kind === "lox") return [70, 140, 235];
      if (kind === "lng") return [70, 200, 210];
      if (kind === "vent") return C.dark ? [150, 150, 160] : [130, 130, 140];
      const T = row ? row.t_turbine || row.t_rc || 470 : 470;  // warm methane, coloured by temperature
      const f = clamp((T - 250) / 500, 0, 1);
      return kind === "warm" ? mix([235, 170, 70], [240, 90, 40], f * 0.6) : mix([240, 170, 60], [235, 60, 40], f);
    }
    const pulseA = () => 0.55 + 0.45 * Math.sin(S.t * 8);
    function viol(k) { return !!(S.row && S.row.violations && S.row.violations[k]) && S.state === "run"; }
    function drawPipes(g, C) {
      const row = S.row;
      for (const p of PIPES) {
        const col = pipeColor(p.kind, C, row);
        g.lineJoin = "round"; g.lineCap = "round";
        const lit = S.hover && S.hover === PIPE_PART[p.id];
        const hotViol = (p.kind === "hot" || p.id === "ccOut") && viol("t_turbine");
        if (lit || hotViol) { pipePath(g, p.pts); g.strokeStyle = hotViol ? `rgba(255,77,77,${0.55 * pulseA()})` : "rgba(255,170,60,0.5)"; g.lineWidth = p.w + 10; g.stroke(); }
        pipePath(g, p.pts);
        g.strokeStyle = rgba(C.steelDark, 1); g.lineWidth = p.w + 3; g.stroke();
        pipePath(g, p.pts);
        g.strokeStyle = rgba(mix(col, C.dark ? [20, 20, 30] : [255, 255, 255], 0.35), 1); g.lineWidth = p.w; g.stroke();
        // flow: moving dashes
        const live = S.state !== "off" && S.state !== "purge" || p.kind === "lox";
        if (live) {
          pipePath(g, p.pts);
          g.setLineDash([3, 9]); g.lineDashOffset = -S.flowPhase[p.id];
          g.strokeStyle = rgba(col, 0.95); g.lineWidth = Math.max(1.5, p.w - 3); g.stroke();
          g.setLineDash([]);
        }
        // frost on the cryogenic lines
        if (p.kind === "lox" || p.kind === "lng") {
          pipePath(g, p.pts);
          g.strokeStyle = `rgba(255,255,255,${0.22 * S.frost})`; g.lineWidth = p.w + 5; g.setLineDash([1, 5]); g.stroke(); g.setLineDash([]);
        }
      }
    }
    function drawValve(g, C, key, open, cmd) {
      const [x, y] = VALVES[key];
      const moving = cmd != null ? cmd - open : 0;
      const stuck = fault("stuck_" + key), lag = fault("actuator_delay");
      if (stuck) {  // frozen: a red ring, and the actuator straining while the command moves on
        g.save(); g.beginPath(); g.arc(x + 6, y, 21, 0, 2 * Math.PI);
        g.strokeStyle = `rgba(224,36,94,${0.5 + 0.4 * pulseA()})`; g.lineWidth = 3; g.stroke(); g.restore();
      } else if (lag) {
        g.save(); g.beginPath(); g.arc(x + 6, y, 20, 0, 2 * Math.PI); g.strokeStyle = `rgba(232,162,0,${0.4 + 0.3 * pulseA()})`; g.lineWidth = 2; g.setLineDash([3, 3]); g.stroke(); g.restore();
      }
      // halo while the valve travels towards its command, the stronger the further it has to go
      if (Math.abs(moving) > 0.003 && S.state !== "off") {
        g.save(); g.globalCompositeOperation = C.dark ? "lighter" : "source-over";
        const gl = g.createRadialGradient(x, y, 2, x, y, 26);
        gl.addColorStop(0, `rgba(255,154,60,${clamp(Math.abs(moving) * 12, 0.15, 0.55)})`); gl.addColorStop(1, "rgba(255,154,60,0)");
        g.fillStyle = gl; g.fillRect(x - 28, y - 28, 56, 56); g.restore();
      }
      if (S.hover === key || S.drag === key) { g.beginPath(); g.arc(x + 6, y, 22, 0, 2 * Math.PI); g.strokeStyle = "rgba(255,170,60,0.85)"; g.lineWidth = 2; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]); }
      if (stuck) {  // jammed: a red disc with warning hatching behind the body
        g.save(); g.beginPath(); g.arc(x, y, 17, 0, 2 * Math.PI); g.clip();
        g.fillStyle = "rgba(224,36,94,0.16)"; g.fillRect(x - 17, y - 17, 34, 34);
        g.strokeStyle = "rgba(224,36,94,0.55)"; g.lineWidth = 2.2;
        for (let d = -34; d <= 34; d += 7) { g.beginPath(); g.moveTo(x + d - 17, y + 17); g.lineTo(x + d + 17, y - 17); g.stroke(); }
        g.restore();
      }
      g.save(); g.translate(x, y); g.rotate(Math.PI / 2);
      g.fillStyle = rgba(C.steel, 1); g.strokeStyle = stuck ? "#e0245e" : rgba(C.steelDark, 1); g.lineWidth = stuck ? 1.6 : 1.2;
      g.beginPath(); g.moveTo(-11, -9); g.lineTo(11, 9); g.lineTo(11, -9); g.lineTo(-11, 9); g.closePath(); g.fill(); g.stroke();
      // the gate: a bar across the bore that swings open with the valve
      const gate = (v) => (1 - clamp(v / 0.7, 0, 1)) * Math.PI / 2;
      if ((stuck || lag) && cmd != null && Math.abs(cmd - open) > 0.005) {  // where the controller wants it: a ghost of the gate
        const ac = gate(cmd);
        g.strokeStyle = C.dark ? "rgba(255,255,255,0.85)" : "rgba(29,34,54,0.85)"; g.lineWidth = 2; g.setLineDash([3, 2]);
        g.beginPath(); g.moveTo(-8 * Math.cos(ac), -8 * Math.sin(ac)); g.lineTo(8 * Math.cos(ac), 8 * Math.sin(ac)); g.stroke(); g.setLineDash([]);
      }
      g.strokeStyle = stuck ? "#e0245e" : "#ff9a3c"; g.lineWidth = stuck ? 3 : 2.4; g.lineCap = "round";
      const a = gate(open);
      g.beginPath(); g.moveTo(-7 * Math.cos(a), -7 * Math.sin(a)); g.lineTo(7 * Math.cos(a), 7 * Math.sin(a)); g.stroke();
      g.restore();
      // actuator and opening gauge, with the command as a white tick
      g.save();
      if (stuck && Math.abs(moving) > 0.01) g.translate(Math.sin(S.t * 70) * 0.7, 0);
      g.fillStyle = rgba(C.steelDark, 1);
      g.fillRect(x + 10, y - 7, 16, 14);
      g.restore();
      if (stuck) padlock(g, x - 14, y - 16, 1.1, "#e0245e");
      const a0 = Math.PI * 0.75, span = Math.PI * 1.5, a1 = a0 + span * clamp(open, 0, 1);
      g.beginPath(); g.arc(x + 18, y, 5.5, a0, a0 + span); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.arc(x + 18, y, 5.5, a0, a1); g.strokeStyle = "#ff9a3c"; g.stroke();
      if (cmd != null && (stuck || lag) && Math.abs(cmd - open) > 0.005) {  // the gap between command and opening, in red (amber for lag)
        const ac = a0 + span * clamp(cmd, 0, 1);
        g.beginPath(); g.arc(x + 18, y, 5.5, Math.min(a1, ac), Math.max(a1, ac)); g.strokeStyle = stuck ? "#e0245e" : "#e8a200"; g.lineWidth = 2.6; g.stroke();
      }
      if (cmd != null) {
        const ac = a0 + span * clamp(cmd, 0, 1);
        g.beginPath(); g.moveTo(x + 18 + Math.cos(ac) * 3, y + Math.sin(ac) * 3); g.lineTo(x + 18 + Math.cos(ac) * 8.5, y + Math.sin(ac) * 8.5);
        g.strokeStyle = C.dark ? "#ffffff" : "#1d2236"; g.lineWidth = 1.4; g.stroke();
      }
    }
    function drawTurbopump(g, C, U, rot, n, nMax, bad, lit, fx) {
      fx = fx || {};
      g.save();
      if (fx.bearing) { const b = Math.min(1, fx.bearing); g.translate(Math.sin(S.t * 97) * 1.0 * b, Math.cos(S.t * 113) * 0.7 * b); }  // a worn bearing rattles the pump, a little
      // bearing block and shaft
      g.fillStyle = rgba(C.steelDark, 1);
      g.fillRect(U.pump + 8, U.y - 8, U.turb - U.pump - 16, 16);
      // stand
      g.fillStyle = rgba(C.steel, 0.9);
      g.fillRect(U.pump - 6, U.y + U.rP, 12, GROUND - U.y - U.rP);
      g.fillRect(U.turb - 5, U.y + U.rT, 10, GROUND - U.y - U.rT);
      if (bad || lit) {
        g.save(); g.globalAlpha = bad ? 0.6 * pulseA() : 0.5;
        g.strokeStyle = bad ? "#ff4d4d" : "#ffaa3c"; g.lineWidth = 6;
        g.beginPath(); g.roundRect ? g.roundRect(U.pump - U.rP - 6, U.y - U.rP - 6, U.turb + U.rT - U.pump + U.rP + 12, 2 * U.rP + 12, 14) : g.rect(U.pump - U.rP - 6, U.y - U.rP - 6, U.turb + U.rT - U.pump + U.rP + 12, 2 * U.rP + 12);
        g.stroke(); g.restore();
      }
      const turbCol = mix(mix(C.steel, [230, 140, 80], 0.35), [150, 82, 40], (fx.rust || 0) * 4);  // ageing: rust
      for (const [cx, r, blades, col] of [[U.pump, U.rP, 6, C.steel], [U.turb, U.rT, 14, turbCol]]) {
        g.beginPath(); g.arc(cx, U.y, r, 0, 2 * Math.PI);
        g.fillStyle = rgba(col, 1); g.fill();
        g.lineWidth = bad && cx === U.turb ? 2.5 : 1.3; g.strokeStyle = bad && cx === U.turb ? "#ff4d4d" : rgba(C.steelDark, 1); g.stroke();
        // rotating wheel
        g.save(); g.translate(cx, U.y); g.rotate(rot);
        g.strokeStyle = C.dark ? "rgba(20,24,36,0.85)" : "rgba(40,44,56,0.75)"; g.lineWidth = cx === U.pump ? 2 : 1.2;
        for (let i = 0; i < blades; i++) {
          const a = (i / blades) * 2 * Math.PI;
          g.beginPath(); g.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
          g.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.6, Math.sin(a + 0.5) * r * 0.6, Math.cos(a + 0.35) * r * 0.85, Math.sin(a + 0.35) * r * 0.85);
          g.stroke();
        }
        g.restore();
        g.beginPath(); g.arc(cx, U.y, 3, 0, 2 * Math.PI); g.fillStyle = rgba(C.steelDark, 1); g.fill();
      }
      // speed ring around the pump: the fraction of the speed limit, amber above 90 %, red above it
      if (n) {
        const f = n / nMax, col = f > 1 ? "#ff4d4d" : f > 0.9 ? "#f2a900" : "#1baf7a";
        g.beginPath(); g.arc(U.pump, U.y, U.rP + 4, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * clamp(f, 0, 1));
        g.strokeStyle = col; g.lineWidth = 2.6; g.lineCap = "round"; g.stroke();
      }
      if (fx.bearing) {  // the hot bearing between pump and turbine
        const bx = (U.pump + U.turb) / 2, a = 0.35 + 0.35 * fx.bearing * (0.7 + 0.3 * Math.sin(S.t * 14));
        g.save(); g.globalCompositeOperation = C.dark ? "lighter" : "source-over";
        const gl = g.createRadialGradient(bx, U.y, 1, bx, U.y, 22);
        gl.addColorStop(0, `rgba(255,190,90,${a})`); gl.addColorStop(0.5, `rgba(255,90,30,${a * 0.5})`); gl.addColorStop(1, "rgba(255,60,20,0)");
        g.fillStyle = gl; g.fillRect(bx - 24, U.y - 24, 48, 48); g.restore();
      }
      if (fx.block) {  // a blocked turbine nozzle: soot on the wheel, a cross on the inlet
        g.save(); g.globalAlpha = 0.25 + 0.5 * Math.min(1, fx.block * 2);
        g.fillStyle = "#1a1a1a";
        for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = U.rT * (0.25 + 0.6 * ((i * 37) % 10) / 10); g.beginPath(); g.arc(U.turb + Math.cos(a) * rr, U.y + Math.sin(a) * rr, 2.2, 0, 2 * Math.PI); g.fill(); }
        g.globalAlpha = 1; g.strokeStyle = "#e0245e"; g.lineWidth = 2.6; g.lineCap = "round";
        const ix = U.turb, iy = U.y - U.rT - 7;
        g.beginPath(); g.moveTo(ix - 5, iy - 5); g.lineTo(ix + 5, iy + 5); g.moveTo(ix + 5, iy - 5); g.lineTo(ix - 5, iy + 5); g.stroke();
        g.restore();
      }
      g.restore();
    }
    // A padlock: drawn over a valve that has frozen in place.
    function padlock(g, x, y, s, col) {
      g.save(); g.translate(x, y); g.scale(s, s);
      g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath(); g.arc(0, -3, 3.4, Math.PI, 0); g.lineTo(3.4, 0); g.moveTo(-3.4, 0); g.lineTo(-3.4, -3); g.stroke();
      g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(-5, -0.5, 10, 7.5, 1.6) : g.rect(-5, -0.5, 10, 7.5); g.fill();
      g.fillStyle = "#fff"; g.fillRect(-0.7, 2, 1.4, 2.6);
      g.restore();
    }
    function drawCabinet(g, C) {
      const c = S.controller;
      if (!c || !S.layers.signals) return;
      const { x, y, w, h } = CAB;
      g.fillStyle = rgba(C.steelDark, 1); g.strokeStyle = rgba(mix(C.steelDark, [0, 0, 0], 0.3), 1); g.lineWidth = 1.2;
      g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 4) : g.rect(x, y, w, h); g.fill(); g.stroke();
      if (S.hover === "cabinet") { g.strokeStyle = "rgba(255,170,60,0.85)"; g.lineWidth = 2; g.stroke(); }
      // screen
      g.fillStyle = C.dark ? "#0a1022" : "#14203f";
      g.fillRect(x + 5, y + 6, w - 10, h - 20);
      g.strokeStyle = c.color || "#1baf7a"; g.lineWidth = 1; g.strokeRect(x + 5, y + 6, w - 10, h - 20);
      // LED: blinks at every control step
      const on = S.t >= S.ledT && S.t - S.ledT < 0.07 && S.state === "run";
      g.beginPath(); g.arc(x + w - 9, y + h - 7, 3, 0, 2 * Math.PI);
      g.fillStyle = on ? (c.color || "#1baf7a") : "rgba(255,255,255,0.18)"; g.fill();
    }
    function drawSignals(g, C) {
      const c = S.controller;
      if (!c || !S.layers.signals) return;
      const sensorBad = S.faults.some((f) => f.sev > 0 && f.kind.startsWith("sensor"));
      const col = c.color || "#1baf7a";
      g.save(); g.lineCap = "round";
      const paths = c.kind === "open" || c.kind === "you" ? ["tov", "tfv"] : ["meas", "tov", "tfv"];
      for (const k of paths) {
        const pts = SIG[k];
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.strokeStyle = k === "meas" && sensorBad ? "#e0245e" : col; g.globalAlpha = 0.65; g.lineWidth = 1.4; g.setLineDash(k === "meas" ? [2, 3] : [6, 3]); g.stroke();
      }
      g.setLineDash([]); g.globalAlpha = 1;
      // pulses: the measurement travels to the controller, then the commands to the valves
      for (const d of S.dots) {
        const s = (d.age - d.delay) / 0.2;
        if (s < 0 || s > 1 || !paths.includes(d.path)) continue;
        let [px, py] = pointAlong(SIG[d.path], s);
        const bad = d.path === "meas" && sensorBad;  // a faulty reading travels as a red, jittering pulse
        if (bad) { px += (Math.random() - 0.5) * 4; py += (Math.random() - 0.5) * 4; }
        const gr = g.createRadialGradient(px, py, 0, px, py, 6);
        gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.4, bad ? "#e0245e" : col); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(px, py, 6, 0, 2 * Math.PI); g.fill();
      }
      // the sensor tap on the chamber
      if (paths.includes("meas")) {
        const blink = S.t - S.lastPulse < 0.08 && S.state === "run";
        g.beginPath(); g.arc(SENSOR.x, SENSOR.y, 4.2, 0, 2 * Math.PI);
        g.fillStyle = sensorBad ? (pulseA() > 0.6 ? "#e0245e" : "#fff") : blink ? "#ffffff" : rgba(C.steelDark, 1); g.fill();
        g.strokeStyle = sensorBad ? "#e0245e" : col; g.lineWidth = 1.6; g.stroke();
      }
      g.restore();
    }
    function drawEngine(g, C) {
      const row = S.row, P = S.vis.p;
      // thrust frame: the engine pushes left into it
      g.fillStyle = rgba(C.steelDark, 1);
      g.fillRect(338, 200, 16, GROUND - 200);
      g.fillRect(338, 200, 30, 10);
      g.fillStyle = rgba(C.steel, 1);
      g.fillRect(354, AXIS - 6, 14, 12);  // load cell
      g.fillRect(380, AXIS + G.rCC + 6, 8, GROUND - AXIS - G.rCC - 6);
      g.fillRect(440, AXIS + G.rCC + 6, 8, GROUND - AXIS - G.rCC - 6);
      g.fillRect(338, GROUND - 10, 200, 10);
      g.strokeStyle = rgba(C.steel, 1); g.lineWidth = 3;
      g.beginPath(); g.moveTo(354, GROUND - 10); g.lineTo(384, AXIS + G.rCC + 10); g.moveTo(444, AXIS + G.rCC + 10); g.lineTo(500, GROUND - 10); g.stroke();
      if (S.hover === "frame") { g.strokeStyle = "rgba(255,170,60,0.8)"; g.lineWidth = 2; g.strokeRect(336, 198, 34, GROUND - 198); }
      // cooling jacket and liner, coloured by coolant temperature (counter-flow: cold at the throat, warm at the injector)
      const Tw = row ? row.t_rc : 470;
      const warm = clamp((Tw - 250) / 450, 0, 1);
      const top = [], bot = [];
      for (let x = G.cc0; x <= G.exit; x += 2) { const r = radiusAt(x) + 6; top.push([x, AXIS - r]); bot.push([x, AXIS + r]); }
      const grad = g.createLinearGradient(G.cc0, 0, G.exit, 0);
      grad.addColorStop(0, rgba(mix(C.copper, [235, 120, 50], warm), 1));
      grad.addColorStop((G.thr - G.cc0) / (G.exit - G.cc0), rgba(mix(C.copper, [120, 170, 210], 0.55), 1));
      grad.addColorStop(0.62, rgba(C.nickel, 1));
      grad.addColorStop(1, rgba(mix(C.nickel, [255, 120, 40], S.nozzleHeat * (C.dark ? 0.45 : 0.75)), 1));
      const outline = () => { g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]); g.closePath(); };
      const litEngine = S.hover === "chamber" || S.hover === "jacket" || S.hover === "nozzle" || S.hover === "injector";
      if (viol("rof") || viol("p_rc") || litEngine) {
        outline(); g.save(); g.globalAlpha = litEngine && !viol("rof") && !viol("p_rc") ? 0.5 : 0.6 * pulseA();
        g.strokeStyle = litEngine && !viol("rof") && !viol("p_rc") ? "#ffaa3c" : "#ff4d4d"; g.lineWidth = 8; g.stroke(); g.restore();
      }
      outline(); g.fillStyle = grad; g.fill();
      g.strokeStyle = viol("rof") ? "#ff4d4d" : rgba(C.steelDark, 1); g.lineWidth = viol("rof") ? 2.5 : 1.2; g.stroke();
      // coolant moving in the jacket, against the hot gas: from the throat back to the injector
      if (S.state !== "off" && S.state !== "purge") {
        g.save(); g.setLineDash([2, 7]); g.lineDashOffset = S.jacketPhase; g.lineCap = "round";
        g.strokeStyle = C.dark ? "rgba(190,225,255,0.55)" : "rgba(255,255,255,0.75)"; g.lineWidth = 1.6;
        for (const sgn of [-1, 1]) {
          g.beginPath();
          for (let x = G.thr + 30; x >= G.cc0 + 2; x -= 2) { const y = AXIS + sgn * (radiusAt(x) + 3); x === G.thr + 30 ? g.moveTo(x, y) : g.lineTo(x, y); }
          g.stroke();
        }
        g.restore();
      }
      // hot glow of the nozzle extension (radiation-cooled look; nickel alloy up to about 1000 K)
      if (S.nozzleHeat > 0.05) {
        g.save(); g.globalCompositeOperation = "lighter";
        const gl = g.createRadialGradient(G.exit - 20, AXIS, 4, G.exit - 20, AXIS, 70);
        gl.addColorStop(0, `rgba(255,120,40,${(C.dark ? 0.2 : 0.35) * S.nozzleHeat})`); gl.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = gl; g.fillRect(G.exit - 90, AXIS - 70, 140, 140); g.restore();
      }
      // injector head and manifold dome
      g.fillStyle = rgba(C.steel, 1); g.strokeStyle = rgba(C.steelDark, 1); g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(G.inj0 + 12, AXIS, 14, G.rCC + 10, 0, 0, 2 * Math.PI); g.fill(); g.stroke();
      g.fillRect(G.inj0 + 10, AXIS - G.rCC - 8, 16, 2 * G.rCC + 16);
      // thrust jacket rings
      g.fillStyle = rgba(C.steelDark, 1);
      for (const x of [G.cc0 + 8, G.cc1 - 4]) g.fillRect(x - 3, AXIS - G.rCC - 10, 6, 2 * G.rCC + 20);
      // exit flange
      g.fillRect(G.exit - 3, AXIS - G.rE - 9, 6, 2 * G.rE + 18);
      // laser ignition flash and combustion glow inside the chamber
      const glow = clamp(P / 50, 0, 1.2) + S.flash * 1.5;
      if (glow > 0.02) {
        g.save(); g.globalCompositeOperation = "lighter";
        const cc = g.createRadialGradient(G.cc1 - 10, AXIS, 2, G.cc1 - 10, AXIS, 48);
        cc.addColorStop(0, `rgba(255,240,220,${(C.dark ? 0.3 : 0.55) * Math.min(1, glow)})`); cc.addColorStop(1, "rgba(255,160,80,0)");
        g.fillStyle = cc; g.fillRect(G.cc0 - 20, AXIS - 50, 120, 100);
        g.restore();
      }
      if (S.flash > 0.05) {  // the laser itself, a thin line into the chamber
        g.save(); g.globalAlpha = S.flash; g.strokeStyle = "#7df9ff"; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(G.inj0 + 4, AXIS - G.rCC - 30); g.lineTo(G.cc0 + 16, AXIS - 4); g.stroke(); g.restore();
      }
    }
    function drawPlume(g, C) {
      const P = S.vis.p;
      if (P < 0.6) return;
      // colour over the task's mixture-ratio range: 0 at ROF 2.9 (fuel-rich) ... 1 at ROF 3.8 (towards stoichiometric)
      const rof = S.vis.rof, tS = clamp((rof - 2.9) / 0.9, 0, 1);
      const bright = clamp(P / 45, 0, 1.3);
      const L = plumeLength(P);
      // methalox: orange where fuel-rich (soot, afterburning), violet-blue towards stoichiometric
      const edge = tS < 0.5 ? mix([255, 118, 28], [128, 84, 248], tS * 2) : mix([128, 84, 248], [64, 146, 255], (tS - 0.5) * 2);
      const core = mix([255, 214, 150], [208, 228, 255], tS);
      // night: "screen" keeps the hue where "lighter" would sum to white; day: plain painting, more opaque
      const add = C.dark ? "screen" : "source-over", gain = C.dark ? 0.6 : 1.75;
      // flow separation inside the nozzle when throttled (guess: below about 38 bar at sea level)
      const sep = clamp((38 - P) / 18, 0, 1);
      const x0 = G.exit - sep * (G.exit - G.thr) * 0.55;
      const r0 = lerp(G.rE * 0.92, G.rE * 0.55, sep);
      const wob = (k) => Math.sin(S.t * 23 + k * 1.7) * 0.6 + Math.sin(S.t * 37 + k * 2.9) * 0.4;
      g.save();
      g.globalCompositeOperation = add;
      // outer envelope: overlapping soft discs along the axis
      const N = 34;
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1), x = x0 + s * L;
        const r = r0 * (1 + 0.55 * s) * (1 - 0.35 * s * s) + 4 * wob(i) * (0.3 + sep);
        const yo = sep * 6 * wob(i + 9) * s;
        const a = 0.13 * gain * bright * (1 - s) * (0.85 + 0.15 * wob(i + 3));
        const gr = g.createRadialGradient(x, AXIS + yo, 0, x, AXIS + yo, r * 1.6);
        gr.addColorStop(0, rgba(edge, a * 1.2)); gr.addColorStop(0.55, rgba(edge, a * 0.5)); gr.addColorStop(1, rgba(edge, 0));
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(x, AXIS + yo, r * 1.6, r * 1.25, 0, 0, 2 * Math.PI); g.fill();
      }
      // core: a tapering bright jet, built from soft elongated blobs
      const coreL = L * 0.5, NC = 16;
      for (let i = 0; i < NC; i++) {
        const s = i / (NC - 1), x = x0 + s * coreL, ry = r0 * 0.72 * (1 - 0.72 * s) + 1;
        const a = (C.dark ? 0.2 : 0.46) * Math.min(1, bright) * (1 - 0.8 * s);
        const col = mix(core, edge, s * 0.7);
        g.save(); g.translate(x, AXIS); g.scale(1.9, 1);
        const cgr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
        cgr.addColorStop(0, rgba(C.dark ? mix([255, 252, 246], col, 0.25) : [255, 252, 246], a)); cgr.addColorStop(0.5, rgba(col, a * 0.8)); cgr.addColorStop(1, rgba(col, 0));
        g.fillStyle = cgr; g.beginPath(); g.arc(0, 0, ry, 0, 2 * Math.PI); g.fill();
        g.restore();
      }
      // shock diamonds: overexpanded at sea level, spacing grows with pressure
      const d = r0 * 1.7 * Math.sqrt(clamp(P / 40, 0.4, 1.6)), nD = Math.round(clamp(P / 9, 2, 6));
      for (let k = 1; k <= nD; k++) {
        const x = x0 + d * (k - 0.35), a = (C.dark ? 0.5 : 0.95) * Math.min(1, bright) * Math.pow(0.74, k - 1) * (0.9 + 0.1 * wob(k + 20));
        if (x > x0 + L * 0.85) break;
        const rr = r0 * 0.5 * (1 - 0.06 * k);
        const dg = g.createRadialGradient(x, AXIS, 0, x, AXIS, rr * 1.4);
        dg.addColorStop(0, rgba([255, 252, 248], a)); dg.addColorStop(0.45, rgba(mix(edge, [255, 150, 200], 0.4), a * 0.7)); dg.addColorStop(1, rgba(edge, 0));
        g.fillStyle = dg;
        g.beginPath(); g.moveTo(x - rr * 1.3, AXIS); g.lineTo(x, AXIS - rr * 0.7); g.lineTo(x + rr * 1.3, AXIS); g.lineTo(x, AXIS + rr * 0.7); g.closePath(); g.fill();
      }
      g.restore();
      // light cast on the ground and the cell
      g.save(); g.globalCompositeOperation = C.dark ? "lighter" : "soft-light";
      const lg = g.createRadialGradient(G.exit + 80, AXIS, 10, G.exit + 80, GROUND, 330);
      lg.addColorStop(0, rgba(edge, (C.dark ? 0.14 : 0.32) * Math.min(1, bright))); lg.addColorStop(1, rgba(edge, 0));
      g.fillStyle = lg; g.fillRect(200, 60, Math.max(W, xR) - 200, GROUND - 40);
      g.restore();
    }
    // ambient sky: slow clouds by day, twinkling stars by night (the theme decides)
    const frac = (v) => v - Math.floor(v);
    function drawSky(g, C) {
      const top = Math.min(yT, -20), bot = 250, span = xR - xL + 400;
      g.save();
      if (C.dark) {
        for (let i = 0; i < 90; i++) {
          const x = xL + frac(Math.sin(i * 12.9898) * 43758.5453) * (xR - xL), y = top + frac(Math.sin(i * 78.233) * 12345.678) * (bot - top);
          g.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(S.t * (0.8 + (i % 5) * 0.3) + i));
          g.fillStyle = "#dfe6ff"; g.fillRect(x, y, i % 7 ? 1.2 : 2, i % 7 ? 1.2 : 2);
        }
      } else {
        g.fillStyle = "#ffffff";
        for (let i = 0; i < 5; i++) {
          const x = xL - 200 + frac(i * 0.37 + S.t * (0.004 + i * 0.001)) * span, y = top + 20 + frac(i * 0.61) * Math.max(40, bot - top - 140), w = 50 + 30 * frac(i * 0.83);
          g.globalAlpha = 0.5;
          for (const [dx, dy, r] of [[0, 0, 1], [w * 0.45, -w * 0.18, 0.8], [w * 0.9, 0, 0.9], [w * 0.45, w * 0.05, 1.1]]) { g.beginPath(); g.ellipse(x + dx, y + dy, w * 0.42 * r, w * 0.22 * r, 0, 0, 2 * Math.PI); g.fill(); }
        }
      }
      g.restore();
    }
    function drawParts(g, C, kinds, comp) {
      g.save();
      if (comp) g.globalCompositeOperation = comp;
      for (const q of S.parts) {
        if (!kinds.includes(q.k)) continue;
        const life = q.age / q.life, fade = Math.min(1, q.age * 4) * (1 - life);
        let spr = SPR.white, a = q.a * fade;
        if (q.k === "fire") {
          if (life < 0.55) {  // flame tongue: stretched upward, flickering, yellow to red
            const fl = 0.75 + 0.25 * Math.sin(S.t * 30 + q.s);
            g.globalAlpha = clamp(q.a * (C.dark ? 0.65 : 1.6) * fl * (1 - life / 0.55) * Math.min(1, q.age * 10), 0, 1);
            g.drawImage(life < 0.25 ? SPR.flame : SPR.fire, q.x - q.r * 0.7, q.y - q.r * 2.1, q.r * 1.4, q.r * 2.8);
            continue;
          }
          spr = SPR.grey; a = 0.25 * (1 - life);
        }
        else if (q.k === "smoke" || q.k === "vent") spr = SPR.grey;
        else if (q.k === "soot") spr = C.dark ? SPR.grey : SPR.soot;  // soot: dark by day, a grey smudge by night
        else if (q.k === "mist") a *= C.dark ? 0.6 : 1;
        if (C.dark && spr === SPR.white) { spr = SPR.night; a *= 0.6; }  // steam at night: dim, lit only faintly
        g.globalAlpha = clamp(a, 0, 1);
        g.drawImage(spr, q.x - q.r, q.y - q.r, 2 * q.r, 2 * q.r);
      }
      g.restore();
    }
    function drawRing(g, C, back) {
      // water-spray ring around the plume, seen edge-on (DLR photo, IAC 2024 Fig. 4)
      g.save();
      g.strokeStyle = S.hover === "ring" && !back ? "#ffaa3c" : rgba(back ? C.steelDark : mix(C.steel, [150, 90, 60], 0.45), 1);
      g.lineWidth = back ? 4 : 7;
      g.beginPath(); g.ellipse(RING.x, AXIS, 16, RING.r, 0, back ? Math.PI * 0.5 : -Math.PI * 0.5, back ? Math.PI * 1.5 : Math.PI * 0.5); g.stroke();
      if (!back) {
        g.fillStyle = rgba(C.steelDark, 1);
        g.fillRect(RING.x - 4, AXIS + RING.r, 8, GROUND - AXIS - RING.r);  // post
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i / 8) * Math.PI, x = RING.x + 16 * Math.cos(a), y = AXIS + RING.r * Math.sin(a);
          g.fillRect(x - 3, y - 2, 6, 4);
        }
      }
      g.restore();
    }

    // ---------------------------------------------------------------- text, in screen pixels (legible at any zoom)
    function text(g, C, s, x, y, o) {
      o = o || {};
      g.font = `${o.bold ? "600 " : ""}${o.size || 12}px Inter, sans-serif`;
      g.textAlign = o.align || "left"; g.textBaseline = "alphabetic";
      g.lineJoin = "round"; g.lineWidth = 3.2; g.strokeStyle = C.halo;
      g.strokeText(s, x, y);
      g.fillStyle = o.color || C.ink; g.fillText(s, x, y);
    }
    // A label at a world point: a bold first line and, with part names on, the acronym spelled out below.
    function label(g, C, x, y, main, sub, o) {
      o = o || {};
      const [sx, sy] = toS(x, y);
      if (sx < -40 || sx > cv._w + 40) return;
      text(g, C, main, sx, sy, { bold: true, align: o.align, size: o.size || 12, color: o.color });
      if (sub && S.layers.parts && cam.s > 0.62) text(g, C, sub, sx, sy + 13, { align: o.align, size: 10.5, color: C.ink2 });
    }
    function pill(g, C, s, sx, sy, border, o) {
      o = o || {};
      g.font = `${o.bold ? "600 " : ""}${o.size || 10.5}px Inter, sans-serif`;
      const tw = g.measureText(s).width + (o.gear ? 25 : 12), h = 17;
      let x = o.align === "right" ? sx - tw : o.align === "center" ? sx - tw / 2 : sx;
      if (o.minX != null) x = Math.max(x, o.minX);  // keep it on the canvas
      g.fillStyle = o.fill || C.pill; g.strokeStyle = border; g.lineWidth = 1.2;
      g.beginPath(); g.roundRect ? g.roundRect(x, sy - h / 2, tw, h, 8.5) : g.rect(x, sy - h / 2, tw, h); g.fill(); g.stroke();
      g.fillStyle = o.color || C.ink; g.textAlign = "left"; g.textBaseline = "middle";
      if (o.gear) gearIcon(g, x + 11, sy + 0.5, 5, o.color || C.ink, o.fill || C.pill);
      g.fillText(s, x + (o.gear ? 19 : 6), sy + 0.5);
      g.textBaseline = "alphabetic";
      return [x, tw];
    }
    // ---------------------------------------------------------------- malfunctions (faults.py)
    function fault(kind) { return S.faults.find((f) => f.kind === kind && f.sev > 0); }
    function f_mag(kind) { const f = fault(kind); return f ? f.mag : 0; }
    // In the world: the leak's spray and frost, a hot spot on the wall, sparks
    function drawFaultWorld(g, C) {
      for (const f of S.faults) {
        if (f.sev <= 0) continue;
        if (f.kind === "leak_fuel" || f.kind === "leak_lox") {
          const [lx, ly, dir] = FAULT_LEAK[f.kind];
          // frost puddle under the leak, growing while it lasts
          const grow = Math.min(1, (f.age || 0) / 8) * Math.min(1, f.sev * 3);
          g.save(); g.fillStyle = C.dark ? "rgba(200,225,255,0.22)" : "rgba(255,255,255,0.7)";
          g.beginPath(); g.ellipse(lx + dir * 60, GROUND + 3, 18 + 50 * grow, 3 + 3 * grow, 0, 0, 2 * Math.PI); g.fill(); g.restore();
          // the breach itself
          g.save(); g.beginPath(); g.arc(lx, ly, 5 + 2 * pulseA(), 0, 2 * Math.PI);
          g.strokeStyle = "#e0245e"; g.lineWidth = 2; g.stroke(); g.restore();
        } else if (f.kind === "heat") {
          const x = (G.cc0 + G.cc1) / 2 + 6, a = (0.35 + 0.35 * pulseA()) * Math.min(1, f.sev * 1.5);
          g.save(); g.globalCompositeOperation = C.dark ? "lighter" : "source-over";
          const hs = g.createRadialGradient(x, AXIS - G.rCC - 3, 1, x, AXIS - G.rCC - 3, 20);
          hs.addColorStop(0, `rgba(255,250,220,${a})`); hs.addColorStop(0.4, `rgba(255,140,40,${a * 0.8})`); hs.addColorStop(1, "rgba(255,80,20,0)");
          g.fillStyle = hs; g.fillRect(x - 22, AXIS - G.rCC - 24, 44, 40); g.restore();
          // heat shimmer rising off the wall
          g.save(); g.strokeStyle = `rgba(255,150,60,${0.5 * Math.min(1, f.sev * 1.5)})`; g.lineWidth = 1.2;
          for (let i = 0; i < 3; i++) {
            const x0 = x - 10 + i * 10; g.beginPath();
            for (let y = 0; y < 26; y += 2) { const yy = AXIS - G.rCC - 8 - y; const xx = x0 + Math.sin(S.t * 6 + y * 0.4 + i) * 2.4; y ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
            g.stroke();
          }
          g.restore();
        }
      }
      // sparks and leak spray
      g.save();
      for (const q of S.parts) {
        const life = q.age / q.life;
        if (q.k === "spark") {  // a hot fleck: a streak and a glowing head, yellow-white cooling to red
          g.globalCompositeOperation = C.dark ? "lighter" : "source-over";
          const gch = Math.round((C.dark ? 230 : 200) - 130 * life), bch = Math.round((C.dark ? 150 : 40) - 40 * life);
          g.strokeStyle = `rgba(255,${gch},${Math.max(0, bch)},${1 - life})`; g.lineWidth = C.dark ? 1.4 : 1.8; g.lineCap = "round";
          g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.025, q.y - q.vy * 0.025); g.stroke();
          g.fillStyle = `rgba(255,${C.dark ? 245 : 225},${C.dark ? 200 : 120},${(1 - life) * 0.95})`;
          g.beginPath(); g.arc(q.x, q.y, C.dark ? 1.1 : 1.4, 0, 2 * Math.PI); g.fill();
        } else if (q.k === "zap") {  // an electric arc off the straining actuator: a short jagged blue-white line
          g.globalCompositeOperation = C.dark ? "lighter" : "source-over";
          g.strokeStyle = C.dark ? `rgba(170,220,255,${1 - life})` : `rgba(30,100,235,${1 - life})`; g.lineWidth = 1.8;
          g.beginPath(); g.moveTo(q.x, q.y);
          for (let j = 1; j <= 3; j++) g.lineTo(q.x + q.vx * 0.012 * j + Math.sin(q.s + j * 2.1) * 2.5, q.y + q.vy * 0.012 * j + Math.cos(q.s + j * 1.7) * 2.5);
          g.stroke();
        } else if (q.k === "rust") {
          g.globalCompositeOperation = "source-over";
          g.fillStyle = `rgba(150,78,36,${q.a * (1 - life)})`; g.fillRect(q.x - 1, q.y - 1, 2.2, 1.6);
        } else if (q.k === "leak") {
          g.globalCompositeOperation = "source-over";
          g.globalAlpha = q.a * (1 - life) * Math.min(1, q.age * 8);
          g.drawImage(q.lox ? SPR.blue : SPR.white, q.x - q.r, q.y - q.r, 2 * q.r, 2 * q.r);
          g.globalAlpha = 1;
        }
      }
      g.restore();
    }
    // On the screen: tags on the failed parts, the shockwave of an onset, a red flash at the edges
    function drawFaultScreen(g, C, w, h) {
      const red = "#e0245e";
      for (const f of S.faults) {
        if (f.sev <= 0) continue;
        const at = FAULT_AT[f.kind];
        if (!at) continue;
        const [sx, sy] = toS(at[0], at[1]);
        let tag = null, dx = 0, dy = -30;
        if (f.kind.startsWith("stuck")) { const v = S.row && S.row["x_" + at[2]]; tag = v != null ? `STUCK at ${v.toFixed(2)}` : "STUCK"; dx = -40; dy = -30; }
        else if (f.kind === "actuator_delay") { tag = `LAG +${(f.mag * f.sev * 1000).toFixed(0)} ms`; dy = 34; }
        else if (f.kind.startsWith("bearing")) { tag = "BEARING"; dy = f.kind === "bearing_ftp" ? 38 : -36; }
        else if (f.kind.startsWith("leak")) { tag = `LEAK ${(100 * f.mag * f.sev).toFixed(0)} %`; dx = f.kind === "leak_fuel" ? 70 : -60; dy = f.kind === "leak_fuel" ? 4 : -18; }
        else if (f.kind.startsWith("block")) { tag = `BLOCKED ${(100 * f.mag * f.sev).toFixed(0)} %`; dx = 34; dy = -18; }
        else if (f.kind === "heat") { tag = `HOT SPOT +${(100 * f.mag * f.sev).toFixed(0)} %`; dx = 40; dy = -46; }
        else if (f.kind === "ageing") { tag = `AGEING −${(100 * f.mag * f.sev).toFixed(0)} %`; dx = 40; dy = -40; }
        else if (f.kind.startsWith("sensor") && S.row) {
          const r = S.row, rof = f.kind === "sensor_rof_gain";
          tag = rof ? `ROF reads ${(r.rof_meas ?? r.rof).toFixed(2)} · true ${r.rof.toFixed(2)}` : `reads ${(r.p_meas ?? r.p_cc).toFixed(1)} · true ${r.p_cc.toFixed(1)} bar`;
          dx = -20; dy = -64;
        }
        if (tag) pill(g, C, tag, sx + dx, sy + dy, red, { align: "center", bold: true, color: "#fff", fill: red });
      }
      for (const k of S.shocks) {  // the onset's shockwave
        const [sx, sy] = toS(k.x, k.y), a = 1 - k.age / 0.9;
        g.save(); g.strokeStyle = `rgba(224,36,94,${a})`; g.lineWidth = 3 * a + 1;
        g.beginPath(); g.arc(sx, sy, 10 + k.age * 140, 0, 2 * Math.PI); g.stroke();
        g.beginPath(); g.arc(sx, sy, 6 + k.age * 80, 0, 2 * Math.PI); g.stroke(); g.restore();
      }
      if (S.redFlash > 0) {  // red at the edges of the view
        const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        v.addColorStop(0, "rgba(224,36,94,0)"); v.addColorStop(1, `rgba(224,36,94,${0.3 * S.redFlash})`);
        g.fillStyle = v; g.fillRect(0, 0, w, h);
      }
    }
    // a small cog, drawn rather than typed, so it looks the same in every font
    function gearIcon(g, cx, cy, r, col, hole) {
      g.save(); g.translate(cx, cy); g.fillStyle = col; g.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI, rr = i % 2 ? r * 0.74 : r; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr, 0); }
      g.closePath(); g.fill();
      g.beginPath(); g.arc(0, 0, r * 0.34, 0, 2 * Math.PI); g.fillStyle = hole; g.fill();
      g.restore();
    }
    function drawLabels(g, C) {
      const row = S.row, off = S.state === "off" || S.state === "purge";
      const sc = cam.s;
      // context labels on the cell
      if (sc > 0.55) {
        const [rx, ry] = toS(410, 29), [ex, ey] = toS(286, 30);
        text(g, C, "P8.3 test cell, DLR Lampoldshausen · open side →", rx, Math.max(ry, view.insets.t + 14), { bold: true, size: 11 });
        text(g, C, "turbine exhaust (vented)", ex, Math.max(ey, view.insets.t + 14), { size: 10.5, color: C.ink2, align: "right" });
        // the feed lines' origin, where it is not hidden behind a panel
        const [lx, ly] = toS(8, OTP.y - 10), [nx, ny] = toS(8, FTP.y - 10);
        if (lx >= view.insets.l) { text(g, C, "LOX from the P8.3 run tank", lx, ly, { size: 10.5, color: C.ink2 }); text(g, C, "LNG from the P8.3 run tank", nx, ny, { size: 10.5, color: C.ink2 }); }
      }
      // turbopumps and valves
      const L = LIM();
      label(g, C, OTP.pump - 24, OTP.y + OTP.rP + 16, `OTP ${off || !row ? "stopped" : kRpm(row.n_otp) + " rpm"}`, "oxidiser turbopump", { color: viol("n_otp") ? "#ff4d4d" : null });
      label(g, C, FTP.pump - 24, FTP.y - FTP.rP - (S.layers.parts && sc > 0.62 ? 21 : 8), `FTP ${off || !row ? "stopped" : kRpm(row.n_ftp) + " rpm"}`, "fuel turbopump", { color: viol("n_ftp") ? "#ff4d4d" : null });
      if (row) {
        for (const k of ["tov", "tfv"]) {
          const [x, y, name] = VALVES[k], open = row["x_" + k], cmd = row["u_" + k];
          const arrow = cmd != null && Math.abs(cmd - open) > 0.003 ? (cmd > open ? " ▲" : " ▼") : "";
          label(g, C, x + 30, y + 4, `${name} ${open.toFixed(2)}${arrow}`, k === "tfv" ? "turbine fuel valve" : "turbine oxidiser valve");
        }
      }
      // engine read-outs on the hardware
      if (row && S.vis.p > 0.6) {
        label(g, C, G.cc0, AXIS - G.rCC - (S.layers.parts && sc > 0.62 ? 34 : 22), `p_cc ${S.vis.p.toFixed(1)} bar`, "combustion-chamber pressure");
        label(g, C, G.cc0, AXIS + G.rCC + 34, `ROF ${S.vis.rof.toFixed(2)}`, "oxidiser-to-fuel mixture ratio", { color: viol("rof") ? "#ff4d4d" : null });
        label(g, C, G.exit + 2, 150, `coolant out ${Math.round(row.t_rc)} K`, "to the turbines (limit 700 K)", { color: viol("t_turbine") ? "#ff4d4d" : null });
      }
      // thrust, measured by the load cell in the thrust frame: an arrow into the frame and a tag in newtons
      if (row) {
        const F = thrustN(S.vis.p), nom = F / 25000;
        const [ax, ay] = toS(G.inj0 - 2, AXIS - G.rCC - 17), [bx, by] = toS(342, AXIS - G.rCC - 17);
        if (F > 50) {
          g.save(); g.strokeStyle = C.dark ? "#ffb15c" : "#c2410c"; g.fillStyle = g.strokeStyle; g.lineWidth = clamp(1.5 + 2.5 * nom, 1.5, 4); g.lineCap = "round";
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx + 6, by); g.stroke();
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 8, by - 5); g.lineTo(bx + 8, by + 5); g.closePath(); g.fill(); g.restore();
        }
        const [tx, ty] = toS(334, AXIS - 12);  // beside the load cell, left of the frame the engine pushes into
        pill(g, C, `Thrust ${fmtN(F)} N`, tx - 4, ty, C.dark ? "#ffb15c" : "#c2410c", { align: "right", bold: true, size: 11.5, minX: view.insets.l + 4 });
      }
      // the controller cabinet's screen
      if (S.controller && S.layers.signals) {
        const [cx, cy] = toS(CAB.x + CAB.w / 2, CAB.y + 6 + (CAB.h - 20) / 2);
        g.font = `600 ${clamp(12 * sc, 9, 13).toFixed(1)}px Inter, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = S.controller.color || "#1baf7a"; g.fillText(S.controller.label, cx, cy); g.textBaseline = "alphabetic";
        label(g, C, CAB.x - 6, CAB.y + 16, "controller", S.layers.parts ? (S.controller.kind === "open" ? "a schedule, no measurement" : S.controller.kind === "you" ? "you, with the sliders" : "reads p_cc, ROF; sets TFV, TOV") : null, { align: "right", size: 11 });
      }
      // more part names, with leader lines
      if (S.layers.parts && sc > 0.7) {
        const lead = (wx, wy, dx, dy, main, sub, align) => {
          const [sx, sy] = toS(wx, wy), tx = sx + dx, ty = sy + dy;
          g.strokeStyle = C.ink2; g.lineWidth = 1; g.globalAlpha = 0.8;
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty - 4); g.stroke(); g.globalAlpha = 1;
          g.beginPath(); g.arc(sx, sy, 2.2, 0, 2 * Math.PI); g.fillStyle = C.ink2; g.fill();
          text(g, C, main, tx, ty + 6, { bold: true, size: 11, align });
          if (sub) text(g, C, sub, tx, ty + 18, { size: 10, color: C.ink2, align });
        };
        lead(G.inj0 + 10, AXIS + G.rCC + 4, -30, 64, "injector", "sprays LOX and methane in", "right");
        lead(G.exit - 30, AXIS + G.rE - 2, 10, 56, "nozzle extension", "no separation at 60 bar", "left");
        lead(RING.x + 6, AXIS - RING.r + 10, 30, -34, "water-spray ring", "steam, not smoke", "left");
      }
    }
    function drawFlows(g, C) {
      const r = S.row;
      if (!S.layers.flows || !r || S.state === "off" || S.state === "purge") return;
      const t = (wx, wy, s, kind, align) => { const [sx, sy] = toS(wx, wy); pill(g, C, s, align === "left" ? Math.max(sx, view.insets.l + 6) : sx, sy, rgba(pipeColor(kind, C, r), 1), { align }); };
      t(110, OTP.y + 16, `LOX ${r.m_lox.toFixed(2)} kg/s`, "lox", "left");
      t(110, FTP.y + 16, `LNG ${r.m_lng.toFixed(2)} kg/s`, "lng", "left");
      t(430, 110, `CH₄ to turbines ${(r.m_tf + r.m_to).toFixed(2)} kg/s · ${Math.round(r.t_rc)} K`, "hot", "center");
      t(OTP.turb - 6, 84, `${r.m_to.toFixed(2)} kg/s`, "hot", "right");
      t(322, 206, `${r.m_tf.toFixed(2)} kg/s`, "hot", "right");
      t(G.inj0 - 52, AXIS + 46, `CH₄ in ${(r.m_lox / r.rof).toFixed(2)} kg/s`, "lng", "right");
    }
    function drawPerturb(g, C) {
      const p = S.perturb;
      if (!p) return;
      const amber = "#e8a200", tags = [];
      if (Math.abs(p.heat - 1) > 1e-6) tags.push([515, 340, `heat flux ×${p.heat.toFixed(2)}`]);
      if (Math.abs(p.tf - 1) > 1e-6) tags.push([FTP.turb + 8, FTP.y + FTP.rT + 16, `fuel turbine ×${p.tf.toFixed(2)}`]);
      if (Math.abs(p.to - 1) > 1e-6) tags.push([300, 146, `LOX turbine ×${p.to.toFixed(2)}`]);
      if (p.delay0 != null && Math.abs(p.delay - p.delay0) > 1e-6) tags.push([288, 205, `valve dead time ${p.delay.toFixed(3)} s`]);
      if (!p.sensorDelay || !p.noise) tags.push([SENSOR.x + 20, 150, `sensors: ${[!p.sensorDelay && "no delay", !p.noise && "no noise"].filter(Boolean).join(", ")}`]);
      for (const [x, y, s] of tags) { const [sx, sy] = toS(x, y); pill(g, C, s, sx, sy, amber, { gear: true, align: "center", bold: true, color: C.dark ? "#ffd27a" : "#7a4b00" }); }
    }
    function drawCallouts(g, C) {
      if (!S.layers.callouts) return;
      const I = view.insets, w = cv._w, h = cv._h;
      let n = 0;
      for (const c of S.callouts) {
        const a = Math.min(1, c.age / 0.25) * Math.min(1, (c.life - c.age) / 0.6);
        const an = ANCH[c.anchor] || ANCH.chamber;
        const [sx, sy] = toS(an[0], an[1]);
        const dl = Math.hypot(an[2], an[3]) || 1, D = 58 + 22 * n;
        g.font = "600 12px Inter, sans-serif";
        const w1 = g.measureText(c.text).width;
        g.font = "11px Inter, sans-serif";
        const tw = Math.max(w1 + (c.icon ? 19 : 0), g.measureText(c.sub || "").width) + 20;
        const bh = c.sub ? 38 : 24;
        let bx = sx + an[2] / dl * D - tw / 2, by = sy + an[3] / dl * D - bh / 2;
        bx = clamp(bx, I.l + 6, w - I.r - tw - 6); by = clamp(by, Math.max(I.t, view.safeTop || 0) + 6, h - I.b - bh - 6);
        g.save(); g.globalAlpha = a;
        g.strokeStyle = c.color; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(clamp(sx, bx + 10, bx + tw - 10), sy < by ? by : sy > by + bh ? by + bh : by + bh / 2); g.stroke();
        g.beginPath(); g.arc(sx, sy, 3.5, 0, 2 * Math.PI); g.fillStyle = c.color; g.fill();
        g.fillStyle = C.pill; g.beginPath(); g.roundRect ? g.roundRect(bx, by, tw, bh, 8) : g.rect(bx, by, tw, bh); g.fill(); g.stroke();
        g.fillStyle = c.color; g.fillRect(bx, by + 5, 3, bh - 10);
        let tx = bx + 10;
        if (c.icon === "warn") {  // a drawn warning triangle
          g.fillStyle = c.color; g.beginPath(); g.moveTo(tx + 7, by + 5); g.lineTo(tx + 14, by + 18); g.lineTo(tx, by + 18); g.closePath(); g.fill();
          g.fillStyle = "#fff"; g.fillRect(tx + 6.2, by + 9, 1.6, 5); g.fillRect(tx + 6.2, by + 15, 1.6, 1.6);
          tx += 19;
        }
        g.textAlign = "left"; g.fillStyle = C.ink; g.font = "600 12px Inter, sans-serif"; g.fillText(c.text, tx, by + 16);
        if (c.sub) { g.font = "11px Inter, sans-serif"; g.fillStyle = C.ink2; g.fillText(c.sub, bx + 10, by + 31); }
        g.restore();
        n++;
      }
    }
    function drawOverlay(g, C, w, h) {
      // text in screen pixels (only when the page does not draw its own heads-up display)
      g.textAlign = "left";
      const lines = S.overlay || [];
      lines.forEach((t, i) => {
        g.font = i ? "11px Inter, sans-serif" : "600 12px Inter, sans-serif";
        g.lineJoin = "round"; g.lineWidth = 3; g.strokeStyle = C.dark ? "rgba(10,14,28,0.7)" : "rgba(255,255,255,0.75)";
        const y = (narrow ? 46 : 18) + 16 * i;  // below the badge on narrow screens
        g.strokeText(t, 10, y); g.fillStyle = C.ink; g.fillText(t, 10, y);
      });
      const badge = S.badge || stateBadge();
      if (badge) {
        g.font = "600 11px Inter, sans-serif";
        const tw = g.measureText(badge.text).width + 18, x = w - tw - 10, y = 8;
        g.fillStyle = badge.color; g.globalAlpha = 0.92;
        g.beginPath(); g.roundRect ? g.roundRect(x, y, tw, 22, 11) : g.rect(x, y, tw, 22); g.fill(); g.globalAlpha = 1;
        g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText(badge.text, x + 9, y + 15);
      }
      g.font = "10px Inter, sans-serif"; g.textAlign = "right"; g.fillStyle = C.ink2;
      g.fillText(w < 640 ? "Schematic; flame and smoke are guesses." : "Schematic side view, not to scale. Flame, smoke and colours are coarse guesses.", w - 10, h - 8);
    }
    const VIOL_NAMES = { t_turbine: "turbine inlet T", p_rc: "p_RC", n_otp: "OTP speed", n_ftp: "FTP speed", rof: "ROF" };
    function stateBadge() {
      const v = S.row && S.row.violations ? Object.entries(S.row.violations).filter(([, b]) => b).map(([k]) => k) : [];
      switch (S.state) {
        case "off": return { text: "OFF · cold", color: "#5a6478", kind: "off" };
        case "spinup": return { text: "START · GN2 spin-up", color: "#c98500", kind: "seq" };
        case "ignition": return { text: "IGNITION · pressure rise", color: "#e8651e", kind: "seq" };
        case "shutdown": return { text: "SHUTDOWN", color: "#c98500", kind: "seq" };
        case "purge": return { text: "LN2 PURGE", color: "#5a6478", kind: "seq" };
        default: {
          const fl = S.faults.filter((f) => f.sev > 0).map((f) => f.short || f.label);
          if (fl.length) return { text: "FAULT · " + fl.join(", ") + (v.length ? " · limit: " + v.map((k) => VIOL_NAMES[k] || k).join(", ") : ""), color: "#c2185b", kind: "fault" };
          return v.length ? { text: "HOT FIRE · limit: " + v.map((k) => VIOL_NAMES[k] || k).join(", "), color: "#e34948", kind: "limit" } : { text: "HOT FIRE · " + S.runLabel, color: "#1baf7a", kind: "run" };
        }
      }
    }
    let lastStatus = "";
    function emitStatus() {
      if (!opts.onStatus) return;
      const b = S.badge || stateBadge(), key = S.state + "|" + b.text;
      if (key !== lastStatus) { lastStatus = key; opts.onStatus(Object.assign({ state: S.state }, b)); }
    }
    function draw() {
      const C = palette(), w = cv._w, h = cv._h;
      const g = cv.getContext("2d");
      if (!cam.ready) { Object.assign(cam, targetCam()); cam.ready = true; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      xL = -cam.ox / cam.s; xR = (w - cam.ox) / cam.s; yT = -cam.oy / cam.s; yB = (h - cam.oy) / cam.s;
      const shx = S.shake * 3 * Math.sin(S.t * 83), shy = S.shake * 2 * Math.cos(S.t * 71);  // a fault's jolt, brief and small
      g.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (cam.ox + shx), dpr * (cam.oy + shy));
      // sky and forest outside the cell
      const sky = g.createLinearGradient(0, Math.min(0, yT), 0, GROUND);
      sky.addColorStop(0, rgba(C.sky0, 1)); sky.addColorStop(1, rgba(C.sky1, 1));
      g.fillStyle = sky; g.fillRect(xL, yT, xR - xL, GROUND - yT);
      drawSky(g, C);
      forest(g, C, 300, 70, 1.3, C.forest0);
      forest(g, C, 335, 48, 4.1, C.forest1);
      g.fillStyle = rgba(C.gravel, 1); g.fillRect(xL, GROUND, xR - xL, Math.max(H, yB) - GROUND + 2);
      // the test cell: back wall, roof, floor, open towards the right
      const wall = g.createLinearGradient(0, 40, 0, GROUND);
      wall.addColorStop(0, rgba(C.wall, 1)); wall.addColorStop(1, rgba(C.wall2, 1));
      g.fillStyle = wall; g.fillRect(xL, 36, 600 - xL, GROUND - 36);
      g.fillStyle = rgba(C.roof, 1); g.fillRect(xL, 10, 640 - xL, 28);
      g.fillStyle = rgba(mix(C.roof, [0, 0, 0], 0.18), 1); g.fillRect(xL, 4, 646 - xL, 6);  // parapet
      for (let x = Math.ceil(xL / 40) * 40; x < 640; x += 40) g.fillRect(x, -10, 2, 14);  // railing posts
      g.fillRect(xL, -10, 640 - xL, 2);
      g.fillStyle = rgba(C.floor, 1); g.fillRect(xL, GROUND, 600 - xL, 10);
      for (let x = 560; x < 600; x += 10) { g.fillStyle = (x / 10) % 2 ? "#f2c200" : "#222"; g.fillRect(x, GROUND, 10, 4); }
      // wall furniture: cable tray
      g.fillStyle = rgba(C.wall2, 1); g.fillRect(Math.max(20, xL), 52, 520 - Math.max(0, xL), 6);
      // smoke behind the engine and plume
      drawParts(g, C, ["mist"]);
      drawRing(g, C, true);
      drawPipes(g, C);
      drawSignals(g, C);
      const row = S.row, off = S.state === "off" || S.state === "purge", L = LIM();
      const sev = (k) => { const f = fault(k); return f ? f.sev : 0; };
      drawTurbopump(g, C, OTP, S.rot.o, off ? 0 : row && row.n_otp, L.n_otp_max, viol("n_otp") || viol("t_turbine") || sev("bearing_otp") > 0, S.hover === "otp",
        { bearing: off ? 0 : sev("bearing_otp") * 4, block: sev("block_ot") * f_mag("block_ot"), rust: sev("ageing") * f_mag("ageing") });
      drawTurbopump(g, C, FTP, S.rot.f, off ? 0 : row && row.n_ftp, L.n_ftp_max, viol("n_ftp") || viol("t_turbine") || sev("bearing_ftp") > 0, S.hover === "ftp",
        { bearing: off ? 0 : sev("bearing_ftp") * 4, block: sev("block_ft") * f_mag("block_ft"), rust: sev("ageing") * f_mag("ageing") });
      if (row) { drawValve(g, C, "tov", row.x_tov, row.u_tov); drawValve(g, C, "tfv", row.x_tfv, row.u_tfv); }
      drawCabinet(g, C);
      drawEngine(g, C);
      drawFaultWorld(g, C);
      drawParts(g, C, ["steam", "smoke", "purge", "vent", "soot"]);
      drawPlume(g, C);
      drawParts(g, C, ["fire"], C.dark ? "lighter" : null);
      drawRing(g, C, false);
      if (S.hover === "plume" && S.vis.p > 2) { g.strokeStyle = "rgba(255,170,60,0.7)"; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(G.exit + 6, AXIS - 46, plumeLength(S.vis.p), 92); g.setLineDash([]); }
      // screen-space layers
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLabels(g, C);
      drawFlows(g, C);
      drawPerturb(g, C);
      drawFaultScreen(g, C, w, h);
      drawCallouts(g, C);
      if (!opts.hud) drawOverlay(g, C, w, h);
    }

    // ---------------------------------------------------------------- what is under the pointer
    function hitPart(wx, wy) {
      for (const [k, [x, y]] of Object.entries(VALVES)) if (Math.hypot(wx - x - 6, wy - y) < 20) return k;
      if (S.controller && S.layers.signals && wx >= CAB.x - 4 && wx <= CAB.x + CAB.w + 4 && wy >= CAB.y - 4 && wy <= CAB.y + CAB.h + 4) return "cabinet";
      if (S.controller && S.layers.signals && S.controller.kind !== "open" && S.controller.kind !== "you" && Math.hypot(wx - SENSOR.x, wy - SENSOR.y) < 8) return "sensor";
      for (const [k, U] of [["otp", OTP], ["ftp", FTP]]) if (wx > U.pump - U.rP - 4 && wx < U.turb + U.rT + 4 && Math.abs(wy - U.y) < U.rP + 4) return k;
      const dy = Math.abs(wy - AXIS);
      if (wx >= G.inj0 - 2 && wx < G.cc0 && dy < G.rCC + 12) return "injector";
      if (wx >= G.cc0 && wx <= G.thr && dy < G.rCC + 10) return dy < radiusAt(wx) - 2 ? "chamber" : "jacket";
      if (wx > G.thr && wx <= G.exit + 4 && dy < radiusAt(Math.min(wx, G.exit)) + 8) return "nozzle";
      if (wx >= 336 && wx <= 370 && wy >= 198 && wy <= GROUND) return "frame";
      if (Math.abs(wx - RING.x) < 20 && dy < RING.r + 8) return "ring";
      if (S.vis.p > 2 && wx > G.exit + 4 && wx < G.exit + plumeLength(S.vis.p) && dy < 46) return "plume";
      let best = null, bd = 7;
      for (const p of PIPES) { const d = distToPolyline(wx, wy, p.pts.map(([x, y]) => [x === 0 ? xL : x, y])); if (d < bd) { bd = d; best = PIPE_PART[p.id]; } }
      return best;
    }
    const f2 = (v, d) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(d));
    function describe(id) {
      const r = S.row || {}, L = LIM(), c = S.controller;
      const D = {
        otp: ["OTP · oxidiser turbopump", [`${r.n_otp ? kRpm(r.n_otp) : "–"} rpm, limit ${kRpm(L.n_otp_max)}`], "Pumps liquid oxygen from the run tank to the injector. Its turbine runs on the warm methane that the TOV lets through."],
        ftp: ["FTP · fuel turbopump", [`${r.n_ftp ? kRpm(r.n_ftp) : "–"} rpm, limit ${kRpm(L.n_ftp_max)}`], "Pumps liquefied natural gas (methane) into the cooling jacket. Its turbine runs on the methane that the TFV lets through."],
        tov: ["TOV · turbine oxidiser valve (action 2)", [`opening ${f2(r.x_tov, 3)}, command ${f2(r.u_tov, 3)}`, `${f2(r.m_to, 3)} kg/s to the LOX turbine`], "Opening it speeds up the LOX pump: more oxygen, so higher pressure and mixture ratio, within about half a second."],
        tfv: ["TFV · turbine fuel valve (action 1)", [`opening ${f2(r.x_tfv, 3)}, command ${f2(r.u_tfv, 3)}`, `${f2(r.m_tf, 3)} kg/s to the fuel turbine`], "Opening it speeds up the fuel pump: more pressure, a lower mixture ratio, and colder coolant, which slowly takes some of the pressure back (the slow channel)."],
        chamber: ["Combustion chamber", [`p_cc ${f2(r.p_cc, 1)} bar, set point ${f2(r.p_ref, 1)}`, `ROF ${f2(r.rof, 2)}, set point ${f2(r.rof_ref, 2)}, limits ${L.rof_min}–${L.rof_max}`], "Pressure follows the total propellant flow; the mixture ratio (ROF, oxidiser to fuel by mass) sets the flame temperature."],
        jacket: ["Regenerative cooling jacket (RC)", [`wall heat ${r.q_wall ? (r.q_wall / 1e6).toFixed(2) : "–"} MW, coolant out ${r.t_rc ? Math.round(r.t_rc) : "–"} K (turbine limit ${L.t_turbine_max} K)`, `p_RC ${f2(r.p_rc, 1)} bar, minimum ${L.p_rc_min}`], "Methane cools the wall in counter-flow, from the throat back to the injector, and carries the heat to the turbines. The thermal mass makes this the slow loop."],
        injector: ["Injector head", [`LOX ${f2(r.m_lox, 2)} kg/s, methane ${r.m_lox && r.rof ? (r.m_lox / r.rof).toFixed(2) : "–"} kg/s`], "Sprays both propellants into the chamber. The surrogate has no injector model, so no momentum-flux ratio J."],
        nozzle: ["Nozzle extension", [], "Designed for no flow separation at 60 bar. The separation drawn below about 38 bar is a guess."],
        plume: ["Exhaust plume (coarse guess)", [`p_cc ${f2(S.vis.p, 1)} bar, ROF ${f2(S.vis.rof, 2)}`], "Length grows with chamber pressure; the colour runs from orange (fuel-rich) to violet-blue (towards stoichiometric); shock diamonds spread with pressure."],
        ring: ["Water-spray ring", [], "Cools and quiets the exhaust. Most of the white cloud is steam."],
        hot: ["Warm methane to the turbines", [`${r.m_tf != null ? (r.m_tf + r.m_to).toFixed(3) : "–"} kg/s at ${r.t_rc ? Math.round(r.t_rc) : "–"} K`], "Split between the TFV and the TOV, expanded through the two turbines, then vented: the 'bleed' in expander-bleed."],
        exhaust: ["Turbine exhaust", [], "Vented to the atmosphere, not burnt in the chamber (expander-bleed cycle)."],
        lox: ["LOX feed · liquid oxygen", [`${f2(r.m_lox, 2)} kg/s from the P8.3 run tank`], "Cryogenic, about 90 K: the white mist is air condensing on the line."],
        lng: ["LNG feed · liquefied natural gas", [`${f2(r.m_lng, 2)} kg/s from the P8.3 run tank`], "Methane, about 120 K, on its way to the fuel pump and the cooling jacket."],
        fcv: ["FCV line · fuel control valve", [], "Frozen at its 40 bar opening in the 2×2 task, like the BPV (bypass), OCV (oxidiser control) and XCV (mixer) valves. Only TFV and TOV move."],
        frame: ["Thrust frame and load cell", [`thrust ≈ ${fmtN(thrustN(S.vis.p))} N`], "The engine pushes against the frame; the load cell measures the thrust. Drawn here as 25 kN × p_cc / 60 bar: thrust is proportional to chamber pressure, and LUMEN's 35–80 bar envelope is 58–133 % of its nominal thrust (thesis Table 4.1)."],
        cabinet: [`Controller · ${c ? c.label : "none"}`, [], c && c.kind === "open" ? "A fixed schedule: it sends valve commands without reading the engine (open loop)." : c && c.kind === "you" ? "You: the TFV and TOV sliders, or drag the valves on the stand." : `Every ${(c && c.dt) || 0.05} s it reads chamber pressure and mixture ratio (delayed and noisy) and sends new TFV and TOV commands.`],
        sensor: ["Sensors", [`true ${f2(r.p_cc, 1)} bar · read ${f2(r.p_meas, 1)} bar`, `true ROF ${f2(r.rof, 2)} · read ${f2(r.rof_meas, 2)}`], "The controller sees p_cc 0.1 s late and ROF 0.2 s late, with noise (switchable in the Engine panel)."],
      };
      return D[id] || null;
    }
    function showTip(id, px, py) {
      const d = describe(id);
      if (!d) { tip.hidden = true; return; }
      tip.replaceChildren();
      const b = document.createElement("b"); b.textContent = d[0]; tip.append(b);
      for (const l of d[1]) { const s = document.createElement("span"); s.className = "v"; s.textContent = l; tip.append(s); }
      const p = document.createElement("span"); p.textContent = d[2]; tip.append(p);
      tip.hidden = false;
      const w = cv._w, tw = Math.min(280, w - 16);
      tip.style.maxWidth = tw + "px";
      const rect = tip.getBoundingClientRect();
      let x = px + 14, y = py + 14;
      if (x + rect.width > w - 6) x = px - rect.width - 14;
      if (y + rect.height > cv._h - 6) y = py - rect.height - 14;
      tip.style.left = clamp(x, 6, w - rect.width - 6) + "px";
      tip.style.top = clamp(y, 6, Math.max(6, cv._h - rect.height - 6)) + "px";
    }
    const local = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    // Gestures: drag a valve (sandbox), pan when zoomed in, pinch or ctrl-wheel to zoom, tap to explain.
    const ptrs = new Map();
    let gesture = null;
    const centre = () => { const f = view.focus || { x0: 0, x1: W, y0: 0, y1: H }; return [view.cx ?? (f.x0 + f.x1) / 2, view.cy ?? (f.y0 + f.y1) / 2]; };
    function setZoom(z, sx, sy) {
      const z0 = view.zoom, z1 = clamp(z, 1, 3.5);
      if (z1 === z0) return;
      let [cx, cy] = centre();
      if (sx != null) { const [wx, wy] = toW(sx, sy); cx = wx + (cx - wx) * z0 / z1; cy = wy + (cy - wy) * z0 / z1; }
      view.zoom = z1;
      if (z1 <= 1.001) { view.cx = view.cy = null; } else { view.cx = cx; view.cy = cy; }
    }
    cv.addEventListener("pointerdown", (e) => {
      const [px, py] = local(e);
      ptrs.set(e.pointerId, [px, py]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        gesture = { kind: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: view.zoom };
        S.drag = null; tip.hidden = true;
        return;
      }
      const [wx, wy] = toW(px, py), id = hitPart(wx, wy);
      if ((id === "tfv" || id === "tov") && S.valveDrag && S.row) {
        S.drag = { key: id, y0: py, v0: S.row["u_" + id] ?? S.row["x_" + id], lo: 0.1, hi: id === "tfv" ? 0.7 : 0.5 };
        gesture = { kind: "drag" };
        S.hover = id; cv.setPointerCapture(e.pointerId); tip.hidden = true; e.preventDefault();
        return;
      }
      const [cx, cy] = centre();
      gesture = { kind: "pan", x0: px, y0: py, cx0: cx, cy0: cy, moved: false, id, touch: e.pointerType !== "mouse" };
      if (view.zoom > 1.001) cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      const [px, py] = local(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
      if (gesture && gesture.kind === "pinch") {
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; setZoom(gesture.z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / gesture.d0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
        return;
      }
      if (S.drag) {
        const d = S.drag, v = clamp(d.v0 - (py - d.y0) / 150, d.lo, d.hi);
        if (S.valveDrag) S.valveDrag(d.key, v);
        return;
      }
      if (gesture && gesture.kind === "pan") {
        const dx = px - gesture.x0, dy = py - gesture.y0;
        if (!gesture.moved && Math.hypot(dx, dy) > 5) { gesture.moved = true; tip.hidden = true; }
        if (gesture.moved && view.zoom > 1.001) { view.cx = gesture.cx0 - dx / cam.s; view.cy = gesture.cy0 - dy / cam.s; cv.style.cursor = "grabbing"; }
        return;
      }
      if (e.pointerType !== "mouse") return;
      const [wx, wy] = toW(px, py), id = hitPart(wx, wy);
      S.hover = id;
      cv.style.cursor = (id === "tfv" || id === "tov") && S.valveDrag ? "ns-resize" : id ? "help" : view.zoom > 1.001 ? "grab" : "";
      if (id) showTip(id, px, py); else tip.hidden = true;
    });
    cv.addEventListener("pointerleave", (e) => { if (!S.drag && e.pointerType === "mouse") { S.hover = null; tip.hidden = true; } });
    function endGesture(e) {
      ptrs.delete(e.pointerId);
      const g0 = gesture;
      if (S.drag) { S.drag = null; cv.style.cursor = ""; }
      if (g0 && g0.kind === "pan" && !g0.moved && g0.touch && e.type === "pointerup") {  // tap to explain, tap again to close
        const [px, py] = local(e);
        if (g0.id && S.hover !== g0.id) { S.hover = g0.id; showTip(g0.id, px, py); } else { S.hover = null; tip.hidden = true; }
      }
      if (g0 && g0.kind === "pan" && g0.moved) cv.style.cursor = view.zoom > 1.001 ? "grab" : "";
      if (!ptrs.size || (g0 && g0.kind !== "pinch")) gesture = null;
    }
    cv.addEventListener("pointerup", endGesture);
    cv.addEventListener("pointercancel", endGesture);
    cv.addEventListener("dblclick", (e) => { const [px, py] = local(e); if (view.zoom < 3) setZoom(view.zoom * 1.6, px, py); else setZoom(1); });
    cv.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || (opts.wheelZoom && opts.wheelZoom()))) return;
      e.preventDefault();
      const [px, py] = local(e);
      setZoom(view.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), px, py);
    }, { passive: false });

    // ---------------------------------------------------------------- loop (pauses off-screen)
    let visible = true, last = 0, raf = 0;
    if (window.IntersectionObserver) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(cv);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function frame(ts) {
      raf = 0;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016;
      last = ts;
      step(reduce ? dt * 0.5 : dt);
      draw();
      if ((visible || CAPTURE) && !document.hidden) raf = nextFrame(frame); else last = 0;
    }
    function kick() { if (!raf) raf = nextFrame(frame); }
    document.addEventListener("visibilitychange", kick);
    if (window.ResizeObserver) new ResizeObserver(() => { const w = parent.clientWidth, h = parent.clientHeight; if (w !== cv._pw || (opts.fill && h !== cv._ph)) { cv._pw = w; cv._ph = h; resize(); draw(); } }).observe(parent);
    else window.addEventListener("resize", () => { resize(); draw(); });
    new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
    // warm up the smoke so the first frame is not empty
    for (let i = 0; i < 90; i++) step(1 / 30);
    S.callouts = [];
    kick();

    function callout(key, textMain, sub, anchor, o) {
      o = o || {};
      S.callouts = S.callouts.filter((c) => c.key !== key);
      S.callouts.push({ key, text: textMain, sub, anchor, age: 0, life: o.life || 3.2, icon: o.icon, color: o.color || (S.controller && S.controller.color) || "#e8651e" });
      if (S.callouts.length > 3) S.callouts.shift();
    }
    return {
      get state() { return st(); },
      setRow(row) { S.row = row; if (S.state === "run" && row) cv.setAttribute("aria-label", `LUMEN on the P8.3 test stand: chamber pressure ${row.p_cc.toFixed(1)} bar, mixture ratio ${row.rof.toFixed(2)}`); },
      ignite() { if (S.state === "off" || S.state === "purge") go("spinup", true); else if (S.state !== "run") go("run"); },
      shutdown() { if (S.state === "run" || S.state === "ignition" || S.state === "spinup") { S.vis.p0 = S.vis.p; go("shutdown", true); } },
      setState(s) { go(s); if (s === "run" && S.row) S.vis.p = S.row.p_cc; },
      setOverlay(lines) { S.overlay = lines; },
      setBadge(text, color) { S.badge = text ? { text, color } : null; },
      setRunLabel(text) { S.runLabel = text; },
      setView(v) { if ("safeTop" in v) view.safeTop = v.safeTop; if (v.insets) view.insets = Object.assign({ l: 0, r: 0, t: 0, b: 0 }, v.insets); if ("focus" in v) view.focus = v.focus; if (v.snap) cam.ready = false; },
      setLayers(l) { Object.assign(S.layers, l); },
      get layers() { return Object.assign({}, S.layers); },
      setController(c) { S.controller = c; },
      setPerturb(p) { S.perturb = p; },
      // faults: [{kind, sev (0-1 at the moment shown), mag, age (s since onset), label, short}]
      setFaults(list) { S.faults = list || []; },
      faultOnset(kind, label, sub) {  // the moment a fault starts: a jolt, a red flash, a shockwave and a callout
        const at = FAULT_AT[kind] || [SENSOR.x, SENSOR.y, "chamber"];
        if (!reduce) { S.shake = 1; S.redFlash = 1; }
        S.shocks.push({ x: at[0], y: at[1], age: 0 });
        callout("fault-" + kind, label, sub, at[2], { color: "#e0245e", life: 4.5, icon: "warn" });
      },
      pulse() {  // one control step: measurement to the controller, then commands to the valves
        if (S.t - S.lastPulse < 0.07) return;
        S.lastPulse = S.t; S.ledT = S.t + 0.18;
        S.dots.push({ path: "meas", age: 0, delay: 0 }, { path: "tov", age: 0, delay: 0.2 }, { path: "tfv", age: 0, delay: 0.2 });
      },
      callout,
      clearCallouts() { S.callouts = []; },
      setValveDrag(fn) { S.valveDrag = fn; cv.style.touchAction = fn ? "none" : "pan-y"; },
      zoomBy(f) { setZoom(view.zoom * f); },
      resetZoom() { setZoom(1); },
      get zoom() { return view.zoom; },
      status() { return Object.assign({ state: S.state }, S.badge || stateBadge()); },
      advance(seconds) { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) { step(1 / 30); draw(); } },  // deterministic frames (tests)
      resize() { resize(); draw(); },
      canvas: cv,
    };
  }

  window.ReStand = { create, nextFrame };
})();
