import sys; sys.path.insert(0,"backtest")
import pickle, json, itertools, numpy as np
from payout_model import KEYS
D=pickle.load(open("backtest/manshu_data.pkl","rb")); KI={k:j for j,k in enumerate(KEYS)}
HEAD=np.array([int(k[0]) for k in KEYS])
def sel_topk(d,k,omin=80):
    c=np.where(d["est"]>=omin)[0]; return c[np.argsort(-d["P"][c])][:k]
def sel_head(d,k,omin=80):
    c=np.where(d["est"]>=omin)[0]
    if not len(c): return c
    hs={}
    for j in c: hs[HEAD[j]]=hs.get(HEAD[j],0)+d["P"][j]
    h=max(hs,key=hs.get); cc=c[HEAD[c]==h]; return cc[np.argsort(-d["P"][cc])][:k]
def sel_ev(d,k,omin=80):
    c=np.where(d["est"]>=omin)[0]; return c[np.argsort(-(d["P"][c]*np.sqrt(d["est"][c])))][:k]
A=[d for d in D if d["month"]<"202608"]; B=[d for d in D if d["month"]>="202608"]
rng=np.random.default_rng(0)
def run(ds,f,k,th):
    g=[]
    for d in ds:
        s=f(d,k)
        if len(s)<k or d["P"][s].sum()<th: continue
        y=KI.get(d["tri"]); g.append((d["pay"] if y is not None and y in s else 0)/(100*k))
    return np.array(g)
res=[]
for name,f in (("topk",sel_topk),("head",sel_head),("ev",sel_ev)):
    for k in (6,8,10,12,15):
        sc=np.array([d["P"][f(d,k)].sum() if len(f(d,k))>=k else 0 for d in A])
        for q in (0.9,0.95):
            th=float(np.quantile(sc,q)); a=run(A,f,k,th); b=run(B,f,k,th)
            res.append(dict(name=name,k=k,q=q,th=th,A=float(a.mean()),B=float(b.mean()),nA=len(a),nB=len(b),hitB=float((b>0).mean())))
            print(name,k,q,round(th,3),"A",len(a),round(a.mean(),3),"B",len(b),round(b.mean(),3),"hitB",round((b>0).mean(),3),flush=True)
json.dump(res,open("backtest/manshu_var.json","w"))
