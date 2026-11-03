# Nested leave-one-day-out CV: feature selection is redone inside every outer fold (unbiased estimate)
import sys; sys.argv = ["x"]
exec(open("backtest/fit_v2.py").read().split('if __name__ == "__main__":')[0])
S2, S3, LAM = 0.2, 0.1, 0.01
def cv_on(idx_days, mask):
    sub = np.isin(days, idx_days); ii = np.where(sub)[0]
    Phi = design(Xs[:, :, mask], S2, S3) if mask else np.zeros((N, 120, 1))
    tot = 0
    for d in idx_days:
        tr = ii[days[ii] != d]; te = ii[days[ii] == d]
        th = fit(Phi[tr], LM[tr], Y[tr], LAM); P = predict(Phi[te], LM[te], th)
        tot -= np.log(np.maximum(P[np.arange(len(te)), Y[te]], 1e-9)).sum()
    return tot / len(ii)
def select(train_days):
    sel = []; cur = cv_on(train_days, [])
    while True:
        best = min(((cv_on(train_days, sel + [k]), k) for k in range(K) if k not in sel), default=None)
        if best is None or best[0] > cur - 0.0005: return sel
        cur = best[0]; sel.append(best[1])
D_ = sorted(set(days)); P = np.zeros((N, 120)); chosen = {}
for d in D_:
    trd = [x for x in D_ if x != d]; sel = select(trd); chosen[d] = [NAMES[k] for k in sel]
    tr = np.isin(days, trd); te = days == d
    Phi = design(Xs[:, :, sel], S2, S3) if sel else np.zeros((N, 120, 1))
    th = fit(Phi[tr], LM[tr], Y[tr], LAM); P[te] = predict(Phi[te], LM[te], th)
    print(d, chosen[d], flush=True)
allidx = np.arange(N)
res = dict(market=scores(MK, allidx), nested=scores(P, allidx), chosen=chosen,
           per_day={d: dict(market=scores(MK[days == d], np.where(days == d)[0])["ll3"], ai=scores(P[days == d], np.where(days == d)[0])["ll3"], n=int((days == d).sum())) for d in D_})
print(res, flush=True)
json.dump(json.loads(json.dumps(res, default=float)), open("backtest/nested.json", "w"), ensure_ascii=False)
np.save("backtest/nested_probs.npy", P)
