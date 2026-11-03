import importlib.util, json, math, pickle, numpy as np, itertools
spec = importlib.util.spec_from_file_location("fit", "backtest/fit.py"); F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)
spec2 = importlib.util.spec_from_file_location("rep", "backtest/report.py")
PA = F.PA; w0 = np.array(F.DEFAULT["w"]) * F.DEFAULT["scale"]
d2 = pickle.load(open("backtest/stage2b_data.pkl", "rb")); P2 = np.load("backtest/stage2b_P.npy"); s2 = json.load(open("backtest/stage2b.json"))
# map old-model rows by (day, y, pay) order: rebuild keys from feats.json in same filtering order
odds_races = json.load(open("backtest/feats.json")); meta = pickle.load(open("backtest/meta.pkl", "rb"))
idx = {(m[0], m[1], m[2]) for m in meta}
KEYS = [f"{a}-{b}-{c}" for a, b, c in itertools.permutations(range(1, 7), 3)]
old = {}
for d in F.D: old[d["id"]] = d
ids = []
for r in odds_races:
    odds = np.array([r["odds3"].get(k, 0.0) for k in KEYS])
    if (r["hd"], r["jcd"], int(r["rno"])) in idx and (odds > 0).sum() >= 60 and r["trifecta"] in KEYS: ids.append(f'{r["hd"]}-{r["jcd"]}-{r["rno"]}')
assert len(ids) == len(d2["Y"]), (len(ids), len(d2["Y"]))
Y, MK, PM, PAY, ODDS, days = d2["Y"], d2["MK"], d2["PM"], d2["PAY"], d2["ODDS"], d2["days"]
def win(x): z = np.zeros(6); np.add.at(z, PA[:, 0], x); return z
def met(name, P):
    n = len(Y); ll3 = -np.mean([math.log(max(P[i][Y[i]], 1e-12)) for i in range(n)])
    W = [win(P[i]) for i in range(n)]
    llw = -np.mean([math.log(max(W[i][PA[Y[i], 0]], 1e-12)) for i in range(n)])
    fav = np.mean([np.argmax(W[i]) == PA[Y[i], 0] for i in range(n)]); h5 = np.mean([Y[i] in np.argsort(-P[i])[:5] for i in range(n)])
    return dict(name=name, ll3=float(ll3), llwin=float(llw), fav_win=float(fav), hit5=float(h5))
OLD = np.stack([F.probs(old[i], w0, 0.7, 0.55) for i in ids])
def conf(q, mk, pm):
    order = np.argsort(-q); W = win(q); c = (0.55 * W.max() + 0.45 * q[order[:6]].sum()) * 118
    c += 4 if (np.argmax(win(mk)) == np.argmax(win(pm)) == np.argmax(W)) else -6
    return float(np.clip(c, 5, 97))
buckets = [(0, 50, "50未満"), (50, 62, "50〜61"), (62, 75, "62〜74"), (75, 101, "75以上")]
Bk = {b[2]: dict(races=0, hit=0, stake=0, ret=0, favwin=0) for b in buckets}
st = {k: dict(bets=0, stake=0, ret=0) for k in ["top5_all", "top1_all", "value"]}
for i in range(len(Y)):
    q = P2[i]; c = conf(q, MK[i], PM[i]); lab = next(b[2] for b in buckets if b[0] <= c < b[1]); r = Bk[lab]
    sel = np.argsort(-q)[:5]; r["races"] += 1; r["stake"] += 500
    if Y[i] in sel: r["hit"] += 1; r["ret"] += int(PAY[i])
    r["favwin"] += int(np.argmax(win(q)) == PA[Y[i], 0])
    s = st["top5_all"]; s["bets"] += 5; s["stake"] += 500; s["ret"] += int(PAY[i]) if Y[i] in sel else 0
    s = st["top1_all"]; s["bets"] += 1; s["stake"] += 100; s["ret"] += int(PAY[i]) if Y[i] == sel[0] else 0
    vs = [j for j in np.argsort(-q) if q[j] >= 0.015 and MK[i][j] > 0 and q[j] / MK[i][j] >= 1.12 and j not in sel][:3]
    s = st["value"]; s["bets"] += len(vs); s["stake"] += 100 * len(vs); s["ret"] += int(PAY[i]) if Y[i] in vs else 0
for s in st.values(): s["roi"] = s["ret"] / s["stake"] if s["stake"] else None
sec = dict(races=len(Y), metrics=[met("オッズ（市場）のみ", MK), met("旧AI（手作りモデル）", OLD), met("新AI単体（機械学習）", PM), met("新AI＋オッズ（本番）", P2)], buckets=Bk, strategies=st)
lgbm = json.load(open("backtest/lgb3_meta.json"))
rep = dict(version=2, dates=sorted(set(days.tolist())), trainRaces=int(sum(1 for m in meta if m[0] < "20260901")), trainFrom=meta[0][0], trainTo="20260831",
           testFrom=lgbm["test_from"], oos=sec, all=None, theta=s2["theta_all"])
json.dump(rep, open("backtest/report.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(sec["metrics"], ensure_ascii=False, indent=0)); print(json.dumps(Bk, ensure_ascii=False)); print(json.dumps(st))
import lightgbm as lgb, re
src = open("backtest/predict_service.py").read()
LABELS = eval(re.search(r"LABELS = (\{.*?\n\})", src, re.S).group(1))
agg = {}
for n in ("win", "top2", "top3"):
    b = lgb.Booster(model_file=f"backtest/lgb_{n}.txt")
    for f, g in zip(b.feature_name(), b.feature_importance("gain")): agg[LABELS.get(f, f)] = agg.get(LABELS.get(f, f), 0) + float(g)
tot = sum(agg.values())
rep["importance"] = [dict(label=k, share=v / tot) for k, v in sorted(agg.items(), key=lambda kv: -kv[1])]
rep["nFeatures"] = len(lgbm["features"])
json.dump(rep, open("backtest/report.json", "w"), ensure_ascii=False, indent=1)
print(rep["importance"][:12])
