#!/usr/bin/env bash
# 감독 모드 검증: 엔진 일치(파이썬/라이브) -> 리그 흐름 -> 오프시즌 순환 -> 장기 밸런스
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
python3 build_game_data.py >/dev/null
./web/tests/run_tests.sh | grep -E "일치|불변식" | sort | uniq -c
node web/tests/live_parity.js
node game/tests_live.js
node game/tests_farm.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_cbt.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_futures.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_fa.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_finance.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_contracts.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_injury.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_dev.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_schedule.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_offseason.js 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
node game/tests_longrun.js 10 11 2>&1 | grep -aE "FAIL|실패|AssertionError|모두 통과|tests ok|우승 분포|기준선" | tail -4
python3 build_game.py
