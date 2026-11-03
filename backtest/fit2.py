# Benter-style: q ∝ market^beta * exp(adj_a + s2*adj_b + s3*adj_c)
import json, math, numpy as np
from scipy.optimize import minimize
import importlib.util, sys
spec = importlib.util.spec_from_file_location("fit", "backtest/fit.py"); F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)
D, PA, adj_of = F.D, F.PA, F.adj_of

def q_of(d, th):
    beta, w, s2, s3 = th[0], th[1:8], th[8], th[9]
    a = adj_of(d["X"], w)
    lm = np.log(np.maximum(d["mk"], 1e-6))
    z = beta * lm + a[PA[:, 0]] + s2 * a[PA[:, 1]] + s3 * a[PA[:, 2]]
    z -= z.max(); e = np.exp(z); return e / e.sum()

SC = np.array([0.3, 0.3, 0.3, 0.02, 5, 4, 0.4, 0.2, 0.5, 0.5])
TH0 = np.array([1.0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.3])
def nll(th, data, lam):
    t = lam * len(data) * float(np.sum(((th - TH0) / SC) ** 2))
    for d in data: t -= math.log(max(q_of(d, th)[d["y"]], 1e-9))
    return t / len(data)

def ev(data, th):
    ll3 = llw = hit5 = fav = 0
    for d in data:
        q = q_of(d, th); ll3 -= math.log(max(q[d["y"]], 1e-9))
        win = np.zeros(6); np.add.at(win, PA[:, 0], q); llw -= math.log(max(win[PA[d["y"], 0]], 1e-9))
        hit5 += d["y"] in np.argsort(-q)[:5]; fav += int(np.argmax(win) == PA[d["y"], 0])
    n = len(data); return dict(ll3=ll3 / n, llwin=llw / n, hit5=hit5 / n, fav_win=fav / n)

def strat(data, th):
    out = {}
    for t in [1.0, 1.1, 1.2, 1.3, 1.5]:
        st = rt = n = 0
        for d in data:
            q = q_of(d, th); e = q * d["odds"]; sel = np.where((e >= t) & (q >= 0.015) & (d["odds"] > 0))[0]
            st += 100 * len(sel); n += len(sel); rt += d["pay"] if d["y"] in sel else 0
        out[f"EV>={t}"] = dict(bets=n, stake=st, ret=rt, roi=rt / st if st else None)
    st = rt = 0
    for d in data:
        q = q_of(d, th); st += 500; rt += d["pay"] if d["y"] in np.argsort(-q)[:5] else 0
    out["top5_all"] = dict(stake=st, ret=rt, roi=rt / st); return out

if __name__ == "__main__" and "simple" not in sys.argv:
    rng = np.random.default_rng(0); idx = rng.permutation(len(D)); h = len(D) // 2
    tr = [D[i] for i in idx[:h]]; te = [D[i] for i in idx[h:]]
    print("market test", ev(te, TH0 * np.array([1,0,0,0,0,0,0,0,1,1])))
    for lam in [0.003, 0.01, 0.03]:
        o = minimize(nll, TH0, args=(tr, lam), method="Powell", options=dict(maxiter=6000, xtol=1e-3, ftol=1e-6))
        print("lam", lam, np.round(o.x, 3), "test", ev(te, o.x))
    # 2-fold CV both directions for chosen lam

def run_simple():
    # few params: beta, k (scale on old adj), s2, s3
    rng = np.random.default_rng(0); idx = rng.permutation(len(D)); h = len(D) // 2
    folds = [([D[i] for i in idx[:h]], [D[i] for i in idx[h:]]), ([D[i] for i in idx[h:]], [D[i] for i in idx[:h]])]
    w0 = np.array(F.DEFAULT["w"]) * F.DEFAULT["scale"]
    def mk(p): return np.concatenate([[p[0]], w0 * p[1], [p[2], p[3]]])
    res = []
    for tr, te in folds:
        o = minimize(lambda p: nll(mk(p), tr, 0.0), [1, 0.5, 0.5, 0.3], method="Powell", options=dict(xtol=1e-3, ftol=1e-6))
        m = ev(te, mk([1, 0, 0, 0])); r = ev(te, mk(o.x))
        print("fold params", np.round(o.x, 3), "market", m, "benter", r)
        res.append((o.x, m, r, strat(te, mk(o.x))))
    o = minimize(lambda p: nll(mk(p), D, 0.0), [1, 0.5, 0.5, 0.3], method="Powell", options=dict(xtol=1e-3, ftol=1e-6))
    print("all", np.round(o.x, 3))
    return res, o.x, mk

if __name__ == "__main__" and "simple" in sys.argv:
    res, p, mk = run_simple()
    for r in res: print(json.dumps(r[3]))
