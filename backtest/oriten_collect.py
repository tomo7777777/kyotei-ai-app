"""オリジナル展示（BOATCAST）の過去分を集める: backtest/oriten_hist/{hd}_{jcd}.json"""
import json, os, re, sys, datetime, concurrent.futures as cf, urllib.request
V = ["01", "02", "04", "12", "14", "22"]
KEYMAP = {"一周": "lap", "半周ラップ": "half", "半周": "half", "まわり足": "turn", "直線": "straight"}
OUT = os.path.join(os.path.dirname(__file__), "oriten_hist")
def get(jcd, hd, r):
    url = f"https://race.boatcast.jp/txt/{jcd}/bc_oriten_{hd}_{jcd}_{r:02d}.txt"
    try:
        t = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read().decode("utf-8", "replace")
    except Exception: return None
    rows = [l.split("\t") for l in re.split(r"\r?\n", t)]
    if len(rows) < 9 or rows[0][0].strip() != "data=" or rows[1][0].strip() != "1": return None
    cnt = int(rows[1][1]); labels = [re.sub(r"[\s　]", "", s) for s in rows[2][:cnt]]; keys = [KEYMAP.get(l, "") for l in labels]
    lanes = []
    for row in rows[3:9]:
        try: lane = int(row[0])
        except Exception: continue
        tt = {}
        for j, k in enumerate(keys):
            if not k: continue
            try: v = float(row[j + 2]); tt[k] = v if v > 0 else None
            except Exception: tt[k] = None
        lanes.append({"lane": lane, "name": re.sub(r"[\s　]+", " ", row[1]).strip(), "t": tt})
    return {"keys": [k for k in keys if k], "lanes": lanes} if len(lanes) == 6 else None
def day(jcd, hd):
    f = os.path.join(OUT, f"{hd}_{jcd}.json")
    if os.path.exists(f): return
    first = get(jcd, hd, 1) or get(jcd, hd, 2)
    if not first: json.dump({}, open(f, "w")); return
    d = {}
    for r in range(1, 13):
        x = get(jcd, hd, r)
        if x: d[r] = x
    json.dump(d, open(f, "w"), ensure_ascii=False)
a, b = sys.argv[1], sys.argv[2]
d0 = datetime.date(int(a[:4]), int(a[4:6]), int(a[6:])); d1 = datetime.date(int(b[:4]), int(b[4:6]), int(b[6:]))
jobs = []
while d0 <= d1:
    for j in V: jobs.append((j, d0.strftime("%Y%m%d")))
    d0 += datetime.timedelta(days=1)
with cf.ThreadPoolExecutor(8) as ex: list(ex.map(lambda x: day(*x), jobs))
print("done", len(jobs))
