/* 재계약 연봉 산정(성적·팀 성적 반영, 전년 연봉 비교) + 연봉조정(중재).
 * 규약 제75~80조: 구단과 보류선수가 연봉에 합의하지 못하면 선수 또는 구단이 연봉중재를 신청한다(활동 개시 후 만 3년 경과 선수만). 각자 원하는 연봉을 제출하고
 * 중재위원회가 결정하며, 결정은 구속력이 있다(선수가 거부하면 임의해지, 구단이 거부하면 자유계약선수). 규약에는 위원회의 결정 방식이 적혀 있지 않다 —
 * ⚠ 이 게임은 야구계 관행(양자택일)대로 두 제시액 중 위원회 평가액에 더 가까운 쪽을 채택한다. 신청 마감(1/10)·결정(1/30) 일정은 단순화해 즉시 처리한다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, clamp, rngFor, news } = LG.OFFC;
  const CUT_MAX = 0.30;   // 한 해 삭감 한도(−30%). 규약에는 삭감 한도가 없다(최저연봉만 지킴) — ⚠ 게임 균형용 가정값
  /* 팀 성적 보정: 가을야구(5위 이내)를 못 하면 구단이 삭감을 요구한다. 선수 개인이 뛰어나면(WAR 1.5 이상) 팀 성적과 무관 — ⚠ 가정값 */
  proto.teamPerf = function (t) {
    const S = this.S, key = S.year + ':' + S.day + ':' + S.phase; if (!this._tp || this._tp.key !== key) { const st = this.standings(), m = {}; for (const x of st) m[x.team] = x.rank; this._tp = { key, m }; }
    const rank = this._tp.m[t] || 5; return { rank, post: rank <= 5, factor: rank <= 3 ? 0.02 : rank <= 5 ? 0 : rank <= 7 ? -0.03 : -0.06 };
  };
  proto._teamFactor = function (p) { return this.war(p) >= 1.5 ? 0 : this.teamPerf(p.team).factor; };
  /* 성적 기준 적정액(= 올해 가치에 팀 성적 보정). 재계약 요구·구단 제시·위원회 평가의 기준 */
  proto.fairSalary = function (p) { return Math.max(this.minSal(), Math.round(this.price(p) * (1 + this._teamFactor(p)) * 10) / 10); };
  /* 재계약 시점 비교 자료: 전년 연봉 → 요구액, 증감률, 성적·팀 성적 사유 */
  proto.salaryReview = function (p) {
    const prev = p.contract.salary, ask = this.resignAsk(p), pct = prev > 0 ? (ask - prev) / prev : 0, war = this.war(p), tp = this.teamPerf(p.team), reasons = [];
    const perf = war >= 2.5 ? '정상급' : war >= 1.5 ? '호조' : war >= 0.6 ? '보통' : war >= 0.2 ? '부진' : '매우 부진';
    if (pct > 0.05) reasons.push(`개인 성적 ${perf}(WAR ${war.toFixed(1)})`); else if (pct < -0.05) reasons.push(`개인 성적 ${perf}(WAR ${war.toFixed(1)})`); else reasons.push(`성적 보통(WAR ${war.toFixed(1)})`);
    if (tp.factor < 0 && war < 1.5) reasons.push(`팀 ${tp.rank}위 · 가을야구 실패`); else if (tp.factor > 0 && war < 1.5) reasons.push(`팀 ${tp.rank}위 · 상위권`);
    return { prev, ask, pct, war, perf, team: tp, reasons, cut: pct < -0.05 };
  };
  /* ---- 연봉조정 ---- */
  proto.arbEligible = function (p) { return !!(p && !p.foreign && p.fa && !this.faEligible(p) && p.fa.svc >= 3); };   // FA 대상 외 + 활동 개시 만 3년 경과
  proto.arbClubDefault = function (p) { const cur = p.contract.salary, fair = this.fairSalary(p), ask = this.resignAsk(p); return Math.max(this.minSal(), Math.min(ask, Math.max(cur * (1 - CUT_MAX), Math.round((cur + 0.5 * (fair - cur)) * 10) / 10))); };
  proto._arbRef = function (p) { const r = rngFor(this.S.seed, this.S.year, 6600 + parseInt(String(p.id).replace(/\D/g, '') || 0)); return Math.round(this.fairSalary(p) * (1 + (r.random() - 0.5) * 0.12) * 10) / 10; };   // 위원회 평가액(공개되지 않음, 적정액 ±6%)
  proto.arbCase = function (id) {
    const S = this.S, p = S.players[id], off = S.off; if (!p || !off || !off.rep.expiring.includes(id) || p.team !== S.userTeam) return null;
    const fair = this.fairSalary(p), ask = this.resignAsk(p), club = this.arbClubDefault(p);
    return { p, eligible: this.arbEligible(p), prev: p.contract.salary, playerAsk: ask, clubDefault: club, fair, hint: [Math.round(fair * 0.92 * 10) / 10, Math.round(fair * 1.08 * 10) / 10], review: this.salaryReview(p), svc: Math.round((p.fa ? p.fa.svc : 0) * 10) / 10 };
  };
  /* 중재 결정: 두 제시액 중 위원회 평가액에 더 가까운 쪽(같으면 구단안) */
  proto.arbDecide = function (id, clubFig) {
    const S = this.S, c = this.arbCase(id); if (!c) return '연봉조정 대상이 아닙니다.'; if (!c.eligible) return 'FA 자격이 없고 활동 개시 후 만 3년이 지난 선수만 연봉조정을 신청할 수 있습니다.';
    clubFig = Math.round(clamp(+clubFig || c.clubDefault, this.minSal(), Math.max(c.playerAsk, c.clubDefault)) * 10) / 10;
    const ref = this._arbRef(c.p), pa = c.playerAsk, win = Math.abs(pa - ref) < Math.abs(clubFig - ref) ? 'player' : 'club';
    return { win, final: win === 'player' ? pa : clubFig, clubFig, playerAsk: pa, ref };
  };
  /* 신청: 위원회가 결정(저장만 하고 계약은 수용 때 체결) → 수용 또는 거부(규약 제79조) */
  proto.arbFile = function (id, clubFig) {
    const off = this.S.off, d = this.arbDecide(id, clubFig); if (typeof d === 'string') return d;
    (off.arbPending = off.arbPending || {})[id] = d; return d;
  };
  proto.arbAccept = function (id) {
    const S = this.S, off = S.off, p = S.players[id], d = off && off.arbPending && off.arbPending[id]; if (!d) return '위원회 결정이 없습니다.';
    const prev = p.contract.salary; p.contract = this._newContract(p, d.final, 1); p.salHist = (p.salHist || []).slice(-2).concat([d.final]); off.rep.expiring = off.rep.expiring.filter(x => x !== id); delete off.arbPending[id];
    p.loyAdj = clamp((p.loyAdj || 0) - (d.win === 'club' ? 3 : 1), -15, 15);   // 조정을 거친 관계는 서로 불편해진다(선수가 지면 더 크게)
    (off.rep.arb = off.rep.arb || []).push({ id, ko: p.ko, year: S.year, prev, playerAsk: d.playerAsk, clubFig: d.clubFig, win: d.win, final: d.final });
    news(this, `${p.ko} 연봉조정: 선수 ${d.playerAsk}억 vs 구단 ${d.clubFig}억 → ${d.win === 'player' ? '선수안' : '구단안'} ${d.final}억 채택(1년 계약)`);
    this.invalidate(); return null;
  };
  proto.arbRefuse = function (id) {   // 구단이 중재금액으로 계약을 거부 → 자유계약선수(규약 제79조 ③)
    const S = this.S, off = S.off, p = S.players[id]; if (!off || !off.rep.expiring.includes(id) || p.team !== S.userTeam || !this.arbEligible(p)) return '연봉조정 대상이 아닙니다.';
    off.rep.expiring = off.rep.expiring.filter(x => x !== id); if (off.arbPending) delete off.arbPending[id]; this.release(S.userTeam, id, false); news(this, `${p.ko}: 구단이 연봉조정 결과를 거부해 자유계약선수로 공시`); return null;
  };
  /* 오프시즌 확정 시 아직 합의되지 않은 FA 대상 외 선수: 3년 이상이면 연봉조정, 3년 미만은 구단 제시액으로 계약 */
  proto._arbSettle = function (id) {
    const S = this.S, p = S.players[id]; if (!p || p.foreign || this.faEligible(p)) return false;
    if (this.arbEligible(p)) { const r = this.arbFile(id); if (typeof r !== 'string' && !this.arbAccept(id)) return true; }
    const a = this.arbClubDefault(p); p.contract = this._newContract(p, a, 1); p.salHist = (p.salHist || []).slice(-2).concat([a]); S.off.rep.expiring = S.off.rep.expiring.filter(x => x !== id); S.off.rep.auto = (S.off.rep.auto || 0) + 1; return true;
  };
});
