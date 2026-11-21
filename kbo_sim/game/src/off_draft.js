(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 드래프트 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, rngFor, news, ROSTER_MAX } = LG.OFFC;
  /* ---------- 드래프트 ---------- */
  const DRAFT_ROUNDS = 11;   // 규약 제110조 ③ 11라운드까지 지명, ④ 구단은 반드시 대졸 예정 선수를 1명 이상 지명
  /* 대졸 예정 의무: 이 구단의 마지막 지명 차례인데 아직 대졸 예정자를 뽑지 않았으면 대졸 예정자만 지명할 수 있다(후보에 대졸이 남아 있을 때) */
  proto._draftUnivOnly = function (t) {
    const S = this.S, d = S.off.draft, isU = id => { const p = S.players[id]; return !!(p && p.pro && p.pro.univ); };
    if (d.order.slice(d.pick + 1).includes(t)) return false;   // 아직 이 구단의 지명 차례가 남아 있다
    if (d.picks.some(x => x.team === t && isU(x.id))) return false;
    return d.pool.some(isU);
  };
  proto._draftIsUniv = function (id) { const p = this.S.players[id]; return !!(p && p.pro && p.pro.univ); };
  proto.buildDraft = function () {
    const S = this.S, r = rngFor(S.seed, S.year, 41); let pool = [];
    const pr = this.ensureProspects ? this.ensureProspects() : null;   // 시즌 시작 때 미리 공개된 후보 풀(스카우팅 대상)을 그대로 사용
    if (pr && pr.y === S.year) { pool = pr.ids.filter(id => S.players[id] && S.players[id].team === 'DRAFT'); S.prospects = null; S.prospectsDone = S.year; }
    else for (let i = 0; i < 120; i++) pool.push(this.makeRookie(r, i % 2 === 0 ? 'B' : 'P').id);   // 구 저장 파일·예외 시 기존 방식
    const st = this.standings().slice().reverse().map(x => x.team), order = [], st1 = st.slice();
    for (const t of st) if (S.cbt && S.cbt.drop && S.cbt.drop[t]) { const i = st1.indexOf(t); st1.splice(i, 1); st1.splice(Math.min(i + 9, st1.length), 0, t); }   // 경쟁균형세 3회 연속 초과: 1라운드 지명 9단계 하락
    order.push(...st1); for (let k = 1; k < DRAFT_ROUNDS; k++) order.push(...st);   // 규약 제110조 ③: 11라운드
    S.off.draft = { pool, order, pick: 0, picks: [], rounds: DRAFT_ROUNDS, board: this.userScore ? pool.slice().sort((a, b) => this.userScore(S.players[b]) - this.userScore(S.players[a])) : null }; return S.off.draft;   // board: 드래프트 시작 시점 내 스카우트 평가 순위(드래프트 데이 해설용)
  };
  proto.draftOnClock = function () { const d = this.S.off.draft; return d.pick < d.order.length ? d.order[d.pick] : null; };
  proto._draftTake = function (t, id) {
    const S = this.S, d = S.off.draft, p = S.players[id]; d.pool = d.pool.filter(x => x !== id); p.team = t; p.contract = { salary: this.minSal(), years: 1 }; S.teams[t].ids.push(id);
    d.picks.push({ pick: d.pick + 1, team: t, id }); d.pick++; this.invalidate();
    if (t === S.userTeam && this._scoutCarry) this._scoutCarry(p);
    if (t === S.userTeam) { p.myFrom = { y: S.year, how: `드래프트 ${Math.ceil(d.pick / 10)}라운드 지명` }; news(this, `드래프트 ${Math.ceil(d.pick / 10)}라운드: ${p.ko} 지명`); }
    if (S.teams[t].ids.length > ROSTER_MAX) { const worst = S.teams[t].ids.map(x => S.players[x]).filter(x => x.id !== id && !x.active).sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; if (worst) { if (t === S.userTeam) { /* 사용자 팀은 직접 정리 */ } else this._retireOrRelease(t, worst.id); } }
  };
  proto._retireOrRelease = function (t, id) { const p = this.S.players[id]; this.removeFromTeam(t, id); p.retired = true; p.team = 'RET'; p.active = false; };
  proto.draftAiUntilUser = function () {   // 한 픽씩 진행(draftAiStep)과 같은 규칙·같은 난수라서 '건너뛰기'와 '발표 보기' 결과가 같다
    const S = this.S, d = S.off.draft; for (let g = 0; g < 2000; g++) { const r = this.draftAiStep(); if (r.userTurn) return true; if (r.done) return false; } return false;
  };
  proto.draftPick = function (id) {
    const S = this.S, d = S.off.draft; if (this.draftOnClock() !== S.userTeam) return '아직 내 순서가 아닙니다.';
    if (!d.pool.includes(id)) return '이미 지명된 선수입니다.'; if (this._draftUnivOnly(S.userTeam) && !this._draftIsUniv(id)) return '규약상 구단은 대졸 예정 선수를 1명 이상 지명해야 합니다. 마지막 지명에서는 대졸 예정 선수를 선택하세요.'; if (S.teams[S.userTeam].ids.length >= ROSTER_MAX) return `보유 선수 ${ROSTER_MAX}명 제한입니다. 먼저 선수를 정리하세요.`;
    this._draftTake(S.userTeam, id); return null;
  };
  proto.draftAutoRest = function () {   // 내 순서도 자동 지명(추천 순)
    const S = this.S, d = S.off.draft;
    while (d.pick < d.order.length) { if (this.draftOnClock() === S.userTeam) { if (S.teams[S.userTeam].ids.length >= ROSTER_MAX) { d.pick++; continue; } const uo = this._draftUnivOnly(S.userTeam), best = d.pool.filter(id => !uo || this._draftIsUniv(id)).map(id => ({ id, s: this.draftBoardScore ? this.draftBoardScore(S.players[id]) : this.userScore ? this.userScore(S.players[id]) : this.scoutScore(S.players[id]) })).sort((a, b) => b.s - a.s)[0]; this._draftTake(S.userTeam, best.id); } else this.draftAiUntilUser(); }
  };
  proto.finishDraft = function () {
    const S = this.S, d = S.off.draft; if (this._scoutSettle) this._scoutSettle();   // 스카우트 적중률 정산(후보의 숨은 정점이 사라지기 전에)
    for (const id of d.pool) { S.players[id].retired = true; S.players[id].team = 'RET'; } d.pool = [];
  };

});
