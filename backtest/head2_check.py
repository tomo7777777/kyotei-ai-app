import pickle, sys, numpy as np, collections
sys.path.insert(0, "."); from payout_model import KEYS
exec(open("ashi_clogit.py").read().split("te = (mon")[0])
_, races = pickle.load(open("/tmp/ashi_ds.pkl", "rb")); races = sorted(races, key=lambda r: r["ri"])
base = np.exp(lq) / np.exp(lq).sum(1, keepdims=True)
ALL = sum(G.values(), [])
for nm, fe in [("全部", ALL), ("AI朝・今節なし", [c for c in ALL if c not in ("pf", "ser")])]:
    P = wf(fe, 200)
    for th in (0.85, 0.9):
        n = h1 = h12 = l1 = 0; mm = collections.defaultdict(lambda: [0, 0]); days = set()
        for i, r in enumerate(races):
            if mon[i] == min(mon) or np.isnan(P[i]).any() or (P[i] / base[i])[0] >= th: continue
            w1, w2 = int(r["tri"][0]), int(r["tri"][2]); pn = set(np.argsort(-np.where(np.arange(6) == 0, -1, P[i]))[:2] + 1)
            n += 1; h1 += w1 in pn; h12 += {w1, w2} == pn; l1 += w1 != 1; mm[mon[i]][0] += 1; mm[mon[i]][1] += w1 in pn; days.add(r["k"][0])
        print(nm, th, f"レース{n} 1日{n/len(days):.1f} 頭2艇のどちらかが1着{h1/n:.0%} 2艇で1・2着{h12/n:.0%} 1号艇負け{l1/n:.0%}", {m[4:]: f"{b/a:.0%}" for m, (a, b) in sorted(mm.items())})
