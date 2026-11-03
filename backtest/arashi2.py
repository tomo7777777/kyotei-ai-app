import sys; sys.path.insert(0, "backtest")
import pickle, numpy as np
from arashi import X, meta, D, auc, fit, NAMES, FEATURES
yall = np.array([(m["triPay"] or 0) >= 10000 for m in meta]); dates = np.array([m["date"] for m in meta]); Mall = np.array([d[:6] for d in dates])
ok = np.array([bool(m["triPay"]) for m in meta])
# race-level engineered features in addition to flattened lanes
FI = {f: i for i, f in enumerate(FEATURES)}
def eng(Xi):
    g = lambda f: Xi[:, FI[f]]
    out = []
    for f in FEATURES:
        v = g(f); out += [v[0] - np.median(v[1:]), v[1:].max() - v[0]]
    return np.array(out, dtype=np.float32)
R = np.concatenate([X.reshape(len(X), -1), np.array([eng(x) for x in X])], 1).astype(np.float32)
pos = {d["i"]: k for k, d in enumerate(D)}
out = np.full(len(D), np.nan)
for m in ["202606", "202607", "202608", "202609", "202610"]:
    tr = ok & (Mall < m); te = ok & (Mall == m)
    cut = sorted(dates[tr])[int(tr.sum() * 0.85)]
    a = tr & (dates < cut); v = tr & (dates >= cut)
    mdl = fit(R[a], yall[a], R[v], yall[v]); p = mdl.predict(R[te], num_iteration=mdl.best_iteration)
    print(m, "iters", mdl.best_iteration, "AUC", round(auc(yall[te], p), 3), flush=True)
    for i, s in zip(np.where(te)[0], p):
        if i in pos: out[pos[i]] = s
k = ~np.isnan(out); yy = np.array([(d["pay"] or 0) >= 10000 for d in D])
print("AUC on D", round(auc(yy[k], out[k]), 3), "coverage", k.mean())
pickle.dump(dict(score=out), open("backtest/arashi_oos2.pkl", "wb"))
