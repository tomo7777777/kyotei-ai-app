import glob, json, random, re, pickle, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
sys.path.insert(0,'backtest'); from payout_model import KEYS
H1=[j for j,k in enumerate(KEYS) if k[0]=='1']
cands=[]
for f in sorted(glob.glob('backtest/odds3_final/*.jsonl')):
    for l in open(f):
        o=json.loads(l)
        if o['n']<110: continue
        od=[o['odds3'].get(KEYS[j]) for j in range(120)]
        if any(v is None for v in od): continue
        q=[1/v for v in od]; s=sum(q); qh=sum(q[j] for j in H1)/s
        if qh>=0.6: cands.append((o['hd'],o['jcd'],int(o['rno'])))
random.seed(1); random.shuffle(cands); cands=cands[:int(sys.argv[1])]
print('candidates',len(cands),flush=True)
Z=str.maketrans('０１２３４５６７８９','0123456789')
def parse(h):
    s=BeautifulSoup(h,'html.parser')
    tabs=[t for t in s.select('.tab2 li') if '日' in t.get_text()]
    day=None
    for k,t in enumerate(tabs):
        if 'is-active2' in (t.get('class') or []): day=k+1
    if day is None: return None
    out=[]
    for b in s.select('div.table1.is-tableFixed__3rdadd table tbody'):
        trs=b.find_all('tr',recursive=False)
        if len(trs)<4: continue
        r0=[td.get_text(strip=True).translate(Z) for td in trs[0].find_all('td',recursive=False)]
        tob=re.search(r'\d{4}',r0[2] or ''); 
        st=[td.get_text(strip=True).translate(Z) for td in trs[2].find_all('td',recursive=False)]
        fin=[td.get_text(strip=True).translate(Z) for td in trs[3].find_all('td',recursive=False)]
        crs=[td.get_text(strip=True).translate(Z) for td in trs[1].find_all('td',recursive=False)]
        lim=2*(day-1)
        out.append(dict(toban=tob.group(0) if tob else None, fin=fin[:lim], st=st[:lim], crs=crs[:lim]))
    return dict(day=day, racers=out) if len(out)==6 else None
def get(x):
    hd,jcd,rno=x; url=f'https://www.boatrace.jp/owpc/pc/race/racelist?rno={rno}&jcd={jcd}&hd={hd}'
    for i in range(3):
        try:
            h=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124'}),timeout=45).read().decode('utf-8','ignore')
            return x, parse(h)
        except Exception as e: time.sleep(2)
    return x, None
res={}; t0=time.time()
with ThreadPoolExecutor(30) as ex:
    for k,(x,p) in enumerate(ex.map(get,cands)):
        if p: res['-'.join(map(str,x))]=p
        if k%200==0: print(k, len(res), int(time.time()-t0),'s',flush=True)
json.dump(res,open('backtest/setsu_sample.json','w'))
print('done',len(res),int(time.time()-t0),'s')
