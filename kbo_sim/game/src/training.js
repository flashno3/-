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
      cond: { n: '컨디션 관리', base: 0.4, w: {}, coach: ['mgmt'], tip: '소폭 성장 ↑ · 부상 위험 −12%' }
    },
    P: {
      none: { n: '없음', base: 0, w: {}, tip: '특별한 집중 없이 운영' },
      all: { n: '종합 투구', base: 1, w: {}, coach: ['stuff', 'control', 'stamina'], tip: '투수 전체 성장 ↑' },
      stuff: { n: '구위', base: 0.7, w: { k: 1, hr: 1 }, coach: ['stuff'], tip: '탈삼진 증가·피홈런 감소 성장 ↑' },
      control: { n: '제구', base: 0.7, w: { bb: 1, babip: 0.5 }, coach: ['control'], tip: '볼넷 감소·피안타 성장 ↑' },
      stamina: { n: '체력', base: 0.3, w: {}, stamina: 2.0, coach: ['stamina'], tip: '체력(이닝 소화) 성장 ↑' },
      cond: { n: '컨디션 관리', base: 0.4, w: {}, coach: ['mgmt'], tip: '소폭 성장 ↑ · 부상 위험 −12%' }
    }
  };
  const EMPH = 0.5;
  proto.trainFocusInfo = function (side) { return FOC[side]; };
  proto.trainFocusKeys = function (side) { return Object.keys(FOC[side]); };
  proto.trainIntenName = function (k) { return INT_KO[k] || k; };
  const sideOf = p => p.type === 'P' ? 'P' : 'B';

  /* ---------------- 설정 (구 설정 호환) ---------------- */
  proto.trainCfg = function () {
    const S = this.S, T = S.train || {};
    if (T.B && T.P) return { B: { focus: T.B.focus || 'none', inten: T.B.inten || 'normal' }, P: { focus: T.P.focus || 'none', inten: T.P.inten || 'normal' }, slots: T.slots || [] };
    const it = T.inten || 'normal', m = { none: ['none', 'none'], bat: ['all', 'none'], pit: ['none', 'all'], def: ['def', 'none'], cond: ['cond', 'cond'] }[T.focus || 'none'] || ['none', 'none'];   // 구 설정(집중 분야 1개·강도 1개) → 타자/투수 분리
    return { B: { focus: m[0], inten: it }, P: { focus: m[1], inten: it }, slots: T.slots || [] };
  };
  proto._trainSave = function (cfg) { this.S.train = { B: cfg.B, P: cfg.P, slots: cfg.slots }; };
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
    const cfg = this.trainCfg(), a = this._trainAcc(); a.total++;
    for (const side of ['B', 'P']) a[side][cfg[side].focus] = (a[side][cfg[side].focus] || 0) + (INT[cfg[side].inten] || 1);
    for (const id of S.trainTrack || []) {   // 개별 훈련 슬롯에 들어간 적이 있는 선수는 자기 누적을 따로 센다
      const p = S.players[id]; if (!p || p.team !== S.userTeam || !p.tr || p.tr.y !== S.year) continue; p.tr.total++;
      if (this.isInj(p)) continue;   // 부상 기간에는 훈련 효과가 쌓이지 않는다
      const sl = cfg.slots.find(x => x.id === id), side = sideOf(p), f = sl ? sl.focus : cfg[side].focus, it = sl ? sl.inten : cfg[side].inten; p.tr.acc[f] = (p.tr.acc[f] || 0) + (INT[it] || 1);
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
    return { acc: a[side] || {}, total: a.total };
  };
  proto._trainEff = function (p) {
    const out = { mult: 1, w: {}, speed: 0, range: 0, stamina: 0 }, S = this.S; if (p.team !== S.userTeam) return out;
    const sh = this._trainShares(p); if (!sh.total) return out; const side = sideOf(p), cfCache = {}; let tot = 0;
    for (const f of Object.keys(sh.acc)) {
      const info = FOC[side][f]; if (!info || !info.base && !Object.keys(info.w).length) continue; const share = sh.acc[f] / sh.total; if (share <= 0) continue;
      const cf = cfCache[f] || (cfCache[f] = this.trainCoach(side, f).cf);
      tot += share * info.base * cf;
      for (const k of Object.keys(info.w)) out.w[k] = (out.w[k] || 1) + EMPH * share * info.w[k] * cf;
      if (info.speed) out.speed += share * info.speed * cf; if (info.range) out.range += share * info.range * cf; if (info.stamina) out.stamina += share * info.stamina * cf;
    }
    out.mult = 1 + 0.12 * tot; return out;
  };
  proto._trainMult = function (p) { return this._trainEff(p).mult; };
  proto._trainInjFor = function (p) {
    const cfg = this.trainCfg(), side = sideOf(p), sl = cfg.slots.find(x => x.id === p.id), f = sl ? sl.focus : cfg[side].focus, it = sl ? sl.inten : cfg[side].inten;
    return (INT_INJ[it] || 1) * (f === 'cond' ? 0.88 : 1);
  };
  proto._trainInj = function () { const c = this.trainCfg(), v = s => (INT_INJ[c[s].inten] || 1) * (c[s].focus === 'cond' ? 0.88 : 1); return (v('B') + v('P')) / 2; };
  proto.trainRisk = function (p) {   // 훈련으로 인한 부상 위험(기본 대비 %)과 사유
    const cfg = this.trainCfg(), side = sideOf(p), sl = cfg.slots.find(x => x.id === p.id), m = this._trainInjFor(p), pct = Math.round((m - 1) * 100), why = [];
    if (sl && sl.inten === 'heavy') why.push('개별 훈련 강하게'); else if (!sl && cfg[side].inten === 'heavy') why.push(`${side === 'B' ? '타자' : '투수'} 팀 훈련 강하게`);
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
    const save = S.trainAcc, proj = JSON.parse(JSON.stringify(save)); proj.total += left; for (const side of ['B', 'P']) proj[side][cfg[side].focus] = (proj[side][cfg[side].focus] || 0) + left * (INT[cfg[side].inten] || 1);
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
    const S = this.S, a = this._trainAcc(), side = sideOf(p); if (p.tr && p.tr.y === S.year) return; p.tr = { y: S.year, total: a.total, acc: Object.assign({}, a[side] || {}) }; S.trainTrack = S.trainTrack || []; if (!S.trainTrack.includes(p.id)) S.trainTrack.push(p.id);
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
    cfg.B = Object.assign({}, pr.cfg.B); cfg.P = Object.assign({}, pr.cfg.P); if (pr.cfg.slots) { cfg.slots = []; for (const s of pr.cfg.slots) if (this.S.players[s.id] && this.S.players[s.id].team === this.S.userTeam && cfg.slots.length < this.slotLimit()) { cfg.slots.push(Object.assign({}, s)); this._slotTrack(this.S.players[s.id]); } }
    this._trainSave(cfg); this._trainLog(`프리셋 적용: ${pr.name}`); return null;
  };
  proto.saveTrainPreset = function (name) {
    const S = this.S; name = String(name || '').trim().slice(0, 12); if (!name) return '이름을 입력하세요.'; S.trainPresets = S.trainPresets || []; if (S.trainPresets.length >= 3) return '내 프리셋은 3개까지 저장할 수 있습니다.';
    if (S.trainPresets.some(x => x.name === name) || BUILTIN.some(x => x.name === name)) return '같은 이름의 프리셋이 있습니다.'; const cfg = this.trainCfg();
    S.trainPresets.push({ id: 'u' + (S.trainPresetSeq = (S.trainPresetSeq || 0) + 1), name, cfg: { B: Object.assign({}, cfg.B), P: Object.assign({}, cfg.P), slots: this.trainSlots().map(x => Object.assign({}, x)) } }); return null;
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
    if (cost > 0 && S.fin && S.fin.teams && S.fin.teams[S.userTeam]) { const f = S.fin.teams[S.userTeam]; f.evCost = Math.round(((f.evCost || 0) + cost) * 10) / 10; this._trainLog(`비시즌 캠프 종료: 훈련 누적 +${days}일, 비용 ${r1(cost)}억`); this.story('train', `비시즌 캠프 진행(비용 ${r1(cost)}억)`, 1); }
    S.camp = null;
  };
});
