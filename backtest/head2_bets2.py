exec(open("head2_bets.py").read().split("for n in (4, 6")[0])
def topthen(n, lo, hi=1e9):
    def f(x):
        ix = sorted(head_idx(x), key=lambda i: -x["P"][i])[:n]
        return [KEYS[i] for i in ix if not np.isnan(x["o"][i]) and lo <= x["o"][i] <= hi]
    return f
for n in (10, 12, 15, 20):
    for lo in (15, 20, 30):
        run(f"朝AI上位{n}点→{lo}倍以上だけ買う", topthen(n, lo))
# 月別安定性
import collections
def bymonth(pick):
    g = collections.defaultdict(lambda: [0, 0])
    for x in X:
        cs = pick(x); g[x["month"]][0] += len(cs) * 100
        if x["tri"] in cs: g[x["month"]][1] += x["pay"]
    print({k: f"{v[1]/max(v[0],1):.0%}" for k, v in sorted(g.items())})
bymonth(topthen(12, 20)); bymonth(topP(10, 20)); bymonth(topP(6, oknown=False))
