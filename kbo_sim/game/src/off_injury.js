(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 부상·코치진·육성(개발 계획) — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, rngFor, TEAMS, news, clamp, gauss } = LG.OFFC;
  /* ---------------- 부상 ----------------
   * [초기 장기 부상자] 뉴스 기반(data/injuries_2026.csv): 문동주·엄상백·윤영철·박진·이호성·신민혁·김영규·양재훈 등은 복귀 예정일까지 부상자 명단(1군 등록 불가).
   * [시즌 중 부상] 1군 선수가 경기일마다 확률적으로 부상(타자 0.30%·선발 0.42%·불펜 0.33%/일, 33세 이상 ×1.3, 24세 이하 ×0.9).
   *   경상 55%(7~14일) · 중등도 30%(15~35일) · 장기 12%(45~100일) · 시즌 아웃급 3%(150~330일, 수술). 달력 기준으로 회복하며, 회복하면 2군에서 대기(내 팀은 직접 등록, AI는 자동). */
  const INJ_B = [['햄스트링 염좌', 3], ['허리 통증', 2], ['손목 통증', 2], ['어깨 통증', 2], ['무릎 통증', 2], ['발목 염좌', 2], ['옆구리(복사근) 통증', 2], ['손가락 골절', 1], ['종아리 근육통', 2], ['사구 타박상', 2]];
  const INJ_P = [['팔꿈치 통증', 4], ['어깨 통증', 3], ['팔 피로 누적', 3], ['손가락 물집', 2], ['내전근 통증', 1], ['옆구리(복사근) 통증', 2], ['허리 통증', 1], ['햄스트링 염좌', 1]];
  const pickW = (r, list) => { let x = r.random() * list.reduce((a, b) => a + b[1], 0); for (const [n, w] of list) { if ((x -= w) < 0) return n; } return list[0][0]; };
  proto._injFix = function () { for (const p of Object.values(this.S.players)) if (p.inj && !this.isInj(p) && p.inj.generated) delete p.inj; };
  /* 부상 자동 관리(내 팀): off=직접 / fill=부상으로 빈 1군 자리를 같은 유형(같은 포지션 우선)의 건강한 2군 선수로 자동 채움(기본) / full=fill + 복귀한 선수가 1군 최저보다 낫다면 자동 교체(AI와 같은 기준) */
  proto.injAuto = function () { const v = this.S.injAuto; return v === 'off' || v === 'full' ? v : 'fill'; };
  proto._injAutoFix = function (out, back) {
    const S = this.S, user = S.userTeam, filled = [], swapped = [], val = q => q.type === 'B' ? this._runsB(q, true) : this._runsP(q);
    for (const q of out) {
      if (q.team !== user || q.active) continue; const g = this.callupGroup(q);
      const pool = this.players(user).filter(x => !x.active && x.type === q.type && x.id !== q.id && !this.isInj(x) && !this.lockLeft(x)).sort((a, b) => ((this.callupGroup(b) === g) - (this.callupGroup(a) === g)) || this.ovr(b) - this.ovr(a));
      for (const r of pool) { if (this.openSlots() <= 0) break; if (!this.moveActive(r.id, true)) { filled.push(`${q.ko} → ${r.ko}`); break; } }
    }
    if (this.injAuto() === 'full') for (const q of back) {
      if (q.team !== user || q.active || this.isInj(q) || this.lockLeft(q)) continue;
      const w = this.players(user).filter(x => x.active && x.type === q.type).sort((a, b) => val(a) - val(b))[0];
      if (w && val(q) > val(w) + 0.5 && !this.swapActive(q.id, w.id)) swapped.push(`${q.ko} ↔ ${w.ko}`);
    }
    if (filled.length) news(this, `자동 대체: 부상 공백을 2군에서 채웠습니다 — ${filled.join(', ')}`);
    if (swapped.length) news(this, `자동 복귀 등록: ${swapped.map(x => x.replace(' ↔ ', ' 복귀(1군) / 2군행 ')).join(', ')}`);
  };
  /* 대표팀 복귀(내 구단): 차출 전 1군이었으면 1군으로(빈자리 → 없으면 같은 유형 최저 가치 1군 선수와 교체, 규칙에 걸리면 다음 후보), 라인업에 있었으면 원래 포지션 자리로.
   *  차출은 사용자의 선택이 아니므로 원래 상태로 되돌린다. 자동 관리 '끄기'면 2군 대기(알림만) */
  proto._natlRestore = function (p) {
    const S = this.S, t = S.userTeam, pv = p.natlPrev; if (!pv || !pv.active || this.injAuto() === 'off' || this.isInj(p)) return '2군에서 대기 중';
    if (!p.active && this.openSlots() > 0) this.moveActive(p.id, true);
    const set = S.teams[t].set, inLin = q => (set.lineup || []).some(x => x.id === q.id), val = q => q.type === 'B' ? this._runsB(q, true) : this._runsP(q);
    if (!p.active) for (const w of this.players(t).filter(q => q.active && q.type === p.type && q.id !== p.id).sort((a, b) => (inLin(a) - inLin(b)) || val(a) - val(b))) { this.swapActive(p.id, w.id); if (p.active) break; }
    if (!p.active) return '1군 자리를 만들지 못해 2군에서 대기 중';
    if (pv.pos && !inLin(p)) { const i = (set.lineup || []).findIndex(x => x.pos === pv.pos); if (i >= 0) { set.lineup[i] = { id: p.id, pos: pv.pos }; this._engDirty = true; } }
    this.repairSettings(t); this.invalidate(); return inLin(p) ? `1군 복귀(라인업 ${pv.pos})` : '1군 복귀';
  };
  proto._injuryDay = function (d) {
    const S = this.S, now = this.todayN(), r = rngFor(S.seed, S.year, d, 7000), changed = new Set(), user = S.userTeam, back = {}, out = {};
    for (const t of TEAMS) for (const p of this.players(t)) {
      if (p.inj && p.inj.natl && !this.isInj(p)) { const dx0 = p.inj.dx;   // 국가대표 복귀(부상 아님: 부상 복귀 알림·유대 변화 없음, 보관해 둔 부상 기록 복원)
        if (p.injPrev) { p.inj = p.injPrev; delete p.injPrev; } else delete p.inj; changed.add(t); (back[t] = back[t] || []).push(p);
        if (t === user) { const how = this._natlRestore(p); news(this, `${/대표/.test(dx0) ? '대표팀 복귀' : '복귀'}: ${p.ko} — ${how}`); delete p.natlPrev; } continue;
      }
      if (p.inj && p.inj.apply !== false && !this.isInj(p)) {   // 복귀
        if (t === user) { news(this, `부상 복귀: ${p.ko} (${p.inj.dx}) — 2군에서 대기 중`); this._bondShift(p, 1, '부상 복귀'); if (this.injAuto() !== 'full') this._returnEvent(p); }
        if (p.inj.generated) delete p.inj; else p.inj.apply = false; changed.add(t); (back[t] = back[t] || []).push(p);
      }
    }
    for (const t of TEAMS) for (const p of this.players(t)) {
      if (!p.active || this.isInj(p)) continue;
      const pol = t === user ? this.policy() : null, hz = (t === user && this._wearInj ? this._wearInj() : 1) * (p.type === 'B' ? 0.0030 : p.role === 'SP' ? 0.0042 : 0.0033) * (p.age >= 33 ? 1.3 : p.age <= 24 ? 0.9 : 1) * (pol ? (p.type === 'P' ? { save: 0.8, normal: 1, push: 1.3 }[pol.pitch] : { low: 0.95, normal: 1, high: 1.1 }[pol.run]) * (S.restUntil && d < S.restUntil ? 0.75 : 1) * this._trainInjFor(p) * (this.investMult ? this.investMult('med') : 1) : 1);   // 운영 방침: 투수 혹사(push)·적극 주루는 부상 위험↑
      if (r.random() >= hz) continue;
      const u = r.random(), days0 = u < 0.55 ? 7 + Math.floor(r.random() * 8) : u < 0.85 ? 15 + Math.floor(r.random() * 21) : u < 0.97 ? 45 + Math.floor(r.random() * 56) : 150 + Math.floor(r.random() * 181);
      const days = t === user && this.investDur ? Math.max(1, Math.round(days0 * this.investDur())) : days0;   // 의무·재활 센터 투자: 복귀 기간 단축(투자하지 않으면 그대로)
      const sev = u < 0.55 ? '' : u < 0.85 ? '' : u < 0.97 ? '(장기)' : '(수술·시즌 아웃급)', part = pickW(r, p.type === 'B' ? INJ_B : INJ_P);
      const retN = now + days, rd = new Date(retN * 864e5);
      p.inj = { dx: u >= 0.97 ? part.replace('통증', '손상 → 수술') : part, since: `${S.year}-${String(new Date(now * 864e5).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(now * 864e5).getUTCDate()).padStart(2, '0')} 발생`, ret: rd.toISOString().slice(0, 10), retN, basis: '시즌 중 발생한 부상(확률 모델)', apply: true, generated: true };
      p.active = false; changed.add(t); (out[t] = out[t] || []).push(p);
      if (t === user) { const ih = S.injHist = S.injHist || {}; ih[S.year] = (ih[S.year] || 0) + 1; (S.tnStat = S.tnStat || { inj: [], skill: [] }).inj.push({ name: p.ko, dx: p.inj.dx, days, pos: p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos }); news(this, `부상: ${p.ko} — ${p.inj.dx}${sev}, 약 ${days}일 (복귀 예정 ${this.injDateStr(p)})`); if (days >= 30) this._bondShift(p, -1, '장기 부상'); }
    }
    {   // 부상으로 1군이 최소 인원(타자 10·투수 8) 아래가 되면 건강한 2군 선수를 자동 등록(경기 진행 불가 방지)
      const a = this.players(user).filter(p => p.active), nb = a.filter(p => p.type === 'B').length, np = a.filter(p => p.type === 'P').length;
      if (nb < 10 || np < 8) { this.ensureActive(user); this.repairSettings(user); this.invalidate(); news(this, '부상자 때문에 1군 엔트리가 최소 인원(타자 10·투수 8) 아래로 내려가 건강한 2군 선수를 자동 등록했습니다.'); }   // 내가 직접 정한 엔트리는 존중하고 경기 진행에 필요한 최소 인원일 때만 개입
    }
    for (const t of changed) {
      if (t === user) { if (this.injAuto() !== 'off') this._injAutoFix(out[t] || [], back[t] || []); this.repairSettings(t); this.invalidate(); continue; }
      // AI: 전체 재편성 대신 최소 교체 — 부상자는 같은 유형의 가장 가치 높은 건강한 2군 선수로, 복귀자는 같은 유형 1군 최저 가치 선수와 맞바꿈(더 나을 때만)
      const val = q => q.type === 'B' ? this._runsB(q, true) : this._runsP(q);
      for (const q of out[t] || []) { const c = this.players(t).filter(x => !x.active && x.type === q.type && !this.isInj(x)).sort((a, b) => (q.type === 'B' && q.pos === 'C' ? (b.pos === 'C') - (a.pos === 'C') : 0) || val(b) - val(a))[0]; if (c) c.active = true; }
      for (const q of back[t] || []) { const act = this.players(t).filter(x => x.active && x.type === q.type), w = act.sort((a, b) => val(a) - val(b))[0]; if (w && val(q) > val(w) + 0.5 && !(q.type === 'B' && w.pos === 'C' && q.pos !== 'C' && act.filter(x => x.pos === 'C').length <= 2)) { w.active = false; q.active = true; } }
      this._engDirty = true; this._f2dirty = true; this.assignUsage(t); this.assignUsage(t, true); this.invalidate();
    }
  };

  /* ---------------- 코치진·육성 ----------------
   * [코치] 팀마다 감독 1명 + 코치 약 17~22명(1군 코치 + 퓨처스 감독·코치, 사용자 제공 명단 + 2027 보도 변동). 보직은 선수 시절 포지션으로 추정(투수·타격·수비·주루·총괄). **능력치는 모두 가상 값**(자료 없음).
   *  능력치 20~80(S≥75 · A≥65 · B≥55 · C≥45 · D≥35): 투수 구위·제구·체력 / 타격 컨택·파워·선구 / 수비·주루 / 총괄(육성 관리). 코치당 전문 분야 2개가 높다.
   * [한도] 팀별 육성 코치 정원 = 리그 평균(반올림). 정원을 넘는 팀(롯데 7명)도 불이익 없이 유지하고, 신규 영입만 정원 이내. 영입 비용(연봉)은 팀 예산(FA 여유자금) 안에서만 가능.
   * [효과] 28세 이하 선수의 성장: 육성 방향(가중치)에 따라 능력 구성이 달라지고, 팀 코치 능력(해당 분야 최고 65% + 차순위 35%)이 성장 속도를 −20~+30% 조절. 투수는 체력(선발)·구위(마무리)·제구(추격조) 방향, 타자는 컨택·파워·선구·수비·주력. */
  const CH_FIELDS = ['stuff', 'control', 'stamina', 'contact', 'power', 'eye', 'defense', 'speed'];
  const CH_NAME = { stuff: '구위', control: '제구', stamina: '체력', contact: '컨택', power: '파워', eye: '선구', defense: '수비', speed: '주루', mgmt: '육성관리' };
  const CH_SPEC = { '투수': ['stuff', 'control', 'stamina'], '타격': ['contact', 'power', 'eye'], '수비·주루': ['defense', 'speed'], '총괄': ['mgmt'] };
  const CH_SLOT = { '투수': 2, '타격': 2, '수비·주루': 1, '총괄': 1 };
  const ROLE_MAP = { '투수코치': '투수', '타격코치': '타격', '수비코치': '수비·주루', '배터리코치': '수비·주루', '퓨처스 감독': '총괄', '보직 미상': null };
  const CH_TARGET = { '투수': 4, '타격': 4, '수비·주루': 3, '총괄': 1 };
  const SURN2 = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'], GIV2 = ['동수', '성호', '재훈', '병철', '상민', '기태', '영진', '용수', '종범', '정민', '태균', '현준', '승엽', '재원', '창용', '민호', '광수', '진태', '세훈', '대현'];
  const DEV_PITCH = { SP: { k: 0.9, bb: 1.35, hr: 1.0, babip: 0.9 }, SU: { k: 1.15, bb: 1.1, hr: 1.0, babip: 0.9 }, MID: { k: 0.9, bb: 1.3, hr: 1.0, babip: 1.0 }, CL: { k: 1.4, bb: 0.8, hr: 1.25, babip: 0.9 } };
  const DEV_BAT = { balanced: {}, contact: { k: 1.4, babip: 1.2, bb: 0.9, hr: 0.8, xbh: 0.8 }, power: { hr: 1.5, xbh: 1.3, k: 0.8, babip: 0.9, bb: 0.9 }, eye: { bb: 1.5, k: 1.1, hr: 0.8, babip: 0.8, xbh: 0.8 }, defense: { k: 0.9, bb: 0.9, hr: 0.9, babip: 0.9, xbh: 0.9 }, speed: { k: 0.95, bb: 0.95, hr: 0.9, babip: 1.1, xbh: 0.95 } };
  const PLAN_NAME = { SP: '선발', SU: '승리조', MID: '추격·롱릴리프', CL: '마무리', balanced: '균형', contact: '컨택', power: '파워', eye: '선구', defense: '수비', speed: '주력' };
  proto.devPlans = function (p) { return p.type === 'P' ? ['SP', 'SU', 'MID', 'CL'] : ['balanced', 'contact', 'power', 'eye', 'defense', 'speed']; };
  proto.planName = function (pl) { return PLAN_NAME[pl] || pl; };
  proto.coachGrade = function (v) { return v >= 75 ? 'S' : v >= 65 ? 'A' : v >= 55 ? 'B' : v >= 45 ? 'C' : v >= 35 ? 'D' : 'E'; };
  proto.coachFieldName = function (f) { return CH_NAME[f] || f; };
  proto.coachSpec = function (c) { return CH_SPEC[c.role]; };
  proto._mkCoach = function (r, role, opts) {
    opts = opts || {}; const S = this.S, C = S.coach, id = 'C' + (C.nextId++), spec = CH_SPEC[role], c = { id, role, team: opts.team || null, age: opts.age || 38 + Math.floor(r.random() * 25), origin: opts.origin || 'virtual', src: opts.src || '', lv: opts.lv || '' };
    let name = opts.name; if (!name) name = SURN2[Math.floor(r.random() * SURN2.length)] + GIV2[Math.floor(r.random() * GIV2.length)];
    c.name = name;
    for (const f of CH_FIELDS) c[f] = clamp(Math.round(gauss(r, 44, 6)), 25, 62);
    c.mgmt = clamp(Math.round(gauss(r, 44, 6)), 25, 62);
    const q = opts.star ? 12 : 0, main = role === '총괄' ? ['mgmt'] : spec.slice().sort(() => r.random() - 0.5).slice(0, 2);
    for (const f of main) c[f] = clamp(Math.round(gauss(r, 61 + q, 7)), 42, 82);
    c.spec = main; c.salary = this.coachSalary(c); return c;
  };
  proto.coachSalary = function (c) { const m = c.spec && c.spec.length ? c.spec.reduce((a, f) => a + c[f], 0) / c.spec.length : 50; return Math.round(clamp(0.6 + (m - 50) * 0.05, 0.5, 3.2) * 10) / 10; };
  proto._initCoaches = function (list) {
    const S = this.S, r = rngFor(S.seed, 2027, 91); S.coach = { nextId: 1, list: {}, teams: {}, mgr: {}, market: [], delta: {}, year: S.year };
    for (const t of TEAMS) { S.coach.teams[t] = []; S.coach.delta[t] = 0; }
    const real = (list || []).filter(x => x.role !== '감독' && x.role !== '1군');
    for (const m of (list || []).filter(x => x.role === '감독')) S.coach.mgr[m.team] = { name: m.name === '(미확인)' ? SURN2[Math.floor(r.random() * SURN2.length)] + GIV2[Math.floor(r.random() * GIV2.length)] : m.name, src: m.src, virtual: m.name === '(미확인)' };
    for (const t of TEAMS) {
      const cnt = { '투수': 0, '타격': 0, '수비·주루': 0, '총괄': 0 }, mine = real.filter(y => y.team === t), unk = [];
      for (const x of mine) { const role = ROLE_MAP[x.role]; if (role === null || role === undefined) unk.push(x); else { const c = this._mkCoach(r, role, { team: t, name: x.name, origin: 'real', src: x.src, lv: x.level, age: x.birth ? 2027 - parseInt(x.birth) : undefined }); S.coach.list[c.id] = c; S.coach.teams[t].push(c.id); cnt[role]++; } }
      // 보직을 알 수 없는 코치(해외·옛 선수 등)는 부족한 보직부터 배정(추정), 다 차면 투수·타격·수비를 번갈아
      let rr = 0; for (const x of unk) {
        const need = ['투수', '타격', '수비·주루'].filter(k => cnt[k] < CH_TARGET[k]).sort((p, q) => (CH_TARGET[q] - cnt[q]) - (CH_TARGET[p] - cnt[p]))[0], role = need || ['타격', '투수', '수비·주루'][rr++ % 3];
        const c = this._mkCoach(r, role, { team: t, name: x.name, origin: 'real', src: (x.src || '') + ' · 보직 미상 → ' + role + ' 추정', lv: x.level, age: x.birth ? 2027 - parseInt(x.birth) : undefined }); S.coach.list[c.id] = c; S.coach.teams[t].push(c.id); cnt[role]++;
      }
      for (const role of Object.keys(CH_TARGET)) while (cnt[role] < CH_TARGET[role]) { const c = this._mkCoach(r, role, { team: t }); S.coach.list[c.id] = c; S.coach.teams[t].push(c.id); cnt[role]++; }
      if (!S.coach.mgr[t]) S.coach.mgr[t] = { name: SURN2[Math.floor(r.random() * SURN2.length)] + GIV2[Math.floor(r.random() * GIV2.length)], src: '', virtual: true };
    }
    this.refreshCoachMarket(true);
  };
  proto._ensureCoach = function () { if (!this.S.coach) this._initCoaches([]); };
  proto.coachLimit = function () { const C = this.S.coach; if (!C.limit) C.limit = Math.round(TEAMS.reduce((a, t) => a + C.teams[t].length, 0) / TEAMS.length); return C.limit; };   // 리그 평균(초기 편성 기준)
  proto.coachesOf = function (t) { const C = this.S.coach; return C.teams[t].map(id => C.list[id]); };
  proto.coachMarket = function () { const C = this.S.coach; return C.market.map(id => C.list[id]); };
  proto.coachRating = function (t, f) {
    if (!this.S.coach) return 45; const v = this.coachesOf(t).map(c => c[f]).sort((a, b) => b - a); if (!v.length) return 40;
    return 0.65 * v[0] + 0.35 * (v.length > 1 ? v[1] : 40);
  };
  proto.coachPayDelta = function (t) { return this.S.coach ? Math.round((this.S.coach.delta[t] || 0) * 10) / 10 : 0; };
  proto.refreshCoachMarket = function (first) {   // 시장 코치(가상 인물): 오프시즌마다 일부 교체
    const S = this.S, C = S.coach, r = rngFor(S.seed, S.year, 92 + (first ? 1 : 0));
    if (!first) { C.market = C.market.filter(() => r.random() < 0.6); for (const id of Object.keys(C.list)) if (!C.market.includes(id) && !C.list[id].team) delete C.list[id]; }
    const roles = ['투수', '투수', '투수', '타격', '타격', '타격', '수비·주루', '수비·주루', '총괄'];
    while (C.market.length < 12) { const role = roles[Math.floor(r.random() * roles.length)], c = this._mkCoach(r, role, { origin: 'market', star: r.random() < 0.18 }); C.list[c.id] = c; C.market.push(c.id); }
  };
  proto.hireCoach = function (id) {
    const S = this.S, C = S.coach, t = S.userTeam, c = C.list[id]; if (!c || !C.market.includes(id)) return '시장에 없는 코치입니다.';
    if (C.teams[t].length >= this.coachLimit()) return `육성 코치 정원(${this.coachLimit()}명)이 찼습니다. 기존 코치를 해임한 뒤 영입하세요.`;
    const room = this.faRoom(t); if (room < c.salary) return `예산 부족: 연봉 ${c.salary}억이 FA 여유자금 ${room.toFixed(1)}억을 넘습니다. 팀 예산 안에서만 영입할 수 있습니다.`;
    C.market = C.market.filter(x => x !== id); c.team = t; c.origin = c.origin === 'market' ? 'market' : c.origin; C.teams[t].push(id); C.delta[t] = (C.delta[t] || 0) + c.salary;
    news(this, `코치 영입: ${c.name}(${c.role}) 연봉 ${c.salary}억`); return null;
  };
  proto.fireCoach = function (id) {
    const S = this.S, C = S.coach, t = S.userTeam, c = C.list[id]; if (!c || c.team !== t) return '우리 팀 코치가 아닙니다.';
    C.teams[t] = C.teams[t].filter(x => x !== id); C.delta[t] = (C.delta[t] || 0) - c.salary; c.team = null; c.origin = 'market'; C.market.push(id);
    news(this, `코치 해임: ${c.name}(${c.role})`); return null;
  };
  proto._aiCoachHire = function () {   // AI 구단: 정원이 비고 예산이 있으면 가장 약한 분야를 메우는 시장 코치를 영입
    const S = this.S, C = S.coach; if (!C) return;
    for (const t of TEAMS) {
      if (t === S.userTeam || C.teams[t].length >= this.coachLimit() || !C.market.length) continue;
      const cand = this.coachMarket().filter(c => this.faRoom(t) >= c.salary).sort((a, b) => Math.max(...a.spec.map(f => a[f] - this.coachRating(t, f))) - Math.max(...b.spec.map(f => b[f] - this.coachRating(t, f)))).reverse()[0];
      if (cand) { C.market = C.market.filter(x => x !== cand.id); cand.team = t; C.teams[t].push(cand.id); C.delta[t] = (C.delta[t] || 0) + cand.salary; }
    }
  };
  /* ---- 육성 방향 ---- */
  proto._autoPlan = function (p) {
    if (p.type === 'B') return 'balanced';
    if (p.role === 'SP') return 'SP';
    const o = this.ovr(p); return p.age <= 23 && o < 45 ? 'MID' : o >= 58 ? 'CL' : 'SU';
  };
  proto.devPlan = function (p) { return p.dev && p.dev.plan && !p.dev.auto ? p.dev.plan : (p.dev && p.dev.plan) || this._autoPlan(p); };
  proto.setDevPlan = function (id, plan) {
    const p = this.S.players[id]; if (!p || p.team !== this.S.userTeam) return '우리 팀 선수가 아닙니다.'; if (!this.devPlans(p).includes(plan)) return '해당 육성 방향을 선택할 수 없습니다.';
    p.dev = { plan, auto: false };
    if (p.type === 'P') { if (plan === 'SP') p.role = 'SP'; else if (p.role === 'SP') p.role = 'RP'; }   // 육성 방향을 정하면 보직(표기)도 바로 바꾼다 — 선발 육성은 2군 로테이션 우선 편성(체력이 낮으면 이닝은 짧음)
    this._f2dirty = true; this.invalidate(); return null;
  };
  proto._devEffects = function (p) {
    const t = p.team in this.S.coach.teams ? p.team : null; if (!t) return null;
    let plan = p.dev && !p.dev.auto ? p.dev.plan : this._autoPlan(p); if (!(p.dev && !p.dev.auto)) p.dev = { plan, auto: true };
    const cr = f => this.coachRating(t, f), mg = (cr('mgmt') - 58) * 0.004;
    if (p.type === 'P') {
      const w0 = DEV_PITCH[plan] || DEV_PITCH.SU, mean = (w0.k + w0.bb + w0.hr + w0.babip) / 4, w = {}; for (const f in w0) w[f] = w0[f] / mean;
      const rel = plan === 'SP' ? (cr('control') + cr('stamina')) / 2 : plan === 'CL' ? cr('stuff') : plan === 'MID' ? cr('control') : (cr('stuff') + cr('control')) / 2;
      const stam = { SP: 2.2 * cr('stamina') / 50, SU: 0, MID: 0.8, CL: -1.5 }[plan];
      return { plan, w, mul: clamp(1 + 0.009 * (rel - 62) + mg, 0.75, 1.35), stamina: stam, speed: 0, range: 0 };
    }
    const w0 = DEV_BAT[plan] || {}, w = {}; for (const f of ['k', 'bb', 'hr', 'babip', 'xbh']) w[f] = w0[f] || 1;
    const rel = plan === 'contact' ? cr('contact') : plan === 'power' ? cr('power') : plan === 'eye' ? cr('eye') : plan === 'defense' ? cr('defense') : plan === 'speed' ? cr('speed') : (cr('contact') + cr('power') + cr('eye')) / 3;
    return { plan, w, mul: clamp(1 + 0.009 * (rel - 62) + mg, 0.75, 1.35), stamina: 0, speed: plan === 'speed' ? 0.06 * cr('speed') / 50 : 0, range: plan === 'defense' ? 1.2 * cr('defense') / 50 : 0 };
  };
  proto._devRole = function (p, plan) { if (p.roleMan) return; const manual = p.dev && !p.dev.auto; if (plan === 'SP') { if (manual || (p.stamina >= 50 && p.role !== 'SP')) p.role = 'SP'; } else if (p.role === 'SP' && plan !== 'SP' && manual) p.role = 'RP'; };
  /* 육성 방향별 성장 경로 예측: 같은 선수를 방향마다 3시즌 진행해 평균(12회) */
  proto.devForecast = function (p, years) {
    years = years || 3; const out = {}, base = JSON.parse(JSON.stringify({ p: p.p, stamina: p.stamina, age: p.age, peak: p.peak, pot: p.pot, scout: p.scout, role: p.role, fr: p.fr, gs: p.gs, pos: p.pos, type: p.type, bats: p.bats, throws: p.throws, cs: p.cs, GS: p.GS, G: p.G, IP: p.IP, PA: p.PA, ipgs: p.ipgs, team: p.team, id: p.id, ko: p.ko }));
    for (const plan of this.devPlans(p)) {
      const acc = Array.from({ length: years + 1 }, () => ({ ovr: 0, st: 0, sub: {} })), N = 12;
      for (let k = 0; k < N; k++) {
        const q = JSON.parse(JSON.stringify(base)); q.dev = { plan, auto: false }; const r = rngFor(this.S.seed, 5555, k);
        for (let y = 0; y <= years; y++) { if (y > 0) this.progress(q, r, 1); const o = this.ovr(q); acc[y].ovr += o / N; if (q.type === 'P') acc[y].st += q.stamina / N; const sb = this.sub(q); for (const f in sb) acc[y].sub[f] = (acc[y].sub[f] || 0) + sb[f] / N; }
      }
      out[plan] = acc.map(a => {
        const sb = Object.fromEntries(Object.entries(a.sub).map(([f, v]) => [f, Math.round(v)])), o = a.ovr;   // 보직 적합도: 해당 보직에서 가치 있는 능력(선발=체력, 마무리=구위·피홈런, 승리조=구위·제구, 추격=제구)을 반영한 지표
        let fit = o; if (p.type === 'P') fit = plan === 'SP' ? o + (a.st >= 50 ? 0.06 * (a.st - 50) : -6) : plan === 'CL' ? o + 0.12 * ((sb['구위'] || 50) - 50) + 0.06 * ((sb['피홈런'] || 50) - 50) : plan === 'SU' ? o + 0.06 * ((sb['구위'] || 50) + (sb['제구'] || 50) - 100) : o + 0.08 * ((sb['제구'] || 50) - 50);
        return { ovr: Math.round(o * 10) / 10, st: Math.round(a.st), sub: sb, fit: Math.round(fit * 10) / 10 };
      });
    }
    return out;
  };
});
