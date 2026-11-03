"""Three binary LightGBM models (win / top2 / top3) -> stage-wise PL. Re-uses features from train.py logic."""
import pickle, json, sys, itertools
import numpy as np, lightgbm as lgb
from scipy.optimize import minimize
sys.path.insert(0, "backtest")
from fe import History, FEATURES
races = pickle.load(open("backtest/races.pkl", "rb"))
WARM = races[0]["date"][:6]
H = History(); X, F, meta = [], [], []
for r in races:
    f = H.feats(r); fins = [b.get("fin") for b in r["boats"]]
    if sorted([x for x in fins if x])[:3] == [1, 2, 3] and r["date"][:6] != WARM:
        X.append(f); F.append([x if x else 7 for x in fins]); meta.append((r["date"], r["jcd"], r["rno"], r["tri"], r["triPay"]))
    H.update(r)
X = np.stack(X); F = np.array(F); dates = np.array([m[0] for m in meta])
pickle.dump(H, open("backtest/history.pkl", "wb"))
TEST_FROM = sys.argv[1] if len(sys.argv) > 1 else "20260928"; VAL_FROM = sys.argv[2] if len(sys.argv) > 2 else "20260901"
tr = dates < VAL_FROM; va = (dates >= VAL_FROM) & (dates < TEST_FROM); te = dates >= TEST_FROM
Xf = X.reshape(-1, X.shape[2])
p = dict(objective="binary", learning_rate=0.03, num_leaves=31, min_data_in_leaf=200, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1)
models, LOG = {}, {}
for name, thr in [("win", 1), ("top2", 2), ("top3", 3)]:
    y = (F <= thr).astype(int)
    dtr = lgb.Dataset(X[tr].reshape(-1, X.shape[2]), y[tr].reshape(-1), feature_name=FEATURES)
    dva = lgb.Dataset(X[va].reshape(-1, X.shape[2]), y[va].reshape(-1), reference=dtr)
    b = lgb.train(p, dtr, 3000, valid_sets=[dva], callbacks=[lgb.early_stopping(100, verbose=False)])
    models[name] = b; LOG[name] = b.predict(Xf, num_iteration=b.best_iteration, raw_score=True).reshape(-1, 6)
    b.save_model(f"backtest/lgb_{name}.txt", num_iteration=b.best_iteration); print(name, "iter", b.best_iteration, flush=True)
PERMS = list(itertools.permutations(range(6), 3)); A = np.array([q[0] for q in PERMS]); B_ = np.array([q[1] for q in PERMS]); C = np.array([q[2] for q in PERMS])
KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]
yidx = np.array([KEYS.index(m[3]) if m[3] in KEYS else -1 for m in meta])
def pl3(ii, a):
    s1, s2, s3 = LOG["win"][ii], LOG["top2"][ii], LOG["top3"][ii]
    e1 = np.exp(a[0] * s1); e2 = np.exp(a[1] * s2 + a[3] * s1); e3 = np.exp(a[2] * s3 + a[4] * s1)
    q = e1[:, A] / e1.sum(1, keepdims=True)
    q = q * e2[:, B_] / (e2.sum(1, keepdims=True) - e2[:, A])
    return q * e3[:, C] / (e3.sum(1, keepdims=True) - e3[:, A] - e3[:, B_])
def nll(a, m):
    ii = np.where(m & (yidx >= 0))[0]; q = pl3(ii, a); return -np.log(np.maximum(q[np.arange(len(ii)), yidx[ii]], 1e-12)).mean()
a = minimize(nll, [1, 1, 1, 0, 0], args=(va,), method="Nelder-Mead", options=dict(maxiter=2000)).x
print("a", a, "val", nll(a, va), "test", nll(a, te))
S = np.stack([LOG["win"], LOG["top2"], LOG["top3"]], -1)
np.save("backtest/scores3.npy", S); pickle.dump(meta, open("backtest/meta.pkl", "wb"))
json.dump(dict(a=list(a), features=FEATURES, test_from=TEST_FROM), open("backtest/lgb3_meta.json", "w"))
