# Evaluate the production (hybrid) model exactly as implemented in server/model.ts
import importlib.util, json, math, sys, numpy as np
spec = importlib.util.spec_from_file_location("fit", "backtest/fit.py"); F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)
PA = F.PA; w0 = np.array(F.DEFAULT["w"]) * F.DEFAULT["scale"]
TUNE_DAYS = {"20261002", "20261003"}
BLEND, BLENDWIN = 0.9, 0.7
def win(x): z = np.zeros(6); np.add.at(z, PA[:, 0], x); return z
def hyb(d):
    p = F.probs(d, w0, 0.7, 0.55); mk = d["mk"]
    base = (1 - BLEND) * p + BLEND * mk
    Wb = win(base); Wt = (1 - BLENDWIN) * win(p) + BLENDWIN * win(mk)
    q = base * np.where(Wb > 0, Wt / np.where(Wb > 0, Wb, 1), 0)[PA[:, 0]]
    return q / q.sum(), p
def conf(d, q, p):
    order = np.argsort(-q); top6 = q[order[:6]].sum(); W = win(q)
    c = (0.55 * W.max() + 0.45 * top6) * 118
    c += 4 if (np.argmax(win(d["mk"])) == np.argmax(win(p)) == np.argmax(W)) else -6
    if np.all(d["X"][:, 4] == 0): c -= 3
    return float(np.clip(c, 5, 97))
def metrics(name, data, fn):
    ll3 = llw = h5 = fav = 0
    for d in data:
        q = fn(d); ll3 -= math.log(max(q[d["y"]], 1e-9)); W = win(q); llw -= math.log(max(W[PA[d["y"], 0]], 1e-9))
        h5 += d["y"] in np.argsort(-q)[:5]; fav += int(np.argmax(W) == PA[d["y"], 0])
    n = len(data); return dict(name=name, ll3=ll3 / n, llwin=llw / n, hit5=h5 / n, fav_win=fav / n)
def section(data):
    mets = [metrics("オッズ（市場）のみ", data, lambda d: d["mk"]),
            metrics("AIモデル単体", data, lambda d: F.probs(d, w0, 0.7, 0.55)),
            metrics("AI（本番：市場と合成）", data, lambda d: hyb(d)[0])]
    buckets = [(0, 50, "50未満"), (50, 62, "50〜61"), (62, 75, "62〜74"), (75, 101, "75以上")]
    B = {b[2]: dict(races=0, hit=0, stake=0, ret=0, favwin=0) for b in buckets}
    strat = {k: dict(bets=0, stake=0, ret=0) for k in ["top5_all", "top1_all", "value"]}
    for d in data:
        q, p = hyb(d); c = conf(d, q, p); lab = next(b[2] for b in buckets if b[0] <= c < b[1]); r = B[lab]
        sel = np.argsort(-q)[:5]; r["races"] += 1; r["stake"] += 500
        if d["y"] in sel: r["hit"] += 1; r["ret"] += d["pay"]
        r["favwin"] += int(np.argmax(win(q)) == PA[d["y"], 0])
        s = strat["top5_all"]; s["bets"] += 5; s["stake"] += 500; s["ret"] += d["pay"] if d["y"] in sel else 0
        s = strat["top1_all"]; s["bets"] += 1; s["stake"] += 100; s["ret"] += d["pay"] if d["y"] == sel[0] else 0
        mk = d["mk"]; vs = [i for i in np.argsort(-q) if q[i] >= 0.015 and mk[i] > 0 and q[i] / mk[i] >= 1.12 and i not in sel][:3]
        s = strat["value"]; s["bets"] += len(vs); s["stake"] += 100 * len(vs); s["ret"] += d["pay"] if d["y"] in vs else 0
    for s in strat.values(): s["roi"] = s["ret"] / s["stake"] if s["stake"] else None
    return dict(races=len(data), metrics=mets, buckets=B, strategies=strat)
oos = [d for d in F.D if d["id"][:8] not in TUNE_DAYS]
rep = dict(dates=sorted({d["id"][:8] for d in F.D}), tuneDays=sorted(TUNE_DAYS),
           all=section(F.D), oos=section(oos) if len(oos) >= 30 else None, blend=BLEND, blendWin=BLENDWIN)
json.dump(rep, open("backtest/report.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: (v["metrics"], v["buckets"], v["strategies"]) if isinstance(v, dict) and "metrics" in v else v for k, v in rep.items()}, ensure_ascii=False, indent=0)[:4000])
