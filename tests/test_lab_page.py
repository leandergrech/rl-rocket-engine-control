"""The Engine Lab page works in a real browser: layout, folding panels, cards, keys, sandbox, full screen.

Serves docs/javascripts, docs/assets and docs/stylesheets from a temporary directory and drives two
Labs in headless Chrome (skipped if Chrome is not installed): one in a wide container, where the
controls float over the scene, and one at phone width, where they stack under it.
"""

from __future__ import annotations

import functools
import http.server
import json
import shutil
import subprocess
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CHROME = next((c for c in ("google-chrome", "chromium", "chromium-browser") if shutil.which(c)), None)

HARNESS = """<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="stylesheets/theme.css"></head>
<body data-md-color-scheme="default"><pre id="out"></pre>
<script>window.__errors = []; addEventListener("error", (e) => window.__errors.push(String(e.message)));
addEventListener("unhandledrejection", (e) => window.__errors.push(String(e.reason)));</script>
<div style="width:1400px"><div id="wide" class="re-widget re-lab" data-widget="lab"></div></div>
<div style="width:380px"><div id="narrow" class="re-widget re-lab" data-widget="lab"></div></div>
<script src="javascripts/lumen-model.js"></script>
<script src="javascripts/widgets.js"></script>
<script src="javascripts/teststand.js"></script>
<script src="javascripts/lab.js"></script>
<script>
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", {key: k, bubbles: true}));
(async () => {
  const res = {};
  try {
    await sleep(2500);
    const box = document.getElementById("wide"), v = box.querySelector(".lab-viewer");
    res.modes = [v.dataset.mode, document.querySelector("#narrow .lab-viewer").dataset.mode];
    res.counts = [box.querySelectorAll(".hud-panel").length, box.querySelectorAll(".hud-card").length, box.querySelectorAll(".hud-tool[data-tool]").length];
    res.score = box.querySelector(".lab-scores").textContent;
    res.caption = box.querySelector(".hud-caption").textContent;
    res.title = box.querySelector(".hud-title").textContent;
    // fold the controller panel, then open and close the acronyms card
    const ctl = box.querySelector('.hud-panel[data-panel="ctl"]');
    ctl.querySelector(".hud-head").click();
    res.folded = ctl.classList.contains("closed");
    box.querySelector('[data-tool="acr"]').click();
    const acr = box.querySelector('[data-card="acr"]');
    res.acr = [!acr.hidden, acr.querySelectorAll("dt").length];
    key(v, "Escape");
    res.acrClosed = acr.hidden;
    // full screen with F, out again with Escape
    key(v, "f"); res.full = v.classList.contains("is-full"); key(v, "Escape"); res.fullAfter = v.classList.contains("is-full");
    // the sandbox: no start-up sequence, play with the space bar, open TFV with the arrow key
    box.querySelector('.re-chip[data-k="sandbox"]').click();
    await sleep(300);
    const seq = box.querySelector(".lab-transport input[type=checkbox]"); seq.checked = false;
    const tfv0 = +box.querySelector(".lab-ctlslot input[type=range]").value;
    key(v, " ");
    await sleep(1500);
    key(v, "ArrowRight");
    res.tfv = [tfv0, +box.querySelector(".lab-ctlslot input[type=range]").value];
    res.time = box.querySelector(".lab-tlabel").textContent;
    res.sandCaption = box.querySelector(".hud-caption").textContent;
    key(v, " ");
  } catch (e) { res.error = String(e.stack || e); }
  res.errors = window.__errors;
  document.getElementById("out").textContent = JSON.stringify(res);
})();
</script></body></html>"""


@pytest.fixture(scope="module")
def page(tmp_path_factory):
    if CHROME is None:
        pytest.skip("Chrome not installed")
    site = tmp_path_factory.mktemp("labpage")
    for d in ("javascripts", "assets", "stylesheets"):
        (site / d).symlink_to(ROOT / "docs" / d)
    (site / "index.html").write_text(HARNESS)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    handler.log_message = lambda *a, **k: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/index.html"
        cmd = [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=1500,1000",
               "--virtual-time-budget=30000", "--dump-dom", url]
        html = subprocess.run(cmd, capture_output=True, text=True, timeout=300).stdout
    finally:
        server.shutdown()
    start, end = html.index('<pre id="out">') + len('<pre id="out">'), html.index("</pre>")
    res = json.loads(html[start:end].replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
    assert "error" not in res, res.get("error")
    return res


def test_no_script_errors(page):
    assert page["errors"] == []


def test_wide_screens_float_the_controls_and_phones_stack_them(page):
    assert page["modes"] == ["hud", "stack"]
    assert page["counts"] == [4, 4, 5]  # panels; story, labels, acronyms, about; and full screen


def test_episode_runs_and_is_narrated(page):
    assert "MAPE" in page["score"] and any(c.isdigit() for c in page["score"])
    assert page["caption"].strip()
    assert "Decoupled PI" in page["title"]


def test_panels_fold_and_cards_open_and_close(page):
    assert page["folded"]
    assert page["acr"][0] and page["acr"][1] > 20
    assert page["acrClosed"]


def test_full_screen_toggles_with_keys(page):
    assert page["full"] and not page["fullAfter"]


def test_sandbox_plays_and_takes_the_keyboard(page):
    assert float(page["time"].split("=")[1].split("s")[0]) > 0.5
    assert page["tfv"][1] == pytest.approx(page["tfv"][0] + 0.01)
    assert page["sandCaption"].strip()
