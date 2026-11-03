import json, glob, os, pickle, sys, numpy as np, collections
sys.path.insert(0, ".")
from payout_model import KEYS
M = pickle.load(open("morning_data.pkl", "rb")); X, FIN, meta, H = pickle.load(open("ds_seq.pkl", "rb"))
ORI = {}
for f in sorted(glob.glob("oriten_hist/*.json")):
    hd, j = os.path.basename(f)[:-5].split("_"); d = json.load(open(f))
    for r, x in d.items(): ORI[(hd, j, int(r))] = x
def ranks(lanes, k):
    vs = [(l["t"].get(k), l["lane"]) for l in lanes]; ok = [v for v, _ in vs if v]
    if len(ok) < 4: return {}
    return {ln: 1 + sum(1 for o in ok if o < v) for v, ln in vs if v}
# 今節の平均順位（名前で追跡、前日まで＋同日の前のレース）
keysord = sorted(ORI.keys()); hist = collections.defaultdict(list); last_day = {}
feat = {}
for (hd, j, r) in keysord:
    x = ORI[(hd, j, r)]
    if last_day.get(j) and last_day[j] != hd:
        import datetime
        a = datetime.date(int(last_day[j][:4]), int(last_day[j][4:6]), int(last_day[j][6:])); b = datetime.date(int(hd[:4]), int(hd[4:6]), int(hd[6:]))
        if (b - a).days > 1: [hist.pop(k) for k in [k for k in hist if k[0] == j]]
    last_day[j] = hd
    rk = {k: ranks(x["lanes"], k) for k in x["keys"]}
    today = {l["lane"]: np.mean([rk[k][l["lane"]] for k in rk if l["lane"] in rk[k]]) if any(l["lane"] in rk[k] for k in rk) else np.nan for l in x["lanes"]}
    ser = {}
    for l in x["lanes"]:
        h = hist[(j, l["name"])]; ser[l["lane"]] = (np.mean(h), len(h)) if h else (np.nan, 0)
    feat[(hd, j, r)] = (today, ser)
    for l in x["lanes"]:
        if not np.isnan(today[l["lane"]]): hist[(j, l["name"])].append(today[l["lane"]])
R = []
for m in M:
    mt = meta[m["i"]]; k = (mt["date"], mt["jcd"], int(mt["rno"]))
    if k not in feat: continue
    P = np.array(m["P"]); first = np.array([int(c[0]) for c in KEYS])
    p1 = P[first == 1].sum(); today, ser = feat[k]
    R.append(dict(k=k, month=mt["date"][:6], P=P, est=np.array(m["est"]), tri=mt["tri"], pay=mt["triPay"] or 0, p1=p1, t=today, s=ser))
pickle.dump(R, open("/tmp/ashiR.pkl", "wb")); print("races", len(R))
