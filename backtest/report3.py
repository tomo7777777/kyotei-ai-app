import json, pickle, math, re, itertools, numpy as np, lightgbm as lgb
d = pickle.load(open("backtest/stage2_seq_data.pkl", "rb")); rep = json.load(open("backtest/report.json"))
PA = np.array(list(itertools.permutations(range(6), 3)))
MK, PM, P2, Y, PAY, days = d["MK"], d["PM"], d["PCV"], d["Y"], d["PAY"], d["D"]
def win(x): z = np.zeros(6); np.add.at(z, PA[:, 0], x); return z
def met(name, P):
    n = len(Y); W = [win(P[i]) for i in range(n)]
    return dict(name=name, ll3=float(-np.mean([math.log(max(P[i][Y[i]], 1e-12)) for i in range(n)])), llwin=float(-np.mean([math.log(max(W[i][PA[Y[i], 0]], 1e-12)) for i in range(n)])),
                fav_win=float(np.mean([np.argmax(W[i]) == PA[Y[i], 0] for i in range(n)])), hit5=float(np.mean([Y[i] in np.argsort(-P[i])[:5] for i in range(n)])))
old = next(m for m in rep["oos"]["metrics"] if m["name"].startswith("旧AI"))
def conf(q, mk, pm):
    order = np.argsort(-q); W = win(q); c = (0.55 * W.max() + 0.45 * q[order[:6]].sum()) * 118
    c += 4 if (np.argmax(win(mk)) == np.argmax(win(pm)) == np.argmax(W)) else -6
    return float(np.clip(c, 5, 97))
buckets = [(0, 50, "50未満"), (50, 62, "50〜61"), (62, 75, "62〜74"), (75, 101, "75以上")]
Bk = {b[2]: dict(races=0, hit=0, stake=0, ret=0, favwin=0) for b in buckets}
st = {k: dict(bets=0, stake=0, ret=0) for k in ["top5_all", "top1_all"]}
for i in range(len(Y)):
    q = P2[i]; c = conf(q, MK[i], PM[i]); r = Bk[next(b[2] for b in buckets if b[0] <= c < b[1])]
    sel = np.argsort(-q)[:5]; r["races"] += 1; r["stake"] += 500
    if Y[i] in sel: r["hit"] += 1; r["ret"] += int(PAY[i])
    r["favwin"] += int(np.argmax(win(q)) == PA[Y[i], 0])
    s = st["top5_all"]; s["bets"] += 5; s["stake"] += 500; s["ret"] += int(PAY[i]) if Y[i] in sel else 0
    s = st["top1_all"]; s["bets"] += 1; s["stake"] += 100; s["ret"] += int(PAY[i]) if Y[i] == sel[0] else 0
for s in st.values(): s["roi"] = s["ret"] / s["stake"]
rep["oos"] = dict(races=len(Y), metrics=[met("オッズ（市場）のみ", MK), old, met("新AI単体（機械学習）", PM), met("新AI＋オッズ（本番）", P2)], buckets=Bk, strategies=st)
src = open("backtest/predict_service.py").read(); LABELS = eval(re.search(r"LABELS = (\{.*?\n\})", src, re.S).group(1))
agg = {}
b = lgb.Booster(model_file="backtest/seq_m1.txt")
for f, g in zip(b.feature_name(), b.feature_importance("gain")): agg[LABELS.get(f, f)] = agg.get(LABELS.get(f, f), 0) + float(g)
tot = sum(agg.values()); rep["importance"] = [dict(label=k, share=v / tot) for k, v in sorted(agg.items(), key=lambda kv: -kv[1])]
import sys; sys.path.insert(0, "backtest"); from fe import FEATURES
rep["nFeatures"] = len(FEATURES); rep["trainTo"] = "20260831"
rep["betting"] = json.load(open("backtest/strategy.json"))
json.dump(rep, open("backtest/report.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(rep["oos"]["metrics"], ensure_ascii=False)); print(rep["importance"][:8]); print(Bk)
