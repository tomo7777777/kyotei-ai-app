"""Estimate trifecta odds from 'public-visible' info (class, win rates, lanes, exhibition rank, motor)."""
import sys; sys.path.insert(0, "backtest")
import pickle, itertools, json, numpy as np, lightgbm as lgb
from fe import FEATURES
FI = {f: i for i, f in enumerate(FEATURES)}
PUB = ["course", "natWin", "nat2", "locWin", "motor2", "cls", "ex_rank", "ex_rel", "rc_win"]
PERMS = list(itertools.permutations(range(6), 3)); KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]
def combo_feats(Xi, a, b, c):
    f = [a + 1, b + 1, c + 1]
    for j in (a, b, c): f += [Xi[j, FI[k]] for k in PUB]
    f += list(Xi[:, FI["natWin"]]) + list(Xi[:, FI["cls"]]) + [Xi[:, FI["wind"]][0], Xi[:, FI["wave"]][0]]
    f += [Xi[a, FI["natWin"]] - Xi[:, FI["natWin"]].max(), Xi[0, FI["natWin"]] - np.sort(Xi[1:, FI["natWin"]])[-1]]
    return f
def race_matrix(Xi): return np.array([combo_feats(Xi, a, b, c) for a, b, c in PERMS], dtype=np.float32)
if __name__ == "__main__":
    X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
    months = np.array([m["date"][:6] for m in meta])
    R, Y, M = [], [], []
    for i, m in enumerate(meta):
        if not m["triPay"] or not m["tri"]: continue
        a, b, c = [int(x) - 1 for x in m["tri"].split("-")]
        R.append(combo_feats(X[i], a, b, c)); Y.append(np.log(m["triPay"] / 100)); M.append(months[i])
    R, Y, M = np.array(R, dtype=np.float32), np.array(Y), np.array(M)
    tr = M < "202605"; va = M == "202605"
    p = dict(objective="regression", learning_rate=0.05, num_leaves=63, min_data_in_leaf=50, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, verbose=-1, num_threads=2)
    m = lgb.train(p, lgb.Dataset(R[tr], Y[tr]), 3000, valid_sets=[lgb.Dataset(R[va], Y[va])], callbacks=[lgb.early_stopping(100, verbose=False)])
    te = M >= "202606"; pr = m.predict(R[te])
    print("iters", m.best_iteration, "test MAE log", np.abs(pr - Y[te]).mean(), "corr", np.corrcoef(pr, Y[te])[0, 1])
    m.save_model("backtest/payout_model.txt", num_iteration=m.best_iteration)
    # check vs real odds on odds races
    feats = json.load(open("backtest/feats.json")); key = {(mm["date"], mm["jcd"], mm["rno"]): i for i, mm in enumerate(meta)}
    from scipy.stats import spearmanr
    rs = []; man = []
    for r in feats:
        i = key.get((r["hd"], r["jcd"], int(r["rno"])))
        if i is None: continue
        est = np.exp(m.predict(race_matrix(X[i]))); real = np.array([r["odds3"].get(k, np.nan) for k in KEYS])
        ok = ~np.isnan(real) & (real > 0)
        if ok.sum() < 100: continue
        rs.append(spearmanr(est[ok], real[ok]).correlation)
        man.append(((est >= 100) == (real >= 100))[ok].mean())
    print("odds races", len(rs), "spearman est vs real", np.mean(rs), "万舟判定一致率", np.mean(man))
