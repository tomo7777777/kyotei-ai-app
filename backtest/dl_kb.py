import datetime as dt, os, sys, lhafile, io, urllib.request, concurrent.futures as cf
OUT = "backtest/kb"
def get(kind, d):
    fn = f"{OUT}/{kind}{d:%y%m%d}.TXT"
    if os.path.exists(fn): return "skip"
    url = f"https://www1.mbrace.or.jp/od2/{kind}/{d:%Y%m}/{kind.lower()}{d:%y%m%d}.lzh"
    for t in range(3):
        try:
            b = urllib.request.urlopen(url, timeout=60).read()
            l = lhafile.Lhafile(io.BytesIO(b)); n = l.namelist()[0]
            open(fn, "w", encoding="utf-8").write(l.read(n).decode("cp932", errors="replace")); return "ok"
        except Exception as e: err = str(e)
    return "err " + err
start = dt.date.fromisoformat(sys.argv[1]); end = dt.date.fromisoformat(sys.argv[2])
days = [start + dt.timedelta(i) for i in range((end - start).days + 1)]
jobs = [(k, d) for d in days for k in ("K", "B")]
with cf.ThreadPoolExecutor(6) as ex:
    res = list(ex.map(lambda j: (j, get(*j)), jobs))
bad = [r for r in res if r[1].startswith("err")]
print("done", len(res), "errors", len(bad), bad[:5])
