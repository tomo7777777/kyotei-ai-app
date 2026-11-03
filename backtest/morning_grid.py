import sys, pickle, numpy as np, lightgbm as lgb, json
sys.path.insert(0, "backtest")
from payout_model import race_matrix, combo_feats, KEYS, PERMS
D = pickle.load(open("backtest/morning_data.pkl", "rb")); X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb")); Xm = pickle.load(open("backtest/Xm.pkl", "rb"))
KI = {k: j for j, k in enumerate(KEYS)}
# morning-mode payout model (retrained with morning features)
months = np.array([m["date"][:6] for m in meta]); R, Y, M = [], [], []
for i, m in enumerate(meta):
    if not m["triPay"] or not m["tri"]: continue
    a, b, c = [int(x) - 1 for x in m["tri"].split("-")]; R.append(combo_feats(Xm[i], a, b, c)); Y.append(np.log(m["triPay"] / 100)); M.append(months[i])
R, Y, M = np.array(R, dtype=np.float32), np.array(Y), np.array(M)
p = dict(objective="regression", learning_rate=0.05, num_leaves=63, min_data_in_leaf=50, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, verbose=-1, num_threads=2)
pmm = lgb.train(p, lgb.Dataset(R[M < "202605"], Y[M < "202605"]), 3000, valid_sets=[lgb.Dataset(R[M == "202605"], Y[M == "202605"])], callbacks=[lgb.early_stopping(100, verbose=False)])
pmm.save_model("backtest/payout_model_morning.txt", num_iteration=pmm.best_iteration)
for d in D: d["est2"] = np.exp(pmm.predict(race_matrix(Xm[d["i"]]))).astype(np.float32)
pickle.dump(D, open("backtest/morning_data.pkl", "wb"))
print("payout morning model ready", flush=True)
def prep(ds, E, omin, n, rule):
    out = []
    for d in ds:
        e = d[E]; c = np.where(e >= omin)[0]
        if len(c) < n: out.append((None, 0.0, 0)); continue
        p = d["P"]; o = c[np.argsort(-(p[c] if rule == "p" else p[c] * np.sqrt(e[c])))][:n]
        y = KI.get(d["tri"]); out.append((o, float(p[o].sum()), d["pay"] if (y is not None and y in o) else 0))
    return out
A = [d for d in D if d["month"] < "202608"]; B = [d for d in D if d["month"] >= "202608"]
res = []
for E in ("est", "est2"):
    for omin in (30, 40, 50, 60, 80):
        for n in (5, 8, 10, 12):
            for rule in ("p", "ev"):
                pa, pb = prep(A, E, omin, n, rule), prep(B, E, omin, n, rule)
                sa = np.array([x[1] for x in pa if x[0] is not None])
                for q in (0.9, 0.95, 0.97):
                    th = np.quantile(sa, q)
                    def st(pp):
                        sel = [x for x in pp if x[0] is not None and x[1] >= th]; k = len(sel)
                        return k, (sum(x[2] for x in sel) / (k * 100 * n) if k else 0), (sum(1 for x in sel if x[2] > 0) / k if k else 0)
                    a, b = st(pa), st(pb)
                    res.append(dict(E=E, omin=omin, n=n, rule=rule, q=q, th=float(th), A=a, B=b))
json.dump(res, open("backtest/morning_grid.json", "w"))
res.sort(key=lambda r: -(r["A"][1] * r["A"][0] + r["B"][1] * r["B"][0]) / max(1, r["A"][0] + r["B"][0]))
for r in res[:25]: print(r["E"], r["omin"], r["n"], r["rule"], r["q"], "A", r["A"][0], round(r["A"][1], 3), round(r["A"][2], 3), "B", r["B"][0], round(r["B"][1], 3), round(r["B"][2], 3))
