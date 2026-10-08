"""Chart specs in the docs parse, carry data, use theme tokens, and stay in sync with the text."""

import functools
import html
import http.server
import json
import re
import shutil
import subprocess
import threading
from pathlib import Path

import pytest

DOCS = Path(__file__).resolve().parents[1] / "docs"
FENCE = re.compile(r"^```vegalite\n(.*?)^```", re.S | re.M)


def chart_specs():
    for page in sorted(DOCS.rglob("*.md")):
        for i, match in enumerate(FENCE.finditer(page.read_text())):
            yield pytest.param(page.name, match.group(1), id=f"{page.relative_to(DOCS).with_suffix('')}-{i}")


def has_inline_data(node):
    if isinstance(node, dict):
        if "values" in node and isinstance(node["values"], list) and node["values"]:
            return True
        return any(has_inline_data(v) for v in node.values())
    if isinstance(node, list):
        return any(has_inline_data(v) for v in node)
    return False


@pytest.mark.parametrize("page,text", list(chart_specs()))
def test_chart_spec_is_valid_json_with_inline_data(page, text):
    spec = json.loads(text)
    assert spec["$schema"].endswith("vega-lite/v6.json")
    assert spec["title"]["text"] and spec["title"]["subtitle"], "every chart names its source in the subtitle"
    assert has_inline_data(spec)


@pytest.mark.parametrize("page,text", list(chart_specs()))
def test_chart_colours_come_from_theme_tokens(page, text):
    # Raw hex colours would bypass the light/dark theme; only var(--...) tokens are allowed.
    assert not re.search(r'"#[0-9a-fA-F]{3,8}"', text)


def test_verification_chart_matches_tags():
    text = (DOCS / "07-references.md").read_text()
    spec = next(json.loads(m.group(1)) for m in FENCE.finditer(text) if "full text" in m.group(1))
    charted = {}
    for row in spec["data"]["values"]:
        charted.setdefault(row["section"].split()[0], {})[row["tag"][0]] = row["n"]
    for section in re.split(r"\n## ", text)[1:]:
        number = section.split()[0]
        if number in charted:
            body = section.split("\n", 1)[1]
            counted = {t: len(re.findall(rf"\*\*{t}\*\*", body)) for t in "VAU"}
            assert counted == charted[number], number


CHART_HARNESS = """<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="stylesheets/theme.css"></head>
<body data-md-color-scheme="default"><pre id="out"></pre>
CHARTS
<script>window.__calls = [];
window.vegaEmbed = async (el, spec, opts) => { window.__calls.push({spec, width: el.clientWidth, config: opts.config}); };</script>
<script src="javascripts/charts.js"></script>
<script>
setTimeout(() => {
  const ctx = document.createElement("canvas").getContext("2d");
  const widest = (lines, font) => { ctx.font = font; return Math.max(...[].concat(lines).map((l) => ctx.measureText(l).width)); };
  document.getElementById("out").textContent = JSON.stringify(window.__calls.map(({spec, width, config}) => ({
    width, text: spec.title.text, subtitle: spec.title.subtitle,
    textWidth: widest(spec.title.text, `${config.title.fontWeight} ${config.title.fontSize}px ${config.font}`),
    subtitleWidth: widest(spec.title.subtitle, `${config.title.subtitleFontSize}px ${config.font}`),
  })));
}, 3000);
</script></body></html>"""


@pytest.fixture(scope="module")
def phone_titles(tmp_path_factory):
    # Every chart, rendered by charts.js into a phone-width column (Vega stubbed out).
    chrome = next((c for c in ("google-chrome", "chromium", "chromium-browser") if shutil.which(c)), None)
    if chrome is None:
        pytest.skip("Chrome not installed")
    site = tmp_path_factory.mktemp("charts")
    for d in ("javascripts", "stylesheets"):
        (site / d).symlink_to(DOCS / d)
    blocks = "".join(f'<div style="width:328px"><pre class="vegalite">{html.escape(p.values[1])}</pre></div>' for p in chart_specs())
    (site / "index.html").write_text(CHART_HARNESS.replace("CHARTS", blocks))
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    handler.log_message = lambda *a, **k: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/index.html"
        cmd = [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=20000", "--dump-dom", url]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout
    finally:
        server.shutdown()
    return json.loads(html.unescape(out[out.index('<pre id="out">') + len('<pre id="out">'):out.index("</pre>")]))


def test_chart_titles_wrap_to_a_phone_screen(phone_titles):
    # A one-line subtitle wider than the chart squeezes a container-width plot to nothing.
    specs = [json.loads(p.values[1]) for p in chart_specs()]
    assert len(phone_titles) == len(specs)
    for spec, got in zip(specs, phone_titles):
        assert got["width"] == 328
        assert got["textWidth"] <= got["width"] - 12 and got["subtitleWidth"] <= got["width"] - 12, spec["title"]
        assert " ".join(got["text"]).split() == spec["title"]["text"].split()  # wrapped, nothing lost
        assert " ".join(got["subtitle"]).split() == spec["title"]["subtitle"].split()
