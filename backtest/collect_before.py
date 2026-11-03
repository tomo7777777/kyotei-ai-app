"""直前情報（展示タイム・スタート展示・展示進入・チルト・気象）の過去分: before_hist.json"""
import json, os, sys, re, concurrent.futures as cf, urllib.request, threading
from bs4 import BeautifulSoup
keys = json.load(open(sys.argv[1])); OUT = "before_hist.json"
data = json.load(open(OUT)) if os.path.exists(OUT) else {}
todo = [k for k in keys if f"{k[0]}-{k[1]}-{k[2]}" not in data]; print("todo", len(todo), flush=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
num = lambda s: (lambda m: float(m.group()) if m else None)(re.search(r"-?\d+(\.\d+)?", s or ""))
lock = threading.Lock(); cnt = [0]
def one(k):
    hd, j, r = k
    url = f"https://www.boatrace.jp/owpc/pc/race/beforeinfo?rno={r}&jcd={j}&hd={hd}"
    for _ in range(2):
        try: html = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40).read().decode("utf-8", "replace"); break
        except Exception: html = None
    if not html: return
    s = BeautifulSoup(html, "lxml"); ex = {}; tilt = {}; st = {}; course = {}
    for tb in s.select("div.table1 table.is-w748 tbody"):
        tr = tb.find_all("tr")
        if not tr: continue
        tds = [td.get_text(strip=True) for td in tr[0].find_all("td", recursive=False)]
        if not tds: continue
        lane = num(tds[0])
        if not lane: continue
        lane = int(lane); ex[lane] = num(tds[4]) if len(tds) > 4 else None; tilt[lane] = num(tds[5]) if len(tds) > 5 else None
    for i, tr in enumerate(s.select("div.table1 table.is-w238 tbody tr")):
        a = tr.select_one(".table1_boatImage1Number"); b = tr.select_one(".table1_boatImage1Time")
        if not a: continue
        lane = num(a.get_text()); 
        if not lane: continue
        lane = int(lane); course[lane] = i + 1; t = (b.get_text(strip=True) if b else ""); v = num(t.replace("F", "")) if t else None
        st[lane] = (-v if v is not None and "F" in t else v)
    w = s.select_one(".weather1"); wind = None
    if w:
        u = w.select_one(".weather1_bodyUnit.is-wind"); wind = num(u.get_text()) if u else None
        d = w.select_one(".weather1_bodyUnit.is-windDirection p"); wd = re.search(r"is-wind(\d+)", " ".join(d.get("class", []))) if d else None
    with lock:
        data[f"{hd}-{j}-{r}"] = {"ex": ex, "st": st, "course": course, "tilt": tilt, "wind": wind, "wd": int(wd.group(1)) if w and wd else None}
        cnt[0] += 1
        if cnt[0] % 300 == 0: json.dump(data, open(OUT, "w")); print(cnt[0], flush=True)
with cf.ThreadPoolExecutor(40) as e: list(e.map(one, todo))
json.dump(data, open(OUT, "w")); print("done", len(data), flush=True)
