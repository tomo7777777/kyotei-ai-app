import sys; sys.path.insert(0, "backtest")
import pickle, itertools, json, numpy as np
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb")); out = pickle.load(open("backtest/seq_out.pkl", "rb"))
PERMS = list(itertools.permutations(range(6), 3)); PA = np.array(PERMS)
KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]
EX = [f"{a+1}-{b+1}" for a, b in itertools.permutations(range(6), 2)]
QU = [f"{a+1}-{b+1}" for a, b in itertools.combinations(range(6), 2)]
TR = [f"{a+1}-{b+1}-{c+1}" for a, b, c in itertools.combinations(range(6), 3)]
rows = []
for fm, o in out.items():
    for k, i in enumerate(o["idx"]):
        P = o["P"][k]; m = meta[i]
        tan = np.zeros(6); np.add.at(tan, PA[:, 0], P)
        ex = {}; qu = {}; tr = {}
        for (a, b, c), p in zip(PERMS, P):
            ex[f"{a+1}-{b+1}"] = ex.get(f"{a+1}-{b+1}", 0) + p
            q = "-".join(str(x + 1) for x in sorted((a, b))); qu[q] = qu.get(q, 0) + p  # not exact (2連複 = top2 unordered)
            t = "-".join(str(x + 1) for x in sorted((a, b, c))); tr[t] = tr.get(t, 0) + p
        qu = {}
        for (a, b), p in [((int(k_[0]) - 1, int(k_[2]) - 1), v) for k_, v in ex.items()]:
            q = "-".join(str(x + 1) for x in sorted((a, b))); qu[q] = qu.get(q, 0) + p
        win_lane = int(np.argmin(FIN[i])) + 1
        pays = {"3連単": {m["tri"]: m["triPay"]} if m["tri"] else {}, "単勝": {str(win_lane): m.get("win1Pay")} if m.get("win1Pay") else {}}
        for bt in ("2連単", "2連複", "3連複"):
            pays[bt] = {c: p for c, p, pop in m["pay"].get(bt, [])}
        pops = {bt: {c: pop for c, p, pop in m["pay"].get(bt, [])} for bt in ("2連単", "2連複", "3連複")}; pops["3連単"] = {m["tri"]: m["triPop"]}
        probs = {"3連単": dict(zip(KEYS, P)), "2連単": ex, "2連複": qu, "3連複": tr, "単勝": {str(j + 1): tan[j] for j in range(6)}}
        rows.append(dict(month=m["date"][:6], date=m["date"], jcd=m["jcd"], probs=probs, pays=pays, pops=pops))
print("test races", len(rows))
def run(rs, bt, k, t):
    stake = ret = n = hit = 0
    for r in rs:
        pr = sorted(r["probs"][bt].items(), key=lambda kv: -kv[1])
        if pr[0][1] < t: continue
        sel = [c for c, _ in pr[:k]]; n += 1; stake += 100 * k
        g = sum(r["pays"][bt].get(c, 0) or 0 for c in sel); ret += g; hit += g > 0
    return dict(races=n, stake=stake, ret=ret, roi=ret / stake if stake else None, hit=hit / n if n else None)
def pop1(rs, bt):
    n = len(rs); ret = sum(sum(p for c, p in r["pays"][bt].items() if r["pops"][bt].get(c) == 1) for r in rs)
    return dict(races=n, roi=ret / (100 * n))
A = [r for r in rows if r["month"] in ("202606", "202607")]; B = [r for r in rows if r["month"] >= "202608"]
grid = {"単勝": [1, 2], "2連単": [1, 2, 3, 5], "2連複": [1, 2, 3], "3連複": [1, 2, 3, 5], "3連単": [1, 2, 3, 5, 10]}
res = {"pop1": {bt: dict(A=pop1(A, bt), B=pop1(B, bt)) for bt in ("2連単", "2連複", "3連複", "3連単")}, "grid": []}
for bt, ks in grid.items():
    tops = np.array([max(r["probs"][bt].values()) for r in A])
    for k in ks:
        for q in [0, 0.5, 0.75, 0.9, 0.95]:
            t = float(np.quantile(tops, q)) if q > 0 else 0
            ra, rb = run(A, bt, k, t), run(B, bt, k, t)
            res["grid"].append(dict(bt=bt, k=k, q=q, t=t, A=ra, B=rb))
res["grid"].sort(key=lambda g: -(g["A"]["roi"] or 0))
for g in res["grid"][:15]: print(g["bt"], g["k"], g["q"], round(g["t"], 3), "A", round(g["A"]["roi"], 3), g["A"]["races"], "B", round(g["B"]["roi"], 3), g["B"]["races"])
print("pop1", {bt: (round(v["A"]["roi"], 3), round(v["B"]["roi"], 3)) for bt, v in res["pop1"].items()})
for bt in grid: print(bt, "all k=1", run(rows, bt, 1, 0))
pickle.dump(rows, open("backtest/roi_rows.pkl", "wb")); json.dump(res, open("backtest/roi.json", "w"), ensure_ascii=False, default=float)
