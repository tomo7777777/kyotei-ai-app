import pickle, numpy as np, itertools, json, sys
R = pickle.load(open("/tmp/ev3_R.pkl", "rb"))
months = sorted({r["month"] for r in R}); half = lambda r: r["month"] < "202608"
pre = []
for r in R:
    od = np.nan_to_num(r["od"], nan=0.0); ok = od > 0
    inv = np.where(ok, 1 / np.where(ok, od, 1), 0); q = inv / inv.sum()
    pre.append((r, od, ok, q))
res = []
for src, w, t, pmin, cap in itertools.product(("Pm", "Px"), (1.0, 0.7, 0.5, 0.3), (1.0, 1.2, 1.5, 2.0), (0.0, 0.01, 0.02, 0.04), (9999, 100, 50)):
    agg = {}
    for r, od, ok, q in pre:
        P = r[src]; mix = w * P + (1 - w) * q; ev = mix * od
        sel = np.where(ok & (ev >= t) & (mix >= pmin) & (od <= cap))[0]
        if not len(sel): continue
        a = agg.setdefault(r["month"], [0, 0, 0, 0]); a[0] += len(sel); a[1] += r["pay"] if r["y"] in sel else 0; a[2] += r["y"] in sel; a[3] += 1
    tot = np.array([agg.get(m, [0, 0, 0, 0]) for m in months], float)
    if tot[:, 0].sum() < 200: continue
    roi = lambda rows: rows[:, 1].sum() / max(1, rows[:, 0].sum() * 100)
    A = tot[[m < "202608" for m in months]]; B = tot[[m >= "202608" for m in months]]
    res.append(dict(src=src, w=w, t=t, pmin=pmin, cap=cap, bets=int(tot[:, 0].sum()), races=int(tot[:, 3].sum()), hits=int(tot[:, 2].sum()), roi=roi(tot), A=roi(A) if len(A) else None, B=roi(B) if len(B) else None, mon=[round(x[1] / max(1, x[0] * 100), 2) for x in tot]))
json.dump(res, open("/tmp/ev3_grid.json", "w"))
print("configs", len(res), "months", months)
for k in ("A", "B", "roi"):
    pass
res.sort(key=lambda r: -r["roi"])
for r in res[:15]: print(r)
