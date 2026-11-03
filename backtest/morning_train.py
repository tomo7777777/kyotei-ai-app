"""Train the 'morning' sequential models (no exhibition time / wind / wave). Used for 中穴 morning plan."""
import sys, os, pickle, datetime as dt, numpy as np
sys.path.insert(0, "backtest")
import train_seq as T
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
# morning features exactly as seen live: course = lane (進入不明), no exhibition, no wind/wave
os.system("python3 backtest/build_morning_ds.py")
X = pickle.load(open("backtest/Xm_lane.pkl", "rb"))
dates = np.array([m["date"] for m in meta]); last = dt.datetime.strptime(max(dates), "%Y%m%d")
cut = (last - dt.timedelta(days=28)).strftime("%Y%m%d"); tr = dates < cut; va = dates >= cut
m1, m2, m3 = T.fit_models(X, FIN, tr, va)
for i, m in enumerate((m1, m2, m3), 1): m.save_model(f"backtest/seq_morning_m{i}.new.txt", num_iteration=m.best_iteration)
for i in (1, 2, 3): os.replace(f"backtest/seq_morning_m{i}.new.txt", f"backtest/seq_morning_m{i}.txt")
print("morning models saved", max(dates), flush=True)
