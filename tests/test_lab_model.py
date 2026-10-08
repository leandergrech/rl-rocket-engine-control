"""The browser port (docs/javascripts/lumen-model.js) agrees with the Python surrogate.

Runs the same scenarios in Python and in headless Chrome (skipped if Chrome is not installed):
steady states, an open-loop valve step, the PI baseline closed loop on the evaluation profile and,
for every exported policy in data/policies/, the network closed loop. It also runs the test-stand
graphic (docs/javascripts/teststand.js) through a start and a shutdown.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from rl_rocket_engine.surrogate import DEFAULT_PARAMS, EngineModel, outputs, steady_state
from rl_rocket_engine.surrogate.env import LumenSurrogateEnv, load_trim_table
from rl_rocket_engine.surrogate.pi import PIGains, gains_for_bandwidth, identify_loops, loop_margins, run_episode
from rl_rocket_engine.surrogate.rl import JsonPolicy
from rl_rocket_engine.surrogate.faults import KINDS
from rl_rocket_engine.surrogate.scenarios import episode_options, load as load_scenarios

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "docs" / "javascripts" / "lumen-model.js"
CHROME = next((c for c in ("google-chrome", "chromium", "chromium-browser") if shutil.which(c)), None)
POLICIES = sorted(p for p in (ROOT / "data" / "policies").glob("*.json") if not p.name.endswith(".train.json"))

HARNESS = """<!doctype html><html><body><pre id="out"></pre>
<script>window.__errors = []; addEventListener("error", (e) => window.__errors.push(String(e.message)));</script>
<script src="{js}"></script>
<script src="{stand}"></script>
<div id="stand" style="width:900px"></div>
<div id="stand2" style="width:600px"></div>
<script>
const F = {fixture};
const M = window.LumenModel, p = F.params, trim = new M.TrimTable(F.trim);
const res = {{steady: [], step: [], pi: [], policies: {{}}}};
try {{
  for (const [xt, xo] of F.valves) {{ const o = M.outputs(M.steadyState(xt, xo, p), p); res.steady.push([o.p_cc, o.rof, o.t_rc, o.n_otp, o.n_ftp]); }}
  const m = new M.EngineModel(p, 0.005); m.reset(p.x_tfv_ref, p.x_tov_ref); m.command(0.4, 0.31);
  for (let k = 0; k < 50; k++) {{ const o = m.advance(0.1); res.step.push([o.p_cc, o.rof]); }}
  const prof = M.evalProfile(0.05, 4);
  let ep = new M.Episode({{params: p, trim, noise: false, pref: prof.pref, rref: prof.rref}});
  const pi = new M.DecoupledPI(F.gains, trim);
  while (!ep.done) {{ const [pr, rr] = ep.setpoint; const u = pi.step(ep.meas[0], ep.meas[1], pr, rr); const s = ep.step(u); res.pi.push([s.p_cc, s.rof, s.u_tfv, s.u_tov, s.reward]); }}
  // the seven test cases, with faults, engine changes and sensor delays, under the same PI
  res.scenarios = {{}};
  for (const [name, sc] of Object.entries(F.scenarios)) {{
    const o = M.scenarioOptions(sc, p, 0.05, 4);
    ep = new M.Episode(Object.assign({{trim, noise: false, dt: 0.05}}, o));
    const c = new M.DecoupledPI(F.gains, trim), rows = [];
    while (!ep.done) {{ const s = ep.step(c.step(ep.meas[0], ep.meas[1], ...ep.setpoint)); rows.push([s.p_cc, s.rof, s.x_tfv, s.x_tov, s.p_meas]); }}
    res.scenarios[name] = rows;
  }}
  res.bw = F.bandwidths.map(([fp, fr]) => {{ const g = M.piFromBandwidth(fp, fr, F.loops); const m = M.loopMargins(g, F.loops); return [g.kp_p, g.ki_p, g.kp_r, g.ki_r, m.p.fc, m.p.pm, m.rof.fc, m.rof.pm]; }});
  for (const [name, spec] of Object.entries(F.policies)) {{
    const dt = spec.env.dt || 0.1, pr = M.evalProfile(dt, 4);
    ep = new M.Episode({{params: p, trim, noise: false, preview: spec.env.preview, pref: pr.pref, rref: pr.rref, dt}});
    const rows = [];
    while (!ep.done && rows.length < 150) {{ const a = M.mlp(spec, ep.obs()); const s = ep.step(M.toValves(a)); rows.push([s.p_cc, s.rof, s.u_tfv, s.u_tov]); }}
    res.policies[name] = rows;
  }}
  // the test-stand graphic runs through a whole sequence without throwing
  res.status = [];
  const st = window.ReStand.create(document.getElementById("stand"), {{state: "off", hud: true, onStatus: (x) => res.status.push(x.state)}});
  st.setRow(Object.assign({{}}, M.outputs(M.steadyState(0.3, 0.21, p), p), {{t: 0, p_ref: 40, rof_ref: 3.4, u_tfv: 0.32, u_tov: 0.2, p_meas: 39.9, rof_meas: 3.41, violations: {{rof: true}}}}));
  st.ignite(); res.stand = [st.state]; st.setState("run"); st.shutdown(); res.stand.push(st.state);
  // every layer, the control loop, perturbation tags, callouts, pulses and the zoom draw without throwing
  st.setState("run");
  st.setView({{insets: {{l: 120, r: 120, t: 40, b: 60}}, focus: {{x0: 150, x1: 905, y0: 0, y1: 398, v: 0.6}}}});
  st.setLayers({{parts: true, flows: true, signals: true, callouts: true}});
  st.setController({{label: "PI", kind: "fb", color: "#1baf7a"}});
  st.setPerturb({{heat: 1.1, tf: 0.95, to: 0.95, delay: 0.15, delay0: 0.05, sensorDelay: false, noise: false}});
  st.callout("sp", "Set-point step", "PI has to follow", "chamber"); st.callout("lim", "Limit", "", "hot", {{color: "#e34948"}});
  st.pulse(); st.zoomBy(1.6); res.zoom = st.zoom; st.setValveDrag(() => {{}});
  // every malfunction at once, with its onset effects
  st.setFaults(F.faultKinds.map((k) => ({{kind: k, sev: 1, mag: 0.3, age: 2, label: k, short: k}})));
  for (const k of F.faultKinds) st.faultOnset(k, k, "test");
  st.advance(1.0);  // thirty frames with all of the above on screen
  res.faultBadge = st.status().kind;
  res.badge = st.status().text;
  // a second stand, ignited: its start-up sequence only advances if animation frames really run
  const st2 = window.ReStand.create(document.getElementById("stand2"), {{state: "off"}});
  st2.setRow(Object.assign({{}}, M.outputs(M.steadyState(0.3, 0.21, p), p), {{t: 0, violations: {{}}}}));
  st2.ignite(); st2.advance(1.5); res.later = st2.state;
}} catch (e) {{ res.error = String(e.stack || e); }}
setTimeout(() => {{
  res.errors = window.__errors;
  document.getElementById("out").textContent = JSON.stringify(res);
}}, 1500);
</script></body></html>"""

VALVES = [(0.30, 0.21), (0.45, 0.30), (0.25, 0.15)]
LOOPS = identify_loops()
BANDWIDTHS = [(0.1, 0.2), (0.4, 0.45), (1.0, 1.5)]


@pytest.fixture(scope="module")
def browser(tmp_path_factory):
    if CHROME is None:
        pytest.skip("Chrome not installed")
    fixture = {"params": DEFAULT_PARAMS.to_dict(), "trim": load_trim_table(), "valves": VALVES,
               "gains": PIGains.load().__dict__, "scenarios": load_scenarios(), "loops": LOOPS, "bandwidths": BANDWIDTHS, "faultKinds": list(KINDS),
               "policies": {p.stem: json.loads(p.read_text()) for p in POLICIES}}
    page = tmp_path_factory.mktemp("lab") / "harness.html"
    stand = ROOT / "docs" / "javascripts" / "teststand.js"
    page.write_text(HARNESS.format(js=JS.as_uri(), stand=stand.as_uri(), fixture=json.dumps(fixture)))
    cmd = [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files", "--window-size=1200,2000",
           "--virtual-time-budget=60000", "--dump-dom", page.as_uri()]
    html = subprocess.run(cmd, capture_output=True, text=True, timeout=300).stdout
    start, end = html.index('<pre id="out">') + len('<pre id="out">'), html.index("</pre>")
    res = json.loads(html[start:end].replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
    assert "error" not in res, res.get("error")
    return res


def test_test_stand_runs_a_sequence(browser):
    assert browser["stand"] == ["spinup", "shutdown"]
    assert browser["status"][0] == "off" and browser["status"][-1] == "run"  # reported to the page as it changes


def test_test_stand_layers_draw_without_errors(browser):
    # 1.5 s of animation frames with every layer on, a zoom, callouts and perturbation tags
    assert browser["errors"] == []
    assert browser["zoom"] > 1.5
    assert browser["later"] == "ignition"  # GN2 spin-up lasts 1 s, then 1.6 s of pressure rise
    assert "ROF" in browser["badge"]  # the violated limit is named in the status badge
    assert browser["faultBadge"] == "fault"


def test_steady_states_agree(browser):
    for (xt, xo), js in zip(VALVES, browser["steady"]):
        o = outputs(steady_state(xt, xo), DEFAULT_PARAMS)
        np.testing.assert_allclose(js, [o["p_cc"], o["rof"], o["t_rc"], o["n_otp"], o["n_ftp"]], rtol=1e-7)


def test_valve_step_agrees(browser):
    m = EngineModel(dt=0.005)
    m.reset()
    m.command(0.4, 0.31)
    py = [(lambda o: [o["p_cc"], o["rof"]])(m.advance(0.1)) for _ in range(50)]
    np.testing.assert_allclose(browser["step"], py, rtol=1e-7)


def test_scenarios_agree(browser):
    # Faults, engine changes and sensor delays of the seven test cases, under the PI, in both ports.
    for name, sc in load_scenarios().items():
        env = LumenSurrogateEnv(noise=False)
        log = run_episode(env, seed=0, options=episode_options(sc, env.dt, env.n_future))
        py = [[s["p_cc"], s["rof"], s["x_tfv"], s["x_tov"], s["p_meas"]] for s in log]
        np.testing.assert_allclose(browser["scenarios"][name], py, rtol=1e-6, atol=1e-7, err_msg=name)


def test_pi_bandwidth_design_agrees(browser):
    for (fp, fr), js in zip(BANDWIDTHS, browser["bw"]):
        g = gains_for_bandwidth(fp, fr, LOOPS)
        m = loop_margins(g, LOOPS)
        py = [g.kp_p, g.ki_p, g.kp_r, g.ki_r, m["p"]["fc"], m["p"]["pm"], m["rof"]["fc"], m["rof"]["pm"]]
        np.testing.assert_allclose(js, py, rtol=1e-6)


def test_pi_closed_loop_agrees(browser):
    log = run_episode(LumenSurrogateEnv(noise=False), seed=0, options={"profile": "eval"})
    py = [[s["p_cc"], s["rof"], s["u_tfv"], s["u_tov"], s["reward"]] for s in log]
    np.testing.assert_allclose(browser["pi"], py, rtol=1e-6, atol=1e-7)


@pytest.mark.parametrize("path", POLICIES, ids=[p.stem for p in POLICIES])
def test_policy_closed_loop_agrees(browser, path):
    spec = json.loads(path.read_text())
    env = LumenSurrogateEnv(noise=False, preview=spec["env"]["preview"], dt=spec["env"].get("dt", 0.1))
    obs, _ = env.reset(seed=0, options={"profile": "eval"})
    pol = JsonPolicy(spec)
    rows = []
    for _ in range(150):
        obs, _, _, _, info = env.step(pol(np.asarray(obs, float)))
        rows.append([info["p_cc"], info["rof"], info["u_tfv"], info["u_tov"]])
    # float32 observations in Python against float64 in JavaScript: agree to ~1e-5 over 15 s.
    np.testing.assert_allclose(browser["policies"][path.stem], rows, rtol=1e-3, atol=1e-4)
