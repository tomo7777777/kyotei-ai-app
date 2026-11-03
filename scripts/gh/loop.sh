#!/usr/bin/env bash
# GitHub Actions 上でアプリを動かし、約10分ごとに画面用データを gh-pages に書き出す
set -u
ROOT=$(pwd); START=$(date +%s); RUN_SEC=${RUN_SEC:-20400}; END=$((START+RUN_SEC))
PUB=/tmp/pub; OUT=/tmp/out; mkdir -p $OUT
REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

echo "== restore state"
if git clone -q --depth 1 -b gh-pages "$REMOTE" /tmp/prev 2>/dev/null; then
  [ -d /tmp/prev/state/data ] && cp -r /tmp/prev/state/data/. data/
  [ -f /tmp/prev/state/data.db ] && cp /tmp/prev/state/data.db data.db
  for f in history.pkl history_meta.json live_eval.json; do [ -f /tmp/prev/state/backtest/$f ] && cp /tmp/prev/state/backtest/$f backtest/$f; done
  [ -d /tmp/prev/api ] && cp -r /tmp/prev/api $OUT/
fi
printf '%s' "${NTFY_TOPIC:-}" > data/ntfy_topic.txt

echo "== start services"
NO_RETRAIN=1 nohup python3 backtest/predict_service.py > /tmp/ml.log 2>&1 &
NODE_ENV=production PORT=5000 nohup node dist/index.cjs > /tmp/server.log 2>&1 &
for i in $(seq 1 90); do curl -sf localhost:5000/api/meta >/dev/null && break; sleep 2; done
for i in $(seq 1 120); do curl -sf localhost:5001/ >/dev/null && break; sleep 2; done
echo "server: $(curl -s localhost:5000/api/meta)"; echo "ml: $(curl -s -o /dev/null -w '%{http_code}' localhost:5001/)"

publish() {
  rm -rf $PUB.new; mkdir -p $PUB.new/state/backtest $PUB.new/state/data
  cp -r /tmp/site/. $PUB.new/; cp -r $OUT/api $PUB.new/ 2>/dev/null; touch $PUB.new/.nojekyll
  for d in plans oddslog exev triev tenji head2 oriten; do [ -d data/$d ] && cp -r data/$d $PUB.new/state/data/; done
  cp data/favorites.json $PUB.new/state/data/ 2>/dev/null
  mkdir -p $PUB.new/state/data/anacache; find data/anacache -name "*.json" -mtime -2 -exec cp {} $PUB.new/state/data/anacache/ \; 2>/dev/null
  python3 -c "import sqlite3;s=sqlite3.connect('data.db');d=sqlite3.connect('$PUB.new/state/data.db');s.backup(d);d.execute('delete from my_bets');d.execute('delete from my_races');d.commit()" 2>/dev/null || true
  for f in history_meta.json live_eval.json; do cp backtest/$f $PUB.new/state/backtest/; done
  if [ $(( $(date +%s) - $(stat -c %Y backtest/history.pkl) )) -gt 60 ]; then cp backtest/history.pkl $PUB.new/state/backtest/; elif [ -f $PUB/state/backtest/history.pkl ]; then cp $PUB/state/backtest/history.pkl $PUB.new/state/backtest/; fi
  if [ ! -d $PUB/.git ]; then mkdir -p $PUB; git -C $PUB init -q; git -C $PUB remote add origin "$REMOTE"; git -C $PUB config user.name "github-actions[bot]"; git -C $PUB config user.email "41898282+github-actions[bot]@users.noreply.github.com"; git -C $PUB fetch -q --depth 1 origin gh-pages 2>/dev/null || true; fi
  find $PUB -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +; cp -r $PUB.new/. $PUB/
  ( cd $PUB && git checkout -q --orphan "s$(date +%s)" && git add -A && git commit -qm "update $(TZ=Asia/Tokyo date '+%m/%d %H:%M')" && git push -fq origin HEAD:gh-pages ) && echo "published $(TZ=Asia/Tokyo date +%H:%M)" || echo "publish failed"
}

while [ $(date +%s) -lt $END ]; do
  T=$(date +%s)
  BUDGET_MS=360000 timeout 420 node scripts/gh/export_static.mjs $OUT || echo "export error"
  publish
  curl -sf localhost:5000/api/meta >/dev/null || { echo "server down, restart"; NODE_ENV=production PORT=5000 nohup node dist/index.cjs >> /tmp/server.log 2>&1 & }
  curl -sf localhost:5001/ >/dev/null || { echo "ml down, restart"; NO_RETRAIN=1 nohup python3 backtest/predict_service.py >> /tmp/ml.log 2>&1 & }
  W=$(( 600 - ($(date +%s) - T) )); [ $W -gt 0 ] && [ $(( $(date +%s) + W )) -lt $END ] && sleep $W
done
publish
tail -c 3000 /tmp/ml.log | grep -v "^{" | tail -20
# 1時間以上動いたときだけ次の回をすぐ予約（失敗の繰り返しを防ぐ）
[ $(( $(date +%s) - START )) -gt 3600 ] && gh workflow run run.yml --ref main -R "$GITHUB_REPOSITORY" && echo "next run queued"
exit 0
