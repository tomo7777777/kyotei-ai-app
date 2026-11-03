"""3連単 期待値狙い: AI確率 × 最終オッズ (walk-forward, 本当の朝 or 展示後)."""
import sys, json, glob, pickle, numpy as np
sys.path.insert(0, "backtest")
from payout_model import KEYS
KI = {k: j for j, k in enumerate(KEYS)}
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
L = {d["i"]: d for d in pickle.load(open("backtest/lane_data.pkl", "rb"))}
M = {d["i"]: d for d in pickle.load(open("backtest/morning_data.pkl", "rb"))}
key = {(m["date"], m["jcd"], int(m["rno"])): i for i, m in enumerate(meta)}
R = []; chk = []
for f in glob.glob("backtest/odds3_final/*.jsonl"):
    for l in open(f):
        o = json.loads(l)
        if o["n"] < 110: continue
        i = key.get((o["hd"], o["jcd"], int(o["rno"])))
        if i is None or i not in L or i not in M or M[i]["P0"] is None: continue
        od = np.array([o["odds3"].get(k, np.nan) for k in KEYS], float)
        y = KI.get(meta[i]["tri"], -1); pay = meta[i]["triPay"] or 0
        if y >= 0 and od[y] == od[y] and pay: chk.append(pay / 100 / od[y])
        R.append(dict(i=i, month=o["hd"][:6], date=o["hd"], od=od, y=y, pay=pay, Pm=L[i]["P"], Pe=M[i]["P0"]))
chk = np.array(chk); print("races", len(R), "払戻/最終オッズ 中央値", np.median(chk).round(3), "一致率(±3%)", np.mean(np.abs(chk - 1) < 0.03).round(3))
pickle.dump(R, open("/tmp/ev3_R.pkl", "wb"))
