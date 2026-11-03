import sys; sys.path.insert(0,"backtest")
import pickle, json, numpy as np
from payout_model import KEYS
D=pickle.load(open("backtest/manshu_data.pkl","rb")); KI={k:j for j,k in enumerate(KEYS)}
def sel(d): c=np.where(d["est"]>=80)[0]; return c[np.argsort(-d["P"][c])][:10]
A2=pickle.load(open("backtest/arashi_oos2.pkl","rb"))["score"]
CUR=np.array([d["P"][sel(d)].sum() if len(sel(d))==10 else 0 for d in D])
from scipy.stats import rankdata
COMB=0.7*rankdata(CUR)/len(CUR)+0.3*rankdata(A2)/len(A2)
S_TH=np.quantile(COMB,0.97); A_TH=np.quantile(COMB,0.94)
for k,d in enumerate(D): d["comb"]=COMB[k]
rng=np.random.default_rng(0); out=dict(races=len(D), months=sorted({d["month"] for d in D}), tiers=[])
base=[]
for name, lo, hi in (("万舟S", S_TH, 9), ("万舟A", A_TH, S_TH), ("万舟S＋A", A_TH, 9), ("全レース", -1, 9)):
    g=[]; mon={}; pays=[]
    for d in D:
        s=sel(d)
        if len(s)<10: continue
        sc=d["comb"]
        if not (lo<=sc<hi): continue
        y=KI.get(d["tri"]); r=(d["pay"] if y is not None and y in s else 0)/1000; g.append(r); mon.setdefault(d["month"],[]).append(r)
        if r>0: pays.append(d["pay"])
    g=np.array(g); bs=[rng.choice(g,len(g)).mean() for _ in range(3000)]
    out["tiers"].append(dict(name=name, races=len(g), roi=float(g.mean()), lo=float(np.percentile(bs,5)), hi=float(np.percentile(bs,95)), hit=float((g>0).mean()), medianPay=float(np.median(pays)) if pays else 0, manHit=float(np.mean([p>=10000 for p in pays])) if pays else 0, monthly={m:float(np.mean(v)) for m,v in sorted(mon.items())}))
json.dump(out, open("backtest/manshu_summary.json","w"), ensure_ascii=False, indent=1)
for t in out["tiers"]: print(t["name"], t["races"], round(t["roi"],3), round(t["lo"],2), round(t["hi"],2), round(t["hit"],3), t["medianPay"], round(t["manHit"],2))
