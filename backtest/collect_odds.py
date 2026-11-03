"""Collect final 単勝 / 2連単 / 2連複 odds for past races (boatrace.jp)."""
import sys, os, json, pickle, time, threading, requests
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
sys.path.insert(0, "backtest")
B = "https://www.boatrace.jp/owpc/pc/race"
H = {"User-Agent": "Mozilla/5.0"}
lo, hi = sys.argv[1], sys.argv[2]; conc = int(sys.argv[3]) if len(sys.argv) > 3 else 8
races = [r for r in pickle.load(open("backtest/races.pkl", "rb")) if lo <= r["date"] <= hi]
races.sort(key=lambda r: r["date"], reverse=True)
lock = threading.Lock(); have = set()
for f in os.listdir("backtest/odds_final"):
    for line in open(f"backtest/odds_final/{f}"):
        d = json.loads(line); have.add((d["date"], d["jcd"], d["rno"]))
todo = [r for r in races if (r["date"], r["jcd"], r["rno"]) not in have]
print("todo", len(todo), flush=True)
def get(url):
    for k in range(4):
        try:
            r = requests.get(url, headers=H, timeout=40)
            if r.status_code == 200: return r.text
        except Exception: pass
        time.sleep(2 + 3 * k)
    return None
def num(s):
    try: return float(s)
    except Exception: return None
def job(r):
    q = f"rno={r['rno']}&jcd={r['jcd']}&hd={r['date']}"
    h1 = get(f"{B}/oddstf?{q}"); h2 = get(f"{B}/odds2tf?{q}")
    if not h1 or not h2: return
    tan, ex, qu = {}, {}, {}
    t = BeautifulSoup(h1, "html.parser").select("div.table1 table")
    if len(t) > 1:
        for tr in t[1].select("tbody tr"):
            td = [x.get_text(strip=True) for x in tr.find_all("td")]
            if len(td) >= 3 and num(td[2]): tan[td[0]] = num(td[2])
    t = BeautifulSoup(h2, "html.parser").select("div.table1 table")
    for ti, store in ((1, ex), (2, qu)):
        if len(t) <= ti: continue
        for tr in t[ti].select("tbody tr"):
            td = [x.get_text(strip=True) for x in tr.find_all("td")]
            for col in range(6):
                if col * 2 + 1 >= len(td): break
                sec, od = td[col * 2], num(td[col * 2 + 1])
                if sec.isdigit() and od:
                    k = f"{col + 1}-{sec}" if ti == 1 else "-".join(sorted([str(col + 1), sec]))
                    store[k] = od
    if not tan: return
    with lock:
        with open(f"backtest/odds_final/{r['date']}.jsonl", "a") as f:
            f.write(json.dumps(dict(date=r["date"], jcd=r["jcd"], rno=r["rno"], tan=tan, ex=ex, qu=qu)) + "\n")
n = [0]; t0 = time.time()
def wrap(r):
    try: job(r)
    except Exception as e: print("err", e, flush=True)
    n[0] += 1
    if n[0] % 100 == 0: print(n[0], "/", len(todo), round(time.time() - t0), "s", flush=True)
with ThreadPoolExecutor(conc) as ex: list(ex.map(wrap, todo))
print("done", flush=True)
