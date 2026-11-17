#!/usr/bin/env bash
# 감독 모드 검증: 엔진 일치(파이썬/라이브) -> 리그 흐름 -> 오프시즌 순환 -> 장기 밸런스
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
python3 build_game_data.py >/dev/null
./web/tests/run_tests.sh | grep -E "일치|불변식" | sort | uniq -c
node web/tests/live_parity.js
node game/tests_live.js
node game/tests_farm.js | tail -2
node game/tests_cbt.js | tail -3
node game/tests_futures.js | tail -3
node game/tests_offseason.js | tail -3
node game/tests_longrun.js 10 11 | tail -2
python3 build_game.py
