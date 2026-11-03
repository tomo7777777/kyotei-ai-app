import numpy as np, pickle, collections
exec(open("ana1_eval.py").read().split("def run(")[0])
RR = {(r["date"], r["jcd"], int(r["rno"])): r for r in pickle.load(open("races.pkl", "rb")) if r["date"] >= "20260601"}
pop = lambda i: base[i][0] >= 0.5
top1 = lambda p: int(np.argmax(np.where(np.arange(6) == 0, -1, p))) + 1
conds = {"1号艇人気・全部": lambda i: pop(i), "人気・進入が動いた": lambda i: pop(i) and L1[i]["comv"], "人気・1号艇の評価が市場より低い(<0.97)": lambda i: pop(i) and (PW[i] / base[i])[0] < 0.97}
for nm, c in conds.items():
    sel = [i for i in idx if c(i)]; hit = []; lanes = collections.Counter(); km = collections.Counter(); kmAll = collections.Counter(); l1fin = collections.Counter(); tk = collections.Counter()
    for i in sel:
        k = races[i]["k"]; rr = RR.get(k); w = int(races[i]["tri"][0]); h = top1(PW[i]); tk[h] += 1
        if w != 1 and rr: kmAll[rr["kimarite"]] += 1
        if w == h and rr:
            hit.append(i); lanes[h] += 1; km[rr["kimarite"]] += 1
            b1 = [b for b in rr["boats"] if b["lane"] == 1][0]; l1fin[b1["finRaw"]] += 1
    n = len(hit)
    print(f"== {nm}: レース{len(sel)} 頭1艇が1着 {n}回")
    print("  選んだ頭の枠（選んだ回数）", dict(sorted(tk.items())), " 当たった枠", dict(sorted(lanes.items())))
    print("  当たった時の決まり手", {k: f"{v}回({v/n:.0%})" for k, v in km.most_common()})
    print("  参考: 1号艇以外が勝った全レースの決まり手", {k: f"{v/sum(kmAll.values()):.0%}" for k, v in kmAll.most_common()})
    print("  当たった時の1号艇の着順", dict(sorted(l1fin.items())))
print("== 枠ごとの決まり手（1号艇人気・全部で、頭1艇が当たった時）")
sel = [i for i in idx if pop(i)]; t = collections.defaultdict(collections.Counter)
for i in sel:
    rr = RR.get(races[i]["k"]); w = int(races[i]["tri"][0]); h = top1(PW[i])
    if w == h and rr: t[h][rr["kimarite"]] += 1
for l in sorted(t): n = sum(t[l].values()); print(l, "号艇", n, "回", {k: f"{v/n:.0%}" for k, v in t[l].most_common()})
