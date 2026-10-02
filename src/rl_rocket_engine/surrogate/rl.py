"""PPO and SAC baselines (Stable-Baselines3) on the surrogate, and export of trained actors to JSON.

The exported JSON is a plain MLP (weights, biases, activation, output squashing) that the in-browser
Lab evaluates with the same observation code as ``env.py``; ``tests/test_lab_model.py`` checks the
Python and JavaScript forward passes agree.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from .env import LumenSurrogateEnv

CONFIGS = {
    # name: (algorithm, env kwargs, total steps)
    "ppo-preview": ("ppo", dict(preview=True), 3_000_000),
    "ppo-nopreview": ("ppo", dict(preview=False), 3_000_000),
    "sac-preview": ("sac", dict(preview=True), 500_000),
    "sac-nopreview": ("sac", dict(preview=False), 500_000),
}


def make_env(seed: int = 0, **kwargs):
    def _init():
        from stable_baselines3.common.monitor import Monitor

        env = Monitor(LumenSurrogateEnv(**kwargs))
        env.reset(seed=seed)
        return env

    return _init


def run_name(name: str, seed: int = 0) -> str:
    """Files of seed 0 carry the configuration name; further seeds get a suffix."""
    return name if seed == 0 else f"{name}-seed{seed}"


MAX_MINUTES = 55.0  # the brief's budget is under an hour of CPU per baseline; stop early if needed


def train(name: str, out_dir: Path, steps: int | None = None, seed: int = 0, n_envs: int = 6,
          randomise: bool = False, log=print, max_minutes: float = MAX_MINUTES) -> dict:
    import torch
    from stable_baselines3 import PPO, SAC
    from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

    torch.set_num_threads(2)
    algo, env_kwargs, default_steps = CONFIGS[name]
    env_kwargs = dict(env_kwargs, randomise=randomise)
    steps = steps or default_steps
    t0 = time.time()
    if algo == "ppo":
        vec = (SubprocVecEnv if n_envs > 1 else DummyVecEnv)([make_env(seed + i, **env_kwargs) for i in range(n_envs)])
        model = PPO("MlpPolicy", vec, n_steps=512, batch_size=512, n_epochs=10, gamma=0.98, gae_lambda=0.95,
                    learning_rate=3e-4, clip_range=0.2, ent_coef=0.0, target_kl=0.05,
                    policy_kwargs=dict(net_arch=[128, 128], log_std_init=-1.0), seed=seed, verbose=0)
    else:
        n = min(n_envs, 4)
        vec = (SubprocVecEnv if n > 1 else DummyVecEnv)([make_env(seed + i, **env_kwargs) for i in range(n)])
        model = SAC("MlpPolicy", vec, buffer_size=500_000, batch_size=256, learning_rate=3e-4, gamma=0.98,
                    tau=0.01, train_freq=1, gradient_steps=max(1, n // 2), learning_starts=5_000,
                    policy_kwargs=dict(net_arch=[128, 128]), seed=seed, verbose=0)
    curve = []

    from stable_baselines3.common.callbacks import BaseCallback

    class Curve(BaseCallback):
        def _on_step(self):
            for info in self.locals.get("infos", []):
                if "episode" in info:
                    curve.append((self.num_timesteps, float(info["episode"]["r"]), time.time() - t0))
            if len(curve) and self.n_calls % 2000 == 0:
                recent = [c[1] for c in curve[-50:]]
                log(f"{name}: {self.num_timesteps} steps, mean return {np.mean(recent):.1f}, {time.time() - t0:.0f} s")
            if time.time() - t0 > 60 * max_minutes:
                log(f"{name}: stopping at {self.num_timesteps} steps, wall-clock budget of {max_minutes:.0f} min reached")
                return False
            return True

    model.learn(total_timesteps=steps, callback=Curve())
    steps = model.num_timesteps  # fewer than requested if the time budget stopped training
    vec.close()
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = run_name(name, seed)
    model.save(out_dir / f"{stem}.zip")
    policy = export_policy(model, algo, env_kwargs)
    (out_dir / f"{stem}.json").write_text(json.dumps(policy))
    meta = dict(name=name, algo=algo, env=env_kwargs, steps=steps, seed=seed, n_envs=n_envs,
                wall_s=time.time() - t0, curve=curve)
    (out_dir / f"{stem}.train.json").write_text(json.dumps(meta))
    return meta


def export_policy(model, algo: str, env_kwargs: dict) -> dict:
    """Deterministic actor as a list of dense layers. PPO: mean, then clip; SAC: tanh(mean)."""
    import torch

    layers = []
    if algo == "ppo":
        net = model.policy.mlp_extractor.policy_net
        mods = [m for m in net if isinstance(m, torch.nn.Linear)] + [model.policy.action_net]
    else:
        mods = [m for m in model.policy.actor.latent_pi if isinstance(m, torch.nn.Linear)] + [model.policy.actor.mu]
    for m in mods:
        layers.append(dict(w=m.weight.detach().cpu().numpy().round(6).tolist(),
                           b=m.bias.detach().cpu().numpy().round(6).tolist()))
    return dict(algo=algo, env=env_kwargs, activation="tanh" if algo == "ppo" else "relu",
                squash="clip" if algo == "ppo" else "tanh", layers=layers)


class JsonPolicy:
    """Evaluate an exported actor with numpy (the same arithmetic as the browser)."""

    def __init__(self, spec: dict | str | Path):
        if not isinstance(spec, dict):
            spec = json.loads(Path(spec).read_text())
        self.spec = spec
        self.layers = [(np.array(layer["w"]), np.array(layer["b"])) for layer in spec["layers"]]
        self.act = np.tanh if spec["activation"] == "tanh" else (lambda x: np.maximum(x, 0))

    def __call__(self, obs):
        x = np.asarray(obs, float)
        for i, (w, b) in enumerate(self.layers):
            x = w @ x + b
            if i < len(self.layers) - 1:
                x = self.act(x)
        return np.tanh(x) if self.spec["squash"] == "tanh" else np.clip(x, -1, 1)
