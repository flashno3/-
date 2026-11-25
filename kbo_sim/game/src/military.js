/* 병역: 실존 선수의 병역 상태(사용자 제공 2026년 11월 말 기준 목록, 빌드 때 p.mil로 매칭) + 게임 안의 입대·전역 순환.
 *  규약 근거: 제24조 ②(군 입대 선수는 선수 정원에서 제외, 군보류 기간 = 입대일~전역일), 제62조 ④(군보류수당 = 연봉의 25%, 최대 1,200만원, 10개월 지급).
 *  상무 지원 만 19~27세(지원서 접수 연도 기준, 현역병 모집업무 규정)·입영 연기 상한 만 28세(병역법) — 사용자 제공 근거(law.go.kr·easylaw.go.kr·mma.go.kr 링크).
 *  상무 선발(사용자 제공 자료): 연 2회(12월·이듬해 3월 말 입대), 연간 선발 = 다음 12개월 전역 예정 인원 ± 2(상무 인원 약 42명 이내), 지원자 중 최근 WAR 순(동률은 OVR).
 *  ⚠ 게임 설정: AI 구단의 지원 시점 판단(27세는 100%)·두 회차 배분(상위 절반 12월)·현역 복무 중 성장 정체·현역 복귀 감각 저하.
 *  상태: done(필)·ag(AG 금메달 예술체육요원, 필로 취급)·serving(복무 중)·pending(미필)·sangmu27(2027 상무 1차 합격, 2027년 6월 입대 ⚠)·unknown(목록에 없는 실존 선수 — 입대 대상에서 제외).
 *  게임 중 새로 들어오는 국내 신인은 미필(pending)로 시작. 외국인은 대상 아님. 복무 기간 18개월(기존 상무 처리와 같음). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TEAMS, KO0, news } = LG.OFFC;
  const SVC = 18, SANGMU_MAX_AGE = 27, ST_KO = { done: '병역 필', ag: '병역 필(AG 금메달)', serving: '복무 중', pending: '미필', sangmu27: '미필(2027 상무 합격)', apply: '미필(상무 지원 중)', unknown: '병역 정보 없음' };
  const ym = s => { const [y, m] = String(s).split(/[-.]/).map(Number); return y * 12 + (m - 1); };
  proto.milStatus = function (p) { if (!p || p.foreign) return null; const m = p.mil || { st: p.team === 'MIL' ? 'serving' : 'unknown' }; return Object.assign({ label: ST_KO[m.st] || m.st }, m); };
  proto._milEnlist = function (p, ymFrom, kind, why) {   // 입대: 로스터에서 빼서 상무/현역 복무 명단으로
    const S = this.S, t = p.team; if (!(t in S.teams)) return false; this.removeFromTeam(t, p.id); if (p.sub) delete p.sub; if (p.rehab) delete p.rehab;
    p.team = 'MIL'; p.milTeam = t; p.milFrom = `${Math.floor(ymFrom / 12)}.${String(ymFrom % 12 + 1).padStart(2, '0')}`; p.milReturn = ymFrom + SVC; p.milKind = kind; p.active = false; p.lockUntil = 0;
    p.mil = Object.assign({}, p.mil || {}, { st: 'serving', kind, since: p.milFrom }); (S.mil = S.mil || []).includes(p.id) || S.mil.push(p.id);
    if (S.players[p.id] === p) { if (t === S.userTeam) this.repairSettings(t); else this.refreshTeam(t); } this.invalidate();
    if (why !== false) this._lnews(`${KO0[t] || t} ${p.ko}(${p.age}세) ${kind === 'sangmu' ? '상무' : kind === 'army' ? '현역' : ''} 입대 — ${p.milFrom.replace('.', '년 ')}월, 전역 예정 ${Math.floor(p.milReturn / 12)}년 ${p.milReturn % 12 + 1}월`);
    return true;
  };
  /* 게임 시작: 목록에서 '복무 중(입대 연월 있음)'인데 아직 구단 로스터에 있는 선수를 복무 명단으로(2026년 11~12월 입대자) */
  proto._milInit = function () {
    const S = this.S, moved = [], ids = [];
    for (const p of Object.values(S.players)) {
      if (p.foreign) continue;
      if (!p.mil) p.mil = { st: p.team === 'MIL' ? 'serving' : 'unknown', src: p.team === 'MIL' ? 'data' : 'none' };
      if (p.team === 'MIL' && !p.milKind) p.milKind = 'sangmu';
      if (p.mil.st === 'serving' && p.mil.enlist && p.team in S.teams) { const f = ym(p.mil.enlist), kind = /-12$/.test(p.mil.enlist) || /-04$/.test(p.mil.enlist) ? 'sangmu' : 'unknown'; const t0 = p.team, sal = p.contract ? p.contract.salary : 0; this._milEnlist(p, f, kind, false); moved.push(p.ko); ids.push({ id: p.id, t: t0, sal }); }
    }
    S.milInit = { moved, ids, at: '2026년 11월 말 목록' };
  };
  const ARMY_RUST = -0.1;   // 현역 복귀 감각 저하(일회성, 능력 이동량 −0.1 ≈ OVR −1.4, ⚠ 가정: 18개월 실전 공백)
  proto._milReturned = function (p) { const army = p.milKind === 'army', o0 = this.ovr(p); if (army) { p.p = this._shifted(p, ARMY_RUST); (p.devLog = p.devLog || []).push({ y: this.S.year, v: 0, why: `현역 복귀 감각 저하(OVR ${o0}→${this.ovr(p)})` }); this.invalidate(); } p.mil = Object.assign({}, p.mil || {}, { st: 'done', src: (p.mil && p.mil.src) || 'game', back: this.S.year }); delete p.milKind; };
  /* 2027 상무 1차 합격자: 2027년 3월 29일 입대(사용자 제공) — 정규시즌 시작 시점에 복무 명단으로 */
  proto._milDay = function () {
    const S = this.S; if (S.phase !== 'regular' || S.year !== 2027) return;
    for (const p of Object.values(S.players)) if (p.mil && p.mil.st === 'sangmu27' && p.team in S.teams) this._milEnlist(p, S.year * 12 + 2, 'sangmu');
    for (const p of Object.values(S.players)) if (p.mil && p.mil.st === 'apply' && p.mil.win === 'spring' && p.team in S.teams) this._milEnlist(p, S.year * 12 + 2, 'sangmu');   // 3월 말 회차 합격자
  };
  /* 오프시즌(12월 입대): AI 구단은 자동, 내 구단은 선수별 결정 이벤트 */
  const ROSTER_CAP = 42, INTAKE = 27;   // 상무 인원 상시 약 38~42명(사용자 제공), 18개월 복무라 연간 선발 약 27명(=40÷1.5) ±2
  const WANT = { 22: 0.1, 23: 0.25, 24: 0.35, 25: 0.45, 26: 0.6 };   // AI 구단 미필 선수의 연도별 상무 지원 확률(⚠ 가정, 다년 시뮬레이션에서 미필 적체가 생기지 않게), 27세는 100%
  proto._milOffseason = function () {
    const S = this.S, y = S.year, when = y * 12 + 11;
    for (const t of TEAMS) {
      const core = new Set(this.players(t).slice().sort((a, b) => this.ovr(b) - this.ovr(a)).slice(0, 5).map(p => p.id));
      for (const p of this.players(t)) {
        const m = p.mil; if (p.foreign || !m || m.st !== 'pending') continue; const age = p.age, ov = this.ovr(p), r = rngFor(S.seed, y, 4300, parseInt(String(p.id).slice(1)) || 0);
        if (t === S.userTeam) { if (age >= 24) this._milEvent(p, age > SANGMU_MAX_AGE); continue; }
        const deadline = age > SANGMU_MAX_AGE, pr = age >= SANGMU_MAX_AGE ? 1 : (WANT[clamp(age, 22, 26)] || 0) * (core.has(p.id) ? 0.5 : 1); if (age < 22 || r.random() >= pr) continue;   // 만 27세 오프시즌에는 반드시(상무 지원 마지막 해)
        if (deadline) this._milEnlist(p, when, 'army'); else p.mil = Object.assign({}, m, { st: 'apply', y, last: age >= SANGMU_MAX_AGE });   // 지원서 제출 — 선발은 새 시즌 직전(_milSelect)
      }
      const o = this.players(t).filter(q => !q.foreign).map(q => this.ovr(q)).sort((a, b) => a - b), med = o.length ? o[Math.floor(o.length / 2)] : 40;
      for (const p of this.players(t)) {   // AI: 상무 지원하지 않은 21~26세 미필 중 팀 중간 이하 선수는 해마다 30%가 현역·사회복무로 먼저 입대(⚠ 가정 — 미필 적체 방지)
        if (t === S.userTeam || p.foreign || !p.mil || p.mil.st !== 'pending' || p.age < 21 || p.age >= SANGMU_MAX_AGE || this.ovr(p) >= med || core.has(p.id)) continue;
        if (rngFor(S.seed, y, 4310, parseInt(String(p.id).slice(1)) || 0).random() < 0.3) this._milEnlist(p, when, 'army');
      }
    }
  };
  proto._milEvent = function (p, deadline) {
    const when = this.S.year * 12 + 11, w = Math.round(this.war(p) * 10) / 10;
    return this._evAdd({ type: 'military', ttl: 9999, def: deadline ? 'army' : 'wait', rec: deadline ? 'army' : p.age >= 26 ? 'sangmu' : 'wait', data: { pid: p.id, when }, title: `${p.ko} 병역 계획`, text: `${p.ko}(${p.age}세, OVR ${this.ovr(p)})은 병역 미필입니다. ${deadline ? `상무 지원 나이(만 ${SANGMU_MAX_AGE}세 이하, 현역병 모집업무 규정)를 넘겨 더 미룰 수 없습니다.` : '입대 시기를 정해야 합니다. 상무는 퓨처스리그에서 계속 뛰지만, 현역은 18개월 동안 야구를 거의 하지 못합니다.'} 복무 중에는 선수 정원에서 빠지고 구단이 군보류수당(연봉의 25%, 최대 0.12억)을 냅니다.`, choices: [
      { k: 'sangmu', label: '상무 지원', req: deadline ? `만 ${SANGMU_MAX_AGE}세 초과` : null, hint: `연간 선발 인원(다음 1년 전역 예정 ±2) 안에서 지원자 중 최근 WAR 순 선발(올해 WAR ${w}) · 합격하면 12월 또는 3월 말 입대 · 18개월 퓨처스 출전(성장 유지) · ${p.age >= SANGMU_MAX_AGE ? '떨어지면 현역 입대(마지막 해)' : '떨어지면 내년에 다시'}` },
      { k: 'army', label: '현역 입대(12월)', hint: '18개월 · 실전 공백으로 성장 정체(⚠ 출전 비중 10%) · 복귀 때 감각 저하(OVR 약 −1.4)' },
      { k: 'wait', label: '내년으로 미룬다', req: deadline ? '더 미룰 수 없음' : null, hint: '올해는 팀에 남는다 · 나이가 찰수록 선택지가 줄어든다' }] });
  };
  proto._milResolve = function (e, k) {
    const S = this.S, p = S.players[e.data.pid]; if (!p || p.team !== S.userTeam || !p.mil || p.mil.st !== 'pending') return '이미 정리된 일입니다.';   // (지원자는 st: 'apply')
    if (k === 'sangmu') { p.mil = Object.assign({}, p.mil, { st: 'apply', y: S.year, last: p.age >= SANGMU_MAX_AGE }); return `${p.ko}이(가) 상무에 지원했습니다. 결과는 새 시즌 직전 발표됩니다(지원자 중 최근 WAR 순).`; }
    if (k === 'army') { this._milEnlist(p, e.data.when, 'army'); return `${p.ko}이(가) 12월 현역으로 입대합니다.`; }
    return `${p.ko}의 입대를 내년으로 미룹니다.`;
  };
  /* 상무 선발(새 시즌 직전): T/O = 다음 12개월 전역 예정 상무 인원 ± 2(인원 42명 이내), 지원자 최근 WAR 순. 상위 절반 = 12월 입대, 나머지 = 3월 말 입대(⚠ 배분 가정).
   *  탈락자: 마지막 해(27세)면 현역, 아니면 미필로 돌아가 내년에 다시 */
  proto._milSelect = function () {
    const S = this.S, Y = S.year - 1, all = Object.values(S.players); for (const p of all) if (p.mil && p.mil.st === 'apply' && !(p.team in S.teams && p.mil.y === Y)) p.mil = Object.assign({}, p.mil, { st: 'pending' });   // 구단을 떠났거나 지난 지원서는 미필로
    const apps = all.filter(p => p.mil && p.mil.st === 'apply' && p.mil.y === Y && p.team in S.teams);
    if (!apps.length) return null; const sm = (S.mil || []).map(id => S.players[id]).filter(p => p && p.milKind !== 'army'), out12 = sm.filter(p => p.milReturn <= (Y + 1) * 12 + 11).length;
    const r = rngFor(S.seed, Y, 4400), to = clamp(Math.min(INTAKE + Math.floor(r.random() * 5) - 2, ROSTER_CAP - sm.length), 0, 40);   // 연 25~29명, 지금 복무 인원 + 새 인원이 42명을 넘지 않게
    const rank = apps.slice().sort((a, b) => (this.war(b) - this.war(a)) || (this.ovr(b) - this.ovr(a))), win = rank.slice(0, to), lose = rank.slice(to), half = Math.ceil(win.length / 2);
    win.forEach((p, i) => { if (i < half) this._milEnlist(p, Y * 12 + 11, 'sangmu'); else { p.mil = Object.assign({}, p.mil, { win: 'spring' }); this._milEnlist(p, S.year * 12 + 2, 'sangmu'); } });
    const med = {}; for (const t of TEAMS) { const o = this.players(t).filter(q => !q.foreign).map(q => this.ovr(q)).sort((a, b) => a - b); med[t] = o.length ? o[Math.floor(o.length / 2)] : 40; }
    for (const p of lose) { if (p.mil.last) this._milEnlist(p, Y * 12 + 11, 'army');
      else if (p.team !== S.userTeam && this.ovr(p) < med[p.team] && r.random() < 0.5) this._milEnlist(p, Y * 12 + 11, 'army');   // AI: 팀 중간 이하 탈락자는 절반이 현역으로(⚠ 가정)
      else p.mil = Object.assign({}, p.mil, { st: 'pending', tried: (p.mil.tried || 0) + 1 }); }
    const mine = rank.filter(p => p.milTeam === S.userTeam || p.team === S.userTeam);
    S.milSel = { y: Y, to, out: out12, apps: apps.length, win: win.length, cap: ROSTER_CAP };
    this._lnews(`상무 야구단 선발: 지원 ${apps.length}명 중 ${win.length}명 합격(연간 선발 인원 ${to}명 · 전역 예정 ${out12}명)`);
    for (const p of mine) news(this, win.includes(p) ? `${p.ko} 상무 합격 — ${p.milFrom.replace('.', '년 ')}월 입대` : p.team === 'MIL' ? `${p.ko} 상무 탈락 — 현역 입대` : `${p.ko} 상무 탈락 — 내년에 다시 지원할 수 있습니다`);
    return S.milSel;
  };
  /* 군보류수당(제62조 ④): 복무 중인 내 구단 소속 선수 연봉의 25%, 최대 0.12억/년 */
  proto.milAllowance = function (t) { const S = this.S; return Math.round((S.mil || []).map(id => S.players[id]).filter(p => p && p.milTeam === t && p.contract).reduce((a, p) => a + Math.min(0.12, 0.25 * p.contract.salary), 0) * 100) / 100; };
  proto.milSummary = function (t) { const c = {}; for (const p of this.players(t).concat((this.S.mil || []).map(id => this.S.players[id]).filter(p => p && p.milTeam === t))) { if (p.foreign) continue; const s = this.milStatus(p); c[s.st] = (c[s.st] || 0) + 1; } return c; };
});
