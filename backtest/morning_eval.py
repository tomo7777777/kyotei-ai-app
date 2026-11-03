import sys, pickle, itertools, numpy as np, lightgbm as lgb
sys.path.insert(0, "backtest")
from payout_model import race_matrix, KEYS
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb")); Xm = pickle.load(open("backtest/Xm.pkl", "rb"))
out = pickle.load(open("backtest/seq_out_morning.pkl", "rb")); D0 = {d["i"]: d for d in pickle.load(open("backtest/manshu_data.pkl", "rb"))}
pm = lgb.Booster(model_file="backtest/payout_model.txt"); KI = {k: j for j, k in enumerate(KEYS)}
D = []
for fm, o in out.items():
    for k, i in enumerate(o["idx"]):
        i = int(i)
        D.append(dict(i=i, month=meta[i]["date"][:6], date=meta[i]["date"], P=o["P"][k].astype(np.float32), est=np.exp(pm.predict(race_matrix(Xm[i]))).astype(np.float32),
                      tri=meta[i]["tri"], pay=meta[i]["triPay"] or 0, P0=D0[i]["P"] if i in D0 else None, est0=D0[i]["est"] if i in D0 else None))
pickle.dump(D, open("backtest/morning_data.pkl", "wb"))
print("races", len(D))
def run(ds, P, E, omin, n, smin, rule="p"):
    st = ret = hit = races = 0
    for d in ds:
        p, e = d[P], d[E]; c = np.where(e >= omin)[0]
        if len(c) < n: continue
        o = c[np.argsort(-(p[c] if rule == "p" else p[c] * e[c]))][:n]
        if p[o].sum() < smin: continue
        races += 1; st += 100 * n; y = KI.get(d["tri"])
        if y is not None and y in o: ret += d["pay"]; hit += 1
    return races, (ret / st if st else 0), (hit / races if races else 0)
def thr(ds, P, E, omin, n, q, rule="p"):
    s = []
    for d in ds:
        p, e = d[P], d[E]; c = np.where(e >= omin)[0]
        if len(c) < n: continue
        o = c[np.argsort(-(p[c] if rule == "p" else p[c] * e[c]))][:n]; s.append(p[o].sum())
    return float(np.quantile(s, q))
days = sorted({d["date"] for d in D}); print("days", len(days))
print("== 現行の10点（40倍以上・上位5%）")
D = [d for d in D if d["P0"] is not None]
for name, P, E in (("展示あり(検証値)", "P0", "est0"), ("朝一モード", "P", "est")):
    s = thr(D, P, E, 40, 10, 0.95); r = run(D, P, E, 40, 10, s)
    A = [d for d in D if d["month"] < "202608"]; B = [d for d in D if d["month"] >= "202608"]
    print(name, "全体 races %d ROI %.3f hit %.3f" % r, "| Jun-Jul ROI %.3f | Aug- ROI %.3f" % (run(A, P, E, 40, 10, s)[1], run(B, P, E, 40, 10, s)[1]))
