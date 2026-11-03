"""船足・展示・スタート展示・オッズを使った1着モデル用データ: /tmp/ashi_ds.pkl"""
import json, glob, os, pickle, sys, datetime, collections, numpy as np
sys.path.insert(0, "."); from payout_model import KEYS
R = pickle.load(open("/tmp/ashiR.pkl", "rb")); BF = json.load(open("before_hist.json"))
ORI = {}
for f in sorted(glob.glob("oriten_hist/*.json")):
    hd, j = os.path.basename(f)[:-5].split("_")
    for r, x in json.load(open(f)).items(): ORI[(hd, j, int(r))] = x
OD = {}
for f in glob.glob("odds3_final/*.jsonl"):
    for l in open(f):
        o = json.loads(l); OD[(o["hd"], o["jcd"], int(o["rno"]))] = o["odds3"]
fst = np.array([int(c[0]) for c in KEYS]); snd = np.array([int(c[2]) for c in KEYS])
MK = ["straight", "turn", "lap", "half"]
# 今節の平均（偏差・順位）を名前で追跡
hist = collections.defaultdict(list); lastd = {}; SER = {}
for k in sorted(ORI):
    hd, j, r = k; x = ORI[k]
    if j in lastd and lastd[j] != hd:
        a = datetime.date(int(lastd[j][:4]), int(lastd[j][4:6]), int(lastd[j][6:])); b = datetime.date(int(hd[:4]), int(hd[4:6]), int(hd[6:]))
        if (b - a).days > 1:
            for kk in [kk for kk in hist if kk[0] == j]: hist.pop(kk)
    lastd[j] = hd
    devs = {}
    for m in x["keys"]:
        vs = [l["t"].get(m) for l in x["lanes"]]; ok = [v for v in vs if v]
        if len(ok) >= 4: mu = np.mean(ok); devs[m] = {l["lane"]: (l["t"][m] - mu if l["t"].get(m) else None) for l in x["lanes"]}
    SER[k] = {l["lane"]: (np.mean(hist[(j, l["name"])]) if hist[(j, l["name"])] else np.nan, len(hist[(j, l["name"])])) for l in x["lanes"]}
    for l in x["lanes"]:
        ds = [devs[m][l["lane"]] for m in devs if devs[m][l["lane"]] is not None]
        if ds: hist[(j, l["name"])].append(np.mean(ds))
rows = []; races = []
for ri, r in enumerate(R):
    k = r["k"]; bf = BF.get(f"{k[0]}-{k[1]}-{k[2]}"); od = OD.get(k); x = ORI.get(k)
    if not bf or not od or not x: continue
    o = np.array([od.get(c, np.nan) for c in KEYS], float)
    if np.isnan(o).sum() > 10: continue
    q = np.where(np.isnan(o), 0, 1 / np.where(np.isnan(o), 1, o)); q = q / q.sum()
    qf = np.array([q[fst == l].sum() for l in range(1, 7)]); pf = np.array([r["P"][fst == l].sum() for l in range(1, 7)])
    ex = np.array([bf["ex"].get(str(l)) or np.nan for l in range(1, 7)], float)
    st = np.array([(bf["st"].get(str(l)) if bf["st"].get(str(l)) is not None else np.nan) for l in range(1, 7)], float) / 100
    co = np.array([bf["course"].get(str(l), l) for l in range(1, 7)], float)
    tl = np.array([bf["tilt"].get(str(l)) if bf["tilt"].get(str(l)) is not None else np.nan for l in range(1, 7)], float)
    om = {}
    for m in MK:
        vs = np.array([(lx["t"].get(m) or np.nan) if m in x["keys"] else np.nan for lx in sorted(x["lanes"], key=lambda z: z["lane"])], float)
        om[m] = vs - np.nanmean(vs) if np.sum(~np.isnan(vs)) >= 4 else np.full(6, np.nan)
    exd = ex - np.nanmean(ex); ser = SER[k]
    win = int(r["tri"][0]) if r["tri"] and r["tri"][0].isdigit() else -1
    for l in range(1, 7):
        i = l - 1; inn = i - 1
        f = dict(ri=ri, lane=l, pf=pf[i], qf=qf[i], lq=np.log(qf[i] + 1e-6), exd=exd[i], exr=np.sum(ex < ex[i]) + 1 if not np.isnan(ex[i]) else np.nan,
                 st=st[i], str_=np.sum(st < st[i]) + 1 if not np.isnan(st[i]) else np.nan, co=co[i], comv=co[i] - l, tilt=tl[i], wind=bf.get("wind"), wd=bf.get("wd"),
                 ex_in=exd[i] - exd[inn] if inn >= 0 else np.nan, st_in=st[i] - st[inn] if inn >= 0 else np.nan,
                 st_in2=st[i] - np.nanmin(st[:i]) if i > 0 else np.nan, st_out=st[i] - st[i + 1] if i < 5 else np.nan,
                 ser=ser[l][0] if ser[l][1] >= 2 else np.nan, sern=ser[l][1], y=int(win == l))
        for m in MK:
            f[m] = om[m][i]; f[m + "_in"] = om[m][i] - om[m][inn] if inn >= 0 else np.nan
            f[m + "_r"] = (np.sum(om[m] < om[m][i]) + 1) if not np.isnan(om[m][i]) else np.nan
        rows.append(f)
    races.append(dict(ri=ri, k=k, month=r["month"], P=r["P"], o=o, q=q, tri=r["tri"], pay=r["pay"]))
pickle.dump((rows, races), open("/tmp/ashi_ds.pkl", "wb")); print("races", len(races), "rows", len(rows))
