"""Train the fundamental model on official K/B history and evaluate vs. market on races with odds."""
import pickle, json, math, itertools, sys
import numpy as np, lightgbm as lgb
from scipy.optimize import minimize
sys.path.insert(0, "backtest")
from fe import History, FEATURES

races = pickle.load(open("backtest/races.pkl", "rb"))
WARM = races[0]["date"][:6]  # first month only warms up history
H = History(); X, Yl, G, meta = [], [], [], []
for r in races:
    f = H.feats(r)
    fins = [b.get("fin") for b in r["boats"]]
    ok = sorted([x for x in fins if x])[:3] == [1, 2, 3]
    if ok and r["date"][:6] != WARM:
        X.append(f); Yl.append([3 if x == 1 else 2 if x == 2 else 1 if x == 3 else 0 for x in fins])
        meta.append((r["date"], r["jcd"], r["rno"], r["tri"], r["triPay"]))
    H.update(r)
X = np.stack(X); Yl = np.array(Yl); dates = np.array([m[0] for m in meta])
print("samples", len(X), min(dates), max(dates))
pickle.dump(H, open("backtest/history.pkl", "wb"))

TEST_FROM = sys.argv[1] if len(sys.argv) > 1 else "20260928"
VAL_FROM = sys.argv[2] if len(sys.argv) > 2 else "20260901"
tr = dates < VAL_FROM; va = (dates >= VAL_FROM) & (dates < TEST_FROM); te = dates >= TEST_FROM
def flat(m): return X[m].reshape(-1, X.shape[2]), Yl[m].reshape(-1), np.full(m.sum(), 6)
Xtr, ytr, gtr = flat(tr); Xva, yva, gva = flat(va)
params = dict(objective="lambdarank", metric="ndcg", ndcg_eval_at=[3], learning_rate=0.03, num_leaves=31, min_data_in_leaf=200,
              feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1, label_gain=[0, 1, 3, 7])
dtr = lgb.Dataset(Xtr, ytr, group=gtr, feature_name=FEATURES); dva = lgb.Dataset(Xva, yva, group=gva, reference=dtr)
bst = lgb.train(params, dtr, 3000, valid_sets=[dva], callbacks=[lgb.early_stopping(100, verbose=False)])
print("best iter", bst.best_iteration)
S = bst.predict(X.reshape(-1, X.shape[2]), num_iteration=bst.best_iteration).reshape(-1, 6)

PERMS = list(itertools.permutations(range(6), 3)); A = np.array([p[0] for p in PERMS]); B_ = np.array([p[1] for p in PERMS]); C = np.array([p[2] for p in PERMS])
KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]
def pl(S, k):
    e1 = np.exp(k[0] * S); e2 = np.exp(k[1] * S); e3 = np.exp(k[2] * S)
    p = e1[:, A] / e1.sum(1, keepdims=True)
    p = p * e2[:, B_] / (e2.sum(1, keepdims=True) - e2[:, A])
    p = p * e3[:, C] / (e3.sum(1, keepdims=True) - e3[:, A] - e3[:, B_])
    return p
yidx = np.array([KEYS.index(m[3]) if m[3] in KEYS else -1 for m in meta])
def nll_k(k, m):
    p = pl(S[m], k); y = yidx[m]; ok = y >= 0
    return -np.log(np.maximum(p[ok][np.arange(ok.sum()), y[ok]], 1e-12)).mean()
kopt = minimize(nll_k, [1.0, 0.8, 0.6], args=(va,), method="Nelder-Mead").x
print("PL k", kopt, "val ll3", nll_k(kopt, va), "test ll3 (standalone)", nll_k(kopt, te))
imp = sorted(zip(FEATURES, bst.feature_importance("gain")), key=lambda x: -x[1])
print("importance", [(a, int(b)) for a, b in imp[:20]])
bst.save_model("backtest/lgb_model.txt", num_iteration=bst.best_iteration)
json.dump(dict(k=list(kopt), features=FEATURES, test_from=TEST_FROM), open("backtest/lgb_meta.json", "w"))
np.save("backtest/scores.npy", S); pickle.dump(meta, open("backtest/meta.pkl", "wb"))
