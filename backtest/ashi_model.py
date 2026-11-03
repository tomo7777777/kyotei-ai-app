"""1着モデル（月ごとのウォークフォワード）→ 3連単の確率 → 買い方の検証"""
import pickle, sys, numpy as np, pandas as pd, lightgbm as lgb
sys.path.insert(0, "."); from payout_model import KEYS
rows, races = pickle.load(open("/tmp/ashi_ds.pkl", "rb"))
D = pd.DataFrame(rows); RC = {r["ri"]: r for r in races}
D["month"] = D.ri.map(lambda i: RC[i]["month"])
FE = [c for c in D.columns if c not in ("ri", "y", "month")]
SETS = {"market": ["lane", "lq", "qf"], "market+AI": ["lane", "lq", "qf", "pf"], "all": FE}
months = sorted(D.month.unique()); out = {}
for nm, fe in SETS.items():
    pr = pd.Series(np.nan, index=D.index)
    for m in months[1:]:
        tr = D[D.month < m]; te = D[D.month == m]
        prm = dict(objective="binary", learning_rate=0.03, num_leaves=15, min_data_in_leaf=40, bagging_fraction=0.8, bagging_freq=1, feature_fraction=0.8, lambda_l2=5, verbose=-1, seed=1)
        mdl = lgb.train(prm, lgb.Dataset(tr[fe].astype(float), tr.y), 300); pr[te.index] = mdl.predict(te[fe].astype(float))
    D["p_" + nm] = pr
te = D[D.month > months[0]].copy()
for nm in ["qf"] + ["p_" + n for n in SETS]:
    p = te[nm] / te.groupby("ri")[nm].transform("sum"); ll = -np.log(np.clip(p[te.y == 1], 1e-9, 1)).mean()
    print(f"{nm:12s} 1着の対数損失 {ll:.4f}")
pickle.dump(D, open("/tmp/ashi_pred.pkl", "wb"))
