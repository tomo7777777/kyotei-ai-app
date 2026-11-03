"""Feature engineering from historical race results. Strictly uses only races before the target race."""
from collections import defaultdict, deque
import math
import numpy as np

NAT_C = [[55, 15, 8], [14, 27, 20], [12, 22, 21], [10, 19, 20], [6, 13, 18], [2, 8, 13]]  # course 1st/2nd/3rd %
CLS = {"A1": 3, "A2": 2, "B1": 1, "B2": 0}

FEATURES = [
    "course", "natWin", "nat2", "locWin", "loc2", "motor2", "boat2", "cls", "age", "weight",
    "ex_rel", "ex_rank", "wind", "wave",
    "rc_n", "rc_win", "rc_top2", "rc_top3", "rc_st",
    "r90_n", "r90_fin", "r90_win", "r10_fin", "rst_mean", "rst_sd", "rf_180",
    "rv_n", "rv_fin", "mot_n", "mot_fin", "mot_win",
    "vc_win", "vc_top3",
    "natWin_rel", "rc_win_rel", "r90_fin_rel", "mot_fin_rel", "rst_rel", "cls_rel",
    "inner_pressure", "c1_natWin", "c1_rc_win",
    "rc_2nd", "rc_3rd", "rc_recent_win", "rc_recent_top2", "mot_top2", "sashi_rate", "makuri_rate", "makurizashi_rate", "nige_lost_rate",
    "c1_nige_lost", "c2_sashi", "outer_makuri_max", "rc_top2_rel", "rc_top3_rel",
]

def dnum(date):  # yyyymmdd -> day number
    y, m, d = int(date[:4]), int(date[4:6]), int(date[6:8])
    import datetime as dt
    return dt.date(y, m, d).toordinal()

def _rc(): return [[0, 0, 0, 0, 0.0, 0] for _ in range(6)]
def _d60(): return deque(maxlen=60)
def _d40(): return deque(maxlen=40)
def _d3000(): return deque(maxlen=3000)
def _d30(): return deque(maxlen=30)
def _km(): return [0, 0, 0, 0, 0, 0]  # starts from course>=2, sashi, makuri, makurizashi, c1 starts, c1 lost

class History:
    def __init__(self):
        self.rc = defaultdict(_rc)  # toban -> course -> [n, w, t2, t3, stsum, stn]
        self.recent = defaultdict(_d60)   # toban -> (day, fin, st, fl, jcd)
        self.motor = defaultdict(_d40)    # (jcd, motor) -> (day, fin)
        self.vc = defaultdict(_d3000)     # (jcd, course) -> fin
        self.rv = defaultdict(_d30)       # (toban, jcd) -> (day, fin)
        self.km = defaultdict(_km)

    def feats(self, race):
        """race: dict(date, jcd, wind, wave, boats=[{lane,toban,course,ex,natWin,...}]) -> np.array 6xF"""
        day = dnum(race["date"]); jcd = race["jcd"]; B = race["boats"]
        exs = [b.get("ex") for b in B]
        exok = all(x and x > 0 for x in exs)
        exm = float(np.mean(exs)) if exok else 0
        rows = []
        for b in B:
            c = b["course"]; t = b["toban"]
            r = self.rc[t][c - 1]; n = r[0]; k = 8
            pw, p2, p3 = NAT_C[c - 1][0], NAT_C[c - 1][0] + NAT_C[c - 1][1], sum(NAT_C[c - 1])
            rc_win = (r[1] * 100 + pw * k) / (n + k); rc_top2 = (r[2] * 100 + p2 * k) / (n + k); rc_top3 = (r[3] * 100 + p3 * k) / (n + k)
            rc_st = (r[4] + 0.17 * 3) / (r[5] + 3)
            rec = [x for x in self.recent[t] if day - x[0] <= 90]
            fins = [x[1] for x in rec if x[1]]
            r90_n = len(rec); r90_fin = (sum(fins) + 3.5 * 3) / (len(fins) + 3); r90_win = (sum(1 for f in fins if f == 1) + 0.17 * 3) / (len(fins) + 3)
            last = [x[1] for x in list(self.recent[t])[-10:] if x[1]]
            r10_fin = (sum(last) + 3.5 * 2) / (len(last) + 2)
            sts = [x[2] for x in self.recent[t] if x[2] is not None and day - x[0] <= 180]
            rst_mean = (sum(sts) + 0.17 * 3) / (len(sts) + 3); rst_sd = float(np.std(sts)) if len(sts) >= 3 else 0.06
            rf_180 = sum(1 for x in self.recent[t] if x[3] == 1 and day - x[0] <= 180)
            rv = [x[1] for x in self.rv[(t, jcd)] if x[1]]
            rv_n = len(rv); rv_fin = (sum(rv) + 3.5 * 3) / (rv_n + 3)
            mo = [x[1] for x in self.motor[(jcd, b.get("motor"))] if x[1] and day - x[0] <= 150]
            mot_n = len(mo); mot_fin = (sum(mo) + 3.5 * 5) / (mot_n + 5); mot_win = (sum(1 for f in mo if f == 1) + 0.17 * 5) / (mot_n + 5)
            vc = self.vc[(jcd, c)]
            vc_win = (sum(1 for f in vc if f == 1) + NAT_C[c - 1][0] / 100 * 50) / (len(vc) + 50)
            vc_top3 = (sum(1 for f in vc if f and f <= 3) + sum(NAT_C[c - 1]) / 100 * 50) / (len(vc) + 50)
            r2nd = ((r[2] - r[1]) * 100 + NAT_C[c - 1][1] * k) / (n + k); r3rd = ((r[3] - r[2]) * 100 + NAT_C[c - 1][2] * k) / (n + k)
            rcr = [x for x in self.recent[t] if len(x) > 5 and x[5] == c and day - x[0] <= 240]
            rcr_f = [x[1] for x in rcr if x[1]]
            rc_recent_win = (sum(1 for f in rcr_f if f == 1) + pw / 100 * 4) / (len(rcr_f) + 4)
            rc_recent_top2 = (sum(1 for f in rcr_f if f <= 2) + p2 / 100 * 4) / (len(rcr_f) + 4)
            mot_top2 = (sum(1 for f in mo if f <= 2) + 0.33 * 5) / (mot_n + 5)
            km = self.km[t]
            sashi = (km[1] + 0.04 * 10) / (km[0] + 10); makuri = (km[2] + 0.04 * 10) / (km[0] + 10); mz = (km[3] + 0.03 * 10) / (km[0] + 10)
            nige_lost = (km[5] + 0.45 * 6) / (km[4] + 6)
            rows.append(dict(
                rc_2nd=r2nd, rc_3rd=r3rd, rc_recent_win=rc_recent_win, rc_recent_top2=rc_recent_top2, mot_top2=mot_top2,
                sashi_rate=sashi, makuri_rate=makuri, makurizashi_rate=mz, nige_lost_rate=nige_lost,
                course=c, natWin=b.get("natWin") or 0, nat2=b.get("nat2") or 0, locWin=b.get("locWin") or 0, loc2=b.get("loc2") or 0,
                motor2=b.get("motor2") or 0, boat2=b.get("boat2") or 0, cls=CLS.get(b.get("cls"), 1), age=b.get("age") or 35, weight=b.get("weight") or 52,
                ex_rel=(b["ex"] - exm) if exok else 0, ex_rank=(sorted(exs).index(b["ex"]) + 1) if exok else 3.5,
                wind=race.get("wind") or 0, wave=race.get("wave") or 0,
                rc_n=n, rc_win=rc_win, rc_top2=rc_top2, rc_top3=rc_top3, rc_st=rc_st,
                r90_n=r90_n, r90_fin=r90_fin, r90_win=r90_win, r10_fin=r10_fin, rst_mean=rst_mean, rst_sd=rst_sd, rf_180=rf_180,
                rv_n=rv_n, rv_fin=rv_fin, mot_n=mot_n, mot_fin=mot_fin, mot_win=mot_win, vc_win=vc_win, vc_top3=vc_top3,
            ))
        for key, src in [("rc_top2_rel", "rc_top2"), ("rc_top3_rel", "rc_top3"), ("natWin_rel", "natWin"), ("rc_win_rel", "rc_win"), ("r90_fin_rel", "r90_fin"), ("mot_fin_rel", "mot_fin"), ("rst_rel", "rc_st"), ("cls_rel", "cls")]:
            m = np.mean([x[src] for x in rows])
            for x in rows: x[key] = x[src] - m
        by_course = {x["course"]: x for x in rows}
        for x in rows:
            inner = [by_course[cc] for cc in range(1, x["course"]) if cc in by_course]
            x["inner_pressure"] = float(np.mean([y["rc_st"] for y in inner])) - x["rc_st"] if inner else 0
            c1 = by_course.get(1, rows[0])
            x["c1_natWin"] = c1["natWin"]; x["c1_rc_win"] = c1["rc_win"]; x["c1_nige_lost"] = c1["nige_lost_rate"]
            x["c2_sashi"] = by_course[2]["sashi_rate"] if 2 in by_course else 0.04
            x["outer_makuri_max"] = max([by_course[cc]["makuri_rate"] for cc in (3, 4) if cc in by_course] or [0.04])
        return np.array([[x[f] for f in FEATURES] for x in rows], dtype=float)

    def update(self, race):
        day = dnum(race["date"]); jcd = race["jcd"]
        for b in race["boats"]:
            c = b["course"]; t = b["toban"]; fin = b.get("fin")
            r = self.rc[t][c - 1]; r[0] += 1
            if fin == 1: r[1] += 1
            if fin and fin <= 2: r[2] += 1
            if fin and fin <= 3: r[3] += 1
            if b.get("st") is not None and b.get("fl") == 0: r[4] += b["st"]; r[5] += 1
            self.recent[t].append((day, fin, b.get("st") if b.get("fl") == 0 else None, b.get("fl"), jcd, c))
            km = self.km[t]; kim = race.get("kimarite", "")
            if c >= 2:
                km[0] += 1
                if fin == 1 and kim == "差し": km[1] += 1
                if fin == 1 and kim == "まくり": km[2] += 1
                if fin == 1 and kim == "まくり差し": km[3] += 1
            else:
                km[4] += 1
                if fin != 1: km[5] += 1
            self.motor[(jcd, b.get("motor"))].append((day, fin))
            self.vc[(jcd, c)].append(fin)
            self.rv[(t, jcd)].append((day, fin))
