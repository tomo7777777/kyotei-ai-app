import json, itertools, math, sys
import numpy as np
from scipy.optimize import minimize
races = json.load(open("backtest/feats.json"))
PERMS = list(itertools.permutations(range(6), 3)); KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]
A = np.array([p[0] for p in PERMS]); Bi = np.array([p[1] for p in PERMS]); C = np.array([p[2] for p in PERMS])
NAMES = ["全国勝率","全国2連率","当地勝率","モーター2連率","ボート2連率","コース別ST","展示タイム","展示1位","展示ST","コース1着実績","コース3連対実績","コース別ST順","A1級","B級","F持ち","今節平均着順","体重","チルト","風速×1コース","波高×1コース","前付け","年齢"]
rows = []
for r in races:
    odds = np.array([r["odds3"].get(k, 0.0) for k in KEYS])
    if (odds > 0).sum() < 60 or r["trifecta"] not in KEYS: continue
    inv = np.where(odds > 0, 1 / np.where(odds > 0, odds, 1), 0); mk = inv / inv.sum()
    rows.append(dict(day=r["hd"], X=np.array(r["X"], float), LM=np.log(np.maximum(mk, 1e-6)), mk=mk, odds=odds, y=KEYS.index(r["trifecta"]), pay=r["pay"]))
N = len(rows); K = len(NAMES)
X = np.stack([d["X"] for d in rows]); LM = np.stack([d["LM"] for d in rows]); Y = np.array([d["y"] for d in rows])
days = np.array([d["day"] for d in rows]); ODDS = np.stack([d["odds"] for d in rows]); PAY = np.array([d["pay"] for d in rows]); MK = np.stack([d["mk"] for d in rows])
SD = X.reshape(-1, K).std(0) + 1e-9
Xs = X / SD  # standardized
print("races", N, "days", sorted(set(days)))

def design(Xs, s2, s3):
    return Xs[:, A, :] + s2 * Xs[:, Bi, :] + s3 * Xs[:, C, :]  # N x 120 x K

def fit(Phi, LM, Y, lam):
    n = len(Y)
    def f(th):
        beta, g = th[0], th[1:]
        z = beta * LM + Phi @ g
        zm = z.max(1, keepdims=True); lse = zm[:, 0] + np.log(np.exp(z - zm).sum(1))
        nll = (lse - z[np.arange(n), Y]).sum() / n + lam * (g @ g) + lam * (beta - 1) ** 2
        p = np.exp(z - lse[:, None])
        gb = ((p * LM).sum(1) - LM[np.arange(n), Y]).sum() / n + 2 * lam * (beta - 1)
        gg = (np.einsum("nj,njk->k", p, Phi) - Phi[np.arange(n), Y].sum(0)) / n + 2 * lam * g
        return nll, np.concatenate([[gb], gg])
    th0 = np.zeros(Phi.shape[2] + 1); th0[0] = 1
    return minimize(f, th0, jac=True, method="L-BFGS-B").x

def predict(Phi, LM, th):
    z = th[0] * LM + Phi @ th[1:]; z -= z.max(1, keepdims=True); p = np.exp(z); return p / p.sum(1, keepdims=True)

def scores(P, idx):
    y = Y[idx]; n = len(idx)
    ll3 = -np.log(np.maximum(P[np.arange(n), y], 1e-9)).mean()
    W = np.zeros((n, 6)); np.add.at(W, (np.repeat(np.arange(n), 120), np.tile(A, n)), P.ravel())
    yw = A[y]; llw = -np.log(np.maximum(W[np.arange(n), yw], 1e-9)).mean()
    fav = (W.argmax(1) == yw).mean(); top5 = np.argsort(-P, 1)[:, :5]; h5 = (top5 == y[:, None]).any(1).mean()
    return dict(ll3=ll3, llwin=llw, fav_win=fav, hit5=h5)

def cv(s2, s3, lam, feat_mask=None):
    Phi = design(Xs if feat_mask is None else Xs[:, :, feat_mask], s2, s3)
    P = np.zeros((N, 120))
    for dday in sorted(set(days)):
        tr = days != dday; te = ~tr
        th = fit(Phi[tr], LM[tr], Y[tr], lam); P[te] = predict(Phi[te], LM[te], th)
    return P

if __name__ == "__main__":
    allidx = np.arange(N)
    print("market", scores(MK, allidx))
    best = None
    for s2 in [0.4, 0.7]:
        for s3 in [0.2, 0.45]:
            for lam in [0.001, 0.003, 0.01, 0.03]:
                P = cv(s2, s3, lam); sc = scores(P, allidx)
                print(s2, s3, lam, {k: round(v, 4) for k, v in sc.items()})
                if best is None or sc["ll3"] < best[0]["ll3"]: best = (sc, s2, s3, lam, P)
    sc, s2, s3, lam, P = best
    print("BEST", s2, s3, lam, sc)
    th = fit(design(Xs, s2, s3), LM, Y, lam)
    gamma = th[1:] / SD
    print("beta", th[0]); [print(f"  {n}: {g:+.3f} (std {gs:+.3f})") for n, g, gs in zip(NAMES, gamma, th[1:])]
    json.dump(dict(beta=float(th[0]), s2=s2, s3=s3, gamma=[float(x) for x in gamma], names=NAMES, lam=lam, n=N), open("backtest/model_v2.json", "w"), ensure_ascii=False)
    np.save("backtest/cv_probs.npy", P)
