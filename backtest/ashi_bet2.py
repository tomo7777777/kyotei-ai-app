import pickle, sys, numpy as np, collections
sys.path.insert(0, "."); from payout_model import KEYS
exec(open("ashi_clogit.py").read().split("te = (mon")[0])  # 関数だけ読み込み
_, races = pickle.load(open("/tmp/ashi_ds.pkl", "rb")); races = sorted(races, key=lambda r: r["ri"])
fst = np.array([int(c[0]) for c in KEYS])
res = {}
for nm, fe in [("スタート展示", G["スタート展示"]), ("全部", sum(G.values(), []))]:
    P = wf(fe, 200); base = np.exp(lq) / np.exp(lq).sum(1, keepdims=True)
    for N in (10, 15):
        for sel in ("1号艇補正<40%", "1号艇の補正比<0.85", "全レース"):
            for how in ("確率順(1頭なし)", "期待値順"):
                inv = ret = n = 0; mon_ = collections.defaultdict(lambda: [0, 0])
                for i, r in enumerate(races):
                    if mon[i] == min(mon) or np.isnan(P[i]).any(): continue
                    ratio = P[i] / base[i]
                    if sel == "1号艇補正<40%" and P[i][0] >= .4: continue
                    if sel == "1号艇の補正比<0.85" and ratio[0] >= .85: continue
                    p3 = r["q"] * ratio[fst - 1]; o = np.nan_to_num(r["o"], nan=0)
                    sc = np.where(fst == 1, -1, p3) if how.startswith("確率") else p3 * o
                    idx = np.argsort(-sc)[:N]; picks = {KEYS[j] for j in idx}
                    g = r["pay"] if r["tri"] in picks else 0; n += 1; inv += N * 100; ret += g; mon_[mon[i]][0] += N * 100; mon_[mon[i]][1] += g
                if n: print(nm, N, "点", sel, how, "レース", n, "回収率", round(ret / inv, 3), {m: round(b / a, 2) for m, (a, b) in sorted(mon_.items())})
