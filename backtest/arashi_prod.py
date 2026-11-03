import sys; sys.path.insert(0, "backtest")
import pickle, json, numpy as np, lightgbm as lgb
from arashi_feat import arashi_row
from payout_model import KEYS
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
ok = np.array([bool(m["triPay"]) for m in meta]); y = np.array([(m["triPay"] or 0) >= 10000 for m in meta]); dates = np.array([m["date"] for m in meta])
R = np.array([arashi_row(x) for x in X])
cut = sorted(dates[ok])[int(ok.sum() * 0.85)]
P = dict(objective="binary", learning_rate=0.03, num_leaves=31, min_data_in_leaf=100, feature_fraction=0.5, bagging_fraction=0.8, bagging_freq=1, lambda_l2=5, verbose=-1, num_threads=4)
a = ok & (dates < cut); v = ok & (dates >= cut)
m = lgb.train(P, lgb.Dataset(R[a], y[a]), 3000, valid_sets=[lgb.Dataset(R[v], y[v])], callbacks=[lgb.early_stopping(150, verbose=False)])
m2 = lgb.train(P, lgb.Dataset(R[ok], y[ok]), m.best_iteration)
m2.save_model("backtest/arashi_model.txt")
# calibration: empirical CDFs of current pick score and OOS arashi score on the backtest period
D = pickle.load(open("backtest/manshu_data.pkl", "rb")); A2 = pickle.load(open("backtest/arashi_oos2.pkl", "rb"))["score"]
cur = np.array([d["P"][np.where(d["est"] >= 80)[0][np.argsort(-d["P"][np.where(d["est"] >= 80)[0]])][:10]].sum() for d in D])
q = np.linspace(0, 1, 1001)
comb = 0.7 * (np.searchsorted(np.sort(cur), cur) / len(cur)) + 0.3 * (np.searchsorted(np.sort(A2), A2) / len(A2))
json.dump(dict(cur=np.quantile(cur, q).tolist(), ara=np.quantile(A2, q).tolist(), S=float(np.quantile(comb, 0.97)), A=float(np.quantile(comb, 0.94))), open("backtest/arashi_cal.json", "w"))
print("iters", m.best_iteration, "S", np.quantile(comb, 0.97), "A", np.quantile(comb, 0.94))
