"""The surrogate keeps its calibration, the 2x2 environment behaves, and the baselines run."""

from __future__ import annotations

import json
from dataclasses import replace

import numpy as np
import pytest

from rl_rocket_engine.surrogate import DEFAULT_PARAMS, EngineModel, outputs, steady_state
from rl_rocket_engine.surrogate.calibrate import GAINS, dynamic_report, static_report
from rl_rocket_engine.surrogate.env import LumenSurrogateEnv, random_reference
from rl_rocket_engine.surrogate.metrics import episode_metrics
from rl_rocket_engine.surrogate.pi import run_episode
from rl_rocket_engine.surrogate.trim import trim


def test_reference_point_is_table_4_6():
    o = outputs(steady_state(0.30, 0.21), DEFAULT_PARAMS)
    assert abs(o["p_cc"] - 40) < 0.1 and abs(o["rof"] - 3.4) < 0.01
    assert abs(o["m_lox"] - 3.8) < 0.02 and abs(o["m_lng"] - 2.0) < 0.02 and abs(o["t_rc"] - 473) < 2


def test_static_gains_follow_table_4_6():
    rep = static_report(DEFAULT_PARAMS)
    for valve in ("TFV", "TOV"):
        for key in ("p_cc", "rof"):
            got, want = rep["gains"][valve][key], GAINS[valve][key]
            assert np.sign(got) == np.sign(want)
            assert abs(got - want) <= 0.15 * abs(want), (valve, key, got, want)


def test_tfv_overshoot_and_fast_tov():
    rep = dynamic_report(DEFAULT_PARAMS)
    assert 6.0 < rep["overshoot_tfv_pcc"] < 7.0  # thesis p. 73: 6.5 bar
    assert rep["settling"]["TOV"]["p_cc"] < 1.0
    assert 10 < rep["settling"]["TFV"]["p_cc"] < 30


def test_valves_settle_without_overshoot():
    m = EngineModel(dt=0.002)
    m.reset()
    m.command(0.35, 0.21)
    x = [m.advance(0.002)["x_tfv"] for _ in range(500)]
    assert max(x) < 0.35 + 0.015 * 0.05 and abs(x[-1] - 0.35) < 1e-4  # about 1 % of the step


def test_trim_inverts_the_steady_state():
    xt, xo, _ = trim(40.0, 3.4)
    assert abs(xt - 0.30) < 0.01 and abs(xo - 0.21) < 0.01
    xt, xo, s = trim(47.5, 3.2)
    o = outputs(s, DEFAULT_PARAMS)
    assert abs(o["p_cc"] - 47.5) < 1e-3 and abs(o["rof"] - 3.2) < 1e-4


def test_environment_api_and_shapes():
    from gymnasium.utils.env_checker import check_env

    env = LumenSurrogateEnv()
    check_env(env, skip_render_check=True)
    assert env.observation_space.shape == (92,)
    assert LumenSurrogateEnv(preview=False).observation_space.shape == (60,)
    obs_a, _ = env.reset(seed=3)
    obs_b, _ = env.reset(seed=3)
    np.testing.assert_array_equal(obs_a, obs_b)
    steps, done = 0, False
    while not done:
        obs, r, term, trunc, _ = env.step(env.action_space.sample())
        assert r <= 0 and np.isfinite(obs).all()
        steps += 1
        done = term or trunc
    assert steps == 600  # 30 s at 20 Hz
    assert LumenSurrogateEnv(dt=0.1).n_steps == 300  # the earlier baselines' 10 Hz


def test_random_references_stay_in_the_task_box():
    rng = np.random.default_rng(0)
    for _ in range(20):
        p, r = random_reference(rng, 30.0)
        assert p.min() >= 35 and p.max() <= 50 and r.min() >= 3.0 and r.max() <= 3.8


def test_domain_randomisation_changes_the_engine():
    env = LumenSurrogateEnv(randomise=True)
    env.reset(seed=1)
    p1 = env.params
    env.reset(seed=2)
    assert p1 != env.params and p1.k_tfv != DEFAULT_PARAMS.k_tfv


def test_pi_tracks_the_evaluation_profile():
    m = episode_metrics(run_episode(LumenSurrogateEnv(noise=False), seed=0, options={"profile": "eval"}))
    assert m["mape_p"] < 5 and m["mape_rof"] < 5


def test_pi_beats_feedforward_when_the_engine_is_perturbed():
    params = replace(DEFAULT_PARAMS, q_ref=DEFAULT_PARAMS.q_ref * 1.1)
    env = LumenSurrogateEnv(noise=False, params=params)
    ff = episode_metrics(run_episode(env, policy=lambda o: env.to_action(env.trim.valves(*env.setpoint)), seed=5))
    pi = episode_metrics(run_episode(env, seed=5))
    assert pi["mape_p"] < ff["mape_p"]


def test_settling_time_metric():
    rows = []
    for k in range(100):
        ref = 40.0 if k < 10 else 44.0
        y = 40.0 if k < 10 else 44.0 - 4.0 * np.exp(-(k - 10) / 5)
        rows.append(dict(p_cc=y, p_ref=ref, rof=3.4, rof_ref=3.4, du=0.0, violations={}, reward=0.0))
    m = episode_metrics(rows, dt=0.1)
    # Inside +-2 % (0.88 bar) once 4 exp(-n/5) < 0.88, i.e. after n = 8 samples (0.8 s at 0.1 s per sample).
    assert m["settle_p"] == pytest.approx(0.8)


@pytest.mark.parametrize("name", ["ppo-preview", "sac"])
def test_training_smoke_and_export(tmp_path, name):
    pytest.importorskip("stable_baselines3")
    from rl_rocket_engine.surrogate.rl import JsonPolicy, train

    meta = train(name, tmp_path, steps=600, n_envs=1, log=lambda s: None)
    assert meta["steps"] >= 600  # PPO rounds up to whole rollouts
    from stable_baselines3 import PPO, SAC

    model = (PPO if name.startswith("ppo") else SAC).load(tmp_path / f"{name}.zip")
    pol = JsonPolicy(json.loads((tmp_path / f"{name}.json").read_text()))
    env = LumenSurrogateEnv(preview=name.endswith("-preview"))
    obs, _ = env.reset(seed=0)
    for _ in range(5):
        a_sb3, _ = model.predict(obs, deterministic=True)
        np.testing.assert_allclose(pol(np.asarray(obs, float)), a_sb3, atol=1e-5)
        obs, *_ = env.step(a_sb3)
