"""市場（最終オッズ）を土台に、船足などで1着確率を補正する条件付きロジット（月ごとのウォークフォワード）"""
import pickle, numpy as np, pandas as pd
from scipy.optimize import minimize
D = pickle.load(open("/tmp/ashi_pred.pkl", "rb")); D = D.sort_values(["ri", "lane"]).reset_index(drop=True)
G = {
 "展示タイム": ["exd", "ex_in"], "スタート展示": ["st", "st_in", "st_in2", "st_out"], "進入": ["comv"],
 "直線": ["straight", "straight_in"], "まわり足": ["turn", "turn_in"], "一周": ["lap", "lap_in"], "半周": ["half", "half_in"], "今節": ["ser"], "AI朝": ["pf"],
}
def build(fe):
    Z = D[fe].astype(float).copy()
    for c in fe:
        Z[c] = Z[c].fillna(D.groupby("lane")[c].transform("mean")).fillna(0)
    Z = Z.values; lane = D.lane.values
    # 枠ごとに効き方が違うので 1号艇/2-3号艇/4-6号艇 に分けた交差項
    grp = np.stack([(lane == 1), (lane >= 2) & (lane <= 3), lane >= 4], 1).astype(float)
    X = np.concatenate([Z * grp[:, [g]] for g in range(3)], 1)
    return X.reshape(-1, 6, X.shape[1])
y = D.y.values.reshape(-1, 6); lq = D.lq.values.reshape(-1, 6); mon = D.month.values.reshape(-1, 6)[:, 0]
ok = y.sum(1) == 1
def fit(X, idx, lam):
    mu = X[idx].reshape(-1, X.shape[2]).mean(0); sd = X[idx].reshape(-1, X.shape[2]).std(0) + 1e-9
    Xs = (X[idx] - mu) / sd
    def f(w):
        s = lq[idx] + Xs @ w; s = s - s.max(1, keepdims=True); p = np.exp(s); p /= p.sum(1, keepdims=True)
        ll = -np.log(p[y[idx] == 1] + 1e-12).sum() + lam * w @ w
        g = -(Xs * (y[idx] - p)[:, :, None]).sum((0, 1)) + 2 * lam * w
        return ll, g
    w = minimize(f, np.zeros(X.shape[2]), jac=True, method="L-BFGS-B").x
    return w, mu, sd
def wf(fe, lam=50):
    X = build(fe); P = np.full(y.shape, np.nan); ms = sorted(set(mon))
    for m in ms[1:]:
        tr = (mon < m) & ok; te = mon == m
        w, mu, sd = fit(X, tr, lam); s = lq[te] + ((X[te] - mu) / sd) @ w; s -= s.max(1, keepdims=True); p = np.exp(s); P[te] = p / p.sum(1, keepdims=True)
    return P
def ll(P, sel): return -np.log(P[sel][y[sel] == 1] + 1e-12).mean()
te = (mon > min(mon)) & ok
base = np.exp(lq) / np.exp(lq).sum(1, keepdims=True)
print("市場のみ", round(ll(base, te), 4))
ALL = sum(G.values(), [])
for nm, fe in list(G.items()) + [("全部", ALL), ("全部(AI朝なし)", [c for c in ALL if c != "pf"])]:
    for lam in (20, 200):
        P = wf(fe, lam); print(f"{nm} λ{lam}", round(ll(P, te), 4), "差", round(ll(P, te) - ll(base, te), 4))
P = wf(ALL, 200); pickle.dump((P, base, y, mon, ok), open("/tmp/ashi_P.pkl", "wb"))
