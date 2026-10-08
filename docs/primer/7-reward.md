---
icon: re/reward
---

# :re-reward: From physics to reward

!!! abstract "The question"

    How did DLR turn tracking, constraints and efficiency into one scalar reward and one observation vector, and what does this repo's environment keep or change?

## DLR's reward, term by term

For its first simulation test case DLR wrote the reward as three parts ([thesis eq. 5.6](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=98)):

$$
R(t) = \sum_{y\in\{p_{cc},\,R_{OF}\}} r_{\mathrm{tracking},y}(t) \;+\; \sum_{c\in C} r_{\mathrm{penalty},c}(t) \;+\; r_{\mathrm{economic}}(t).
$$

**Tracking** is an exponential of the absolute percentage error ([eq. 5.7](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=98)):

$$
r_{\mathrm{tracking},y}(t) = \exp\!\Big(-\delta\,\frac{|y(t)-y_{\mathrm{ref}}(t)|}{y_{\mathrm{ref}}(t)}\Big) - 1 ,
$$

with $\delta$ = 12 ([Table A.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=164)). It is 0 at zero error and −1 for large errors, which bounds the episode return and makes training curves readable. The steep slope near zero rewards precision; the flat tail still gives a gradient early in training.

<div class="re-widget" data-widget="reward" data-title="Interactive: the tracking reward"></div>

**Constraints** cost a constant $\beta(c)$ per violated constraint per step, "regardless of the extend of the violation" ([eq. 5.8](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=98)). The values are $\beta$ = 0.5 for mixture ratio, momentum flux ratio, turbine temperature and both pump speeds, and 0.2 for coolant flow ([Table A.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=164)). An extra penalty applies if the EcosimPro simulation crashes.

**Economy** is the negative turbine flow, $r_{\mathrm{economic}} = -\gamma\,(\dot m_{\mathrm{OTP,turbine}} + \dot m_{\mathrm{FTP,turbine}})$ with $\gamma$ = 0.3 ([eq. 5.9](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=99)). In the open cycle, the turbine methane is vented, so less of it means more efficient operation.

DLR is frank about the trade-off: penalty weights "chosen too small" let the agent "briefly violate constraints to speed up setpoint changes", while weights chosen too large make it keep "a safety margin from the constraint limits, compromising tracking performance or efficiency" ([p. 82](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=99)). The weights were found "by running various training runs".

## DLR's observation

The observation at each step contains ([eq. 5.3–5.5](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=97)):

- the controlled variables $Y = (p_{cc}, R_{OF})$;
- five constrained variables (coolant flow and its minimum, coolant pressure, momentum flux ratio, turbine temperature);
- the turbine flow;
- the five valve positions $Y_{\mathrm{valves}}$ and commands $U$;
- the set points for now and the next $N_f$ steps (**preview**).

Past observations are stacked (**history**): "for a typical setting of $N_f$ = 4 and $N_p$ = 3, the observation vector has a length of 84", "normalized by their default values" ([p. 80–81](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=97)). That is three frames of 28; the thesis's formula $(N_p+1)\cdot 28$ would give four. The control interval is 0.1 s; at 0.2 s the policy failed "to capture the overshoot in ROF between two sample intervals", and 0.05 s gave "only marginal benefits" ([p. 88](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=105)). Episodes are 50 s, 500 steps ([p. 83](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=100)).

## This repo's 2×2 environment

`src/rl_rocket_engine/surrogate/env.py` follows DLR's design where the 2×2 task allows:

| | DLR test case 1 (five valves, EcosimPro) | This repo (2×2, surrogate) |
|---|---|---|
| Actions | TFV, TOV, FCV, XCV, OCV in [−1, 1], scaled to valve ranges | TFV ∈ [0.1, 0.7], TOV ∈ [0.1, 0.5] |
| Control interval, episode | 0.1 s, 50 s fixed trajectory | 0.05 s (20 Hz, the challenge's rate; the earlier baselines used 0.1 s), 30 s random holds, steps and ramps in 35–50 bar, $R_{OF}$ 3.0–3.8 |
| Tracking | eq. 5.7, $\delta$ = 12 | same |
| Constraint penalty | $\beta$ = 0.5 / 0.2, six constraints | $\beta$ = 0.5, five constraints ($R_{OF}$, turbine temperature, both speeds, $p_{RC}$) |
| Economic term | $-0.3\,\dot m_{\mathrm{turbines}}$ | off (see below) |
| Actuator penalty | none in the reward; $\Delta u$ reported | $-0.5\sum\lvert\Delta u\rvert$ per step |
| Observation per frame | 28 values | 23 with preview, 15 without |
| Preview, history | $N_f$ = 4; 84 values in total | none for the current agents, as in the challenge; $N_f$ = 4 for the earlier preview agents. The current frame and 3 past ones: 60 values without preview, 92 with |
| Sensor delays, noise | no sensor delays in test case 1 (the V2 model, [p. 83](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=100)) | 0.1 s on $p_{cc}$, 0.2 s on $R_{OF}$, small noise |

Three deliberate differences:

1. **No economic term.** With two valves and two set points there is no freedom left: the valves that hold a given pressure and mixture ratio are fixed by the trim map ([Constraints and the operating map](5-constraints.md#the-operating-map-of-two-valves)). An economic term would only reward undershooting the pressure.
2. **A valve-travel penalty.** It discourages chattering policies, which DLR's hardware experience says not to deploy ([Valves are the actuators](3-valves.md)).
3. **Tracking errors in the observation.** Each frame also carries the relative error to the coming set point, scaled so that 5 % reads as 1. A network can compute it from the other entries, but giving it directly speeds up learning.

!!! tip "What it means for the agent"

    - **The reward is the spec.** Exponential tracking with $\delta$ = 12 costs −0.11 per output at 1 % error and −0.45 at 5 %, against −1 for a total miss. Most of the slope is in the first few percent, which is where the agent learns precision.
    - **Constant penalties are cliffs.** A violation costs the same at 4.01 as at 4.5 in mixture ratio. The agent learns where the cliff is, not how bad it is to fall off; graded penalties or termination change that.
    - **The challenge gives no preview.** Future set points are not in its observation, because on the real engine the targets are generated in real time ([organisers, Oct 2026](../07-references.md#organisers2026)). This repo keeps preview as a switch only to measure what it is worth: on the surrogate's earlier 10 Hz agents it halved the pressure error ([the baselines](../04a-surrogate-baselines.md)). The current agents train without it. That is the gap a challenge entry has to close by other means.
    - **The challenge runs at 20 Hz** (same source), and so does this repo's environment since October 2026. The first baselines ran at 0.1 s, the thesis's simulation setting; they stay in the Lab for comparison.

??? question "Check yourself (click to open)"

    1. Why is the tracking reward bounded below by −1? *So the best and worst possible episode returns are known, which makes training curves interpretable (thesis p. 81).*
    2. Why does this repo drop the economic term for the 2×2 task? *Two valves, two set points: tracking fixes the valves, so turbine flow is not a free choice; the term would only reward low pressure.*
    3. Why might a constant constraint penalty encourage brief violations? *If tracking gains during a fast transient exceed $\beta$ per step, crossing a limit for a few steps pays.*
