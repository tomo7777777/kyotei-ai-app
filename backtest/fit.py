import json, itertools, math, sys
import numpy as np
from scipy.optimize import minimize

races = json.load(open("backtest/feats.json"))
PERMS = [p for p in itertools.permutations(range(1, 7), 3)]
KEYS = [f"{a}-{b}-{c}" for a, b, c in PERMS]
PA = np.array([[a - 1, b - 1, c - 1] for a, b, c in PERMS])

def prep(r):
    F = r["feats"]
    X = np.zeros((6, 7))
    for i, b in enumerate(F):
        X[i] = [b["dWr"], b["dLoc"], b["dM2"], b["dSt"], b["dEx"] if b["dEx"] is not None else 0.0,
                b["courseLR"] if b["courseLR"] is not None else 0.0, b["f"] if b["f"] >= 1 else 0]
    lp = np.log(np.array([[b["p1"], b["p12"], b["p123"]] for b in F]))
    odds = np.array([r["odds3"].get(k, 0.0) for k in KEYS])
    inv = np.where(odds > 0, 1 / np.where(odds > 0, odds, 1), 0)
    mk = inv / inv.sum() if inv.sum() > 0 else None
    y = KEYS.index(r["trifecta"]) if r["trifecta"] in KEYS else None
    return dict(X=X, lp=lp, odds=odds, mk=mk, y=y, pay=r["pay"], id=f'{r["hd"]}-{r["jcd"]}-{r["rno"]}')

D = [prep(r) for r in races]
D = [d for d in D if d["y"] is not None and d["mk"] is not None]
print("usable races", len(D))

def adj_of(X, w):
    # w: wWr,wLoc,wMotor,wSt,wEx,wCourse,wF ; same clipping as TS
    a = X[:, 0] * w[0] + X[:, 1] * w[1] + X[:, 2] * w[2]
    a += np.clip(X[:, 3] * w[3], -0.4, 0.4) + np.clip(X[:, 4] * w[4], -0.6, 0.6) + X[:, 5] * w[5] + X[:, 6] * w[6]
    return a

def probs(d, w, s2, s3):
    a = adj_of(d["X"], w)
    w1 = np.exp(d["lp"][:, 0] + a); w2 = np.exp(d["lp"][:, 1] + s2 * a); w3 = np.exp(d["lp"][:, 2] + s3 * a)
    i, j, k = PA[:, 0], PA[:, 1], PA[:, 2]
    S1 = w1.sum(); S2 = w2.sum(); S3 = w3.sum()
    p = (w1[i] / S1) * (w2[j] / (S2 - w2[i])) * (w3[k] / (S3 - w3[i] - w3[j]))
    return p

DEFAULT = dict(w=[0.45, 0.12, 0.012, -6, -4.5, 0.4, -0.08], scale=1.1, s2=0.7, s3=0.55)

TH0 = np.concatenate([np.array(DEFAULT["w"]) * DEFAULT["scale"], [DEFAULT["s2"], DEFAULT["s3"]]])
SC = np.array([0.3, 0.3, 0.02, 5, 4, 0.4, 0.2, 0.3, 0.3])
LAM = 0.01

def nll(theta, data):
    w = theta[:7]; s2, s3 = theta[7], theta[8]
    tot = LAM * len(data) * float(np.sum(((theta - TH0) / SC) ** 2))
    for d in data:
        p = probs(d, w, s2, s3)
        tot -= math.log(max(p[d["y"]], 1e-9))
    return tot / len(data)

def win_ll(p, d):
    win = np.zeros(6)
    np.add.at(win, PA[:, 0], p)
    return -math.log(max(win[PA[d["y"], 0]], 1e-9))

def evaluate(name, data, w, s2, s3, blend):
    ll3 = llw = 0; hit5 = 0; top1 = 0
    for d in data:
        p = probs(d, w, s2, s3)
        q = (1 - blend) * p + blend * d["mk"]
        ll3 -= math.log(max(q[d["y"]], 1e-9)); llw += win_ll(q, d)
        order = np.argsort(-q)
        hit5 += d["y"] in order[:5]
        win = np.zeros(6); np.add.at(win, PA[:, 0], q)
        top1 += int(np.argmax(win) == PA[d["y"], 0])
    n = len(data)
    return dict(name=name, ll3=ll3 / n, llwin=llw / n, hit5=hit5 / n, fav_win=top1 / n)

def strategies(data, w, s2, s3, blend, conf_fn=None):
    res = {}
    # A: buy every combo with EV >= th and prob >= 1.5%
    for th in [1.0, 1.1, 1.2, 1.3, 1.5]:
        stake = ret = n = 0
        for d in data:
            p = probs(d, w, s2, s3); q = (1 - blend) * p + blend * d["mk"]
            ev = q * d["odds"]
            sel = np.where((ev >= th) & (q >= 0.015) & (d["odds"] > 0))[0]
            stake += 100 * len(sel); n += len(sel)
            if d["y"] in sel: ret += d["pay"]
        res[f"EV>={th}"] = dict(bets=n, stake=stake, ret=ret, roi=(ret / stake if stake else None))
    # B: top5 by prob in each race
    stake = ret = 0
    for d in data:
        p = probs(d, w, s2, s3); q = (1 - blend) * p + blend * d["mk"]
        sel = np.argsort(-q)[:5]; stake += 500
        if d["y"] in sel: ret += d["pay"]
    res["top5_all"] = dict(stake=stake, ret=ret, roi=ret / stake)
    return res

if __name__ == "__main__":
    rng = np.random.default_rng(0)
    idx = rng.permutation(len(D)); half = len(D) // 2
    train = [D[i] for i in idx[:half]]; test = [D[i] for i in idx[half:]]
    w0 = np.array(DEFAULT["w"]) * DEFAULT["scale"]
    print("market only (test)", evaluate("market", test, w0, DEFAULT["s2"], DEFAULT["s3"], 1.0))
    for b in [0.0, 0.5]:
        print("current model blend", b, evaluate("cur", test, w0, DEFAULT["s2"], DEFAULT["s3"], b))
    th0 = np.concatenate([w0, [DEFAULT["s2"], DEFAULT["s3"]]])
    opt = minimize(nll, th0, args=(train,), method="Nelder-Mead", options=dict(maxiter=4000, xatol=1e-3, fatol=1e-5))
    th = opt.x; print("fitted", np.round(th, 4), "train nll", opt.fun)
    w, s2, s3 = th[:7], th[7], th[8]
    best = None
    for b in np.linspace(0, 1, 11):
        e = evaluate("fit", train, w, s2, s3, b)
        if best is None or e["ll3"] < best[1]["ll3"]: best = (b, e)
    blend = best[0]; print("best blend (train)", blend)
    for b in [0.0, blend, 1.0]:
        print("fitted model test blend", b, evaluate("fit", test, w, s2, s3, b))
    print("strategies test (fitted)", json.dumps(strategies(test, w, s2, s3, blend), ensure_ascii=False))
    print("strategies test (current)", json.dumps(strategies(test, w0, DEFAULT["s2"], DEFAULT["s3"], 0.5), ensure_ascii=False))
    # refit on all for production
    opt2 = minimize(nll, th, args=(D,), method="Nelder-Mead", options=dict(maxiter=3000, xatol=1e-3, fatol=1e-5))
    thA = opt2.x
    json.dump(dict(w=list(thA[:7]), s2=thA[7], s3=thA[8], blend=blend, n=len(D)), open("backtest/fitted.json", "w"))
    print("final", np.round(thA, 4))

    # ---------- report on held-out test half (fitted on train only) ----------
    def conf_of(d, q):
        win = np.zeros(6); np.add.at(win, PA[:, 0], q)
        top6 = np.sort(q)[::-1][:6].sum()
        c = (0.55 * win.max() + 0.45 * top6) * 118
        mw = np.zeros(6); np.add.at(mw, PA[:, 0], d["mk"])
        c += 4 if np.argmax(mw) == np.argmax(win) else -6
        if np.all(d["X"][:, 4] == 0): c -= 3
        return float(np.clip(c, 5, 97))
    buckets = [(0, 50, "50未満"), (50, 62, "50〜61"), (62, 75, "62〜74"), (75, 101, "75以上")]
    bres = {b[2]: dict(races=0, hit=0, stake=0, ret=0, favwin=0) for b in buckets}
    for d in test:
        p = probs(d, w, s2, s3); q = (1 - blend) * p + blend * d["mk"]
        c = conf_of(d, q)
        lab = next(b[2] for b in buckets if b[0] <= c < b[1])
        sel = np.argsort(-q)[:5]
        win = np.zeros(6); np.add.at(win, PA[:, 0], q)
        r = bres[lab]; r["races"] += 1; r["stake"] += 500
        if d["y"] in sel: r["hit"] += 1; r["ret"] += d["pay"]
        r["favwin"] += int(np.argmax(win) == PA[d["y"], 0])
    report = dict(
        races=len(D), test=len(test), dates=sorted({x["id"][:8] for x in D}),
        metrics=[evaluate("市場（オッズのみ）", test, w, s2, s3, 1.0), evaluate("旧モデル", test, w0, DEFAULT["s2"], DEFAULT["s3"], 0.5),
                 evaluate("新モデル（モデルのみ）", test, w, s2, s3, 0.0), evaluate("新モデル（市場と合成）", test, w, s2, s3, blend)],
        strategies=strategies(test, w, s2, s3, blend), buckets=bres, blend=blend,
        weights=dict(zip(["全国勝率", "当地勝率", "モーター", "スタート", "展示タイム", "コース実績", "F持ち"], [float(x) for x in thA[:7]])),
    )
    json.dump(report, open("backtest/report.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False, indent=1))
