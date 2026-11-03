import sys, pickle, numpy as np, lightgbm as lgb, json
sys.path.insert(0, "backtest")
from payout_model import race_matrix, combo_feats, KEYS
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb")); XL = pickle.load(open("backtest/Xm_lane.pkl", "rb"))
out = pickle.load(open("backtest/seq_out_lane.pkl", "rb")); KI = {k: j for j, k in enumerate(KEYS)}
pm = lgb.Booster(model_file="backtest/payout_model.txt")
# payout model trained on lane features (what the morning actually sees)
months = np.array([m["date"][:6] for m in meta]); R, Y, M = [], [], []
for i, m in enumerate(meta):
    if not m["triPay"] or not m["tri"]: continue
    a, b, c = [int(x) - 1 for x in m["tri"].split("-")]; R.append(combo_feats(XL[i], a, b, c)); Y.append(np.log(m["triPay"] / 100)); M.append(months[i])
R, Y, M = np.array(R, dtype=np.float32), np.array(Y), np.array(M)
p = dict(objective="regression", learning_rate=0.05, num_leaves=63, min_data_in_leaf=50, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, verbose=-1, num_threads=2)
pml = lgb.train(p, lgb.Dataset(R[M < "202605"], Y[M < "202605"]), 3000, valid_sets=[lgb.Dataset(R[M == "202605"], Y[M == "202605"])], callbacks=[lgb.early_stopping(100, verbose=False)])
pml.save_model("backtest/payout_model_lane.txt", num_iteration=pml.best_iteration)
D = []
for fm, o in out.items():
    for k, i in enumerate(o["idx"]):
        i = int(i); rm = race_matrix(XL[i])
        D.append(dict(i=i, month=meta[i]["date"][:6], date=meta[i]["date"], P=o["P"][k].astype(np.float32), est=np.exp(pm.predict(rm)).astype(np.float32), est2=np.exp(pml.predict(rm)).astype(np.float32), tri=meta[i]["tri"], pay=meta[i]["triPay"] or 0))
pickle.dump(D, open("backtest/lane_data.pkl", "wb"))
print("races", len(D), flush=True)
