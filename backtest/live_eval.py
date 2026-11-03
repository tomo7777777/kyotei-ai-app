"""Evaluate distortion rules on odds logged ~5 min before deadline, using official K results."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import parse_kb as P
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def mk(od):
    inv = {c: 1 / v for c, v in od.items() if v > 0}; s = sum(inv.values()) or 1; return {c: v / s for c, v in inv.items()}
def run():
    logdir = os.path.join(ROOT, "data/oddslog"); res = {}; races = set(); days = []
    for f in sorted(os.listdir(logdir)) if os.path.isdir(logdir) else []:
        hd = f[:8]; kf = os.path.join(ROOT, f"backtest/kb/K{hd[2:]}.TXT")
        if not os.path.exists(kf): continue
        K = P.parse_k(kf); days.append(hd)
        for line in open(os.path.join(logdir, f)):
            d = json.loads(line); k = K.get((d["jcd"], d["rno"]))
            if not k or d.get("modelKind") != "ml" or not d.get("modelP"): continue
            fins = {b: x.get("fin") for b, x in k["boats"].items()}
            first = [b for b, v in fins.items() if v == 1]; second = [b for b, v in fins.items() if v == 2]
            if not first: continue
            stg = str(d.get("stage", 5)); races.add((hd, d["jcd"], d["rno"]))
            R = res.setdefault(stg, {"tan": [0, 0, 0], "qu": [0, 0, 0]})
            tan, qu = {}, {}
            for c, p in d["modelP"].items():
                a, b = c.split("-")[:2]; tan[a] = tan.get(a, 0) + p; q = "-".join(sorted([a, b])); qu[q] = qu.get(q, 0) + p
            m = mk(d["tan"])
            for c, v in d["tan"].items():
                p = 0.5 * tan.get(c, 0) + 0.5 * m.get(c, 0)
                if p * v >= 1.5:
                    R["tan"][0] += 1
                    if int(c) == first[0]: R["tan"][1] += k.get("win1Pay") or 0; R["tan"][2] += 1
            m = mk(d.get("qu") or {}); win_q = "-".join(sorted([str(first[0]), str(second[0])])) if second else None
            qpay = {c: p for c, p, _ in k.get("pay", {}).get("2連複", [])}
            for c, v in (d.get("qu") or {}).items():
                p = 0.7 * qu.get(c, 0) + 0.3 * m.get(c, 0)
                if p >= 0.05 and p * v >= 2.0:
                    R["qu"][0] += 1
                    if c in qpay: R["qu"][1] += qpay[c]; R["qu"][2] += 1
    fmt = lambda v: dict(bets=v[0], roi=(v[1] / (100 * v[0])) if v[0] else None, hits=v[2])
    stages = {st: {k: fmt(v) for k, v in R.items()} for st, R in res.items()}
    out = dict(races=len(races), days=days, stages=stages, rules=stages.get("5", {"tan": fmt([0, 0, 0]), "qu": fmt([0, 0, 0])}))
    json.dump(out, open(os.path.join(ROOT, "backtest/live_eval.json"), "w"), ensure_ascii=False)
    return out
if __name__ == "__main__": print(run())
