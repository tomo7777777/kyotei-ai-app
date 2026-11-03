import sys, pickle, itertools, numpy as np, collections
sys.path.insert(0, "backtest")
from payout_model import KEYS, PERMS
D = pickle.load(open("backtest/morning_data.pkl", "rb")); KI = {k: j for j, k in enumerate(KEYS)}
PA = np.array(PERMS)
def info(d):
    P = d["P"]; W = np.zeros(6); np.add.at(W, PA[:, 0], P)
    h = 1 + int(np.argmax(W[1:]))  # best non-1号艇 head (0-index lane)
    # 2着 given head h
    S2 = np.zeros(6); 
    for j, (a, b, c) in enumerate(PERMS):
        if a == h: S2[b] += P[j]
    return W, h, S2
def forms(h, S2):
    o2 = [x for x in np.argsort(-S2) if x != h]
    x = [y for y in o2 if y != 0][0]
    oth = lambda ex: [y for y in range(6) if y not in ex]
    F = {}
    F["頭-1-全(4点)"] = [(h, 0, c) for c in oth([h, 0])]
    F["頭-1-全＋頭-全-1(8点)"] = F["頭-1-全(4点)"] + [(h, b, 0) for b in oth([h, 0])]
    F["頭-1,紐-全(8点)"] = [(h, b, c) for b in (0, x) for c in oth([h, b])]
    F["頭-1,紐-1,紐,3着候補(4〜6点)"] = [(h, b, c) for b in (0, x) for c in [o2[k] for k in range(3)] + [0] if c not in (h, b)]
    F["頭-全-全(20点)"] = [(h, b, c) for b in oth([h]) for c in oth([h, b])]
    F["頭-1-全＋頭-紐-1(5点)"] = F["頭-1-全(4点)"] + [(h, x, 0)]
    return {k: list(dict.fromkeys(f"{a+1}-{b+1}-{c+1}" for a, b, c in v)) for k, v in F.items()}
rows = []
for d in D:
    W, h, S2 = info(d); rows.append((d, W, h, forms(h, S2)))
A = lambda d: d["month"] < "202608"
names = list(rows[0][3].keys())
print("races", len(rows))
for name in names:
    for key, kf in (("頭の1着確率", lambda r: r[1][r[2]]), ("1号艇の弱さ×頭", lambda r: r[1][r[2]] * (1 - r[1][0]))):
        sc = np.array([kf(r) for r in rows]); scA = np.array([kf(r) for r in rows if A(r[0])])
        for q in (0.9, 0.95, 0.97):
            th = np.quantile(scA, q); res = {}
            for half in ("A", "B"):
                st = ret = hit = man = n = 0
                for r, s in zip(rows, sc):
                    if (half == "A") != A(r[0]) or s < th: continue
                    combos = r[3][name]; n += 1; st += 100 * len(combos)
                    if r[0]["tri"] in combos: hit += 1; ret += r[0]["pay"]; man += r[0]["pay"] >= 10000
                res[half] = (n, ret / st if st else 0, hit / n if n else 0, man)
            print(f"{name:26s} {key:12s} 上位{int(round((1-q)*100))}% A {res['A'][0]}R ROI {res['A'][1]:.2f} 的中{res['A'][2]:.3f} | B {res['B'][0]}R ROI {res['B'][1]:.2f} 的中{res['B'][2]:.3f} 万舟的中{res['A'][3]+res['B'][3]}")
print("\n=== 形（頭→紐）＋推定倍率の下限")
def run(sel_fn, score_fn, q):
    sc = np.array([score_fn(r) for r in rows]); th = np.quantile([s for r, s in zip(rows, sc) if A(r[0])], q); out = {}
    for half in ("A", "B"):
        st = ret = hit = man = n = pts = 0
        for r, s in zip(rows, sc):
            if (half == "A") != A(r[0]) or s < th: continue
            cs = sel_fn(r)
            if not cs: continue
            n += 1; st += 100 * len(cs); pts += len(cs)
            if r[0]["tri"] in cs: hit += 1; ret += r[0]["pay"]; man += r[0]["pay"] >= 10000
        out[half] = (n, ret / st if st else 0, hit / max(n, 1), man, pts / max(n, 1))
    return out
def shape(r, E, heads=1, sec=2):
    d, W, h, F = r; P = d["P"]; est = d["est"]
    hs = [h] if heads == 1 else [1 + int(x) for x in np.argsort(-W[1:])[:2]]
    cs = []
    for hh in hs:
        S2 = np.zeros(6)
        for j, (a, b, c) in enumerate(PERMS):
            if a == hh: S2[b] += P[j]
        o2 = [x for x in np.argsort(-S2) if x != hh]; seconds = list(dict.fromkeys([0] + o2))[:sec]
        for b in seconds:
            for c in range(6):
                if c in (hh, b): continue
                k = f"{hh+1}-{b+1}-{c+1}"
                if est[KI[k]] >= E: cs.append(k)
    return cs
cur = lambda r: r[1][r[2]]
for heads in (1, 2):
    for sec in (2, 3):
        for E in (30, 50, 80):
            for q in (0.9, 0.95):
                o = run(lambda r: shape(r, E, heads, sec), cur, q)
                print(f"頭{heads}艇 2着{sec}艇(1号艇含む)-3着全 {E}倍以上 上位{int(round((1-q)*100))}%  A {o['A'][0]}R {o['A'][4]:.1f}点 ROI {o['A'][1]:.2f} 的中{o['A'][2]:.3f} | B {o['B'][0]}R ROI {o['B'][1]:.2f} 的中{o['B'][2]:.3f} 万舟的中{o['A'][3]+o['B'][3]}")
print("\n=== 現行の万舟ルール（80倍以上・AI確率上位10点・スコア上位3%）朝の条件")
def curm(r):
    d = r[0]; c = np.where(d["est"] >= 80)[0]
    if len(c) < 10: return []
    return [KEYS[k] for k in c[np.argsort(-d["P"][c])][:10]]
def curs(r):
    d = r[0]; c = np.where(d["est"] >= 80)[0]
    return d["P"][c[np.argsort(-d["P"][c])][:10]].sum() if len(c) >= 10 else 0
for q in (0.95, 0.97):
    o = run(curm, curs, q); print(f"上位{int(round((1-q)*100))}% A {o['A'][0]}R ROI {o['A'][1]:.2f} 的中{o['A'][2]:.3f} | B {o['B'][0]}R ROI {o['B'][1]:.2f} 的中{o['B'][2]:.3f} 万舟的中{o['A'][3]+o['B'][3]}")
