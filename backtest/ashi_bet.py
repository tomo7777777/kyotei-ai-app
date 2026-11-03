import pickle, numpy as np, sys, collections
sys.path.insert(0, "."); from payout_model import KEYS
R = pickle.load(open("/tmp/ashiR.pkl", "rb"))
fst = np.array([int(c[0]) for c in KEYS])
def run(sel, N, no1=True, rank="P"):
    inv = ret = n = hit = 0; mon = collections.defaultdict(lambda: [0, 0]); days = collections.defaultdict(lambda: [0, 0])
    for r in R:
        if not sel(r): continue
        P = r["P"].copy()
        if no1: P[fst == 1] = -1
        if rank == "ashi":  # 足の良い艇を頭に
            t = np.array([r["t"].get(l, 3.5) for l in range(1, 7)]); P = np.where(P > 0, P * np.exp(-0.4 * (t[fst - 1] - 3.5)), P)
        idx = np.argsort(-P)[:N]; picks = {KEYS[i] for i in idx}
        n += 1; inv += N * 100; h = r["tri"] in picks; hit += h; g = r["pay"] if h else 0; ret += g
        mon[r["month"]][0] += N * 100; mon[r["month"]][1] += g; days[r["k"][0]][0] += N * 100; days[r["k"][0]][1] += g
    if not n: return None
    return dict(n=n, hit=round(hit / n, 3), roi=round(ret / inv, 3), mon={m: round(b / a, 2) for m, (a, b) in sorted(mon.items())}, perday=round(n / len(days), 1), dayplus=round(np.mean([b >= a for a, b in days.values()]), 2))
t1 = lambda r: r["t"].get(1, np.nan); s1 = lambda r: r["s"][1][0] if r["s"][1][1] >= 2 else np.nan
CAND = {
 "AI1号艇<40%": lambda r: r["p1"] < .4,
 "AI1号艇<50%": lambda r: r["p1"] < .5,
 "1号艇の今日の足4位以下": lambda r: t1(r) >= 4,
 "1号艇の今日の足4位以下かつAI<60%": lambda r: t1(r) >= 4 and r["p1"] < .6,
 "1号艇の今日の足4位以下かつ今節も4位以下": lambda r: t1(r) >= 4 and s1(r) >= 4,
 "1号艇の今節4位以下かつAI<50%": lambda r: s1(r) >= 4 and r["p1"] < .5,
 "全レース": lambda r: True,
}
for nm, f in CAND.items():
    for N in (10, 12, 15):
        for rk in ("P", "ashi"):
            o = run(f, N, rank=rk)
            if o: print(nm, N, "点", "足で並べ替え" if rk == "ashi" else "AI順", o)
