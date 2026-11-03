import sys; sys.path.insert(0, "backtest")
import pickle, json, itertools, numpy as np
from scipy.optimize import minimize
X, FIN, meta, H = pickle.load(open("backtest/ds_seq.pkl", "rb")); o = pickle.load(open("backtest/seq_out.pkl", "rb"))["202609"]
KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in itertools.permutations(range(6), 3)]
pos = {i: k for k, i in enumerate(o["idx"])}; key = {(m["date"], m["jcd"], m["rno"]): i for i, m in enumerate(meta)}
LM, LP, Y, D, PAY = [], [], [], [], []
for r in json.load(open("backtest/feats.json")):
    i = key.get((r["hd"], r["jcd"], int(r["rno"]))); odds = np.array([r["odds3"].get(k, 0.0) for k in KEYS])
    if i is None or i not in pos or (odds > 0).sum() < 60 or r["trifecta"] not in KEYS: continue
    inv = np.where(odds > 0, 1 / np.where(odds > 0, odds, 1), 0); mk = inv / inv.sum()
    LM.append(np.log(np.maximum(mk, 1e-6))); LP.append(np.log(np.maximum(o["P"][pos[i]], 1e-9))); Y.append(KEYS.index(r["trifecta"])); D.append(r["hd"]); PAY.append(r["pay"])
LM, LP, Y, D, PAY = map(np.array, (LM, LP, Y, D, PAY))
def comb(th, ii): z = th[0] * LM[ii] + th[1] * LP[ii]; z -= z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)
def nll(th, ii): p = comb(th, ii); return -np.log(p[np.arange(len(ii)), Y[ii]]).mean()
cv = []; PCV = np.zeros_like(LM)
for d in sorted(set(D)):
    tr = np.where(D != d)[0]; te = np.where(D == d)[0]; th = minimize(nll, [1, 0], args=(tr,), method="Nelder-Mead").x; cv.append((len(te), nll(th, te))); PCV[te] = comb(th, te)
allii = np.arange(len(Y)); th = minimize(nll, [1, 0], args=(allii,), method="Nelder-Mead").x
mk_ll = -LM[allii, Y].mean(); md_ll = -LP[allii, Y].mean()
print("n", len(Y), "market", mk_ll, "model", md_ll, "combined cv", sum(n * l for n, l in cv) / len(Y), "theta", th)
json.dump(dict(theta_all=list(th)), open("backtest/stage2_seq.json", "w"))

pickle.dump(dict(MK=np.exp(LM) / np.exp(LM).sum(1, keepdims=True), PM=np.exp(LP), PCV=PCV, Y=Y, D=D, PAY=PAY), open("backtest/stage2_seq_data.pkl", "wb"))
