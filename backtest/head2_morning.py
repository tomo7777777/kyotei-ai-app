"""頭2艇を朝の時点（オッズ・展示なし、朝のAIだけ）で出したら、締切直前のオッズで選ぶ場合と比べてどうか（全場・6〜10月）"""
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
    o = np.array([OD[k].get(c, np.nan) for c in KEYS], float); q = np.where(np.isnan(o), 0, 1 / np.where(np.isnan(o), 1, o)); q /= q.sum()
    P = np.array(m["P"]); X.append(dict(jcd=r["jcd"], month=m["month"], w=int(m["tri"][0]), pm=np.array([P[fst == l].sum() for l in range(1, 7)]), qm=np.array([q[fst == l].sum() for l in range(1, 7)])))
print("レース", len(X))
def top2(p): return [int(x) + 2 for x in np.argsort(-p[1:])[:2]]
def ev(sel, src, nm):
    n = len(sel); h = np.mean([x["w"] in top2(x[src]) for x in sel]); l1 = np.mean([x["w"] != 1 for x in sel])
    both = np.mean([x["w"] in top2(x["qm"]) for x in sel]); mk = np.mean([np.sort(x["qm"][1:])[-2:].sum() for x in sel])
    mon = collections.defaultdict(list)
    for x in sel: mon[x["month"]].append(x["w"] in top2(x[src]))
    print(f"{nm}: レース{n}（1日{n/128:.1f}） 頭2艇のどちらかが1着{h:.1%} 1号艇負け{l1:.0%} | 同じレースでオッズの2・3番人気を頭{both:.1%} オッズの見立て{mk:.1%}", {k[4:]: f"{np.mean(v):.0%}" for k, v in sorted(mon.items())})
for frac in (0.05, 0.10, 0.15):
    thm = np.quantile([x["pm"][0] for x in X], frac); thq = np.quantile([x["qm"][0] for x in X], frac)
    ev([x for x in X if x["pm"][0] <= thm], "pm", f"朝のAIで1号艇が弱い{frac:.0%}・頭も朝のAI")
    ev([x for x in X if x["qm"][0] <= thq], "qm", f"締切のオッズで1号艇が弱い{frac:.0%}・頭もオッズ")
V6 = {"01", "02", "04", "12", "14", "22"}
thm = np.quantile([x["pm"][0] for x in X], 0.10)
ev([x for x in X if x["pm"][0] <= thm and x["jcd"] in V6], "pm", "6場だけ・朝のAIで弱い10%")
