/* The test stand: LUMEN on DLR's P8.3 bench at Lampoldshausen, side view, animated.
 *
 * Driven by the surrogate's state (chamber pressure, mixture ratio, valve openings, pump speeds,
 * coolant temperature, constraint violations). Layout after DLR's photos (Traudt et al., IAC 2024,
 * Figs. 3-4): horizontal firing out of the open side of the test cell, turbopumps on the frame,
 * a water-spray ring around the plume, steam downstream. The flame, smoke and colours are coarse
 * guesses, not measurements: plume length and brightness scale with chamber pressure, the colour
 * shifts from orange (fuel-rich) to blue-white (towards stoichiometric), shock diamonds space with
 * pressure, and the jet separates from the nozzle wall when throttled down (the nozzle extension is
 * designed for "no flow separation at nominal operating conditions (60 bar)", Deeken et al. 2021).
 * Start-up (GN2 spin-up, laser ignition, about 1.5 s pressure rise) and shutdown (about 0.5 s
 * pressure decay, then an LN2 purge) follow the shapes of DLR's hot-fire traces (IAC 2024, Fig. 5).
 *
 * window.ReStand.create(parent, opts) -> { setRow(row), ignite(), shutdown(), setState(s), state,
 *   setOverlay(lines), setBadge(text, color), setRunLabel(text), resize() }. Needs nothing else; reads theme colours from the page. */
(function () {
  "use strict";
  const W = 1000, H = 420, GROUND = 372, AXIS = 262;
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], clamp(t, 0, 1))));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const isDark = () => document.body.getAttribute("data-md-color-scheme") === "slate";

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
  const VALVES = { tov: [OTP.turb, 120, "TOV"], tfv: [330, 168, "TFV"] };

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

  function create(parent, opts) {
    opts = opts || {};
    const cv = document.createElement("canvas");
    cv.className = "re-canvas re-stand";
    cv.setAttribute("role", "img");
    parent.appendChild(cv);
    const SPR = { white: sprite([255, 255, 255]), grey: sprite([120, 118, 115]), fire: sprite([255, 110, 30]), flame: sprite([255, 205, 90]), blue: sprite([170, 200, 255]) };
    let scale = 1, dpr = 1, VX0 = 0, VW = W, narrow = false;
    function resize() {
      const w = Math.max(280, parent.clientWidth || 800);
      // narrow screens: show the engine and the plume (world x from 300), larger
      narrow = w < 640; VX0 = narrow ? 300 : 0; VW = W - VX0;
      const h = clamp(Math.round(w * H / VW), narrow ? 200 : 260, opts.maxHeight || 470);
      dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = h + "px";
      scale = Math.min(w / VW, h / H);
      cv._w = w; cv._h = h;
    }
    resize();

    // ---- state
    const S = {
      state: opts.state || "run",  // off | spinup | ignition | run | shutdown | purge
      since: 0, t: 0, row: null, vis: { p: 0, rof: 3.4, w: 0, ext: 0 }, overlay: [], badge: null,
      parts: [], rot: { o: 0, f: 0 }, flowPhase: {}, nozzleHeat: 0, flash: 0, frost: 1, runLabel: opts.runLabel || "closed loop",
    };
    for (const p of PIPES) S.flowPhase[p.id] = 0;
    const st = () => S.state;
    function go(state) { S.state = state; S.since = 0; }

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
      if (S.state === "spinup" && S.since > 1.0) { go("ignition"); S.flash = 1; }
      if (S.state === "ignition" && S.since > 1.6) go("run");
      if (S.state === "shutdown" && S.since > 0.7) go("purge");
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
      const flows = S.row ? { lox: S.row.m_lox, lng: S.row.m_lng, warm: S.row.m_rc || 1.6, hot: (S.row.m_tf || 0.3) + (S.row.m_to || 0.3), tfv: S.row.m_tf || 0.3, tov: S.row.m_to || 0.3, vent: (S.row.m_tf || 0.3) + (S.row.m_to || 0.3) } : {};
      const scaleFlow = run ? clamp(P / 40, 0, 1.4) : S.state === "spinup" ? 0.2 : 0;
      for (const p of PIPES) {
        const m = flows[p.id === "tfv" ? "tfv" : p.id === "tov" ? "tov" : p.kind] || 1;
        S.flowPhase[p.id] += dt * scaleFlow * 40 * Math.sqrt(m);
      }
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
      // move
      const wind = 18;
      for (const q of S.parts) {
        q.age += dt;
        q.vx += (wind - q.vx) * dt * (q.k === "purge" ? 0.7 : 0.35);
        if (q.k === "fire") q.vy -= 10 * dt; else if (q.k === "mist") q.vy += 2 * dt; else q.vy -= 3 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.g * dt;
        if (q.k !== "mist" && q.k !== "vent" && q.y > GROUND - q.r * 0.3) q.y = GROUND - q.r * 0.3;
      }
      S.parts = S.parts.filter((q) => q.age < q.life && q.x < xR + 80 && q.y > -80);
    }
    function plumeLength(P) { return 330 * Math.pow(clamp(P / 50, 0, 1.6), 0.85); }

    // ---------------------------------------------------------------- drawing
    function palette() {
      const d = isDark();
      return d ? {
        sky0: [12, 18, 40], sky1: [36, 48, 82], forest0: [16, 24, 30], forest1: [10, 16, 20], ground: [38, 40, 44], gravel: [30, 32, 34],
        wall: [52, 56, 66], wall2: [44, 47, 56], roof: [70, 74, 84], floor: [60, 62, 68], steel: [128, 136, 150], steelDark: [86, 92, 104], ink: "#e4e8f2", ink2: "#a8b0c4",
        copper: [178, 104, 64], nickel: [150, 150, 158], dark: true,
      } : {
        sky0: [150, 186, 226], sky1: [214, 228, 242], forest0: [92, 116, 98], forest1: [66, 88, 72], ground: [150, 148, 140], gravel: [168, 164, 152],
        wall: [214, 214, 208], wall2: [196, 196, 190], roof: [178, 178, 172], floor: [186, 186, 180], steel: [150, 156, 166], steelDark: [104, 110, 122], ink: "#1d2236", ink2: "#4a5068",
        copper: [190, 112, 70], nickel: [168, 168, 174], dark: false,
      };
    }
    let xR = W, xL = 0;  // visible world extent (wider than W when the canvas is letterboxed)
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
    function drawPipes(g, C) {
      const row = S.row;
      for (const p of PIPES) {
        const col = pipeColor(p.kind, C, row);
        g.lineJoin = "round"; g.lineCap = "round";
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
    function drawValve(g, C, key, open) {
      const [x, y, label] = VALVES[key];
      const vertical = true;
      g.save(); g.translate(x, y); if (vertical) g.rotate(Math.PI / 2);
      g.fillStyle = rgba(C.steel, 1); g.strokeStyle = rgba(C.steelDark, 1); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-11, -9); g.lineTo(11, 9); g.lineTo(11, -9); g.lineTo(-11, 9); g.closePath(); g.fill(); g.stroke();
      g.restore();
      // actuator and opening gauge
      g.fillStyle = rgba(C.steelDark, 1);
      g.fillRect(x + 10, y - 7, 16, 14);
      const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * clamp(open, 0, 1);
      g.beginPath(); g.arc(x + 18, y, 5.5, a0, a0 + Math.PI * 1.5); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.arc(x + 18, y, 5.5, a0, a1); g.strokeStyle = "#ff9a3c"; g.stroke();
      label3(g, C, `${label} ${open.toFixed(2)}`, x + 30, y + 4, "left", true);
    }
    function label3(g, C, text, x, y, align, bold) {
      const px = Math.max(11, 10 / scale);  // at least about 10 px on screen at any canvas width
      g.font = `${bold ? "600 " : ""}${px.toFixed(1)}px Inter, sans-serif`;
      g.textAlign = align || "left";
      g.lineWidth = 3; g.strokeStyle = C.dark ? "rgba(10,14,28,0.75)" : "rgba(255,255,255,0.8)";
      g.strokeText(text, x, y);
      g.fillStyle = C.ink; g.fillText(text, x, y);
    }
    function drawTurbopump(g, C, U, rot, n, name, bad) {
      // bearing block and shaft
      g.fillStyle = rgba(C.steelDark, 1);
      g.fillRect(U.pump + 8, U.y - 8, U.turb - U.pump - 16, 16);
      // stand
      g.fillStyle = rgba(C.steel, 0.9);
      g.fillRect(U.pump - 6, U.y + U.rP, 12, GROUND - U.y - U.rP);
      g.fillRect(U.turb - 5, U.y + U.rT, 10, GROUND - U.y - U.rT);
      for (const [cx, r, blades, col] of [[U.pump, U.rP, 6, C.steel], [U.turb, U.rT, 14, mix(C.steel, [230, 140, 80], 0.35)]]) {
        g.beginPath(); g.arc(cx, U.y, r, 0, 2 * Math.PI);
        g.fillStyle = rgba(col, 1); g.fill();
        g.lineWidth = bad && cx === U.turb ? 2.5 : 1.3; g.strokeStyle = bad && cx === U.turb ? "#ff4d4d" : rgba(C.steelDark, 1); g.stroke();
        // rotating wheel
        g.save(); g.translate(cx, U.y); g.rotate(rot * (cx === U.pump ? 1 : 1));
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
      const below = U === OTP;
      label3(g, C, `${name} ${n ? Math.round(n / 100) / 10 + "k rpm" : "stopped"}`, U.pump - 24, below ? U.y + U.rP + 16 : U.y - U.rP - 8, "left", true);
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
      // cooling jacket and liner, coloured by coolant temperature (counter-flow: cold at the throat, warm at the injector)
      const Tw = row ? row.t_rc : 470;
      const warm = clamp((Tw - 250) / 450, 0, 1);
      const top = [], bot = [];
      for (let x = G.cc0; x <= G.exit; x += 2) { const r = radiusAt(x) + 6; top.push([x, AXIS - r]); bot.push([x, AXIS + r]); }
      const grad = g.createLinearGradient(G.cc0, 0, G.exit, 0);
      grad.addColorStop(0, rgba(mix(C.copper, [235, 120, 50], warm), 1));
      grad.addColorStop((G.thr - G.cc0) / (G.exit - G.cc0), rgba(mix(C.copper, [120, 170, 210], 0.55), 1));
      grad.addColorStop(0.62, rgba(C.nickel, 1));
      grad.addColorStop(1, rgba(mix(C.nickel, [255, 120, 40], S.nozzleHeat * 0.75), 1));
      g.beginPath();
      top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
      g.closePath(); g.fillStyle = grad; g.fill();
      g.strokeStyle = row && row.violations && row.violations.rof ? "#ff4d4d" : rgba(C.steelDark, 1); g.lineWidth = row && row.violations && row.violations.rof ? 2.5 : 1.2; g.stroke();
      // hot glow of the nozzle extension (radiation-cooled look; nickel alloy up to about 1000 K)
      if (S.nozzleHeat > 0.05) {
        g.save(); g.globalCompositeOperation = "lighter";
        const gl = g.createRadialGradient(G.exit - 20, AXIS, 4, G.exit - 20, AXIS, 70);
        gl.addColorStop(0, `rgba(255,120,40,${0.35 * S.nozzleHeat})`); gl.addColorStop(1, "rgba(255,120,40,0)");
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
        cc.addColorStop(0, `rgba(255,240,220,${0.55 * Math.min(1, glow)})`); cc.addColorStop(1, "rgba(255,160,80,0)");
        g.fillStyle = cc; g.fillRect(G.cc0 - 20, AXIS - 50, 120, 100);
        g.restore();
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
      const edge = tS < 0.5 ? mix([255, 140, 50], [140, 110, 255], tS * 2) : mix([140, 110, 255], [120, 170, 255], (tS - 0.5) * 2);
      const core = mix([255, 226, 180], [225, 236, 255], tS);
      const add = C.dark ? "lighter" : "source-over", gain = C.dark ? 0.8 : 1.25;
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
        const a = (C.dark ? 0.3 : 0.38) * Math.min(1, bright) * (1 - 0.8 * s);
        const col = mix(core, edge, s * 0.7);
        g.save(); g.translate(x, AXIS); g.scale(1.9, 1);
        const cgr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
        cgr.addColorStop(0, rgba([255, 252, 246], a)); cgr.addColorStop(0.5, rgba(col, a * 0.7)); cgr.addColorStop(1, rgba(col, 0));
        g.fillStyle = cgr; g.beginPath(); g.arc(0, 0, ry, 0, 2 * Math.PI); g.fill();
        g.restore();
      }
      // shock diamonds: overexpanded at sea level, spacing grows with pressure
      const d = r0 * 1.7 * Math.sqrt(clamp(P / 40, 0.4, 1.6)), nD = Math.round(clamp(P / 9, 2, 6));
      for (let k = 1; k <= nD; k++) {
        const x = x0 + d * (k - 0.35), a = (C.dark ? 0.8 : 0.9) * Math.min(1, bright) * Math.pow(0.74, k - 1) * (0.9 + 0.1 * wob(k + 20));
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
      lg.addColorStop(0, rgba(edge, (C.dark ? 0.32 : 0.25) * Math.min(1, bright))); lg.addColorStop(1, rgba(edge, 0));
      g.fillStyle = lg; g.fillRect(200, 60, W - 200, GROUND - 40);
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
            g.globalAlpha = clamp(q.a * (C.dark ? 1 : 1.5) * fl * (1 - life / 0.55) * Math.min(1, q.age * 10), 0, 1);
            g.drawImage(life < 0.25 ? SPR.flame : SPR.fire, q.x - q.r * 0.7, q.y - q.r * 2.1, q.r * 1.4, q.r * 2.8);
            continue;
          }
          spr = SPR.grey; a = 0.25 * (1 - life);
        }
        else if (q.k === "smoke" || q.k === "vent") spr = SPR.grey;
        else if (q.k === "mist") a *= C.dark ? 0.6 : 1;
        if (C.dark && spr === SPR.white) a *= 0.7;
        g.globalAlpha = clamp(a, 0, 1);
        g.drawImage(spr, q.x - q.r, q.y - q.r, 2 * q.r, 2 * q.r);
      }
      g.restore();
    }
    function drawRing(g, C, back) {
      // water-spray ring around the plume, seen edge-on (DLR photo, IAC 2024 Fig. 4)
      g.save();
      g.strokeStyle = rgba(back ? C.steelDark : mix(C.steel, [150, 90, 60], 0.45), 1);
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
    function drawOverlay(g, C, w, h) {
      // text in screen pixels
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    function stateBadge() {
      const v = S.row && S.row.violations ? Object.entries(S.row.violations).filter(([, b]) => b).map(([k]) => k) : [];
      switch (S.state) {
        case "off": return { text: "OFF · cold", color: "#5a6478" };
        case "spinup": return { text: "START · GN2 spin-up", color: "#c98500" };
        case "ignition": return { text: "IGNITION · pressure rise", color: "#e8651e" };
        case "shutdown": return { text: "SHUTDOWN", color: "#c98500" };
        case "purge": return { text: "LN2 PURGE", color: "#5a6478" };
        default: return v.length ? { text: "HOT FIRE · limit: " + v.join(", ").replace("t_turbine", "turbine T").replace("p_rc", "p_RC"), color: "#e34948" } : { text: "HOT FIRE · " + S.runLabel, color: "#1baf7a" };
      }
    }
    function draw() {
      const C = palette(), w = cv._w, h = cv._h;
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      // world transform, centred
      const ox = (w - VW * scale) / 2 - VX0 * scale, oy = (h - H * scale) / 2;
      xL = -ox / scale; xR = (w - ox) / scale;
      g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      // sky and forest outside the cell
      const sky = g.createLinearGradient(0, 0, 0, GROUND);
      sky.addColorStop(0, rgba(C.sky0, 1)); sky.addColorStop(1, rgba(C.sky1, 1));
      g.fillStyle = sky; g.fillRect(xL, -oy / scale, xR - xL, GROUND + oy / scale);
      forest(g, C, 300, 70, 1.3, C.forest0);
      forest(g, C, 335, 48, 4.1, C.forest1);
      g.fillStyle = rgba(C.gravel, 1); g.fillRect(xL, GROUND, xR - xL, H - GROUND + oy / scale);
      // the test cell: back wall, roof, floor, open towards the right
      const wall = g.createLinearGradient(0, 40, 0, GROUND);
      wall.addColorStop(0, rgba(C.wall, 1)); wall.addColorStop(1, rgba(C.wall2, 1));
      g.fillStyle = wall; g.fillRect(xL, 36, 600 - xL, GROUND - 36);
      g.fillStyle = rgba(C.roof, 1); g.fillRect(xL, 10, 640 - xL, 28);
      g.fillStyle = rgba(C.floor, 1); g.fillRect(xL, GROUND, 600 - xL, 10);
      for (let x = 560; x < 600; x += 10) { g.fillStyle = (x / 10) % 2 ? "#f2c200" : "#222"; g.fillRect(x, GROUND, 10, 4); }
      // wall furniture: cable tray, panel, bench interfaces
      g.fillStyle = rgba(C.wall2, 1); g.fillRect(20, 52, 520, 6);
      g.fillStyle = C.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"; g.fillRect(430, 120, 60, 70);
      if (!narrow) {
        label3(g, C, "P8.3 test cell · open side →", 410, 76, "left", true);
        g.font = `${Math.max(10, 9.5 / scale).toFixed(1)}px Inter, sans-serif`; g.fillStyle = C.ink2; g.textAlign = "left";
        g.fillText("LOX from the P8.3 run tank", 6, OTP.y - 10);
        g.fillText("LNG from the P8.3 run tank", 6, FTP.y - 10);
        g.fillText("turbine exhaust (vented)", 300, 30);
      }
      // smoke behind the engine and plume
      drawParts(g, C, ["mist"]);
      drawRing(g, C, true);
      drawPipes(g, C);
      const row = S.row;
      drawTurbopump(g, C, OTP, S.rot.o, S.state === "off" || S.state === "purge" ? 0 : row && row.n_otp, "OTP", row && row.violations && (row.violations.n_otp || row.violations.t_turbine));
      drawTurbopump(g, C, FTP, S.rot.f, S.state === "off" || S.state === "purge" ? 0 : row && row.n_ftp, "FTP", row && row.violations && (row.violations.n_ftp || row.violations.t_turbine));
      if (row) { drawValve(g, C, "tov", row.x_tov); drawValve(g, C, "tfv", row.x_tfv); }
      drawEngine(g, C);
      drawParts(g, C, ["steam", "smoke", "purge", "vent"]);
      drawPlume(g, C);
      drawParts(g, C, ["fire"], C.dark ? "lighter" : null);
      drawRing(g, C, false);
      // engine read-outs on the hardware
      if (row && S.vis.p > 0.6) {
        label3(g, C, `p_cc ${S.vis.p.toFixed(1)} bar`, G.cc0, AXIS - G.rCC - 22, "left", true);
        label3(g, C, `ROF ${S.vis.rof.toFixed(2)}`, G.cc0, AXIS + G.rCC + 34, "left", true);
        if (!narrow) label3(g, C, `coolant out ${Math.round(row.t_rc)} K`, G.thr + 6, AXIS - G.rE - 22, "left");
      }
      drawOverlay(g, C, w, h);
    }

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
      if (visible && !document.hidden) raf = requestAnimationFrame(frame); else last = 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("resize", () => { resize(); draw(); });
    new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
    // warm up the smoke so the first frame is not empty
    for (let i = 0; i < 90; i++) step(1 / 30);
    kick();

    return {
      get state() { return st(); },
      setRow(row) { S.row = row; if (S.state === "run" && row) cv.setAttribute("aria-label", `LUMEN on the P8.3 test stand: chamber pressure ${row.p_cc.toFixed(1)} bar, mixture ratio ${row.rof.toFixed(2)}`); },
      ignite() { if (S.state === "off" || S.state === "purge") go("spinup"); else if (S.state !== "run") go("run"); },
      shutdown() { if (S.state === "run" || S.state === "ignition" || S.state === "spinup") { S.vis.p0 = S.vis.p; go("shutdown"); } },
      setState(s) { go(s); if (s === "run" && S.row) S.vis.p = S.row.p_cc; },
      setOverlay(lines) { S.overlay = lines; },
      setBadge(text, color) { S.badge = text ? { text, color } : null; },
      setRunLabel(text) { S.runLabel = text; },
      resize() { resize(); draw(); },
      canvas: cv,
    };
  }

  window.ReStand = { create };
})();
