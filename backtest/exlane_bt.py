"""Morning-mode walk-forward: exhibition time / wind / wave unavailable (as in the 6am plan)."""
import sys, pickle, time, numpy as np
sys.path.insert(0, "backtest")
import train_seq as T
from fe import FEATURES
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
FI = T.FI
Xm = pickle.load(open("backtest/Xe_lane.pkl", "rb"))
months = np.array([m["date"][:6] for m in meta]); t0 = time.time(); out = {}
for fm in ["202606", "202607", "202608", "202609"]:
    y, m = int(fm[:4]), int(fm[4:]); vm = f"{y if m > 1 else y - 1}{(m - 1) if m > 1 else 12:02d}"
    tr = months < vm; va = months == vm; te = (months == fm) if fm != "202609" else (months >= "202609")
    m1, m2, m3 = T.fit_models(Xm, FIN, tr, va)
    P = np.stack([T.race_probs(Xm[i], m1, m2, m3) for i in np.where(te)[0]])
    out[fm] = dict(idx=np.where(te)[0], P=P)
    print(fm, te.sum(), round(time.time() - t0), "s", flush=True)
    pickle.dump(out, open("backtest/seq_out_exlane.pkl", "wb"))
print("done", flush=True)
