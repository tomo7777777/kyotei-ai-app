"""EV-filter strategies on final odds (単勝/2連単/2連複) with out-of-sample model probs."""
import pickle, json, os, sys, numpy as np
rows = pickle.load(open("backtest/roi_rows.pkl", "rb"))
odds = {}
for f in os.listdir("backtest/odds_final"):
    for line in open(f"backtest/odds_final/{f}"):
        d = json.loads(line); odds[(d["date"], d["jcd"], d["rno"])] = d
X = []
for r in rows:
    key = (r["date"], r["jcd"], None)
for r in rows: pass
# rows lack rno -> rebuild index from meta
import sys as _s; _s.path.insert(0, "backtest")
X_, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb")); out = pickle.load(open("backtest/seq_out.pkl", "rb"))
idx = [i for fm in out for i in out[fm]["idx"]]
assert len(idx) == len(rows)
data = []
for r, i in zip(rows, idx):
    m = meta[i]; o = odds.get((m["date"], m["jcd"], m["rno"]))
    if o: data.append((r, o))
data.sort(key=lambda x: x[0]["date"])
SPLIT = sys.argv[1] if len(sys.argv) > 1 else "20260910"
A = [d for d in data if d[0]["date"] <= SPLIT]; B = [d for d in data if d[0]["date"] > SPLIT]
print("races with odds", len(data), "A", len(A), "B", len(B))
BT = {"単勝": "tan", "2連単": "ex", "2連複": "qu"}
def mkt(o, k):
    od = o[k]; inv = {c: 1 / v for c, v in od.items() if v > 0}; s = sum(inv.values()); return {c: v / s for c, v in inv.items()}
def run(ds, bt, th, w, pmin=0.0, omax=1e9):
    st = ret = n = hit = 0
    for r, o in ds:
        od = o[BT[bt]]
        if not od: continue
        mk = mkt(o, BT[bt]); pm = r["probs"][bt]
        for c, v in od.items():
            p = w * pm.get(c, 0) + (1 - w) * mk.get(c, 0)
            if p < pmin or v > omax: continue
            if p * v >= th:
                st += 100; n += 1; g = r["pays"][bt].get(c, 0) or 0; ret += g; hit += g > 0
    return dict(bets=n, roi=ret / st if st else 0, hit=hit / n if n else 0)
res = []
for bt in BT:
    for w in (1.0, 0.7, 0.5):
        for th in (1.0, 1.1, 1.2, 1.35, 1.5, 1.75, 2.0):
            for pmin in (0.0, 0.05, 0.15, 0.3):
                a = run(A, bt, th, w, pmin)
                if a["bets"] < 150: continue
                res.append(dict(bt=bt, w=w, th=th, pmin=pmin, A=a, B=run(B, bt, th, w, pmin)))
res.sort(key=lambda x: -x["A"]["roi"])
for x in res[:25]: print(x["bt"], "w", x["w"], "th", x["th"], "pmin", x["pmin"], "A", x["A"]["bets"], round(x["A"]["roi"], 3), "B", x["B"]["bets"], round(x["B"]["roi"], 3), "hitB", round(x["B"]["hit"], 3))
json.dump(res, open("backtest/ev_final.json", "w"), ensure_ascii=False)
