import sys; sys.path.insert(0, "backtest")
import pickle, json, itertools, numpy as np, lightgbm as lgb
from payout_model import race_matrix, KEYS
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb")); out = pickle.load(open("backtest/seq_out.pkl", "rb"))
pm = lgb.Booster(model_file="backtest/payout_model.txt")
try:
    D = pickle.load(open("backtest/manshu_data.pkl", "rb"))
except Exception:
    D = []
    for fm, o in out.items():
        for k, i in enumerate(o["idx"]):
            D.append(dict(i=int(i), month=meta[i]["date"][:6], P=o["P"][k].astype(np.float32), est=np.exp(pm.predict(race_matrix(X[i]))).astype(np.float32), tri=meta[i]["tri"], pay=meta[i]["triPay"]))
    pickle.dump(D, open("backtest/manshu_data.pkl", "wb"))
print("races", len(D), "万舟率", np.mean([(d["pay"] or 0) >= 10000 for d in D]))
KI = {k: j for j, k in enumerate(KEYS)}
def picks(d, omin, rule):
    cand = np.where(d["est"] >= omin)[0]
    if rule == "p": order = cand[np.argsort(-d["P"][cand])]
    else: order = cand[np.argsort(-(d["P"][cand] * d["est"][cand]))]
    return order[:10]
def evaluate(ds, omin, rule, smin):
    n = st = ret = hit = man = 0
    for d in ds:
        sel = picks(d, omin, rule)
        if len(sel) < 10: continue
        score = d["P"][sel].sum()
        if score < smin: continue
        n += 1; st += 1000
        y = KI.get(d["tri"])
        if y is not None and y in sel: ret += d["pay"]; hit += 1; man += d["pay"] >= 10000
    return dict(races=n, roi=ret / st if st else 0, hit=hit / n if n else 0, man=man / n if n else 0)
A = [d for d in D if d["month"] < "202608"]; B = [d for d in D if d["month"] >= "202608"]
res = []
for omin in (80, 100, 150):
    for rule in ("p", "ev"):
        scores = np.array([d["P"][picks(d, omin, rule)].sum() for d in A])
        for q in (0, 0.5, 0.8, 0.9, 0.95):
            smin = float(np.quantile(scores, q)) if q else 0
            a, b = evaluate(A, omin, rule, smin), evaluate(B, omin, rule, smin)
            res.append(dict(omin=omin, rule=rule, q=q, smin=smin, A=a, B=b))
            print(omin, rule, q, round(smin, 4), "A", a["races"], round(a["roi"], 3), round(a["hit"], 3), "B", b["races"], round(b["roi"], 3), round(b["hit"], 3), flush=True)
json.dump(res, open("backtest/manshu_grid.json", "w"))
