"""Dataset exactly as seen in the morning: course = lane (進入不明), no exhibition, no wind/wave."""
import sys, pickle, copy, time, numpy as np
sys.path.insert(0, "backtest")
from fe import History
races = pickle.load(open("backtest/races.pkl", "rb")); WARM = races[0]["date"][:6]
H = History(); X, idx = [], []; t0 = time.time(); diff = 0
X0, FIN, meta, _ = pickle.load(open("backtest/ds_seq.pkl", "rb"))
key = {(m["date"], m["jcd"], m["rno"]): k for k, m in enumerate(meta)}
Xm = np.zeros_like(X0)
for n, r in enumerate(races):
    k = key.get((r["date"], r["jcd"], r["rno"]))
    if k is not None:
        q = dict(r)
        q["boats"] = [dict(b, course=b["lane"]) for b in r["boats"]]
        diff += any(b["course"] != b["lane"] for b in r["boats"])
        Xm[k] = H.feats(q).astype(np.float32)
    H.update(r)
    if n % 10000 == 0: print(n, round(time.time() - t0), "s", flush=True)
pickle.dump(Xm, open("backtest/Xe_lane.pkl", "wb"), protocol=4)
print("done; races with 進入変化", diff, "of", len(meta), flush=True)
