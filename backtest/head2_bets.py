"""頭2艇レース（朝のAIで1号艇1着率21%以下）で3連単の買い方を比べる（確定オッズで回収率）"""
import pickle, json, glob, numpy as np, collections, sys
sys.path.insert(0, "."); from payout_model import KEYS
fst = np.array([int(c[0]) for c in KEYS])
_, _, meta, _ = pickle.load(open("ds_seq.pkl", "rb")); M = pickle.load(open("morning_data.pkl", "rb"))
OD = {}
for f in glob.glob("odds3_final/*.jsonl"):
    for l in open(f):
        o = json.loads(l)
        if o["n"] >= 110: OD[(o["hd"], o["jcd"], int(o["rno"]))] = o["odds3"]
X = []
for m in M:
    r = meta[m["i"]]; k = (r["date"], r["jcd"], int(r["rno"]))
    if k not in OD or not m["tri"][0].isdigit(): continue
    P = np.array(m["P"]); pm = np.array([P[fst == l].sum() for l in range(1, 7)])
    if pm[0] > 0.21: continue
    o = np.array([OD[k].get(c, np.nan) for c in KEYS], float)
    heads = [int(x) + 2 for x in np.argsort(-pm[1:])[:2]]
    X.append(dict(d=r["date"], month=m["month"], P=P, o=o, tri=m["tri"], pay=m["pay"], heads=heads))
X.sort(key=lambda x: x["d"]); print("レース", len(X), X[0]["d"], X[-1]["d"])
def run(nm, pick):
    inv = ret = hit = nr = 0; half = [[0, 0], [0, 0]]; pays = []
    for j, x in enumerate(X):
        cs = pick(x)
        if not cs: continue
        nr += 1; inv += len(cs) * 100; h = j >= len(X) // 2; half[h][0] += len(cs) * 100
        if x["tri"] in cs: hit += 1; ret += x["pay"]; half[h][1] += x["pay"]; pays.append(x["pay"])
    print(f"{nm:34s} レース{nr:4d} 平均{inv/100/max(nr,1):4.1f}点 的中{hit/max(nr,1):5.1%} 回収{ret/max(inv,1):5.0%} (前半{half[0][1]/max(half[0][0],1):4.0%} 後半{half[1][1]/max(half[1][0],1):4.0%}) 平均配当{np.mean(pays) if pays else 0:7.0f}")
def head_idx(x): return [i for i, c in enumerate(KEYS) if int(c[0]) in x["heads"]]
def topP(n, omin=0, omax=1e9, oknown=True):
    def f(x):
        ix = sorted(head_idx(x), key=lambda i: -x["P"][i])
        out = [KEYS[i] for i in ix if (not oknown or omin <= (x["o"][i] if not np.isnan(x["o"][i]) else 0) <= omax)]
        return out[:n]
    return f
def evsel(th, omin=0, omax=1e9, n=99, w=0.3):
    def f(x):
        o = x["o"]; q = np.where(np.isnan(o), 0, 1 / np.where(np.isnan(o), 1, o)); q /= q.sum()
        p = w * x["P"] + (1 - w) * q
        ix = [i for i in head_idx(x) if not np.isnan(o[i]) and omin <= o[i] <= omax and p[i] * o[i] >= th]
        ix.sort(key=lambda i: -p[i] * o[i]); return [KEYS[i] for i in ix[:n]]
    return f
for n in (4, 6, 8, 10, 12, 16, 20): run(f"朝AI上位{n}点（オッズ見ない）", topP(n, oknown=False))
for lo, hi in ((10, 1e9), (20, 1e9), (30, 1e9), (20, 100), (30, 150), (40, 200), (50, 300)):
    for n in (5, 10):
        run(f"朝AI上位{n}点 オッズ{lo}-{hi if hi<1e9 else '∞'}倍", topP(n, lo, hi))
for w in (0.3, 0.5):
    for th in (1.0, 1.1, 1.2):
        for lo, hi in ((20, 200), (30, 300)):
            run(f"期待値{th} w{w} {lo}-{hi}倍 max10", evsel(th, lo, hi, 10, w))
# 2艇流し 頭→相手
def nagashi(sec):
    def f(x):
        out = []
        for h in x["heads"]:
            for c in KEYS:
                if int(c[0]) == h and int(c[2]) in sec(x, h) and int(c[4]) in sec(x, h): out.append(c)
        return out
    return f
run("2艇頭-2着3着全(40点)", lambda x: [c for c in KEYS if int(c[0]) in x["heads"]])
run("2艇頭-1号艇含む上位3艇BOX的", nagashi(lambda x, h: [l for l in [1] + [k for k in x["heads"] if k != h] + []] or [1]))
