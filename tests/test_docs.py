"""The docs pages named in mkdocs.yml exist and the blocked state is stated where it matters."""

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def nav_pages():
    # mkdocs.yml uses a !!python/name tag; a permissive loader is enough to read the nav.
    class Loader(yaml.SafeLoader):
        pass

    Loader.add_multi_constructor("tag:yaml.org,2002:python/", lambda loader, suffix, node: None)
    config = yaml.load((ROOT / "mkdocs.yml").read_text(), Loader=Loader)

    def walk(items):
        for item in items:
            value = next(iter(item.values())) if isinstance(item, dict) else item
            if isinstance(value, list):  # a nav section
                yield from walk(value)
            else:
                yield value

    return list(walk(config["nav"]))


def test_every_nav_page_exists_and_has_a_title():
    assert len(nav_pages()) > 15
    for page in nav_pages():
        text = (ROOT / "docs" / page).read_text()
        if text.startswith("---\n"):  # skip YAML front matter
            text = text.split("---\n", 2)[2].lstrip("\n")
        # A page starts with its title, or with a hero block whose first heading is the title.
        assert any(line.startswith("# ") for line in text.splitlines()[:4]), page


def test_blocked_state_is_documented():
    references = (ROOT / "docs" / "07-references.md").read_text()
    assert "## 7.1 Search log" in references
    assert "not publicly available" in references
    assert 'id="organisers2026"' in references  # what the organisers confirmed, cited as personal communication


def test_no_page_mentions_email():
    # The site cites the challenge organisers as a personal communication; it never mentions emails.
    files = list((ROOT / "docs").rglob("*.md")) + [ROOT / "README.md", ROOT / "mkdocs.yml", ROOT / "includes" / "abbreviations.md"]
    for f in files:
        text = f.read_text().lower()
        assert "email" not in text and "e-mail" not in text and "@dlr.de" not in text, f


def test_surrogate_is_labelled_wherever_it_appears():
    # Every page that runs the surrogate says it is not DLR's simulator.
    for page in ["02-primer.md", "primer/8-lab.md", "04a-surrogate-baselines.md"]:
        text = (ROOT / "docs" / page).read_text()
        assert "surrogate" in text and "not DLR" in text, page


def abbreviations():
    text = (ROOT / "includes" / "abbreviations.md").read_text()
    return dict(re.findall(r"^\*\[([^\]]+)\]: (.+)$", text, re.M))


def test_abbreviations_are_appended_to_every_page():
    config = (ROOT / "mkdocs.yml").read_text()
    assert "- abbr" in config and "auto_append: [abbreviations.md]" in config
    assert len(abbreviations()) > 30


def test_lab_acronyms_match_the_site_wide_ones():
    # The Lab's A–Z card may say more than the tooltip, but it must start with the same expansion.
    js = (ROOT / "docs" / "javascripts" / "lab.js").read_text()
    block = js[js.index("const ACRONYMS = ["):js.index("const ICON")]
    pairs = re.findall(r'\["([^"]+)", "([^"]+)"\]', block)
    site = abbreviations()
    checked = 0
    for acronym, meaning in pairs:
        if re.fullmatch(r"[A-Z][A-Z0-9]+", acronym):
            assert acronym in site, acronym
            assert meaning.lower().startswith(site[acronym].lower()), (acronym, meaning, site[acronym])
            checked += 1
    assert checked >= 18
