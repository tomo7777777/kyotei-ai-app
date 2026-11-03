import sys; sys.path.insert(0, "backtest")
import pickle, json, numpy as np
from train_seq import fit_models
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
months = np.array([m["date"][:6] for m in meta])
tr = months < "202609"; va = months >= "202609"
m1, m2, m3 = fit_models(X, FIN, tr, va)
for i, m in enumerate((m1, m2, m3), 1): m.save_model(f"backtest/seq_m{i}.txt", num_iteration=m.best_iteration)
pickle.dump(H, open("backtest/history.pkl", "wb"))
print("saved", m1.best_iteration, m2.best_iteration, m3.best_iteration)
