"""Sequential model: P(1st) * P(2nd | 1st) * P(3rd | 1st, 2nd), walk-forward monthly backtest with real payouts."""
import pickle, json, sys, itertools, time
import numpy as np, lightgbm as lgb
from scipy.optimize import minimize_scalar
sys.path.insert(0, "backtest")
from fe import History, FEATURES

FI = {f: i for i, f in enumerate(FEATURES)}
PERMS = list(itertools.permutations(range(6), 3)); PA = np.array(PERMS)
KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]

def build_dataset():
    races = pickle.load(open("backtest/races.pkl", "rb")); WARM = races[0]["date"][:6]
    H = History(); X, FIN, meta = [], [], []
    for r in races:
        f = H.feats(r); fins = [b.get("fin") for b in r["boats"]]
        if sorted([x for x in fins if x])[:3] == [1, 2, 3] and r["date"][:6] != WARM:
            X.append(f.astype(np.float32)); FIN.append([x if x else 7 for x in fins])
            meta.append(dict(date=r["date"], jcd=r["jcd"], rno=r["rno"], tri=r["tri"], triPay=r["triPay"], triPop=r["triPop"], win1Pay=r.get("win1Pay"), pay=r.get("pay", {})))
        H.update(r)
    return np.stack(X), np.array(FIN), meta, H

CTX = ["course", "natWin_rel", "rc_win", "rc_top2", "cls", "ex_rel", "sashi_rate", "makuri_rate", "nige_lost_rate"]
def cond_rows(X, given):
    """X: (6,F) ; given: list of lanes already placed -> rows for remaining candidates"""
    cand = [j for j in range(6) if j not in given]
    ctx = []
    for g in given: ctx += [X[g, FI[c]] for c in CTX]
    while len(ctx) < 2 * len(CTX): ctx += [0.0] * len(CTX)
    rows = []
    for j in cand:
        rel = [X[j, FI["course"]] - X[given[0], FI["course"]], X[j, FI["natWin"]] - X[given[0], FI["natWin"]]]
        rows.append(np.concatenate([X[j], ctx, rel, [len(given)]]))
    return cand, np.array(rows, dtype=np.float32)

def train_bin(Xtr, ytr, Xva, yva, names=None):
    p = dict(objective="binary", learning_rate=0.05, num_leaves=31, min_data_in_leaf=200, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1, num_threads=2)
    dtr = lgb.Dataset(Xtr, ytr, feature_name=names or "auto"); dva = lgb.Dataset(Xva, yva, reference=dtr)
    return lgb.train(p, dtr, 1500, valid_sets=[dva], callbacks=[lgb.early_stopping(50, verbose=False)])

def fit_models(X, FIN, tr, va):
    # 1st
    m1 = train_bin(X[tr].reshape(-1, X.shape[2]), (FIN[tr] == 1).reshape(-1), X[va].reshape(-1, X.shape[2]), (FIN[va] == 1).reshape(-1), FEATURES)
    # 2nd | 1st, 3rd | 1st,2nd  (rows built from actual finishing order)
    def rows_for(mask, stage):
        R, Y = [], []
        for i in np.where(mask)[0]:
            order = list(np.argsort(FIN[i])); given = order[:stage]
            cand, rows = cond_rows(X[i], given); R.append(rows); Y += [1 if FIN[i][j] == stage + 1 else 0 for j in cand]
        return np.concatenate(R), np.array(Y)
    R2tr, Y2tr = rows_for(tr, 1); R2va, Y2va = rows_for(va, 1)
    m2 = train_bin(R2tr, Y2tr, R2va, Y2va)
    R3tr, Y3tr = rows_for(tr, 2); R3va, Y3va = rows_for(va, 2)
    m3 = train_bin(R3tr, Y3tr, R3va, Y3va)
    return m1, m2, m3

def softmax(z, T=1.0):
    z = z / T; z = z - z.max(-1, keepdims=True); e = np.exp(z); return e / e.sum(-1, keepdims=True)

def race_probs(Xi, m1, m2, m3, T=(1, 1, 1)):
    """returns 120 trifecta probs (KEYS order)"""
    s1 = m1.predict(Xi, raw_score=True); p1 = softmax(s1, T[0])
    # stage 2: for each a
    R2, idx2 = [], []
    for a in range(6):
        cand, rows = cond_rows(Xi, [a]); R2.append(rows); idx2.append(cand)
    s2 = m2.predict(np.concatenate(R2), raw_score=True).reshape(6, 5)
    p2 = {a: dict(zip(idx2[a], softmax(s2[a], T[1]))) for a in range(6)}
    R3, idx3, keys3 = [], [], []
    for a in range(6):
        for b in range(6):
            if a == b: continue
            cand, rows = cond_rows(Xi, [a, b]); R3.append(rows); idx3.append(cand); keys3.append((a, b))
    s3 = m3.predict(np.concatenate(R3), raw_score=True).reshape(30, 4)
    p3 = {keys3[k]: dict(zip(idx3[k], softmax(s3[k], T[2]))) for k in range(30)}
    return np.array([p1[a] * p2[a][b] * p3[(a, b)][c] for a, b, c in PERMS])

if __name__ == "__main__":
    t0 = time.time()
    try:
        X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb"))
    except Exception:
        X, FIN, meta, H = build_dataset(); pickle.dump((X, FIN, meta, H), open("backtest/ds_seq.pkl", "wb"))
    import os
    if os.environ.get("VENUE"):
        jc = np.array([float(m["jcd"]) for m in meta], dtype=np.float32)
        X = np.concatenate([X, np.repeat(jc[:, None, None], 6, 1)], 2)
        FEATURES.append("jcd"); FI["jcd"] = len(FEATURES) - 1
    dates = np.array([m["date"] for m in meta]); months = np.array([d[:6] for d in dates])
    print("dataset", X.shape, round(time.time() - t0), "s", flush=True)
    folds = sys.argv[1].split(",") if len(sys.argv) > 1 else ["202606", "202607", "202608", "202609"]
    out = {}
    for fm in folds:
        y, m = int(fm[:4]), int(fm[4:])
        vm = f"{y if m > 1 else y - 1}{(m - 1) if m > 1 else 12:02d}"
        tr = months < vm; va = months == vm
        te = (months == fm) if fm != "202609" else (months >= "202609")
        m1, m2, m3 = fit_models(X, FIN, tr, va)
        P = np.stack([race_probs(X[i], m1, m2, m3) for i in np.where(te)[0]])
        Pva = np.stack([race_probs(X[i], m1, m2, m3) for i in np.where(va)[0][:1500]])
        out[fm] = dict(idx=np.where(te)[0], P=P, idx_va=np.where(va)[0][:1500], Pva=Pva)
        yk = [KEYS.index(meta[i]["tri"]) if meta[i]["tri"] in KEYS else -1 for i in np.where(te)[0]]
        ll = -np.mean([np.log(max(P[k][yk[k]], 1e-12)) for k in range(len(yk)) if yk[k] >= 0])
        print(fm, "test races", te.sum(), "ll3", round(ll, 4), "iters", m1.best_iteration, m2.best_iteration, m3.best_iteration, round(time.time() - t0), "s", flush=True)
        if fm == folds[-1] and not os.environ.get("NOSAVE"):
            m1.save_model("backtest/seq_m1.txt"); m2.save_model("backtest/seq_m2.txt"); m3.save_model("backtest/seq_m3.txt")
    if not os.environ.get("NOSAVE"): pickle.dump(out, open("backtest/seq_out.pkl", "wb"))
