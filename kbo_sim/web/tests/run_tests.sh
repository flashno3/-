#!/usr/bin/env bash
# 웹 엔진 검증: (1) 파이썬 engine2.py 와 정규시즌 결과 일치  (2) 포스트시즌 불변식 300시즌
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
python3 build_web.py >/dev/null
for m in "forward blend ratings_forward_pk.json" "replay y2026 ratings_replay_pk.json"; do set -- $m
  PARK=$2 RAT=$3 python3 -I web/tests/parity_ref.py /tmp/py_$1.json
  node web/tests/parity_js.js $1 /tmp/js_$1.json
  python3 -I - $1 <<'PY'
import json,sys
m=sys.argv[1];P=json.load(open(f'/tmp/py_{m}.json'));J=json.load(open(f'/tmp/js_{m}.json'));ok=True
for seed in P:
    same=all(P[seed]['rec'][t]==J[seed]['rec'][t] for t in P[seed]['rec']) and all(J[seed]['stats'][k]==v for k,v in P[seed]['stats'].items()) and P[seed]['park']==J[seed]['park']
    ok&=same;print(m,seed,'일치' if same else '불일치')
sys.exit(0 if ok else 1)
PY
  node web/tests/postseason_check.js $1 300
done
