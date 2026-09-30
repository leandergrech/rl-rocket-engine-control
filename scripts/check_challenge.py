"""Print whether the LUMEN Control Challenge looks publicly released.

Usage: python scripts/check_challenge.py [--json]
"""

import argparse
import json

from rl_rocket_engine.challenge_status import GITHUB_ORG, check


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="print the raw result as JSON")
    args = parser.parse_args()

    result = check()
    if args.json:
        print(json.dumps(result, indent=2))
        return

    for repo in result["github_new_repos"]:
        print(f"NEW REPO in {GITHUB_ORG}: {repo['name']} ({repo['created_at']}) {repo['url']}")
    for name in result["pypi"]:
        print(f"PyPI project exists: https://pypi.org/project/{name}/")
    for error in result["errors"]:
        print(f"check failed: {error}")
    if result["released"]:
        print("Something new is public. Inspect it, then resume at step 2 (install in .venv).")
    elif not result["errors"]:
        print(f"No public release found (GitHub org {GITHUB_ORG}, PyPI). Still waiting on DLR.")


if __name__ == "__main__":
    main()
