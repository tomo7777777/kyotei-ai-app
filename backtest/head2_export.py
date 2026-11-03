"""頭2艇モデル（市場＋船足・展示・スタート展示の条件付きロジット）を全期間で学習して server/head2_model.json に書き出す"""
import pickle, json, numpy as np
exec(open("ashi_clogit.py").read().split("te = (mon")[0])
ALL = sum(G.values(), [])
X = build(ALL); w, mu, sd = fit(X, ok, 200)
fill = {c: {int(l): float(v) for l, v in D.groupby("lane")[c].mean().fillna(0).items()} for c in ALL}
json.dump({"features": ALL, "groups": ["1", "2-3", "4-6"], "w": w.tolist(), "mu": mu.tolist(), "sd": sd.tolist(), "fill": fill, "threshold": 0.9,
           "note": "score = log(qf+1e-6) + ((x-mu)/sd)·w, x = 特徴量×枠グループ(1/2-3/4-6)。学習 6〜10月 6場"}, open("../server/head2_model.json", "w"), ensure_ascii=False, indent=1)
# アプリの計算と照合するための見本
smp = D[D.ri == D.ri.unique()[-1]][["ri", "lane"] + ALL + ["lq"]]
P = lq[-1] + ((X[-1] - mu) / sd) @ w; P = np.exp(P - P.max()); P /= P.sum()
print("見本 最後のレース", races_last := None, "補正後", P.round(4), "市場", (np.exp(lq[-1]) / np.exp(lq[-1]).sum()).round(4))
print("重み上位", sorted(zip(np.abs(w).round(3), [f"{c}@{g}" for g in ["1", "2-3", "4-6"] for c in ALL]), reverse=True)[:12])
