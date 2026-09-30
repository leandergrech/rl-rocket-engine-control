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
    return [next(iter(item.values())) for item in config["nav"]]


def test_every_nav_page_exists_and_has_a_title():
    for page in nav_pages():
        text = (ROOT / "docs" / page).read_text()
        assert text.startswith("# "), page


def test_blocked_state_is_documented():
    references = (ROOT / "docs" / "07-references.md").read_text()
    assert "## 7.1 Search log" in references
    assert "not publicly available" in references
    assert (ROOT / "docs" / "email-to-dlr.md").exists()
