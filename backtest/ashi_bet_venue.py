import pickle, sys, numpy as np, collections
sys.path.insert(0, "."); from payout_model import KEYS
exec(open("ashi_clogit.py").read().split("te = (mon")[0])
_, races = pickle.load(open("/tmp/ashi_ds.pkl", "rb")); races = sorted(races, key=lambda r: r["ri"])
VN = {"01": "桐生", "02": "戸田", "04": "平和島", "12": "住之江", "14": "鳴門", "22": "福岡"}
jc = np.array([r["k"][1] for r in races]); fst = np.array([int(c[0]) for c in KEYS])
for j in VN:
    s = jc == j; print(VN[j], "レース", s.sum(), "1号艇勝率", round(y[s][:, 0].mean(), 3), "6月のみ", round(y[s & (mon == "202606")][:, 0].mean(), 3))
base = np.exp(lq) / np.exp(lq).sum(1, keepdims=True)
PS = {"市場のみ": base, "スタート展示": wf(G["スタート展示"], 200), "全部": wf(sum(G.values(), []), 200)}
AI = {"市場のみ": None}
for vs_nm, vs in [("戸田・平和島", {"02", "04"}), ("戸田・平和島・桐生", {"01", "02", "04"}), ("戸田", {"02"}), ("平和島", {"04"})]:
    for nm, P in PS.items():
        for N in (10, 12, 15):
            for sel in ("全レース", "1号艇<45%", "1号艇の補正比<0.9"):
                if nm == "市場のみ" and sel == "1号艇の補正比<0.9": continue
                inv = ret = n = hit = 0; mm = collections.defaultdict(lambda: [0, 0]); days = set()
                for i, r in enumerate(races):
                    if jc[i] not in vs or mon[i] == min(mon) or np.isnan(P[i]).any(): continue
                    ratio = P[i] / base[i]
                    if sel == "1号艇<45%" and P[i][0] >= .45: continue
                    if sel == "1号艇の補正比<0.9" and ratio[0] >= .9: continue
                    p3 = r["q"] * ratio[fst - 1]; sc = np.where(fst == 1, -1, p3)
                    picks = {KEYS[j] for j in np.argsort(-sc)[:N]}
                    h = r["tri"] in picks; g = r["pay"] if h else 0; n += 1; hit += h; inv += N * 100; ret += g; mm[mon[i]][0] += N * 100; mm[mon[i]][1] += g; days.add(r["k"][0])
                if n >= 30: print(vs_nm, nm, N, "点", sel, "レース", n, f"1日{n/len(days):.1f}", "的中", round(hit / n, 2), "回収率", round(ret / inv, 3), {m[4:]: round(b / a, 2) for m, (a, b) in sorted(mm.items())})
