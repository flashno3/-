/* KBO 감독 모드: 훈련 센터 (타자/투수 분리 집중훈련 · 개별 훈련 슬롯 · 코치 연동 · 프리셋 · 부상 위험 · 비시즌 캠프)
 * 성장 계산 규칙은 기존과 같다: 시즌 중 매일 누적한 훈련 일수가 연말 성장(양의 성장분)에 곱해진다.
 *   - 전체 보정  = 1 + 0.12 × Σ(집중 분야 비중 × 분야 기본값 × 코치 보정)
 *   - 능력치 가중 = 1 + 0.5 × Σ(집중 분야 비중 × 분야 가중치 × 코치 보정)  (집중한 능력치가 더 빨리 큼, 양의 성장일 때만)
 *   - 코치 보정  = 1 + 0.006 × (담당 코치 능력 − 60), 0.8~1.25
 * 훈련 설정이 모두 '없음/보통'이면 이전 버전과 결과가 같다(AI 구단에는 적용되지 않음). 엔진(경기 시뮬레이션)은 건드리지 않는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { League, rngFor, clamp } = LG;
  const proto = League.prototype;
  const r1 = v => Math.round(v * 10) / 10;
  const INT = { light: 0.5, normal: 1, heavy: 1.5 }, INT_INJ = { light: 0.92, normal: 1, heavy: 1.15 }, INT_KO = { light: '가볍게', normal: '보통', heavy: '강하게' };
  const SEASON_DAYS = 190;   // 시즌 중 훈련이 누적되는 날짜 수(개막 전 포함 추정치)
  const FOC = {
    B: {
      none: { n: '없음', base: 0, w: {}, tip: '특별한 집중 없이 운영' },
      all: { n: '종합 타격', base: 1, w: {}, coach: ['contact', 'power', 'eye'], tip: '타자 전체 성장 ↑(모든 타격 능력에 고르게)' },
      contact: { n: '컨택', base: 0.7, w: { k: 1, babip: 1 }, coach: ['contact'], tip: '삼진 감소·타구 질(BABIP) 성장 ↑' },
      power: { n: '장타', base: 0.7, w: { hr: 1, xbh: 1 }, coach: ['power'], tip: '홈런·장타 성장 ↑' },
      eye: { n: '선구', base: 0.7, w: { bb: 1, k: 0.5 }, coach: ['eye'], tip: '볼넷 증가·삼진 감소 성장 ↑' },
      run: { n: '주루', base: 0.4, w: {}, speed: 0.06, coach: ['speed'], tip: '도루 능력 성장 ↑' },
      def: { n: '수비', base: 0.5, w: {}, range: 1.2, coach: ['defense'], tip: '수비 범위 성장 ↑' },
      cond: { n: '컨디션 관리', base: 0.4, w: {}, coach: ['mgmt'], tip: '소폭 성장 ↑ · 부상 위험 −12%' },
      strength: { n: '근력', base: 0.3, w: { hr: 0.6, xbh: 0.6 }, phys: true, injMul: 1.04, coach: ['power', 'mgmt'], tip: '장타 성장 소폭 ↑ · 신체 부담으로 부상 위험 +4% · 어릴수록 효과 큼' },
      endur: { n: '지구력', base: 0.3, w: {}, phys: true, injMul: 0.95, coach: ['mgmt'], tip: '소폭 성장 ↑ · 부상 위험 −5% · 어릴수록 효과 큼' },
      prevent: { n: '부상 예방', base: 0.2, w: {}, phys: true, injMul: 0.8, coach: ['mgmt'], tip: '부상 위험 −20%(고령일수록 효과 큼) · 성장 효과는 작음' },
      recover: { n: '회복', base: 0.2, w: {}, phys: true, injMul: 0.92, coach: ['mgmt'], tip: '부상 위험 −8% · 타자는 컨디션 회복에 유리(고령일수록 효과 큼)' }
    },
    P: {
      none: { n: '없음', base: 0, w: {}, tip: '특별한 집중 없이 운영' },
      all: { n: '종합 투구', base: 1, w: {}, coach: ['stuff', 'control', 'stamina'], tip: '투수 전체 성장 ↑' },
      stuff: { n: '구위', base: 0.7, w: { k: 1, hr: 1 }, coach: ['stuff'], tip: '탈삼진 증가·피홈런 감소 성장 ↑' },
      control: { n: '제구', base: 0.7, w: { bb: 1, babip: 0.5 }, coach: ['control'], tip: '볼넷 감소·피안타 성장 ↑' },
      stamina: { n: '체력', base: 0.3, w: {}, stamina: 2.0, coach: ['stamina'], tip: '체력(이닝 소화) 성장 ↑' },
      cond: { n: '컨디션 관리', base: 0.4, w: {}, coach: ['mgmt'], tip: '소폭 성장 ↑ · 부상 위험 −12%' },
      strength: { n: '근력', base: 0.3, w: { k: 0.6 }, phys: true, injMul: 1.04, coach: ['stuff', 'mgmt'], tip: '탈삼진 성장 소폭 ↑ · 신체 부담으로 부상 위험 +4% · 어릴수록 효과 큼' },
      endur: { n: '지구력', base: 0.3, w: {}, stamina: 1.5, phys: true, injMul: 0.95, coach: ['stamina', 'mgmt'], tip: '체력(이닝 소화) 성장 ↑ · 부상 위험 −5% · 어릴수록 효과 큼' },
      prevent: { n: '부상 예방', base: 0.2, w: {}, phys: true, injMul: 0.8, coach: ['mgmt'], tip: '부상 위험 −20%(고령일수록 효과 큼) · 성장 효과는 작음' },
      recover: { n: '회복', base: 0.2, w: {}, phys: true, injMul: 0.92, rec: 1.25, coach: ['mgmt'], tip: '피로 회복 +25%(고령일수록 효과 큼) · 부상 위험 −8%' }
    }
  };
  const EMPH = 0.5;
  proto.trainFocusInfo = function (side) { return FOC[side]; };
  proto.trainFocusKeys = function (side) { return Object.keys(FOC[side]); };
  proto.trainIntenName = function (k) { return INT_KO[k] || k; };
  const sideOf = p => p.type === 'P' ? 'P' : 'B';
  /* 신체 훈련(phys)의 나이별 효과: 성장 효과는 어릴수록 크고(≤25 1.0 · ≤29 0.8 · ≤33 0.5 · 그 외 0.3), 부상 예방·회복 효과는 고령일수록 크다(≤25 0.8 · ≤30 1.0 · 그 외 1.4). ⚠ 계수는 가정 */
  const ageGrow = age => age <= 25 ? 1 : age <= 29 ? 0.8 : age <= 33 ? 0.5 : 0.3, ageProt = age => age <= 25 ? 0.8 : age <= 30 ? 1 : 1.4;
  const focInjMul = (side, f, age) => { const i = FOC[side][f]; if (!i) return 1; if (f === 'cond') return 0.88; if (!i.phys) return 1; const m = i.injMul || 1; return m < 1 ? 1 - (1 - m) * ageProt(age) : m; };

  /* ---------------- 설정 (구 설정 호환) ---------------- */
  proto.trainCfg = function () {
    const S = this.S, T = S.train || {};
    if (T.B && T.P) return { B: { focus: T.B.focus || 'none', inten: T.B.inten || 'normal' }, P: { focus: T.P.focus || 'none', inten: T.P.inten || 'normal' }, slots: T.slots || [], groups: T.groups || {} };
    const it = T.inten || 'normal', m = { none: ['none', 'none'], bat: ['all', 'none'], pit: ['none', 'all'], def: ['def', 'none'], cond: ['cond', 'cond'] }[T.focus || 'none'] || ['none', 'none'];   // 구 설정(집중 분야 1개·강도 1개) → 타자/투수 분리
    return { B: { focus: m[0], inten: it }, P: { focus: m[1], inten: it }, slots: T.slots || [], groups: T.groups || {} };
  };
  proto._trainSave = function (cfg) { this.S.train = { B: cfg.B, P: cfg.P, slots: cfg.slots, groups: cfg.groups || {} }; };
  proto._trainLog = function (text) { const S = this.S; (S.trainLog = S.trainLog || []).unshift({ y: S.year, d: S.day, ph: S.phase, text }); if (S.trainLog.length > 40) S.trainLog.pop(); };
  proto.setTrainSide = function (side, k, v) {
    const cfg = this.trainCfg(); if (!cfg[side]) return false;
    if (k === 'focus' && !FOC[side][v]) return false; if (k === 'inten' && !INT[v]) return false; if (k !== 'focus' && k !== 'inten') return false;
    if (cfg[side][k] === v) return true; cfg[side][k] = v; this._trainSave(cfg); this._trainLog(`${side === 'B' ? '타자' : '투수'} ${k === 'focus' ? '집중 분야 → ' + FOC[side][v].n : '훈련 강도 → ' + INT_KO[v]}`); return true;
  };
  proto.train = function () {   // 구 API: 집중 분야 1개·강도 1개로 보이는 값
    const c = this.trainCfg(); let focus = 'none';
    if (c.B.focus === 'cond' && c.P.focus === 'cond') focus = 'cond'; else if (c.B.focus === 'def' && c.P.focus === 'none') focus = 'def'; else if (c.B.focus !== 'none' && c.P.focus === 'none') focus = 'bat'; else if (c.P.focus !== 'none' && c.B.focus === 'none') focus = 'pit'; else if (c.B.focus !== 'none') focus = 'bat';
    return { focus, inten: c.B.inten === c.P.inten ? c.B.inten : c.B.inten };
  };
  proto.setTrain = function (k, v) {   // 구 API 호환(테스트·저장 파일): 집중 분야/강도를 타자·투수에 함께 적용
    const ok = { focus: ['none', 'bat', 'pit', 'def', 'cond'], inten: ['light', 'normal', 'heavy'] }; if (!ok[k] || !ok[k].includes(v)) return false;
    const cfg = this.trainCfg();
    if (k === 'inten') { cfg.B.inten = v; cfg.P.inten = v; } else { const m = { none: ['none', 'none'], bat: ['all', 'none'], pit: ['none', 'all'], def: ['def', 'none'], cond: ['cond', 'cond'] }[v]; cfg.B.focus = m[0]; cfg.P.focus = m[1]; }
    this._trainSave(cfg); return true;
  };

  /* ---------------- 역할·포지션 그룹별 훈련 방침 ----------------
     타자 = 포수·내야수·외야수·지명타자, 투수 = 선발·구원·마무리. 그룹마다 집중 분야·강도를 따로 정하면 팀(타자/투수) 설정보다 우선한다(우선순위: 개별 훈련 > 그룹 > 팀).
     각 항목은 '팀 설정 따름'(inherit)으로 되돌릴 수 있고, 그룹을 따로 정하지 않으면 이전과 결과가 같다. */
  const GROUPS = { B: { C: '포수', IF: '내야수', OF: '외야수', DH: '지명타자' }, P: { SP: '선발', RP: '구원', CL: '마무리' } };
  proto.trainGroupOf = function (p) {
    if (p.type === 'P') { const S = this.S, set = S.teams[p.team] && S.teams[p.team].set; return set && set.bullpen && set.bullpen.closer === p.id ? 'CL' : p.role === 'SP' ? 'SP' : 'RP'; }
    return p.pos === 'C' ? 'C' : ['1B', '2B', '3B', 'SS'].includes(p.pos) ? 'IF' : ['LF', 'CF', 'RF'].includes(p.pos) ? 'OF' : 'DH';
  };
  const groupSide = g => GROUPS.B[g] ? 'B' : 'P';
  proto.trainEffCfg = function (p, cfg) {   // 이 선수에게 실제로 적용되는 훈련: 개별 슬롯 > 그룹 > 팀
    cfg = cfg || this.trainCfg(); const side = sideOf(p), sl = cfg.slots.find(x => x.id === p.id); if (sl) return { focus: sl.focus, inten: sl.inten, src: 'slot' };
    const o = (cfg.groups || {})[this.trainGroupOf(p)] || {}; return { focus: o.focus || cfg[side].focus, inten: o.inten || cfg[side].inten, src: o.focus || o.inten ? 'group' : 'team' };
  };
  proto.trainGroupInfo = function () {
    const cfg = this.trainCfg(), t = this.S.userTeam, pl = this.players(t), out = [];
    for (const side of ['B', 'P']) for (const k of Object.keys(GROUPS[side])) { const o = (cfg.groups || {})[k] || {}; out.push({ key: k, side, name: GROUPS[side][k], n: pl.filter(p => sideOf(p) === side && this.trainGroupOf(p) === k).length, focus: o.focus || cfg[side].focus, inten: o.inten || cfg[side].inten, ownFocus: !!o.focus, ownInten: !!o.inten }); }
    return out;
  };
  proto.setTrainGroup = function (g, k, v) {
    const side = groupSide(g); if (!GROUPS[side][g]) return '알 수 없는 그룹입니다.'; if (k !== 'focus' && k !== 'inten') return '잘못된 설정입니다.';
    const cfg = this.trainCfg(); cfg.groups = Object.assign({}, cfg.groups); const o = Object.assign({}, cfg.groups[g]);
    if (v === 'inherit') delete o[k]; else { if (k === 'focus' && !FOC[side][v]) return '이 그룹에 맞지 않는 훈련입니다.'; if (k === 'inten' && !INT[v]) return '잘못된 강도입니다.'; o[k] = v; }
    if (Object.keys(o).length) cfg.groups[g] = o; else delete cfg.groups[g];
    this._trainSave(cfg); this._trainLog(`${GROUPS[side][g]} ${k === 'focus' ? '집중 분야 → ' + (v === 'inherit' ? '팀 설정 따름' : FOC[side][v].n) : '강도 → ' + (v === 'inherit' ? '팀 설정 따름' : INT_KO[v])}`); this.invalidate(); return null;
  };
  /* ---------------- 일일 누적 ---------------- */
  proto._trainAcc = function () {
    const S = this.S, a = S.trainAcc = S.trainAcc || { total: 0 };
    if (!a.B || !a.P) {   // 구 저장 파일의 누적(bat/pit/def/cond) 변환
      a.B = a.B || {}; a.P = a.P || {}; if (a.bat) a.B.all = (a.B.all || 0) + a.bat; if (a.pit) a.P.all = (a.P.all || 0) + a.pit; if (a.def) a.B.def = (a.B.def || 0) + a.def; if (a.cond) { a.B.cond = (a.B.cond || 0) + a.cond; a.P.cond = (a.P.cond || 0) + a.cond; } delete a.bat; delete a.pit; delete a.def; delete a.cond; delete a.none;
    }
    return a;
  };
  proto._trainDay = function () {
    const S = this.S; if (S.phase !== 'regular' && S.phase !== 'preseason') return;
    if (this._skillDay) this._skillDay();
    const cfg = this.trainCfg(), a = this._trainAcc();
    if (!a.g) { a.g = {}; for (const side of ['B', 'P']) for (const k of Object.keys(GROUPS[side])) a.g[k] = Object.assign({}, a[side] || {}); }   // 그룹 누적: 처음 만들 때까지의 팀 누적을 그대로 복사(그룹을 따로 정하지 않았다면 팀 누적과 같다)
    a.total++;
    for (const side of ['B', 'P']) { a[side][cfg[side].focus] = (a[side][cfg[side].focus] || 0) + (INT[cfg[side].inten] || 1); for (const k of Object.keys(GROUPS[side])) { const o = (cfg.groups || {})[k] || {}, f = o.focus || cfg[side].focus, it = o.inten || cfg[side].inten; a.g[k][f] = (a.g[k][f] || 0) + (INT[it] || 1); } }
    for (const id of S.trainTrack || []) {   // 개별 훈련 슬롯에 들어간 적이 있는 선수는 자기 누적을 따로 센다
      const p = S.players[id]; if (!p || p.team !== S.userTeam || !p.tr || p.tr.y !== S.year) continue; p.tr.total++;
      if (this.isInj(p)) continue;   // 부상 기간에는 훈련 효과가 쌓이지 않는다
      const ef = this.trainEffCfg(p, cfg), f = ef.focus, it = ef.inten; p.tr.acc[f] = (p.tr.acc[f] || 0) + (INT[it] || 1);
    }
  };

  /* ---------------- 효과 ---------------- */
  proto.trainCoach = function (side, focus) {   // 집중 분야를 담당하는 코치(능력치가 가장 높은 코치)와 보정값
    const S = this.S, t = S.userTeam, info = FOC[side][focus]; if (!info || !info.coach || !S.coach) return { rating: 60, cf: 1, names: [], grade: '-', who: '-' };
    const r = info.coach.map(f => this.coachRating(t, f)), avg = r.reduce((x, y) => x + y, 0) / r.length;
    const list = this.coachesOf(t), best = list.map(c => ({ c, v: info.coach.reduce((x, f) => x + (c[f] || 0), 0) / info.coach.length })).sort((x, y) => y.v - x.v)[0];
    return { rating: Math.round(avg), cf: clamp(1 + 0.006 * (avg - 60), 0.8, 1.25), grade: this.coachGrade(avg), who: best ? best.c.name : '-', fields: info.coach };
  };
  proto._trainShares = function (p) {
    const S = this.S, a = this._trainAcc(), side = sideOf(p);
    if (p.tr && p.tr.y === S.year && p.tr.total > 0) return { acc: p.tr.acc, total: p.tr.total };
    const gk = this.trainGroupOf(p); if (a.g && a.g[gk]) return { acc: a.g[gk], total: a.total };
    return { acc: a[side] || {}, total: a.total };
  };
  proto._trainEff = function (p) {
    const out = { mult: 1, w: {}, speed: 0, range: 0, stamina: 0 }, S = this.S; if (p.team !== S.userTeam) return out;
    const sh = this._trainShares(p); if (!sh.total) return out; const side = sideOf(p), cfCache = {}; let tot = 0;
    for (const f of Object.keys(sh.acc)) {
      const info = FOC[side][f]; if (!info || !info.base && !Object.keys(info.w).length) continue; const share = sh.acc[f] / sh.total; if (share <= 0) continue;
      const cf = (cfCache[f] || (cfCache[f] = this.trainCoach(side, f).cf)) * (info.phys ? ageGrow(p.age) : 1);
      tot += share * info.base * cf;
      for (const k of Object.keys(info.w)) out.w[k] = (out.w[k] || 1) + EMPH * share * info.w[k] * cf;
      if (info.speed) out.speed += share * info.speed * cf; if (info.range) out.range += share * info.range * cf; if (info.stamina) out.stamina += share * info.stamina * cf;
    }
    out.mult = 1 + 0.12 * tot * (this.investMult ? this.investMult('train') : 1); return out;   // 훈련 시설 투자: 훈련 보정 ×1.05~1.15(투자하지 않으면 1)
  };
  proto._trainMult = function (p) { return this._trainEff(p).mult; };
  proto._trainInjFor = function (p) {
    const ef = this.trainEffCfg(p), f = ef.focus, it = ef.inten;
    return (INT_INJ[it] || 1) * focInjMul(sideOf(p), f, p.age);
  };
  proto._trainInj = function () { const c = this.trainCfg(), v = s => (INT_INJ[c[s].inten] || 1) * focInjMul(s, c[s].focus, 28); return (v('B') + v('P')) / 2; };
  proto.trainInjMulFor = function (side, f, age) { return focInjMul(side, f, age === undefined ? 28 : age); };   // 화면 표시용(28세 기준)
  proto._trainRec = function (p) {   // 회복 훈련: 투수 피로 회복 배율(해당 훈련을 받는 내 투수만)
    if (p.type !== 'P' || p.team !== this.S.userTeam) return 1; const f = this.trainEffCfg(p).focus, i = FOC.P[f]; return i && i.rec ? 1 + (i.rec - 1) * ageProt(p.age) : 1;
  };
  proto.trainRisk = function (p) {   // 훈련으로 인한 부상 위험(기본 대비 %)과 사유
    const cfg = this.trainCfg(), side = sideOf(p), sl = cfg.slots.find(x => x.id === p.id), m = this._trainInjFor(p), pct = Math.round((m - 1) * 100), why = [];
    { const ef = this.trainEffCfg(p, cfg); if (ef.inten === 'heavy') why.push(ef.src === 'slot' ? '개별 훈련 강하게' : ef.src === 'group' ? `${GROUPS[side][this.trainGroupOf(p)]} 훈련 강하게` : `${side === 'B' ? '타자' : '투수'} 팀 훈련 강하게`); }
    if (p.age >= 33) why.push(`${p.age}세 고령(기본 위험 +30%)`); if (p.age <= 24) why.push('젊은 선수(기본 위험 −10%)'); if ((p.fat || 0) >= 35) why.push('피로 누적');
    const lvl = pct >= 15 && p.age >= 33 ? 'high' : pct >= 15 || (p.fat || 0) >= 35 && pct > 0 ? 'mid' : pct < 0 ? 'low' : 'normal';
    return { pct, level: lvl, why, mult: m };
  };
  proto.trainRiskList = function () {
    const t = this.S.userTeam; return this.players(t).filter(p => p.active && !this.isInj(p)).map(p => ({ p, r: this.trainRisk(p) })).filter(x => x.r.level === 'high' || (x.r.level === 'mid' && x.p.age >= 31)).sort((a, b) => b.r.pct - a.r.pct || b.p.age - a.p.age).slice(0, 8);
  };

  /* ---------------- 연말 예상 성장 ---------------- */
  proto.trainForecast = function () {
    const a = this._trainAcc(), S = this.S, pl = this.players(S.userTeam).filter(p => p.age <= 30 && !p.foreign), avg = pl.length ? pl.reduce((x, p) => x + (this._trainEff(p).mult - 1), 0) / pl.length : 0;
    const legacy = { total: a.total, bat: (a.B.all || 0) + (a.B.contact || 0) + (a.B.power || 0) + (a.B.eye || 0) + (a.B.run || 0), pit: (a.P.all || 0) + (a.P.stuff || 0) + (a.P.control || 0) + (a.P.stamina || 0), def: a.B.def || 0, cond: Math.max(a.B.cond || 0, a.P.cond || 0) };
    return { days: a.total, acc: legacy, accSide: a, avgBonus: Math.round(avg * 1000) / 10 };
  };
  proto.trainPreview = function () {   // 지금 설정을 시즌 끝까지 유지했을 때의 연말 성장 보정(추정)
    const S = this.S, a = this._trainAcc(), cfg = this.trainCfg(), left = Math.max(0, SEASON_DAYS - a.total), out = {};
    const save = S.trainAcc, proj = JSON.parse(JSON.stringify(save)); if (!proj.g) { proj.g = {}; for (const side of ['B', 'P']) for (const k of Object.keys(GROUPS[side])) proj.g[k] = Object.assign({}, proj[side] || {}); } proj.total += left;
    for (const side of ['B', 'P']) { proj[side][cfg[side].focus] = (proj[side][cfg[side].focus] || 0) + left * (INT[cfg[side].inten] || 1); for (const k of Object.keys(GROUPS[side])) { const o = (cfg.groups || {})[k] || {}, f = o.focus || cfg[side].focus, it = o.inten || cfg[side].inten; proj.g[k][f] = (proj.g[k][f] || 0) + left * (INT[it] || 1); } }
    S.trainAcc = proj;
    try {
      for (const side of ['B', 'P']) {
        const pl = this.players(S.userTeam).filter(p => sideOf(p) === side && p.age <= 30 && !p.foreign && !(S.trainTrack || []).includes(p.id)), effs = pl.map(p => this._trainEff(p));
        const mult = effs.length ? effs.reduce((x, e) => x + e.mult, 0) / effs.length : 1, w = {};
        for (const e of effs) for (const k of Object.keys(e.w)) w[k] = (w[k] || 0) + e.w[k] / effs.length;
        out[side] = { n: pl.length, bonus: r1((mult - 1) * 100), fields: Object.entries(w).map(([k, v]) => [k, r1((v - 1) * 100)]).filter(x => x[1] >= 1).sort((x, y) => y[1] - x[1]) };
      }
    } finally { S.trainAcc = save; }
    out.daysLeft = left; return out;
  };
  const FIELD_KO = { k: '삼진·탈삼진', bb: '볼넷', hr: '홈런', babip: '타구 질', xbh: '장타' };
  proto.trainFieldName = function (k) { return FIELD_KO[k] || k; };

  /* ---------------- 개별 훈련 슬롯 ---------------- */
  proto.slotLimit = function () { const S = this.S; const m = S.coach ? this.coachRating(S.userTeam, 'mgmt') : 45; return clamp(2 + Math.floor((m - 40) / 12), 2, 6); };   // 육성관리 코치 능력이 높을수록 슬롯이 늘어난다
  proto.trainSlots = function () { return this.trainCfg().slots.filter(x => this.S.players[x.id] && this.S.players[x.id].team === this.S.userTeam); };
  proto.slotAdd = function (id, focus, inten) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== S.userTeam) return '우리 팀 선수만 지정할 수 있습니다.'; const cfg = this.trainCfg(); cfg.slots = this.trainSlots();
    if (cfg.slots.some(x => x.id === id)) return '이미 개별 훈련 중입니다.'; if (cfg.slots.length >= this.slotLimit()) return `개별 훈련은 ${this.slotLimit()}명까지입니다(육성관리 코치 능력에 따라 늘어납니다).`;
    const side = sideOf(p); focus = focus || (cfg[side].focus !== 'none' ? cfg[side].focus : side === 'B' ? 'all' : 'all'); if (!FOC[side][focus]) return '이 선수에게 맞지 않는 훈련입니다.'; inten = INT[inten] ? inten : cfg[side].inten;
    cfg.slots.push({ id, focus, inten }); this._trainSave(cfg); this._slotTrack(p); this._trainLog(`${p.ko} 개별 훈련 시작: ${FOC[side][focus].n}(${INT_KO[inten]})`); this.invalidate(); return null;
  };
  proto._slotTrack = function (p) {   // 슬롯에 들어간 시점까지의 팀 누적을 복사해 이후는 개별로 센다
    const S = this.S, a = this._trainAcc(), side = sideOf(p); if (p.tr && p.tr.y === S.year) return; p.tr = { y: S.year, total: a.total, acc: Object.assign({}, (a.g && a.g[this.trainGroupOf(p)]) || a[side] || {}) }; S.trainTrack = S.trainTrack || []; if (!S.trainTrack.includes(p.id)) S.trainTrack.push(p.id);
  };
  proto.slotSet = function (id, k, v) {
    const cfg = this.trainCfg(), sl = cfg.slots.find(x => x.id === id), p = this.S.players[id]; if (!sl || !p) return '개별 훈련 중인 선수가 아닙니다.'; const side = sideOf(p);
    if (k === 'focus') { if (!FOC[side][v]) return '이 선수에게 맞지 않는 훈련입니다.'; sl.focus = v; } else if (k === 'inten') { if (!INT[v]) return '잘못된 강도입니다.'; sl.inten = v; } else return '잘못된 설정입니다.';
    this._trainSave(cfg); this._trainLog(`${p.ko} 개별 훈련 변경: ${FOC[side][sl.focus].n}(${INT_KO[sl.inten]})`); return null;
  };
  proto.slotRemove = function (id) { const cfg = this.trainCfg(), p = this.S.players[id]; const n = cfg.slots.length; cfg.slots = cfg.slots.filter(x => x.id !== id); if (cfg.slots.length === n) return '개별 훈련 중인 선수가 아닙니다.'; this._trainSave(cfg); if (p) this._trainLog(`${p.ko} 개별 훈련 종료`); this.invalidate(); return null; };
  proto.slotCandidates = function () {   // 추천: 성장 여력이 큰 젊은 선수·부진한 선수
    const S = this.S, t = S.userTeam, inSlot = new Set(this.trainSlots().map(x => x.id)), out = [];
    for (const p of this.players(t)) { if (inSlot.has(p.id) || p.foreign || this.isInj(p) || p.age > 30) continue; let sc = 0, why = '';
      if (p.age <= 25 && p.pot > 0.25) { sc += 3 + p.pot * 2; why = `성장 여력(잠재력 ${this.potLetter ? this.potLetter(p) : ''})`; }
      if (this.moodOf(p) <= -1) { sc += 2; why = why || '컨디션 부진'; }
      if (p.age <= 28 && p.active) sc += 0.5; if (sc > 0) out.push({ p, sc, why }); }
    return out.sort((a, b) => b.sc - a.sc).slice(0, 8);
  };

  /* ---------------- 약점 보완 훈련 ----------------
     선수의 세부 능력(컨택·선구·구위·제구 등)을 같은 유형 리그 평균과 비교해 가장 뒤처진 항목을 찾고, 그 능력치를 키우는 개별 훈련(집중 분야)을 추천한다.
     효과는 기존 개별 훈련과 같은 규칙(집중 분야 가중·코치 보정)이며, 약점 보완으로 시작하면 슬롯에 '약점 보완: ○○'가 표시된다. */
  const WEAK_MAP = { B: { '컨택': 'contact', '타구질': 'contact', '선구': 'eye', '파워': 'power', '장타': 'power', '주력': 'run', '수비': 'def' }, P: { '구위': 'stuff', '피홈런': 'stuff', '제구': 'control', '타구억제': 'control', '체력': 'stamina' } };
  proto._leagueSubAvg = function (type) {
    const S = this.S, key = type + '|' + S.year + '|' + S.day; if (this._lsa && this._lsa.key === key) return this._lsa.v;
    const sum = {}, cnt = {}; for (const p of Object.values(S.players)) { if (p.type !== type || !(p.team in S.teams) || p.foreign) continue; const sub = this.sub(p); for (const k in sub) { sum[k] = (sum[k] || 0) + sub[k]; cnt[k] = (cnt[k] || 0) + 1; } }
    const v = {}; for (const k in sum) v[k] = sum[k] / cnt[k]; this._lsa = { key, v }; return v;
  };
  proto.trainWeakness = function (p) {   // 이 선수의 약점 순위(리그 평균 대비 격차가 큰 순): [{ stat, focus, val, avg, gap }]
    if (!p || (p.type !== 'B' && p.type !== 'P')) return []; const sub = this.sub(p), avg = this._leagueSubAvg(p.type), map = WEAK_MAP[p.type], seen = {}, out = [];
    for (const k of Object.keys(map)) { if (sub[k] === undefined || avg[k] === undefined) continue; const f = map[k], gap = avg[k] - sub[k]; if (!seen[f] || gap > seen[f].gap) seen[f] = { stat: k, focus: f, val: Math.round(sub[k]), avg: Math.round(avg[k]), gap: Math.round(gap * 10) / 10 }; }
    for (const f of Object.keys(seen)) out.push(seen[f]); return out.sort((a, b) => b.gap - a.gap);
  };
  proto.trainWeakList = function (n) {   // 팀에서 약점 보완 효과가 클 선수: 약점 격차 × 나이 계수(젊을수록 큼)
    const S = this.S, t = S.userTeam, inSlot = new Set(this.trainSlots().map(x => x.id)), out = [];
    for (const p of this.players(t)) { if (p.foreign || inSlot.has(p.id) || this.isInj(p) || p.age > 32) continue; const w = this.trainWeakness(p)[0]; if (!w || w.gap < 4) continue;
      const af = p.age <= 25 ? 1.3 : p.age <= 29 ? 1 : p.age <= 31 ? 0.6 : 0.4; out.push({ p, w, score: w.gap * af, why: `${w.stat} ${w.val} (리그 평균 ${w.avg}) — 약점` }); }
    return out.sort((a, b) => b.score - a.score).slice(0, n || 8);
  };
  proto.slotAddWeak = function (id, focus) {   // 약점을 겨냥한 개별 훈련 시작(focus를 주지 않으면 가장 큰 약점, 강도는 보통)
    const p = this.S.players[id]; if (!p) return '선수를 찾을 수 없습니다.'; const ws = this.trainWeakness(p), w = focus ? ws.find(x => x.focus === focus) : ws[0]; if (!w) return '보완할 약점을 찾지 못했습니다.';
    const e = this.slotAdd(id, w.focus, 'normal'); if (e) return e; const cfg = this.trainCfg(); cfg.slots = cfg.slots.map(x => x.id === id ? Object.assign({}, x, { weak: w.stat }) : x); this._trainSave(cfg); return null;
  };
  /* ---------------- 훈련 효과 분석 ----------------
     연말 성장 때 내 선수마다 (훈련 보정 배율, 실제 OVR 변화)를 기록한다. 양의 성장분에 훈련 배율이 곱해지므로 '훈련으로 늘어난 몫'은 변화량 × (1 − 1/배율)로 추정한다(⚠ 반사실 시뮬레이션이 아닌 추정).
     캠프 비용과 그해 부상 건수를 함께 보여 투입 대비 효과를 가늠한다. */
  proto._trainRecord = function (p, d) {
    const S = this.S, te = this._trainEff(p), R = S.trainRep && S.trainRep.y === S.year ? S.trainRep : (S.trainRep = { y: S.year, rows: [] });
    if (!(te.mult > 1) && !Object.keys(te.w).length && !te.speed && !te.range && !te.stamina) return;
    const ef = this.trainEffCfg(p), attr = d > 0 && te.mult > 1 ? d * (1 - 1 / te.mult) : 0;
    R.rows.push({ id: p.id, name: p.ko, age: p.age, side: sideOf(p), grp: this.trainGroupOf(p), mult: Math.round(te.mult * 1000) / 1000, d: Math.round(d * 100) / 100, attr: Math.round(attr * 100) / 100, src: ef.src, focus: ef.focus, inten: ef.inten, weak: (this.trainCfg().slots.find(x => x.id === p.id) || {}).weak || null });
    const tt = S.trainTot = S.trainTot || {}; tt[S.year] = Math.round(((tt[S.year] || 0) + attr) * 100) / 100;
  };
  proto.trainReport = function () {
    const S = this.S, R = S.trainRep; if (!R || !R.rows.length) return null; const camp = (S.campHist && S.campHist[R.y]) || { cost: 0, days: 0 }, inj = (S.injHist && S.injHist[R.y]) || 0, rows = R.rows, sum = a => a.reduce((x, y) => x + y, 0);
    const grp = {}; for (const r of rows) { const g = grp[r.grp] = grp[r.grp] || { key: r.grp, side: r.side, n: 0, mult: 0, d: 0, attr: 0, focus: {} }; g.n++; g.mult += r.mult; g.d += r.d; g.attr += r.attr; g.focus[r.focus] = (g.focus[r.focus] || 0) + 1; }
    const groups = Object.values(grp).map(g => ({ key: g.key, side: g.side, n: g.n, bonus: Math.round((g.mult / g.n - 1) * 1000) / 10, d: Math.round(g.d * 10) / 10, attr: Math.round(g.attr * 100) / 100, focus: Object.entries(g.focus).sort((a, b) => b[1] - a[1])[0][0] }));
    const total = Math.round(sum(rows.map(r => r.attr)) * 100) / 100;
    return { y: R.y, n: rows.length, groups, total, slots: rows.filter(r => r.src === 'slot').sort((a, b) => b.attr - a.attr), top: rows.slice().sort((a, b) => b.attr - a.attr).slice(0, 5), camp, inj, eff: camp.cost > 0 ? Math.round(total / camp.cost * 100) / 100 : null, hist: Object.keys(S.trainTot || {}).map(y => ({ y: +y, total: S.trainTot[y], camp: ((S.campHist || {})[y] || {}).cost || 0, inj: (S.injHist || {})[y] || 0 })).sort((a, b) => b.y - a.y).slice(0, 4) };
  };
  proto.trainGroupName = function (k) { return (GROUPS.B[k] || GROUPS.P[k] || k); };
  proto.trainFocusName = function (side, f) { return (FOC[side][f] || {}).n || f; };

  /* ---------------- 기술 습득 프로젝트(타격폼 조정 · 구종 습득) ----------------
     선수 한 명이 수개월(80일, 부상 중에는 진행 안 됨) 걸려 특정 능력을 다듬는 장기 프로젝트. 시작 비용 0.4억(새 시즌 행사 비용에 계상), 동시 진행은 개별 훈련 한도의 절반(1~3개).
     완료 때 성공 / 부분 성공 / 실패를 가른다(⚠ 확률·크기는 가정값): 성공 확률 = 0.40 + 0.005×(담당 코치 능력 − 60) + 나이(≤25 +0.08 · ≥33 −0.12) + 성장 여력(+0.05) − 동시 진행 페널티, 15~80%.
     성공은 연말 성장 때 해당 세부 능력에 일회성 보너스(영구)를 더하고, 부분 성공은 절반, 실패는 20일간 컨디션 저하(−1)만 남긴다. 보너스는 연말 성장 계산(progress)에서만 적용되어 평소 능력치·경기 엔진은 건드리지 않는다. */
  const SKILL = {
    B: { form_contact: { n: '타격폼 조정(컨택)', f: { k: 0.30, babip: 0.20 }, coach: ['contact'] }, form_power: { n: '타격폼 조정(장타)', f: { hr: 0.30, xbh: 0.25 }, coach: ['power'] }, form_eye: { n: '타석 접근법(선구)', f: { bb: 0.30, k: 0.12 }, coach: ['eye'] } },
    P: { pitch_new: { n: '새 구종 습득', f: { k: 0.30, babip: 0.20 }, coach: ['stuff', 'control'] }, pitch_cmd: { n: '제구 교정', f: { bb: 0.32, babip: 0.12 }, coach: ['control'] }, pitch_hr: { n: '피홈런 억제(구종 배합)', f: { hr: 0.30, k: 0.12 }, coach: ['stuff'] } }
  };
  const SKILL_DAYS = 80, SKILL_COST = 0.4, FIELD_KO2 = { k: '삼진·탈삼진', bb: '볼넷', hr: '홈런', babip: '타구 질', xbh: '장타' };
  proto.skillKinds = function (side) { return Object.entries(SKILL[side]).map(([k, v]) => ({ k, n: v.n, fields: Object.keys(v.f).map(f => FIELD_KO2[f]).join('·') })); };
  proto.skillCost = function () { return SKILL_COST; }; proto.skillDays = function () { return SKILL_DAYS; };
  proto.skillLimit = function () { return clamp(Math.floor(this.slotLimit() / 2), 1, 3); };
  proto.skillProjects = function () { const S = this.S; return (S.skillProj || []).filter(x => S.players[x.id] && S.players[x.id].team === S.userTeam); };
  proto.skillChance = function (p, kind) {
    const side = sideOf(p), info = SKILL[side][kind]; if (!info) return 0; const t = this.S.userTeam, cr = info.coach.reduce((a, f) => a + this.coachRating(t, f), 0) / info.coach.length;
    const others = Math.max(0, this.skillProjects().filter(x => x.id !== p.id).length);
    return Math.round(clamp(0.40 + 0.005 * (cr - 60) + (p.age <= 25 ? 0.08 : p.age >= 33 ? -0.12 : 0) + (p.pot > 0.3 ? 0.05 : 0) - 0.04 * others, 0.15, 0.8) * 100) / 100;
  };
  proto.skillStart = function (id, kind) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== S.userTeam || p.foreign) return '우리 팀 국내 선수만 프로젝트를 맡길 수 있습니다.'; const side = sideOf(p), info = SKILL[side][kind]; if (!info) return '이 선수에게 맞지 않는 프로젝트입니다.';
    if (this.isInj(p)) return `${p.ko}은(는) 부상 중입니다.`; const ps = this.skillProjects(); if (ps.some(x => x.id === id)) return '이미 프로젝트 중인 선수입니다.'; if (ps.length >= this.skillLimit()) return `기술 프로젝트는 동시에 ${this.skillLimit()}개까지입니다(육성관리 코치 능력에 따라 늘어납니다).`;
    if (p.age >= 36) return '36세 이상은 새 기술을 익히기 어렵습니다.'; const f = S.fin && S.fin.teams && S.fin.teams[S.userTeam]; if (!f) return '재정 정보가 없습니다.'; const room = this.faRoom(S.userTeam); if (room < SKILL_COST) return `예산 부족: 비용 ${SKILL_COST}억이 FA 여유자금 ${room.toFixed(1)}억을 넘습니다.`;
    f.evCost = Math.round(((f.evCost || 0) + SKILL_COST) * 10) / 10; (S.skillProj = S.skillProj || []).push({ id, kind, y: S.year, start: S.day, prog: 0, chance: this.skillChance(p, kind) });
    this._trainLog(`${p.ko} 기술 프로젝트 시작: ${info.n}(성공 확률 ${Math.round(this.skillChance(p, kind) * 100)}%)`); this.invalidate(); return null;
  };
  proto.skillCancel = function (id) { const S = this.S, n = (S.skillProj || []).length; S.skillProj = (S.skillProj || []).filter(x => x.id !== id); return S.skillProj.length === n ? '진행 중인 프로젝트가 아닙니다.' : null; };
  proto._skillDay = function () {
    const S = this.S, list = S.skillProj; if (!list || !list.length) return; const keep = [];
    for (const pr of list) {
      const p = S.players[pr.id]; if (!p || p.team !== S.userTeam || p.retired) continue; if (!this.isInj(p)) pr.prog++;
      if (pr.prog < SKILL_DAYS) { keep.push(pr); continue; }
      const side = sideOf(p), info = SKILL[side][pr.kind], u = rngFor(S.seed, S.year, parseInt(String(pr.id).replace(/\D/g, '')) * 31 + pr.start, 8800).random(), pc = pr.chance, res = u < pc ? 'success' : u < pc + 0.3 * (1 - pc) ? 'partial' : 'fail';
      const log = { y: S.year, d: S.day, id: p.id, name: p.ko, kind: pr.kind, n: info.n, res }; (S.skillLog = S.skillLog || []).unshift(log); if (S.skillLog.length > 20) S.skillLog.pop();
      if (res === 'fail') { p.mood = { v: -1, until: S.day + 20 }; } else { const d = S.skillDone = S.skillDone || {}; d[p.id] = { y: S.year, kind: pr.kind, scale: res === 'success' ? 1 : 0.5 }; }
      const tx = res === 'success' ? `${p.ko} ${info.n} 성공! — 연말 성장 때 ${Object.keys(info.f).map(f => FIELD_KO2[f]).join('·')} 보너스가 반영됩니다.` : res === 'partial' ? `${p.ko} ${info.n} 부분 성공 — 연말 성장 보너스가 절반 반영됩니다.` : `${p.ko} ${info.n} 실패 — 20일간 컨디션이 떨어집니다.`;
      S.news.unshift({ year: S.year, day: S.day, text: tx }); if (S.news.length > 120) S.news.length = 120; if (this.story) this.story('train', tx, res === 'success' ? 2 : 1);
    }
    S.skillProj = keep;
  };
  proto._skillApply = function (p) {   // 연말 성장(progress)에서 호출: {필드: 단위} 일회성 보너스를 돌려주고 소모(없으면 null)
    const S = this.S, d = S.skillDone && S.skillDone[p.id]; if (!d) return null; delete S.skillDone[p.id]; const info = (SKILL.B[d.kind] || SKILL.P[d.kind]); if (!info) return null;
    const out = {}; for (const f of Object.keys(info.f)) out[f] = info.f[f] * d.scale; return out;
  };

  /* ---------------- 프리셋 ---------------- */
  const BUILTIN = [
    { id: 'b_bal', name: '균형 육성', cfg: { B: { focus: 'all', inten: 'normal' }, P: { focus: 'all', inten: 'normal' } }, tip: '타자·투수 모두 종합 훈련(보통)' },
    { id: 'b_bat', name: '타선 강화', cfg: { B: { focus: 'all', inten: 'heavy' }, P: { focus: 'none', inten: 'light' } }, tip: '타자 강하게, 투수는 가볍게' },
    { id: 'b_pit', name: '마운드 강화', cfg: { B: { focus: 'none', inten: 'light' }, P: { focus: 'all', inten: 'heavy' } }, tip: '투수 강하게, 타자는 가볍게' },
    { id: 'b_win', name: '우승 도전(컨디션)', cfg: { B: { focus: 'cond', inten: 'normal' }, P: { focus: 'cond', inten: 'normal' } }, tip: '성장보다 부상 예방·컨디션 우선' },
    { id: 'b_off', name: '쉬어가기', cfg: { B: { focus: 'none', inten: 'light' }, P: { focus: 'none', inten: 'light' } }, tip: '훈련 부담을 줄여 부상 위험 −8%' }
  ];
  proto.trainPresets = function () { return BUILTIN.map(x => Object.assign({ builtin: true }, x)).concat((this.S.trainPresets || []).map(x => Object.assign({ builtin: false }, x))); };
  proto.applyTrainPreset = function (id) {
    const pr = this.trainPresets().find(x => x.id === id); if (!pr) return '프리셋을 찾을 수 없습니다.'; const cfg = this.trainCfg();
    cfg.B = Object.assign({}, pr.cfg.B); cfg.P = Object.assign({}, pr.cfg.P); cfg.groups = JSON.parse(JSON.stringify(pr.cfg.groups || {})); if (pr.cfg.slots) { cfg.slots = []; for (const s of pr.cfg.slots) if (this.S.players[s.id] && this.S.players[s.id].team === this.S.userTeam && cfg.slots.length < this.slotLimit()) { cfg.slots.push(Object.assign({}, s)); this._slotTrack(this.S.players[s.id]); } }
    this._trainSave(cfg); this._trainLog(`프리셋 적용: ${pr.name}`); return null;
  };
  proto.saveTrainPreset = function (name) {
    const S = this.S; name = String(name || '').trim().slice(0, 12); if (!name) return '이름을 입력하세요.'; S.trainPresets = S.trainPresets || []; if (S.trainPresets.length >= 3) return '내 프리셋은 3개까지 저장할 수 있습니다.';
    if (S.trainPresets.some(x => x.name === name) || BUILTIN.some(x => x.name === name)) return '같은 이름의 프리셋이 있습니다.'; const cfg = this.trainCfg();
    S.trainPresets.push({ id: 'u' + (S.trainPresetSeq = (S.trainPresetSeq || 0) + 1), name, cfg: { B: Object.assign({}, cfg.B), P: Object.assign({}, cfg.P), groups: JSON.parse(JSON.stringify(cfg.groups || {})), slots: this.trainSlots().map(x => Object.assign({}, x)) } }); return null;
  };
  proto.deleteTrainPreset = function (id) { const S = this.S; const n = (S.trainPresets || []).length; S.trainPresets = (S.trainPresets || []).filter(x => x.id !== id); return S.trainPresets.length === n ? '삭제할 수 없습니다.' : null; };

  /* ---------------- 비시즌 캠프 ----------------
     오프시즌에만 설정. 타자·투수 각각 1개 분야에 규모(소/중/대)를 정하면, 새 시즌 훈련 누적에 일수(8/16/24일)가 더해지고 비용(1.0/2.2/3.6억 ⚠ 가정)이 새 시즌 행사 비용으로 계상된다. */
  const CAMP_DAYS = [0, 8, 16, 24], CAMP_COST = [0, 1.0, 2.2, 3.6], CAMP_KO = ['안 함', '소규모', '중규모', '대규모'];
  proto.campInfo = function () { return { days: CAMP_DAYS, cost: CAMP_COST, names: CAMP_KO }; };
  proto.camp = function () { const c = this.S.camp; return c && c.y === this.S.year ? c : { y: this.S.year, B: { focus: 'all', level: 0 }, P: { focus: 'all', level: 0 } }; };
  proto.campCanSet = function () { return this.S.phase === 'offseason' ? null : '비시즌 캠프는 오프시즌(시즌 종료 후 ~ 새 시즌 시작 전)에만 설정할 수 있습니다.'; };
  proto.campTotalCost = function () { const c = this.camp(); return r1(CAMP_COST[c.B.level] + CAMP_COST[c.P.level]); };
  proto.setCamp = function (side, focus, level) {
    const bl = this.campCanSet(); if (bl) return bl; if (!FOC[side] || !FOC[side][focus] || focus === 'none') return '잘못된 캠프 분야입니다.'; level = clamp(Math.round(level), 0, 3);
    const c = this.camp(); c[side] = { focus, level }; this.S.camp = c; this._trainLog(`비시즌 캠프(${side === 'B' ? '타자' : '투수'}): ${level ? FOC[side][focus].n + ' ' + CAMP_KO[level] : '안 함'}`); return null;
  };
  proto._campApply = function () {   // 새 시즌 시작 시: 캠프 일수를 훈련 누적에 더하고 비용을 계상
    const S = this.S, c = S.camp; if (!c || c.y !== S.year - 1) { S.camp = null; return; }
    const a = this._trainAcc(); let days = 0, cost = 0;
    for (const side of ['B', 'P']) { const x = c[side]; if (!x || !x.level) continue; const d = CAMP_DAYS[x.level]; a.total += d; a[side][x.focus] = (a[side][x.focus] || 0) + d; days += d; cost += CAMP_COST[x.level]; }
    (S.campHist = S.campHist || {})[S.year] = { cost: r1(cost), days };   // 훈련 효과 분석용(그 해 캠프)
    if (cost > 0 && S.fin && S.fin.teams && S.fin.teams[S.userTeam]) { const f = S.fin.teams[S.userTeam]; f.evCost = Math.round(((f.evCost || 0) + cost) * 10) / 10; this._trainLog(`비시즌 캠프 종료: 훈련 누적 +${days}일, 비용 ${r1(cost)}억`); this.story('train', `비시즌 캠프 진행(비용 ${r1(cost)}억)`, 1); }
    S.camp = null;
  };

  /* ================= 스프링캠프 소식(오프시즌 FA 시장 기간) =================
   * FA 시장 28·38·50·62일차에 코칭스태프 소식이 생긴다. 어떤 선택도 새 시즌 개막 때 한 번만 반영되고, 기본값(결정하지 않으면)은 '변화 없음'이다.
   * 효과는 기존 장치만 쓴다(⚠ 크기는 가정값): 팀/개별 훈련 누적 일수(비시즌 캠프와 같은 방식), 개막 후 부상 위험 완화(restUntil, 일일 휴식과 같은 효과),
   * 개막 후 팀 컨디션 ±1(tmood와 같은 방식), 행사 비용 0.2억(evCost). 선수 능력치·재정 규칙·경기 엔진은 직접 바꾸지 않는다. */
  const CAMP_DAYS_AT = { theme: 28, prospect: 38, intensity: 50, vet: 62 };
  proto.campEv = function () { const S = this.S; if (!S.campEv || S.campEv.y !== S.year) S.campEv = { y: S.year, B: 0, P: 0, p: {}, rest: 0, tmood: 0, cost: 0, log: [] }; return S.campEv; };
  proto._campEvents = function (day) {
    const S = this.S, t = S.userTeam; if (S.phase !== 'offseason') return; const kind = Object.keys(CAMP_DAYS_AT).find(k => CAMP_DAYS_AT[k] === day); if (!kind) return;
    S.events = S.events || { seq: 0, list: [] }; if (S.events.list.some(e => e.type === 'camp' && e.data && e.data.y === S.year && e.data.kind === kind)) return;
    const ps = this.players(t), avg = a => (a.length ? Math.round(a.reduce((x, p) => x + this.ovr(p), 0) / a.length) : 0), B = ps.filter(p => p.type === 'B' && p.active), P = ps.filter(p => p.type === 'P' && p.active);
    const add = (title, text, choices, def, rec, data) => { const e = this._evAdd({ type: 'camp', title, ttl: 9999, text, choices, def, rec, data: Object.assign({ y: S.year, kind }, data || {}) }); e.exp = 1e9; };   // 만료 없음: 새 시즌 개막 때 기본값으로 처리
    if (kind === 'theme') {
      const gb = this.coachGrade(this.coachRating(t, 'contact')), gp = this.coachGrade(this.coachRating(t, 'stuff'));
      add('스프링캠프: 중점 과제 회의', `코칭스태프가 캠프 중점 과제를 묻습니다. 1군 타자 평균 OVR ${avg(B)}(타격 코치 ${gb}), 1군 투수 평균 OVR ${avg(P)}(투수 코치 ${gp}). 선택한 쪽에 새 시즌 훈련 누적 +3일이 더해집니다(비시즌 캠프와 같은 방식).`,
        [{ k: 'bat', label: '타자 중점 (+3일)', hint: '타자 훈련 누적 +3일' }, { k: 'pit', label: '투수 중점 (+3일)', hint: '투수 훈련 누적 +3일' }, { k: 'skip', label: '그대로 (변화 없음)', hint: '기본 캠프 일정' }], 'skip', avg(B) <= avg(P) ? 'bat' : 'pit');
    } else if (kind === 'prospect') {
      const y = ps.filter(p => p.age <= 23 && !this.isInj(p)).sort((a, b) => this.ovr(b) - this.ovr(a))[0]; if (!y) return;
      add(`스프링캠프: 유망주 ${y.ko} 지도`, `${y.ko}(${y.age}세 · ${y.type === 'P' ? (y.role === 'SP' ? '선발' : '구원') : y.pos} · OVR ${this.ovr(y)})은 내 팀 23세 이하 가운데 가장 높습니다. 캠프에서 어떻게 지도할까요? 개별 훈련 누적은 새 시즌 개막 때 반영됩니다.`,
        [{ k: 'mentor', label: '베테랑 멘토 (+3일)', hint: '개별 훈련 누적 +3일, 비용 없음' }, { k: 'focus', label: '집중 지도 (+5일, 0.2억)', hint: '개별 훈련 누적 +5일, 행사 비용 0.2억' }, { k: 'skip', label: '그대로 (변화 없음)', hint: '팀 훈련만 따라갑니다' }], 'skip', 'mentor', { pid: y.id });
    } else if (kind === 'intensity') {
      const old = ps.filter(p => p.age >= 33).length;
      add('스프링캠프: 훈련 강도 점검', `캠프 막바지입니다. 33세 이상 선수가 ${old}명입니다. 강도를 낮추면 개막 후 14일간 부상 위험이 −30%(일일 '휴식 배려'와 같은 효과), 높이면 팀 훈련 누적 +2일(타자·투수 각각)입니다.`,
        [{ k: 'ease', label: '강도 낮춤 (개막 후 14일 부상 위험 −30%)', hint: '개막 직후 14일 부상 위험 완화' }, { k: 'push', label: '강도 높임 (훈련 +2일)', hint: '타자·투수 훈련 누적 각 +2일' }, { k: 'skip', label: '그대로 (변화 없음)', hint: '기본 강도' }], 'skip', old >= 8 ? 'ease' : 'skip');
    } else if (kind === 'vet') {
      const v = ps.filter(p => p.age >= 33).sort((a, b) => (b.tn || 0) - (a.tn || 0) || this.ovr(b) - this.ovr(a))[0]; if (!v) return;
      add(`스프링캠프: 베테랑 ${v.ko} 면담`, `${v.ko}(${v.age}세 · 팀 ${v.tn || 0}시즌)이 새 시즌을 앞두고 면담을 청했습니다. 선수단의 중심이 되는 베테랑입니다. 면담하면 개막 후 10일간 팀 컨디션 +1이 적용됩니다.`,
        [{ k: 'talk', label: '면담 (개막 후 10일 팀 컨디션 +1)', hint: '충성도 +1, 개막 후 10일 팀 컨디션 +1' }, { k: 'skip', label: '다음에 (변화 없음)', hint: '' }], 'skip', 'talk', { pid: v.id });
    }
  };
  proto._campEvResolve = function (e, k) {
    const S = this.S, c = this.campEv(), D = e.data || {}; let res = '';
    if (D.y !== S.year) return '지난 캠프 소식입니다.';
    if (D.kind === 'theme') { if (k === 'bat') { c.B += 3; res = '타자 중점 캠프: 새 시즌 타자 훈련 누적 +3일.'; } else if (k === 'pit') { c.P += 3; res = '투수 중점 캠프: 새 시즌 투수 훈련 누적 +3일.'; } else res = '기본 캠프 일정을 유지합니다.'; }
    else if (D.kind === 'prospect') { const p = S.players[D.pid]; if (!p || p.team !== S.userTeam) res = '선수가 팀을 떠났습니다.'; else if (k === 'mentor') { c.p[p.id] = (c.p[p.id] || 0) + 3; res = `${p.ko}에게 베테랑 멘토를 붙입니다: 개별 훈련 누적 +3일.`; } else if (k === 'focus') { c.p[p.id] = (c.p[p.id] || 0) + 5; c.cost = r1(c.cost + 0.2); res = `${p.ko} 집중 지도: 개별 훈련 누적 +5일, 행사 비용 0.2억.`; } else res = `${p.ko}은(는) 팀 훈련을 따라갑니다.`; }
    else if (D.kind === 'intensity') { if (k === 'ease') { c.rest = 14; res = '캠프 강도를 낮췄습니다: 개막 후 14일간 부상 위험 −30%.'; } else if (k === 'push') { c.B += 2; c.P += 2; res = '캠프 강도를 높였습니다: 타자·투수 훈련 누적 각 +2일.'; } else res = '기본 강도를 유지합니다.'; }
    else if (D.kind === 'vet') { const p = S.players[D.pid]; if (!p || p.team !== S.userTeam) res = '선수가 팀을 떠났습니다.'; else if (k === 'talk') { p.loyAdj = clamp((p.loyAdj || 0) + 1, -15, 15); c.tmood = 1; res = `${p.ko}와 면담했습니다: 충성도 +1, 개막 후 10일 팀 컨디션 +1.`; } else res = `${p.ko} 면담은 다음 기회로 미뤘습니다.`; }
    c.log.push(res); return res;
  };
  proto._campEvClose = function () {   // 새 시즌 개막 직전: 결정하지 않은 캠프 소식을 기본으로 처리
    const S = this.S; for (const e of this.eventsOpen().filter(x => x.type === 'camp')) this.resolveEvent(e.id, e.def, true);
  };
  proto._campEvApply = function () {   // 새 시즌 개막 때 한 번만 반영
    const S = this.S, c = S.campEv; if (!c || c.y !== S.year - 1) { S.campEv = null; return; }
    const a = this._trainAcc(); let n = 0;
    for (const side of ['B', 'P']) if (c[side] > 0) { a.total += c[side]; a[side].all = (a[side].all || 0) + c[side]; n += c[side]; }
    for (const id of Object.keys(c.p)) { const p = S.players[id]; if (!p || p.team !== S.userTeam || p.retired) continue; this._slotTrack(p); p.tr.total += c.p[id]; p.tr.acc.all = (p.tr.acc.all || 0) + c.p[id]; n += c.p[id]; }
    if (c.rest > 0) S.restUntil = Math.max(S.restUntil || 0, S.day + c.rest);
    if (c.tmood) S.teamMood = { v: c.tmood, until: S.day + 10 };
    const f = S.fin && S.fin.teams && S.fin.teams[S.userTeam]; if (c.cost > 0 && f) f.evCost = Math.round(((f.evCost || 0) + c.cost) * 10) / 10;
    if (c.log.length) { this._trainLog(`스프링캠프 소식 반영: ${c.log.length}건`); this.story('train', `스프링캠프 결과 — ${c.log.join(' / ')}`, 1); }
    S.campEv = null; this.invalidate();
  };
});
