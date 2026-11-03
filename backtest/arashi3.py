import sys; sys.path.insert(0, "backtest")
import pickle, json, glob, numpy as np, lightgbm as lgb
from arashi import X, meta, D, auc, pfeat
sc = pickle.load(open("backtest/arashi_oos2.pkl", "rb"))["score"]
od = {}
for f in glob.glob("backtest/odds_final/*.jsonl"):
    for l in open(f):
        r = json.loads(l); od[(r["date"], r["jcd"], int(r["rno"]))] = r
def mfeat(r):
    t = np.array([r["tan"].get(str(l)) or 0 for l in range(1, 7)], float)
    if (t <= 0).any(): return None
    q = 1 / t; q /= q.sum()
    ex = np.array([v for v in r.get("ex", {}).values() if v], float)
    exq = (1 / ex) / (1 / ex).sum() if len(ex) else np.ones(1)
    return np.array([q[0], q.max(), np.sort(q)[-2], -(q * np.log(q)).sum(), np.argmax(q), exq.max(), -(exq * np.log(exq)).sum(), ex.min() if len(ex) else 0], np.float32)
rows = []
for k, d in enumerate(D):
    m = meta[d["i"]]; r = od.get((m["date"], m["jcd"], int(m["rno"])))
    if r is None or np.isnan(sc[k]): continue
    f = mfeat(r)
    if f is None: continue
    rows.append((k, m["date"], np.concatenate([[sc[k]], pfeat(d["P"], d["est"]), f]), (d["pay"] or 0) >= 10000))
K = np.array([r[0] for r in rows]); Dt = np.array([r[1] for r in rows]); R = np.array([r[2] for r in rows]); y = np.array([r[3] for r in rows])
print("rows", len(rows))
print("AUC arashi only", round(auc(y, R[:, 0]), 3), "AUC market 1号艇 prob (neg)", round(auc(y, -R[:, 9]), 3), "AUC market entropy", round(auc(y, R[:, 12]), 3), "ex entropy", round(auc(y, R[:, 15]), 3))
P = dict(objective="binary", learning_rate=0.03, num_leaves=15, min_data_in_leaf=100, feature_fraction=0.8, verbose=-1, num_threads=4)
out = np.full(len(y), np.nan); M = np.array([d[:6] for d in Dt])
for m in ["202609", "202610"]:
    tr = M < m; te = M == m
    mdl = lgb.train(P, lgb.Dataset(R[tr], y[tr]), 250)
    out[te] = mdl.predict(R[te]); print(m, "combined AUC", round(auc(y[te], out[te]), 3), "arashi only", round(auc(y[te], R[te, 0]), 3))
# CV both halves for coverage
mdl = lgb.train(P, lgb.Dataset(R[M >= "202609"], y[M >= "202609"]), 250); out[M == "202608"] = mdl.predict(R[M == "202608"])
print("all AUC combined", round(auc(y, out), 3))
pickle.dump(dict(K=K, score=out, y=y, M=M), open("backtest/arashi_mkt.pkl", "wb"))
