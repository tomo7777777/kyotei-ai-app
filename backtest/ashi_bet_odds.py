import pickle, sys, numpy as np, collections
sys.path.insert(0, "."); from payout_model import KEYS
exec(open("ashi_clogit.py").read().split("te = (mon")[0])
_, races = pickle.load(open("/tmp/ashi_ds.pkl", "rb")); races = sorted(races, key=lambda r: r["ri"])
jc = np.array([r["k"][1] for r in races]); fst = np.array([int(c[0]) for c in KEYS])
base = np.exp(lq) / np.exp(lq).sum(1, keepdims=True); P = wf(sum(G.values(), []), 200)
def run(vs, N, sel, omin=0, synmin=0, show=False):
    inv = ret = n = hit = 0; mm = collections.defaultdict(lambda: [0, 0]); days = set(); lowp = []
    for i, r in enumerate(races):
        if jc[i] not in vs or mon[i] == min(mon) or np.isnan(P[i]).any(): continue
        ratio = P[i] / base[i]
        if sel and ratio[0] >= sel: continue
        p3 = r["q"] * ratio[fst - 1]; o = np.nan_to_num(r["o"], nan=0)
        sc = np.where((fst == 1) | (o < max(omin, 1)), -1, p3)
        idx = [j for j in np.argsort(-sc)[:N] if sc[j] > 0]
        if not idx: continue
        syn = 1 / sum(1 / o[j] for j in idx)
        if syn < synmin: continue
        picks = {KEYS[j] for j in idx}; lowp.append(np.mean([o[j] < 20 for j in idx]))
        h = r["tri"] in picks; g = r["pay"] if h else 0; n += 1; hit += h; inv += len(idx) * 100; ret += g; mm[mon[i]][0] += len(idx) * 100; mm[mon[i]][1] += g; days.add(r["k"][0])
    if n < 30: return None
    return f"レース{n} 1日{n/len(days):.1f} 平均{inv/n/100:.1f}点 的中{hit/n:.2f} 回収率{ret/inv:.3f} 20倍未満の目{np.mean(lowp):.0%} " + str({m[4:]: round(b / a, 2) for m, (a, b) in sorted(mm.items())})
for nm, vs in [("平和島", {"04"}), ("戸田・平和島", {"02", "04"}), ("6場", {"01", "02", "04", "12", "14", "22"})]:
    for sel in (0.9, None):
        for N in (10, 12):
            print(nm, "補正比<0.9" if sel else "全レース", N, "点 そのまま", run(vs, N, sel))
            for om in (10, 15, 20, 30):
                print("   ", f"{om}倍未満の目を外す", run(vs, N, sel, omin=om))
            for sm in (3, 5, 8):
                print("   ", f"合成オッズ{sm}倍未満のレースは見送り", run(vs, N, sel, synmin=sm))
