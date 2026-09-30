"""Check whether the LUMEN Control Challenge has been released publicly.

On 2026-09-30 the challenge simulator was not public (docs/07-references.md, section 7.1).
DLR's Institute of Space Propulsion created the GitHub organisation ``DLR-RA`` on
2026-09-11; its only repository then was ``.github``. Any new public repository there,
or a LUMEN package on PyPI, is the most likely sign of a release.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Callable

GITHUB_ORG = "DLR-RA"
KNOWN_ORG_REPOS = frozenset({".github"})
PYPI_NAMES = (
    "lumen-env",
    "lumen-gym",
    "lumen-rl",
    "lumen-control",
    "lumen-challenge",
    "lumen-benchmark",
    "dlr-lumen",
)

Fetch = Callable[[str], object]


class NotFound(Exception):
    """Raised by a fetch function for an HTTP 404."""


def fetch_json(url: str, timeout: float = 10.0) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": "rl-rocket-engine-control"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as err:
        if err.code == 404:
            raise NotFound(url) from err
        raise


def new_org_repos(fetch: Fetch = fetch_json) -> list[dict]:
    """Public repositories in the DLR-RA organisation other than the known ones."""
    repos = fetch(f"https://api.github.com/orgs/{GITHUB_ORG}/repos?per_page=100")
    return [
        {"name": r["name"], "url": r["html_url"], "created_at": r.get("created_at")}
        for r in repos
        if r["name"] not in KNOWN_ORG_REPOS
    ]


def pypi_hits(fetch: Fetch = fetch_json) -> list[str]:
    """PyPI project names from PYPI_NAMES that exist."""
    hits = []
    for name in PYPI_NAMES:
        try:
            fetch(f"https://pypi.org/pypi/{name}/json")
        except NotFound:
            continue
        hits.append(name)
    return hits


def check(fetch: Fetch = fetch_json) -> dict:
    """Run all checks; network errors are reported, not raised."""
    result: dict = {"github_new_repos": [], "pypi": [], "errors": []}
    for key, probe in (("github_new_repos", new_org_repos), ("pypi", pypi_hits)):
        try:
            result[key] = probe(fetch)
        except Exception as err:  # noqa: BLE001 - report any network failure
            result["errors"].append(f"{key}: {err}")
    result["released"] = bool(result["github_new_repos"] or result["pypi"])
    return result
