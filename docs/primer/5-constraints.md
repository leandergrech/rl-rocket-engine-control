---
icon: re/map
---

# :re-map: Constraints and the operating map

!!! abstract "The question"

    What must never happen while the controller tracks its set points, and which set points can two valves hold at all?

## What the constraints protect {#what-the-constraints-protect}

The constraint table in [§1.2](../01-problem.md#12-formal-statement) is physical, not cosmetic ([thesis §4.1.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=75)):

- **Cooling.**
    - A minimum coolant flow $\dot m_{RC} \ge f(p_{cc})$ keeps the chamber wall below its temperature limit.
    - The channel pressure must stay above methane's critical pressure of 46 bar, to avoid boiling and "heat transfer deterioration".
    - Yet "the highest efficiency in terms of specific impulse … is achieved with the lowest possible cooling channel mass flow" ([p. 74](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=91)). In this open cycle, maximising efficiency is equivalent to minimising the turbine flow that is vented unburned ([p. 82](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=99)). Optimal operation therefore sits on a constraint boundary.
- **Injection.**
    - The fuel-to-oxidiser momentum-flux ratio $J = \rho_{\mathrm{CH_4}} v_{\mathrm{CH_4}}^2 / (\rho_{\mathrm{LOX}} v_{\mathrm{LOX}}^2)$ must exceed 10 for the flame to stay anchored at the injector face.
    - The injection temperature must stay within 210–300 K ([p. 59](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=76)).
- **Turbopumps.** Speed limits (28,000 rpm oxidiser, 50,000 rpm fuel), no dwelling at critical (resonant) speeds, and a turbine inlet below 700 K ([p. 60](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=77)).
- **Valves.** No oscillation, because of fatigue, pressure waves through the feed system, and "chugging" (low-frequency combustion–feed-system coupling) ([p. 60](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=77)).

For its first test case DLR turned these into the constraint vector of [thesis Table 5.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=96):

| Variable | Min | Max | In this repo's 2×2 environment |
|---|---|---|---|
| Mixture ratio $R_{OF}$ | 2.5 | 4 | yes |
| Momentum flux ratio $J$ | 10 | – | no (the surrogate has no injector model) |
| Turbine inlet temperature | – | 700 K | yes |
| OTP speed | – | 28,000 rpm | yes |
| FTP speed | – | 50,000 rpm | yes |
| Coolant flow $\dot m_{RC}$ | $f(p_{cc})$ | – | no ($f$ is not published) |
| Coolant outlet pressure $p_{RC}$ | 46 bar | – | yes |

On a test bench, critical variables also have **redlines**: "maximum and minimum thresholds … If those thresholds are exceeded, a safe shutdown of the engine is initiated" ([DX'25 LUMEN benchmark page](https://vehsys.gitlab-pages.liu.se/dx25benchmarks/lumen/lumen_index)). A redline trip ends the episode and costs the test. It can be triggered by a *sensor* fault as easily as by a real excursion, which is why DLR runs a parallel line of work on fault detection and virtual sensing.

## The operating map of two valves

LUMEN's envelope is 35–80 bar and mixture ratio 3.0–3.8, nominally 60 bar and 3.4 ([thesis Table 4.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=75)). Two valves cannot cover all of it on their own: the other four valves set where the two can reach. The surrogate freezes them at their positions at the 40 bar point of [Table 4.6](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=89).

Each cell below is the steady state the two valves can hold at one (pressure, mixture ratio) set point, if they can hold it at all. Colour shows the valve openings or a constrained variable.

<div class="re-widget" data-widget="envelope" data-title="Interactive: what TFV and TOV can hold on the surrogate"></div>

Reading the map:

- **Up to about 52 bar is reachable** with TFV ≤ 0.7 and TOV ≤ 0.5, the environment's valve range. (DLR's five-valve task allowed TFV ≤ 0.6 and TOV ≤ 0.4, [thesis eq. 5.2](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=97).) Beyond that the turbines run out of heat. On LUMEN the other valves (FCV, BPV, XCV) would move the whole map, which is why DLR's own controllers use four or five valves to cover 35–80 bar ([Designs and results](../04-designs.md)).
- **Low pressure at high mixture ratio runs the turbine inlet hot.** Little coolant flow absorbs the same wall heat; at mixture ratio 3.8 the inlet temperature passes 700 K just below 35 bar (727 K at 32.5 bar).
- **This repo's 2×2 task uses 35–50 bar and $R_{OF}$ 3.0–3.8** (the dashed box): the part of the map that is safely reachable. Whether DLR's challenge uses the same range is not public.

!!! tip "What it means for the agent"

    - **Not every reference is achievable.** A reference generator that samples outside the map teaches the agent to saturate. Sample inside it, or report reachability.
    - **The optimum is on a boundary.** In DLR's five-valve task the efficient operating point rides the minimum coolant flow. A reward that trades efficiency against constraints will push the agent onto the edge, so the penalty shape at the edge matters ([From physics to reward](7-reward.md)).
    - **Constraints have different clocks.** "The mixture ratio is the most time-sensitive constraint", while turbine temperature and pump speeds "have larger time constants" and must be anticipated ([thesis p. 79](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=96)).

??? question "Check yourself (click to open)"

    1. Why must the cooling channels stay above 46 bar? *That is methane's critical pressure; below it the coolant can boil, and heat transfer deteriorates.*
    2. Why does maximum efficiency sit on a constraint? *Efficiency means venting the least turbine methane, which means the least coolant flow; the wall temperature limit sets how little is enough.*
    3. In the map, why is the low-pressure, high-mixture-ratio corner hot? *Little fuel flows, so little coolant absorbs the wall heat, and the methane reaching the turbines is hotter.*
