import pickle, json, numpy as np
rows = pickle.load(open("backtest/roi_rows.pkl", "rb"))
def ev(filter_fn, bt, k=1):
    out = {}
    for per, rs in (("A", [r for r in rows if r["month"] < "202608"]), ("B", [r for r in rows if r["month"] >= "202608"]), ("all", rows)):
        n = st = ret = hit = 0
        for r in rs:
            pr = sorted(r["probs"][bt].items(), key=lambda kv: -kv[1])
            if not filter_fn(pr): continue
            sel = [c for c, _ in pr[:k]]; n += 1; st += 100 * k; g = sum(r["pays"][bt].get(c, 0) or 0 for c in sel); ret += g; hit += g > 0
        out[per] = dict(races=n, roi=ret / st if st else None, hit=hit / n if n else None)
    return out
S = {
  "tan_top": dict(label="単勝 AI本命", bt="単勝", k=1, res=ev(lambda pr: True, "単勝")),
  "tan_non1": dict(label="単勝 AI本命（1号艇以外）", bt="単勝", k=1, res=ev(lambda pr: pr[0][0] != "1", "単勝")),
  "tan_1": dict(label="単勝 AI本命（1号艇）", bt="単勝", k=1, res=ev(lambda pr: pr[0][0] == "1", "単勝")),
  "q2_conf": dict(label="2連複 上位2点（AI確率62%以上）", bt="2連複", k=2, res=ev(lambda pr: pr[0][1] >= 0.62, "2連複", 2)),
  "q_top": dict(label="2連複 AI本命", bt="2連複", k=1, res=ev(lambda pr: True, "2連複")),
  "ex_top": dict(label="2連単 AI本命", bt="2連単", k=1, res=ev(lambda pr: True, "2連単")),
  "tf_top": dict(label="3連複 AI本命", bt="3連複", k=1, res=ev(lambda pr: True, "3連複")),
  "t_top": dict(label="3連単 AI本命", bt="3連単", k=1, res=ev(lambda pr: True, "3連単")),
  "t_top5": dict(label="3連単 上位5点", bt="3連単", k=5, res=ev(lambda pr: True, "3連単", 5)),
}
roi = json.load(open("backtest/roi.json"))
pop = {bt: dict(A=v["A"]["roi"], B=v["B"]["roi"]) for bt, v in roi["pop1"].items()}
json.dump(dict(strategies=S, pop1=pop, races=len(rows), months=sorted({r["month"] for r in rows})), open("backtest/strategy.json", "w"), ensure_ascii=False, indent=1)
for k, v in S.items(): print(v["label"], {p: (x["races"], round(x["roi"], 3), round(x["hit"], 3)) for p, x in v["res"].items()})
print(pop)
