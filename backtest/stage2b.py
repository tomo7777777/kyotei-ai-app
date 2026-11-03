"""Combine fundamental model (LightGBM+PL) with market odds; leave-one-day-out CV on races with final odds."""
import json, pickle, itertools, math, sys
import numpy as np
from scipy.optimize import minimize
S = np.load("backtest/scores3.npy"); meta = pickle.load(open("backtest/meta.pkl", "rb")); M = json.load(open("backtest/lgb3_meta.json"))
k = M["a"]
PERMS = list(itertools.permutations(range(6), 3)); A = np.array([p[0] for p in PERMS]); B_ = np.array([p[1] for p in PERMS]); C = np.array([p[2] for p in PERMS])
KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]
def pl(S, a):
    s1, s2, s3 = S[..., 0], S[..., 1], S[..., 2]
    e1 = np.exp(a[0] * s1); e2 = np.exp(a[1] * s2 + a[3] * s1); e3 = np.exp(a[2] * s3 + a[4] * s1)
    p = e1[:, A] / e1.sum(1, keepdims=True)
    p = p * e2[:, B_] / (e2.sum(1, keepdims=True) - e2[:, A])
    return p * e3[:, C] / (e3.sum(1, keepdims=True) - e3[:, A] - e3[:, B_])
idx = {(m[0], m[1], m[2]): i for i, m in enumerate(meta)}
odds_races = json.load(open("backtest/feats.json"))
rows = []
for r in odds_races:
    i = idx.get((r["hd"], r["jcd"], int(r["rno"])))
    odds = np.array([r["odds3"].get(kk, 0.0) for kk in KEYS])
    if i is None or (odds > 0).sum() < 60 or r["trifecta"] not in KEYS: continue
    inv = np.where(odds > 0, 1 / np.where(odds > 0, odds, 1), 0)
    rows.append((r["hd"], i, inv / inv.sum(), odds, KEYS.index(r["trifecta"]), r["pay"]))
print("matched odds races", len(rows), "of", len(odds_races))
days = np.array([x[0] for x in rows]); MK = np.stack([x[2] for x in rows]); ODDS = np.stack([x[3] for x in rows]); Y = np.array([x[4] for x in rows]); PAY = np.array([x[5] for x in rows])
PM = pl(S[[x[1] for x in rows]], k)
LM, LP = np.log(np.maximum(MK, 1e-6)), np.log(np.maximum(PM, 1e-9))
n = len(Y)
def comb(th, ii): z = th[0] * LM[ii] + th[1] * LP[ii]; z -= z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)
def nll(th, ii): p = comb(th, ii); return -np.log(np.maximum(p[np.arange(len(ii)), Y[ii]], 1e-12)).mean()
def sc(P, ii):
    y = Y[ii]; m = len(ii)
    W = np.zeros((m, 6)); np.add.at(W, (np.repeat(np.arange(m), 120), np.tile(A, m)), P.ravel())
    return dict(ll3=float(-np.log(np.maximum(P[np.arange(m), y], 1e-12)).mean()), llwin=float(-np.log(np.maximum(W[np.arange(m), A[y]], 1e-12)).mean()),
                fav_win=float((W.argmax(1) == A[y]).mean()), hit5=float((np.argsort(-P, 1)[:, :5] == y[:, None]).any(1).mean()))
allii = np.arange(n)
res = dict(market=sc(MK, allii), model=sc(PM, allii))
P = np.zeros_like(MK); ths = {}
for d in sorted(set(days)):
    tr = np.where(days != d)[0]; te = np.where(days == d)[0]
    th = minimize(nll, [1.0, 0.0], args=(tr,), method="Nelder-Mead").x; ths[d] = list(th); P[te] = comb(th, te)
res["combined_cv"] = sc(P, allii); res["thetas"] = ths
res["per_day"] = {d: dict(n=int((days == d).sum()), market=sc(MK[days == d], np.where(days == d)[0])["ll3"], combined=sc(P[days == d], np.where(days == d)[0])["ll3"], model=sc(PM[days == d], np.where(days == d)[0])["ll3"]) for d in sorted(set(days))}
thA = minimize(nll, [1.0, 0.0], args=(allii,), method="Nelder-Mead").x; res["theta_all"] = list(thA)
print(json.dumps(res, indent=1, default=float))
json.dump(res, open("backtest/stage2b.json", "w"), default=float)
np.save("backtest/stage2b_P.npy", P); pickle.dump(dict(days=days, Y=Y, PAY=PAY, ODDS=ODDS, MK=MK, PM=PM), open("backtest/stage2b_data.pkl", "wb"))
