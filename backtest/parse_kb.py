"""Parse official B (番組表) and K (競走成績) text files into a race table (parquet-free: pickle)."""
import re, os, glob, pickle, unicodedata, sys

def z2h(s):
    return unicodedata.normalize("NFKC", s)

def fnum(s):
    try: return float(s)
    except: return None

def parse_b(path):
    """returns {(jcd, rno): {"title":..., "dist":..., "boats": {lane: {...}}}}"""
    out = {}; jcd = None; rno = None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\r\n")
        m = re.match(r"^(\d\d)BBGN", line)
        if m: jcd = m.group(1); continue
        if re.match(r"^\d\dBEND", line): jcd = None; continue
        h = z2h(line)
        m = re.match(r"^\s*(\d+)R\s+(.*?)\s+H(\d+)m", h)
        if m and jcd:
            rno = int(m.group(1)); out[(jcd, rno)] = dict(title=m.group(2).strip(), dist=int(m.group(3)), boats={}); continue
        if jcd and rno and re.match(r"^[1-6] \d{4}", line):
            try:
                lane = int(line[0]); toban = line[2:6]; age = int(z2h(line[10:12])); branch = line[12:14]
                weight = int(z2h(line[14:16])); cls = z2h(line[16:18])
                f = lambda a, b: fnum(line[a:b].strip())
                out[(jcd, rno)]["boats"][lane] = dict(toban=toban, age=age, weight=weight, cls=cls, natWin=f(18, 23), nat2=f(23, 29),
                    locWin=f(29, 34), loc2=f(34, 40), motor2=f(43, 49), boat2=f(52, 58))
            except Exception:
                pass
    return out

ROW = re.compile(r"^\s*(\S+)\s+([1-6])\s+(\d{4})\s+(.+?)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+([1-6])\s+(\S+)")
def parse_k(path):
    out = {}; jcd = None; cur = None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\r\n")
        m = re.match(r"^(\d\d)KBGN", line)
        if m: jcd = m.group(1); continue
        if re.match(r"^\d\dKEND", line): jcd = None; cur = None; continue
        h = z2h(line)
        m = re.match(r"^\s+(\d+)R\s+(.*?)\s+H(\d+)m\s+(\S+)\s+風\s+(\S+)\s+(\d+)m\s+波\s+(\d+)cm", h)
        if m and jcd:
            rno = int(m.group(1))
            cur = out[(jcd, rno)] = dict(weather=m.group(4), windDir=m.group(5), wind=int(m.group(6)), wave=int(m.group(7)), boats={}, tri=None, triPay=None, triPop=None, win1Pay=None, pay={}, kimarite="")
            continue
        if cur is not None:
            mk = re.search(r"レースタイム\s+(\S+)", h)
            if mk: cur["kimarite"] = mk.group(1); continue
        if cur is None: continue
        r = ROW.match(h)
        if r and r.group(1) in ("01", "02", "03", "04", "05", "06", "F", "L", "K0", "K1", "S0", "S1", "S2", "L0", "L1", "F0", "F1") or (r and re.match(r"^\d\d$", r.group(1))):
            fin = r.group(1); lane = int(r.group(2)); st = r.group(9)
            stv = None; fl = 0
            if st.startswith("F"): fl = 1; stv = fnum(st[1:])
            elif st.startswith("L"): fl = 2
            else: stv = fnum(st)
            cur["boats"][lane] = dict(fin=int(fin) if fin.isdigit() else None, finRaw=fin, toban=r.group(3), motor=int(r.group(5)),
                                      boat=int(r.group(6)), ex=fnum(r.group(7)), course=int(r.group(8)), st=stv, fl=fl)
            continue
        m = re.match(r"^\s+(2連単|2連複|3連複)\s+(\d-\d(?:-\d)?)\s+(\d+)\s+人気\s+(\d+)", h)
        if m: cur["pay"].setdefault(m.group(1), []).append((m.group(2), int(m.group(3)), int(m.group(4)))); continue
        m = re.match(r"^\s+3連単\s+(\d-\d-\d)\s+(\d+)\s+人気\s+(\d+)", h)
        if m and cur["tri"] is None: cur["tri"] = m.group(1); cur["triPay"] = int(m.group(2)); cur["triPop"] = int(m.group(3)); continue
        m = re.match(r"^\s+単勝\s+(\d)\s+(\d+)", h)
        if m and cur["win1Pay"] is None: cur["win1Pay"] = int(m.group(2))
    return out

def build(kb_dir="backtest/kb"):
    races = []
    for kp in sorted(glob.glob(f"{kb_dir}/K*.TXT")):
        ymd = os.path.basename(kp)[1:7]; bp = f"{kb_dir}/B{ymd}.TXT"
        if not os.path.exists(bp): continue
        K = parse_k(kp); Bd = parse_b(bp); date = "20" + ymd
        for key, k in K.items():
            b = Bd.get(key)
            if not b or len(b["boats"]) != 6 or len(k["boats"]) != 6: continue
            boats = []
            for lane in range(1, 7):
                bb = b["boats"][lane]; kk = k["boats"][lane]
                if bb["toban"] != kk["toban"]: break
                boats.append({**bb, **kk, "lane": lane})
            if len(boats) != 6: continue
            races.append(dict(date=date, jcd=key[0], rno=key[1], title=b["title"], dist=b["dist"], weather=k["weather"], windDir=k["windDir"],
                              wind=k["wind"], wave=k["wave"], tri=k["tri"], triPay=k["triPay"], triPop=k["triPop"], win1Pay=k["win1Pay"], pay=k["pay"], kimarite=k["kimarite"], boats=boats))
    races.sort(key=lambda r: (r["date"], r["jcd"], r["rno"]))
    return races

if __name__ == "__main__":
    if len(sys.argv) > 1:
        K = parse_k(sys.argv[1]); B = parse_b(sys.argv[2])
        k = next(iter(K.items())); print(k); print(next(iter(B.items()))); print(len(K), len(B))
    else:
        races = build(); pickle.dump(races, open("backtest/races.pkl", "wb")); print("races", len(races), races[0]["date"], races[-1]["date"])
