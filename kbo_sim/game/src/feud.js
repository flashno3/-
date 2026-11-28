/* 악연 라이벌(49단계): 지역 라이벌(off_rival.js, 고정 쌍)에 더해, 경기에서 생긴 사건이 쌓여 생기는 '악연'.
 *  열기(구단별 0~30)가 쌓이는 사건: 몸에 맞는 공 2개 이상 경기(빈볼 시비 +2, 항의 +2/진정 −1 선택) · 끝내기 패 +2 · 3연전 싹쓸이 당함 +3(싹쓸이 승 +1)
 *  · 시즌 후반(100일 이후) 가을야구 경쟁(둘 다 5위 이내·2경기 차 이내) 주 +1 · 포스트시즌 맞대결 탈락 +6 / 승리 +3.
 *  열기 15 이상이면 라이벌: 라이벌전 관중 증가(off_finance isBigMatch), 경기 프리뷰 표시, 리그 뉴스, 이기면 팀 컨디션 +1(3일)·지면 −1(3일).
 *  새 시즌에 열기 ×0.6. ⚠ 수치는 게임 설정. world.js(rivalInfo)를 감싸므로 world.js 다음에 로드. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, KO0, rngFor } = LG.OFFC;
  const ON = 15, MAX = 30;   // 측정: 기준 10이면 시즌마다 악연 4~5개 → 15
  const wa = n => { const c = String(n).charCodeAt(String(n).length - 1); return n + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? '과' : '와'); };
  proto._feud = function () { const S = this.S; return S.feud = S.feud || { y: S.year, t: {} }; };
  proto.feudHeat = function (opp) { const F = this._feud().t[opp]; return F ? F.v : 0; };
  proto.isFeud = function (opp) { return this.feudHeat(opp) >= ON; };
  proto.feudList = function () { const T = this._feud().t; return Object.keys(T).filter(k => T[k].v > 0).map(k => ({ team: k, v: Math.round(T[k].v * 10) / 10, on: T[k].v >= ON, log: T[k].log.slice(-5).reverse() })).sort((a, b) => b.v - a.v); };
  proto._feudAdd = function (opp, v, why) {
    const S = this.S, T = this._feud().t, F = T[opp] = T[opp] || { v: 0, log: [] }, was = F.v >= ON; F.v = Math.min(MAX, Math.round((F.v + v) * 10) / 10); F.log.push({ y: S.year, d: S.day, why, v }); if (F.log.length > 20) F.log.splice(0, F.log.length - 20);
    if (!was && F.v >= ON && F.newsY !== S.year && this.lgNews) F.newsY = S.year, this.lgNews('라이벌', `${KO0[S.userTeam]}-${KO0[opp]}, 새로운 악연`, `${why}까지 겹치며 두 구단 사이에 묘한 긴장감이 흐릅니다. 다음 맞대결부터는 라이벌전입니다.`, { teams: [S.userTeam, opp], imp: 2 });
  };
  /* 지역 라이벌 판정에 악연을 더한다(우리 구단이 낀 쌍만) */
  const _isR = proto.isRival, _rn = proto.rivalName, _ri = proto.rivalInfo;
  proto.isRival = function (a, b) { if (_isR.call(this, a, b)) return true; const u = this.S && this.S.userTeam; if (!u || !b || (a !== u && b !== u)) return false; return this.isFeud(a === u ? b : a); };
  proto.rivalName = function (t, opp) { const n = _rn.call(this, t, opp); if (n || !opp) return n; const u = this.S.userTeam, o = t === u ? opp : t; return this.isFeud(o) ? `${wa(KO0[o])}의 악연` : ''; };
  proto.rivalInfo = function (opp) { const r = _ri.call(this, opp); if (!r) return r; if (!r.desc && this.isFeud(opp)) { const F = this._feud().t[opp]; r.desc = `최근 쌓인 사건: ${F.log.slice(-3).map(x => x.why).join(' · ')} (열기 ${Math.round(F.v)})`; r.feud = true; } return r; };
  /* 내 정규시즌 경기 뒤: 사건 판정 */
  const _fin = proto.finishUserGame;
  proto.finishUserGame = function (ctx) {
    const S = this.S, g = ctx.live, us = ctx.userSide, opp = us === 'home' ? g.away : g.home, oppSide = us === 'home' ? 'away' : 'home', u = S.userTeam;
    const hbp = g.log.filter(x => x.k === 'PA' && x.e === 'HBP' && x.b && S.players[x.b.id] && S.players[x.b.id].team === u).length, my = g.score[us], op = g.score[oppSide], lastPA = g.log.filter(x => x.k === 'PA').slice(-1)[0], walkoffL = oppSide === 'home' && op > my && !!lastPA && lastPA.runs > 0 && !!S.players[lastPA.b.id] && S.players[lastPA.b.id].team === opp && g.inning >= 9;
    const res = _fin.call(this, ctx); if (S.phase !== 'regular' && S.phase !== 'regular_done') return res;
    const feud0 = this.isFeud(opp);
    if (hbp >= 2) { this._feudAdd(opp, 2, `몸에 맞는 공 ${hbp}개`); this._feudHbpEvent(opp, hbp); }
    if (walkoffL) this._feudAdd(opp, 2, '끝내기 패배');
    { const rs = S.results.filter(r => (r.home === u && r.away === opp) || (r.away === u && r.home === opp)).slice(-3), last = S.results.filter(r => r.home === u || r.away === u).slice(-3);
      if (rs.length === 3 && last.every((r, i) => r === rs[i]) && rs[2].day - rs[0].day <= 3) { const out = rs.map(r => (r.home === u ? r.rh - r.ra : r.ra - r.rh)); const M = this._feud(); const key = opp + ':' + rs[0].day;
        if (!(M.sw || (M.sw = {}))[key]) { if (out.every(x => x < 0)) { M.sw[key] = 1; this._feudAdd(opp, 3, '3연전 싹쓸이 패'); } else if (out.every(x => x > 0)) { M.sw[key] = 1; this._feudAdd(opp, 1, '3연전 싹쓸이 승'); } } } }
    if (feud0 && my !== op && (!S.teamMood || S.day >= S.teamMood.until)) { S.teamMood = { v: my > op ? 1 : -1, until: S.day + 3 }; this.invalidate(); }   // 다른 결정으로 걸린 분위기는 덮지 않음
    return res;
  };
  /* 빈볼 시비: 감독의 대응 선택 */
  proto._feudHbpEvent = function (opp, n) {
    if (!this._evAdd || (this.eventsOpen() || []).some(e => e.type === 'feud')) return;
    return this._evAdd({ type: 'feud', ttl: 3, def: 'calm', rec: 'calm', data: { opp }, title: `${KO0[opp]}전 빈볼 시비`, text: `우리 타자가 몸에 맞는 공을 ${n}개 맞았습니다. 더그아웃이 술렁입니다.`,
      choices: [{ k: 'protest', label: '강하게 항의한다', hint: '팀 컨디션 +1(5일) · 30% KBO 제재금 0.1억 · 악연 +2' }, { k: 'calm', label: '선수단을 진정시킨다', hint: '변화 없음 · 악연 −1' }] });
  };
  proto._feudResolve = function (e, k) {
    const S = this.S, opp = e.data.opp, f = S.fin && S.fin.teams[S.userTeam];
    if (k === 'protest') { if (!S.teamMood || S.day >= S.teamMood.until || S.teamMood.v < 1) S.teamMood = { v: 1, until: S.day + 5 }; this.invalidate(); this._feudAdd(opp, 2, '감독 항의'); if (rngFor(S.seed, S.year, S.day, 8800).random() < 0.3) { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.1) * 10) / 10; return '강하게 항의했습니다 — 선수들이 뭉칩니다(컨디션 +1). KBO가 제재금 0.1억을 부과했습니다.'; } return '강하게 항의했습니다 — 선수들이 뭉칩니다(컨디션 +1).'; }
    this._feudAdd(opp, -1, '선수단 진정'); return '선수단을 진정시켰습니다.';
  };
  /* 시즌 후반 순위 경쟁(주 1회) */
  const _dd = proto._decDay;
  proto._decDay = function (d) {
    const r = _dd.call(this, d), S = this.S; if (S.phase !== 'regular' || d < 100 || d % 7) return r; const st = this.standings(), me = st.find(x => x.team === S.userTeam);
    if (me.rank <= 6) for (const x of st) { if (x.team === S.userTeam || x.rank > 6) continue; const gb = Math.abs((me.w - me.l) - (x.w - x.l)) / 2; if (gb <= 2 && (me.rank <= 5 || x.rank <= 5)) this._feudAdd(x.team, 1, '가을야구 경쟁'); }
    return r;
  };
  /* 포스트시즌 맞대결 */
  const _pr = proto.postRecord;
  proto.postRecord = function () { const P0 = this.S.post, cur = P0 && P0.cur; const ended = _pr.apply(this, arguments); const S = this.S, u = S.userTeam;
    if (cur && cur.winner && (cur.hi === u || cur.lo === u) && !cur.feudDone) { cur.feudDone = true; const opp = cur.hi === u ? cur.lo : cur.hi; this._feudAdd(opp, cur.winner === u ? 3 : 6, `${cur.name} ${cur.winner === u ? '승리' : '탈락'}`); }
    return ended; };
  /* 새 시즌: 열기 감소 */
  const _ns = proto.startNewSeason;
  proto.startNewSeason = function () { const r = _ns.apply(this, arguments), F = this._feud(); for (const k in F.t) { F.t[k].v = Math.round(F.t[k].v * 0.6 * 10) / 10; if (F.t[k].v < 0.5) delete F.t[k]; } F.y = this.S.year; F.sw = {}; return r; };
  /* 구단을 옮기면 악연은 초기화 */
  const _take = proto.takeOverTeam;
  proto.takeOverTeam = function (t) { const ok = _take.call(this, t); if (ok) this.S.feud = { y: this.S.year, t: {} }; return ok; };
});
