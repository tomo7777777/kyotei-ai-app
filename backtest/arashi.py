"""荒れ専用モデル: P(3連単 >= 10,000円) を予想。walk-forward で評価。"""
import sys; sys.path.insert(0, "backtest")
import pickle, json, numpy as np, lightgbm as lgb, itertools
from scipy.stats import mannwhitneyu
from fe import FEATURES
from payout_model import KEYS
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
D = pickle.load(open("backtest/manshu_data.pkl", "rb"))
assert all(meta[d["i"]]["tri"] == d["tri"] for d in D[::500])
HEAD = np.array([int(k[0]) for k in KEYS]); SEC = np.array([int(k[2]) for k in KEYS])
def pfeat(P, est):
    w = np.zeros(6); np.add.at(w, HEAD - 1, P)
    o = np.argsort(-P)
    ent = -(P * np.log(P + 1e-12)).sum()
    c = est >= 100
    return np.array([w[0], w.max(), np.sort(w)[-2], ent, P[o[:5]].sum(), P[c].sum(), (P * np.log(est)).sum(), np.argmax(w)], dtype=np.float32)
PF_NAMES = ["p_1win", "p_favwin", "p_2ndwin", "p_entropy", "p_top5", "p_over100", "p_exp_logodds", "p_fav_lane"]
def rowfeat(Xi, pf):
    return np.concatenate([Xi.reshape(-1), pf]).astype(np.float32)
NAMES = [f"L{l+1}_{f}" for l in range(6) for f in FEATURES] + PF_NAMES
def auc(y, s): y = np.asarray(y, bool); return mannwhitneyu(s[y], s[~y]).statistic / (y.sum() * (~y).sum())
PARAMS = dict(objective="binary", learning_rate=0.03, num_leaves=31, min_data_in_leaf=100, feature_fraction=0.5, bagging_fraction=0.8, bagging_freq=1, lambda_l2=5, verbose=-1, num_threads=4)
def fit(R, y, Rv, yv):
    return lgb.train(PARAMS, lgb.Dataset(R, y), 3000, valid_sets=[lgb.Dataset(Rv, yv)], callbacks=[lgb.early_stopping(150, verbose=False)])
if __name__ == "__main__":
    # rows only where P (OOS) exists -> D
    R = np.array([rowfeat(X[d["i"]], pfeat(d["P"], d["est"])) for d in D]); y = np.array([(d["pay"] or 0) >= 10000 for d in D]); M = np.array([d["month"] for d in D])
    dates = np.array([meta[d["i"]]["date"] for d in D])
    months = sorted(set(M)); out = np.full(len(D), np.nan)
    for m in months[1:]:
        tr = M < m; te = M == m
        # early stopping on last 3 weeks of train
        trd = dates[tr]; cut = sorted(trd)[int(len(trd) * 0.8)]
        a = tr & (dates < cut); v = tr & (dates >= cut)
        mdl = fit(R[a], y[a], R[v], y[v]); out[te] = mdl.predict(R[te], num_iteration=mdl.best_iteration)
        print(m, "iters", mdl.best_iteration, "AUC", round(auc(y[te], out[te]), 3), flush=True)
    ok = ~np.isnan(out); print("overall AUC", round(auc(y[ok], out[ok]), 3))
    pickle.dump(dict(score=out, y=y, M=M), open("backtest/arashi_oos.pkl", "wb"))
