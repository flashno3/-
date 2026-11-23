(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 래리 버드 룰·방출 위약금·이사회 설득 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, TEAMS, news, clamp, rngFor } = LG.OFFC;
  /* ---------------- 래리 버드 룰: FA 계약이 모두 끝난 시점의 예외 선수 지정 안내 ----------------
     FA 시장이 닫히면(내년 시즌 로스터 확정) 내 팀의 자격 선수(7시즌 이상 등록) 중 보수가 가장 높은 선수를 예외 선수로 지정하고, 지정 내용을 안내한다.
     플레이어는 안내 카드에서 다른 자격 선수로 바꾸거나 그대로 확정할 수 있다(확정 전에도 추천 선수로 적용되어 있고, 새 시즌이 시작되면 안내는 사라진다). AI 구단은 같은 기준으로 자동 지정. */
  proto._excAtFAEnd = function () {
    const S = this.S, t = S.userTeam; if (S.phase !== 'offseason' || S.year < 2026) return;
    S.cbt = S.cbt || { over: {}, under: {}, drop: {}, fees: {}, log: [] }; const c = S.cbt; c.exc = c.exc || {};
    const el = this.players(t).filter(p => this.excEligible(p, t)).sort((a, b) => this.cbtVal(b) - this.cbtVal(a)); c.excPrompt = null;
    for (const q of TEAMS) if (q !== t) c.exc[q] = null;   // AI 구단은 FA가 끝난 현재 로스터 기준으로 다시 자동 지정
    if (!el.length) { news(this, '래리 버드 룰: 내년 예외 선수 자격(우리 구단 7시즌 이상 등록)을 갖춘 선수가 없습니다.'); return; }
    const prev = c.exc[t] && S.players[c.exc[t]], pay0 = this.cbtPay(t, true); c.exc[t] = el[0].id; c.excManual = c.excManual || {}; c.excManual[t] = false;
    const pay1 = this.cbtPay(t, true); c.excPrompt = { y: S.year + 1, id: el[0].id, prev: prev ? prev.id : null, pay0, pay1 };
    news(this, `래리 버드 룰: FA 계약이 끝나 예외 선수로 ${el[0].ko}(보수 ${this.cbtVal(el[0]).toFixed(1)}억, 소속 ${el[0].tn}시즌)을 지정했습니다. 경쟁균형세 산정액 ${pay0} → ${pay1}억. 대시보드 안내에서 다른 선수로 바꿀 수 있습니다.`);
  };
  proto.confirmExc = function (id) {   // 안내 카드에서 확정/변경
    const S = this.S, c = S.cbt; if (!c || !c.excPrompt) return '확인할 안내가 없습니다.';
    if (id && id !== c.exc[S.userTeam]) { const e = this.setCbtExc(id); if (e) return e; const p = S.players[id]; news(this, `래리 버드 룰: 예외 선수를 ${p.ko}(으)로 변경했습니다. 경쟁균형세 산정액 ${this.cbtPay(S.userTeam, true)}억.`); }
    else news(this, `래리 버드 룰: 예외 선수 ${S.players[c.exc[S.userTeam]].ko} 지정을 확정했습니다.`);
    c.excPrompt = null; this.invalidate(); return null;
  };
  /* ---------------- 방출 위약금 ----------------
     방출해도 계약은 남는다: 이번 시즌 잔여 연봉(남은 경기 비율) + 계약금 상각 + 이후 보장 연수의 연봉·계약금 상각이 구단 보수(재정·FA 예산)에 계속 잡힌다.
     고액 방출은 이사회 신뢰도를 깎고, 오래 뛴 핵심 선수(충성도 70+)는 팬·선수단 반응으로 추가 하락. */
  proto._finYear = function () { const S = this.S; return S.phase === 'offseason' ? S.year + 1 : S.year; };
  proto.deadNow = function (t) { const f = this.S.fin && this.S.fin.teams[t]; if (!f || !f.dead) return 0; const y = this._finYear(); return f.dead.filter(x => x.year === y).reduce((a, x) => a + x.amt, 0); };
  proto.releaseCost = function (id) {
    const S = this.S, p = S.players[id], c = p.contract, y0 = this._finYear(), len = S.schedule ? S.schedule.length || 144 : 144;
    const frac = S.phase === 'offseason' || S.phase === 'preseason' ? 1 : clamp(1 - (S.day || 0) / len, 0, 1), am = c.amort && c.years > 0 ? c.amort : 0, rec = [];
    if (c.years >= 1) { rec.push({ year: y0, amt: Math.round((c.salary * frac + am) * 10) / 10 }); for (let i = 1; i < c.years; i++) rec.push({ year: y0 + i, amt: Math.round((c.salary + am) * 10) / 10 }); }
    const total = rec.reduce((a, x) => a + x.amt, 0), lo = this.loyalty(p, p.team), core = lo && lo.v >= 70 && (p.tn || 0) >= 5;
    const trust = total >= 1 ? -Math.min(6, Math.round((0.5 + total / 10) * 10) / 10) - (core ? 2 : 0) : (core ? -2 : 0);
    return { rec, total: Math.round(total * 10) / 10, thisYear: rec.length ? rec[0].amt : 0, trust, core };
  };
  proto.releasePlayer = function (id) {   // 내 팀 선수 방출(위약금·신뢰도 반영)
    const S = this.S, t = S.userTeam, p = S.players[id]; if (!p || p.team !== t) return { ok: false, msg: '선수를 찾을 수 없습니다.' };
    if (S.teams[t].ids.length <= 44) return { ok: false, msg: '보유 선수가 최소 44명 필요합니다.' };
    const cost = this.releaseCost(id), f = S.fin && S.fin.teams[t]; const bl0 = this.bonds ? this.bonds(p) : [];
    if (f) { f.dead = (f.dead || []).concat(cost.rec.map(x => ({ year: x.year, amt: x.amt, who: p.ko }))); f.trust = clamp(Math.round((f.trust + cost.trust) * 10) / 10, 0, 100); }
    const lbRel = this.legendBound ? this.legendBound(p, t) : null;
    this.release(t, id); if (lbRel) this._legendLoss(p, t, null, '방출', lbRel); if (this._bondShift && (p.tn >= 3 || this.ovr(p) >= 50)) this._bondShift(p, -1, '방출', bl0);
    news(this, `방출: ${p.ko} — 위약금 ${cost.total}억(이번 시즌 ${cost.thisYear}억)${cost.trust < 0 ? `, 이사회 신뢰도 ${cost.trust}` : ''}${cost.core ? ' · 오랜 핵심 선수 방출로 팬·선수단 반응이 좋지 않습니다' : ''}`);
    return { ok: true, cost };
  };

  /* ---------------- 이사회 설득(예산 초과 영입) ----------------
     FA 예산(여유자금)을 넘는 영입도 이사회를 설득하면 가능. 성공 확률 = 신뢰도·선수 가치·초과 비율에 따름.
     성공: 초과분만큼 올 시즌 예산 확대(+신뢰도 하락), 실패: 신뢰도 하락. 시즌당 최대 3회, 시도 간 7일 간격. */
  proto.boardOdds = function (id, offer) {
    const S = this.S, t = S.userTeam, p = S.players[id], f = S.fin.teams[t], ev = this.faEvaluate(p, offer, t); if (!ev.ok) return { ok: false, msg: ev.msg };
    const cost = ev.sal + ev.bon / ev.y + this.faCompCost(p, t), room = this.faRoom(t), need = Math.max(0, Math.round((cost - room) * 10) / 10), pers = f.pers || { n: 0, last: -99 };
    const now = S.faMkt ? S.faMkt.day : (S.day || 0) + 100, left = Math.max(0, 7 - (now - pers.last));
    const star = this.faStar(p, t);   // 프랜차이즈 스타(충성도 70+, 내 팀 출신): 이사회가 더 관대하다
    const prob = clamp(0.12 + 0.6 * (f.trust / 100) + (this.war(p) >= 2 ? 0.1 : this.war(p) >= 1 ? 0.04 : 0) + (star ? 0.15 + 0.15 * star.s : 0) - (star ? 0.2 : 0.5) * need / Math.max(cost, 0.1), 0.05, star ? 0.95 : 0.9);
    return { ok: true, need, cost, room, prob: Math.round(prob * 100) / 100, tries: pers.n, left, max: star ? 4 : 3, ev, now, star };
  };
  proto.persuadeBoard = function (id, offer) {
    const S = this.S, t = S.userTeam, o = this.boardOdds(id, offer); if (!o.ok) return { ok: false, msg: o.msg };
    const f = S.fin.teams[t], p = S.players[id]; f.pers = f.pers || { n: 0, last: -99 };
    { const cb = this.capBlock(t, o.ev.per); if (cb) return { ok: false, msg: cb }; }
    if (o.need <= 0) return { ok: false, msg: '예산 안에서 영입할 수 있습니다. 설득이 필요 없습니다.' };
    if (f.pers.n >= o.max) return { ok: false, msg: `이사회 설득은 시즌당 ${o.max}회까지입니다.` };
    if (o.left > 0) return { ok: false, msg: `이사회가 재논의를 거부합니다. ${o.left}일 뒤에 다시 요청하세요.` };
    f.pers.n++; f.pers.last = o.now;
    const r = rngFor(S.seed, S.year, (S.faMkt ? S.faMkt.day : S.day) * 10 + f.pers.n, 9100);
    if (r.random() < o.prob) {
      const drop = clamp((2 + o.need * 0.4) * (o.star ? 0.5 : 1), o.star ? 1 : 2, 8); f.boardExtra = Math.round(((f.boardExtra || 0) + o.need * 1.05 + 0.1) * 10) / 10; f.trust = clamp(Math.round((f.trust - drop) * 10) / 10, 0, 100);
      this._doSign(t, p, o.ev.y, o.ev.sal, o.ev.bon);
      if (S.faMkt) { delete S.faMkt.pend[id]; delete S.faMkt.bids[id]; }
      news(this, `이사회 설득 성공: ${p.ko} 영입 승인 (초과 ${o.need}억 추가 예산, 신뢰도 −${drop.toFixed(1)}) — ${o.ev.y}년 총 ${(o.ev.per * o.ev.y).toFixed(1)}억`);
      return { ok: true, success: true, drop, need: o.need };
    }
    f.trust = clamp(Math.round((f.trust - 3) * 10) / 10, 0, 100);
    news(this, `이사회 설득 실패: ${p.ko} 영입안이 부결되었습니다 (신뢰도 −3). ${o.left <= 0 ? '7일 뒤 재논의 가능' : ''}`);
    return { ok: true, success: false, msg: '이사회가 영입안을 부결했습니다. 신뢰도가 하락했습니다.' };
  };

});
