from rl_rocket_engine import challenge_status as cs


def make_fetch(org_repos, pypi_existing=()):
    def fetch(url):
        if "api.github.com" in url:
            return [{"name": n, "html_url": f"https://github.com/DLR-RA/{n}", "created_at": "2026-10-01"} for n in org_repos]
        name = url.split("/pypi/")[1].split("/")[0]
        if name in pypi_existing:
            return {"info": {"name": name}}
        raise cs.NotFound(url)

    return fetch


def test_nothing_released():
    result = cs.check(make_fetch([".github"]))
    assert result == {"github_new_repos": [], "pypi": [], "errors": [], "released": False}


def test_new_org_repo_is_reported():
    result = cs.check(make_fetch([".github", "lumen-control-challenge"]))
    assert result["released"]
    assert [r["name"] for r in result["github_new_repos"]] == ["lumen-control-challenge"]


def test_pypi_hit_is_reported():
    result = cs.check(make_fetch([".github"], pypi_existing={"lumen-gym"}))
    assert result["pypi"] == ["lumen-gym"]
    assert result["released"]


def test_network_errors_are_reported_not_raised():
    def broken(url):
        raise OSError("no network")

    result = cs.check(broken)
    assert not result["released"]
    assert len(result["errors"]) == 2
