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
from rl_rocket_engine.surrogate.pi import PIGains, run_episode
from rl_rocket_engine.surrogate.rl import JsonPolicy

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "docs" / "javascripts" / "lumen-model.js"
CHROME = next((c for c in ("google-chrome", "chromium", "chromium-browser") if shutil.which(c)), None)
POLICIES = sorted(p for p in (ROOT / "data" / "policies").glob("*.json") if not p.name.endswith(".train.json"))

HARNESS = """<!doctype html><html><body><pre id="out"></pre>
<script src="{js}"></script>
<script src="{stand}"></script>
<div id="stand" style="width:900px"></div>
<script>
const F = {fixture};
const M = window.LumenModel, p = F.params, trim = new M.TrimTable(F.trim);
const res = {{steady: [], step: [], pi: [], policies: {{}}}};
try {{
  for (const [xt, xo] of F.valves) {{ const o = M.outputs(M.steadyState(xt, xo, p), p); res.steady.push([o.p_cc, o.rof, o.t_rc, o.n_otp, o.n_ftp]); }}
  const m = new M.EngineModel(p, 0.005); m.reset(p.x_tfv_ref, p.x_tov_ref); m.command(0.4, 0.31);
  for (let k = 0; k < 50; k++) {{ const o = m.advance(0.1); res.step.push([o.p_cc, o.rof]); }}
  const prof = M.evalProfile(0.1, 4);
  let ep = new M.Episode({{params: p, trim, noise: false, pref: prof.pref, rref: prof.rref}});
  const pi = new M.DecoupledPI(F.gains, trim);
  while (!ep.done) {{ const [pr, rr] = ep.setpoint; const u = pi.step(ep.meas[0], ep.meas[1], pr, rr); const s = ep.step(u); res.pi.push([s.p_cc, s.rof, s.u_tfv, s.u_tov, s.reward]); }}
  for (const [name, spec] of Object.entries(F.policies)) {{
    ep = new M.Episode({{params: p, trim, noise: false, preview: spec.env.preview, pref: prof.pref, rref: prof.rref}});
    const rows = [];
    while (!ep.done && rows.length < 150) {{ const a = M.mlp(spec, ep.obs()); const s = ep.step(M.toValves(a)); rows.push([s.p_cc, s.rof, s.u_tfv, s.u_tov]); }}
    res.policies[name] = rows;
  }}
  // the test-stand graphic runs through a whole sequence without throwing
  const st = window.ReStand.create(document.getElementById("stand"), {{state: "off"}});
  st.setRow(Object.assign({{}}, M.outputs(M.steadyState(0.3, 0.21, p), p), {{t: 0, p_ref: 40, rof_ref: 3.4, violations: {{rof: true}}}}));
  st.ignite(); res.stand = [st.state]; st.setState("run"); st.shutdown(); res.stand.push(st.state);
}} catch (e) {{ res.error = String(e.stack || e); }}
document.getElementById("out").textContent = JSON.stringify(res);
</script></body></html>"""

VALVES = [(0.30, 0.21), (0.45, 0.30), (0.25, 0.15)]


@pytest.fixture(scope="module")
def browser(tmp_path_factory):
    if CHROME is None:
        pytest.skip("Chrome not installed")
    fixture = {"params": DEFAULT_PARAMS.to_dict(), "trim": load_trim_table(), "valves": VALVES,
               "gains": PIGains.load().__dict__,
               "policies": {p.stem: json.loads(p.read_text()) for p in POLICIES}}
    page = tmp_path_factory.mktemp("lab") / "harness.html"
    stand = ROOT / "docs" / "javascripts" / "teststand.js"
    page.write_text(HARNESS.format(js=JS.as_uri(), stand=stand.as_uri(), fixture=json.dumps(fixture)))
    cmd = [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
           "--virtual-time-budget=60000", "--dump-dom", page.as_uri()]
    html = subprocess.run(cmd, capture_output=True, text=True, timeout=300).stdout
    start, end = html.index('<pre id="out">') + len('<pre id="out">'), html.index("</pre>")
    res = json.loads(html[start:end].replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
    assert "error" not in res, res.get("error")
    return res


def test_test_stand_runs_a_sequence(browser):
    assert browser["stand"] == ["spinup", "shutdown"]


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


def test_pi_closed_loop_agrees(browser):
    log = run_episode(LumenSurrogateEnv(noise=False), seed=0, options={"profile": "eval"})
    py = [[s["p_cc"], s["rof"], s["u_tfv"], s["u_tov"], s["reward"]] for s in log]
    np.testing.assert_allclose(browser["pi"], py, rtol=1e-6, atol=1e-7)


@pytest.mark.parametrize("path", POLICIES, ids=[p.stem for p in POLICIES])
def test_policy_closed_loop_agrees(browser, path):
    spec = json.loads(path.read_text())
    env = LumenSurrogateEnv(noise=False, preview=spec["env"]["preview"])
    obs, _ = env.reset(seed=0, options={"profile": "eval"})
    pol = JsonPolicy(spec)
    rows = []
    for _ in range(150):
        obs, _, _, _, info = env.step(pol(np.asarray(obs, float)))
        rows.append([info["p_cc"], info["rof"], info["u_tfv"], info["u_tov"]])
    # float32 observations in Python against float64 in JavaScript: agree to ~1e-5 over 15 s.
    np.testing.assert_allclose(browser["policies"][path.stem], rows, rtol=1e-3, atol=1e-4)
