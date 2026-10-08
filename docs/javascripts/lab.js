/* The Engine Lab: the 2x2 task on the LUMEN-like surrogate, in the browser.
 * Presets are grouped by who turns the knobs: a schedule (open loop), the PI controller (feedback),
 * a trained network (learned feedback) or you (sandbox). Every run uses the same episode code as the
 * Python environment (lumen-model.js; checked by tests/test_lab_model.py). Needs widgets.js (ReViz)
 * and teststand.js (ReStand).
 *
 * Layout: one viewer around the animated test stand. On wide screens (and in full screen) the controls
 * float over the scene as glass panels docked at its edges ("hud" mode) and the camera fits the engine
 * into the space between them; on narrow screens the same panels stack under the scene ("stack" mode).
 * Every panel folds to its title; information cards (story, labels, acronyms, about) open from the
 * buttons in the top-right corner. The full plots sit under the viewer. */
(function () {
  "use strict";
  const PRESETS = {
    feedforward: { group: "open", label: "Feedforward only", chip: "Feedforward", ctl: "OPEN", story: "<b>Open loop.</b> Each 0.1 s the valves go to the openings that would hold the set point in steady state (the trim table), with no measurement at all. On the nominal engine it gets the levels right once everything has settled; the slow heat budget makes the transients wrong for 10–20 s, and any change to the engine (try <i>heat flux ×</i>) leaves a permanent error." },
    tfv_step: { group: "open", label: "TFV step", chip: "TFV step", ctl: "OPEN", story: "<b>Open loop: TFV +0.1 at t = 2 s</b> from the 40 bar point. Pressure overshoots to about +6.5 bar within two seconds, then sags towards +3.4 bar over ~20 s as the coolant warms less: more coolant flow through the same heat. In DLR's model the peak is 6.5 bar against a final 3.7 bar (thesis p. 73 and Tables 4.6–4.7); the surrogate was fitted to those numbers." },
    tov_step: { group: "open", label: "TOV step", chip: "TOV step", ctl: "OPEN", story: "<b>Open loop: TOV +0.1 at t = 2 s.</b> The oxidiser side answers in about half a second: more LOX, higher pressure and mixture ratio, almost nothing on the fuel side. Compare with the TFV step: one action channel is fast, the other slow." },
    pi: { group: "fb", label: "Decoupled PI", chip: "Decoupled PI", ctl: "PI", story: "<b>Feedback.</b> Feedforward from the trim table, a static decoupler (the inverse of the local gain matrix) and two PI loops on the measured, delayed p_cc and ROF, gains tuned on 12 training episodes. Watch the pressure loop fight the slow thermal sag after each TFV move, and the coupling: every pressure correction disturbs ROF. <i>PI gain ×</i> scales both loops." },
    "ppo-preview": { group: "rl", label: "PPO, preview", chip: "PPO + preview", ctl: "PPO", policy: true, story: "<b>Learned feedback.</b> A 2×128 tanh network trained with PPO (3 M steps, 17 min on a laptop CPU). It reads the last four observation frames and the set points for the next 0.5 s, so it can start moving before a step arrives. The challenge gives no preview (its targets are generated in real time), so this preset shows what looking ahead is worth, not what an entry can do." },
    "ppo-nopreview": { group: "rl", label: "PPO, no preview", chip: "PPO", ctl: "PPO", policy: true, story: "<b>Learned feedback, no preview.</b> Same as PPO with preview, but it only knows the set point for the coming 0.1 s. Its pressure error is about twice that of PPO with preview, mostly in transients (27 min of training). This is the observation the challenge allows." },
    "sac-preview": { group: "rl", label: "SAC, preview", chip: "SAC + preview", ctl: "SAC", policy: true, story: "<b>Learned feedback.</b> A 2×128 ReLU network trained with SAC (450 k steps, 55 min), the algorithm DLR used on LUMEN. Reads the same observation as PPO with preview, which the challenge does not allow: compare it with SAC without preview." },
    "sac-nopreview": { group: "rl", label: "SAC, no preview", chip: "SAC", ctl: "SAC", policy: true, story: "<b>Learned feedback, no preview.</b> SAC without the 0.5 s look-ahead (500 k steps, 50 min). This is the observation the challenge allows." },
    sandbox: { group: "you", label: "Sandbox", chip: "Sandbox: you drive", ctl: "YOU", story: "<b>You turn the knobs.</b> Press <i>Play</i> (or the space bar) and follow the dashed set points with TFV and TOV: use the sliders in the Controller panel, drag the valves on the stand up and down, or use the arrow keys (← → for TFV, ↓ ↑ for TOV). It runs in real time, or slower. Pin your run and compare it with PI." },
  };
  const GROUPS = { open: "Open loop", fb: "Feedback", rl: "Learned", you: "You" };
  const PROFILES = { eval: "Evaluation profile, 40 s", ladder: "Pressure ladder", rof: "Mixture-ratio steps", random: "Random (new each click)" };
  // Every acronym the Lab shows. includes/abbreviations.md spells out the same ones for the whole site
  // (tests/test_docs.py checks that the two agree).
  const ACRONYMS = [
    ["Engine and test stand", [
      ["LUMEN", "Liquid Upper Stage Demonstrator Engine: DLR's 25 kN LOX/methane expander-bleed engine"],
      ["DLR", "Deutsches Zentrum für Luft- und Raumfahrt, the German Aerospace Center"],
      ["P8.3", "the test cell at DLR Lampoldshausen where LUMEN is fired"],
      ["LOX", "liquid oxygen, the oxidiser"],
      ["LNG", "liquefied natural gas (methane), the fuel"],
      ["CH₄", "methane, on the stand's flow tags"],
      ["OTP", "oxidiser turbopump"],
      ["FTP", "fuel turbopump"],
      ["TFV", "turbine fuel valve; action 1"],
      ["TOV", "turbine oxidiser valve; action 2"],
      ["FCV", "fuel control valve (bypass line); frozen in the 2×2 task"],
      ["BPV", "bypass valve (vent); frozen"],
      ["OCV", "oxidiser control valve; frozen"],
      ["XCV", "mixer control valve; frozen"],
      ["RC", "regenerative cooling: the fuel cools the chamber wall"],
      ["GN2", "gaseous nitrogen; spins up the turbines at start-up"],
      ["LN2", "liquid nitrogen; purges the lines after shutdown"],
    ]],
    ["Signals and limits", [
      ["p_cc", "combustion-chamber pressure, bar; the thrust proxy the controller tracks"],
      ["ROF", "oxidiser-to-fuel mass-flow ratio (mixture ratio), R_OF in the equations; allowed 2.5–4.0"],
      ["p_RC", "cooling-channel pressure, bar; at least 46"],
      ["turbine inlet T", "coolant outlet temperature; at most 700 K"],
      ["rpm", "revolutions per minute; OTP at most 28k, FTP at most 50k"],
    ]],
    ["Controllers and scores", [
      ["PI", "proportional–integral controller"],
      ["RL", "reinforcement learning"],
      ["PPO", "Proximal Policy Optimization, an on-policy RL algorithm"],
      ["SAC", "Soft Actor-Critic, an off-policy RL algorithm"],
      ["preview", "future set points in the agent's observation"],
      ["MAPE", "mean absolute percentage error"],
    ]],
  ];
  const ICON = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.4"/>',
    tag: '<path d="M3.5 12.5V4h8.5l9 9-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2.9-1.2 1.6v.6M12 16.9v.4"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    chev: '<path d="M7 10l5 5 5-5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 6v12M6 12h12"/><circle cx="12" cy="12" r="9.5" opacity=".35"/>',
    minus: '<path d="M6 12h12"/><circle cx="12" cy="12" r="9.5" opacity=".35"/>',
    home: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/>',
    play: '<path d="M8 5.6v12.8a.9.9 0 0 0 1.4.75l9.6-6.4a.9.9 0 0 0 0-1.5L9.4 4.85A.9.9 0 0 0 8 5.6z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
    gear: '<path d="M12 3.2l1.4 2.2 2.5-.7.4 2.6 2.5.9-.9 2.4 1.9 1.8-1.9 1.8.9 2.4-2.5.9-.4 2.6-2.5-.7L12 20.8l-1.4-2.2-2.5.7-.4-2.6-2.5-.9.9-2.4L4.2 12l1.9-1.8-.9-2.4 2.5-.9.4-2.6 2.5.7z"/><circle cx="12" cy="12" r="2.8" fill="currentColor" fill-opacity=".25"/>',
  };
  // a button's label: an icon from the set above, then words
  function btnLabel(btn, icon, text) { btn.replaceChildren(svg(ICON[icon]), document.createTextNode(" " + text)); }
  function svg(d) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "hud-ic");
    s.innerHTML = d;
    return s;
  }
  const store = {  // per-viewer conveniences only (layers, folded panels); the page works without it
    get(k) { try { return JSON.parse(localStorage.getItem("re-lab:" + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("re-lab:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

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
    const L = M.LIMITS;
    const q = new URLSearchParams(location.search);
    const st = {
      preset: PRESETS[q.get("preset")] ? q.get("preset") : "pi",
      profile: PROFILES[q.get("profile")] ? q.get("profile") : "eval",
      seed: 1, heat: +(q.get("heat") || 1), tf: +(q.get("fuelturbine") || 1), to: +(q.get("loxturbine") || 1), delay: +(q.get("delay") || D.params.valve_delay),
      sensorDelay: q.get("sensors") !== "ideal", noise: q.get("noise") !== "0", gain: +(q.get("gain") || 1),
    };
    let run = null, pins = [], cursor = null, playing = null, mode = null, seqState = "run", shown = null;
    const rp = { on: false, k: 0, last: 0, drawn: 0, played: false };  // replay of the episode on the stand
    const sand = { u: [D.params.x_tfv_ref, D.params.x_tov_ref], ep: null, rows: [] };
    const layers = Object.assign({ parts: null, flows: false, signals: true, callouts: true, caption: true }, store.get("layers") || {});
    const groupColor = (gk) => V.css({ open: "--viz-s4", fb: "--viz-s3", rl: "--viz-s7", you: "--brand-accent" }[gk]);

    /* ================================================================ the viewer */
    const viewer = el("div", { class: "lab-viewer", tabindex: "0", "aria-label": "Engine Lab: the test stand and its controls. Keys: space plays, F full screen, ? help." });
    const scene = el("div", { class: "lab-scene" });
    // top bar: status badge and title on the left, tool buttons on the right
    const badge = el("span", { class: "hud-badge" }, "HOT FIRE");
    const tMain = el("b", {}), tSub = el("span", {});
    const hudTop = el("div", { class: "hud-top" }, el("div", { class: "hud-titlebox" }, badge, el("div", { class: "hud-title" }, tMain, tSub)));
    const tools = el("div", { class: "hud-tools", role: "toolbar", "aria-label": "Viewer tools" });
    hudTop.append(tools);
    const dockL = el("div", { class: "hud-dock hud-dock-l" }), dockR = el("div", { class: "hud-dock hud-dock-r" });
    const cards = el("div", { class: "hud-cards" });
    const caption = el("div", { class: "hud-caption", "aria-live": "polite" });
    const hudBottom = el("div", { class: "hud-bottom" });
    viewer.append(scene, hudTop, hudBottom, cards, dockL, dockR);

    function panel(id, title) {
      const sum = el("span", { class: "hud-sum" });
      const head = el("button", { class: "hud-head", type: "button", "aria-expanded": "true", title: "Fold or unfold " + title }, el("span", { class: "hud-ttl" }, title), sum, svg(ICON.chev));
      const body = el("div", { class: "hud-pbody" });
      const root = el("section", { class: "hud-panel", "data-panel": id }, head, body);
      const p = { id, root, body, sum, open: true };
      p.set = (open, byUser) => {
        p.open = open; root.classList.toggle("closed", !open); head.setAttribute("aria-expanded", String(open));
        if (byUser) store.set(`panel-${mode}-${id}`, open);
        layoutSoon(); if (open) requestAnimationFrame(draw);
      };
      head.addEventListener("click", () => p.set(!p.open, true));
      return p;
    }
    const cardMap = {};
    let openCard = null;
    function card(id, title) {
      const body = el("div", { class: "hud-cbody" });
      const close = el("button", { class: "hud-x", type: "button", "aria-label": "Close " + title, onclick: () => showCard(null) }, svg(ICON.close));
      const root = el("section", { class: "hud-card", "data-card": id, role: "dialog", "aria-label": title }, el("div", { class: "hud-chead" }, el("span", {}, title), close), body);
      root.hidden = true;
      cards.append(root);
      return (cardMap[id] = { root, body });
    }
    const toolBtns = {};
    function tool(id, icon, text, title, onclick) {
      const b = el("button", { class: "hud-tool", type: "button", title, "aria-label": title, "data-tool": id, onclick }, icon, text ? el("span", { class: "hud-tool-t" }, text) : null);
      tools.append(b);
      return (toolBtns[id] = b);
    }
    function showCard(id) {
      openCard = openCard === id ? null : id;
      for (const [k, c] of Object.entries(cardMap)) c.root.hidden = k !== openCard;
      for (const [k, b] of Object.entries(toolBtns)) if (cardMap[k]) b.setAttribute("aria-pressed", String(k === openCard));
      if (openCard === "story") toolBtns.story.classList.remove("news");
      if (openCard && mode === "stack") cardMap[openCard].root.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    /* ---- information cards (folded away until asked for) ---- */
    const cStory = card("story", "What this preset shows");
    const cLayers = card("layers", "Labels on the stand");
    const cAcr = card("acr", "Acronyms");
    const cAbout = card("about", "About this view");
    tool("story", svg(ICON.info), "Story", "What this preset shows", () => showCard("story"));
    tool("layers", svg(ICON.tag), "Labels", "Labels on the stand", () => showCard("layers"));
    tool("acr", el("span", { class: "hud-az" }, "A–Z"), "Acronyms", "Acronyms spelled out", () => showCard("acr"));
    tool("about", svg(ICON.help), "About", "About this view, keys", () => showCard("about"));
    const fullBtn = tool("full", svg(ICON.full), null, "Full screen (F)", () => toggleFull());

    cAcr.body.append(...ACRONYMS.map(([g, items]) => el("div", { class: "acr-group" }, el("h4", {}, g),
      el("dl", { class: "acr-list" }, ...items.flatMap(([a, d]) => [el("dt", {}, a), el("dd", {}, d)])))),
      el("p", { class: "hud-more" }, "More terms in the ", el("a", { href: "../9-field/#glossary" }, "glossary"), ". Across the site, hover an underlined acronym to see it spelled out."));
    const LAYER_TEXT = [["parts", "Part names", "acronyms spelled out under each label"], ["flows", "Flows and temperatures", "tags on the propellant and hot-gas lines"],
      ["signals", "Control loop", "controller cabinet, sensor tap, signal pulses each 0.1 s"], ["callouts", "Event callouts", "start-up phases, set-point steps, limits"], ["caption", "Narration", "one line on what is happening, under the stand"]];
    const layerChecks = {};
    cLayers.body.append(...LAYER_TEXT.map(([k, t, d]) => {
      const c = el("input", { type: "checkbox" });
      c.addEventListener("change", () => { layers[k] = c.checked; store.set("layers", layers); applyLayers(); });
      layerChecks[k] = c;
      return el("label", { class: "hud-check" }, c, el("span", {}, el("b", {}, t), el("small", {}, d)));
    }), el("p", { class: "hud-more" }, "Hover a part (or tap it on a touch screen) for its full name and live values. Press L to toggle the part names."));
    cAbout.body.append(
      el("p", {}, "LUMEN as DLR fires it at Lampoldshausen: horizontally, out of the open side of the P8.3 cell, with a water-spray ring around the plume (layout after the photos in Traudt et al., IAC 2024). Pumps, valves, flows, coolant temperature and the plume follow the surrogate at the time on the slider."),
      el("p", {}, el("b", {}, "Coarse guesses: "), "the flame, steam and colours. The plume grows with chamber pressure, turns orange when fuel-rich and violet-blue towards stoichiometric, and its shock diamonds spread with pressure. Below about 38 bar the jet separates inside the nozzle (also a guess; the nozzle is designed for no separation at 60 bar)."),
      el("h4", {}, "Reading the stand"),
      el("ul", { class: "hud-keys" },
        el("li", {}, el("i", { class: "sw", style: "background:#468ceb" }), "LOX line, ", el("i", { class: "sw", style: "background:#46c8d2" }), "LNG line, ", el("i", { class: "sw", style: "background:linear-gradient(90deg,#f0aa3c,#eb3c28)" }), "warm methane, yellow to red with temperature; moving dashes are the flow"),
        el("li", {}, "Ring round each pump: its speed as a share of the limit (green, amber above 90 %, red over)."),
        el("li", {}, "Valve dial: orange is the opening, the tick is the command; a glow means the valve is still travelling."),
        el("li", {}, "Dashed wires: the controller reads the sensor tap and commands the valves; the dots are one 0.1 s step."),
        el("li", {}, "Amber ", svg(ICON.gear), " tags: engine parameters you changed. Red outlines: a limit is violated.")),
      el("h4", {}, "Keys"),
      el("ul", { class: "hud-keys" },
        el("li", {}, el("kbd", {}, "Space"), " play or pause · ", el("kbd", {}, "←"), " ", el("kbd", {}, "→"), " step 1 s · ", el("kbd", {}, "F"), " full screen · ", el("kbd", {}, "L"), " part names · ", el("kbd", {}, "?"), " this card"),
        el("li", {}, el("kbd", {}, "+"), " ", el("kbd", {}, "−"), " zoom, ", el("kbd", {}, "0"), " whole stand; drag the scene to pan, double-click to zoom in"),
        el("li", {}, "Sandbox: ", el("kbd", {}, "←"), " ", el("kbd", {}, "→"), " TFV, ", el("kbd", {}, "↓"), " ", el("kbd", {}, "↑"), " TOV, or drag the valves")),
      el("p", { class: "hud-more" }, el("a", { href: "#model-card" }, "Model card"), ": what the surrogate is, how it was calibrated and where it is wrong."));

    /* ---- panels: controller and engine on the left, telemetry and score on the right ---- */
    const pCtl = panel("ctl", "Controller"), pEng = panel("eng", "Engine and sensors"), pTel = panel("tel", "Telemetry"), pScore = panel("score", "Score");
    dockL.append(pCtl.root, pEng.root); dockR.append(pTel.root, pScore.root);
    const PANELS = [pCtl, pEng, pTel, pScore];

    const presets = el("div", { class: "lab-presets" });
    for (const [gk, gname] of Object.entries(GROUPS)) {
      const g = el("div", { class: "lab-group " + gk }, el("span", {}, gname));
      const chips = el("div", { class: "lab-chips" });
      for (const [k, p] of Object.entries(PRESETS)) if (p.group === gk) chips.append(el("button", { class: "re-chip", type: "button", "data-k": k, title: p.label, onclick: () => { st.preset = k; update(); } }, p.chip));
      g.append(chips);
      presets.append(g);
    }
    const profileSel = V.select("set points", Object.entries(PROFILES), st.profile, (v) => { st.profile = v; if (v === "random") st.seed += 1; update(); });
    const newRandom = el("button", { class: "re-btn", type: "button", onclick: () => { st.profile = "random"; profileSel.select.value = "random"; st.seed += 1; update(); } }, "new random");
    const ctlSlot = el("div", { class: "lab-ctlslot" });
    pCtl.body.append(presets, el("div", { class: "lab-row" }, profileSel, newRandom), ctlSlot);

    const ctlHeat = V.slider("heat flux ×", 0.85, 1.15, 0.01, st.heat, V.fmt(2), (v) => { st.heat = v; update(); });
    const ctlTf = V.slider("fuel turbine ×", 0.85, 1.15, 0.01, st.tf, V.fmt(2), (v) => { st.tf = v; update(); });
    const ctlTo = V.slider("LOX turbine ×", 0.85, 1.15, 0.01, st.to, V.fmt(2), (v) => { st.to = v; update(); });
    const ctlDelay = V.slider("valve dead time [s]", 0.0, 0.15, 0.005, st.delay, V.fmt(3), (v) => { st.delay = v; update(); });
    const chkSensor = el("input", { type: "checkbox" }); chkSensor.checked = st.sensorDelay; chkSensor.addEventListener("change", () => { st.sensorDelay = chkSensor.checked; update(); });
    const chkNoise = el("input", { type: "checkbox" }); chkNoise.checked = st.noise; chkNoise.addEventListener("change", () => { st.noise = chkNoise.checked; update(); });
    const ctlGain = V.slider("PI gain ×", 0.25, 2.5, 0.05, st.gain, V.fmt(2), (v) => { st.gain = v; update(); });
    const reset = el("button", { class: "re-btn", type: "button", onclick: () => {
      Object.assign(st, { heat: 1, tf: 1, to: 1, delay: D.params.valve_delay, sensorDelay: true, noise: true, gain: 1 });
      ctlHeat.set(1); ctlTf.set(1); ctlTo.set(1); ctlDelay.set(st.delay); ctlGain.set(1); chkSensor.checked = true; chkNoise.checked = true; update();
    } }, "Reset to calibrated");
    pEng.body.append(ctlHeat, ctlTf, ctlTo, ctlDelay,
      el("label", { class: "re-ctl" }, el("span", {}, "sensor delays (p_cc 0.1 s, ROF 0.2 s)"), chkSensor),
      el("label", { class: "re-ctl" }, el("span", {}, "sensor noise"), chkNoise),
      el("div", { class: "lab-row" }, reset),
      el("div", { class: "re-note" }, "Perturbations the controllers were not trained on. They show on the stand as amber ", svg(ICON.gear), " tags."));

    // sandbox controls
    const sTfv = V.slider("TFV", 0.1, 0.7, 0.005, sand.u[0], V.fmt(3), (v) => { sand.u[0] = v; sandboxShow(); });
    const sTov = V.slider("TOV", 0.1, 0.5, 0.005, sand.u[1], V.fmt(3), (v) => { sand.u[1] = v; sandboxShow(); });
    const speedSel = V.select("speed", [["1", "real time"], ["0.5", "half"], ["0.25", "quarter"]], "1", () => {});
    const sandReset = el("button", { class: "re-btn", type: "button", onclick: () => { stopPlay(); startSandbox(); draw(); standShow(epRow(sand.ep)); } }, "Restart");

    // telemetry: two dials, the limit margins and the trends
    const gauge = V.canvas(104); gauge.classList.add("tel-gauge");
    const limBox = el("div", { class: "tel-limits" });
    const LIMROWS = [
      ["t_turbine", "turbine inlet T", [250, 760], L.t_turbine_max, "max", (v) => Math.round(v) + " K"],
      ["n_ftp", "FTP speed", [0, 55000], L.n_ftp_max, "max", (v) => (v / 1000).toFixed(1) + "k rpm"],
      ["n_otp", "OTP speed", [0, 31000], L.n_otp_max, "max", (v) => (v / 1000).toFixed(1) + "k rpm"],
      ["p_rc", "p_RC", [30, 80], L.p_rc_min, "min", (v) => v.toFixed(1) + " bar"],
      ["rof", "ROF", [2.3, 4.2], L.rof_max, "max", (v) => v.toFixed(2)],
    ];
    const limEls = LIMROWS.map(([k, name, sc, lim]) => {
      const fill = el("i", { class: "tel-fill" }), val = el("b", {}), row = el("div", { class: "tel-lim", title: `${name}: limit ${lim}` },
        el("span", {}, name), el("span", { class: "tel-bar" }, fill, el("i", { class: "tel-mark", style: `left:${(100 * (lim - sc[0]) / (sc[1] - sc[0])).toFixed(1)}%` })), val);
      return { k, row, fill, val };
    });
    limBox.append(...limEls.map((x) => x.row));
    const readsLine = el("div", { class: "tel-reads" });
    const spP = V.canvas(64), spR = V.canvas(64);
    pTel.body.append(gauge, readsLine, limBox, el("div", { class: "tel-spark" }, el("span", {}, "p_cc"), spP), el("div", { class: "tel-spark" }, el("span", {}, "ROF"), spR));

    // score
    const scores = el("div", { class: "lab-scores" });
    const pinBtn = el("button", { class: "re-btn", type: "button", onclick: () => { if (run && run.rows.length) { pins = pins.concat([{ label: PRESETS[st.preset].label, rows: run.rows.slice() }]).slice(-3); draw(); } } }, "Pin this run");
    const clearBtn = el("button", { class: "re-btn", type: "button", onclick: () => { pins = []; draw(); } }, "Clear pins");
    pScore.body.append(scores, el("div", { class: "lab-row" }, pinBtn, clearBtn), el("div", { class: "re-note" }, "Pinned runs (up to three) show as grey lines in the plots below; the last pin's scores are in brackets."));

    /* ---- bottom bar: narration and transport ---- */
    const sPlay = el("button", { class: "re-btn re-primary hud-play", type: "button", onclick: () => toggleReplay() });
    btnLabel(sPlay, "play", "Hot fire");
    const sSlider = el("input", { type: "range", min: 0, max: 300, step: 1, value: 0, class: "lab-tslider", "aria-label": "time in the episode" });
    const sTime = el("span", { class: "lab-tlabel" }, "t = 0.0 s");
    const sSpeed = V.select("speed", [["1", "1×"], ["2", "2×"], ["4", "4×"]], "1", () => {});
    const sSeq = el("input", { type: "checkbox" }); sSeq.checked = true;
    const zoomBox = el("span", { class: "hud-zoom" },
      el("button", { class: "hud-tool", type: "button", title: "Zoom out (−)", "aria-label": "Zoom out", onclick: () => stand && stand.zoomBy(1 / 1.3) }, svg(ICON.minus)),
      el("button", { class: "hud-tool", type: "button", title: "Zoom in (+)", "aria-label": "Zoom in", onclick: () => stand && stand.zoomBy(1.3) }, svg(ICON.plus)),
      el("button", { class: "hud-tool", type: "button", title: "Whole stand (0)", "aria-label": "Show the whole stand", onclick: () => stand && stand.resetZoom() }, svg(ICON.home)));
    const transport = el("div", { class: "lab-transport" }, sPlay, sTime, sSlider, sSpeed, el("label", { class: "re-ctl", title: "Play a start-up before the episode and a shutdown after it" }, sSeq, el("span", {}, "start-up", el("span", { class: "hud-long" }, " and shutdown"))),
      el("span", { class: "hud-disclaimer" }, el("b", {}, "Surrogate engine, not DLR's simulator."), el("span", { class: "hud-long" }, " Schematic; flame, steam and colours are coarse guesses.")), zoomBox);
    hudBottom.append(caption, transport);

    /* ---- the full plots, under the viewer ---- */
    const cP = V.canvas(190), cR = V.canvas(170), cU = V.canvas(160), cC = V.canvas(160), cW = V.canvas(130);
    let cKey = "t_turbine";
    const CON = { t_turbine: ["turbine inlet temperature [K]", L.t_turbine_max, "max"], n_ftp: ["fuel pump speed [rpm]", L.n_ftp_max, "max"], n_otp: ["LOX pump speed [rpm]", L.n_otp_max, "max"], p_rc: ["cooling-channel pressure [bar]", L.p_rc_min, "min"], t_lng: ["injection temperature [K]", null] };
    const conSel = V.select("constraint", Object.entries(CON).map(([k, v]) => [k, v[0]]), cKey, (v) => { cKey = v; draw(); });
    const ink2 = () => V.css("--viz-ink-2");
    const plots = el("div", { class: "lab-plots" },
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Chamber pressure p_cc"), cP, V.legend([[ink2(), "set point", true], [V.series(1), "engine"], [V.css("--viz-muted"), "pinned runs"]])),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Mixture ratio ROF"), cR, V.legend([[ink2(), "set point", true], [V.series(2), "engine"], [V.css("--viz-s8"), "limit"]])),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, "Valves"), cU, V.legend([[V.series(1), "TFV position"], [V.series(2), "TOV position"], [ink2(), "commands", true]])),
      el("div", { class: "lab-panel" }, el("div", { class: "lab-title" }, conSel), cC),
      el("div", { class: "lab-panel lab-wide" }, el("div", { class: "lab-title" }, "Reward per 0.1 s step"), cW));
    box.append(viewer, el("div", { class: "lab-plots-title" }, "The whole episode", el("span", {}, "Hover any plot to look at that moment on the stand.")), plots);

    /* ================================================================ the stand */
    const stand = window.ReStand ? window.ReStand.create(scene, { state: "run", fill: true, hud: true, onStatus: setStatus, wheelZoom: () => isFull() }) : null;
    const FOCUS = { hud: { x0: 150, x1: 905, y0: 0, y1: 398, v: 0.62 }, stack: { x0: 150, x1: 880, y0: 20, y1: 396, v: 0.5 } };
    if (stand) {  // until the first episode is ready: the engine at its 40 bar reference point
      const o = M.outputs(M.steadyState(D.params.x_tfv_ref, D.params.x_tov_ref, D.params), D.params);
      stand.setRow(Object.assign({}, o, { t: 0, p_ref: 40, rof_ref: 3.4, t_turbine: o.t_rc, violations: {} }));
      stand.canvas.addEventListener("pointerdown", () => viewer.focus({ preventScroll: true }));
    }
    function setStatus(s) {
      seqState = s.state;
      badge.textContent = s.text;
      badge.style.background = s.color;
      const on = s.state === "run" || s.state === "ignition" || s.state === "shutdown";
      viewer.classList.toggle("firing", on);
      if (s.state === "off" && st.preset !== "sandbox" && !rp.on) btnLabel(sPlay, "play", "Hot fire");
      drawCaption();
    }
    function applyLayers() {
      const parts = layers.parts == null ? mode === "hud" : layers.parts;
      for (const [k, c] of Object.entries(layerChecks)) c.checked = k === "parts" ? parts : !!layers[k];
      if (stand) stand.setLayers({ parts, flows: layers.flows, signals: layers.signals, callouts: layers.callouts });
      caption.hidden = !layers.caption;
      layoutSoon();
    }

    /* ---- layout: hud on wide screens and in full screen, stacked on narrow ones ---- */
    let layoutQueued = false;
    function layoutSoon() { if (!layoutQueued) { layoutQueued = true; requestAnimationFrame(() => { layoutQueued = false; layout(); }); } }
    function layout() {
      const full = viewer.classList.contains("is-full");
      const w = full ? window.innerWidth : box.clientWidth;
      const m = (full ? w >= 640 && window.innerHeight >= 340 : w >= 900) ? "hud" : "stack";
      if (m !== mode) {
        mode = m; viewer.dataset.mode = m;
        // the tool buttons: top-right corner of the scene in hud mode, along its lower edge when stacked
        if (m === "hud") hudTop.append(tools); else scene.after(tools);
        // what is unfolded at first: as much as leaves the engine room to breathe
        const h = full ? window.innerHeight : Math.min(900, Math.max(540, window.innerHeight - 68)), roomy = w >= 1250;
        const def = m === "hud" ? { ctl: h >= 560, eng: roomy && h >= 640, tel: roomy || w >= 1150, score: roomy && h >= 800 } : { ctl: true, eng: false, tel: false, score: false };
        for (const p of PANELS) { const saved = store.get(`panel-${m}-${p.id}`); p.set(saved == null ? def[p.id] : saved); }
        applyLayers();
      }
      viewer.classList.toggle("compact", mode === "hud" && viewer.clientHeight < 600);
      updateInsets();
    }
    function updateInsets() {
      if (!stand) return;
      if (mode !== "hud") { stand.setView({ insets: { l: 0, r: 0, t: 0, b: 0 }, focus: FOCUS.stack, safeTop: hudTop.offsetHeight + 4 }); return; }
      const vr = viewer.getBoundingClientRect();
      const side = (dock, left) => {
        let m = 0;
        // folded panels only count when the viewer is short: then the scene is limited by height anyway
        const compact = viewer.classList.contains("compact");
        for (const p of dock.children) if (compact || !p.classList.contains("closed")) { const r = p.getBoundingClientRect(); m = Math.max(m, left ? r.right - vr.left : vr.right - r.left); }
        return m ? m + 8 : 0;
      };
      const t = hudTop.getBoundingClientRect().bottom - vr.top + 6, b = vr.bottom - hudBottom.getBoundingClientRect().top + 6;
      viewer.style.setProperty("--hud-t", t + "px"); viewer.style.setProperty("--hud-b", b + "px");
      stand.setView({ insets: { l: side(dockL, true), r: side(dockR, false), t, b }, focus: FOCUS.hud });
    }
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(layoutSoon);
      for (const e of [box, dockL, dockR, hudTop, hudBottom]) ro.observe(e);
    } else window.addEventListener("resize", layoutSoon);

    function isFull() { return viewer.classList.contains("is-full"); }
    function toggleFull(force) {
      const on = force === undefined ? !isFull() : force;
      if (on === isFull()) return;
      viewer.classList.toggle("is-full", on);
      document.documentElement.classList.toggle("lab-full-open", on);
      fullBtn.replaceChildren(svg(on ? ICON.exit : ICON.full));
      fullBtn.title = on ? "Leave full screen (F or Esc)" : "Full screen (F)";
      if (on && viewer.requestFullscreen && !document.fullscreenElement) viewer.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (on) viewer.focus({ preventScroll: true });
      mode = null; layoutSoon();
    }
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && isFull()) toggleFull(false); });

    /* ================================================================ replay of the episode on the stand */
    function rowAt(i) { return run && run.rows.length ? run.rows[Math.max(0, Math.min(run.rows.length - 1, i))] : null; }
    function epRow(ep) {  // the state before the first step, shaped like an episode row
      const o = ep.out;
      return Object.assign({}, o, { t: 0, p_ref: ep.pref[0], rof_ref: ep.rref[0], t_turbine: o.t_rc, m_turbines: o.m_tf + o.m_to, p_meas: ep.meas[0], rof_meas: ep.meas[1], u_tfv: o.x_tfv, u_tov: o.x_tov, violations: {} });
    }
    function standShow(r) {
      if (!r) return;
      if (st.preset === "sandbox") r = Object.assign({}, r, { u_tfv: sand.u[0], u_tov: sand.u[1] });
      shown = r;
      if (stand) stand.setRow(r);
      tMain.textContent = `${PRESETS[st.preset].label} · ${st.preset === "tfv_step" || st.preset === "tov_step" ? "the 40 bar point" : PROFILES[st.profile].replace(" (new each click)", "")}`;
      tSub.textContent = `t = ${r.t.toFixed(1)} s · set point ${r.p_ref.toFixed(1)} bar, ROF ${r.rof_ref.toFixed(2)}`;
      sTime.textContent = `t = ${r.t.toFixed(1)} s`;
      drawTelemetry(r);
      drawCaption();
    }
    function sandboxShow() {
      if (!sand.ep) return;
      standShow(sand.rows.length ? sand.rows[sand.rows.length - 1] : epRow(sand.ep));
    }
    function stopReplay(label) { rp.on = false; btnLabel(sPlay, "play", label || "Hot fire"); }
    function toggleReplay() {
      if (!stand) return;
      if (st.preset === "sandbox") { togglePlay(); return; }
      if (rp.on) { stopReplay("Continue"); return; }
      if (!run || !run.rows.length) return;
      const fromStart = rp.k >= run.rows.length - 1 || stand.state === "off" || stand.state === "purge" || rp.k === 0;
      if (fromStart) { rp.k = 0; stand.clearCallouts(); }
      standShow(rowAt(0));
      if (fromStart && sSeq.checked) { stand.setState("off"); stand.ignite(); } else stand.setState("run");
      rp.on = true; rp.last = 0; btnLabel(sPlay, "pause", "Pause");
      requestAnimationFrame(tick);
    }
    function tick(ts) {
      if (!rp.on) return;
      const dt = rp.last ? Math.min(0.1, (ts - rp.last) / 1000) : 0;
      rp.last = ts;
      if (stand.state === "run") {
        const i0 = Math.floor(rp.k);
        rp.k += dt / M.DT * +sSpeed.select.value;
        const n = run.rows.length - 1;
        if (rp.k >= n) { rp.k = n; stopReplay(); if (sSeq.checked) stand.shutdown(); }
        const i = Math.floor(rp.k);
        events(i0, i);
        cursor = (i + 1) * M.DT; sSlider.value = i;
        standShow(rowAt(i));
        if (ts - rp.drawn > 70 || !rp.on) { rp.drawn = ts; draw(); }
      }
      if (rp.on) requestAnimationFrame(tick);
    }
    sSlider.addEventListener("input", () => {
      if (st.preset === "sandbox" || !run) return;
      stopReplay("Continue");
      rp.k = +sSlider.value;
      cursor = (rp.k + 1) * M.DT;
      if (stand && stand.state !== "run") stand.setState("run");
      standShow(rowAt(rp.k)); draw();
    });
    function scrub(steps) {
      if (st.preset === "sandbox" || !run) return;
      sSlider.value = clampI(+sSlider.value + steps, 0, run.rows.length - 1);
      sSlider.dispatchEvent(new Event("input"));
    }
    const clampI = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ---- events during playback: callouts on the stand and the signal pulse of each control step ---- */
    const VNAME = { t_turbine: ["turbine inlet above 700 K", "hot"], p_rc: ["cooling-channel pressure below 46 bar", "jacket"], n_otp: ["OTP over 28k rpm", "otp"], n_ftp: ["FTP over 50k rpm", "ftp"], rof: ["mixture ratio outside 2.5–4.0", "chamber"] };
    function spAt(i) { return run.sandbox ? [run.pref[i + 1], run.rref[i + 1]] : [run.rows[i].p_ref, run.rows[i].rof_ref]; }
    function spChanged(i) { if (i < 1) return false; const [p1, r1] = spAt(i), [p0, r0] = spAt(i - 1); return Math.abs(p1 - p0) > 1e-6 || Math.abs(r1 - r0) > 1e-6; }
    function spTarget(i) {  // where a set-point change that starts at i ends, and how long it takes
      const n = run.sandbox ? run.n : run.rows.length;
      let j = i;
      while (j + 1 < n && spChanged(j + 1)) j++;
      return { sp: spAt(j), dur: (j - i + 1) * M.DT };
    }
    function events(i0, i1) {
      if (!stand || !run) return;
      const who = PRESETS[st.preset].ctl === "OPEN" ? "the schedule" : PRESETS[st.preset].ctl === "YOU" ? "you" : PRESETS[st.preset].ctl;
      for (let i = Math.max(1, i0 + 1); i <= i1; i++) {
        if (spChanged(i) && !spChanged(i - 1)) {
          const { sp, dur } = spTarget(i), ramp = dur > 0.15;
          stand.callout("sp", `${ramp ? "Set-point ramp" : "Set-point step"} → ${sp[0].toFixed(1)} bar, ROF ${sp[1].toFixed(2)}`, ramp ? `over ${dur.toFixed(1)} s; ${who} has to follow` : `${who} has to follow`, "chamber");
        }
        const a = run.rows[i - 1], b = run.rows[i];
        if (a && b) for (const k of Object.keys(b.violations)) if (b.violations[k] && !a.violations[k]) stand.callout("lim-" + k, "Limit: " + VNAME[k][0], "each step over a limit costs 0.5 reward", VNAME[k][1], { color: "#e34948" });
        if (b && Math.abs(b.t - 2.1) < 1e-6 && (st.preset === "tfv_step" || st.preset === "tov_step")) {
          stand.callout("step", st.preset === "tfv_step" ? "TFV +0.1" : "TOV +0.1", st.preset === "tfv_step" ? "fast overshoot, then the slow thermal sag" : "the LOX side answers in half a second", st.preset === "tfv_step" ? "tfv" : "tov");
        }
      }
      if (i1 > i0) stand.pulse();
    }

    /* ================================================================ simulation */
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
    const play = el("button", { class: "re-btn re-primary", type: "button", onclick: () => togglePlay() });
    btnLabel(play, "play", "Play");
    function stopPlay() { if (playing) { clearInterval(playing); playing = null; } btnLabel(play, "play", "Play"); if (st.preset === "sandbox") btnLabel(sPlay, "play", "Play"); }
    function togglePlay() {
      if (playing) { stopPlay(); return; }
      if (!sand.ep || sand.ep.done) { startSandbox(); if (stand) { standShow(epRow(sand.ep)); stand.clearCallouts(); if (sSeq.checked) { stand.setState("off"); stand.ignite(); } else stand.setState("run"); } }
      btnLabel(play, "pause", "Pause"); btnLabel(sPlay, "pause", "Pause");
      let last = performance.now(), acc = 0;
      playing = setInterval(() => {
        const now = performance.now();
        if (stand && stand.state !== "run") { last = now; return; }  // wait for the start-up sequence
        acc += (now - last) / 1000 * +speedSel.select.value; last = now;
        let moved = false;
        const i0 = sand.rows.length - 1;
        while (acc >= M.DT && !sand.ep.done) { acc -= M.DT; sand.rows.push(sand.ep.step(sand.u.slice())); moved = true; }
        if (moved) { events(i0, sand.rows.length - 1); cursor = null; draw(); standShow(sand.rows[sand.rows.length - 1]); }
        if (sand.ep.done) { stopPlay(); if (stand && sSeq.checked) stand.shutdown(); }
      }, 50);
    }
    function nudge(i, d) {
      const s = i ? sTov : sTfv, lo = i ? 0.1 : 0.1, hi = i ? 0.5 : 0.7;
      sand.u[i] = Math.min(hi, Math.max(lo, sand.u[i] + d));
      s.set(sand.u[i]); sandboxShow();
    }

    /* ================================================================ rendering */
    function metrics(rows) {
      if (!rows.length) return null;
      let ep = 0, er = 0, ret = 0, viol = 0, travel = 0;
      for (const r of rows) { ep += Math.abs(r.p_cc - r.p_ref) / r.p_ref; er += Math.abs(r.rof - r.rof_ref) / r.rof_ref; ret += r.reward; viol += r.n_viol; travel += r.du; }
      return { mape_p: 100 * ep / rows.length, mape_r: 100 * er / rows.length, ret, viol, travel };
    }
    function curIndex() {
      if (!run || !run.rows.length) return -1;
      if (cursor != null) return Math.min(run.rows.length - 1, Math.max(0, Math.round(cursor / M.DT) - 1));
      return run.sandbox ? run.rows.length - 1 : Math.floor(rp.k);
    }
    function series(rows, key) { return rows.map((r) => r[key]); }
    function draw() {
      if (!run) return;
      const rows = run.rows, n = run.sandbox ? run.n : rows.length;
      const t = rows.map((r) => r.t), xlim = [0, n * M.DT];
      const tref = run.sandbox ? run.pref.slice(1, n + 1).map((_, i) => (i + 1) * M.DT) : t;
      const pref = run.sandbox ? run.pref.slice(1, n + 1) : series(rows, "p_ref");
      const rref = run.sandbox ? run.rref.slice(1, n + 1) : series(rows, "rof_ref");
      const muted = V.css("--viz-muted");
      const pinLines = (key) => pins.map((p) => ({ x: p.rows.map((r) => r.t), y: series(p.rows, key), color: muted, width: 1.4, alpha: 0.8 }));
      const showCursor = cursor != null || rp.on || rp.k > 0;
      const cur = showCursor ? (cursor != null ? cursor : (Math.floor(rp.k) + 1) * M.DT) : null;
      const base = { xlim, cursor: cur };
      plot(cP, Object.assign({}, base, { x: t, lines: [...pinLines("p_cc"), { x: tref, y: pref, color: ink2(), dash: [5, 4], width: 1.5 }, { y: series(rows, "p_cc"), color: V.series(1) }], ylabel: "bar" }));
      plot(cR, Object.assign({}, base, { x: t, lines: [...pinLines("rof"), { x: tref, y: rref, color: ink2(), dash: [5, 4], width: 1.5 }, { y: series(rows, "rof"), color: V.series(2) }], ylabel: "ROF", hlines: [{ y: L.rof_max, color: V.css("--viz-s8"), label: "limit " + L.rof_max.toFixed(1) }] }));
      plot(cU, Object.assign({}, base, { x: t, lines: [{ y: series(rows, "u_tfv"), color: V.series(1), dash: [4, 3], width: 1.2, step: true }, { y: series(rows, "u_tov"), color: V.series(2), dash: [4, 3], width: 1.2, step: true },
        { y: series(rows, "x_tfv"), color: V.series(1) }, { y: series(rows, "x_tov"), color: V.series(2) }], ylim: [0.08, 0.72], ylabel: "opening" }));
      const [cname, lim, kind] = CON[cKey];
      plot(cC, Object.assign({}, base, { x: t, lines: [...pinLines(cKey), { y: series(rows, cKey), color: V.series(3) }], ylabel: cname.split(" [")[1] ? cname.split(" [")[1].replace("]", "") : "", hlines: lim ? [{ y: lim, color: V.css("--viz-s8"), label: (kind === "max" ? "max " : "min ") + lim }] : [] }));
      plot(cW, Object.assign({}, base, { x: t, lines: [...pinLines("reward"), { y: series(rows, "reward"), color: V.series(7), step: true, width: 1.5 }], ylim: [Math.min(-2.2, ...series(rows, "reward")) - 0.1, 0.1], xlabel: "time [s]" }));
      // telemetry trends
      if (pTel.open) {
        plot(spP, { x: t, xlim, cursor: cur, lines: [{ x: tref, y: pref, color: ink2(), dash: [4, 3], width: 1.2 }, { y: series(rows, "p_cc"), color: V.series(1), width: 1.6 }] });
        plot(spR, { x: t, xlim, cursor: cur, lines: [{ x: tref, y: rref, color: ink2(), dash: [4, 3], width: 1.2 }, { y: series(rows, "rof"), color: V.series(2), width: 1.6 }] });
      }
      // scores
      const m = metrics(rows), pm = pins.length ? metrics(pins[pins.length - 1].rows) : null;
      const sc = (label, v, pv, unit, d) => el("div", { class: "lab-score" }, el("span", {}, label), el("b", {}, v == null ? "–" : v.toFixed(d)), el("small", {}, (unit || "") + (pv != null ? `  (pin ${pv.toFixed(d)})` : "")));
      scores.replaceChildren(sc("MAPE p_cc", m && m.mape_p, pm && pm.mape_p, " %", 2), sc("MAPE ROF", m && m.mape_r, pm && pm.mape_r, " %", 2), sc("return", m && m.ret, pm && pm.ret, "", 1),
        sc("violation steps", m && m.viol, pm && pm.viol, "", 0), sc("valve travel", m && m.travel, pm && pm.travel, "", 2));
      pScore.sum.textContent = m ? `MAPE ${m.mape_p.toFixed(2)} / ${m.mape_r.toFixed(2)} %` : "";
      const i = curIndex();
      if (i >= 0 && !rp.on && !playing) standShow(rows[i]);
    }
    function plot(c, o) { c.__frame = V.plot(c, o); }
    for (const c of [cP, cR, cU, cC, cW, spP, spR]) {
      c.addEventListener("pointermove", (e) => {
        if (!c.__frame || rp.on || playing) return;
        const r = c.getBoundingClientRect(); cursor = Math.max(0, c.__frame.invX(e.clientX - r.left));
        if (stand && stand.state !== "run") stand.setState("run");
        draw();
      });
      c.addEventListener("pointerleave", () => { if (rp.on || playing) return; cursor = null; draw(); });
    }

    function drawTelemetry(r) {
      if (!r) return;
      pTel.sum.textContent = `${r.p_cc.toFixed(1)} bar · ROF ${r.rof.toFixed(2)}`;
      if (!pTel.open) return;
      drawGauges(gauge, r);
      for (const x of limEls) {
        const [k, , sc, lim, kind, fmt] = LIMROWS.find((row) => row[0] === x.k);
        const v = r[k];
        if (v == null) continue;
        const f = Math.max(0, Math.min(1, (v - sc[0]) / (sc[1] - sc[0])));
        const margin = kind === "max" ? (lim - v) / lim : (v - lim) / lim;
        const bad = !!(r.violations && r.violations[k]) || margin < 0, warn = !bad && margin < 0.05;
        x.fill.style.width = (100 * f).toFixed(1) + "%";
        x.row.classList.toggle("bad", bad); x.row.classList.toggle("warn", warn);
        x.val.textContent = fmt(v);
      }
      readsLine.replaceChildren(el("span", {}, "controller reads "), el("b", {}, `${(r.p_meas ?? r.p_cc).toFixed(1)} bar, ${(r.rof_meas ?? r.rof).toFixed(2)}`),
        el("span", {}, st.sensorDelay ? " (late)" : " (no delay)"));
    }
    function drawGauges(c, r) {
      const dpr = window.devicePixelRatio || 1, w = c.clientWidth || 260, h = c.clientHeight || 104;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const ink = V.css("--viz-ink"), inkm = V.css("--viz-ink-2"), grid = V.css("--viz-grid"), red = V.css("--viz-s8"), sp = V.css("--brand-accent");
      // ring gauges: the arc is the engine, the orange triangle the set point, the tick what the controller reads
      const dial = (cx, cy, R, lo, hi, val, set, meas, d, name, color, badZones) => {
        const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, A = (v) => a0 + (a1 - a0) * Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
        const arc = (x0, x1, rr, lw, col, alpha) => { g.beginPath(); g.arc(cx, cy, rr, x0, x1); g.strokeStyle = col; g.lineWidth = lw; g.globalAlpha = alpha ?? 1; g.stroke(); g.globalAlpha = 1; };
        g.lineCap = "butt";
        arc(a0, a1, R, 7, grid);
        for (const [z0, z1] of badZones) arc(A(z0), A(z1), R, 7, red, 0.75);
        g.lineCap = "round";
        arc(a0, A(val), R, 7, color);
        const as = A(set);
        g.fillStyle = sp; g.beginPath();
        g.moveTo(cx + Math.cos(as) * (R + 4.5), cy + Math.sin(as) * (R + 4.5));
        g.lineTo(cx + Math.cos(as - 0.12) * (R + 12), cy + Math.sin(as - 0.12) * (R + 12));
        g.lineTo(cx + Math.cos(as + 0.12) * (R + 12), cy + Math.sin(as + 0.12) * (R + 12)); g.fill();
        if (meas != null) { const am = A(meas); g.beginPath(); g.moveTo(cx + Math.cos(am) * (R - 11), cy + Math.sin(am) * (R - 11)); g.lineTo(cx + Math.cos(am) * (R - 5), cy + Math.sin(am) * (R - 5)); g.strokeStyle = inkm; g.lineWidth = 2; g.stroke(); }
        g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = ink; g.font = `600 ${Math.round(R * 0.46)}px ${V.css("--heading-font") || "sans-serif"}`;
        g.fillText(val.toFixed(d), cx, cy - 2);
        g.font = "10px Inter, sans-serif"; g.fillStyle = inkm;
        g.fillText(name, cx, cy + R * 0.42);
        g.fillText(`set ${set.toFixed(d)}`, cx, cy + R + 4);
        g.font = "9px Inter, sans-serif";
        g.textAlign = "right"; g.fillText(lo, cx + Math.cos(a0) * R - 2, cy + Math.sin(a0) * R + 10);
        g.textAlign = "left"; g.fillText(hi, cx + Math.cos(a1) * R + 2, cy + Math.sin(a1) * R + 10);
        g.textBaseline = "alphabetic";
      };
      const R = Math.max(22, Math.min(w / 4 - 16, (h - 16) / 2 - 4));
      dial(w * 0.25, R + 12, R, 30, 60, r.p_cc, r.p_ref, r.p_meas, 1, "p_cc, bar", V.series(1), []);
      dial(w * 0.75, R + 12, R, 2.4, 4.2, r.rof, r.rof_ref, r.rof_meas, 2, "ROF", V.series(2), [[2.4, L.rof_min], [L.rof_max, 4.2]]);
    }

    /* ---- narration: one line on what is happening at the moment shown ---- */
    function drawCaption() {
      if (!layers.caption) return;
      const SEQ = {
        off: ["idle", "Engine off. Press Hot fire to run the episode on the stand, or drag the time slider."],
        spinup: ["event", "Start-up: gaseous nitrogen (GN2) spins up both turbopumps; the valves are scripted, not yet controlled."],
        ignition: ["event", "Laser ignition: chamber pressure rises for about 1.5 s before the controller gets the valves."],
        shutdown: ["event", "Shutdown: the main valves close and chamber pressure decays in about half a second."],
        purge: ["idle", "LN2 purge: liquid nitrogen flushes the lines and the chamber."],
      };
      let tone = "ok", msg = "";
      if (SEQ[seqState]) [tone, msg] = SEQ[seqState];
      else if (run && shown) [tone, msg] = narrate(shown);
      caption.replaceChildren(el("i", { class: "cap-dot " + tone }), el("span", {}, msg));
    }
    function narrate(r) {
      const P = PRESETS[st.preset], i = run.rows.indexOf(r) >= 0 ? run.rows.indexOf(r) : curIndex();
      const rows = run.rows;
      const who = { open: "the schedule", fb: "the PI", rl: P.ctl, you: "you" }[P.group];
      const v = r.violations ? Object.entries(r.violations).filter(([, b]) => b).map(([k]) => k) : [];
      if (v.length) return ["bad", `Over a limit: ${v.map((k) => VNAME[k][0]).join("; ")}. Each step over a limit costs 0.5 reward.`];
      const back = (k) => rows[Math.max(0, i - k)] || r;
      const dir = (key, k) => { const d = r[key] - back(k)[key]; return Math.abs(d) < 0.002 ? 0 : Math.sign(d); };
      const vw = (name, s) => (s > 0 ? `${name} opening ▲` : s < 0 ? `${name} closing ▼` : null);
      const moves = [vw("TFV", dir("u_tfv", 3)), vw("TOV", dir("u_tov", 3))].filter(Boolean).join(", ");
      if (st.preset === "tfv_step" || st.preset === "tov_step") {
        const tfv = st.preset === "tfv_step";
        if (r.t < 2.05) return ["idle", `Holding the 40 bar point. At t = 2 s ${tfv ? "TFV" : "TOV"} steps by +0.1, with nobody correcting.`];
        if (tfv) return r.t < 4 ? ["event", `TFV jumped: the fuel pump speeds up, so pressure overshoots (now ${(r.p_cc - 40).toFixed(1)} bar above the start) and the mixture ratio drops.`]
          : ["warn", `Pressure sags (now +${(r.p_cc - 40).toFixed(1)} bar): more coolant through the same heat leaves it colder (${Math.round(r.t_rc)} K), so the turbines get less energy. This is the slow thermal channel.`];
        return ["event", r.t < 3.5 ? "TOV jumped: the LOX pump answers within half a second; pressure and mixture ratio rise, the fuel side barely moves." : `Settled within a second: p_cc +${(r.p_cc - 40).toFixed(1)} bar, ROF ${r.rof.toFixed(2)}. The oxidiser channel is the fast one.`];
      }
      // a set-point change in the last 2.5 s
      for (let j = i; j > Math.max(0, i - 25); j--) if (spChanged(j) && !spChanged(j - 1)) {
        const { sp } = spTarget(j);
        const answer = P.group === "open" ? "The schedule moves the valves to the trim openings" : P.group === "you" ? "Your move" : `${who[0].toUpperCase() + who.slice(1)} is answering`;
        return ["event", `New set point ${sp[0].toFixed(1)} bar, ROF ${sp[1].toFixed(2)} (${((i - j) * M.DT).toFixed(1)} s ago). ${answer}${moves ? ": " + moves : ""}.`];
      }
      const ep = r.p_cc - r.p_ref, er = r.rof - r.rof_ref, epp = Math.abs(ep) / r.p_ref, erp = Math.abs(er) / r.rof_ref;
      if (epp > 0.02 || erp > 0.02) {
        const bits = [epp > 0.02 ? `p_cc ${Math.abs(ep).toFixed(1)} bar ${ep < 0 ? "low" : "high"}` : null, erp > 0.02 ? `ROF ${Math.abs(er).toFixed(2)} ${er < 0 ? "low" : "high"}` : null].filter(Boolean).join(", ");
        const reply = P.group === "open" ? "nobody corrects it (open loop)" : moves ? `${P.group === "you" ? "you" : who}: ${moves}` : P.group === "you" ? "your valves are not moving" : `${who} is holding the valves`;
        return ["warn", `Off target: ${bits}. ${reply[0].toUpperCase() + reply.slice(1)}.`];
      }
      const drift = Math.abs(r.t_rc - back(20).t_rc) > 4 ? ` The coolant is still ${r.t_rc > back(20).t_rc ? "warming" : "cooling"} (${Math.round(r.t_rc)} K), so the pressure will drift unless ${P.group === "open" ? "someone corrects it" : P.group === "you" ? "you keep correcting" : who + " keeps correcting"}.` : "";
      return ["ok", `On target: p_cc within ${(100 * epp).toFixed(1)} % and ROF within ${(100 * erp).toFixed(1)} % of the set point.${drift}`];
    }

    /* ================================================================ preset changes */
    async function update() {
      stopPlay();
      presets.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === st.preset));
      const k = st.preset, P = PRESETS[k];
      cStory.body.innerHTML = `<p>${P.story}</p>` + (P.policy ? "<p class=\"hud-more\">An exported network, evaluated deterministically in your browser on the same observation vector as in training (92 numbers with preview, 60 without).</p>" : "") + "<p class=\"hud-more\"><a href=\"#guided-experiments\">Guided experiments</a> · <a href=\"#model-card\">model card</a></p>";
      if (openCard !== "story") toolBtns.story.classList.add("news");
      ctlSlot.replaceChildren();
      if (k === "pi") ctlSlot.append(ctlGain, el("div", { class: "re-note" }, `Tuned gains: k_p ${D.pi_gains.kp_p} and k_i ${D.pi_gains.ki_p} /s on pressure, k_p ${D.pi_gains.kp_r} and k_i ${D.pi_gains.ki_r} /s on mixture ratio.`));
      else if (k === "sandbox") ctlSlot.append(sTfv, sTov, el("div", { class: "lab-row" }, speedSel, play, sandReset), el("div", { class: "re-note" }, "Or drag the valves on the stand, or use the arrow keys."));
      else if (P.policy) ctlSlot.append(el("div", { class: "re-note" }, "A trained network: nothing to tune. Perturb the engine below and see how it copes."));
      else ctlSlot.append(el("div", { class: "re-note" }, "No feedback: the valve commands are fixed in advance."));
      profileSel.select.disabled = k === "tfv_step" || k === "tov_step";
      pCtl.sum.textContent = P.chip;
      const nominal = st.heat === 1 && st.tf === 1 && st.to === 1 && Math.abs(st.delay - D.params.valve_delay) < 1e-9 && st.sensorDelay && st.noise;
      pEng.sum.textContent = nominal ? "calibrated" : "perturbed";
      pEng.root.classList.toggle("perturbed", !nominal);
      stopReplay(); rp.k = 0; cursor = null; sSlider.disabled = k === "sandbox";
      if (stand) {
        stand.setRunLabel({ open: "open loop", fb: "closed loop, PI", rl: "closed loop, " + P.ctl, you: "you drive" }[P.group]);
        stand.setController({ label: P.ctl, kind: P.group, color: groupColor(P.group) });
        stand.setPerturb({ heat: st.heat, tf: st.tf, to: st.to, delay: st.delay, delay0: D.params.valve_delay, sensorDelay: st.sensorDelay, noise: st.noise });
        stand.setValveDrag(k === "sandbox" ? (key, v) => { const i = key === "tfv" ? 0 : 1; sand.u[i] = v; (i ? sTov : sTfv).set(v); sandboxShow(); } : null);
        stand.clearCallouts();
      }
      if (k === "sandbox") { startSandbox(); draw(); btnLabel(sPlay, "play", "Play"); if (stand) { stand.setState("run"); standShow(epRow(sand.ep)); } return; }
      btnLabel(sPlay, "play", "Hot fire");
      const res = await simulate();
      if (res.missing) { cStory.body.insertAdjacentHTML("beforeend", "<p><i>This policy has not been exported yet.</i></p>"); run = null; return; }
      run = res;
      sSlider.max = run.rows.length - 1; sSlider.value = 0;
      if (stand) stand.setState("run");
      standShow(rowAt(0));
      draw();
      if (q.get("play") === "1" && !rp.played) { rp.played = true; toggleReplay(); }
    }

    /* ---- keys: on the viewer (and anywhere while it is full screen) ---- */
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key, onControl = e.target.closest && e.target.closest("button, input, select, textarea, a");
      if (k === "Escape") { if (openCard) showCard(null); else if (isFull()) toggleFull(false); return; }
      if (onControl && (k === " " || k.startsWith("Arrow"))) return;
      if (k === " ") { e.preventDefault(); toggleReplay(); }
      else if (k === "f" || k === "F") { e.preventDefault(); toggleFull(); }
      else if (k === "?") showCard("about");
      else if (k === "l" || k === "L") { layers.parts = !(layers.parts == null ? mode === "hud" : layers.parts); store.set("layers", layers); applyLayers(); }
      else if (k === "+" || k === "=") stand && stand.zoomBy(1.3);
      else if (k === "-" || k === "_") stand && stand.zoomBy(1 / 1.3);
      else if (k === "0") stand && stand.resetZoom();
      else if (st.preset === "sandbox" && k.startsWith("Arrow")) {
        e.preventDefault();
        if (k === "ArrowLeft" || k === "ArrowRight") nudge(0, k === "ArrowRight" ? 0.01 : -0.01); else nudge(1, k === "ArrowUp" ? 0.01 : -0.01);
      }
      else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); scrub(k === "ArrowRight" ? 10 : -10); }
    }
    viewer.addEventListener("keydown", (e) => { e.stopPropagation(); onKey(e); });
    document.addEventListener("keydown", (e) => { if (isFull() && !viewer.contains(e.target)) onKey(e); });

    V.onTheme(() => { draw(); if (shown) drawTelemetry(shown); });
    layout();
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
