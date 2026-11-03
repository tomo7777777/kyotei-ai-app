"""Monthly retrain: rebuild dataset from all K/B files, retrain sequential models + payout model, refit history."""
import sys, os, pickle, json, datetime as dt, numpy as np
sys.path.insert(0, "backtest")
import parse_kb
import train_seq
if os.environ.get("SKIPBUILD"):
    X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
else:
    races = parse_kb.build(); pickle.dump(races, open("backtest/races.pkl", "wb")); print("races", len(races), races[-1]["date"], flush=True)
    if os.path.exists("backtest/ds_seq.pkl"): os.remove("backtest/ds_seq.pkl")
    X, FIN, meta, H = train_seq.build_dataset(); pickle.dump((X, FIN, meta, H), open("backtest/ds_seq.pkl", "wb"))
dates = np.array([m["date"] for m in meta]); last = dt.datetime.strptime(max(dates), "%Y%m%d")
cut = (last - dt.timedelta(days=28)).strftime("%Y%m%d")
tr = dates < cut; va = dates >= cut
m1, m2, m3 = train_seq.fit_models(X, FIN, tr, va)
for i, m in enumerate((m1, m2, m3), 1): m.save_model(f"backtest/seq_m{i}.new.txt", num_iteration=m.best_iteration)
# payout model
import lightgbm as lgb
from payout_model import combo_feats
R, Y, D = [], [], []
for i, mm in enumerate(meta):
    if not mm["triPay"] or not mm["tri"]: continue
    a, b, c = [int(x) - 1 for x in mm["tri"].split("-")]; R.append(combo_feats(X[i], a, b, c)); Y.append(np.log(mm["triPay"] / 100)); D.append(mm["date"])
R, Y, D = np.array(R, dtype=np.float32), np.array(Y), np.array(D)
p = dict(objective="regression", learning_rate=0.05, num_leaves=63, min_data_in_leaf=50, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, verbose=-1, num_threads=2)
pm = lgb.train(p, lgb.Dataset(R[D < cut], Y[D < cut]), 3000, valid_sets=[lgb.Dataset(R[D >= cut], Y[D >= cut])], callbacks=[lgb.early_stopping(100, verbose=False)])
pm.save_model("backtest/payout_model.new.txt", num_iteration=pm.best_iteration)
pickle.dump(H, open("backtest/history.new.pkl", "wb"))
for a, b in [("seq_m1", "txt"), ("seq_m2", "txt"), ("seq_m3", "txt"), ("payout_model", "txt"), ("history", "pkl")]:
    os.replace(f"backtest/{a}.new.{b}", f"backtest/{a}.{b}")
json.dump(dict(at=dt.datetime.utcnow().isoformat(), dataTo=max(dates), trainTo=cut, races=int(len(meta)), iters=[m1.best_iteration, m2.best_iteration, m3.best_iteration]), open("backtest/retrain.json", "w"))
os.system("python3 backtest/arashi_prod.py")
os.system("python3 backtest/morning_train.py")
print("retrained", max(dates), cut, flush=True)
