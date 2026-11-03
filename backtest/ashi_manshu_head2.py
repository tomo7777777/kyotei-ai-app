import pickle, sys, numpy as np, pandas as pd, collections
sys.path.insert(0, "."); from payout_model import KEYS
exec(open("ashi_clogit.py").read().split("te = (mon")[0])
_, races = pickle.load(open("/tmp/ashi_ds.pkl", "rb")); races = sorted(races, key=lambda r: r["ri"])
jc = np.array([r["k"][1] for r in races]); fst = np.array([int(c[0]) for c in KEYS])
base = np.exp(lq) / np.exp(lq).sum(1, keepdims=True); P = wf(sum(G.values(), []), 200)
DD = D.set_index(["ri", "lane"])
rows = []
for i, r in enumerate(races):
    if mon[i] == min(mon) or np.isnan(P[i]).any(): continue
    o = np.nan_to_num(r["o"], nan=0); ratio = P[i] / base[i]
    mq = r["q"][o >= 100].sum()  # 市場が見る万舟の確率
    d = DD.loc[r["ri"]]
    rows.append(dict(i=i, jcd=jc[i], month=mon[i], man=int(r["pay"] >= 10000), mq=mq, sel=ratio[0] < 0.9, p1=P[i][0],
        wind=d.wind.iloc[0], st1=d.st.loc[1], stsd=d.st.std(), st_out_min=d.st.loc[2:6].min() - d.st.loc[1], ex1r=d.exr.loc[1], comv=(d.comv != 0).sum(),
        turn1=d.turn.loc[1], str1=d.straight.loc[1], lap1=d.lap.loc[1], outer=d.qf.loc[4:6].sum(), b1=d.ser.loc[1], ex_sd=d.exd.std()))
X = pd.DataFrame(rows)
print("全体 万舟率", round(X.man.mean(), 3), "選んだレース", round(X[X.sel].man.mean(), 3), "n", X.sel.sum())
X["mqb"] = pd.cut(X.mq, [0, .1, .15, .2, .25, .3, .4, 1])
print("市場が見る万舟確率ごと（全6場）\n", X.groupby("mqb", observed=True).agg(n=("man", "size"), 実際=("man", "mean"), 市場=("mq", "mean")).round(3))
print("選んだレース内\n", X[X.sel].groupby("mqb", observed=True).agg(n=("man", "size"), 実際=("man", "mean"), 市場=("mq", "mean")).round(3))
# 市場の見立てより万舟が出やすい条件（実際 − 市場）
S = X[X.sel]
def gap(df, nm):
    if len(df) >= 25: print(f"  {nm}: n={len(df)} 万舟率{df.man.mean():.0%} 市場{df.mq.mean():.0%} 差{df.man.mean()-df.mq.mean():+.0%}")
for nm, df in [("全6場", X), ("選んだレース", S)]:
    print("==", nm)
    gap(df[df.wind >= 5], "風5m以上"); gap(df[df.wind <= 2], "風2m以下")
    gap(df[df.st1 >= df.st.quantile(.75) if False else df.st1 >= 0.18], "1号艇のスタート展示0.18以上")
    gap(df[df.st_out_min <= -0.08], "外の艇が1号艇より0.08以上早い展示ST")
    gap(df[df.comv >= 2], "展示で進入が動いた")
    gap(df[df.ex1r >= 4], "1号艇の展示タイム4位以下")
    gap(df[df.turn1 > 0.1], "1号艇のまわり足が平均より遅い")
    gap(df[df.str1 > 0.05], "1号艇の直線が平均より遅い")
    gap(df[df.outer >= 0.25], "4〜6号艇の1着率合計25%以上（市場）")
    gap(df[df.ex_sd >= df.ex_sd.quantile(.75)], "展示タイムのばらつき大")
    gap(df[df.mq >= .3], "市場の万舟確率30%以上")
    for j, v in {"01": "桐生", "02": "戸田", "04": "平和島", "12": "住之江", "14": "鳴門", "22": "福岡"}.items(): gap(df[df.jcd == j], v)
pickle.dump(X, open("/tmp/manX.pkl", "wb"))
# 頭2艇
print("== 頭2艇")
for nm, vs in [("平和島", {"04"}), ("戸田・平和島", {"02", "04"}), ("6場", {"01", "02", "04", "12", "14", "22"})]:
    for sel in (0.9, None):
        c = collections.Counter(); n = 0
        for i, r in enumerate(races):
            if jc[i] not in vs or mon[i] == min(mon) or np.isnan(P[i]).any(): continue
            if sel and (P[i] / base[i])[0] >= sel: continue
            n += 1; w1, w2 = int(r["tri"][0]), int(r["tri"][2])
            pn = np.argsort(-np.where(np.arange(6) == 0, -1, P[i]))[:2] + 1; pa = np.argsort(-P[i])[:2] + 1
            c["1号艇なし: 2艇のどちらかが1着"] += w1 in pn; c["1号艇なし: 2艇で1・2着"] += {w1, w2} == set(pn)
            c["1号艇なし: 2艇のどちらかが2着以内"] += bool({w1, w2} & set(pn))
            c["1号艇も含む: 2艇のどちらかが1着"] += w1 in pa; c["1号艇も含む: 2艇で1・2着"] += {w1, w2} == set(pa)
        print(nm, "補正比<0.9" if sel else "全レース", n, {k: f"{v/n:.0%}" for k, v in c.items()})
