"""1号艇人気だけど穴狙い: 市場で1号艇が人気のレースのうち、負けそうなレースで1号艇以外を頭にした3連単を買う（ウォークフォワード）"""
import pickle, sys, numpy as np, collections
sys.path.insert(0, "."); from payout_model import KEYS
exec(open("ashi_clogit.py").read().split("te = (mon")[0])
_, races = pickle.load(open("/tmp/ashi_ds.pkl", "rb")); races = sorted(races, key=lambda r: r["ri"])
ALL = sum(G.values(), []); base = np.exp(lq) / np.exp(lq).sum(1, keepdims=True); PW = wf(ALL, 200)
fst = np.array([int(c[0]) for c in KEYS]); DD = D.set_index(["ri", "lane"])
idx = [i for i in range(len(races)) if mon[i] != min(mon) and not np.isnan(PW[i]).any()]
L1 = {}
for i in idx:
    d = DD.loc[races[i]["ri"]]; L1[i] = dict(st=d.st.loc[1], str_=d.str_.loc[1], exr=d.exr.loc[1], turn=d.turn_r.loc[1], strt=d.straight_r.loc[1], lap=d.lap_r.loc[1], half=d.half_r.loc[1], comv=(d.comv != 0).any(), ser=d.ser.loc[1], stmin_out=d.st.loc[2:6].min())
def run(cond, N, omin=0, tag=""):
    n = inv = ret = hit = l1 = 0; mm = collections.defaultdict(lambda: [0, 0]); days = set(); q1s = []; pays = []
    for i in idx:
        if not cond(i): continue
        r = races[i]; o = np.nan_to_num(r["o"], nan=0); p3 = r["q"] * (PW[i] / base[i])[fst - 1]
        sc = np.where((fst == 1) | (o < max(omin, 1)), -1, p3); pk = [j for j in np.argsort(-sc)[:N] if sc[j] > 0]
        if not pk: continue
        picks = {KEYS[j] for j in pk}; h = r["tri"] in picks; g = r["pay"] if h else 0
        n += 1; hit += h; inv += len(pk) * 100; ret += g; l1 += r["tri"][0] != "1"; mm[mon[i]][0] += len(pk) * 100; mm[mon[i]][1] += g; days.add(r["k"][0]); q1s.append(base[i][0])
        if h: pays.append(g)
    if n < 30: return
    top3 = sorted(pays)[-3:]; ex3 = (ret - sum(top3)) / inv
    print(f"{tag} N{N}{f' {omin}倍以上' if omin else ''}: レース{n} 1日{n/len(days):.1f} 市場1号艇{np.mean(q1s):.0%} 1号艇負け{l1/n:.0%} 的中{hit/n:.0%} 回収率{ret/inv:.0%} 上位3本除く{ex3:.0%}", {m[4:]: f"{b/a:.0%}" for m, (a, b) in sorted(mm.items())})
pop = lambda i: base[i][0] >= 0.5
C = {
 "1号艇人気(市場50%以上)・全部": lambda i: pop(i),
 "人気・補正比<0.95": lambda i: pop(i) and (PW[i] / base[i])[0] < 0.95,
 "人気・補正比<0.97": lambda i: pop(i) and (PW[i] / base[i])[0] < 0.97,
 "人気・1号艇のスタート展示4位以下": lambda i: pop(i) and L1[i]["str_"] >= 4,
 "人気・1号艇の展示タイム5位以下": lambda i: pop(i) and L1[i]["exr"] >= 5,
 "人気・1号艇のまわり足4位以下": lambda i: pop(i) and L1[i]["turn"] >= 4,
 "人気・1号艇の直線5位以下": lambda i: pop(i) and L1[i]["strt"] >= 5,
 "人気・外の艇が1号艇より0.1以上早いST": lambda i: pop(i) and L1[i]["stmin_out"] - L1[i]["st"] <= -0.1,
 "人気・進入が動いた": lambda i: pop(i) and L1[i]["comv"],
 "人気・1号艇の今節の足が悪い": lambda i: pop(i) and L1[i]["ser"] > 0.05,
 "人気・足の悪い項目2つ以上": lambda i: pop(i) and sum([L1[i]["str_"] >= 4, L1[i]["exr"] >= 5, L1[i]["turn"] >= 4, L1[i]["strt"] >= 5, (L1[i]["ser"] > 0.05)]) >= 2,
}
for nm, c in C.items():
    for N in (10, 15):
        run(c, N, tag=nm); run(c, N, omin=20, tag=nm)
