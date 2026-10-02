# Baselines on the LUMEN-like surrogate

Surrogate results (not DLR's simulator). Mean over 20 held-out 30 s episodes (seeds 1000-1019).

| Controller | MAPE p_cc [%] | MAPE ROF [%] | Return | Steps settled p_cc / ROF [%] | Settling p_cc / ROF [s] | Valve travel | Violation steps | Randomised: MAPE p_cc / ROF [%] |
|---|---|---|---|---|---|---|---|---|
| Open-loop feedforward | 4.59 | 4.25 | -196.9 | 18 / 46 | 0.96 / 2.96 | 0.69 | 8.2 | 4.38 / 5.06 |
| Decoupled PI | 2.75 | 2.48 | -130.1 | 46 / 64 | 3.31 / 3.83 | 3.42 | 14.8 | 2.43 / 1.98 |
| PPO, no preview, seed 1 | 1.07 | 0.46 | -41.3 | 96 / 96 | 0.90 / 0.96 | 2.77 | 0.0 | 1.08 / 1.75 |
| PPO, no preview | 1.21 | 0.37 | -41.8 | 93 / 96 | 0.95 / 0.90 | 2.58 | 0.0 | 1.10 / 1.61 |
| PPO, preview, seed 1 | 0.50 | 0.34 | -25.2 | 96 / 82 | 0.66 / 0.37 | 2.42 | 0.0 | 0.94 / 1.80 |
| PPO, preview | 0.52 | 0.33 | -26.4 | 96 / 75 | 0.52 / 1.68 | 2.15 | 0.0 | 0.92 / 1.90 |
| SAC, no preview | 0.79 | 0.31 | -28.6 | 96 / 96 | 0.77 / 0.41 | 3.59 | 0.1 | 1.14 / 1.88 |
| SAC, preview | 0.54 | 0.26 | -25.0 | 96 / 71 | 0.55 / 1.24 | 2.33 | 0.0 | 0.89 / 1.88 |
