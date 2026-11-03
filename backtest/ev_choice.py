import json, numpy as np, pickle, os, sys
exec(open("backtest/ev_final.py").read().split("res = []")[0].replace("SPLIT = sys.argv[1] if len(sys.argv) > 1 else \"20260910\"", "SPLIT = \"20260910\""))
RULES = [dict(key="tan", bt="単勝", w=0.5, th=1.5, pmin=0.0, label="単勝：AIと単勝オッズの合成確率×オッズが1.5以上"),
         dict(key="qu", bt="2連複", w=0.7, th=2.0, pmin=0.05, label="2連複：合成確率5%以上かつ合成確率×オッズが2.0以上"),
         dict(key="tan_ai", bt="単勝", w=1.0, th=1.5, pmin=0.05, label="単勝：AI単体の確率×オッズが1.5以上（参考）")]
def bets(ds, bt, th, w, pmin):
    out = []
    for r, o in ds:
        od = o[BT[bt]]
        if not od: continue
        mk = mkt(o, BT[bt]); pm = r["probs"][bt]
        for c, v in od.items():
            p = w * pm.get(c, 0) + (1 - w) * mk.get(c, 0)
            if p >= pmin and p * v >= th: out.append((r["pays"][bt].get(c, 0) or 0) / 100)
    return np.array(out)
rng = np.random.default_rng(0); res = []
for R in RULES:
    row = dict(R)
    for nm, ds in (("A", A), ("B", B), ("all", data)):
        g = bets(ds, R["bt"], R["th"], R["w"], R["pmin"])
        bs = [rng.choice(g, len(g)).mean() for _ in range(2000)] if len(g) else [0]
        row[nm] = dict(bets=int(len(g)), roi=float(g.mean()) if len(g) else 0, hit=float((g > 0).mean()) if len(g) else 0, lo=float(np.percentile(bs, 5)), hi=float(np.percentile(bs, 95)), perRace=len(g) / len(ds))
    res.append(row); print(R["label"], {k: (row[k]["bets"], round(row[k]["roi"], 2), round(row[k]["lo"], 2), round(row[k]["hi"], 2)) for k in ("A", "B", "all")})
json.dump(dict(rules=res, races=len(data), from_=data[0][0]["date"], to=data[-1][0]["date"], split="20260910"), open("backtest/ev_choice.json", "w"), ensure_ascii=False, indent=1)
