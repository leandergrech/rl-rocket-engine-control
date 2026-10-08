/* LUMEN-like surrogate engine, JavaScript port of src/rl_rocket_engine/surrogate/{model,env,pi}.py.
 *
 * A teaching and tooling surrogate, NOT DLR's simulator: a reduced expander-bleed engine calibrated to
 * the numbers the Dresia (2025) thesis publishes (Tables 4.6 and 4.7). The functions mirror the Python
 * line for line; tests/test_lab_model.py runs both and checks they agree.
 * Units: bar, kg/s, K, rad/s.
 */
(function (root) {
  "use strict";
  const X_TFV = 0, V_TFV = 1, X_TOV = 2, V_TOV = 3, W_O = 4, W_F = 5, M_O = 6, M_F = 7, T_W = 8, T_LNG = 9;
  const RPM = 60 / (2 * Math.PI);
  const DT = 0.05, DT_LEGACY = 0.1, SUB = 0.05;  // 20 Hz, the challenge's rate; 10 Hz for the first baselines
  const U_LOW = [0.1, 0.1], U_HIGH = [0.7, 0.5];
  const LIMITS = { rof_min: 2.5, rof_max: 4.0, t_turbine_max: 700, n_otp_max: 28000, n_ftp_max: 50000, p_rc_min: 46 };
  const clip = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

  function valveArea(x, p) { return Math.pow(clip(x, 0, 1), p.valve_exp); }

  function cstarFactor(rof, p) {
    rof = clip(rof, 1.5, 6.0);
    const f = 1 - p.cstar_k * (rof - p.cstar_r0) ** 2;
    const fRef = 1 - p.cstar_k * (3.4 - p.cstar_r0) ** 2;
    return f / fRef;
  }

  function pumpDp(w, m, rho, p) { return (rho * p.psi0 * w * w - p.psi1 * w * m) * 1e-5; }

  function algebraic(s, p) {
    const mO = s[M_O], mF = s[M_F], tW = Math.max(s[T_W], 150);
    const mOc = mO * (1 - (p.leak_o || 0)), mFe = mF * (1 - (p.leak_f || 0));  // what reaches injector and channels
    const rootT = Math.sqrt(tW);
    const aTfv = valveArea(s[X_TFV], p), aTov = valveArea(s[X_TOV], p);
    const sF = p.k_tfv * aTfv / rootT, sO = p.k_tov * aTov / rootT, sB = p.k_bpv / rootT;
    const sTot = sF + sO + sB;
    let kc = p.kc, mInj = 0;
    for (let it = 0; it < 2; it++) {
      const qa = sTot * p.r_inj, qb = 1 + sTot * kc, qc = mFe - sTot * kc * mOc;
      if (qa > 1e-12) {
        const disc = Math.max(qb * qb + 4 * qa * qc, 0);
        mInj = (-qb + Math.sqrt(disc)) / (2 * qa);
      } else mInj = qc / qb;
      mInj = Math.max(mInj, 1e-6);
      kc = p.kc * cstarFactor(mOc / mInj, p);
    }
    const pCc = kc * (mOc + mInj);
    const pRc = pCc + p.r_inj * mInj * mInj;
    const mTf = sF * pRc, mTo = sO * pRc, mBpv = sB * pRc;
    const mRc = mFe - p.m_byp;
    const jet = rootT * Math.sqrt(Math.max(1 - Math.pow(p.p_vent / Math.max(pRc, p.p_vent + 1e-3), p.isen_exp), 0));
    const tqTf = mTf * (p.a_tf * jet - p.b_tf * s[W_F]);
    const tqTo = mTo * (p.a_to * jet - p.b_to * s[W_O]);
    const dpO = pumpDp(s[W_O], mO, p.rho_lox, p), dpF = pumpDp(s[W_F], mF, p.rho_lng, p);
    const tqPo = mO * dpO * 1e5 / (p.rho_lox * p.eta_po * Math.max(s[W_O], 1));
    const tqPf = mF * dpF * 1e5 / (p.rho_lng * p.eta_pf * Math.max(s[W_F], 1));
    const qWall = p.q_ref * Math.pow(Math.max(pCc, 1) / p.p_ref, p.q_exp) * (1 + p.k_tlng * (s[T_LNG] - p.t_lng_ref) / 100);
    return { m_inj: mInj, m_oc: mOc, m_fe: mFe, p_cc: pCc, p_rc: pRc, m_tf: mTf, m_to: mTo, m_bpv: mBpv, m_rc: mRc,
      tq_tf: tqTf, tq_to: tqTo, tq_po: tqPo, tq_pf: tqPf, dp_o: dpO, dp_f: dpF, q_wall: qWall };
  }

  function derivatives(s, uTfv, uTov, p) {
    const a = algebraic(s, p);
    const d = new Array(10).fill(0);
    for (const [xi, vi, u] of [[X_TFV, V_TFV, uTfv], [X_TOV, V_TOV, uTov]]) {
      const err = u - s[xi];
      const vDes = Math.sign(err) * Math.min(Math.sqrt(2 * p.valve_brake * p.valve_amax * Math.abs(err)), p.valve_vmax,
        Math.abs(err) / p.valve_tau_pos);
      d[xi] = s[vi];
      d[vi] = clip((vDes - s[vi]) / p.valve_tau, -p.valve_amax, p.valve_amax);
    }
    if (p.stuck_tfv) { d[X_TFV] = 0; d[V_TFV] = 0; }
    if (p.stuck_tov) { d[X_TOV] = 0; d[V_TOV] = 0; }
    d[W_O] = (a.tq_to - a.tq_po * (1 + (p.drag_o || 0))) / p.inertia_o;  // a worn bearing adds friction
    d[W_F] = (a.tq_tf - a.tq_pf * (1 + (p.drag_f || 0))) / p.inertia_f;
    d[M_O] = (p.p_tank_o + a.dp_o - (a.p_cc + p.r_o * s[M_O] * Math.abs(s[M_O]))) / p.l_o;
    const pFReq = a.p_rc + p.r_rc * a.m_rc * Math.abs(a.m_rc);
    d[M_F] = (p.p_tank_f + a.dp_f - pFReq) / p.l_f;
    d[T_W] = (a.q_wall - a.m_rc * p.cp * (s[T_W] - p.t_in)) / p.c_th;
    const tLngSs = p.t_lng_ref + p.k_lng * (s[T_W] - p.t_w_ref);
    d[T_LNG] = (tLngSs - s[T_LNG]) / p.tau_lng;
    return [d, a];
  }

  function outputs(s, p, a) {
    a = a || algebraic(s, p);
    return { p_cc: a.p_cc, rof: a.m_oc / a.m_inj, m_lox: s[M_O], m_lng: s[M_F], m_inj: a.m_inj, m_rc: a.m_rc,
      m_leak_o: s[M_O] - a.m_oc, m_leak_f: s[M_F] - a.m_fe,
      t_rc: s[T_W], t_lng: s[T_LNG], n_otp: s[W_O] * RPM, n_ftp: s[W_F] * RPM, p_rc: a.p_rc,
      m_tf: a.m_tf, m_to: a.m_to, m_bpv: a.m_bpv, q_wall: a.q_wall, x_tfv: s[X_TFV], x_tov: s[X_TOV] };
  }

  function solve(A, b) {
    const n = b.length;
    const m = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
      [m[c], m[piv]] = [m[piv], m[c]];
      if (Math.abs(m[c][c]) < 1e-300) continue;
      for (let r = c + 1; r < n; r++) {
        const f = m[r][c] / m[c][c];
        for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let acc = m[r][n];
      for (let k = r + 1; k < n; k++) acc -= m[r][k] * x[k];
      x[r] = Math.abs(m[r][r]) > 1e-300 ? acc / m[r][r] : 0;
    }
    return x;
  }

  function steadyState(xTfv, xTov, p, guess) {
    let s = guess ? guess.slice() : [xTfv, 0, xTov, 0, p.w_o_ref, p.w_f_ref, p.m_o_ref, p.m_f_ref, p.t_w_ref, p.t_lng_ref];
    s[X_TFV] = xTfv; s[V_TFV] = 0; s[X_TOV] = xTov; s[V_TOV] = 0;
    const idx = [W_O, W_F, M_O, M_F, T_W], scale = [100, 100, 0.05, 0.05, 5];
    for (let it = 0; it < 80; it++) {
      s[T_LNG] = p.t_lng_ref + p.k_lng * (s[T_W] - p.t_w_ref);
      const f = idx.map((i) => derivatives(s, xTfv, xTov, p)[0][i]);
      if (Math.max(...f.map(Math.abs)) < 1e-9) break;
      const jac = [];
      idx.forEach((j, jj) => {
        const sp = s.slice();
        sp[j] += scale[jj] * 1e-4;
        sp[T_LNG] = p.t_lng_ref + p.k_lng * (sp[T_W] - p.t_w_ref);
        const dp = derivatives(sp, xTfv, xTov, p)[0];
        jac.push(idx.map((i, k) => (dp[i] - f[k]) / (scale[jj] * 1e-4)));
      });
      const A = [0, 1, 2, 3, 4].map((k) => [0, 1, 2, 3, 4].map((j) => jac[j][k]));
      const step = solve(A, f.map((v) => -v));
      let lam = 1, trial = s;
      for (let ls = 0; ls < 20; ls++) {
        trial = s.slice();
        idx.forEach((j, jj) => { trial[j] += lam * step[jj]; });
        if (trial[T_W] > 150 && trial[M_F] > p.m_byp && trial[W_O] > 50 && trial[W_F] > 50) break;
        lam *= 0.5;
      }
      s = trial;
    }
    s[T_LNG] = p.t_lng_ref + p.k_lng * (s[T_W] - p.t_w_ref);
    return s;
  }

  class EngineModel {
    constructor(params, dt) { this.p = params; this.dt = dt || 0.005; this.state = []; this.t = 0; this.queue = []; this.u = [0.3, 0.21]; }
    reset(xTfv, xTov) {
      this.state = steadyState(xTfv, xTov, this.p);
      this.t = 0; this.queue = []; this.u = [xTfv, xTov];
      return outputs(this.state, this.p);
    }
    command(uTfv, uTov) { this.queue.push([this.t + this.p.valve_delay, clip(uTfv, 0, 1), clip(uTov, 0, 1)]); }
    advance(duration) {
      const n = Math.max(1, Math.round(duration / this.dt));
      const p = this.p, s = this.state, dt = this.dt;
      for (let k = 0; k < n; k++) {
        while (this.queue.length && this.queue[0][0] <= this.t + 1e-12) {
          const q = this.queue.shift();
          this.u = [q[1], q[2]];
        }
        if (p.stuck_tfv) s[V_TFV] = 0;
        if (p.stuck_tov) s[V_TOV] = 0;
        const d = derivatives(s, this.u[0], this.u[1], p)[0];
        s[V_TFV] += dt * d[V_TFV];
        s[V_TOV] += dt * d[V_TOV];
        d[X_TFV] = s[V_TFV]; d[X_TOV] = s[V_TOV];
        for (const i of [X_TFV, X_TOV, W_O, W_F, M_O, M_F, T_W, T_LNG]) s[i] += dt * d[i];
        for (const [xi, vi] of [[X_TFV, V_TFV], [X_TOV, V_TOV]]) {
          if (s[xi] < 0 || s[xi] > 1) { s[xi] = clip(s[xi], 0, 1); s[vi] = 0; }
        }
        this.t += dt;
      }
      return outputs(s, p);
    }
  }

  /* Trim table: bilinear interpolation of valve openings and static gains over (p_cc, ROF). */
  class TrimTable {
    constructor(t) {
      this.p = t.p_cc; this.r = t.rof;
      this.u = t.points.map((row) => row.map((c) => (c ? [c.x_tfv, c.x_tov] : [NaN, NaN])));
      this.k = t.points.map((row) => row.map((c) => (c ? [c.gain[0][0], c.gain[0][1], c.gain[1][0], c.gain[1][1]] : [NaN, NaN, NaN, NaN])));
    }
    static frac(x, grid) {
      if (x <= grid[0]) return 0;
      const n = grid.length;
      if (x >= grid[n - 1]) return n - 1;
      let i = 0;
      while (grid[i + 1] < x) i++;
      return i + (x - grid[i]) / (grid[i + 1] - grid[i]);
    }
    interp(arr, pCc, rof) {
      const i = clip(TrimTable.frac(pCc, this.p), 0, this.p.length - 1.001);
      const j = clip(TrimTable.frac(rof, this.r), 0, this.r.length - 1.001);
      const i0 = Math.floor(i), j0 = Math.floor(j), a = i - i0, b = j - j0;
      return arr[i0][j0].map((_, q) => (1 - a) * (1 - b) * arr[i0][j0][q] + a * (1 - b) * arr[i0 + 1][j0][q]
        + (1 - a) * b * arr[i0][j0 + 1][q] + a * b * arr[i0 + 1][j0 + 1][q]);
    }
    valves(pCc, rof) { return this.interp(this.u, pCc, rof); }
    gain(pCc, rof) { const g = this.interp(this.k, pCc, rof); return [[g[0], g[1]], [g[2], g[3]]]; }
  }

  /* Decoupled, gain-scheduled PI with conditional-integration anti-windup (pi.py). */
  class DecoupledPI {
    constructor(gains, trim, dt) { this.g = gains; this.trim = trim; this.dt = dt || DT; this.reset(); }
    reset() { this.i = [0, 0]; }
    step(pMeas, rofMeas, pRef, rofRef) {
      const g = this.g, e = [pRef - pMeas, rofRef - rofMeas];
      const K = this.trim.gain(pRef, rofRef);
      const det = K[0][0] * K[1][1] - K[0][1] * K[1][0];
      const Ki = [[K[1][1] / det, -K[0][1] / det], [-K[1][0] / det, K[0][0] / det]];
      const uff = this.trim.valves(pRef, rofRef);
      const kp = [g.kp_p, g.kp_r], ki = [g.ki_p, g.ki_r];
      let iNew = [this.i[0] + ki[0] * e[0] * this.dt, this.i[1] + ki[1] * e[1] * this.dt];
      const mv = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]];
      const law = (I) => { const c = mv(Ki, [kp[0] * e[0] + I[0], kp[1] * e[1] + I[1]]); return [uff[0] + c[0], uff[1] + c[1]]; };
      let u = law(iNew);
      const hi = u.map((v, q) => v > U_HIGH[q]), lo = u.map((v, q) => v < U_LOW[q]);
      if (hi.some(Boolean) || lo.some(Boolean)) {
        const push = mv(Ki, [ki[0] * e[0] * this.dt, ki[1] * e[1] * this.dt]);
        const bad = [0, 1].map((q) => (hi[q] && push[q] > 0) || (lo[q] && push[q] < 0));
        if (bad.some(Boolean)) {
          const contrib = [0, 1].map((c) => [0, 1].some((r) => bad[r] && Math.abs(Ki[r][c]) > 0));
          iNew = iNew.map((v, c) => (contrib[c] ? this.i[c] : v));
          u = law(iNew);
        }
      }
      this.i = iNew;
      return [clip(u[0], U_LOW[0], U_HIGH[0]), clip(u[1], U_LOW[1], U_HIGH[1])];
    }
  }

  /* Exported actor (rl.py export_policy): dense layers, tanh or relu, clip (PPO) or tanh (SAC). */
  function mlp(spec, obs) {
    let x = Float64Array.from(obs);
    const L = spec.layers;
    for (let l = 0; l < L.length; l++) {
      const W = L[l].w, b = L[l].b, y = new Float64Array(b.length);
      for (let r = 0; r < b.length; r++) {
        let acc = b[r];
        const row = W[r];
        for (let c = 0; c < row.length; c++) acc += row[c] * x[c];
        y[r] = l < L.length - 1 ? (spec.activation === "tanh" ? Math.tanh(acc) : Math.max(acc, 0)) : acc;
      }
      x = y;
    }
    return Array.from(x, (v) => (spec.squash === "tanh" ? Math.tanh(v) : clip(v, -1, 1)));
  }

  const toValves = (a) => [0, 1].map((q) => U_LOW[q] + (clip(a[q], -1, 1) + 1) * 0.5 * (U_HIGH[q] - U_LOW[q]));
  const toAction = (u) => [0, 1].map((q) => clip(2 * (u[q] - U_LOW[q]) / (U_HIGH[q] - U_LOW[q]) - 1, -1, 1));

  function violations(o) {
    return { rof: o.rof < LIMITS.rof_min || o.rof > LIMITS.rof_max, t_turbine: o.t_rc > LIMITS.t_turbine_max,
      n_otp: o.n_otp > LIMITS.n_otp_max, n_ftp: o.n_ftp > LIMITS.n_ftp_max, p_rc: o.p_rc < LIMITS.p_rc_min };
  }

  /* Small deterministic RNG (mulberry32) with Gaussian draws, for sensor noise in the browser. */
  function rng(seed) {
    let a = seed >>> 0;
    const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { uniform: u, normal: (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()) };
  }

  /* One episode of the 2x2 task (env.py LumenSurrogateEnv) on given reference arrays. The controller
   * is called once per 0.1 s with {obs, meas, setpoint, out} and returns valve commands [TFV, TOV]. */
  class Episode {
    constructor(opts) {
      this.p = this.base = opts.params; this.trim = opts.trim;
      this.dt = opts.dt || DT; this.faults = opts.faults || []; this.memo = {}; this.faultSig = "";
      this.preview = opts.preview !== false; this.nFuture = opts.nFuture ?? 4; this.nPast = opts.nPast ?? 3;
      this.sensorDelay = opts.sensorDelay !== false; this.noise = opts.noise !== false;
      this.delay = opts.delay || { p_cc: 0.1, rof: 0.2 };
      this.delta = opts.delta ?? 12; this.beta = opts.beta ?? 0.5; this.duWeight = opts.duWeight ?? 0.5;
      this.pref = opts.pref; this.rref = opts.rref; this.nSteps = opts.nSteps ?? (this.pref.length - this.nFuture - 1);
      this.rand = rng(opts.seed ?? 1);
      const u0 = this.trim.valves(this.pref[0], this.rref[0]).map((v, q) => clip(v, U_LOW[q], U_HIGH[q]));
      this.model = new EngineModel(this.p, opts.dtSim || 0.005);
      this.model.state = steadyState(u0[0], u0[1], this.p);
      this.model.u = u0.slice();
      this.uPrev = u0.slice();
      this.out = outputs(this.model.state, this.p);
      this.hist = new Array(8).fill([this.out.p_cc, this.out.rof]);
      this.k = 0;
      this.meas = this.measure();
      const f = this.frame();
      this.frames = new Array(this.nPast + 1).fill(f);
    }
    measure() {
      const h = this.hist, n = h.length;
      const ip = this.sensorDelay ? Math.max(0, n - 1 - Math.round(this.delay.p_cc / SUB)) : n - 1;
      const ir = this.sensorDelay ? Math.max(0, n - 1 - Math.round(this.delay.rof / SUB)) : n - 1;
      let pm = h[ip][0], rm = h[ir][1];
      if (this.noise) { pm += this.rand.normal(0, 0.05); rm += this.rand.normal(0, 0.005); }
      if (this.faults.length) [pm, rm] = sensorReading(this.faults, this.k * this.dt, pm, rm, this.memo);
      return [pm, rm];
    }
    frame() {
      const k = this.k, [pm, rm] = this.meas, pr = this.pref, rr = this.rref, o = this.out;
      const n = this.preview ? this.nFuture + 1 : 1;
      const idx = Array.from({ length: n }, (_, i) => Math.min(k + 1 + i, pr.length - 1));
      const refs = idx.map((i) => (pr[i] - 42.5) / 7.5).concat(idx.map((i) => (rr[i] - 3.4) / 0.4));
      return [(pm - 42.5) / 7.5, (rm - 3.4) / 0.4,
        clip((pm - pr[k + 1]) / pr[k + 1] * 20, -5, 5), clip((rm - rr[k + 1]) / rr[k + 1] * 20, -5, 5),
        ...refs,
        (o.x_tfv - 0.4) / 0.3, (o.x_tov - 0.3) / 0.2,
        (this.uPrev[0] - 0.4) / 0.3, (this.uPrev[1] - 0.3) / 0.2,
        (o.t_rc - 500) / 200, o.n_otp / 28000, o.n_ftp / 50000, (o.p_rc - 46) / 20, (o.m_tf + o.m_to) / 0.6];
    }
    obs() {
      const out = [];
      // float32, as the Python environment returns it, so exported networks see identical inputs.
      for (let i = this.frames.length - 1; i >= 0; i--) for (const v of this.frames[i]) out.push(Math.fround(clip(Math.fround(v), -10, 10)));
      return out;
    }
    get setpoint() { return [this.pref[this.k + 1], this.rref[this.k + 1]]; }
    get done() { return this.k >= this.nSteps; }
    step(u) {
      u = [clip(u[0], U_LOW[0], U_HIGH[0]), clip(u[1], U_LOW[1], U_HIGH[1])];
      const du = Math.abs(u[0] - this.uPrev[0]) + Math.abs(u[1] - this.uPrev[1]);
      this.uPrev = u;
      if (this.faults.length) {  // malfunctions change the engine from their onset on
        const t = this.k * this.dt, sig = this.faults.map((f) => severity(f, t)).join(",");
        if (sig !== this.faultSig) { this.faultSig = sig; this.p = this.model.p = engineParams(this.base, this.faults, t); }
      }
      this.model.command(u[0], u[1]);
      for (let q = 0; q < Math.round(this.dt / SUB); q++) {
        this.out = this.model.advance(SUB);
        this.hist.push([this.out.p_cc, this.out.rof]);
      }
      this.hist = this.hist.slice(-16);
      this.k += 1;
      const k = this.k, o = this.out;
      this.meas = this.measure();
      const eP = Math.abs(o.p_cc - this.pref[k]) / this.pref[k], eR = Math.abs(o.rof - this.rref[k]) / this.rref[k];
      const viol = violations(o);
      const nViol = Object.values(viol).filter(Boolean).length;
      const rTrack = (Math.exp(-this.delta * eP) - 1) + (Math.exp(-this.delta * eR) - 1);
      const reward = rTrack - this.beta * nViol - this.duWeight * du;
      this.frames = [this.frame()].concat(this.frames.slice(0, -1));
      return { t: k * this.dt, p_cc: o.p_cc, rof: o.rof, p_ref: this.pref[k], rof_ref: this.rref[k], x_tfv: o.x_tfv, x_tov: o.x_tov,
        u_tfv: u[0], u_tov: u[1], du, t_turbine: o.t_rc, t_lng: o.t_lng, n_otp: o.n_otp, n_ftp: o.n_ftp, p_rc: o.p_rc,
        m_turbines: o.m_tf + o.m_to, m_tf: o.m_tf, m_to: o.m_to, m_bpv: o.m_bpv, t_rc: o.t_rc, m_lox: o.m_lox, m_lng: o.m_lng, m_rc: o.m_rc, q_wall: o.q_wall, m_inj: o.m_inj,
        m_leak_o: o.m_leak_o, m_leak_f: o.m_leak_f,
        p_meas: this.meas[0], rof_meas: this.meas[1], violations: viol, n_viol: nViol, r_track: rTrack, reward };
    }
  }

  /* Malfunctions (faults.py): severity rises from 0 to 1 at t0 (or over ramp seconds) and scales mag. */
  function severity(f, t) {
    const t0 = f.t0 || 0, ramp = f.ramp || 0;
    if (t < t0 - 1e-9) return 0;
    if (ramp <= 0) return 1;
    return Math.min(1, (t - t0) / ramp);
  }
  function engineParams(base, faults, t) {
    const ch = {};
    for (const f of faults) {
      const s = severity(f, t);
      if (s <= 0) continue;
      const m = f.mag * s;
      switch (f.kind) {
        case "stuck_tfv": ch.stuck_tfv = 1; break;
        case "stuck_tov": ch.stuck_tov = 1; break;
        case "actuator_delay": ch.valve_delay = base.valve_delay + m; break;
        case "bearing_ftp": ch.drag_f = (base.drag_f || 0) + m; break;
        case "bearing_otp": ch.drag_o = (base.drag_o || 0) + m; break;
        case "leak_fuel": ch.leak_f = m; break;
        case "leak_lox": ch.leak_o = m; break;
        case "block_ft": ch.k_tfv = base.k_tfv * (1 - m); break;
        case "block_ot": ch.k_tov = base.k_tov * (1 - m); break;
        case "heat": ch.q_ref = base.q_ref * (1 + m); break;
        case "ageing": ch.a_tf = base.a_tf * (1 - m); ch.a_to = base.a_to * (1 - m); break;
        default: break;
      }
    }
    return Object.keys(ch).length ? Object.assign({}, base, ch) : base;
  }
  function sensorReading(faults, t, p, r, memo) {
    for (const f of faults) {
      const s = severity(f, t);
      if (s <= 0) continue;
      const m = f.mag;
      if (f.kind === "sensor_pcc_bias") p += m * s;
      else if (f.kind === "sensor_pcc_drift") p += m * Math.max(0, t - (f.t0 || 0));
      else if (f.kind === "sensor_pcc_frozen") { if (memo.p_cc === undefined) memo.p_cc = p; p = memo.p_cc; }
      else if (f.kind === "sensor_rof_gain") r *= 1 + m * s;
    }
    return [p, r];
  }

  /* PI gains for a closed-loop bandwidth per loop (SIMC, pi.py gains_for_bandwidth), and loop margins. */
  function piFromBandwidth(fP, fR, loops) {
    const out = {};
    for (const [f, lp, kpKey, kiKey] of [[fP, loops.p, "kp_p", "ki_p"], [fR, loops.rof, "kp_r", "ki_r"]]) {
      const lam = 1 / (2 * Math.PI * f);
      const kp = lp.tau / (lp.k * (lam + lp.theta)), ti = Math.min(lp.tau, 4 * (lam + lp.theta));
      out[kpKey] = kp; out[kiKey] = kp / ti;
    }
    return out;
  }
  function loopMargins(g, loops) {
    const res = {};
    for (const [name, kp, ki] of [["p", g.kp_p, g.ki_p], ["rof", g.kp_r, g.ki_r]]) {
      const lp = loops[name];
      // L(jw) = (kp + ki / jw) k e^{-jw theta} / (1 + jw tau), as magnitude and phase
      const mag = (w) => Math.hypot(kp, ki / w) * lp.k / Math.hypot(1, w * lp.tau);
      const phase = (w) => Math.atan2(-ki / w, kp) - w * lp.theta - Math.atan(w * lp.tau);
      let lo = 1e-3, hi = 1e3;
      for (let i = 0; i < 80; i++) { const mid = Math.sqrt(lo * hi); if (mag(mid) > 1) lo = mid; else hi = mid; }
      const wc = Math.sqrt(lo * hi);
      let pm = 180 + phase(wc) * 180 / Math.PI;
      pm = ((pm + 180) % 360 + 360) % 360 - 180;
      res[name] = { fc: wc / (2 * Math.PI), pm };
    }
    return res;
  }

  /* One of the challenge's test cases in miniature (scenarios.json, scenarios.py episode_options). */
  function scenarioOptions(sc, base, dt, horizon) {
    dt = dt || DT; horizon = horizon ?? 4;
    const prof = !sc.profile || sc.profile === "eval" ? evalProfile(dt, horizon) : profileFromKnots(sc.profile.knots, sc.profile.duration, dt, horizon);
    let params = base;
    const spec = sc.params || {};
    if (Object.keys(spec).length) {
      params = Object.assign({}, base);
      for (const [k, f] of Object.entries(spec.factors || {})) params[k] = base[k] * f;
      if (spec.valve_delay !== undefined) params.valve_delay = spec.valve_delay;
    }
    const o = { params, pref: prof.pref, rref: prof.rref, faults: (sc.faults || []).slice() };
    if (sc.delay) o.delay = Object.assign({}, sc.delay);
    return o;
  }

  function evalProfile(dt, horizon) {
    dt = dt || DT; horizon = horizon ?? 4;
    const knots = [[0, 40, 3.4], [5, 40, 3.4], [5.001, 45, 3.4], [10, 45, 3.4], [10.001, 45, 3.7], [15, 45, 3.7],
      [18, 50, 3.7], [22, 50, 3.7], [24, 50, 3.1], [27, 50, 3.1], [27.001, 38, 3.1], [33, 38, 3.1],
      [33.001, 38, 3.5], [36, 38, 3.5], [38, 35, 3.5], [60, 35, 3.5]];
    return profileFromKnots(knots, 40, dt, horizon);
  }

  function profileFromKnots(knots, duration, dt, horizon) {
    dt = dt || DT; horizon = horizon ?? 4;
    const n = Math.round(duration / dt) + horizon + 1;
    const pref = [], rref = [];
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      let j = 0;
      while (j < knots.length - 2 && knots[j + 1][0] < t) j++;
      const [t0, p0, r0] = knots[j], [t1, p1, r1] = knots[Math.min(j + 1, knots.length - 1)];
      const w = t1 > t0 ? clip((t - t0) / (t1 - t0), 0, 1) : 1;
      pref.push(p0 + w * (p1 - p0)); rref.push(r0 + w * (r1 - r0));
    }
    return { pref, rref };
  }

  root.LumenModel = { X_TFV, V_TFV, X_TOV, V_TOV, W_O, W_F, M_O, M_F, T_W, T_LNG, RPM, DT, DT_LEGACY, SUB, U_LOW, U_HIGH, LIMITS,
    severity, engineParams, sensorReading, piFromBandwidth, loopMargins, scenarioOptions,
    valveArea, cstarFactor, pumpDp, algebraic, derivatives, outputs, solve, steadyState, EngineModel, TrimTable,
    DecoupledPI, mlp, toValves, toAction, violations, rng, Episode, evalProfile, profileFromKnots };
})(typeof window !== "undefined" ? window : globalThis);
