---
icon: re/sigma
---

# :re-sigma: Equation sheet

Every equation the primer and the Lab use, in one place. Each entry says what DLR's LUMEN model (EcosimPro/ESPSS) does, what the surrogate does instead, and where to see it.

Units: pressure in bar, flow in kg/s, temperature in K, shaft speed in rad/s. Calibrated values are in `src/rl_rocket_engine/surrogate/calibrated.json`; each parameter's source is in `params.py`.

## Thrust and chamber pressure {#eq-thrust}

$$
F = A_t\,p_{cc}\,C_F(\kappa, p_e/p_{cc}) + (p_e-p_{\mathrm{amb}})A_e, \qquad p_{cc} = \frac{c^*(R_{OF})}{A_t}\,\big(\dot m_{\mathrm{ox}} + \dot m_{\mathrm{inj}}\big)
$$

- **DLR:** combustion chamber and nozzle components of ESPSS; thrust ∝ $p_{cc}$ ([thesis eq. 2.3–2.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=27)).
- **Surrogate:** quasi-static (the chamber fills much faster than anything else moves), with $c^*/A_t$ = 8.13 bar per kg/s at $R_{OF}$ 3.4, chosen so 3.8 kg/s of LOX and 1.12 kg/s of injected fuel give 40 bar (Table 4.6). $c^*$ varies with $R_{OF}$ as a parabola peaking at $R_{OF}$ 2.8 (calibrated; LOX/methane $c^*$ peaks near 3).
- **See:** [The engine as a control system](1-engine.md).

## Mixture ratio {#eq-rof}

$$
R_{OF} = \frac{\dot m_{\mathrm{ox}}}{\dot m_{\mathrm{inj}}}
$$

- **DLR:** measured as the ratio of two Coriolis flow readings ([thesis eq. 2.1](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=25)).
- **Surrogate:** the LOX pump flow over the injected fuel flow, the latter being the fuel pump flow minus the turbine and BPV bleeds.

## Pump head map {#eq-pump}

$$
\Delta p = \rho\,\psi_0\,\omega^2 - \psi_1\,\omega\,\dot m, \qquad T_{\mathrm{pump}} = \frac{\dot m\,\Delta p}{\rho\,\eta\,\omega}
$$

- **DLR:** dimensionless maps $\psi^+(\varphi^+)$ and $C^+(\varphi^+)$ from test data ([thesis eq. 4.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=83)).
- **Surrogate:** the linear head map above, with $\psi_0$ = 1.45 × 10⁻³ m² and $\psi_1$ = 190, the same for both pumps. The coefficients were chosen to be consistent with the turbopump test campaign ([thesis p. 57](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=74)). Efficiencies are 0.65 (LOX) and 0.60 (fuel), assumed.
- **See:** [The expander-bleed cycle](2-cycle.md#turbopump-power-balance).

## Turbine torque and shaft {#eq-turbine}

$$
I\,\dot\omega = T_{\mathrm{turbine}} - T_{\mathrm{pump}}, \qquad T_{\mathrm{turbine}} = \dot m_t\,\Big(a\,\sqrt{T_w}\,\sqrt{1 - (p_{\mathrm{vent}}/p_{RC})^{0.23}} - b\,\omega\Big)
$$

- **DLR:** specific-torque map $T_s = f(\Pi, N)$ over pressure ratio and blade-speed ratio, with torque scaling factors for uncertainty ([thesis eq. 4.5](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=83)).
- **Surrogate:** an impulse turbine. Torque is proportional to the flow times the gap between jet speed and blade speed; jet speed grows with $\sqrt{T_w}$ and, weakly, with the pressure ratio to the vent. The constants $a$, $b$ (one pair per turbine) and the inertias $I$ are calibrated. The Lab's *fuel turbine ×* and *LOX turbine ×* scale $a$ of each turbine.

## Hot-gas valves {#eq-valve-flow}

$$
\dot m_t = k\,x^{0.8}\,\frac{p_{RC}}{\sqrt{T_w}}
$$

- **DLR:** $k_v$ curves from the manufacturer, fine-tuned on component tests ([thesis Table 4.4](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=85)).
- **Surrogate:** choked flow with opening exponent 0.8, which fits the three TFV component tests to within 2 % (my fit). Calibrated $k$: TFV 0.29 (the valve alone tests at 0.50–0.52; the turbine nozzle in series lowers it), TOV 0.43, BPV 0.10 at its frozen opening.
- **See:** [Valves are the actuators](3-valves.md).

## Valve motion {#eq-valve-motion}

$$
v_{\mathrm{des}} = \mathrm{sign}(e)\,\min\Big(\sqrt{2\,\beta\,a_{\max}|e|},\; v_{\max},\; \frac{|e|}{\tau_{\mathrm{pos}}}\Big), \qquad \dot v = \mathrm{clip}\Big(\frac{v_{\mathrm{des}} - v}{\tau_v},\, \pm a_{\max}\Big), \qquad e = u(t - T_d) - x
$$

- **DLR:** a semi-empirical valve model fitted after the first hot-fire test, with $k_v$, $a_{\max}$, $v_{\max}$ and dead time $T_d$ randomised ([thesis Table A.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=165)).
- **Surrogate:** dead time $T_d$ = 0.05 s, $v_{\max}$ = 2 /s (full stroke in about 0.5 s), $a_{\max}$ = 20 /s², braking at $\beta$ = 0.5 of $a_{\max}$, and a linear zone with $\tau_{\mathrm{pos}}$ = 0.05 s and $\tau_v$ = 0.02 s. Overshoot is about 1 % of the step ("no overshoot", [thesis p. 56](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=73)).

## Feed lines {#eq-feed}

$$
L_o\,\frac{d\dot m_o}{dt} = p_{\mathrm{tank}} + \Delta p_o - p_{cc} - R_o\,\dot m_o^2, \qquad L_f\,\frac{d\dot m_f}{dt} = p_{\mathrm{tank}} + \Delta p_f - p_{RC} - R_{RC}\,\dot m_{RC}^2, \qquad p_{RC} = p_{cc} + R_{\mathrm{inj}}\,\dot m_{\mathrm{inj}}^2
$$

- **DLR:** 1-D pipes, valves and injector components.
- **Surrogate:** lumped resistances and inertances. The inertances (about 2 bar·s per kg/s) are far larger than a real line's; they stand in for the feed and pump dynamics the model leaves out. The injected fuel follows from a quadratic in $\dot m_{\mathrm{inj}}$, solved in closed form.

## Wall heat and the coolant {#eq-heat}

$$
\dot Q = \dot Q_{\mathrm{ref}}\Big(\frac{p_{cc}}{40}\Big)^{0.8}\Big(1 + k_T\,\frac{T_{LNG} - 280}{100}\Big), \qquad C_{th}\,\frac{dT_w}{dt} = \dot Q - \dot m_{RC}\,c_p\,(T_w - T_{in})
$$

- **DLR:** a Bartz-type heat flux scaled by empirical factors in $T_{LNG}$ and $p_{cc}$ ([thesis eq. 4.2–4.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=80)), into a cooling jacket with 1-D flow and 3-D walls. The integral heat flux "roughly follows … $\dot Q \propto p_{cc}^{0.8}$" (Fig. 4.6).
- **Surrogate:** a single lumped thermal mass. $\dot Q_{\mathrm{ref}}$ is 1.75 MW (read from Fig. 4.6), $T_{in}$ is 120 K (Table 4.4). $k_T$, $c_p$ and $C_{th}$ are calibrated. The Lab's *heat flux ×* scales $\dot Q_{\mathrm{ref}}$.
- **See:** [The expander-bleed cycle](2-cycle.md#one-heat-budget-two-turbines); [Fast chamber, slow heat](4-time-scales.md).

## Injection temperature {#eq-tlng}

$$
\tau_{LNG}\,\frac{dT_{LNG}}{dt} = 280 + 0.435\,(T_w - 473) - T_{LNG}
$$

- **DLR:** mixing of the warm channel outflow with the cold FCV bypass, through the mixer and XCV.
- **Surrogate:** an empirical lag on the coolant temperature, with the static slope of Table 4.6 (−47.8 K per −109.8 K) and $\tau_{LNG}$ calibrated to the 23.8 s settling time.

## Sensors {#eq-sensors}

$$
p_{cc}^{\mathrm{meas}}(t) = p_{cc}(t - 0.1\ \mathrm{s}) + \mathcal N(0, 0.05^2), \qquad R_{OF}^{\mathrm{meas}}(t) = R_{OF}(t - 0.2\ \mathrm{s}) + \mathcal N(0, 0.005^2)
$$

- **DLR:** moving-average and delay models, randomised over 0.05–0.15 s ($p_{cc}$) and 0.1–0.25 s (flows) ([Table A.3](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=165)).
- **Surrogate:** a pure delay (resolution 0.05 s) and Gaussian noise; with domain randomisation the delays are drawn from DLR's ranges. Sensor faults act on the delayed, noisy reading.
- **Rate:** the controller reads and acts every 0.05 s, the challenge's 20 Hz ([organisers, Oct 2026](../07-references.md#organisers2026)); the earlier baselines used 0.1 s.
- **See:** [Sensors, delays and noise](6-sensors.md).

## Reward {#eq-reward}

$$
r_t = \sum_{y\in\{p_{cc},R_{OF}\}}\Big(e^{-\delta\,|y - y_{\mathrm{ref}}|/y_{\mathrm{ref}}} - 1\Big) \;-\; \beta\,n_{\mathrm{violated}} \;-\; \lambda\sum_{i}|u_{i,t} - u_{i,t-1}|, \qquad \delta = 12,\ \beta = 0.5,\ \lambda = 0.5
$$

- **DLR:** eq. 5.6–5.9, with an economic term $-0.3\,\dot m_{\mathrm{turbines}}$ and no actuator term ([thesis p. 81–82](https://elib.dlr.de/219040/1/DLR-FB-2025-16.pdf#page=98)).
- **Surrogate environment:** as above, scored against the set point of the step just completed. The violation count covers $R_{OF}$ outside 2.5–4, turbine inlet above 700 K, OTP above 28,000 rpm, FTP above 50,000 rpm and $p_{RC}$ below 46 bar.
- **See:** [From physics to reward](7-reward.md).

## PI baseline {#eq-pi}

$$
u = u_{\mathrm{trim}}(y_{\mathrm{ref}}) + K(y_{\mathrm{ref}})^{-1}\begin{pmatrix} k_{p,p}\,e_p + k_{i,p}\int e_p\,dt \\ k_{p,r}\,e_r + k_{i,r}\int e_r\,dt \end{pmatrix}, \qquad K = \frac{\partial(p_{cc}, R_{OF})}{\partial(\mathrm{TFV}, \mathrm{TOV})}\Big|_{\mathrm{steady}}
$$

- **Feedforward** $u_{\mathrm{trim}}$ and the static gain matrix $K$ are interpolated from a trim table over 32.5–52.5 bar and $R_{OF}$ 2.8–4.0 (`trim.py`).
- **Gains, either way:** tuned by Nelder–Mead on 12 training episodes at 20 Hz (`pi_gains.json`), or designed for a bandwidth (below).
- **Anti-windup:** conditional integration.
- **See:** [Lab, PI](8-lab.md?preset=pi); `src/rl_rocket_engine/surrogate/pi.py`.

## PI by bandwidth {#eq-pi-bandwidth}

Each decoupled channel is fitted with a first order plus dead time, $G_i(s) = k_i\,e^{-\theta_i s}/(\tau_i s + 1)$. The fit uses the first 3 s of a step through the decoupler at 40 bar, so it captures the fast part before the thermal sag. The dead time $\theta_i$ adds the sensor delay and half a control interval. For a closed-loop bandwidth $f_b$, the SIMC rules (Skogestad 2003) give

$$
\lambda = \frac{1}{2\pi f_b}, \qquad k_p = \frac{\tau_i}{k_i(\lambda + \theta_i)}, \qquad T_i = \min\big(\tau_i,\ 4(\lambda + \theta_i)\big), \qquad k_i^{\mathrm{PI}} = k_p / T_i
$$

- **Default:** the pair of bandwidths with the best mean return on the 12 training episodes: 0.15 Hz for the pressure loop and 0.47 Hz for the mixture-ratio loop. SIMC's tight choice $\lambda = \theta_i$ gives about 60° of phase margin on the model, but 0.72 Hz is too fast for the pressure loop on the engine. Its model leaves out the thermal sag and the coupling.
- **Margins:** the crossover frequency and phase margin of $L(j\omega) = (k_p + k_i^{\mathrm{PI}}/j\omega)\,G_i(j\omega)$, shown live in the Lab.
- **See:** [Lab, PI by bandwidth](8-lab.md?preset=pi&pi=bw); `pi.py` (`identify_loops`, `gains_for_bandwidth`, `loop_margins`).

## Malfunctions {#eq-faults}

A fault starts at $t_0$, abruptly or over a ramp, with severity $s(t) \in [0, 1]$ scaling its magnitude $m$:

$$
\frac{d\omega}{dt} = \frac{\tau_{\mathrm{turbine}} - (1 + s\,m)\,\tau_{\mathrm{pump}}}{I}\ \text{(bearing wear)}, \qquad
\dot m_{\mathrm{to\ chamber}} = (1 - s\,m)\,\dot m_{\mathrm{pump}}\ \text{(leak)}, \qquad
k_{\mathrm{turbine\ path}} \to (1 - s\,m)\,k\ \text{(blockage)}
$$

- **Also:** a valve frozen where it is (stuck), extra valve dead time (actuator lag), extra wall heat (cooling degradation), turbine torque falling over the episode (ageing), and a pressure sensor that is offset, drifts or freezes, or a mixture-ratio sensor with a gain error.
- **DLR:** DX'25 simulated pump bearing failure, turbine nozzle blockage, a pump leak, a stuck valve and multiplicative sensor faults on its LUMEN model ([LiU benchmark page](https://vehsys.gitlab-pages.liu.se/dx25benchmarks/lumen/lumen_index)). The challenge's test cases 5–7 are slow drift and a fault with and without a detection signal ([AI4Aerospace 2025](https://w3.onera.fr/ailab/sites/default/files/2025-06/abstractsAI4A5thworkshop_external.pdf#page=56)). The magnitudes and onsets here are this site's choices.
- **See:** the Lab's *Test cases and faults* panel; `faults.py`, `scenarios.json`.
