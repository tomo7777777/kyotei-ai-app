"""Prediction micro-service for the machine-learning model (port 5001).
POST /predict  {date, jcd, wind, wave, boats:[...6], market:[120 probs in KEYS order] | null}
"""
import json, pickle, sys, os, glob, threading, time, itertools, datetime as dt
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np, lightgbm as lgb
os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
sys.path.insert(0, "backtest")
from fe import History, FEATURES
import parse_kb

LABELS = {
    "course": "進入コース", "natWin": "全国勝率", "nat2": "全国2連率", "locWin": "当地勝率", "loc2": "当地2連率", "motor2": "モーター2連率",
    "boat2": "ボート2連率", "cls": "級別", "age": "年齢", "weight": "体重", "ex_rel": "展示タイム", "ex_rank": "展示順位", "wind": "風速", "wave": "波高",
    "rc_n": "コース出走数", "rc_win": "コース別1着率", "rc_top2": "コース別2連対率", "rc_top3": "コース別3連対率", "rc_st": "コース別ST",
    "r90_n": "直近出走数", "r90_fin": "直近90日着順", "r90_win": "直近90日勝率", "r10_fin": "直近10走着順", "rst_mean": "平均ST", "rst_sd": "ST安定度",
    "rf_180": "フライング数", "rv_n": "当地出走数", "rv_fin": "当地平均着順", "mot_n": "モーター出走数", "mot_fin": "モーター直近着順", "mot_win": "モーター直近勝率",
    "vc_win": "当地コース1着率", "vc_top3": "当地コース3連対率", "natWin_rel": "全国勝率", "rc_win_rel": "コース別1着率",
    "r90_fin_rel": "直近90日着順", "mot_fin_rel": "モーター直近着順", "rst_rel": "コース別ST", "cls_rel": "級別",
    "inner_pressure": "内側とのST差", "rc_2nd": "コース別2着率", "rc_3rd": "コース別3着率", "rc_recent_win": "最近のコース別1着率",
    "rc_recent_top2": "最近のコース別2連対率", "mot_top2": "モーター直近2連対率", "sashi_rate": "差し率", "makuri_rate": "まくり率",
    "makurizashi_rate": "まくり差し率", "nige_lost_rate": "イン負け率", "c1_nige_lost": "1コースのイン負け率", "c2_sashi": "2コースの差し率",
    "outer_makuri_max": "3・4コースのまくり率", "rc_top2_rel": "コース別2連対率", "rc_top3_rel": "コース別3連対率", "c1_natWin": "1コースの勝率", "c1_rc_win": "1コースのイン実績",
}
from train_seq import race_probs
SEQ = [lgb.Booster(model_file=f"backtest/seq_m{i}.txt") for i in (1, 2, 3)]
THETA = json.load(open("backtest/stage2_seq.json"))["theta_all"]
STRAT = json.load(open("backtest/strategy.json"))
from payout_model import race_matrix
PAYM = lgb.Booster(model_file="backtest/payout_model.txt")
SEQM = [lgb.Booster(model_file=f"backtest/seq_morning_m{i}.txt") for i in (1, 2, 3)]  # morning models: no exhibition time / wind / wave
MAN_S, MAN_A = 0.0954, 0.0805  # legacy thresholds (pick-probability only)
from arashi_feat import arashi_row
ARASHI = lgb.Booster(model_file="backtest/arashi_model.txt")
ACAL = json.load(open("backtest/arashi_cal.json"))
def _cdf(arr, x): return float(np.searchsorted(np.array(arr), x) / (len(arr) - 1))
FIX = {f: i for i, f in enumerate(FEATURES)}

MAN_MORNING = dict(S=0.1087, A=0.0954)  # morning backtest: score top 3% (S) / 3-6% (A); honest morning backtest (course=lane): S ROI 101%, A 80%
def manshu(X, pm, odds3):
    morning = is_morning(X)
    if morning:
        Xc = X.copy(); Xc[:, FIX["wind"]] = 0; Xc[:, FIX["wave"]] = 0
        pm = race_probs(Xc.astype(np.float32), *SEQM); pm = pm / pm.sum(); X = Xc
    est = np.exp(PAYM.predict(race_matrix(X.astype(np.float32))))
    real = np.array(odds3, float) if odds3 and sum(1 for o in odds3 if o) >= 100 else None
    od = np.where(real > 0, real, est) if real is not None else est
    cand = np.where(est >= 80)[0]  # selection always uses estimated odds (same rule as the backtest)
    sel = cand[np.argsort(-pm[cand])][:10]
    if len(sel) < 10: return None
    score = float(pm[sel].sum())  # race score (tier) uses the backtested estimated-odds rule
    if real is not None:  # actual 10 points: only combos whose real odds are 80x+
        c2 = np.where(od >= 80)[0]; s2 = c2[np.argsort(-pm[c2])][:10]
        if len(s2) == 10: sel = s2
    g = lambda lane, f: float(X[lane - 1, FIX[f]])
    reasons = []
    c1 = [l for l in range(1, 7) if int(g(l, "course")) == 1][0] if any(int(g(l, "course")) == 1 for l in range(1, 7)) else 1
    if g(c1, "rc_win") < 45: reasons.append(f"{c1}号艇のイン1着率が{g(c1, 'rc_win'):.0f}%と低め")
    if g(c1, "nige_lost_rate") >= 0.45: reasons.append(f"{c1}号艇はイン戦で負ける割合が{g(c1, 'nige_lost_rate') * 100:.0f}%")
    heads = {}
    for k in sel: heads[PERMS[k][0] + 1] = heads.get(PERMS[k][0] + 1, 0) + pm[k]
    for h, _ in sorted(heads.items(), key=lambda kv: -kv[1])[:2]:
        if h == c1: continue
        mk, sa, mz = g(h, "makuri_rate"), g(h, "sashi_rate"), g(h, "makurizashi_rate")
        best = max([("まくり", mk), ("差し", sa), ("まくり差し", mz)], key=lambda x: x[1])
        if best[1] >= 0.06: reasons.append(f"{h}号艇は{best[0]}で勝つ割合が{best[1] * 100:.0f}%と高い")
        if g(h, "ex_rank") <= 2 and g(h, "ex_rel") < 0: reasons.append(f"{h}号艇の展示タイムが{int(g(h, 'ex_rank'))}位")
        if g(h, "mot_top2") >= 0.45: reasons.append(f"{h}号艇のモーターが直近好調（2連対率{g(h, 'mot_top2') * 100:.0f}%）")
        if g(h, "rc_recent_win") >= 0.2 and int(g(h, "course")) >= 3: reasons.append(f"{h}号艇は最近このコースで1着率{g(h, 'rc_recent_win') * 100:.0f}%")
    w = float(X[0, FIX["wind"]]); wv = float(X[0, FIX["wave"]])
    if w >= 5 or wv >= 5: reasons.append(f"風{w:.0f}m・波{wv:.0f}cmで荒れやすい条件")
    if g(c1, "vc_win") < 0.5: reasons.append(f"この場はイン1着率{g(c1, 'vc_win') * 100:.0f}%と荒れやすい")
    ara = float(ARASHI.predict(arashi_row(X.astype(np.float32))[None, :])[0])
    comb = 0.7 * _cdf(ACAL["cur"], score) + 0.3 * _cdf(ACAL["ara"], ara)
    tier = "S" if comb >= ACAL["S"] else "A" if comb >= ACAL["A"] else None
    if morning: tier = "S" if score >= MAN_MORNING["S"] else "A" if score >= MAN_MORNING["A"] else None
    # 展開で組む20点: 1号艇以外の1着率上位2艇を頭 → 2着は展開（差し/まくり/まくり差し）の2艇＋AI1艇 → 3着全通り → 推定30倍以上でAI確率上位20点
    W = np.zeros(6); np.add.at(W, PA[:, 0], pm); heads2 = [int(x) + 2 for x in np.argsort(-W[1:])[:2]]  # lane numbers (2-6)
    JI = {p: j for j, p in enumerate(PERMS)}; plan = []; cand20 = []
    for h in heads2:
        hi = h - 1
        base, shape = ([0, 2], "差し") if hi == 1 else ([0, 4], "6コースから") if hi == 5 else ([hi + 1, 0], "まくり")
        c2 = np.zeros(6)
        for j, (a, b, c) in enumerate(PERMS):
            if a == hi: c2[b] += pm[j]
        ai = [int(x) for x in np.argsort(-c2) if x != hi and x not in base][:1]
        secs = base + ai
        plan.append(dict(lane=h, prob=float(W[hi]), shape=shape, seconds=[x + 1 for x in secs]))
        for b in secs:
            for t in range(6):
                if t not in (hi, b): cand20.append(JI[(hi, b, t)])
    cand20 = [j for j in dict.fromkeys(cand20) if est[j] >= 30]
    sel20 = sorted(cand20, key=lambda j: -pm[j])[:20]
    mk = lambda ks: [dict(combo=KEYS[k], prob=float(pm[k]), odds=float(od[k]), estOdds=float(est[k])) for k in ks]
    return dict(score=score, hitProb=float(pm[sel20].sum()) if sel20 else 0.0, arashi=ara, comb=comb, tier=tier, realOdds=real is not None, reasons=reasons[:5],
                tenkai=plan, picks=mk(sel20) if len(sel20) >= 6 else mk(sel), picks10=mk(sel))
CHU_S = {"morning": 0.1634, "live": 0.1612}  # top 5% of race scores (50x+ estimated, top-10 by AI prob), Jun-Oct backtest; morning = exhibition/weather unknown
CHU_MIN_ODDS = 50
def is_morning(X):
    return bool(np.all(X[:, FIX["ex_rel"]] == 0) and np.all(X[:, FIX["ex_rank"]] == 3.5))
def chuana(X, pm, odds3, man):
    morning = is_morning(X)
    if morning:  # same conditions as the morning backtest: no exhibition, no wind/wave, morning-trained models
        Xc = X.copy(); Xc[:, FIX["wind"]] = 0; Xc[:, FIX["wave"]] = 0
        pm = race_probs(Xc.astype(np.float32), *SEQM); pm = pm / pm.sum(); X = Xc
    est = np.exp(PAYM.predict(race_matrix(X.astype(np.float32))))
    real = np.array(odds3, float) if odds3 and sum(1 for o in odds3 if o) >= 100 else None
    od = np.where(real > 0, real, est) if real is not None else est
    c = np.where(est >= CHU_MIN_ODDS)[0]; sel = c[np.argsort(-pm[c])][:10]
    if len(sel) < 10: return None
    score = float(pm[sel].sum())
    if real is not None:
        c2 = np.where(od >= CHU_MIN_ODDS)[0]; s2 = c2[np.argsort(-pm[c2])][:10]
        if len(s2) == 10: sel = s2
    # shadow variant: 50x+, 5 points, top 3% (tracked for comparison only)
    c5 = np.where(est >= 50)[0]; s5 = c5[np.argsort(-pm[c5])][:5]; alt = None
    if len(s5) == 5:
        sc5 = float(pm[s5].sum())
        if real is not None:
            c6 = np.where(od >= 50)[0]; s6 = c6[np.argsort(-pm[c6])][:5]
            if len(s6) == 5: s5 = s6
        alt = dict(score=sc5, tier="S" if sc5 >= (0.1114 if morning else 0.1124) else None, picks=[dict(combo=KEYS[k], prob=float(pm[k]), odds=float(od[k])) for k in s5])
    # 中穴×万舟用: 1号艇を除いた1着率上位2艇を頭に → 50倍以上からAI確率上位10点（朝の検証で回収率約85%）
    W = np.zeros(6); np.add.at(W, PA[:, 0], pm); hs = [int(x) + 1 for x in np.argsort(-W[1:])[:2]]
    cb = [int(j) for j in np.argsort(-pm) if PA[j][0] in hs and est[j] >= 50][:10]
    both = dict(heads=[dict(lane=h + 1, prob=float(W[h])) for h in hs], picks=[dict(combo=KEYS[k], prob=float(pm[k]), odds=float(od[k])) for k in cb])
    return dict(score=score, alt5=alt, both=both, hitProb=float(pm[sel].sum()), tier="S" if score >= CHU_S["morning" if morning else "live"] else None, realOdds=real is not None,
                reasons=(man or {}).get("reasons", [])[:3],
                picks=[dict(combo=KEYS[k], prob=float(pm[k]), odds=float(od[k]), estOdds=float(est[k])) for k in sel])
PERMS = list(itertools.permutations(range(6), 3)); PA = np.array(PERMS)
KEYS = [f"{a+1}-{b+1}-{c+1}" for a, b, c in PERMS]
H: History = pickle.load(open("backtest/history.pkl", "rb"))
LOCK = threading.Lock()
def _hist_last():
    try: return json.load(open("backtest/history_meta.json"))["last"]
    except Exception: return "261003"
STATE = dict(last=_hist_last())
def save_history():
    pickle.dump(H, open("backtest/history.tmp.pkl", "wb")); os.replace("backtest/history.tmp.pkl", "backtest/history.pkl")
    json.dump(dict(last=STATE["last"]), open("backtest/history_meta.json", "w"))
def reload_models():
    global SEQ, PAYM, H, ARASHI, SEQM
    ARASHI = lgb.Booster(model_file="backtest/arashi_model.txt")
    seq = [lgb.Booster(model_file=f"backtest/seq_m{i}.txt") for i in (1, 2, 3)]; paym = lgb.Booster(model_file="backtest/payout_model.txt"); seqm = [lgb.Booster(model_file=f"backtest/seq_morning_m{i}.txt") for i in (1, 2, 3)]
    h = pickle.load(open("backtest/history.pkl", "rb"))
    with LOCK:
        SEQ, PAYM, H, SEQM = seq, paym, h, seqm
        STATE["last"] = _hist_last()
    print("models reloaded, history through", STATE["last"], flush=True)
def maybe_retrain():
    if os.environ.get("NO_RETRAIN"): return
    try: last = dt.datetime.fromisoformat(json.load(open("backtest/retrain.json"))["at"])
    except Exception: last = dt.datetime(2000, 1, 1)
    if (dt.datetime.utcnow() - last).days < 28: return
    print("monthly retrain start", flush=True)
    if os.system("python3 backtest/retrain.py > /tmp/retrain.log 2>&1") == 0:
        r = json.load(open("backtest/retrain.json"))
        json.dump(dict(last=r["dataTo"][2:]), open("backtest/history_meta.json", "w"))
        reload_models()

def refresh():
    """Download new K/B files (up to yesterday JST) and feed them into the history."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("dl", "backtest/dl_kb.py")
    while True:
        try:
            jst = dt.datetime.utcnow() + dt.timedelta(hours=9)
            y = (jst - dt.timedelta(days=1)).date(); last = dt.date(2000 + int(STATE["last"][:2]), int(STATE["last"][2:4]), int(STATE["last"][4:6]))
            d = last + dt.timedelta(days=1)
            while d <= y:
                os.system(f"python3 backtest/dl_kb.py {d.isoformat()} {d.isoformat()} > /dev/null 2>&1")
                kp, bp = f"backtest/kb/K{d:%y%m%d}.TXT", f"backtest/kb/B{d:%y%m%d}.TXT"
                if not (os.path.exists(kp) and os.path.exists(bp)): break
                K = parse_kb.parse_k(kp); Bd = parse_kb.parse_b(bp); new = []
                for key, k in K.items():
                    b = Bd.get(key)
                    if not b or len(b["boats"]) != 6 or len(k["boats"]) != 6: continue
                    boats = [{**b["boats"][l], **k["boats"][l], "lane": l} for l in range(1, 7) if l in b["boats"] and l in k["boats"]]
                    if len(boats) == 6: new.append(dict(date=f"{d:%Y%m%d}", jcd=key[0], rno=key[1], wind=k["wind"], wave=k["wave"], kimarite=k.get("kimarite", ""), boats=boats))
                new.sort(key=lambda r: (r["jcd"], r["rno"]))
                with LOCK:
                    for r in new: H.update(r)
                STATE["last"] = f"{d:%y%m%d}"; print("history updated", d, len(new), flush=True)
                with LOCK: save_history()
                d += dt.timedelta(days=1)
        except Exception as e:
            print("refresh error", e, flush=True)
        try: maybe_retrain()
        except Exception as e: print("retrain error", e, flush=True)
        try:
            import live_eval; print("live eval", live_eval.run(), flush=True)
        except Exception as e:
            print("live eval error", e, flush=True)
        time.sleep(3 * 3600)

def pl3(S):
    s1, s2, s3 = S[:, 0], S[:, 1], S[:, 2]
    e1 = np.exp(A_[0] * s1); e2 = np.exp(A_[1] * s2 + A_[3] * s1); e3 = np.exp(A_[2] * s3 + A_[4] * s1)
    a, b, c = PA[:, 0], PA[:, 1], PA[:, 2]
    p = e1[a] / e1.sum() * e2[b] / (e2.sum() - e2[a]) * e3[c] / (e3.sum() - e3[a] - e3[b])
    return p / p.sum()

def predict(req):
    race = dict(date=req["date"], jcd=req["jcd"], wind=req.get("wind") or 0, wave=req.get("wave") or 0, boats=req["boats"])
    with LOCK:
        X = H.feats(race)
    pm = race_probs(X.astype(np.float32), *SEQ)
    pm = pm / pm.sum()
    contrib = SEQ[0].predict(X, pred_contrib=True)[:, :-1]
    factors = []
    for i in range(6):
        c = contrib[i] - contrib.mean(0)  # relative to the race average
        agg = {}
        for j in range(len(FEATURES)):
            lb = LABELS.get(FEATURES[j], FEATURES[j]); agg[lb] = agg.get(lb, 0.0) + float(c[j])
        top = sorted(agg.items(), key=lambda kv: -abs(kv[1]))[:6]
        factors.append([dict(label=k, value=v) for k, v in top if abs(v) > 0.03])
    tan = np.zeros(6); np.add.at(tan, PA[:, 0], pm)
    ex = {}
    for (a, b, c), p in zip(PERMS, pm): k = "-".join(map(str, sorted((a + 1, b + 1)))); ex[k] = ex.get(k, 0) + p
    q2 = sorted(ex.items(), key=lambda kv: -kv[1])
    top = int(np.argmax(tan)) + 1
    S_ = STRAT["strategies"]
    strategies = [dict(key="tan_non1" if top != 1 else "tan_1", label="単勝", combos=[str(top)], prob=float(tan.max()),
                       histRoi=S_["tan_non1" if top != 1 else "tan_1"]["res"]["all"]["roi"], histHit=S_["tan_non1" if top != 1 else "tan_1"]["res"]["all"]["hit"],
                       highlight=top != 1)]
    if q2[0][1] >= 0.62:
        strategies.append(dict(key="q2_conf", label="2連複", combos=[q2[0][0], q2[1][0]], prob=float(q2[0][1] + q2[1][1]),
                               histRoi=S_["q2_conf"]["res"]["all"]["roi"], histHit=S_["q2_conf"]["res"]["all"]["hit"], highlight=False))
    out = dict(modelP=dict(zip(KEYS, pm.tolist())), factors=factors, strategies=strategies, manshu=manshu(X, pm, req.get("odds3")))
    out["chuana"] = chuana(X, pm, req.get("odds3"), out["manshu"])
    mk = req.get("market")
    if mk:
        mk = np.maximum(np.array(mk, float), 1e-6); mk /= mk.sum()
        z = THETA[0] * np.log(mk) + THETA[1] * np.log(np.maximum(pm, 1e-9)); z -= z.max(); e = np.exp(z); e /= e.sum()
        out["finalP"] = dict(zip(KEYS, e.tolist()))
    return out

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self._send(200, dict(ok=True, historyThrough=STATE["last"], features=len(FEATURES)))
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0)); req = json.loads(self.rfile.read(n))
            self._send(200, predict(req))
        except Exception as e:
            self._send(500, dict(error=str(e)))

if __name__ == "__main__":
    threading.Thread(target=refresh, daemon=True).start()
    print("ml service on 5001, history through", STATE["last"], flush=True)
    ThreadingHTTPServer(("127.0.0.1", 5001), Handler).serve_forever()
