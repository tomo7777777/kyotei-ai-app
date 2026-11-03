import json, glob, pickle, numpy as np, sys
sys.path.insert(0,'backtest'); from payout_model import KEYS
S=json.load(open('backtest/setsu_sample.json'))
X,FIN,meta,H=pickle.load(open('backtest/ds_seq.pkl','rb')); key={(m['date'],m['jcd'],int(m['rno'])):i for i,m in enumerate(meta)}
OD={}
for f in glob.glob('backtest/odds3_final/*.jsonl'):
    for l in open(f):
        o=json.loads(l); k=f"{o['hd']}-{o['jcd']}-{o['rno']}"
        if k in S: OD[k]=o['odds3']
def feat(r):
    f=[int(x) for x in r['fin'] if x.isdigit()]; bad=sum(1 for x in r['fin'] if x and not x.isdigit())
    st=[float(x) for x in r['st'] if x.replace('.','').replace('F','').isdigit() and 'F' not in x and x.startswith('.')]
    return dict(n=len(f), avg=np.mean(f) if f else np.nan, t3=np.mean([x<=3 for x in f]) if f else np.nan, t2=np.mean([x<=2 for x in f]) if f else np.nan, st=np.mean(st) if st else np.nan, bad=bad)
rows=[]
for k,v in S.items():
    if k not in OD or v['day']<3: continue
    hd,jcd,rno=k.split('-'); i=key.get((hd,jcd,int(rno)))
    if i is None or not meta[i]['triPay']: continue
    F=[feat(r) for r in v['racers']]
    for j,c in enumerate(KEYS):
        if c[0]!='1' or c not in OD[k]: continue
        b,cc=int(c[2])-1,int(c[4])-1
        rows.append(dict(k=k,hd=hd,b=F[b],c=F[cc],od=OD[k][c],hit=meta[i]['tri']==c,pay=meta[i]['triPay'] if meta[i]['tri']==c else 0,
                         brk=sorted([F[x]['avg'] for x in range(1,6) if F[x]['n']],).index(F[b]['avg'])+1 if F[b]['n'] else None))
print('races(3日目以降)',len(set(r['k'] for r in rows)),'combos',len(rows))
ud=sorted(set(r['hd'] for r in rows)); mid=ud[len(ud)//2]
def roi(f,name):
    s=[r for r in rows if f(r)]; a=[r for r in s if r['hd']<mid]; b=[r for r in s if r['hd']>=mid]
    R=lambda x: sum(r['pay'] for r in x)/(100*max(len(x),1))
    print(f"{name:34s} 点{len(s):6d} 的中{sum(r['hit'] for r in s):4d} 回収{R(s):.0%} 前半{R(a):.0%} 後半{R(b):.0%}")
roi(lambda r:True,'1頭20点すべて')
roi(lambda r:r['od']<20,'20倍未満すべて')
for th in (2.5,3.0):
    roi(lambda r,th=th:r['b']['n']>=3 and r['b']['avg']<=th,f'2着: 今節平均着順{th}以内')
    roi(lambda r,th=th:r['c']['n']>=3 and r['c']['avg']<=th,f'3着: 今節平均着順{th}以内')
    roi(lambda r,th=th:r['b']['n']>=3 and r['c']['n']>=3 and r['b']['avg']<=th and r['c']['avg']<=th,f'2・3着とも 平均着順{th}以内')
for t3 in (0.6,0.75):
    roi(lambda r,t3=t3:r['c']['n']>=3 and r['c']['t3']>=t3,f'3着: 今節3連対率{t3:.0%}以上')
    roi(lambda r,t3=t3:r['b']['n']>=3 and r['b']['t3']>=t3,f'2着: 今節3連対率{t3:.0%}以上')
    roi(lambda r,t3=t3:r['c']['n']>=3 and r['c']['t3']>=t3 and r['od']>=20,f'3着: 今節3連対率{t3:.0%}以上 20倍以上')
    roi(lambda r,t3=t3:r['b']['n']>=3 and r['b']['t3']>=t3 and r['od']>=20,f'2着: 今節3連対率{t3:.0%}以上 20倍以上')
roi(lambda r:r['c']['n']>=3 and r['c']['avg']>=4.5,'3着: 今節不調(平均4.5以下)')
roi(lambda r:r['b']['n']>=3 and r['b']['st']==r['b']['st'] and r['b']['st']<=0.12,'2着: 今節平均ST0.12以内')
roi(lambda r:r['c']['n']>=3 and r['c']['st']==r['c']['st'] and r['c']['st']<=0.12,'3着: 今節平均ST0.12以内')
roi(lambda r:r['brk']==1,'2着: 今節成績がレース内(2〜6号艇)で1位')
roi(lambda r:r['brk']==1 and r['od']>=15,'2着: 今節1位 かつ15倍以上')
print('--- 感度と頑健性（2・3着とも今節好調）')
for th in (2.0,2.3,2.5,2.7,3.0):
  for nmin in (2,3,4):
    roi(lambda r,th=th,nmin=nmin:r['b']['n']>=nmin and r['c']['n']>=nmin and r['b']['avg']<=th and r['c']['avg']<=th,f'平均{th}以内 出走{nmin}回以上')
s=[r for r in rows if r['b']['n']>=3 and r['c']['n']>=3 and r['b']['avg']<=2.5 and r['c']['avg']<=2.5]
p=sorted([r['pay'] for r in s if r['hit']],reverse=True); print('払戻 上位',p[:8],'中央値',np.median(p))
print('上位3件を除いた回収', (sum(p)-sum(p[:3]))/(100*len(s)))
print('1レースあたり点数', len(s)/len(set(r['k'] for r in s)), 'レース数', len(set(r['k'] for r in s)))
months={}
for r in s: months.setdefault(r['hd'][:6],[]).append(r)
for m,x in sorted(months.items()): print(m, len(x), sum(r['hit'] for r in x), f"{sum(r['pay'] for r in x)/(100*len(x)):.0%}")
print('--- 朝のAI(1号艇1着率)で対象レースを決めた場合')
MD={d['i']:d for d in pickle.load(open('backtest/morning_data.pkl','rb'))}
A=np.array([int(c[0]) for c in KEYS])
w1={}
for r in rows:
    if r['k'] not in w1:
        hd,jcd,rno=r['k'].split('-'); i=key[(hd,jcd,int(rno))]; w1[r['k']]=MD[i]['P'][A==1].sum() if i in MD else 0
for th in (0.6,0.7,0.8,0.9):
    roi(lambda r,th=th: w1[r['k']]>=th and r['b']['n']>=3 and r['c']['n']>=3 and r['b']['avg']<=2.5 and r['c']['avg']<=2.5, f'AI1着率{th}以上 & 2・3着好調')
