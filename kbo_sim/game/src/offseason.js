/* KBO 감독 모드 오프시즌 + 트레이드 (로더)
 * 성장·노화·은퇴 → 계약 만료/재계약 → 신인 드래프트 → FA 시장 → 새 시즌. 트레이드는 시즌 중(마감 전)과 오프시즌에 가능.
 * 구현은 도메인별 off_*.js 로 분할(원본 순서 그대로 — 뒤에 정의된 함수가 앞의 것을 덮어쓰는 구조라 로드 순서 유지 필수).
 * 공용 상수·헬퍼는 off_common.js(LG.OFFC). 브라우저 빌드는 build_game.py 가 같은 순서로 이어 붙인다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    factory(require('./league.js'), require('../../web/src/engine.js'));
    for (const f of ['off_common', 'off_growth', 'off_rookies', 'off_contract', 'off_draft', 'off_fa', 'off_rules', 'off_events', 'off_goals', 'off_advance', 'off_rival', 'off_season', 'off_finance', 'off_injury', 'off_salary', 'club_history','arcs','arcs2','legends','ceremony','allstar','aiworld','unrest', 'drama', 'military']) require('./' + f + '.js');
    require('./negotiate.js'); require('./world.js'); require('./training.js'); require('./scout.js'); require('./invest.js');
  } else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) { 'use strict'; });
