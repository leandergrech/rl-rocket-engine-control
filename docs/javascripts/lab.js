/* The Engine Lab: the 2x2 task on the LUMEN-like surrogate, in the browser.
 * Presets are grouped by who turns the knobs: a schedule (open loop), the PI controller (feedback),
 * a trained network (learned feedback) or you (sandbox). Every run uses the same episode code as the
 * Python environment (lumen-model.js; checked by tests/test_lab_model.py). Needs widgets.js (ReViz). */
(function () {
  "use strict";
  const PRESETS = {
    feedforward: { group: "open", label: "Feedforward only", story: "<b>Open loop.</b> Each 0.1 s the valves go to the openings that would hold the set point in steady state (the trim table), with no measurement at all. On the nominal engine it gets the levels right once everything has settled; the slow heat budget makes the transients wrong for 10–20 s, and any change to the engine (try <i>heat flux ×</i>) leaves a permanent error." },
    tfv_step: { group: "open", label: "TFV step", story: "<b>Open loop: TFV +0.1 at t = 2 s</b> from the 40 bar point. Pressure overshoots to about +6.5 bar within two seconds, then sags towards +3.4 bar over ~20 s as the coolant warms less: more coolant flow through the same heat. In DLR's model the peak is 6.5 bar against a final 3.7 bar (thesis p. 73 and Tables 4.6–4.7); the surrogate was fitted to those numbers." },
    tov_step: { group: "open", label: "TOV step", story: "<b>Open loop: TOV +0.1 at t = 2 s.</b> The oxidiser side answers in about half a second: more LOX, higher pressure and mixture ratio, almost nothing on the fuel side. Compare with the TFV step: one action channel is fast, the other slow." },
    pi: { group: "fb", label: "Decoupled PI", story: "<b>Feedback.</b> Feedforward from the trim table, a static decoupler (the inverse of the local gain matrix) and two PI loops on the measured, delayed p_cc and ROF, gains tuned on 12 training episodes. Watch the pressure loop fight the slow thermal sag after each TFV move, and the coupling: every pressure correction disturbs ROF. <i>PI gain ×</i> scales both loops." },
    "ppo-preview": { group: "rl", label: "PPO, preview", policy: true, story: "<b>Learned feedback.</b> A 2×128 tanh network trained with PPO (3 M steps, 17 min on a laptop CPU). It reads the last four observation frames and the set points for the next 0.5 s, so it can start moving before a step arrives." },
    "ppo-nopreview": { group: "rl", label: "PPO, no preview", policy: true, story: "<b>Learned feedback, no preview.</b> Same as PPO with preview, but it only knows the set point for the coming 0.1 s. Its pressure error is about twice that of PPO with preview, mostly in transients (27 min of training)." },
    "sac-preview": { group: "rl", label: "SAC, preview", policy: true, story: "<b>Learned feedback.</b> A 2×128 ReLU network trained with SAC (450 k steps, 55 min), the algorithm DLR used on LUMEN. Reads the same observation as PPO with preview." },
    "sac-nopreview": { group: "rl", label: "SAC, no preview", policy: true, story: "<b>Learned feedback, no preview.</b> SAC without the 0.5 s look-ahead (500 k steps, 50 min)." },
    sandbox: { group: "you", label: "Sandbox", story: "<b>You turn the knobs.</b> Press <i>Play</i> and drive TFV and TOV with the sliders to follow the dashed set points, at real-time speed (or slower). Pin your run and compare it with PI." },
  };
  const GROUPS = { open: "Open loop (a schedule)", fb: "Feedback (PI)", rl: "Learned feedback (RL)", you: "You" };
  const PROFILES = { eval: "Evaluation profile, 40 s", ladder: "Pressure ladder", rof: "Mixture-ratio steps", random: "Random (new each click)" };

  function profile(M, name, seed) {
    if (name === "ladder") return M.profileFromKnots([[0, 40, 3.4], [4, 40, 3.4], [4.001, 45, 3.4], [10, 45, 3.4], [10.001, 50, 3.4], [16, 50, 3.4], [16.001, 42, 3.4], [22, 42, 3.4], [22.001, 36, 3.4], [28, 36, 3.4], [31, 44, 3.4], [60, 44, 3.4]], 36);
    if (name === "rof") return M.profileFromKnots([[0, 42, 3.4], [4, 42, 3.4], [4.001, 42, 3.8], [11, 42, 3.8], [11.001, 42, 3.0], [18, 42, 3.0], [18.001, 42, 3.6], [25, 42, 3.6], [27, 42, 3.2], [60, 42, 3.2]], 32);
    if (name === "random") {
      const r = M.rng(seed), U = (a, b) => a + (b - a) * r.uniform();
      let p0 = U(35, 50), r0 = U(3, 3.8), tk = U(2, 5);
      const knots = [[0, p0, r0]];
      while (tk < 30) {
        const p1 = r.uniform() < 0.25 ? p0 : U(35, 50), r1 = r.uniform() < 0.25 ? r0 : U(3, 3.8);
        const ramp = r.uniform() < 0.4 ? 0.001 : U(1, 5);
        knots.push([tk, p0, r0], [tk + ramp, p1, r1]);
        p0 = p1; r0 = r1; tk += ramp + U(2.5, 6);
      }
      knots.push([60, p0, r0]);
      return M.profileFromKnots(knots, 30);
    }
    return M.evalProfile();
  }

  async function lab(box) {
    const V = window.ReViz, M = window.LumenModel, { el } = V;
    const D = await V.loadData();
    const trim = new M.TrimTable(D.trim);
    const q = new URLSearchParams(location.search);
    const st = {
      preset: PRESETS[q.get("preset")] ? q.get("preset") : "pi",
      profile: PROFILES[q.get("profile")] ? q.get("profile") : "eval",
      seed: 1, heat: +(q.get("heat") || 1), tf: +(q.get("fuelturbine") || 1), to: +(q.get("loxturbine") || 1), delay: +(q.get("delay") || D.params.valve_delay),
      sensorDelay: q.get("sensors") !== "ideal", noise: q.get("noise") !== "0", gain: +(q.get("gain") || 1),
    };
    let run = null, pins = [], cursor = null, playing = null;
    const sand = { u: [D.params.x_tfv_ref, D.params.x_tov_ref], ep: null, rows: [] };

    /* ---- layout ---- */
    const presets = el("div", { class: "lab-presets" });
    for (const [gk, gname] of Object.entries(GROUPS)) {
      const g = el("div", { class: "lab-group " + gk }, el("span", {}, gname));
      for (const [k, p] of Object.entries(PRESETS)) if (p.group === gk) g.append(el("button", { class: "re-chip", type: "button", "data-k": k, onclick: () => { st.preset = k; update(); } }, p.label));
      presets.append(g);
    }
    const story = el("div", { class: "lab-story" });
    const profileSel = V.select("set points", Object.entries(PROFILES), st.profile, (v) => { st.profile = v; if (v === "random") st.seed += 1; update(); });
    const newRandom = el("button", { class: "re-btn", type: "button", onclick: () => { st.profile = "random"; profileSel.select.value = "random"; st.seed += 1; update(); } }, "new random");
    const ctlHeat = V.slider("heat flux ×", 0.85, 1.15, 0.01, st.heat, V.fmt(2), (v) => { st.heat = v; update(); });
    const ctlTf = V.slider("fuel turbine ×", 0.85, 1.15, 0.01, st.tf, V.fmt(2), (v) => { st.tf = v; update(); });
    const ctlTo = V.slider("LOX turbine ×", 0.85, 1.15, 0.01, st.to, V.fmt(2), (v) => { st.to = v; update(); });
    const ctlDelay = V.slider("valve dead time [s]", 0.0, 0.15, 0.005, st.delay, V.fmt(3), (v) => { st.delay = v; update(); });
    const chkSensor = el("input", { type: "checkbox" }); chkSensor.checked = st.sensorDelay; chkSensor.addEventListener("change", () => { st.sensorDelay = chkSensor.checked; update(); });
    const chkNoise = el("input", { type: "checkbox" }); chkNoise.checked = st.noise; chkNoise.addEventListener("change", () => { st.noise = chkNoise.checked; update(); });
    const reset = el("button", { class: "re-btn", type: "button", onclick: () => {
      Object.assign(st, { heat: 1, tf: 1, to: 1, delay: D.params.valve_delay, sensorDelay: true, noise: true, gain: 1 });
      ctlHeat.set(1); ctlTf.set(1); ctlTo.set(1); ctlDelay.set(st.delay); ctlGain.set(1); chkSensor.checked = true; chkNoise.checked = true; update();
    } }, "Reset to calibrated");
    const ctlGain = V.slider("PI gain ×", 0.25, 2.5, 0.05, st.gain, V.fmt(2), (v) => { st.gain = v; update(); });
    const sTfv = V.slider("TFV", 0.1, 0.7, 0.005, sand.u[0], V.fmt(3), (v) => { sand.u[0] = v; });
    const sTov = V.slider("TOV", 0.1, 0.5, 0.005, sand.u[1], V.fmt(3), (v) => { sand.u[1] = v; });
    const speedSel = V.select("speed", [["1", "real time"], ["0.5", "half"], ["0.25", "quarter"]], "1", () => {});
    const play = el("button", { class: "re-btn re-primary", type: "button", onclick: () => togglePlay() }, "Play");
    const sandReset = el("button", { class: "re-btn", type: "button", onclick: () => { stopPlay(); startSandbox(); draw(); } }, "Restart");
    const ctlPanel = el("div", { class: "lab-panel" });
    const scores = el("div", { class: "lab-scores" });
    const pinBtn = el("button", { class: "re-btn", type: "button", onclick: () => { if (run) { pins = pins.concat([{ label: PRESETS[st.preset].label, rows: run.rows }]).slice(-3); draw(); } } }, "Pin");
    const clearBtn = el("button", { class: "re-btn", type: "button", onclick: () => { pins = []; draw(); } }, "Clear pins");
    const side = el("div", { class: "lab-side" },
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Set points"), profileSel, newRandom),
      ctlPanel,
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Engine and sensors", reset), ctlHeat, ctlTf, ctlTo, ctlDelay,
        el("label", { class: "re-ctl" }, el("span", {}, "sensor delays (p_cc 0.1 s, ROF 0.2 s)"), chkSensor),
        el("label", { class: "re-ctl" }, el("span", {}, "sensor noise"), chkNoise)),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Outcome", el("span", {}, pinBtn, " ", clearBtn)), scores));
    const cP = V.canvas(190), cR = V.canvas(170), cU = V.canvas(150), cC = V.canvas(140), cW = V.canvas(110);
    let cKey = "t_turbine";
    const CON = { t_turbine: ["turbine inlet temperature [K]", 700, "max"], n_ftp: ["fuel pump speed [rpm]", 50000, "max"], n_otp: ["LOX pump speed [rpm]", 28000, "max"], p_rc: ["cooling-channel pressure [bar]", 46, "min"], t_lng: ["injection temperature [K]", null] };
    const conSel = V.select("constraint", Object.entries(CON).map(([k, v]) => [k, v[0]]), cKey, (v) => { cKey = v; draw(); });
    const readout = el("div", { class: "re-readout" });
    const ink2 = () => V.css("--viz-ink-2");
    const main = el("div", { class: "lab-main" },
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Chamber pressure"), cP, V.legend([[ink2(), "set point", true], [V.series(1), "engine"], [V.css("--viz-muted"), "pinned runs"]])),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Mixture ratio"), cR),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Valves"), cU, V.legend([[V.series(1), "TFV position"], [V.series(2), "TOV position"], [ink2(), "commands", true]])),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, conSel), cC),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Reward per 0.1 s step"), cW, readout));
    box.append(presets, story, el("div", { class: "lab-grid" }, side, main));

    /* ---- simulation ---- */
    function params() {
      return Object.assign({}, D.params, { q_ref: D.params.q_ref * st.heat, a_tf: D.params.a_tf * st.tf, a_to: D.params.a_to * st.to, valve_delay: st.delay });
    }
    function episode(pref, rref, preview) {
      return new M.Episode({ params: params(), trim, pref, rref, preview, sensorDelay: st.sensorDelay, noise: st.noise, seed: 3 });
    }
    async function simulate() {
      const k = st.preset, P = PRESETS[k];
      let prof = profile(M, st.profile, st.seed);
      if (k === "tfv_step" || k === "tov_step") {
        const n = Math.round(30 / M.DT) + 5;
        prof = { pref: new Array(n).fill(40), rref: new Array(n).fill(3.4) };
      }
      let spec = null;
      if (P.policy) {
        spec = await V.loadPolicy(k);
        if (!spec) return { rows: [], missing: true };
      }
      const ep = episode(prof.pref, prof.rref, spec ? spec.env.preview : false);
      const pi = new M.DecoupledPI({ kp_p: D.pi_gains.kp_p * st.gain, ki_p: D.pi_gains.ki_p * st.gain, kp_r: D.pi_gains.kp_r * st.gain, ki_r: D.pi_gains.ki_r * st.gain }, trim);
      const rows = [];
      while (!ep.done) {
        const t = ep.k * M.DT;
        let u;
        if (k === "pi") u = pi.step(ep.meas[0], ep.meas[1], ...ep.setpoint);
        else if (k === "feedforward") u = trim.valves(...ep.setpoint);
        else if (k === "tfv_step") u = [D.params.x_tfv_ref + (t >= 2 ? 0.1 : 0), D.params.x_tov_ref];
        else if (k === "tov_step") u = [D.params.x_tfv_ref, D.params.x_tov_ref + (t >= 2 ? 0.1 : 0)];
        else u = M.toValves(M.mlp(spec, ep.obs()));
        rows.push(ep.step(u));
      }
      return { rows };
    }
    function startSandbox() {
      const prof = profile(M, st.profile, st.seed);
      sand.ep = episode(prof.pref, prof.rref, false);
      sand.u = trim.valves(prof.pref[0], prof.rref[0]);
      sTfv.set(sand.u[0]); sTov.set(sand.u[1]);
      sand.rows = [];
      run = { rows: sand.rows, sandbox: true, n: sand.ep.nSteps, pref: prof.pref, rref: prof.rref };
    }
    function stopPlay() { if (playing) { clearInterval(playing); playing = null; } play.textContent = "Play"; }
    function togglePlay() {
      if (playing) { stopPlay(); return; }
      if (!sand.ep || sand.ep.done) startSandbox();
      play.textContent = "Pause";
      let last = performance.now(), acc = 0;
      playing = setInterval(() => {
        const now = performance.now();
        acc += (now - last) / 1000 * +speedSel.select.value; last = now;
        let moved = false;
        while (acc >= M.DT && !sand.ep.done) { acc -= M.DT; sand.rows.push(sand.ep.step(sand.u.slice())); moved = true; }
        if (moved) draw();
        if (sand.ep.done) stopPlay();
      }, 50);
    }

    /* ---- rendering ---- */
    function metrics(rows) {
      if (!rows.length) return null;
      let ep = 0, er = 0, ret = 0, viol = 0, travel = 0;
      for (const r of rows) { ep += Math.abs(r.p_cc - r.p_ref) / r.p_ref; er += Math.abs(r.rof - r.rof_ref) / r.rof_ref; ret += r.reward; viol += r.n_viol; travel += r.du; }
      return { mape_p: 100 * ep / rows.length, mape_r: 100 * er / rows.length, ret, viol, travel };
    }
    function draw() {
      if (!run) return;
      const rows = run.rows, n = run.sandbox ? run.n : rows.length;
      const t = rows.map((r) => r.t), xlim = [0, n * M.DT];
      const tref = run.sandbox ? run.pref.slice(1, n + 1).map((_, i) => (i + 1) * M.DT) : t;
      const pref = run.sandbox ? run.pref.slice(1, n + 1) : rows.map((r) => r.p_ref);
      const rref = run.sandbox ? run.rref.slice(1, n + 1) : rows.map((r) => r.rof_ref);
      const muted = V.css("--viz-muted");
      const pinLines = (key) => pins.map((p) => ({ x: p.rows.map((r) => r.t), y: p.rows.map((r) => r[key]), color: muted, width: 1.4, alpha: 0.8 }));
      const cur = cursor;
      const base = { xlim, cursor: cur };
      plot(cP, Object.assign({}, base, { x: t, lines: [...pinLines("p_cc"), { x: tref, y: pref, color: ink2(), dash: [5, 4], width: 1.5 }, { y: rows.map((r) => r.p_cc), color: V.series(1) }], ylabel: "bar" }));
      plot(cR, Object.assign({}, base, { x: t, lines: [...pinLines("rof"), { x: tref, y: rref, color: ink2(), dash: [5, 4], width: 1.5 }, { y: rows.map((r) => r.rof), color: V.series(2) }], ylabel: "ROF", hlines: [{ y: 4.0, color: V.css("--viz-s8"), label: "limit 4.0" }] }));
      plot(cU, Object.assign({}, base, { x: t, lines: [{ y: rows.map((r) => r.u_tfv), color: V.series(1), dash: [4, 3], width: 1.2, step: true }, { y: rows.map((r) => r.u_tov), color: V.series(2), dash: [4, 3], width: 1.2, step: true },
        { y: rows.map((r) => r.x_tfv), color: V.series(1) }, { y: rows.map((r) => r.x_tov), color: V.series(2) }], ylim: [0.08, 0.72], ylabel: "opening" }));
      const [cname, lim, kind] = CON[cKey];
      plot(cC, Object.assign({}, base, { x: t, lines: [...pinLines(cKey), { y: rows.map((r) => r[cKey]), color: V.series(3) }], ylabel: cname.split(" [")[1] ? cname.split(" [")[1].replace("]", "") : "", hlines: lim ? [{ y: lim, color: V.css("--viz-s8"), label: (kind === "max" ? "max " : "min ") + lim }] : [] }));
      plot(cW, Object.assign({}, base, { x: t, lines: [...pinLines("reward"), { y: rows.map((r) => r.reward), color: V.series(7), step: true, width: 1.5 }], ylim: [Math.min(-2.2, ...rows.map((r) => r.reward)) - 0.1, 0.1], xlabel: "time [s]" }));
      const m = metrics(rows), pm = pins.length ? metrics(pins[pins.length - 1].rows) : null;
      const sc = (label, v, pv, unit, d) => el("div", { class: "lab-score" }, el("span", {}, label), el("b", {}, v == null ? "–" : v.toFixed(d)), el("small", {}, (unit || "") + (pv != null ? `  (pin ${pv.toFixed(d)})` : "")));
      scores.replaceChildren(sc("return", m && m.ret, pm && pm.ret, "", 1), sc("MAPE p_cc", m && m.mape_p, pm && pm.mape_p, " %", 2), sc("MAPE ROF", m && m.mape_r, pm && pm.mape_r, " %", 2),
        sc("violation steps", m && m.viol, pm && pm.viol, "", 0), sc("valve travel", m && m.travel, pm && pm.travel, "", 2));
      const i = cur == null ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, Math.round(cur / M.DT) - 1));
      const r = rows[i];
      if (r) {
        const ro = (k, v, ok) => el("div", { class: "re-ro " + (ok === undefined ? "" : ok ? "ok" : "bad") }, el("span", {}, k), el("b", {}, v));
        readout.replaceChildren(ro("t", r.t.toFixed(1) + " s"), ro("p_cc / set point", `${r.p_cc.toFixed(1)} / ${r.p_ref.toFixed(1)}`), ro("ROF / set point", `${r.rof.toFixed(2)} / ${r.rof_ref.toFixed(2)}`, !r.violations.rof),
          ro("controller reads", `${r.p_meas.toFixed(1)} bar, ${r.rof_meas.toFixed(2)}`), ro("TFV / TOV", `${r.x_tfv.toFixed(3)} / ${r.x_tov.toFixed(3)}`),
          ro("turbine inlet", Math.round(r.t_turbine) + " K", !r.violations.t_turbine), ro("FTP / OTP", `${Math.round(r.n_ftp / 100) / 10}k / ${Math.round(r.n_otp / 100) / 10}k rpm`, !(r.violations.n_ftp || r.violations.n_otp)),
          ro("p_RC", r.p_rc.toFixed(1) + " bar", !r.violations.p_rc), ro("turbine flow", r.m_turbines.toFixed(3) + " kg/s"), ro("reward", r.reward.toFixed(3)));
      } else readout.replaceChildren();
    }
    let frames = {};
    function plot(c, o) { frames[c.__id || (c.__id = Math.random())] = V.plot(c, o); c.__frame = frames[c.__id]; }
    for (const c of [cP, cR, cU, cC, cW]) {
      c.addEventListener("pointermove", (e) => { if (!c.__frame) return; const r = c.getBoundingClientRect(); cursor = Math.max(0, c.__frame.invX(e.clientX - r.left)); draw(); });
      c.addEventListener("pointerleave", () => { cursor = null; draw(); });
    }

    async function update() {
      stopPlay();
      presets.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === st.preset));
      story.innerHTML = PRESETS[st.preset].story;
      const k = st.preset;
      ctlPanel.replaceChildren(el("div", { class: "lab-title" }, "Controller"));
      if (k === "pi") ctlPanel.append(ctlGain, el("div", { class: "re-note" }, `Tuned gains: k_p ${D.pi_gains.kp_p} and k_i ${D.pi_gains.ki_p} /s on pressure, k_p ${D.pi_gains.kp_r} and k_i ${D.pi_gains.ki_r} /s on mixture ratio.`));
      else if (k === "sandbox") ctlPanel.append(sTfv, sTov, speedSel, el("div", {}, play, " ", sandReset));
      else if (PRESETS[k].policy) ctlPanel.append(el("div", { class: "re-note" }, "An exported network, evaluated deterministically in your browser on the same observation vector as in training (92 numbers with preview, 60 without)."));
      else ctlPanel.append(el("div", { class: "re-note" }, "No feedback: the valve commands are fixed in advance."));
      profileSel.select.disabled = k === "tfv_step" || k === "tov_step";
      if (k === "sandbox") { startSandbox(); draw(); return; }
      const res = await simulate();
      if (res.missing) { story.innerHTML += "<p><i>This policy has not been exported yet.</i></p>"; run = null; return; }
      run = res;
      draw();
    }
    V.onTheme(draw);
    update();
  }

  function init() {
    document.querySelectorAll('.re-widget[data-widget="lab"]').forEach((box) => {
      if (box.dataset.ready) return;
      box.dataset.ready = "1";
      if (!window.ReViz || !window.LumenModel) return;
      lab(box).catch((err) => box.append(document.createTextNode("The Lab failed to load: " + err.message)));
    });
  }
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
