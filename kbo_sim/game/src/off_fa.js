(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] FA 제도·보상·시장·협상 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, TEAMS, clamp, rngFor, slotPrior, undebLR, gauss, FOREIGN_NEW, FOREIGN_RAISE, ACTIVE_MAX, ROSTER_MIN, news, KO0, FA_REG_DAYS, EXT_LIMIT, ROSTER_MAX, LIM_DEADLINE, FA_END, BONUS_SHARE } = LG.OFFC;
  /* ---------- FA ---------- */

  /* ---------------- KBO FA 제도 ----------------
   * 자격: 고졸 8시즌/대졸 7시즌(1군 등록 145일 이상이 1시즌, 모자란 해는 합산), 행사 후 4시즌 추가.
   * 등급(최근 3년 연봉 순위): A(팀 3위 이내 & 리그 30위 이내) / B(팀 10위 이내 & 리그 60위 이내) / C(그 외, 만 35세 이상).
   *   재자격: 직전 A·B였던 두 번째 FA는 B, 세 번째 이상이거나 직전 C는 C. 보상: A 보호 20명 + 전년 연봉 200% 또는 300%, B 25명 + 100% 또는 200%, C 150%(선수 없음).
   * 외부 FA 영입은 구단당 스토브리그 3명. 외국인: 일반 3명(같은 포지션 3명 불가) + 아시아쿼터 1명, 신규 상한 100만$(14억)·AQ 20만$(2.8억). */
  const FSUR = ['카르', '로페', '미첼', '스미', '브라', '윌슨', '존슨', '해리', '터너', '로저', '필립', '데이', '콜린', '다니', '레이', '헤이', '모리', '샌더', '프레', '그랜'], FGIV = ['스', '슨', '즈', '트', '드', '로', '닐', '크'];
  /* 새 계약: 비FA는 모두 1년(연봉 계약). FA 다년계약은 계약금(현금, 계약 시 지급)을 포함하며 경쟁균형세 보수는 (계약금 + 연봉 × 연수) ÷ 연수 */
  proto._newContract = function (p, salary, years, bonus) { const c = { salary, years }; if (bonus > 0) { c.bonus = bonus; c.yrs0 = years; c.amort = Math.round(bonus / years * 100) / 100; c.total = Math.round((bonus + salary * years) * 10) / 10; if (!p.foreign) c.cbt = Math.round((bonus + salary * years) / years * 100) / 100; } return c; };
  /* AI 구단의 상한 점검용: 이 계약을 맺으면 늘어나는 경쟁균형세 보수 */
  proto._cbtAdd = function (p, ask, years, bonus) { const c = this._newContract(p, ask, years || 1, bonus || 0); return (c.cbt !== undefined ? c.cbt : ask) * (this.S.calib.cbtK || 1); };
  proto.faReq = function (p) { return p.fa.used > 0 ? 4 : (p.fa.univ ? 7 : 8); };
  proto.faEligible = function (p) { return !!(p.fa && !p.foreign && p.fa.svc >= this.faReq(p)); };
  proto.faSeasonsLeft = function (p) { return p.fa ? Math.max(0, Math.ceil(this.faReq(p) - p.fa.svc)) : null; };
  proto._salAvg = function (p) { const h = p.salHist && p.salHist.length ? p.salHist : [p.contract.salary]; return h.reduce((a, b) => a + b, 0) / h.length; };
  /* 등급 산정(팀 내·리그 연봉 순위는 최근 3년 평균 연봉) */
  proto.faGrade = function (p, team) {
    if (!this.faEligible(p)) return null;
    if (p.fa.used >= 2 || p.fa.last === 'C') return 'C';
    if (p.fa.used === 1) return (p.fa.last === 'A' || p.fa.last === 'B') ? 'B' : 'C';
    if (p.age >= 38) return 'C';   // 고령 C등급: 규정은 만 35세 이상이나 FA 이력 CSV에서 1990년생(만 35)이 B, 1988년생 이전이 C로 확인되어 p.age 38 이상(1989년생 이전)으로 보정
    const ranks = this._salRanks(); let tr = ranks.team[p.id], lr = ranks.league[p.id];
    if (tr === undefined) { const v = this._salAvg(p), tm = team in this.S.teams ? team : p.team in this.S.teams ? p.team : p.faInfo && p.faInfo.from in this.S.teams ? p.faInfo.from : null; tr = tm ? 1 + this.players(tm).filter(x => x.id !== p.id && ranks.team[x.id] !== undefined && this._salAvg(x) > v).length : 99; lr = 1 + Object.keys(ranks.league).filter(id => id !== p.id && this._salAvg(this.S.players[id]) > v).length; }   // 계약 만료 시점에 모집단에서 빠져 있던 선수(예: 다년계약 마지막 해)는 같은 기준으로 순위를 따로 계산
    if (tr <= 3 && lr <= 30) return 'A';
    if (tr <= 10 && lr <= 60) return 'B';
    return 'C';
  };
  proto._salRanks = function () {
    const S = this.S, key = S.year + ':' + S.day + ':' + S.phase + ':' + (S.off ? S.off.step : '');
    if (this._rk && this._rk.key === key && this._rk.n === Object.keys(S.players).length) return this._rk;
    /* 규약 제172조: 등급 산정 순위는 '기존 FA계약선수와 비FA 다년계약(마지막 해 제외) 선수'를 뺀 선수들 사이에서 매긴다. 이 게임에서 FA로 계약한 선수(contract.fa)는 계약이 끝날 때까지 모집단에서 뺀다.
       빼지 않으면 해마다 FA 고액 계약자가 쌓여 리그 상위 30·60위를 채우고, 2년차부터 새 FA 자격자가 대부분 C등급이 된다.
       ⚠ 시작 시점의 실제 FA 계약(2026 이전)은 구분하지 않고 그대로 둔다 — 실제 공시(김호령 연봉 61위 → C, B 기준 60위 이내 미달)와 이 모집단 기준 순위가 일치함을 확인했기 때문. 외국인도 모집단에 남겨 둔다. */
    const team = {}, all = [], inPool = p => !(p.contract && (p.contract.fa || p.contract.years > 1));
    for (const t of TEAMS) { const l = this.players(t).filter(inPool).sort((a, b) => this._salAvg(b) - this._salAvg(a)); l.forEach((p, i) => { team[p.id] = i + 1; all.push(p); }); }
    all.sort((a, b) => this._salAvg(b) - this._salAvg(a)); const league = {}; all.forEach((p, i) => { league[p.id] = i + 1; });
    this._rk = { key, n: Object.keys(S.players).length, team, league }; return this._rk;
  };
  /* 새 게임: 자격 연수·연봉 이력·외국인 슬롯 초기화(데이터가 없는 부분은 나이로 추정) */
  proto._initFARules = function () {
    const S = this.S;
    for (const p of Object.values(S.players)) {
      if (p.fa) continue;
      const age26 = p.age - 1, played = (p.PA || 0) + (p.IP || 0) * 1.5;
      let svc = p.src === 'F' ? Math.max(0, p.age - 21) * 0.3 : Math.max(0, age26 - 19) * clamp(played / 350, 0.25, 1);   // 1군 출전량으로 등록일수 보정(벤치·2군 선수는 연수 적게 인정)
      const dh = p.dh;
      if (dh) {   // 드래프트 이력이 있으면 1군 출전 시즌 수 × 시즌당 출전량(타자 250타석·투수 55이닝이면 풀타임)으로 계산
        const per = dh.ss ? (p.type === 'B' ? dh.pa : dh.ip) / dh.ss : 0;
        svc = dh.deb ? dh.ss * clamp(per / (p.type === 'B' ? 250 : 55), 0.3, 1) : 0;
      }
      if (p.rookie === S.year || p.draft) svc = 0;
      if (p.team === 'MIL') svc = Math.max(0, svc - 1.5);
      p.fa = { svc: Math.round(svc * 10) / 10, used: 0, last: null, regDays: 0, rem: 0, univ: p.dh ? p.dh.univ : !!(p.draft && /대/.test(p.draft.school.replace('메이저리그', ''))), est: !dh };
      p.tnTeam = p.team; p.tn = p.dh && p.dh.one ? p.dh.ss || 0 : (p.ct && p.ct.from && p.ct.from <= 2026 ? Math.max(0, 2026 - p.ct.from + 1) : 0);   // 소속 구단 연속 시즌: 한 구단만 거친 선수는 프로 시즌 수, FA·이적 선수는 계약 시작 이후
      if (p.ct && p.ct.from && p.ct.from <= 2026) { p.fa.used = p.age >= 37 ? 2 : 1; p.fa.svc = Math.max(0, 2026 - p.ct.from + 1); p.fa.last = p.ct.total >= 60 ? 'A' : p.ct.total >= 30 ? 'B' : 'C'; }
      else if (p.ct && p.ct.from === 2027 && !p.ct.nonfa) { p.fa.used = 1; p.fa.svc = 0; p.fa.last = p.ct.total >= 60 ? 'A' : 'B'; }
      if (p.fah) {   // FA 이력 CSV: 행사(승인)한 선수는 횟수·등급, 미신청 자격자는 자격 유지
        const ex = p.fah.filter(h => h.st === '승인'), known = Math.max(0, ...p.fah.map(h => h.used || 0));
        if (ex.length) { const last = ex.filter(h => h.g).pop(); p.fa.used = Math.max(p.fa.used, known, 1); if (last) p.fa.last = last.g; if (!(p.ct && p.ct.from)) p.fa.svc = Math.max(0, 2026 - ex[ex.length - 1].y + 1); }
        else { p.fa.used = Math.max(p.fa.used, known); p.fa.svc = Math.max(p.fa.svc, this.faReq(p)); const pv = p.fah.map(h => h.prev).filter(Boolean).pop(); if (pv && !p.fa.last && p.fa.used > 0) p.fa.last = pv; }
        p.fa.est = false;
      }
      p.salHist = [p.contract.salary, p.contract.salary, p.contract.salary];   // 최근 3년 연봉(자료는 2026년뿐이라 같은 값으로 가정)
      if (p.age <= 25 && p.peak === undefined && !p.draft && !p.foreign && p.team !== 'MIL') {   // 젊은 선수(2군 포함): 지명 슬롯 실제 분포 × 현재 OVR(나이 대비) 증거로 갱신한 정점
        const rr = this._pkRng || (this._pkRng = rngFor(S.seed, 2027, 77)), ov = this.ovr(p), smp = p.type === 'P' ? (p.IP || 0) / 80 : (p.PA || 0) / 350, pri = slotPrior(dh), ss = dh ? dh.ss || 0 : 0;
        if (p.eval && p.eval.floor) { const fl = { A: 0, B: 1, C: 2, D: 3, E: 4 }[p.eval.floor]; for (let i = fl + 1; i < pri.length; i++) pri[i] = 0; }   // 제공된 평가(보도·스카우트)가 있으면 그 하한 아래 등급은 배제
        const ulr = p.eval ? null : undebLR(p, dh); if (ulr) for (let i = 0; i < pri.length; i++) pri[i] *= ulr[i];   // 그 나이까지 1군 미데뷔면 실제 미데뷔 선수들의 최종 등급 분포로 보정(보도·스카우트 평가가 있으면 그쪽 우선)
        const pk = clamp(this._posteriorPeak(rr, ov, p.age, pri, smp), 25, 85);
        if (p.eval) { if (p.eval.role === 'SP') p.role = 'SP'; if (p.eval.plan) p.dev = { plan: p.eval.plan, auto: false }; }
        p.peak = pk; p.scout = { o: ov, ceil: clamp(pk + gauss(rr, 0, 3 + 9 * Math.exp(-ss / 2)), 25, 85) }; p.pot = clamp((pk - ov) / 30, 0, 1.4);   // 프로 경험이 길수록 스카우트 평가 오차가 줄어든다
      }
      if (p.foreign) p.contract.years = 1;
    }
    this._initForeign();
  };
  /* 외국인 슬롯: 팀당 일반 3명(같은 포지션 3명 불가) + 아시아쿼터 1명. 넘치는 선수는 시장(자유계약)으로 */
  proto.foreignOf = function (t) { return this.players(t).filter(p => p.foreign); };
  proto.foreignOK = function (t, p) {
    const f = this.foreignOf(t).filter(x => x.id !== this._replacing && !x.sub); if (p.aq) return f.filter(x => x.aq).length < 1;   // _replacing: 교체 영입 시 내보낼 선수는 제외하고 계산
    const g = f.filter(x => !x.aq); if (g.length >= 3) return false; return !(g.length === 2 && g.every(x => x.type === p.type));
  };
  /* 2027 시작 상태: 뉴스로 계약이 확정된 외국인만 반영하고(foreign_2027.csv), 나머지 선수는 시장으로 보낸 뒤
   * 구단별 빈 슬롯을 채운다(원소속 선수 우선 → 시장 최고 → 가상 영입). 채운 선수는 `assumed`(2027 계약 미확정 가정)로 표시 */
  proto._initForeign = function () {
    const S = this.S, r = rngFor(S.seed, 2027, 88), KRW = 1400 / 1e8, keep = new Set();   // 환율 1$=1,400원(외국인 상한 14억=100만$과 통일, 이전 1,335원)
    for (const c of (this._f27 || [])) {
      let p = Object.values(S.players).find(x => x.foreign && x.ko === c.name && (x.team === c.team));
      if (!p && c.status === '신규') {
        p = this.makeForeign(r, c.type, c.aq, { name: c.name, fixed: true }); p.virtual = true; p.team = c.team; S.teams[c.team].ids.push(p.id);
      }
      if (!p) continue;
      p.f27 = { status: c.status, total: c.total, date: c.date, term: c.term }; p.aq = !!c.aq; keep.add(p.id);
      if (c.total) { const yrs = /2년/.test(c.term) ? 2 : 1, sal = Math.round(c.total / yrs * KRW * 10) / 10; p.contract = { salary: sal, years: 1 };   // 외국인은 계약 기간이 '최대 2년'이어도 1년 단위(다음 해는 구단 옵션·재계약)
         p.salHist = [sal, sal, sal]; p.sal = sal; }
      else p.contract.years = 1;
    }
    for (const t of TEAMS) for (const p of this.foreignOf(t)) if (!keep.has(p.id)) { S.teams[t].ids = S.teams[t].ids.filter(x => x !== p.id); p.team = 'FA'; p.active = false; p.faInfo = { from: t, grade: null, prev: p.contract.salary }; (S.fa = S.fa || []).push(p.id); }
    for (const t of TEAMS) this._fillForeign(t, r, true);
    this._aqPool(r);
    for (const t of TEAMS) for (const p of this.foreignOf(t)) p.reg1 = true;   // 외국인은 시작 1군 엔트리 후보(실제 1군 등록 명단 취급)
  };
  /* 아시아쿼터 시장: 작년(2026) 아시아쿼터 선수 중 2027 계약이 확정되지 않은 선수는 시장에 나오고(위 비확정 처리),
   * 여기에 가상 명단(일본·대만·호주 등 가상 인물)을 더해 구단별 선택지를 만든다. 미계약 슬롯은 FA 마감 때 AI가 원소속 우선으로 보충 */
  const AQ_NAMES = ['이와타', '코마츠', '나카야마', '하시모토', '마에다', '스즈키', '오가와', '후지이', '천유', '린즈하오', '장젠', '맥도널', '켈리', '산토스'];
  proto._aqPool = function (r) {
    const S = this.S, used = new Set(Object.values(S.players).map(p => p.ko)); let n = 0;
    for (const nm of AQ_NAMES) { if (n >= 9) break; if (used.has(nm)) continue;
      const p = this.makeForeign(r, r.random() < 0.7 ? 'P' : 'B', true, { name: nm }); p.team = 'FA'; p.active = false; p.pool27 = true; (S.fa = S.fa || []).push(p.id); n++; }
  };
  proto.foreignSignable = function (p, t) { t = t || this.S.userTeam; return this.askSalary(p) * 0.93 <= this.foreignCap(p, t) + 1e-9; };   // 호감도로 낮출 수 있는 최대 폭(−7%)을 감안해도 상한을 넘는 선수는 영입 불가
  proto.foreignCap = function (p, t) {
    const k = p.aq ? 'aq' : 'gen', base = FOREIGN_NEW[k];
    let cap = p.faInfo && p.faInfo.from === t ? Math.max(base, (p.faInfo.prev || 0) + FOREIGN_RAISE[k]) : base;
    if (!p.aq && t === this.S.userTeam && this.foreignRoom) cap = Math.min(cap, this.foreignRoom(t, p.id));   // 일반 외국인 3명 합산 상한(400만$ ≈ 56억, 내 구단에만 적용)
    return cap;
  };
  /* 가상 외국인: 능력치 분포는 2026 실제 외국인(일반 투수 중앙값 OVR 51·타자 57·AQ 44, 표준편차 ≈8·8·5)에 맞춘다 */
  proto.makeForeign = function (r, type, aq, opts) {
    opts = opts || {};
    const p = this.makeRookie(r, type), tg = clamp(aq ? 44 + gauss(r, 0, 5) : (type === 'P' ? 51 : 57) + gauss(r, 0, 8), 30, 80);
    p.age = aq ? 22 + Math.floor(r.random() * 8) : 25 + Math.floor(r.random() * 10); p.peak = undefined; delete p.peak; delete p.scout; p.pot = 0; p.rookie = undefined; p.foreign = true; p.aq = !!aq; p.draft = undefined; p.virtual = true;
    for (let k = 0; k < 8; k++) { const g = (tg - this.ovr(p)) / 14; if (Math.abs(g) < 0.06) break; this._gain(p, g, r, 0); }
    const nm = opts.name || (FSUR[Math.floor(r.random() * FSUR.length)] + FGIV[Math.floor(r.random() * FGIV.length)]); p.name = p.ko = nm; p.stamina = Math.max(p.stamina || 0, 45);
    p.fa = { svc: 0, used: 0, last: null, regDays: 0, rem: 0 }; p.contract = { salary: aq ? 2.8 : 10, years: 1 }; p.salHist = [p.contract.salary];
    return p;
  };
  /* AI 구단의 외국인 슬롯 보충: 시장의 외국인 → 없으면 새로 영입 */
  proto._fillForeign = function (t, r, initial) {
    const S = this.S;
    for (const aq of initial ? [false] : [false, true]) for (let k = 0; k < 4; k++) {   // 최초 상태에서는 아시아쿼터 슬롯을 비워 시장 경쟁(FA 협상 기간)에 맡긴다
      const have = this.foreignOf(t).filter(x => !!x.aq === aq).length; if (have >= (aq ? 1 : 3)) break;
      const pool = this.faList().filter(x => x.foreign && !x.deep && !!x.aq === aq && this.foreignOK(t, x) && this.foreignSignable(x, t)).sort((a, b) => ((b.faInfo && b.faInfo.from === t) ? 1000 : 0) + this.war(b) - (((a.faInfo && a.faInfo.from === t) ? 1000 : 0) + this.war(a)));
      let cand = pool[0];
      if (!cand) { const tp = aq ? (r.random() < 0.7 ? 'P' : 'B') : (this.foreignOf(t).filter(x => !x.aq && x.type === 'P').length >= 2 ? 'B' : (this.foreignOf(t).filter(x => !x.aq && x.type === 'B').length >= 1 ? 'P' : (r.random() < 0.75 ? 'P' : 'B'))); cand = this.makeForeign(r, tp, aq); cand.team = 'FA'; (S.fa = S.fa || []).push(cand.id); }
      if (!this.foreignOK(t, cand)) break;
      if (this.foreignCap(cand, t) < (aq ? 1 : 2)) break;   // 합산 상한 여유가 거의 없으면 채우지 않음
      const cap = this.foreignCap(cand, t), ask = Math.min(cap, Math.max(this.askSalary(cand), aq ? 2 : 6));
      this._doSign(t, cand, 1, ask); if (initial || (S.year === 2027 && S.phase === 'preseason')) cand.assumed = true;
    }
  };
  /* 공통 영입 처리: 팀 이동·계약·FA 행사(재취득 연수 리셋)·보상 */
  proto._doSign = function (t, p, years, ask, bonus) {
    const S = this.S, info = p.faInfo, lbLoss = info && info.from && info.from !== t && p.team === 'FA' && this.legendBound ? this.legendBound(p, info.from) : null, fromT = info && info.from, graded = info && info.grade, comp = graded && info.from !== t ? graded : null;
    S.fa = (S.fa || []).filter(x => x !== p.id); p.team = t; p.active = false; S.teams[t].ids.push(p.id); if (t === S.userTeam) p.myFrom = { y: S.year, how: p.foreign ? (p.aq ? '아시아쿼터 영입' : '외국인 영입') : 'FA 영입' };
    ask = Math.round(ask * 10) / 10; bonus = Math.round((bonus || 0) * 10) / 10; p.contract = this._newContract(p, ask, p.foreign || !graded ? 1 : years, p.foreign || !graded ? 0 : bonus); if (graded && !p.foreign) p.contract.fa = true;   // FA 계약 표시(다음 FA 등급 산정 모집단에서 제외) p.salHist = (p.salHist || []).slice(-2).concat([Math.round(((p.contract.bonus || 0) / p.contract.years + ask) * 10) / 10]);
    if (t === S.userTeam && this._contractNote) this._contractNote(p, p.foreign ? '외국인' : graded ? 'FA' : '재계약');
    if (graded && p.fa) { p.fa.used += 1; p.fa.last = graded; p.fa.svc = 0; p.fa.rem = 0; }
    if (comp) { this._faCount(t, 1); this._compensate(t, p, info); }
    p.faInfo = undefined; this.invalidate();
    if (lbLoss && this._legendLoss) this._legendLoss(p, fromT, t, 'FA 이적', lbLoss);   // 영구결번 후보를 놓친 구단의 팬 충성도 하락
  };
  proto._foreignJoin = function (p) {   // 외국인은 영입 즉시 1군 엔트리에 등록한다(자리가 없으면 2군 대기)
    const S = this.S, t = S.userTeam; p.reg1 = true; p.lockUntil = 0; if (this.players(t).filter(x => x.active).length < ACTIVE_MAX && !this.isInj(p)) p.active = true; if (this.repairSettings) this.repairSettings(t); this.invalidate();   // 부상 중인 외국인은 영입해도 부상자 명단(2군) 대기
  };
  /* 규약 제173조: 구단이 계약할 수 있는 외부 FA 수 = FA 권리 행사자 10명 이하 1명 / 11~20명 2명 / 21~30명 3명 / 31명 이상 4명.
   행사자 수는 시장이 열릴 때(오프시즌 FA 풀, 2027년 시작 시점은 승인 22명) 한 번 정해 그해 내내 유지한다. 시즌 중 잔여 FA만 남은 때는 기존 상한(3명)을 쓴다. */
  proto._faApplicants = function () { const S = this.S; if (S.off) return (S.fa || []).filter(id => { const p = S.players[id]; return p && p.faInfo && p.faInfo.grade && !p.foreign; }).length; return S.year === 2027 && S.faClass2027 ? S.faClass2027.length : null; };
  proto.faExtLimit = function () { const S = this.S; this._faCount(S.userTeam); const n = S.faSign.n; return n === null || n === undefined ? EXT_LIMIT : n <= 10 ? 1 : n <= 20 ? 2 : n <= 30 ? 3 : 4; };
  proto._faCount = function (t, d) { const S = this.S, k = S.off ? 'o' + S.off.year : S.year; S.faSign = S.faSign && S.faSign.k === k ? S.faSign : { k, c: {}, n: this._faApplicants() }; if (d) S.faSign.c[t] = (S.faSign.c[t] || 0) + d; return S.faSign.c[t] || 0; };
  /* 보상: 보호선수(A 20명·B 25명)를 뺀 가장 가치 높은 선수 또는 보상금. 원소속 구단이 선수가 쓸 만하면 선수, 아니면 보상금(옵션2) */
  /* ---------------- FA 보상(KBO 규정 단순화) ----------------
     A등급: 보호선수 20명 외 1명 + 전년 연봉 200%, 또는 전년 연봉 300% / B등급: 보호선수 25명 외 1명 + 100%, 또는 200% / C등급: 전년 연봉 150%.
     - 보상 선택권은 **원소속 구단**: AI는 지명 후보의 가치가 (보상금 차액 = 전년 연봉 ×1)보다 크면 선수를, 아니면 보상금만 받는다. 내 팀이 원소속이면 결정 카드(후보·보상금 선택).
     - 보호선수는 영입 구단이 지정: AI는 가치 상위 N명 자동. 내 팀은 `S.protect`(최대 25명, A등급은 그중 가치 상위 20명)를 직접 편집(기본 자동). 올해 입단 신인·외국인은 보호 불필요.
     - **보상금은 실제로 정산**: 영입 구단 보수(위약금 항목)에 계상, 원소속 구단 올 시즌 수입에 계상. */
  proto.faCompCost = function (p, t) { const i = p.faInfo; if (!i || !i.grade || i.from === t) return 0; return (i.prev || 0) * ({ A: 2, B: 1, C: 1.5 }[i.grade] || 0); };   // 보상선수를 함께 내주는 경우의 보상금(전년 연봉 기준) — 예산 확인용 하한
  proto._compEligible = function (t, p) { const S = this.S; return this.players(t).filter(x => (!p || x.id !== p.id) && !x.foreign && x.rookie !== S.year && x.team === t); };
  proto.compProtected = function (t, g) {
    const n = { A: 20, B: 25 }[g] || 0, el = this._compEligible(t), val = x => this.marketValue(x), auto = el.slice().sort((a, b) => val(b) - val(a));
    if (t !== this.S.userTeam || !this.S.protect) return auto.slice(0, n).map(x => x.id);
    const ok = new Set(el.map(x => x.id)), mine = this.S.protect.filter(id => ok.has(id)).map(id => this.S.players[id]).sort((a, b) => val(b) - val(a)).slice(0, n), have = new Set(mine.map(x => x.id));
    for (const x of auto) { if (mine.length >= n) break; if (!have.has(x.id)) { mine.push(x); have.add(x.id); } }   // 지정이 모자라면 가치 순으로 자동 보충
    return mine.map(x => x.id);
  };
  /* 보상선수 가치(억 환산): 현재 시장가치 ×2 + 26세 이하 성장 여력(스카우트 정점 − 현재 OVR) × 0.04 — 보호선수 밖 선수는 대부분 저연봉 유망주라 현재 가치만 보면 항상 보상금이 유리해진다 */
  proto.compValue = function (q) { return this.marketValue(q) * 2 + (q.scout && q.age <= 26 ? Math.max(0, q.scout.ceil - this.ovr(q)) * 0.04 : 0); };
  proto.compCandidates = function (t, p, g) { const prot = new Set(this.compProtected(t, g)); return this._compEligible(t, p).filter(x => !prot.has(x.id) && !x.compHold).sort((a, b) => this.compValue(b) - this.compValue(a)); };   // 다른 보상 결정에 제시 중인 선수는 제외
  proto.setProtect = function (ids) { this.S.protect = Array.from(new Set(ids)).slice(0, 25); };   // 내 팀 보호선수(최대 25명, A등급은 그중 가치 상위 20명)
  /* 경쟁균형세(샐러리캡) 초과 영입 차단: 이 영입으로 상위 40명 합계가 상한을 넘게 되면(예산 여유와 무관하게) 막는다.
     1~2년 상한을 깨고 우승에 도전하는 시즌이면 경쟁균형세 카드의 '상한 초과 영입 허용'을 켜서 허용한다. per: 영입 선수의 산정 보수(연평균). 막히면 안내 문구, 아니면 null */
  proto.capBlock = function (t, per) {
    const S = this.S; if (S.cbt && S.cbt.allowOver) return null;
    const next = S.phase === 'offseason', y = S.year + (next ? 1 : 0), cap = this.cbtCap(y), exc = this.cbtExc(t), eid = exc ? exc.id : null, k = S.calib.cbtK || 1;
    const vals = this.players(t).filter(q => q.rookie !== y && !q.foreign).map(q => this.cbtVal(q) * (q.id === eid ? 0.5 : 1)), top = a => Math.round(a.slice().sort((x, z) => z - x).slice(0, 40).reduce((u, v) => u + v, 0) * k * 10) / 10;
    const before = top(vals), after = top(vals.concat([per]));
    if (after > cap + 1e-9 && after > before + 1e-9) return `경쟁균형세 상한(${cap.toFixed(1)}억)을 넘게 되어 영입할 수 없습니다(상위 40명 합계 ${before} → ${after}억). 1~2년 상한을 깨고 우승에 도전하는 시즌이라면 경쟁균형세 카드에서 '상한 초과 영입 허용'을 켜세요(초과분 기금 납부·연속 초과 시 지명권 하락).`;
    return null;
  };
  proto._capTrade = function (t, incoming, outgoing) {   // 트레이드 뒤 상위 40명 합계(정산과 같은 계산: 산정 보수·예외 선수 50%·신인·외국인 제외) — 사용자·AI 공용
    const S = this.S, next = S.phase === 'offseason', y = S.year + (next ? 1 : 0), cap = this.cbtCap(y), exc = this.cbtExc(t), eid = exc ? exc.id : null, k = S.calib.cbtK || 1, out = new Set(outgoing.map(p => p.id));
    const base = this.players(t).filter(q => q.rookie !== y && !q.foreign).map(q => ({ id: q.id, v: this.cbtVal(q) * (q.id === eid ? 0.5 : 1) })), top = a => Math.round(a.slice().sort((x, z) => z - x).slice(0, 40).reduce((u, v) => u + v, 0) * k * 10) / 10;
    const before = top(base.map(x => x.v)), after = top(base.filter(x => !out.has(x.id)).map(x => x.v).concat(incoming.filter(q => q.rookie !== y && !q.foreign).map(q => this.cbtVal(q))));
    return { before, after, cap, over: after > cap + 1e-9 && after > before + 1e-9 };
  };
  proto.capBlockTrade = function (t, incoming, outgoing) {   // 트레이드로 받는 선수(보수 합 증가)가 상위 40명 합계를 상한 위로 올리면 막는다(FA 영입과 같은 규칙·같은 허용 토글)
    const S = this.S; if (S.cbt && S.cbt.allowOver) return null; const { before, after, cap, over } = this._capTrade(t, incoming, outgoing);
    return over ? `경쟁균형세 상한(${cap.toFixed(1)}억)을 넘게 되어 트레이드할 수 없습니다(상위 40명 합계 ${before} → ${after}억). 1~2년 상한을 깨고 우승에 도전하는 시즌이라면 경쟁균형세 카드에서 '상한 초과 영입 허용'을 켜세요.` : null;
  };
  proto.setAllowOver = function (on) { const S = this.S; S.cbt = S.cbt || { over: {}, under: {}, drop: {}, fees: {}, log: [] }; S.cbt.allowOver = !!on; return null; };
  proto._compPay = function (signer, old, amt, label) {
    const S = this.S; amt = Math.round(amt * 10) / 10; if (!amt || !S.fin) return;
    const a = S.fin.teams[signer], b = S.fin.teams[old]; if (a) a.dead = (a.dead || []).concat([{ year: this._finYear(), amt, who: label }]); if (b) b.evRev = Math.round(((b.evRev || 0) + amt) * 10) / 10;
  };
  proto._compApply = function (signer, old, p, g, prev, pid, text0) {   // pid: 보상선수 id 또는 null(보상금만)
    const S = this.S, sc = { A: [2, 3], B: [1, 2], C: [1.5, 1.5] }[g], pl = pid ? S.players[pid] : null; let msg;
    if (pl && pl.team === signer && S.teams[signer].ids.length > ROSTER_MIN + 2) {
      S.teams[signer].ids = S.teams[signer].ids.filter(x => x !== pl.id); pl.team = old; pl.active = false; S.teams[old].ids.push(pl.id); pl.tnTeam = old; pl.tn = 0;
      this._compPay(signer, old, prev * sc[0], `FA 보상금(${p.ko})`); msg = `보상선수 ${pl.ko} + 보상금 ${(prev * sc[0]).toFixed(1)}억`;
    } else { this._compPay(signer, old, prev * sc[1], `FA 보상금(${p.ko})`); msg = `보상금 ${(prev * sc[1]).toFixed(1)}억`; }
    (S.compLog = S.compLog || []).push({ year: S.year, from: old, to: signer, id: p.id, grade: g, text: msg, pid: pl && pl.team === old ? pl.id : null }); if (S.compLog.length > 60) S.compLog.shift();
    if (old === S.userTeam || signer === S.userTeam) news(this, `FA 보상(${g}등급 ${p.ko} ${KO0[old]}→${KO0[signer]}): ${msg}`);
    if (signer === S.userTeam || old === S.userTeam) { this.repairSettings(S.userTeam); }
    this.refreshTeam(signer === S.userTeam ? old : signer); this.invalidate(); return msg;
  };
  proto._compensate = function (t, p, info) {
    const S = this.S, g = info.grade, prev = info.prev || 0, old = info.from, sc = { A: [2, 3], B: [1, 2], C: [1.5, 1.5] }[g];
    if (!old || !(old in S.teams)) return;
    if (g === 'C') { this._compApply(t, old, p, g, prev, null); return; }
    const cands = this.compCandidates(t, p, g);
    if (old === S.userTeam) {   // 내 선수가 떠남: 후보를 보고 선수/보상금 선택
      if (!cands.length) { this._compApply(t, old, p, g, prev, null); return; }
      const top = cands.slice(0, 4); for (const x of top) x.compHold = true;   // 결정 전까지 보호(방출·정리 대상 제외)
      this._evAdd({ type: 'comp', title: `FA 보상 선택: ${p.ko}(${g}등급) → ${KO0[t]}`, ttl: 1e9,   /* 결정할 때까지 자동 처리하지 않는다(규약 제172조 ⑤: 원소속구단이 보상 방법을 선택) */ data: { signer: t, fa: p.id, grade: g, prev, cands: top.map(x => x.id) },
        text: `${KO0[t]}가 ${p.ko}를 영입했습니다. 보상은 (보상선수 1명 + 전년 연봉 ${sc[0] * 100}%) 또는 (보상금만 ${sc[1] * 100}%) 중 선택합니다. 전년 연봉 ${prev.toFixed(1)}억 기준 — 선수 선택 시 ${(prev * sc[0]).toFixed(1)}억, 보상금만 ${(prev * sc[1]).toFixed(1)}억.`,
        def: 'p:' + top[0].id, choices: top.map(x => ({ k: 'p:' + x.id, label: `${x.ko} (${x.type === 'P' ? (x.role === 'SP' ? '선발' : '구원') : x.pos})`, hint: `OVR ${this.ovr(x)} · ${x.age}세 · 시장가치 ${this.marketValue(x).toFixed(1)}억` })).concat([{ k: 'money', label: `보상금만 ${(prev * sc[1]).toFixed(1)}억`, hint: '선수 지명 없이 보상금 정산' }]) });
      (S.compLog = S.compLog || []).push({ year: S.year, from: old, to: t, id: p.id, grade: g, text: '선택 대기', pid: null, pending: true }); return;
    }
    const best = cands[0], take = !!best && S.teams[t].ids.length > ROSTER_MIN + 2;   // 실제 2020~2026 A·B등급 25건 모두 보상선수(+보상금 200%/100%) 선택 → 후보가 있으면 항상 선수 지명(data/fa_compensation_2020_2026.csv)
    this._compApply(t, old, p, g, prev, take ? best.id : null);
  };

  /* 시즌 종료: 1군 등록일수로 FA 자격 연수 갱신, 연봉 이력 기록 */
  proto._closeSeason = function () {
    for (const p of Object.values(this.S.players)) {
      if (!p.fa || p.retired) continue;
      if (p.fa.regDays >= FA_REG_DAYS) p.fa.svc += 1; else { p.fa.rem += p.fa.regDays; while (p.fa.rem >= FA_REG_DAYS) { p.fa.svc += 1; p.fa.rem -= FA_REG_DAYS; } }
      if (p.team in this.S.teams) { if (p.tnTeam !== p.team) { p.tnTeam = p.team; p.tn = 0; } if (p.fa.regDays >= 30) p.tn = (p.tn || 0) + 1; }   // 한 구단 소속(등록) 시즌 수(예외 선수 자격 7시즌)
      p.fa.regDays = 0; p.il = 0; p.fa.est = false;
      if (p.team in this.S.teams || p.team === 'MIL') p.salHist = (p.salHist || []).slice(-2).concat([p.contract.salary]);
    }
  };
  /* ---------------- 2027 FA 시장(2026-11-16 KBO 공시 FA 승인 22명) ----------------
   * 계약이 확정된 선수(양의지·오태곤)는 이미 반영됨. 미계약 20명은 시장에서 시작하며 사용자·AI 모두 영입 가능.
   * 등급 인원은 KBO 공시(A 6·B 10·C 6)에 맞춘다: 나이(게임 38 이상)는 C, 나머지는 최근 3년 평균 연봉의 리그 순위로 A 6명·B 10명 순 배정. */
  proto._applyFAClass = function (list) {
    if (!list || !list.length) return;
    const S = this.S, ps = [];
    for (const c of list) {
      const m = Object.values(S.players).filter(p => !p.foreign && p.ko === c.name && p.team === c.team && p.type === c.type).sort((a, b) => (b.reg1 ? 1 : 0) - (a.reg1 ? 1 : 0) || b.age - a.age)[0];
      if (m) ps.push({ c, p: m });
    }
    const old = ps.filter(x => x.p.age >= 38), rest = ps.filter(x => x.p.age < 38).sort((a, b) => this._salAvg(b.p) - this._salAvg(a.p));
    const gr = new Map(); old.forEach(x => gr.set(x.p.id, 'C')); rest.forEach((x, i) => gr.set(x.p.id, i < 6 ? 'A' : i < 16 ? 'B' : 'C'));
    this.S.faClass2027 = ps.map(x => ({ id: x.p.id, grade: gr.get(x.p.id), signed: x.c.signed }));
    for (const { c, p } of ps) {
      if (c.signed) continue;   // 이미 재계약(FA 계약 CSV 반영)
      p.fa.svc = Math.max(p.fa.svc, this.faReq(p)); p.fa.est = false;
      S.teams[p.team].ids = S.teams[p.team].ids.filter(x => x !== p.id);
      p.faInfo = { from: p.team, grade: gr.get(p.id), prev: p.contract.salary, year: 2027 }; p.team = 'FA'; p.active = false; p.reg1 = false; (S.fa = S.fa || []).push(p.id);
    }
    this._priceClass(true); this.invalidate();
  };
  /* FA 시장 진행: 개막 후 매일 AI 구단이 확률적으로 FA를 영입(초반에 많고 점차 줄어듦). 사용자는 언제든 직접 협상 가능 */
  proto._faMarketDay = function (d) {
    const S = this.S, pool = this.faList().filter(p => !p.foreign); if (!pool.length || d > 90) return;
    const pr = 0.01 + 0.2 * Math.exp(-d / 14), r = rngFor(S.seed, S.year, d, 5000), teams = TEAMS.filter(t => t !== S.userTeam).sort(() => r.random() - 0.5);
    for (const t of teams) {
      if (r.random() > pr) continue;
      if (this._faCount(t) >= this.faExtLimit() || S.teams[t].ids.length >= ROSTER_MAX - 4) continue;
      let deal = null;
      const cand = this.faList().filter(p => !p.foreign).sort((a, b) => this.war(b) - this.war(a)).find(p => {
        if (this.war(p) < 1.0 || !((!(p.faInfo && p.faInfo.grade)) || p.faInfo.from === t || this._faCount(t) < this.faExtLimit()) || !(r.random() < (this.war(p) >= 2 ? 0.7 : 0.45))) return false;
        deal = this._aiDeal(t, p); return !!deal;
      });
      if (!cand) continue;
      const ask = deal.salary, yrs = deal.years, g = cand.faInfo && cand.faInfo.grade, from = cand.faInfo && cand.faInfo.from;
      this._doSign(t, cand, yrs, ask, deal.bonus); this.refreshTeam(t);
      if (g || this.war(cand) >= 2) { const text = `FA ${cand.ko}(${from ? KO0[from] + ' ' : ''}${g ? g + '등급' : ''}) → ${KO0[t]} (${yrs}년 총 ${(deal.per * yrs).toFixed(1)}억, 계약금 ${deal.bonus.toFixed(1)})`; (S.faLog = S.faLog || []).unshift({ year: S.year, day: d, text }); if (S.faLog.length > 40) S.faLog.pop(); news(this, text); }
    }
  };
  proto.faList = function () { const S = this.S; return (S.fa || []).map(id => S.players[id]).filter(p => p && p.team === 'FA'); };
  proto.signFA = function (id, offer) {
    const S = this.S, p = S.players[id], t = S.userTeam; if (!p || p.team !== 'FA') return '이미 계약된 선수입니다.';
    if (S.teams[t].ids.length >= ROSTER_MAX) return `보유 선수 ${ROSTER_MAX}명 제한입니다.`;
    const info = p.faInfo, graded = info && info.grade, ext = graded && info.from !== t;
    if (ext && this._faCount(t) >= this.faExtLimit()) return `외부 FA는 올해 FA 권리 행사자 수에 따라 ${this.faExtLimit()}명까지만 영입할 수 있습니다(규약 제173조).`;
    if (p.foreign) {
      if (!this.foreignOK(t, p)) return p.aq ? '아시아쿼터는 구단당 1명입니다.' : '일반 외국인은 3명까지이며 같은 포지션 3명은 안 됩니다.';
      if (this.fSwapBlock && this.fSwapBlock()) return this.fSwapBlock();
      let ask;
      if (offer && typeof offer === 'object') { const ev = this._negEval(p, Object.assign({ years: 1, bonus: 0 }, offer), 'foreign'); if (!ev.ok) return ev.msg; ask = ev.sal; }   // 협상 테이블: 호감도로 낮춘 요구액 이상·상한 이하
      else ask = Math.min(this.askSalary(p), this.foreignCap(p, t));
      this._doSign(t, p, 1, ask, 0); this._foreignJoin(p); if (this._foreignIn) this._foreignIn(p);
      news(this, `${p.aq ? '아시아쿼터' : '외국인'} 선수 ${p.ko} 계약 (${ask}억, 1년)`); return null;
    }
    if (typeof offer !== 'object' || offer === null) offer = this.faDefaultOffer(p, t, typeof offer === 'number' ? offer : undefined);   // 숫자만 주면 요구 조건에 맞춘 기본 제시
    const ev = this.faEvaluate(p, offer, t); if (!ev.ok) return ev.msg;
    { const cb = this.capBlock(t, ev.per); if (cb) return cb; }
    const comp = this.faCompCost(p, t), cost = ev.sal + ev.bon / ev.y + comp, room = this.faRoom(t);   // 계약금은 계약 기간 동안 균등 상각 + 올 시즌 FA 보상금
    if (room < cost) return `예산 부족: 연간 비용(연봉 ${ev.sal.toFixed(1)} + 계약금 상각 ${(ev.bon / ev.y).toFixed(1)}${comp ? ' + FA 보상금 ' + comp.toFixed(1) : ''} = ${cost.toFixed(1)}억)이 FA 여유자금 ${room.toFixed(1)}억을 넘습니다. 이사회가 승인하지 않습니다.`;
    const m = S.faMkt, best = m && graded ? this._bestBid(id) : null;
    if (best) { const us = this._offerScore(p, t, ev.y, ev.sal, ev.bon);
      if (us + 1e-9 < best.score) { m.pend[id] = { years: ev.y, salary: ev.sal, bonus: ev.bon, day: m.day };
        const bt = this.faBeat(p, t, ev.y);
        return `보류(경쟁): ${KO0[best.b.team]}이(가) 연 ${best.b.per.toFixed(2)}억 × ${best.b.y}년(계약금 35%)을 제시 중이라 선수가 아직 수락하지 않습니다. 제시를 보류해 두었고(5일 유효), 이기려면 연 ${bt.per.toFixed(1)}억 이상(계약금 ${bt.bonus.toFixed(1)}억 + 연봉 ${bt.salary.toFixed(1)}억 × ${bt.years}년)이 필요합니다.`; } }
    if (m) { delete m.pend[id]; delete m.bids[id]; }
    this._doSign(t, p, ev.y, ev.sal, ev.bon);   // 경쟁균형세 상한 초과는 허용(시즌 종료 시 야구발전기금 부과)
    news(this, `FA ${p.ko} 영입 (${graded ? `${graded}등급, ` : ''}${ev.y}년 총 ${(ev.per * ev.y).toFixed(1)}억 = 계약금 ${ev.bon.toFixed(1)} + 연봉 ${ev.sal.toFixed(1)}×${ev.y})`); return null;
  };
  /* 내가 FA를 영입한 직후 보여 줄 요약: 계약 내용 + 원소속 구단이 가져간 보상(보상선수·보상금)과 예산 반영 */
  proto.signSummary = function (id) {
    const S = this.S, p = S.players[id], t = S.userTeam; if (!p || p.team !== t) return null;
    const c = p.contract, tot = Math.round(((c.bonus || 0) + c.salary * c.years) * 10) / 10, lines = [`${c.years}년 총 ${tot}억 (연봉 ${c.salary.toFixed(1)}억${c.bonus ? ' + 계약금 ' + c.bonus + '억' : ''})`];
    const cl = (S.compLog || []).slice().reverse().find(x => x.id === id && x.to === t && x.year === S.year), out = { name: p.ko, lines, comp: null };
    if (cl) { const pl = cl.pid ? S.players[cl.pid] : null; out.comp = { from: cl.from, text: cl.text, player: pl ? { name: pl.ko, ovr: this.ovr(pl), age: pl.age } : null }; }
    return out;
  };
  proto.finishFA = function () {   // AI 팀이 남은 FA를 영입하고 로스터를 채운다
    const S = this.S, r = rngFor(S.seed, S.year, 51), teams = TEAMS.filter(t => t !== S.userTeam).sort(() => r.random() - 0.5);
    for (const t of teams) {
      let n = 0; const need = k => this.players(t).filter(p => p.type === k).length;
      const pool = this.faList().sort((a, b) => this.war(b) - this.war(a));
      for (const p of pool) {
        if (this._faCount(t) >= this.faExtLimit() || S.teams[t].ids.length >= ROSTER_MAX - 4) break;
        if (p.foreign) continue;   // 외국인은 아래에서 슬롯별로 채운다
        if (this.war(p) < 1.0) continue; const deal = this._aiDeal(t, p); if (!deal) continue;   // AI 구단은 상한·여유자금을 지킨다
        if (r.random() < (this.war(p) >= 2 ? 0.75 : 0.5)) this._doSign(t, p, deal.years, deal.salary, deal.bonus);
      }
      this._fillForeign(t, r);
      // 연봉 하한(2027~) 미달이면 하한을 넘길 때까지 FA를 영입한다(미달 시 기금 납부를 피하려고)
      { const fl = this.cbtFloor(); if (fl !== null) for (let k = 0; k < 6 && this.cbtPay(t) < fl * 1.03 && S.teams[t].ids.length < ROSTER_MAX; k++) {
        let dl = null; const p = this.faList().filter(x => !x.foreign && !(x.faInfo && x.faInfo.grade && x.faInfo.from !== t && this._faCount(t) >= this.faExtLimit())).sort((a, b) => this.war(b) - this.war(a)).find(x => { dl = this._aiDeal(t, x); return !!dl; }); if (!p) break;
        this._doSign(t, p, dl.years, dl.salary, dl.bonus);   // 연봉 하한 미달 팀의 보강 영입(계약금 포함)
      } }
      // 핵심 포지션(포수·유격수·중견수·2루수·3루수)에 주포지션 선수가 2명 미만이면 보강
      for (const pos of ['C', 'SS', 'CF', '2B', '3B']) {
        while (this.hitters(t).filter(x => x.pos === pos).length < 2) {
          const fa = this.faList().filter(x => x.type === 'B' && x.pos === pos && !x.foreign && !(x.faInfo && x.faInfo.grade && x.faInfo.from !== t)).sort((a, b) => this.war(b) - this.war(a))[0], np = fa || this.makeRookie(r, 'B', pos);
          if (fa) S.fa = S.fa.filter(x => x !== fa.id); np.team = t; np.contract = { salary: Math.max(this.minSal(), Math.min(this.askSalary(np), 0.8)), years: 1 }; S.teams[t].ids.push(np.id);
        }
      }
      // 최소 인원 보장
      for (const kind of ['B', 'P']) while (need(kind) < (kind === 'B' ? 24 : 26)) {
        const p = this.faList().filter(x => x.type === kind && !x.foreign && !(x.faInfo && x.faInfo.grade && x.faInfo.from !== t)).sort((a, b) => this.war(b) - this.war(a))[0] || this.makeRookie(r, kind);
        if (p.team === 'FA') S.fa = S.fa.filter(x => x !== p.id); p.team = t; p.contract = { salary: Math.max(this.minSal(), Math.min(this.askSalary(p), 0.6)), years: 1 }; S.teams[t].ids.push(p.id);
      }
      while (S.teams[t].ids.length > ROSTER_MAX) { const w = this.players(t).filter(x => !x.compHold).sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; if (!w) break; this._retireOrRelease(t, w.id); }   // 보상 후보로 제시된 선수는 결정 전까지 방출 대상에서 제외
    }
    this._aiCoachHire();   // AI 구단 코치 영입(정원·예산 이내)
    // 시장에 남은 선수: 나이 많고 가치 낮으면 은퇴
    for (const p of this.faList()) if (p.age >= 33 && this.war(p) < 0.6) { p.retired = true; p.team = 'RET'; S.fa = S.fa.filter(x => x !== p.id); }
    // FA 풀 정리: 가치 순 상위 70명만 남기고 나머지는 시장을 떠난다
    S.fa = (S.fa || []).filter(id => S.players[id].team === 'FA');
    const keep = new Set(this.faList().sort((a, b) => this.war(b) - this.war(a)).slice(0, 70).map(p => p.id));
    for (const id of S.fa.slice()) if (!keep.has(id)) { const p = S.players[id]; p.retired = true; p.team = 'RET'; }
    S.fa = S.fa.filter(id => keep.has(id));
    this.invalidate();
  };

  /* ---------------- FA 협상 기간(1월 1일 개시, 일 단위 진행) · 경쟁 입찰 ----------------
     - S.faMkt = {day, bids:{id:[{team,per,ceil,y,day}]}, pend:{id:{years,salary,bonus,day}}, closed}
     - day 0 = 1월 1일, FA_END일(3월 17일)까지 진행 가능. 개막 전에 FA 계약을 모두 마감한다.
     - AI 구단은 관심 선수에게 입찰(연 보수 = 요구액, 계약금 35%)하고, 매일 상한(요구액 +2~12%)까지 올린다.
     - 선수 평가 점수 = 연 보수 × (1 + 0.15 × 계약금 비중) × (1 − 1%×|기간−선호 기간|) × (원소속 구단 +2%).
     - 내 제시 점수가 최고 입찰 이상이면 즉시 계약, 아니면 5일간 보류(매일 재평가). AI 입찰은 1일 이상 경과하면 확률적으로 수락된다. */
  proto.faDateStr = function (day) { const d = new Date(Date.UTC(2001, 0, 1 + day)); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
  proto.openFAMarket = function () { this.S.faMkt = { day: 0, bids: {}, pend: {}, closed: false }; };
  proto.tradeDeadlineDay = function () { return LIM_DEADLINE; };
  proto.faDaysLeft = function () { const m = this.S.faMkt; return m ? FA_END - m.day : 0; };
  proto._offerScore = function (p, t, y, sal, bon) {
    const tm = this.faTerms(p, t), tot = bon + sal * y, per = tot / y, share = tot > 0 ? bon / tot : 0, home = p.faInfo && p.faInfo.from === t;
    return per * (1 + 0.15 * share) * (1 - 0.01 * Math.abs(y - tm.pref)) * (home ? 1.02 + 0.3 * this.loyDiscount(p, t) : this._hometown(p, t) ? 1.02 : 1);
  };
  proto._bidScore = function (p, b) { return this._offerScore(p, b.team, b.y, b.per * b.y * 0.65 / b.y, b.per * b.y * 0.35); };   // AI 입찰: 계약금 35%
  proto._bestBid = function (id) {
    const m = this.S.faMkt, bs = m && m.bids[id]; if (!bs || !bs.length) return null; const p = this.S.players[id]; let best = null;
    for (const b of bs) { const sc = this._bidScore(p, b); if (!best || sc > best.score) best = { b, score: sc }; } return best;
  };
  /* 경쟁 입찰을 이기는 최소 제시(계약금 35%, 연봉 올림). 입찰이 없으면 요구 조건 */
  proto.faBeat = function (p, t, years) {
    const tm = this.faTerms(p, t), y = clamp(years || tm.pref, 1, tm.maxYears), best = p.id && this._bestBid(p.id), req = tm.req(y);
    for (let per = req; per < req * 2; per += 0.05) {
      const tot = per * y, bon = y >= 2 ? Math.round(tot * BONUS_SHARE * 10) / 10 : 0, sal = Math.ceil(((tot - bon) / y) * 10 - 1e-9) / 10;
      if (!best || this._offerScore(p, t, y, sal, bon) > best.score + 1e-9) return { years: y, salary: sal, bonus: bon, per: (bon + sal * y) / y };
    }
    return this.faDefaultOffer(p, t, y);
  };
  proto.faBidInfo = function (id) {
    const m = this.S.faMkt; if (!m) return null; const bs = m.bids[id] || [], best = this._bestBid(id), pe = m.pend[id] || null;
    return { n: bs.length, best: best ? best.b : null, bestScore: best ? best.score : 0, pend: pe, pendLeft: pe ? Math.max(0, pe.day + 5 - m.day) : 0, bids: bs.map(b => ({ team: b.team, per: b.per, y: b.y })).sort((a, b) => b.per - a.per) };
  };
  proto._aiSign = function (t, p, per, y, d) {   // 입찰 금액으로 계약(여유자금·로스터 확인). 성공 여부 반환
    const S = this.S, bon = y >= 2 ? Math.round(per * y * BONUS_SHARE * 10) / 10 : 0, sal = Math.ceil(((per * y - bon) / y) * 10 - 1e-9) / 10;
    if (S.teams[t].ids.length >= ROSTER_MAX - 2) return false;
    const g = p.faInfo && p.faInfo.grade, from = p.faInfo && p.faInfo.from, room = this.faRoom(t), cost = sal + bon / y;
    if (room < cost) {   // 프랜차이즈 스타는 이사회 특별 승인으로 예산을 넘겨 계약
      const star = this.faStar(p, t), need = Math.round((cost - room) * 10) / 10; if (!star || need > 0.45 * cost) return false;
      const f = S.fin.teams[t]; f.boardExtra = Math.round(((f.boardExtra || 0) + need * 1.05 + 0.1) * 10) / 10; f.trust = clamp(Math.round(((f.trust === undefined ? 70 : f.trust) - Math.min(6, 2 + need * 0.3)) * 10) / 10, 0, 100);
      const tx = `${KO0[t]} 이사회가 프랜차이즈 스타 ${p.ko}(충성도 ${star.v}) 영입을 위해 예산을 ${need.toFixed(1)}억 초과 승인했습니다.`; if (this._faFeedAdd) this._faFeedAdd('sign', tx, p.id); news(this, tx);
    }
    this._doSign(t, p, y, sal, bon); this.refreshTeam(t);
    const text = `FA ${p.ko}(${from ? KO0[from] + ' ' : ''}${g ? g + '등급' : ''}) → ${KO0[t]} (${y}년 총 ${(per * y).toFixed(1)}억, 계약금 ${bon.toFixed(1)})`;
    if (this._faFeedAdd) this._faFeedAdd('sign', text, p.id);
    (S.faLog = S.faLog || []).unshift({ year: S.year, day: d, text }); if (S.faLog.length > 40) S.faLog.pop(); news(this, text); return true;
  };
  proto._postBids = function (d) {
    const S = this.S, m = S.faMkt, pool = this.faList().filter(p => !p.foreign && this.war(p) >= 1.0).sort((a, b) => this.war(b) - this.war(a)).slice(0, 30); if (!pool.length) return;
    const pr = 0.02 + 0.3 * Math.exp(-d / 12), r = rngFor(S.seed, S.year, 7000 + d, 5000), teams = TEAMS.filter(t => t !== S.userTeam).sort(() => r.random() - 0.5);
    {   // 프랜차이즈 스타 우선 입찰: 충성도 높은 자기 구단 FA는 일반 입찰 확률과 관계없이 매일 높은 확률로 붙잡으러 나선다(여유자금이 모자라도 특별 승인 대상)
      const rs = rngFor(S.seed, S.year, 7000 + d, 5002);
      for (const p of this.faList()) { const t = p.faInfo && p.faInfo.from; if (!t || t === S.userTeam || p.team !== 'FA' || (m.bids[p.id] || []).some(b => b.team === t)) continue;
        const star = this.faStar(p, t); if (!star || !(rs.random() < 0.4 + 0.4 * star.s)) continue; if (S.teams[t].ids.length >= ROSTER_MAX - 4) continue;
        const deal = this._aiDeal(t, p); if (!deal) continue;
        (m.bids[p.id] = m.bids[p.id] || []).push({ team: t, per: Math.round(deal.per * 100) / 100, ceil: Math.round(deal.per * (1.08 + 0.12 * rs.random()) * 100) / 100, y: deal.years, day: d, star: true });
        if (this._faFeedAdd) this._faFeedAdd('bid', `${KO0[t]}이(가) 프랜차이즈 스타 ${p.ko}를 붙잡기 위해 ${deal.years}년 연 ${deal.per.toFixed(1)}억을 제시했습니다.${deal.special ? ' (이사회 특별 승인 예정)' : ''}`, p.id); }
    }
    for (const t of teams) {
      if (r.random() > pr) continue;
      if (this._faCount(t) >= this.faExtLimit() || S.teams[t].ids.length >= ROSTER_MAX - 4) continue;
      if (pool.filter(p => (m.bids[p.id] || []).some(b => b.team === t)).length >= 2) continue;   // 동시 입찰 2명까지
      for (const p of pool) {
        if (p.team !== 'FA' || (m.bids[p.id] || []).some(b => b.team === t)) continue;
        const g = p.faInfo && p.faInfo.grade; if (g && p.faInfo.from !== t && this._faCount(t) >= this.faExtLimit()) continue;
        if (!(r.random() < (this.war(p) >= 2 ? 0.7 : 0.45))) continue;
        if (p.faInfo && p.faInfo.from && p.faInfo.from !== t && this.legendBound && this.legendBound(p, p.faInfo.from) && r.random() < 0.8) continue;   // 레전드 스틸 억제: 타 구단의 영구결번 후보는 입찰 확률을 1/5로
        const deal = this._aiDeal(t, p); if (!deal) continue;
        (m.bids[p.id] = m.bids[p.id] || []).push({ team: t, per: Math.round(deal.per * 100) / 100, ceil: Math.round(deal.per * (1.02 + 0.1 * r.random()) * 100) / 100, y: deal.years, day: d }); if (this._faFeedAdd) this._faFeedAdd('bid', `${KO0[t]}이(가) ${p.ko}에게 ${deal.years}년 연 ${deal.per.toFixed(1)}억을 제시했습니다.`, p.id); break;
      }
    }
  };
  proto._userSignPend = function (p, pe) {   // 보류 제시가 이기면 계약(예산·인원 재확인)
    const S = this.S, t = S.userTeam, tm = this.faTerms(p, t), per = (pe.bonus + pe.salary * pe.years) / pe.years;
    if (S.teams[t].ids.length >= ROSTER_MAX || this.faRoom(t) < pe.salary + pe.bonus / pe.years || (tm.ext && this._faCount(t) >= this.faExtLimit()) || per + 1e-9 < tm.req(pe.years) || this.capBlock(t, per)) return false;
    this._doSign(t, p, pe.years, pe.salary, pe.bonus);
    news(this, `FA ${p.ko} 영입 — 경쟁 끝에 계약 (${pe.years}년 총 ${(per * pe.years).toFixed(1)}억 = 계약금 ${pe.bonus.toFixed(1)} + 연봉 ${pe.salary.toFixed(1)}×${pe.years})`); return true;
  };
  proto._resolveBids = function (d, force) {
    const S = this.S, m = S.faMkt; if (!m) return; const r = rngFor(S.seed, S.year, 7500 + d, 5001);
    for (const id of Object.keys(m.bids)) {
      const p = S.players[id]; if (!p || p.team !== 'FA') { delete m.bids[id]; delete m.pend[id]; continue; }
      const bs = m.bids[id];
      for (const b of bs) if (b.per < b.ceil && r.random() < 0.5) b.per = Math.min(b.ceil, Math.round(b.per * 1.03 * 100) / 100);   // 경쟁이 붙으면 상한까지 올린다
      let best = this._bestBid(id); if (!best) { delete m.bids[id]; continue; }
      const pe = m.pend[id];
      if (pe && pe.day + 5 < d) { delete m.pend[id]; news(this, `${p.ko}에 대한 내 제시가 만료되었습니다.`); }
      else if (pe && this._offerScore(p, S.userTeam, pe.years, pe.salary, pe.bonus) >= best.score - 1e-9 && this._userSignPend(p, pe)) { delete m.bids[id]; delete m.pend[id]; continue; }
      const age = d - best.b.day; if (age < 1 && !force) continue;
      if (force || r.random() < Math.min(0.85, this.war(p) >= 2 ? 0.1 + 0.1 * age : 0.25 + 0.2 * age)) {
        const lost = !!m.pend[id];
        if (this._aiSign(best.b.team, p, best.b.per, best.b.y, d)) { if (lost) news(this, `${p.ko}은(는) ${KO0[best.b.team]}과 계약했습니다. 내 제시는 경쟁에서 밀렸습니다.`); delete m.bids[id]; delete m.pend[id]; }
        else m.bids[id] = bs.filter(x => x !== best.b);   // 여유자금·로스터 부족으로 입찰 철회
        if (m.bids[id] && !m.bids[id].length) delete m.bids[id];
      }
    }
  };
  /* FA 시장 n일 진행(1월 1일 기준). 반환: 진행한 일수 */
  proto.faAdvance = function (n) {
    const m = this.S.faMkt; if (!m || m.closed) return 0; let k = 0;
    while (k < n && m.day < FA_END) { this._postBids(m.day); this._resolveBids(m.day, false); if (this._campEvents) this._campEvents(m.day); m.day++; k++; }
    this.invalidate(); return k;
  };
  /* FA 마감(개막 전): 입찰 중인 계약을 확정하고 AI가 남은 FA·로스터를 정리한다 */
  proto.closeFA = function () {
    const S = this.S, m = S.faMkt;
    if (m && !m.closed) { this._resolveBids(m.day, true); this.finishFA(); for (const t of TEAMS) if (t !== S.userTeam && S.phase !== 'offseason' && this.players(t).filter(p => p.active).length !== ACTIVE_MAX) this.ensureActive(t); m.closed = true; for (const id in m.pend) delete m.pend[id]; this.invalidate(); }
    else if (!m) this.finishFA();
    if (S.phase !== 'offseason') S.faMkt = null;
    this._excAtFAEnd();
  };

});
