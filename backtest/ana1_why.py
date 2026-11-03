"""1号艇が人気なのに負けたレースは何が違ったか（本番のスタート・進入・展示・足・選手・風）"""
import numpy as np, pickle, collections
exec(open("ana1_eval.py").read().split("def run(")[0])
RR = {(r["date"], r["jcd"], int(r["rno"])): r for r in pickle.load(open("races.pkl", "rb")) if r["date"] >= "20260601"}
sel = [i for i in idx if base[i][0] >= 0.5 and races[i]["k"] in RR]
rows = []
for i in sel:
    rr = RR[races[i]["k"]]; B = {b["lane"]: b for b in rr["boats"]}; b1 = B[1]
    st = {l: (B[l]["st"] if B[l].get("st") is not None else np.nan) for l in B}
    ok = [v for v in st.values() if v == v]
    rows.append(dict(lose=races[i]["tri"][0] != "1", km=rr["kimarite"], q1=base[i][0],
        st1=st[1], strank=1 + sum(v < st[1] for v in ok) if st[1] == st[1] else np.nan, stdiff=st[1] - np.nanmin([st[l] for l in (2, 3, 4)]),
        course1=b1.get("course"), fl=b1.get("fl", 0), cls=b1.get("cls"), motor=b1.get("motor2"), wind=rr.get("wind"), wave=rr.get("wave"),
        exst_r=L1[i]["str_"], ex_r=L1[i]["exr"], turn_r=L1[i]["turn"], fin=b1.get("finRaw")))
import pandas as pd
X = pd.DataFrame(rows); n = len(X); print("1号艇人気のレース", n, "負け", X.lose.sum(), f"({X.lose.mean():.0%})")
def tab(nm, s):
    g = X.groupby(s, observed=True).lose.agg(["size", "mean"]); g["mean"] = (g["mean"] * 100).round(0)
    print(f"-- {nm}（レース数, 1号艇の負け%）"); print(g.rename(columns={"size": "レース", "mean": "負け%"}).to_string())
tab("本番のスタート順位（1号艇）", X.strank)
tab("本番スタートで2〜4号艇の一番早い艇との差", pd.cut(X.stdiff, [-1, -0.05, 0, 0.03, 0.06, 0.1, 1]))
tab("本番の1号艇のスタート", pd.cut(X.st1, [-1, 0.1, 0.13, 0.16, 0.19, 0.25, 1]))
tab("本番の1号艇の進入コース", X.course1)
tab("1号艇のF持ち", X.fl)
tab("1号艇の級別", X.cls)
tab("1号艇のモーター2連対率", pd.cut(X.motor, [0, 30, 35, 40, 45, 100]))
tab("風速(m)", pd.cut(X.wind, [-1, 1, 3, 5, 7, 20]))
tab("波高(cm)", pd.cut(X.wave, [-1, 2, 5, 10, 50]))
tab("スタート展示の順位", X.exst_r); tab("展示タイムの順位", X.ex_r); tab("まわり足の順位", X.turn_r)
L = X[X.lose]
# 負けた理由の大まかな分け方（本番の結果から）
def why(r):
    if r.fin in ("F", "L0", "L1", "K0", "K1", "S0", "S1", "S2") or (isinstance(r.fin, str) and not r.fin.isdigit()): return "1号艇のフライング・事故など"
    if r.course1 and r.course1 != 1: return "1コースを取られた（進入）"
    if r.stdiff == r.stdiff and r.stdiff >= 0.05: return "スタートで内の艇より0.05以上遅れた"
    if r.km == "まくり": return "スタートはほぼ互角で、まくられた"
    if r.km in ("差し", "まくり差し"): return "スタートはほぼ互角で、ターンで差された"
    if r.km == "抜き": return "道中で抜かれた"
    return "その他（恵まれなど）"
c = collections.Counter(L.apply(why, axis=1)); print("== 負けた理由（本番の結果から）", len(L))
for k, v in c.most_common(): print(f"  {k}: {v}回 ({v/len(L):.0%})")
print("== 負けたレースと勝ったレースの平均", X.groupby("lose")[["st1", "stdiff", "motor", "wind", "exst_r", "ex_r", "turn_r", "q1"]].mean().round(3).to_string())
