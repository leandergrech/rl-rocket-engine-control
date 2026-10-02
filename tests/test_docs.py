"""The docs pages named in mkdocs.yml exist and the blocked state is stated where it matters."""

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
    assert (ROOT / "docs" / "email-to-dlr.md").exists()


def test_surrogate_is_labelled_wherever_it_appears():
    # Every page that runs the surrogate says it is not DLR's simulator.
    for page in ["02-primer.md", "primer/8-lab.md", "04a-surrogate-baselines.md"]:
        text = (ROOT / "docs" / page).read_text()
        assert "surrogate" in text and "not DLR" in text, page
