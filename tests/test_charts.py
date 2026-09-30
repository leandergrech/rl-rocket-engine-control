"""Chart specs in the docs parse, carry data, use theme tokens, and stay in sync with the text."""

import json
import re
from pathlib import Path

import pytest

DOCS = Path(__file__).resolve().parents[1] / "docs"
FENCE = re.compile(r"^```vegalite\n(.*?)^```", re.S | re.M)


def chart_specs():
    for page in sorted(DOCS.glob("*.md")):
        for i, match in enumerate(FENCE.finditer(page.read_text())):
            yield pytest.param(page.name, match.group(1), id=f"{page.stem}-{i}")


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
