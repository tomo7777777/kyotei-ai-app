"""選手の普段のスタート（過去のレースから）で、人気の1号艇の本番スタートの遅れと負けを予想できるか（全場・オッズのあるレース）"""
import pickle, json, glob, collections, numpy as np, pandas as pd, sys
sys.path.insert(0, "."); from payout_model import KEYS
R = sorted(pickle.load(open("races.pkl", "rb")), key=lambda r: (r["date"], r["jcd"], int(r["rno"])))
OD = {}
for f in glob.glob("odds3_final/*.jsonl"):
    for l in open(f):
        o = json.loads(l)
        if o["n"] >= 110: OD[(o["hd"], o["jcd"], int(o["rno"]))] = o["odds3"]
fst = np.array([int(c[0]) for c in KEYS])
H = collections.defaultdict(list)  # toban -> [(date, course, st, F)]
Fterm = collections.defaultdict(list)
def term(d): return d[:4] + ("A" if "05" <= d[4:6] <= "10" else "B") if d[4:6] >= "05" else str(int(d[:4]) - 1) + "B"
def feat(t, d, lane):
    h = [x for x in H[t][-80:]]; sts = [x[2] for x in h if x[2] is not None]; c = [x[2] for x in h if x[1] == lane and x[2] is not None]
    nF = sum(1 for x in H[t] if x[3] and term(x[0]) == term(d))
    return dict(n=len(sts), avg=np.mean(sts) if len(sts) >= 5 else np.nan, sd=np.std(sts) if len(sts) >= 8 else np.nan,
                late=np.mean([s >= 0.20 for s in sts]) if len(sts) >= 8 else np.nan, cavg=np.mean(c[-20:]) if len(c) >= 3 else np.nan, F=nF)
rows = []; day = None; buf = []
def flush():
    for r in buf:
        for b in r["boats"]:
            H[b["toban"]].append((r["date"], b.get("course"), b.get("st") if b.get("fl") == 0 else None, b.get("fl") == 1))
for r in R:
    if r["date"] != day: flush(); buf = []; day = r["date"]
    buf.append(r); k = (r["date"], r["jcd"], int(r["rno"]))
    if k not in OD or not r["tri"] or not r["tri"][0].isdigit(): continue
    B = {b["lane"]: b for b in r["boats"]}
    if len(B) < 6: continue
    o = np.array([OD[k].get(c, np.nan) for c in KEYS], float); q = np.where(np.isnan(o), 0, 1 / np.where(np.isnan(o), 1, o)); q /= q.sum()
    f = {l: feat(B[l]["toban"], r["date"], l) for l in range(1, 7)}
    st = {l: B[l].get("st") for l in B}
    real = (st[1] - min(st[l] for l in (2, 3, 4) if st[l] is not None)) if st[1] is not None and any(st[l] is not None for l in (2, 3, 4)) else np.nan
    rows.append(dict(k=k, month=r["date"][:6], q1=q[fst == 1].sum(), win1=r["tri"][0] == "1", pay=r["triPay"] or 0, tri=r["tri"], o=o, q=q,
        a1=f[1]["avg"], c1=f[1]["cavg"], sd1=f[1]["sd"], late1=f[1]["late"], F1=f[1]["F"], cls1=B[1]["cls"],
        a24=np.nanmin([f[l]["avg"] for l in (2, 3, 4)]) if any(f[l]["avg"] == f[l]["avg"] for l in (2, 3, 4)) else np.nan,
        c24=np.nanmin([f[l]["cavg"] for l in (2, 3, 4)]) if any(f[l]["cavg"] == f[l]["cavg"] for l in (2, 3, 4)) else np.nan,
        F24=max(f[l]["F"] for l in (2, 3, 4)), realdiff=real, realst1=st[1]))
flush()
X = pd.DataFrame(rows); pickle.dump(X, open("/tmp/ana1_st.pkl", "wb")); print("レース", len(X), X.month.min(), X.month.max())
