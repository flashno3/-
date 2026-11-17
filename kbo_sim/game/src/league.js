/* KBO 감독 모드 리그 로직
 * 선수 평가·연봉, 로스터/라인업/로테이션/불펜, 일정·하루 진행, 직접 지휘 경기, 포스트시즌, 오프시즌(성장·은퇴·드래프트·FA·트레이드), 저장.
 * 경기 자체는 engine.js(파이썬 엔진과 결과가 같은 포팅)를 그대로 사용한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../web/src/engine.js'));
  else root.KBOLeague = factory(root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';
  const { PyRandom, TEAMS, PARKNAME } = Engine;
  const ORDER = ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'];
  const POSS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const WD = { '2B': .18, 'SS': .22, '3B': .16, '1B': .07, 'LF': .10, 'CF': .17, 'RF': .10, C: 0.12 };
  const KO = { Whales: '울산', Bears: '두산', Twins: 'LG', Heroes: '키움', Landers: 'SSG', Wiz: 'KT', Eagles: '한화', Tigers: 'KIA', Giants: '롯데', Dinos: 'NC', Lions: '삼성' };
  const PEN_R = { SS: 22, '2B': 26, '3B': 28, CF: 24, LF: 36, RF: 36, '1B': 44, C: 40 }, PEN_E = { SS: 2.2, '2B': 2.2, '3B': 2.2, CF: 1.8, LF: 1.5, RF: 1.5, '1B': 1.2, C: 1.6 };   // 엔진의 낯선 포지션 페널티와 같은 값
  const FAM = 15;   // 소화 가능 기준(해당 포지션 선발 경기 수)
  const POSPEN = { C: 70, SS: 55, CF: 40, '2B': 38, '3B': 32, RF: 20, LF: 16, '1B': 10, DH: 0 };
  const ACTIVE_MAX = 29, ROSTER_MAX = 130, ROSTER_MIN = 44;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rngFor = (...ns) => { let h = 2166136261; for (const n of ns) { h = Math.imul(h ^ (n | 0), 16777619) >>> 0; h = (h ^ (h >>> 13)) >>> 0; } return new PyRandom(h); };
  const gauss = (r, m, s) => r.gauss(m, s);
  const pick = (r, arr) => arr[Math.floor(r.random() * arr.length)];

  class League {
    /* ------------------------------------------------------------ 생성/저장 */
    constructor(S) { this.S = S; this._eng = null; this._engDirty = true; this._eng2 = null; this._f2dirty = true; }
    static create(base, userTeam, seed) {
      const S = {
        v: 1, seed, year: 2027, userTeam, phase: 'preseason', day: 0, nextId: 1000, rc: 0, players: {}, teams: {}, schedule: [], results: [],
        rec: {}, rec2: {}, h2h: {}, stats: { bat: {}, pit: {} }, stats2: { bat: {}, pit: {} }, recent: {}, post: null, off: null, history: [], news: [],
        calib: { lb: base.league_bat, team_def: base.team_def, pf: base.pf, fielding: base.fielding, scale: base.scale }
      };
      S.fteams = { Whales: { ids: [] } };
      for (const t of TEAMS) S.teams[t] = { ids: [], set: { lineup: [], rotation: [], rotIdx: 0, bullpen: { closer: null, setup: [], middle: [], long: [] }, autoLineup: true } };
      for (const x of base.players) {
        const p = JSON.parse(JSON.stringify(x)); if (p.foreign === undefined) p.foreign = !/[가-힣]/.test(p.ko || ''); p.active = false; p.fat = 0; p.lastStart = -99; p.retired = false;
        if (p.type === 'B') { p.fr = p.fr || {}; p.gs = p.gs || {}; } else { p.role = p.role || (p.GS >= 0.5 * p.G && p.GS >= 3 ? 'SP' : 'RP'); }
        S.players[p.id] = p; if (p.team === 'MIL') (S.mil = S.mil || []).push(p.id); else if (p.team === 'Whales') S.fteams.Whales.ids.push(p.id); else S.teams[p.team].ids.push(p.id);   // 상무 복무 중인 선수는 팀 명단 밖
      }
      S.nextId = Math.max(S.nextId, 1 + Math.max(...Object.keys(S.players).map(id => parseInt(id.slice(1)))));   // 데이터 선수 ID와 신인 ID가 겹치지 않게
      const L = new League(S);
      L._ensureWhales(); L._calibrate(base);
      const r = rngFor(seed, 1);
      for (const id in S.players) {
        const p = S.players[id]; p.pot = p.age <= 25 ? Math.max(0, (27 - p.age) * 0.10 + gauss(r, 0, 0.15)) : 0;
        p.contract = { salary: Math.round(L.price(p) * clamp(1 + gauss(r, 0, 0.12), 0.7, 1.4) * 10) / 10, years: 1 + Math.floor(r.random() * 4) };
        p.contract.salary = Math.max(0.3, p.contract.salary);
      }
      L._calibrateSalaries();   // 2026 연봉 데이터가 있으면 실제 연봉 사용, 없으면 모델 연봉을 실제 규모로 환산
      S.cbt = { over: {}, under: {}, drop: {}, fees: {}, log: [] };
      L._f27 = base.foreign2027 || [];
      if (L._initFARules) L._initFARules();   // FA 자격 연수·등급 기준 연봉·외국인 슬롯 초기화
      if (L._addDraftClass) L._addDraftClass(base.draft2027);   // 2027 신인 드래프트 지명 결과(실제 지명·가상 능력치)
      for (const t of TEAMS) L.initTeam(t);
      S.calib.base = L.talentLevel();
      L.newSeasonSetup(true);
      return L;
    }
    /* 계약 연봉을 실제 KBO 규모로 환산: 최저 0.3억은 고정, 초과분만 배율 적용(리그 평균 상위 40명 합계 = 111.05억, 2025 발표 기준) */
    /* 연봉: 실제 2026 연봉(p.sal, 억)이 있는 선수는 그대로, 나머지는 모델값.
     * 모델 가격(salK)은 실제 연봉이 있는 1군 데이터 선수로 맞추고, 연봉 합계가 실제 경쟁균형세 규모(2025 평균 111.05억)와 같아지도록 cbtK(계약금·옵션 등 연봉 외 보수 환산)를 둔다. */
    _calibrateSalaries() {
      const S = this.S, all = Object.values(S.players), real = all.filter(p => p.sal !== undefined);
      if (!real.length) { this._scaleSalaries(); return; }
      const vals = real.filter(p => p.src !== 'F' && p.sal >= 1.0 && this.war(p) >= 0.5);
      const base = vals.reduce((a, p) => a + 0.9 * Math.pow(this.war(p), 1.35), 0), act = vals.reduce((a, p) => a + (p.sal - 0.3), 0);
      S.calib.salK = base > 0 ? act / base : 1;
      for (const p of all) p.contract.salary = p.sal !== undefined ? Math.max(0.3, Math.round(p.sal * 10) / 10) : (p.src === 'F' ? 0.3 : Math.max(0.3, this.price(p)));
      this._applyContracts();
      const tops = TEAMS.map(t => this.players(t).filter(p => !p.foreign).map(p => this.cbtVal(p)).sort((a, b) => b - a).slice(0, 40).reduce((a, b) => a + b, 0)), avg = tops.reduce((a, b) => a + b, 0) / tops.length;
      S.calib.cbtK = 111.05 / avg;
    }
    /* FA 계약 CSV(p.ct) 반영: 잔여 연수·총액·계약금·옵션. 옵트아웃으로 시장에 나온 선수는 FA 풀에서 시작 */
    _applyContracts() {
      const S = this.S;
      for (const p of Object.values(S.players)) {
        if (p.ct) { const c = p.contract; if (p.ct.years) c.years = p.ct.years; for (const k of ['total', 'bonus', 'from', 'end', 'opt', 'est']) if (p.ct[k] !== null && p.ct[k] !== undefined) c[k] = p.ct[k]; if (p.ct.cbt !== undefined) c.cbt = p.ct.cbt; if (p.ct.salary) { c.salary = p.ct.salary; p.sal = p.ct.salary; } }
        if (p.faStart && p.team in S.teams) { S.teams[p.team].ids = S.teams[p.team].ids.filter(x => x !== p.id); p.team = 'FA'; p.active = false; (S.fa = S.fa || []).push(p.id); }
      }
    }
    _scaleSalaries() {
      const S = this.S; if (S.calib.salK) return;
      const tops = TEAMS.map(t => this.players(t).map(p => p.contract.salary).sort((a, b) => b - a).slice(0, 40).reduce((a, b) => a + b, 0)), avg = tops.reduce((a, b) => a + b, 0) / tops.length;
      const k = (111.05 - 0.3 * 40) / (avg - 0.3 * 40); S.calib.salK = k;
      for (const id in S.players) { const c = S.players[id].contract; if (c) c.salary = Math.max(0.3, Math.round((0.3 + (c.salary - 0.3) * k) * 10) / 10); }
    }
    /* 울산 웨일즈(퓨처스 전용)의 구장·수비 보정은 중립(리그 평균)으로 둔다 */
    _ensureWhales() {
      const C = this.S.calib; if (!C.pf.Whales) C.pf = Object.assign({}, C.pf, { Whales: { runs: 1, b1: 1, b2: 1, b3: 1, hr: 1 } });
      const tar = C.fielding.team_avg_range; if (!tar.Whales) { const w = {}; for (const pos in tar[TEAMS[0]]) w[pos] = TEAMS.reduce((a, t) => a + tar[t][pos], 0) / TEAMS.length; tar.Whales = w; }
    }
    toJSON() { return this.S; }
    static fromJSON(S) { S.mil = S.mil || []; S.fteams = S.fteams || { Whales: { ids: [] } }; S.stats2 = S.stats2 || { bat: {}, pit: {} }; S.recent = S.recent || {}; const L = new League(S); L._f2dirty = true; L._ensureWhales(); if (!S.rec2 || !S.rec2[TEAMS[0]] || L.farmTeams().some(t => !S.rec2[t])) { S.rec2 = {}; for (const t of L.farmTeams()) S.rec2[t] = [0, 0, 0, 0, 0]; }
      if (!S.calib.salK) L._scaleSalaries();   // 예전 저장: 연봉을 실제 규모로 환산
      if (!S.cbt) S.cbt = { over: {}, under: {}, drop: {}, fees: {}, log: [] };
      for (const id in S.players) { const p = S.players[id]; if (p.foreign === undefined) p.foreign = !/[가-힣]/.test(p.ko || ''); }
      return L; }
    save() { return JSON.stringify(this.S); }
    static load(str) { return League.fromJSON(JSON.parse(str)); }

    /* ------------------------------------------------------------ 리그 평균 실력 수준(기준선 보정용) */
    talentLevel(shift) {
      const sh = shift || { B: 0, P: 0 }, out = { B: [], SP: [], RP: [] };
      for (const t of TEAMS) {
        const H = this.hitters(t), lu = this.bestLineup(H);
        for (const x of lu) out.B.push(this._runsBS(this.S.players[x.id], sh.B));
        const P = this.pitchers(t).slice().sort((a, b) => this._runsPS(b, sh.P) - this._runsPS(a, sh.P)), sp = P.filter(p => p.role === 'SP' || p.stamina >= 52).slice(0, 5), spi = new Set(sp.map(p => p.id));
        sp.forEach(p => out.SP.push(this._runsPS(p, sh.P))); P.filter(p => !spi.has(p.id)).slice(0, 8).forEach(p => out.RP.push(this._runsPS(p, sh.P)));
      }
      const m = a => a.reduce((x, y) => x + y, 0) / a.length;
      return { B: m(out.B), P: 0.65 * m(out.SP) + 0.35 * m(out.RP) };
    }
    _shifted(p, s) {
      if (!s) return p.p; const sc = this.S.calib.scale[p.type], q = Object.assign({}, p.p), d = s * 0.75;
      if (p.type === 'B') { q.k -= d * sc.k[1]; q.bb += d * sc.bb[1]; q.hr += d * sc.hr[1]; q.babip += d * sc.babip[1]; q.xbh += d * sc.xbh[1]; }
      else { q.k += d * sc.k[1]; q.bb -= d * sc.bb[1]; q.hr -= d * sc.hr[1]; q.babip -= d * sc.babip[1]; }
      return q;
    }
    _runsBS(p, s) { return (this._batRate(this._shifted(p, s)) - this.S.calib.batAvg) * 600 + this.defRuns(p); }
    _runsPS(p, s) { return (this.S.calib.pitAvg - this._pitRate(this._shifted(p, s))) * 750; }
    /* 시즌이 쌓여도 리그 전체 수준이 변하지 않도록 모든 선수를 같은 폭만큼 이동 */
    normalizeTalent() {
      const S = this.S, base = S.calib.base; if (!base) return { B: 0, P: 0 };
      const cur = this.talentLevel(), t2 = this.talentLevel({ B: 0.2, P: 0.2 }), sB = clamp((base.B - cur.B) / ((t2.B - cur.B) / 0.2), -0.8, 0.8), sP = clamp((base.P - cur.P) / ((t2.P - cur.P) / 0.2), -0.8, 0.8);
      for (const id in S.players) { const p = S.players[id]; if (p.retired || p.team === 'RET') continue; const s = p.type === 'B' ? sB : sP; if (Math.abs(s) < 1e-6) continue; p.p = this._shifted(p, s); }
      this.invalidate(); return { B: sB, P: sP };
    }
    /* ------------------------------------------------------------ 평가 */
    _calibrate(base) {
      const S = this.S, C = S.calib, lb = C.lb;
      const rate = p => this._batRate(p);
      const B = Object.values(S.players).filter(p => p.type === 'B'), P = Object.values(S.players).filter(p => p.type === 'P');
      const wsum = B.reduce((a, p) => a + p.PA, 0);
      C.batAvg = B.reduce((a, p) => a + rate(p.p) * p.PA, 0) / wsum;
      const pw = P.reduce((a, p) => a + p.IP, 0);
      C.pitAvg = P.reduce((a, p) => a + this._pitRate(p.p) * p.IP, 0) / pw;
      const regB = B.filter(p => p.PA >= 300).map(p => this._runsB(p, true)), regP = P.filter(p => p.IP >= 80).map(p => this._runsP(p, true));
      const mean = a => a.reduce((x, y) => x + y, 0) / a.length, sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
      C.bMean = mean(regB); C.bSd = sd(regB); C.pMean = mean(regP); C.pSd = sd(regP);
    }
    _batRate(p) { const bip = 1 - p.k - p.bb - p.hbp - p.hr, xb = p.xbh, tr = p.tri; return p.bb * 0.69 + p.hbp * 0.72 + p.hr * 2.0 + bip * p.babip * ((1 - xb) * 0.88 + xb * (1 - tr) * 1.24 + xb * tr * 1.56); }
    _pitRate(p) { const lb = this.S.calib.lb, bip = 1 - p.k - p.bb - p.hbp - p.hr, xb = lb.xbh, tr = lb.tri; return p.bb * 0.69 + p.hbp * 0.72 + p.hr * 2.0 + bip * p.babip * ((1 - xb) * 0.88 + xb * (1 - tr) * 1.24 + xb * tr * 1.56); }
    defRuns(p, pos) { pos = pos || p.pos; if (!WD[pos]) return 0; const fr = p.fr && p.fr[pos]; const rr = fr ? fr.range : 50; return 11.4 * WD[pos] * (rr - 50) / 10; }
    _runsB(p, noDef) { return (this._batRate(p.p) - this.S.calib.batAvg) * 600 + (noDef ? 0 : this.defRuns(p)); }
    _runsP(p) { return (this.S.calib.pitAvg - this._pitRate(p.p)) * 750; }
    /* 종합 능력치 20~80 */
    ovr(p) { const C = this.S.calib; return p.type === 'B' ? clamp(Math.round(50 + 10 * (this._runsB(p) - C.bMean) / C.bSd), 20, 80) : clamp(Math.round(50 + 10 * (this._runsP(p) - C.pMean) / C.pSd), 20, 80); }
    /* 세부 능력치 20~80 */
    sub(p) {
      const sc = this.S.calib.scale, r = (f, grp, sign) => clamp(Math.round(50 + 10 * sign * (p.p[f] - sc[grp][f][0]) / sc[grp][f][1]), 20, 80);
      if (p.type === 'B') return { 컨택: r('k', 'B', -1), 선구: r('bb', 'B', 1), 파워: r('hr', 'B', 1), 타구질: r('babip', 'B', 1), 장타: r('xbh', 'B', 1), 주력: r('sba', 'B', 1), 수비: clamp(Math.round(50 + (p.fr[p.pos] ? p.fr[p.pos].range - 50 : 0)), 20, 80) };
      return { 구위: r('k', 'P', 1), 제구: r('bb', 'P', -1), 피홈런: r('hr', 'P', -1), 타구억제: r('babip', 'P', -1), 체력: clamp(Math.round(p.stamina), 20, 80) };
    }
    war(p) {
      if (p.type === 'B') return Math.max(0, (this._runsB(p) + 12) / 10);
      return Math.max(0, (this._runsP(p) + 9) / 10 * (p.role === 'SP' ? 1 : 0.42));
    }
    price(p) { return Math.round((0.3 + 0.9 * Math.pow(this.war(p), 1.35) * (this.S.calib.salK || 1)) * 10) / 10; }   // 최저연봉 0.3억 + 가치분(실제 KBO 연봉 규모로 환산)
    /* 시장 가치(억 원 환산): 나이·잠재력 반영 */
    marketValue(p) {
      let v = this.price(p); const a = p.age;
      if (a <= 24) v *= 1 + 0.18 * (25 - a) / 3 + 0.35 * (p.pot || 0); else if (a >= 33) v *= Math.max(0.35, 1 - 0.12 * (a - 32));
      return Math.max(0.2, Math.round(v * 10) / 10);
    }
    /* ---- 경쟁균형세(샐러리캡): KBO 규정 ----
     * 산정: 연봉 상위 40명 합계(신인·외국인 제외). 상한 2027년 151.1709억, 2028년 158.7294억(+5%), 이후 동결 가정.
     * 하한 2027년부터 60.6538억(2028년 +5%). 초과: 1회 30%·2회 연속 50%·3회 연속 100%를 야구발전기금으로 납부(3회 연속이면 1라운드 지명 9단계 하락).
     * 미달: 1회 30%·2회 연속 50%·3회 연속 100%. */
    cbtCap(y) { y = y === undefined ? this.S.year : y; return Math.round(151.1709 * Math.pow(1.05, clamp(y - 2027, 0, 1)) * 10000) / 10000; }
    cbtFloor(y) { y = y === undefined ? this.S.year : y; return y < 2027 ? null : Math.round(60.6538 * Math.pow(1.05, clamp(y - 2027, 0, 1)) * 10000) / 10000; }
    /* 경쟁균형세 산정 보수: FA 다년계약은 (보장 총액/보장 연수), 그 외는 연봉 */
    cbtVal(p) { return p.contract.cbt !== undefined ? p.contract.cbt : p.contract.salary; }
    cbtPay(t) { const y = this.S.year; return Math.round(this.players(t).filter(p => p.rookie !== y && !p.foreign).map(p => this.cbtVal(p)).sort((a, b) => b - a).slice(0, 40).reduce((a, b) => a + b, 0) * (this.S.calib.cbtK || 1) * 100) / 100; }
    cbtRate(n) { return [0.3, 0.5, 1][clamp(n, 1, 3) - 1]; }
    /* 지금 시즌 종료 시점으로 가정한 정산(미리보기) */
    cbtPreview(t) {
      const S = this.S, pay = this.cbtPay(t), cap = this.cbtCap(), fl = this.cbtFloor(), c = S.cbt || { over: {}, under: {} };
      if (pay > cap) { const n = (c.over[t] || 0) + 1; return { kind: 'over', pay, cap, fl, n, fee: (pay - cap) * this.cbtRate(n), drop: n >= 3 }; }
      if (fl !== null && pay < fl) { const n = (c.under[t] || 0) + 1; return { kind: 'under', pay, cap, fl, n, fee: (fl - pay) * this.cbtRate(n), drop: false }; }
      return { kind: null, pay, cap, fl, n: 0, fee: 0, drop: false };
    }
    /* 시즌 종료 정산: 기금 납부액 기록, 연속 횟수 갱신 */
    settleCBT() {
      const S = this.S; S.cbt = S.cbt || { over: {}, under: {}, drop: {}, fees: {}, log: [] }; const c = S.cbt; c.drop = {};
      for (const t of TEAMS) {
        const v = this.cbtPreview(t);
        c.over[t] = v.kind === 'over' ? v.n : 0; c.under[t] = v.kind === 'under' ? v.n : 0;
        if (v.drop) c.drop[t] = true; c.fees[t] = Math.round(((c.fees[t] || 0) + v.fee) * 100) / 100;
        c.log.push({ year: S.year, team: t, pay: v.pay, cap: v.cap, fl: v.fl, kind: v.kind, n: v.n, fee: Math.round(v.fee * 100) / 100, drop: v.drop });
      }
      if (c.log.length > 200) c.log.splice(0, c.log.length - 200);
      return c.log.slice(-TEAMS.length);
    }
    payroll(t) { return Math.round(this.S.teams[t].ids.reduce((a, id) => a + this.S.players[id].contract.salary, 0) * 10) / 10; }
    /* 포지션 숙련도: 2=주포지션, 1=소화 가능(해당 포지션 선발 15경기 이상), 0=부적합 */
    fitLevel(p, pos) {
      if (pos === 'DH') return 2; if (p.pos === pos) return 2;
      if ((p.gs[pos] || 0) >= FAM) return 1;
      return 0;
    }
    fit(p, pos) { return this.fitLevel(p, pos) >= 1 ? 'ok' : 'bad'; }
    /* 경험이 적은 포지션(선발 1~14경기)은 경험 비례로 페널티가 줄어든다. 전혀 없으면 최대 */
    fitPenalty(p, pos) {
      const l = this.fitLevel(p, pos); if (l === 2) return 0; if (l === 1) return 3;
      const g = (p.gs && p.gs[pos]) || 0; return g > 0 ? Math.round(POSPEN[pos] * (1 - (0.3 + 0.5 * g / FAM)) * 10) / 10 : POSPEN[pos];
    }
    posScore(p, pos) { return pos === 'DH' ? this._runsB(p, true) : this._runsB(p, true) + this.defRuns(p, pos) - this.fitPenalty(p, pos) + (p.pos === pos ? 1.5 : 0) + (pos === 'C' && p.cs ? 40 * (p.cs - this.S.calib.fielding.lg.cs) : 0); }   // 포수는 어깨(도루저지)도 반영
    /* 주어진 9명에게 수비 위치를 최적 배정(타순은 그대로). 반환 {선수id: 포지션} */
    resolvePositions(ids) {
      const slots = ORDER.concat(['DH']), P = ids.map(id => this.S.players[id]), n = P.length, M = 1 << slots.length, NEG = -1e9;
      const val = P.map(p => slots.map(q => this.posScore(p, q)));
      const dp = [new Float64Array(M).fill(NEG)]; dp[0][0] = 0; const ch = [];
      for (let i = 0; i < n; i++) {
        const nx = new Float64Array(M).fill(NEG), pr = new Int8Array(M).fill(-1), cur = dp[i];
        for (let m = 0; m < M; m++) { const b = cur[m]; if (b === NEG) continue; for (let j = 0; j < slots.length; j++) { if (m & (1 << j)) continue; const nm = m | (1 << j), v = b + val[i][j]; if (v > nx[nm]) { nx[nm] = v; pr[nm] = j; } } }
        dp.push(nx); ch.push(pr);
      }
      let bm = 0, bv = NEG; for (let m = 0; m < M; m++) if (dp[n][m] > bv) { bv = dp[n][m]; bm = m; }
      const out = {}; let m = bm; for (let i = n - 1; i >= 0; i--) { const j = ch[i][m]; out[ids[i]] = slots[j]; m &= ~(1 << j); } return out;
    }
    /* 선발로 나선 경기를 쌓으면 그 포지션에 익숙해진다(15경기 → 가능) */
    learnPosition(p, pos) {
      if (pos === 'DH' || p.type !== 'B') return; p.gs[pos] = (p.gs[pos] || 0) + 1;
      if (p.gs[pos] >= FAM && !p.fr[pos]) { p.fr[pos] = { range: 44, err_reg: this.S.calib.fielding.lg.err[pos] * 1.25 }; this.invalidate(); }
    }

    /* ------------------------------------------------------------ 투타 정보 */
    handLabel(p) { if (p.type === 'B') return p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : p.bats === 'R' ? '우타' : ''; return p.throws === 'L' ? '좌투' : p.throws === 'R' ? '우투' : ''; }
    handsKnown() { const P = Object.values(this.S.players).filter(p => p.team in this.S.teams); return { b: P.filter(p => p.type === 'B' && p.bats).length, bt: P.filter(p => p.type === 'B').length, p: P.filter(p => p.type === 'P' && p.throws).length, pt: P.filter(p => p.type === 'P').length }; }
    /* KBO 선수 등록 현황 표나 '이름,우투좌타' 줄을 붙여넣으면 투타를 적용한다. 같은 이름이 여러 명이면 팀 이름이 같은 줄에 있어야 한다 */
    importHands(text) {
      const S = this.S, hre = /(우|좌)(?:투|언|사)(우|좌|양)타/, teams = Object.values(KO), by = {}, rep = { applied: 0, ambiguous: [], missing: [] };
      for (const p of Object.values(S.players)) if (p.team in S.teams || p.team === 'FA') (by[p.ko] = by[p.ko] || []).push(p);
      for (const line of String(text).split(/\r?\n/)) {
        const m = line.match(hre); if (!m) continue; const throws = m[1] === '좌' ? 'L' : 'R', bats = m[2] === '좌' ? 'L' : m[2] === '양' ? 'S' : 'R';
        const toks = line.split(/[\s,;|]+/).filter(Boolean), name = toks.find(t => by[t]); if (!name) { rep.missing.push(toks.slice(0, 3).join(' ')); continue; }
        let list = by[name]; const tw = toks.find(t => teams.includes(t)); if (tw) { const f = list.filter(p => KO[p.team] === tw); if (f.length) list = f; }
        const bt = list.filter(p => p.type === 'B'), pt = list.filter(p => p.type === 'P');
        if (bt.length > 1 || pt.length > 1) { rep.ambiguous.push(name); continue; }
        for (const p of list) { p.bats = bats; p.throws = throws; } rep.applied++;
      }
      this.invalidate(); return rep;
    }
    /* 입력 안 된 선수 목록(붙여넣기용 양식) */
    handTemplate() { return Object.values(this.S.players).filter(p => (p.team in this.S.teams) && !(p.type === 'B' ? p.bats : p.throws)).map(p => `${p.ko},${KO[p.team]},${p.type === 'B' ? '타자' : '투수'},`).join('\n'); }
    /* ------------------------------------------------------------ 로스터/설정 */
    team(t) { return this.S.teams[t]; }
    players(t) { return (this.S.teams[t] || this.S.fteams[t]).ids.map(id => this.S.players[id]); }
    /* 2군(퓨처스) 리그 참가팀: 1군 10개 구단 + 울산 웨일즈(퓨처스 전용, 선수 20명 이상일 때) */
    farmTeams() { const w = this.S.fteams && this.S.fteams.Whales; return w && w.ids.length >= 20 ? TEAMS.concat(['Whales']) : TEAMS.slice(); }
    hitters(t, activeOnly) { return this.players(t).filter(p => p.type === 'B' && (!activeOnly || p.active)); }
    pitchers(t, activeOnly) { return this.players(t).filter(p => p.type === 'P' && (!activeOnly || p.active)); }
    /* 주어진 타자 풀에서 최적 라인업(포지션 배정+타순). 9자리를 한 번에 최적화(동적계획법) */
    bestLineup(pool) {
      const slots = ORDER.concat(['DH']), score = (p, pos) => this.posScore(p, pos);
      let cand = pool.slice();
      if (cand.length > 15) {   // 후보가 많으면 각 포지션 최적 선수는 반드시 포함하고 나머지는 종합 점수순
        const must = new Set(); for (const q of slots) must.add(cand.slice().sort((a, b) => score(b, q) - score(a, q))[0]);
        const rest = cand.filter(p => !must.has(p)).map(p => ({ p, v: Math.max(...slots.map(q => score(p, q))) })).sort((a, b) => b.v - a.v).map(x => x.p);
        cand = [...must, ...rest].slice(0, 15);
      }
      const n = cand.length, K = slots.length; if (n < K) return cand.map((p, i) => ({ id: p.id, pos: slots[i] }));
      const M = 1 << n, NEG = -1e9, val = cand.map(p => slots.map(q => score(p, q)));
      const dp = [new Float64Array(M).fill(NEG)]; dp[0][0] = 0; const ch = [];
      for (let k = 0; k < K; k++) {
        const nx = new Float64Array(M).fill(NEG), pr = new Int8Array(M).fill(-1), cur = dp[k];
        for (let m = 0; m < M; m++) { const base = cur[m]; if (base === NEG) continue; for (let j = 0; j < n; j++) { if (m & (1 << j)) continue; const nm = m | (1 << j), v = base + val[j][k]; if (v > nx[nm]) { nx[nm] = v; pr[nm] = j; } } }
        dp.push(nx); ch.push(pr);
      }
      let bm = 0, bv = NEG; for (let m = 0; m < M; m++) if (dp[K][m] > bv) { bv = dp[K][m]; bm = m; }
      const asg = {}; let m = bm; for (let k = K - 1; k >= 0; k--) { const j = ch[k][m]; asg[slots[k]] = cand[j]; m &= ~(1 << j); }
      const arr = Object.entries(asg).map(([pos, p]) => ({ id: p.id, pos }));
      // 타순: 엔진 방식(출루·장타 기준 정렬 후 4·2·1·3 순으로 배치)과 같은 규칙
      const sorted = arr.map(x => ({ ...x, o: this._obpSlg(this.S.players[x.id]) })).sort((a, b) => b.o - a.o);
      const ord = [sorted[3], sorted[1], sorted[0], sorted[2], sorted[4], sorted[5], sorted[6], sorted[7], sorted[8]];
      return ord.map(x => ({ id: x.id, pos: x.pos }));
    }
    _obpSlg(p) { const q = p.p, obp = q.bb + q.hbp + q.hr + (1 - q.k - q.bb - q.hbp - q.hr) * q.babip * 0.97, slg = obp + 2 * q.hr + q.babip * q.xbh * 0.5; return obp * 2 + slg; }
    /* 팀 초기 설정: 1군 29명, 라인업/로테이션/불펜 자동 */
    initTeam(t) {
      const pool = this.reg1Pool(t);
      if (pool.length >= ACTIVE_MAX) { this.autoActive(t, pool); this.autoSettings(t); return; }   // 실제 2026.10 1군 등록 명단이 있으면 그 안에서 28명 선발
      const T = this.S.teams[t], H = this.hitters(t).sort((a, b) => b.PA - a.PA), P = this.pitchers(t);
      const act = new Set();
      let hs = H.slice(0, 14); if (hs.filter(p => p.pos === 'C').length < 2) { const c = H.find(p => p.pos === 'C' && !hs.includes(p)); if (c) hs[hs.length - 1] = c; }
      hs.forEach(p => act.add(p.id));
      const sp = P.filter(p => p.role === 'SP').sort((a, b) => b.GS * (b.ipgs || 5) - a.GS * (a.ipgs || 5)).slice(0, 5); sp.forEach(p => act.add(p.id));
      const rp = P.filter(p => !act.has(p.id)).sort((a, b) => (b.IP - (b.ipgs || 5) * b.GS) - (a.IP - (a.ipgs || 5) * a.GS)).slice(0, ACTIVE_MAX - act.size); rp.forEach(p => act.add(p.id));
      for (const p of this.players(t)) p.active = act.has(p.id);
      this.autoSettings(t);
    }
    /* 실제 1군 등록 명단(2026.10, 확대 엔트리 33명) 선수 */
    reg1Pool(t) { return this.players(t).filter(p => p.reg1); }
    autoSettings(t, only) {
      const T = this.S.teams[t], set = T.set, H = this.hitters(t, true), P = this.pitchers(t, true);
      if (!only || only === 'lineup') set.lineup = this.bestLineup(H);
      if (!only || only === 'rotation') {
        const sp = P.filter(p => p.role === 'SP').sort((a, b) => this._runsP(b) - this._runsP(a)); const others = P.filter(p => p.role !== 'SP').sort((a, b) => b.stamina - a.stamina);
        set.rotation = sp.concat(others).slice(0, 5).map(p => p.id); set.rotIdx = 0;
      }
      if (!only || only === 'bullpen') {
        const rot = new Set(set.rotation), rp = P.filter(p => !rot.has(p.id)).sort((a, b) => this._runsP(b) - this._runsP(a));
        set.bullpen = { closer: rp[0] ? rp[0].id : null, setup: rp.slice(1, 3).map(p => p.id), middle: rp.slice(3, 8).map(p => p.id), long: rp.slice(8, 10).map(p => p.id) };
      }
    }
    /* 설정이 유효한지 점검하고 깨진 부분은 자동으로 채움 */
    repairSettings(t) {
      const T = this.S.teams[t], set = T.set, ids = new Set(T.ids), act = id => ids.has(id) && this.S.players[id].active;
      if (set.lineup.length !== 9 || set.lineup.some(x => !act(x.id) || this.S.players[x.id].type !== 'B') || new Set(set.lineup.map(x => x.id)).size !== 9) set.lineup = this.bestLineup(this.hitters(t, true));
      set.rotation = set.rotation.filter(id => act(id)); if (set.rotation.length < 5) this.autoSettings(t, 'rotation');
      const b = set.bullpen, used = new Set(set.rotation);
      const clean = a => a.filter(id => act(id) && !used.has(id) && used.add(id));
      const cl = b.closer && act(b.closer) && !used.has(b.closer) ? b.closer : null; if (cl) used.add(cl);
      set.bullpen = { closer: cl, setup: clean(b.setup), middle: clean(b.middle), long: clean(b.long) };
      const rest = this.pitchers(t, true).filter(p => !used.has(p.id)).sort((a, b) => this._runsP(b) - this._runsP(a));
      if (!set.bullpen.closer && rest.length) set.bullpen.closer = rest.shift().id;
      while (set.bullpen.setup.length < 2 && rest.length) set.bullpen.setup.push(rest.shift().id);
      for (const p of rest) set.bullpen.middle.push(p.id);
    }
    setActive(t, id, on) {
      const p = this.S.players[id]; if (!p || p.team !== t) return '선수를 찾을 수 없습니다.';
      if (on && this.players(t).filter(x => x.active).length >= ACTIVE_MAX) return `1군 엔트리는 ${ACTIVE_MAX}명까지입니다.`;
      p.active = !!on; this._engDirty = true; if (t === this.S.userTeam) this.repairSettings(t); return null;
    }

    /* ------------------------------------------------------------ AI 팀 사용량(출전·등판) */
    /* 2군 풀: 1군 엔트리에 없는 선수. 타자 9명/투수 8명에 못 미치면 1군 후보 중 가치가 낮은 선수로 메운다(드문 경우) */
    farmPool(t) {
      let H = this.hitters(t).filter(p => !p.active), P = this.pitchers(t).filter(p => !p.active);
      if (H.length < 9) H = H.concat(this.hitters(t, true).sort((a, b) => this._runsB(a, true) - this._runsB(b, true)).slice(0, 9 - H.length));
      if (P.length < 8) P = P.concat(this.pitchers(t, true).sort((a, b) => this._runsP(a) - this._runsP(b)).slice(0, 8 - P.length));
      return { H, P };
    }
    /* 사용량(출전·등판) 배정. farm=false: 1군 엔트리 → p.PA 등, farm=true: 2군 → p.f.PA 등 */
    assignUsage(t, farm) {
      const S = this.S, pool = farm ? this.farmPool(t) : { H: this.hitters(t, true), P: this.pitchers(t, true) }, H = pool.H.slice(), P = pool.P.slice();
      const U = p => farm ? (p.f || (p.f = {})) : p;
      const lineup = this.bestLineup(H), starters = new Set(lineup.map(x => x.id));
      const PAs = [560, 550, 540, 530, 520, 505, 490, 470, 450];
      const byV = lineup.map(x => S.players[x.id]).sort((a, b) => this._runsB(b) - this._runsB(a));
      byV.forEach((p, i) => { const u = U(p); u.PA = PAs[i]; u.G = Math.min(144, Math.round(u.PA / 4.15 * 1.04)); });
      for (const x of lineup) { const p = S.players[x.id], u = U(p), st = Math.round(u.PA / 4.15 * 0.97); u.aiGs = x.pos === 'DH' ? Object.assign({}, p.gs) : Object.assign({}, p.gs, { [x.pos]: st }); }
      for (const p of H) if (!starters.has(p.id)) U(p).aiGs = Object.assign({}, p.gs);
      const bench = H.filter(p => !starters.has(p.id)).sort((a, b) => this._runsB(b, true) - this._runsB(a, true)), BP = [300, 220, 150, 100, 70, 45];
      bench.forEach((p, i) => { const u = U(p); u.PA = BP[i] || 12; u.G = Math.min(144, Math.round(u.PA / 4.15 * 1.4)); });
      // 투수
      const spv = p => this._runsP(p) + 0.2 * (p.stamina - 50), spc = P.filter(p => p.role === 'SP' || p.stamina >= 52).sort((a, b) => spv(b) - spv(a)).slice(0, 5);
      if (spc.length < Math.min(5, P.length)) { const have = new Set(spc.map(p => p.id)); spc.push(...P.filter(p => !have.has(p.id)).sort((a, b) => b.stamina - a.stamina).slice(0, Math.min(5, P.length) - spc.length)); }   // 선발감이 모자라면 체력 높은 순으로 메운다
      const GSs = [30, 29, 29, 28, 26], sid = new Set();
      spc.forEach((p, i) => { const u = U(p); if (!farm) p.role = 'SP'; u.GS = GSs[i]; u.G = u.GS; u.ipgs = clamp(5.3 + (p.stamina - 50) * 0.05, 4.2, 6.8); u.IP = Math.round(u.GS * u.ipgs * 10) / 10; sid.add(p.id); });
      const rps = P.filter(p => !sid.has(p.id)).sort((a, b) => this._runsP(b) - this._runsP(a)), IPs = [66, 66, 64, 62, 60, 56, 52, 46, 40, 30];
      rps.forEach((p, i) => { const u = U(p); if (!farm) p.role = 'RP'; u.GS = 0; u.G = Math.round((IPs[i] || 8) * 1.05); u.IP = IPs[i] || 8; u.ipgs = null; });
    }
    /* AI 팀의 1군 28명 자동 편성: 주전 9 + 백업 5(포수 2명 이상) + 선발 5 + 불펜 9 */
    autoActive(t, pool) {
      const S = this.S, inPool = p => !pool || pool.includes(p), H = this.hitters(t).filter(inPool), P = this.pitchers(t).filter(inPool), act = new Set();
      const lineup = this.bestLineup(H); lineup.forEach(x => act.add(x.id));
      const bench = H.filter(p => !act.has(p.id)).sort((a, b) => this._runsB(b, true) - this._runsB(a, true)); let nb = 0;
      const needC = 2 - H.filter(p => act.has(p.id) && p.pos === 'C').length;
      if (needC > 0) for (const c of bench.filter(p => p.pos === 'C').slice(0, needC)) { act.add(c.id); nb++; }
      for (const p of bench) { if (nb >= 5) break; if (!act.has(p.id)) { act.add(p.id); nb++; } }
      const spv = p => this._runsP(p) + 0.2 * (p.stamina - 50), spc = P.filter(p => p.role === 'SP' || p.stamina >= 52).sort((a, b) => spv(b) - spv(a)).slice(0, 5);
      if (spc.length < 5) { const have = new Set(spc.map(p => p.id)); spc.push(...P.filter(p => !have.has(p.id)).sort((a, b) => b.stamina - a.stamina).slice(0, 5 - spc.length)); }
      spc.forEach(p => act.add(p.id));
      const rps = P.filter(p => !act.has(p.id)).sort((a, b) => this._runsP(b) - this._runsP(a)).slice(0, Math.max(0, ACTIVE_MAX - act.size)); rps.forEach(p => act.add(p.id));
      if (act.size < ACTIVE_MAX) {   // 명단 풀이 모자라면 팀의 나머지 선수 중 가치가 높은 순으로 28명까지 채운다(투수 최소 13명)
        const rest = this.players(t).filter(p => !act.has(p.id)).sort((a, b) => this.marketValue(b) - this.marketValue(a));
        while (act.size < ACTIVE_MAX && rest.length) { const needP = [...act].filter(id => S.players[id].type === 'P').length < 13; const i = rest.findIndex(p => needP ? p.type === 'P' : true); const p = rest.splice(i < 0 ? 0 : i, 1)[0]; act.add(p.id); }
      }
      for (const p of this.players(t)) p.active = act.has(p.id);
      this._engDirty = true; this._f2dirty = true;
    }
    refreshTeam(t) { this.autoActive(t); this.assignUsage(t); this.assignUsage(t, true); this.invalidate(); }
    /* 1군 등록/말소(2군행). 말소하면 10경기일 동안 재등록 불가 */
    moveActive(id, on) {
      const S = this.S, p = S.players[id]; if (!p || p.team !== S.userTeam) return '선수를 찾을 수 없습니다.';
      const t = p.team, A = this.players(t).filter(x => x.active);
      if (!!on === !!p.active) return null;
      const locking = S.day < S.schedule.length;
      if (on) {
        if (A.length >= ACTIVE_MAX) return `1군 엔트리는 ${ACTIVE_MAX}명까지입니다. 먼저 한 명을 2군으로 내리세요.`;
        if (locking && S.day < (p.lockUntil || 0)) return `${p.ko}은(는) 2군 말소 후 10경기일이 지나야 1군에 등록할 수 있습니다. (${p.lockUntil - S.day}일 남음)`;
        p.active = true;
      } else {
        const same = A.filter(x => x.type === p.type).length;
        if (p.type === 'B' && same <= 10) return '1군에는 타자가 최소 10명 필요합니다.';
        if (p.type === 'P' && same <= 8) return '1군에는 투수가 최소 8명 필요합니다.';
        p.active = false; if (locking && S.phase !== 'preseason') p.lockUntil = S.day + 10;
      }
      this.invalidate(); this.repairSettings(t); return null;
    }
    /* 1군 선수 한 명을 내리고 2군 선수 한 명을 올린다(검사를 모두 통과해야 실행) */
    swapActive(upId, downId) {
      const S = this.S, up = S.players[upId], dn = S.players[downId]; if (!up || !dn || up.team !== S.userTeam || dn.team !== S.userTeam) return '선수를 찾을 수 없습니다.';
      if (up.active || !dn.active) return '1군/2군 상태가 바뀌었습니다.';
      if (this.S.day < S.schedule.length && S.day < (up.lockUntil || 0)) return `${up.ko}은(는) 10경기일 잠금 중입니다. (${up.lockUntil - S.day}일 남음)`;
      const prev = dn.lockUntil || 0, e1 = this.moveActive(downId, false); if (e1) return e1;
      const e2 = this.moveActive(upId, true); if (e2) { dn.active = true; dn.lockUntil = prev; this.invalidate(); this.repairSettings(S.userTeam); return e2; }
      return null;
    }
    lockLeft(p) { const S = this.S; return S.day < S.schedule.length ? Math.max(0, (p.lockUntil || 0) - S.day) : 0; }

    /* ------------------------------------------------------------ 엔진 */
    engine() {
      if (!this._eng || this._engDirty) { this.mergeTracking(); this._eng = Engine.createEngine(this._engData(false), 'g'); this._engDirty = false; }
      return this._eng;
    }
    engine2() {
      if (!this._eng2 || this._eng2Dirty || this._engDirty2()) { if (this._eng2) this.mergeTracking2(); if (this._f2dirty) { for (const t of this.farmTeams()) this.assignUsage(t, true); this._f2dirty = false; } this._eng2 = Engine.createEngine(this._engData(true), 'g'); this._eng2Dirty = false; }
      return this._eng2;
    }
    _engDirty2() { return this._f2dirty; }
    /* farm=false: 1군 엔트리 선수만, farm=true: 2군 선수만(사용량은 p.f) */
    _engData(farm) {
      const S = this.S, C = S.calib, batters = [], pitchers = [], defense = {}, fplayers = {}, catchers = {};
      for (const t of (farm ? this.farmTeams() : TEAMS)) {
        let list; if (farm) { const pl = this.farmPool(t); list = pl.H.concat(pl.P); } else list = this.players(t).filter(p => p.active);
        for (const p of list) {
          const id = p.id, u = farm ? (p.f || (p.f = {})) : p;
          if (p.type === 'B') {
            batters.push({ id, key: id, name: p.name, team: t, age: p.age, PA: u.PA, G: u.G, p: p.p, hand: p.bats || null });
            const gsE = farm ? u.aiGs : ((t !== S.userTeam && p.aiGs) || p.gs), d = {}; for (const k in gsE) d[k] = [0, gsE[k]]; defense[id] = d; const fr = {};
            for (const k in (p.fr || {})) if ((p.gs[k] || 0) >= FAM || k === p.pos) fr[k] = p.fr[k];
            for (const k in p.gs) { const g = p.gs[k]; if (g > 0 && g < FAM && k !== p.pos && PEN_R[k]) { const tt = 0.8 * g / FAM; fr[k] = { range: PEN_R[k] + (50 - PEN_R[k]) * tt, err_reg: C.fielding.lg.err[k] * (PEN_E[k] - (PEN_E[k] - 1) * tt) }; } }   // 경험이 조금 있는 포지션은 페널티를 경험만큼 줄인다
            fplayers[id] = fr;
            if (p.cs !== undefined && p.cs !== null) catchers[id] = { cs_reg: p.cs };
          } else pitchers.push({ id, name: p.name, team: t, age: p.age, GS: u.GS, G: u.G, IP: u.IP, ip_per_start: u.ipgs, p: p.p, stamina: p.stamina, hand: p.throws || null });
        }
      }
      return { modes: { g: { label: 'game', noStint: true, platoon: true, league_bat: C.lb, team_def: C.team_def, pf: C.pf, batters, pitchers } }, shared: { positions: {}, defense, fielding: { players: fplayers, catchers, team_avg_range: C.fielding.team_avg_range, lg: C.fielding.lg } } };
    }
    invalidate() { this._engDirty = true; this._f2dirty = true; }
    mergeTracking() {
      if (!this._eng) return; const tr = this._eng.tracking(), S = this.S.stats;
      for (const id in tr.bat) { const c = S.bat[id] || (S.bat[id] = {}); for (const k in tr.bat[id]) c[k] = (c[k] || 0) + tr.bat[id][k]; }
      for (const id in tr.pit) { const c = S.pit[id] || (S.pit[id] = {}); for (const k in tr.pit[id]) c[k] = (c[k] || 0) + tr.pit[id][k]; }
      this._eng.resetTracking();
    }

    mergeTracking2(day) {
      if (!this._eng2) return; const tr = this._eng2.tracking(), S = this.S.stats2, R = this.S.recent;
      for (const id in tr.bat) {
        const c = S.bat[id] || (S.bat[id] = {}), x = tr.bat[id]; for (const k in x) c[k] = (c[k] || 0) + x[k];
        if (day !== undefined && x.PA) { const h = x['1B'] + x['2B'] + x['3B'] + x.HR, ab = x.PA - x.BB - x.HBP - x.SF; (R[id] || (R[id] = [])).push([day, ab, h, x['1B'] + 2 * x['2B'] + 3 * x['3B'] + 4 * x.HR, x.BB + x.HBP, x.HR, x.PA]); if (R[id].length > 10) R[id].shift(); }
      }
      for (const id in tr.pit) {
        const c = S.pit[id] || (S.pit[id] = {}), x = tr.pit[id]; for (const k in x) c[k] = (c[k] || 0) + x[k];
        if (day !== undefined && x.BF) { (R[id] || (R[id] = [])).push([day, x.outs, x.R, x.K, x.BB + x.HBP, x.H, x.BF]); if (R[id].length > 10) R[id].shift(); }
      }
      this._eng2.resetTracking();
    }

    /* ------------------------------------------------------------ 시즌 시작 */
    newSeasonSetup(first) {
      const S = this.S;
      for (const p of Object.values(S.players)) p.lockUntil = 0;
      for (const t of TEAMS) { if (t !== S.userTeam) { const rp = first ? this.reg1Pool(t) : []; this.autoActive(t, rp.length >= ACTIVE_MAX ? rp : null); this.assignUsage(t); } }
      this.repairSettings(S.userTeam);
      S.day = 0; S.results = []; S.stats = { bat: {}, pit: {} }; S.stats2 = { bat: {}, pit: {} }; S.recent = {}; S.rec2 = {}; for (const t of this.farmTeams()) S.rec2[t] = [0, 0, 0, 0, 0]; S.post = null; S.phase = 'preseason';
      S.rec = {}; S.h2h = {}; for (const t of TEAMS) { S.rec[t] = [0, 0, 0, 0, 0]; S.h2h[t] = {}; for (const u of TEAMS) S.h2h[t][u] = [0, 0, 0]; }
      for (const id in S.players) { S.players[id].fat = 0; S.players[id].lastStart = -99; }
      S.schedule = this.makeSchedule(); S.pendingDay = null; S.userGameDone = {};
      this.invalidate();
    }
    makeSchedule(salt, teams) {
      const T = (teams || TEAMS).slice(); if (T.length % 2) T.push(null);   // 홀수 팀이면 경기 없는 날(부전) 슬롯 추가
      const r = rngFor(this.S.seed, this.S.year, salt || 777), n = T.length, rounds = [], cycles = Math.ceil(144 / (n - 1));
      for (let c = 0; c < cycles; c++) {
        const cyc = []; const arr = T.slice();   // 서클 방식 n-1라운드
        for (let k = 0; k < n - 1; k++) {
          const games = []; for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; if (a && b) games.push([a, b]); }
          cyc.push(games); arr.splice(1, 0, arr.pop());
        }
        // 한 주기 안의 라운드 순서를 섞어 변화를 준다
        for (let i = cyc.length - 1; i > 0; i--) { const j = r.randbelow(i + 1); [cyc[i], cyc[j]] = [cyc[j], cyc[i]]; }
        rounds.push(...cyc);
      }
      rounds.length = Math.min(rounds.length, 144);
      // 홈/원정 균형: 같은 매치업은 만날 때마다 홈 구장이 번갈아 간다
      const seen = {};
      for (const rd of rounds) for (const g of rd) { const key = [g[0], g[1]].sort().join('|'); seen[key] = (seen[key] || 0) + 1; if (seen[key] % 2 === 0) { const t = g[0]; g[0] = g[1]; g[1] = t; } }
      return rounds;
    }
    dateOf(day) { const d = new Date(Date.UTC(this.S.year, 2, 28)); let k = 0; while (k < day) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 1) k++; } return d; }
    dateStr(day) { const d = this.dateOf(day); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; }

    /* ------------------------------------------------------------ 순위 */
    standings() {
      const R = this.S.rec, H = this.S.h2h, pct = t => (R[t][0] + R[t][1]) ? R[t][0] / (R[t][0] + R[t][1]) : 0;
      const order = TEAMS.slice().sort((x, y) => {
        if (pct(y) !== pct(x)) return pct(y) - pct(x);
        const hx = H[x][y], sh = hx[0] + hx[1] ? hx[0] / (hx[0] + hx[1]) : 0.5; if (sh !== 0.5) return sh > 0.5 ? -1 : 1;
        const dx = R[x][3] - R[x][4], dy = R[y][3] - R[y][4]; if (dx !== dy) return dy - dx; return x < y ? -1 : 1;
      });
      return order.map((t, i) => ({ rank: i + 1, team: t, w: R[t][0], l: R[t][1], d: R[t][2], pct: pct(t), rs: R[t][3], ra: R[t][4] }));
    }
    farmSchedule() { const S = this.S; if (!this._sch2 || this._sch2.y !== S.year || this._sch2.s !== S.seed || this._sch2.n !== this.farmTeams().length) this._sch2 = { y: S.year, s: S.seed, n: this.farmTeams().length, v: this.makeSchedule(888, this.farmTeams()) }; return this._sch2.v; }
    standings2() {
      const R = this.S.rec2, pct = t => (R[t][0] + R[t][1]) ? R[t][0] / (R[t][0] + R[t][1]) : 0;
      return this.farmTeams().sort((x, y) => pct(y) - pct(x) || (R[y][3] - R[y][4]) - (R[x][3] - R[x][4]) || (x < y ? -1 : 1)).map((t, i) => ({ rank: i + 1, team: t, w: R[t][0], l: R[t][1], d: R[t][2], pct: pct(t), rs: R[t][3], ra: R[t][4] }));
    }
    /* FA 자격 연수: 1군 등록일수 누적(경기일 1일 = 달력 7/6일) */
    _tickService() { for (const t of TEAMS) for (const p of this.players(t)) if (p.active && p.fa) p.fa.regDays += 7 / 6; }
    /* 군 복무(상무) 선수 복귀: 전역 월이 되면 원소속 구단 2군으로 돌아온다. ym = 연*12+(월-1) */
    returnMilitary(ym) {
      const S = this.S, back = [];
      for (const id of (S.mil || []).slice()) {
        const p = S.players[id]; if (!p || p.retired) { S.mil = S.mil.filter(x => x !== id); continue; }
        if (p.milReturn > ym) continue;
        const t = p.milTeam; if (!(t in S.teams)) continue;
        p.team = t; p.active = false; p.lockUntil = 0; S.teams[t].ids.push(id); delete p.milTeam; delete p.milReturn; delete p.milFrom; S.mil = S.mil.filter(x => x !== id); back.push(p);
        if (t === S.userTeam) { S.news.unshift({ year: S.year, day: S.day, text: `${p.ko} 전역 — 2군으로 복귀` }); }
      }
      if (back.length) { for (const t of new Set(back.map(p => p.team))) { if (t !== S.userTeam) this.refreshTeam(t); } this.invalidate(); }
      return back;
    }
    milYM(day) { const d = this.dateOf(day); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
    /* 2군(퓨처스) 하루 경기: 모든 팀이 자동 진행 */
    playFutures(d) {
      const S = this.S, rd = this.farmSchedule()[d]; if (!rd) return; const E = this.engine2(), R = S.rec2;
      rd.forEach((g, i) => {
        const r = rngFor(S.seed, S.year, d, 9000 + i), [rh, ra] = E.game(g[0], g[1], 1 + d, 1 + d, r, E.newStats(), null);
        R[g[0]][3] += rh; R[g[0]][4] += ra; R[g[1]][3] += ra; R[g[1]][4] += rh;
        if (rh > ra) { R[g[0]][0]++; R[g[1]][1]++; } else if (ra > rh) { R[g[1]][0]++; R[g[0]][1]++; } else { R[g[0]][2]++; R[g[1]][2]++; }
      });
      this.mergeTracking2(d);
    }
    commit(home, away, rh, ra, meta) {
      const S = this.S, R = S.rec; R[home][3] += rh; R[home][4] += ra; R[away][3] += ra; R[away][4] += rh;
      if (rh > ra) { R[home][0]++; R[away][1]++; S.h2h[home][away][0]++; S.h2h[away][home][1]++; }
      else if (ra > rh) { R[away][0]++; R[home][1]++; S.h2h[away][home][0]++; S.h2h[home][away][1]++; }
      else { R[home][2]++; R[away][2]++; S.h2h[home][away][2]++; S.h2h[away][home][2]++; }
      S.results.push(Object.assign({ day: S.day, home, away, rh, ra }, meta || {}));
    }

    /* ------------------------------------------------------------ 진행 */
    userGameToday() { const S = this.S; if (S.phase !== 'regular' && S.phase !== 'preseason') return null; const rd = S.schedule[S.day]; if (!rd) return null; return rd.find(g => g[0] === S.userTeam || g[1] === S.userTeam) || null; }
    get seasonOver() { return this.S.day >= this.S.schedule.length; }
    /* 하루 진행. live=true 면 내 경기 직전에 멈춘다. 반환 {status:'ok'|'userGame'|'seasonEnd', ...} */
    playDay(live) {
      const S = this.S; if (S.day >= S.schedule.length) return { status: 'seasonEnd' };
      S.phase = 'regular'; const E = this.engine(), rd = S.schedule[S.day], d = S.day, others = [];
      let ug = null;
      rd.forEach((g, i) => {
        if (g[0] === S.userTeam || g[1] === S.userTeam) { ug = { g, i }; return; }
        const r = rngFor(S.seed, S.year, d, i), [rh, ra, info] = E.game(g[0], g[1], 1 + d, 1 + d, r, E.newStats(), null);
        others.push({ home: g[0], away: g[1], rh, ra, spH: info.spH, spA: info.spA });
      });
      this.mergeTracking();
      for (const o of others) this.commit(o.home, o.away, o.rh, o.ra, { spH: o.spH, spA: o.spA });
      this._decayFatigue(); this._tickService(); this.playFutures(d); this.returnMilitary(this.milYM(d));
      if (!ug) { S.day++; return { status: 'ok', day: d }; }
      if (live) { S.pendingDay = d; return { status: 'userGame', day: d, game: ug.g, idx: ug.i }; }
      const L = this.startUserGame(ug.g, ug.i); L.live.playToEnd(); const res = this.finishUserGame(L);
      return { status: 'ok', day: d, user: res };
    }
    /* N일 또는 시즌 끝까지. live 모드에서는 내 경기에서 멈춘다. */
    advance(days, live) {
      let n = 0; const out = [];
      while (n < days && this.S.day < this.S.schedule.length) { const r = this.playDay(live); out.push(r); n++; if (r.status === 'userGame') return { status: 'userGame', ...r, played: n - 1 }; }
      if (this.S.day >= this.S.schedule.length) { this.S.phase = 'regular_done'; return { status: 'seasonEnd', played: n }; }
      return { status: 'ok', played: n };
    }

    /* ------------------------------------------------------------ 내 경기 */
    _fatigueOk(p) { return (p.fat || 0) < 35; }
    _decayFatigue() { for (const p of this.players(this.S.userTeam)) if (p.type === 'P') p.fat = Math.max(0, (p.fat || 0) - 8); }
    /* 내 경기 준비: 결장 선수, 선발 투수, 라인업 */
    prepareUserGame(g, idx) {
      const S = this.S, t = S.userTeam, set = S.teams[t].set, d = S.day, r = rngFor(S.seed, S.year, d, 4000 + idx);
      this.repairSettings(t);
      const H = this.hitters(t, true), inLine = new Set(set.lineup.map(x => x.id)), spec = set.lineup.map(x => ({ ...x })), absent = [];
      spec.forEach((x, i) => {
        if (r.random() < 0.05) {   // 컨디션 난조 등으로 결장(다른 팀의 출전 확률과 비슷한 수준의 변동)
          const pool = H.filter(h => !inLine.has(h.id) && !spec.some(s => s.id === h.id)); if (!pool.length) return;
          const pl = pool.sort((a, b) => (this._runsB(b, true) + this.defRuns(b, x.pos) - this.fitPenalty(b, x.pos)) - (this._runsB(a, true) + this.defRuns(a, x.pos) - this.fitPenalty(a, x.pos)))[0];
          absent.push({ out: S.players[x.id], in: pl, pos: x.pos }); spec[i] = { id: pl.id, pos: x.pos };
        }
      });
      // 선발: 로테이션 순서, 4일 이상 쉬지 못한 투수는 다음 투수로
      let sp = null, tried = 0, ri = set.rotIdx % set.rotation.length;
      while (tried < set.rotation.length) { const p = S.players[set.rotation[ri]]; if (d - p.lastStart >= 4) { sp = p; break; } ri = (ri + 1) % set.rotation.length; tried++; }
      if (!sp) sp = S.players[set.rotation[set.rotIdx % set.rotation.length]];
      return { spec, absent, sp, rotIdx: ri };
    }
    startUserGame(g, idx) {
      const S = this.S, E = this.engine(), t = S.userTeam, home = g[0], away = g[1], userSide = home === t ? 'home' : 'away', oppSide = userSide === 'home' ? 'away' : 'home';
      const prep = this.prepareUserGame(g, idx), r = rngFor(S.seed, S.year, S.day, idx), d = S.day, opp = userSide === 'home' ? away : home;
      const ul = E.makeLineup(prep.spec), ol = E.lineup(opp, 1 + d, r, false);
      const userStaff = new E.StaffState(this.pitchers(t, true).map(p => E.pitById[p.id]), r, E.pitById[prep.sp.id]);
      const oppStaff = new E.StaffState(E.staff(opp, 1 + d), r, null);
      const lineups = {}, staff = {}, penal = {}; lineups[userSide] = ul; lineups[oppSide] = { L: ol[0], assign: ol[1] }; staff[userSide] = userStaff; staff[oppSide] = oppStaff; penal[userSide] = true;
      const ctx = { auto: true, userSide, league: this, prep, g, idx };
      const live = new E.LiveGame({ home, away, lineups, staff, rng: r, maxInn: 11, penal, fatigue: true, hook: { [userSide]: (game, ss) => { ss.o += 3; } } });
      live.pre = { [userSide]: (game, ss) => this._autoBullpen(game, ss, userSide, ctx) };
      ctx.live = live; ctx.E = E; return ctx;
    }
    /* 내 팀 자동 불펜 운용: 하프 이닝 시작 전에 호출(ctx.auto 가 꺼져 있으면 건너뜀) */
    _autoBullpen(game, ss, side, ctx) {
      if (!ctx.auto) return;
      const S = this.S, E = ctx.E, set = S.teams[S.userTeam].set, bp = set.bullpen, opp = side === 'home' ? 'away' : 'home';
      const cur = ss.cur, sp = ss.sp; let change = false;
      const fat = game.pitchFatigue(side); if (cur === sp) { if (ss.o >= ss.sp_outs || ss.runs >= 6 || fat.over >= 3) change = true; } else change = true;
      if (!change) return;
      const inn = game.inning, lead = game.score[side] - game.score[opp], used = ss.used;
      const roster = id => { const p = S.players[id]; return p && p.active ? E.pitById[id] : null; };
      const avail = id => { const b = roster(id); return b && !used.has(b.name) && this._fatigueOk(S.players[id]) ? b : null; };
      let order;
      const close = inn >= 9 && ((lead > 0 && lead <= 3) || (lead === 0 && side === 'home')), setup = (inn === 8 && lead > 0 && lead <= 3) || (inn === 7 && lead > 0 && lead <= 2), mop = lead <= -4 || (cur === sp && inn <= 5);
      if (close) order = [bp.closer, ...bp.setup, ...bp.middle, ...bp.long];
      else if (setup) order = [...bp.setup, ...bp.middle, bp.closer, ...bp.long];
      else if (mop) order = [...bp.long, ...bp.middle, ...bp.setup];
      else order = [...bp.middle, ...bp.long, ...bp.setup];
      let next = null; for (const id of order) { if (!id) continue; const b = avail(id); if (b) { next = b; break; } }
      if (!next) { const rest = this.pitchers(S.userTeam, true).filter(p => !set.rotation.includes(p.id) || p.id === sp.id).map(p => E.pitById[p.id]).filter(b => b && !used.has(b.name)).sort((a, b) => S.players[a.id].fat - S.players[b.id].fat); next = rest[0] || null; }
      if (next) { ss.cur = next; used.add(next.name); ss.o = 0; game.log.push({ k: 'PC', side, p: next, auto: true }); }
    }
    finishUserGame(ctx) {
      const S = this.S, live = ctx.live, t = S.userTeam, d = S.day;
      const rh = live.score.home, ra = live.score.away, E = ctx.E;
      // 투수 피로·선발 기록
      const tr = E.tracking().pit;
      for (const p of this.pitchers(t)) { const c = tr[p.id]; if (c && c.outs > 0) p.fat = (p.fat || 0) + 5 + 5 * c.outs; }   // 1이닝(3아웃) = 20, 3일 연투하면 휴식 필요
      for (const x of ctx.prep.spec) { const q = S.players[x.id]; if (q) this.learnPosition(q, x.pos); }
      const sp = ctx.prep.sp; sp.lastStart = d; const set = S.teams[t].set; set.rotIdx = (ctx.prep.rotIdx + 1) % set.rotation.length;
      this.mergeTracking();
      this.commit(live.home, live.away, rh, ra, { user: true, inns: live.inns, spH: live.staff.home.sp.name, spA: live.staff.away.sp.name, subs: { home: live.subs.home.length, away: live.subs.away.length } });
      S.pendingDay = null; S.day++; if (S.day >= S.schedule.length) S.phase = 'regular_done';
      return { home: live.home, away: live.away, rh, ra, win: (live.home === t ? rh > ra : ra > rh), tie: rh === ra, inns: live.inns };
    }

    /* ------------------------------------------------------------ 포스트시즌 */
    startPostseason() {
      const S = this.S, st = this.standings(), seeds = st.slice(0, 5).map(x => x.team), T = i => seeds[i];
      S.post = { seeds, rounds: [], cur: null, stage: 0, done: false, champion: null };
      S.phase = 'post'; this._mkSeries(0); this.invalidate(); return S.post;
    }
    _mkSeries(stage) {
      const P = this.S.post, T = i => P.seeds[i];
      const defs = [
        () => ({ name: '와일드카드 결정전', hi: T(3), lo: T(4), need: 2, wc: true, pattern: ['H', 'H'] }),
        () => ({ name: '준플레이오프', hi: T(2), lo: P.rounds[0].winner, need: 3, pattern: ['H', 'H', 'L', 'L', 'H'] }),
        () => ({ name: '플레이오프', hi: T(1), lo: P.rounds[1].winner, need: 3, pattern: ['H', 'H', 'L', 'L', 'H'] }),
        () => ({ name: '한국시리즈', hi: T(0), lo: P.rounds[2].winner, need: 4, pattern: ['H', 'H', 'L', 'L', 'L', 'H', 'H'] })];
      const s = defs[stage](); s.games = []; s.w = { [s.hi]: 0, [s.lo]: 0 }; s.slot = 0; s.winner = null; s.sp = { [s.hi]: 0, [s.lo]: 0 }; s.hiAdv = false; s.loWins = 0;
      P.cur = s; P.stage = stage; P.rounds[stage] = s;
    }
    postNextGame() {
      const P = this.S.post; if (!P || P.done) return null; const s = P.cur;
      if (s.wc) { if (s.games.length >= 2 || s.hiAdv) return null; return { home: s.hi, away: s.lo }; }
      const hiHome = s.pattern[s.slot % s.pattern.length] === 'H'; return { home: hiHome ? s.hi : s.lo, away: hiHome ? s.lo : s.hi };
    }
    _postStarter(team, s) {
      const S = this.S;
      if (team === S.userTeam) { const set = S.teams[team].set, list = set.rotation.map(id => S.players[id]); return list[s.sp[team]++ % Math.min(4, list.length)]; }
      const sp = this.pitchers(team).filter(p => p.GS > 0).sort((a, b) => b.GS * b.ipgs - a.GS * a.ipgs).slice(0, 4); return sp[s.sp[team]++ % sp.length];
    }
    /* 포스트시즌 한 경기 결과 반영. 반환: 시리즈가 끝났으면 true */
    postRecord(home, away, rh, ra, info) {
      const P = this.S.post, s = P.cur, g = { home, away, rh, ra, inns: info.inns, spH: info.spH, spA: info.spA };
      if (rh === ra) g.draw = true; s.games.push(g);
      if (s.wc) {
        if (!g.draw) { if (rh > ra ? home === s.hi : away === s.hi) s.hiAdv = true; else s.loWins++; }
        if (s.hiAdv || s.games.length >= 2) { s.winner = (s.hiAdv || s.loWins < 2) ? s.hi : s.lo; s.w = { [s.hi]: 1 + s.games.filter(x => !x.draw && (x.rh > x.ra ? x.home === s.hi : x.away === s.hi)).length, [s.lo]: s.loWins }; return this._endSeries(); }
        return false;
      }
      if (!g.draw) { const w = rh > ra ? home : away; s.w[w]++; s.slot++; }
      if (s.w[s.hi] >= s.need || s.w[s.lo] >= s.need) { s.winner = s.w[s.hi] >= s.need ? s.hi : s.lo; return this._endSeries(); }
      return false;
    }
    _endSeries() {
      const P = this.S.post, s = P.cur;
      if (P.stage === 3) { P.done = true; P.champion = s.winner; P.runnerUp = s.winner === s.hi ? s.lo : s.hi; this.S.phase = 'post_done'; return true; }
      this._mkSeries(P.stage + 1); return true;
    }
    /* AI 대 AI 포스트시즌 경기 1회 */
    simPostGame() {
      const S = this.S, E = this.engine(), g = this.postNextGame(); if (!g) return null; const s = S.post.cur;
      const spH = E.pitById[this._postStarter(g.home, s).id], spA = E.pitById[this._postStarter(g.away, s).id];
      const r = rngFor(S.seed, S.year, 500 + S.post.stage, s.games.length + 1);
      const [rh, ra, info] = E.game(g.home, g.away, 144, 144, r, E.newStats(), { maxInn: 15, post: true, spH, spA });
      this.mergeTracking(); const ended = this.postRecord(g.home, g.away, rh, ra, info); return { home: g.home, away: g.away, rh, ra, ended, round: s.name, winner: s.winner, w: Object.assign({}, s.w) };
    }
    /* 포스트시즌에서 내 경기를 직접 지휘할 때 */
    startUserPostGame() {
      const S = this.S, E = this.engine(), t = S.userTeam, g = this.postNextGame(), s = S.post.cur;
      const userSide = g.home === t ? 'home' : 'away', oppSide = userSide === 'home' ? 'away' : 'home', opp = userSide === 'home' ? g.away : g.home;
      const set = S.teams[t].set; this.repairSettings(t);
      const r = rngFor(S.seed, S.year, 500 + S.post.stage, 50 + s.games.length + 1);
      const spec = set.lineup.map(x => ({ ...x }));
      const ul = E.makeLineup(spec), ol = E.lineup(opp, 144, r, true);
      const sp = this._postStarter(t, s), oppSp = E.pitById[this._postStarter(opp, s).id];
      const userStaff = new E.StaffState(this.pitchers(t, true).map(p => E.pitById[p.id]), r, E.pitById[sp.id]);
      const oppStaff = new E.StaffState(E.staff(opp, 144), r, oppSp);
      const lineups = {}, staff = {}, penal = {}; lineups[userSide] = ul; lineups[oppSide] = { L: ol[0], assign: ol[1] }; staff[userSide] = userStaff; staff[oppSide] = oppStaff; penal[userSide] = true;
      const ctx = { auto: true, userSide, league: this, prep: { spec, absent: [], sp, rotIdx: 0 }, post: true, E };
      const live = new E.LiveGame({ home: g.home, away: g.away, lineups, staff, rng: r, maxInn: 15, penal, fatigue: true, hook: { [userSide]: (game, ss) => { ss.o += 3; } } });
      live.pre = { [userSide]: (game, ss) => this._autoBullpen(game, ss, userSide, ctx) };
      ctx.live = live; return ctx;
    }
    finishUserPostGame(ctx) {
      const live = ctx.live, s = this.S.post.cur; this.mergeTracking();
      const ended = this.postRecord(live.home, live.away, live.score.home, live.score.away, { inns: live.inns, spH: live.staff.home.sp.name, spA: live.staff.away.sp.name });
      return { home: live.home, away: live.away, rh: live.score.home, ra: live.score.away, ended, round: s.name, winner: s.winner, w: Object.assign({}, s.w), inns: live.inns };
    }
    userInPost() { const P = this.S.post; if (!P || P.done) return false; const g = this.postNextGame(); return !!g && (g.home === this.S.userTeam || g.away === this.S.userTeam); }
  }

  return { League, KO, POSS, ORDER, ACTIVE_MAX, ROSTER_MAX, ROSTER_MIN, rngFor, clamp };
});
