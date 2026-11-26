#!/usr/bin/env bash
# 빌드 → 빠른 테스트 → 커밋 → 푸시를 한 번에: ./game/ship.sh "커밋 메시지"   (SKIP_TESTS=1 이면 테스트 생략)
cd "$(dirname "$0")/.." || exit 1
msg="${1:?커밋 메시지를 입력하세요}"
if [ -z "$SKIP_TESTS" ]; then ./game/run_tests.sh || { echo "테스트 실패 — 커밋하지 않음"; exit 1; }; else python3 build_game_data.py >/dev/null && python3 build_game.py >/dev/null; fi
git add -A && git commit -q -m "$msg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QvrsYfibzz7vhX2daRTdLC" && git push -q -u origin "$(git branch --show-current)" && git log --oneline -1
