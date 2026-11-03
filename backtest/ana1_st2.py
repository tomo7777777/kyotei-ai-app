import pickle, numpy as np, pandas as pd, collections, sys
sys.path.insert(0, "."); from payout_model import KEYS
X = pickle.load(open("/tmp/ana1_st.pkl", "rb")); fst = np.array([int(c[0]) for c in KEYS])
X["d_avg"] = X.a1 - X.a24; X["d_c"] = X.c1 - X.c24
P = X[X.q1 >= 0.5].copy(); print("1号艇人気（市場50%以上）", len(P), "負け", f"{1-P.win1.mean():.1%}", "市場の見立て", f"{1-P.q1.mean():.1%}")
print("相関（本番のスタート差との）", {c: round(P[[c, "realdiff"]].corr().iloc[0, 1], 3) for c in ["a1", "c1", "sd1", "late1", "d_avg", "d_c", "F1"]})
def tab(nm, s):
    g = P.groupby(s, observed=True).agg(n=("win1", "size"), lose=("win1", lambda x: 1 - x.mean()), mkt=("q1", lambda x: 1 - x.mean()), real=("realdiff", "mean"))
    g["差"] = g.lose - g.mkt; print(f"-- {nm}"); print(g.round(3).rename(columns={"n": "レース", "lose": "負け", "mkt": "市場の見立て負け", "real": "本番ST差平均"}).to_string())
tab("1号艇の平均ST（直近80走）", pd.cut(P.a1, [0, .13, .15, .17, .19, 1]))
tab("1号艇の1コースでの平均ST", pd.cut(P.c1, [0, .12, .14, .16, .18, 1]))
tab("1号艇の平均ST − 2〜4号艇で一番早い平均ST", pd.cut(P.d_avg, [-1, -.02, 0, .02, .04, 1]))
tab("1コース平均ST − 2〜4号艇の同コース平均STで一番早い", pd.cut(P.d_c, [-1, -.02, 0, .02, .04, 1]))
tab("1号艇のST 0.20以上の割合", pd.cut(P.late1, [-.01, .05, .1, .2, 1]))
tab("1号艇のSTのばらつき", pd.cut(P.sd1, [0, .04, .05, .06, 1]))
tab("1号艇の今期のF数（F持ち）", P.F1.clip(0, 2)); tab("2〜4号艇のF持ち（最大）", P.F24.clip(0, 2))
# 買ってみる: 1号艇以外を頭に、市場の確率順に10点（頭は市場の順）
def bet(sel, N=10, nm=""):
    n = inv = ret = hit = 0; mm = collections.defaultdict(lambda: [0, 0]); pays = []
    for _, r in sel.iterrows():
        o = np.nan_to_num(r.o, nan=0); sc = np.where(fst == 1, -1, r.q); pk = np.argsort(-sc)[:N]; picks = {KEYS[j] for j in pk}
        h = r.tri in picks; g = r.pay if h else 0; n += 1; hit += h; inv += N * 100; ret += g; mm[r.month][0] += N * 100; mm[r.month][1] += g
        if h: pays.append(g)
    ex = (ret - sum(sorted(pays)[-3:])) / inv if inv else 0
    print(f"{nm} N{N}: レース{n} 1号艇負け{1-sel.win1.mean():.0%}(市場{1-sel.q1.mean():.0%}) 的中{hit/n:.0%} 回収率{ret/inv:.0%} 上位3本除く{ex:.0%}", {m[4:]: f"{b/a:.0%}" for m, (a, b) in sorted(mm.items())})
print("== 買ってみる（1号艇以外が頭、オッズの人気順に10点）")
bet(P, nm="人気・全部")
for nm, s in [("1号艇の平均ST0.19以上", P.a1 >= .19), ("1コース平均ST0.18以上", P.c1 >= .18), ("平均ST差+0.04以上", P.d_avg >= .04), ("1コース平均差+0.04以上", P.d_c >= .04), ("1号艇F持ち", P.F1 >= 1), ("ST0.20以上が20%以上", P.late1 >= .2)]:
    if s.sum() >= 30: bet(P[s], nm=nm); bet(P[s], 15, nm=nm)
