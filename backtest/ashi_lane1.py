import pickle, numpy as np
R = pickle.load(open("/tmp/ashiR.pkl", "rb"))
w1 = np.array([r["tri"][0] == "1" for r in R]); p1 = np.array([r["p1"] for r in R])
t1 = np.array([r["t"].get(1, np.nan) for r in R]); s1 = np.array([r["s"][1][0] for r in R]); n1 = np.array([r["s"][1][1] for r in R])
print("全体 1号艇勝率 %.3f AI予想 %.3f" % (w1.mean(), p1.mean()))
for lo, hi in [(0, .4), (.4, .5), (.5, .6), (.6, .7), (.7, 1)]:
    b = (p1 >= lo) & (p1 < hi); print(f"AI {lo}-{hi} n={b.sum()} 実際{w1[b].mean():.3f} AI{p1[b].mean():.3f}")
    for nm, c in [("今日足 上位(≤2.5)", t1 <= 2.5), ("今日足 中", (t1 > 2.5) & (t1 < 4)), ("今日足 下位(≥4)", t1 >= 4)]:
        bb = b & c; print(f"   {nm} n={bb.sum()} 実際{w1[bb].mean():.3f} AI{p1[bb].mean():.3f}")
    for nm, c in [("今節 上位", (n1 >= 2) & (s1 <= 2.5)), ("今節 下位", (n1 >= 2) & (s1 >= 4))]:
        bb = b & c; print(f"   {nm} n={bb.sum()} 実際{w1[bb].mean():.3f} AI{p1[bb].mean():.3f}")
