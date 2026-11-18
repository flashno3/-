#!/usr/bin/env bash
# 감독 모드 검증 (병렬 실행)
#   ./game/run_tests.sh            빠른 검증: 기능 테스트 전부, 4병렬 (무거운 밸런스·장기 테스트 제외, 약 1분)
#   ./game/run_tests.sh full       전체: 빠른 검증 + 엔진 일치(파이썬/라이브) + 장기 밸런스(약 2~3분)
#   ./game/run_tests.sh e2e        브라우저 종합 점검(Playwright, 모바일·데스크톱 전 화면·협상·라이브·오프시즌)
#   ./game/run_tests.sh events fa  이름으로 골라 실행(tests_<이름>.js)
# 실패하면 종료 코드 1, 실패한 테스트의 로그 끝부분을 출력한다.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
LOG=/tmp/kbo_tests; mkdir -p "$LOG"; rm -f "$LOG"/*
python3 build_game_data.py >/dev/null && python3 build_game.py >/dev/null || { echo "빌드 실패"; exit 1; }

HEAVY="longrun offseason cbt positions soak"
MODE="${1:-fast}"; shift || true
if [ "$MODE" = e2e ]; then rc=0; for f in game/e2e/e2e_full.js game/e2e/e2e_offseason.js; do node "$f" || rc=1; done; exit $rc; fi
all=$(ls game/tests_*.js | sed 's#game/tests_##; s#\.js##')
case "$MODE" in
  fast) list=$(for t in $all; do case " $HEAVY " in *" $t "*) ;; *) echo $t;; esac; done) ;;
  full) list="$all" ;;
  *) list="$MODE $*" ;;
esac

run() {   # $1 = 테스트 이름
  t="$1"; f="game/tests_$t.js"; [ -f "$f" ] || { echo "없음: $f" > "$LOG/$t.log"; echo 1 > "$LOG/$t.rc"; return; }
  args=""; [ "$t" = longrun ] && args="10 11"
  node "$f" $args > "$LOG/$t.log" 2>&1; echo $? > "$LOG/$t.rc"
}
export -f run; export LOG
echo $list | tr ' ' '\n' | xargs -P 4 -I{} bash -c 'run {}'
if [ "$MODE" = full ]; then   # 파이썬 엔진 일치·포스트시즌 불변식
  ./web/tests/run_tests.sh > "$LOG/web.log" 2>&1; echo $? > "$LOG/web.rc"
  node web/tests/live_parity.js > "$LOG/live_parity.log" 2>&1; echo $? > "$LOG/live_parity.rc"
fi

fail=0
for rcf in "$LOG"/*.rc; do
  t=$(basename "$rcf" .rc); log="$LOG/$t.log"; rc=$(cat "$rcf")
  if [ "$rc" != 0 ] || grep -aqE "^FAIL|실패 [1-9]|AssertionError" "$log"; then
    fail=1; echo "✗ $t"; grep -aE "^FAIL|실패 [1-9]|AssertionError|Error:" "$log" | head -4 | cut -c1-240
  else
    echo "✓ $t  $(grep -aE 'tests ok|모두 통과|일치' "$log" | tail -1 | cut -c1-60)"
  fi
done
[ $fail = 0 ] && echo "== 전체 통과 ==" || echo "== 실패 있음 =="
exit $fail
