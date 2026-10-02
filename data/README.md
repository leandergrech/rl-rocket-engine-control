# data/

Everything here comes from this repo's **surrogate engine**, not from DLR's LUMEN simulator, which was not public on 2026-10-02 (see `docs/07-references.md`, section 7.1).

- `policies/<name>.json`: trained PPO and SAC actors exported as plain MLPs (weights, biases, activation, output squashing), about 0.3 MB each. `<name>.train.json` holds the training budget, wall time and a thinned learning curve. Written by `scripts/train.py`; copied to `docs/assets/lab/policies/` by `scripts/make_lab_data.py` for the Engine Lab.
- `results/summary.json`, `summary.md`: metrics of every controller on the evaluation profile, 20 held-out episodes, the same episodes with domain randomisation, and a heat-flux sweep. `results/eval_traces.json`: the evaluation-profile traces plotted in the docs. Written by `scripts/evaluate.py`; `python scripts/evaluate.py --check` re-evaluates and compares.
- `checkpoints/` (not committed): full Stable-Baselines3 checkpoints.

The calibrated surrogate parameters and the trim table live next to the code, in `src/rl_rocket_engine/surrogate/`.
