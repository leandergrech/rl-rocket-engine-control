# notebooks/

Planned: `01-explore.ipynb`, `02-baseline.ipynb` and `03-first-experiment.ipynb` on the LUMEN Control Challenge environment, which was not public on 2026-10-02 (see `docs/index.md`).

Until then, the same steps run on this repo's surrogate engine (not DLR's simulator) from scripts:

- explore: the [Engine Lab](https://leandergrech.github.io/rl-rocket-engine-control/primer/8-lab/) in the browser, or `rl_rocket_engine.surrogate.LumenSurrogateEnv` in Python;
- baselines: `python scripts/train.py all`, then `python scripts/evaluate.py`;
- results: `data/results/summary.md` and the [Baselines on the surrogate](https://leandergrech.github.io/rl-rocket-engine-control/04a-surrogate-baselines/) page.
