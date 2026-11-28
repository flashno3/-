/* 구단 행사(49단계): 실제 KBO 달력에 맞춘 시즌 중 특별 홈경기 — 한 시즌 각 1회, 그 기간 우리 홈경기 날에 제안.
 *  어린이날 시리즈(5/1~5/7) · 레전드 데이(6/10~6/25) · 스페셜 유니폼 데이(7/1~7/15) · 팬 감사의 날(9/10 이후 홈경기).
 *  효과는 기존 재정 값만 쓴다: 행사 비용 f.evCost, 행사 수입 f.evRev, 기간 관중 f.promo(진행 중인 더 큰 효과는 덮지 않음), 팬 지수 f.fl(최대 105), 팀 컨디션, 선수단 피로도.
 *  ⚠ 비용·관중 효과·유니폼 판매 수입은 게임 설정(실제 구단 행사 수지는 공개 자료 없음). 기존 '팬 감사 이벤트'(off_events promo, 무작위)와 별개. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, rngFor, clamp } = LG.OFFC;
  const r1 = x => Math.round(x * 10) / 10;
  const GD = {
    kids: { win: [[5, 1], [5, 7]], title: '어린이날 시리즈', text: '어린이날 홈경기입니다. 마케팅팀이 어린이 회원 초청 행사를 제안합니다.',
      choices: [{ k: 'go', label: '어린이 회원 초청·선물(0.3억)', hint: '7일간 관중 +8% · 팬 지수 +1' }, { k: 'skip', label: '평소대로' }] },
    legend: { win: [[6, 10], [6, 25]], title: '레전드 데이', text: '구단 레전드를 초청해 시구와 사인회를 여는 행사입니다.',
      choices: [{ k: 'go', label: '레전드 초청 시구·사인회(0.2억)', hint: '10일간 관중 +5% · 팀 컨디션 +1(3일)' }, { k: 'skip', label: '생략한다' }] },
    uniform: { win: [[7, 1], [7, 15]], title: '스페셜 유니폼 데이', text: '한정판 스페셜 유니폼을 입고 경기하는 날입니다. 판매는 팀 성적에 따라 크게 달라집니다.',
      choices: [{ k: 'go', label: '한정 유니폼 출시(제작 0.4억)', hint: '판매 수입은 순위에 따라 — 상위권이면 크게, 하위권이면 적자 위험' }, { k: 'skip', label: '출시하지 않는다' }] },
    thanks: { win: [[9, 10], [10, 31]], title: '팬 감사의 날', text: '시즌 막바지 홈경기입니다. 선수단이 직접 팬을 맞이하는 행사를 할 수 있습니다.',
      choices: [{ k: 'go', label: '선수단 팬 사인회·하이파이브', hint: '팬 지수 +2 · 남은 시즌 관중 +5% · 선수단 피로도 +2' }, { k: 'skip', label: '간단히 인사만' }] }
  };
  proto.gamedayDefs = function () { return GD; };
  const inWin = (dt, w) => { const m = dt.getUTCMonth() + 1, d = dt.getUTCDate(), v = m * 100 + d; return v >= w[0][0] * 100 + w[0][1] && v <= w[1][0] * 100 + w[1][1]; };
  proto._gamedayDay = function (d) {
    const S = this.S; if (S.phase !== 'regular') return null; const g = this.userGameToday(); if (!g || g[0] !== S.userTeam) return null;
    const done = S.gday && S.gday.y === S.year ? S.gday : (S.gday = { y: S.year, k: {} }), dt = this.dateOf(d);
    for (const [id, x] of Object.entries(GD)) { if (done.k[id] || !inWin(dt, x.win)) continue; done.k[id] = 'offer';
      return this._evAdd({ type: 'gday', ttl: 2, def: 'skip', rec: 'go', data: { id, opp: g[1] }, title: `${x.title} — 오늘 홈경기`, text: x.text, choices: x.choices.map(c => Object.assign({}, c)) }); }
    return null;
  };
  proto._gamedayResolve = function (e, k) {
    const S = this.S, t = S.userTeam, f = S.fin && S.fin.teams[t], id = e.data.id, x = GD[id]; if (S.gday && S.gday.y === S.year) S.gday.k[id] = k;
    if (k !== 'go' || !f) return `${x.title}: 행사를 하지 않았습니다.`;
    const promo = (days, mult) => { if (!(f.promo && S.day < f.promo.until && f.promo.mult >= mult)) f.promo = { until: S.day + days, mult }; };
    const fan = v => { f.fl = clamp(r1((f.fl === undefined ? 100 : f.fl) + v), 0, 105); };
    if (id === 'kids') { f.evCost = r1((f.evCost || 0) + 0.3); promo(7, 1.08); fan(1); return '어린이 회원 초청 행사를 열었습니다 — 7일간 관중 +8%, 팬 지수 +1.'; }
    if (id === 'legend') { f.evCost = r1((f.evCost || 0) + 0.2); promo(10, 1.05); if (!S.teamMood || S.day >= S.teamMood.until) S.teamMood = { v: 1, until: S.day + 3 }; this.invalidate(); return '레전드가 시구하자 관중석이 들썩였습니다 — 10일간 관중 +5%, 팀 컨디션 +1(3일).'; }
    if (id === 'uniform') { const rank = this.standings().find(y => y.team === t).rank, r = rngFor(S.seed, S.year, S.day, 8900).random(), hot = r < 0.6;
      const rev = rank <= 3 ? (hot ? 1.6 : 0.9) : rank <= 6 ? (hot ? 0.9 : 0.5) : (hot ? 0.5 : 0.2); f.evCost = r1((f.evCost || 0) + 0.4); f.evRev = r1((f.evRev || 0) + rev);
      return `한정 유니폼 판매 ${rev}억(제작 0.4억 → ${rev - 0.4 >= 0 ? '+' : ''}${r1(rev - 0.4)}억) — ${rank}위 팀${hot ? ', 반응이 뜨겁습니다' : ', 반응은 무난합니다'}.`; }
    if (id === 'thanks') { fan(2); promo(60, 1.05); if (this._wearAdd) this._wearAdd(2); return '선수단이 팬들과 인사를 나눴습니다 — 팬 지수 +2, 남은 시즌 관중 +5%, 선수단 피로도 +2.'; }
    return '';
  };
  const _dd = proto._decDay;
  proto._decDay = function (d) { const r = _dd.call(this, d); this._gamedayDay(d); return r; };
});
