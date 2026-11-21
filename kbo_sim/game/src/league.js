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
        p.contract = { salary: Math.round(L.price(p) * clamp(1 + gauss(r, 0, 0.12), 0.7, 1.4) * 10) / 10, years: 1 };
        p.contract.salary = Math.max(0.3, p.contract.salary);
      }
      L._calibrateSalaries();   // 2026 연봉 데이터가 있으면 실제 연봉 사용, 없으면 모델 연봉을 실제 규모로 환산
      S.cbt = { over: {}, under: {}, drop: {}, fees: {}, log: [] };
      S.awardsReal = base.awards || [];   // 실제 KBO 신인왕·골든글러브 2020~2025
      S.schoolHome = base.schoolHome || {};   // 고교 → 연고 구단(구단 충성도의 연고 출신 판정)
      L._f27 = base.foreign2027 || [];
      L._faclass = base.faclass2027 || [];
      if (L._initFARules) L._initFARules();   // FA 자격 연수·등급 기준 연봉·외국인 슬롯 초기화
      if (L._applyFAClass) L._applyFAClass(L._faclass);   // 2027 FA 승인 선수: 미계약 20명은 시장에서 시작
      if (L._addDraftClass) L._addDraftClass(base.draft2027);   // 2027 신인 드래프트 지명 결과(실제 지명·가상 능력치)
      for (const t of TEAMS) L.initTeam(t);
      if (L._initFinance) L._initFinance(base.finance);   // 재정: 초기 보수 합계로 운영비를 역산
      L._liftMinSal();   // 2027년부터 최저연봉 3,300만원(규약 제71조): 운영비 역산 뒤에 올려 증가분이 손익에 그대로 반영되게 한다
      if (L._initCoaches) L._initCoaches(base.coaches || []);
      if (L.openFAMarket) L.openFAMarket();   // 2027 FA 협상 기간: 1월 1일 시작   // 코칭스태프(보도 기반 일부 + 가상)
      S.calib.base = L.talentLevel(undefined, true);
      L.newSeasonSetup(true);
      if (L._setGoals) L._setGoals();
      if (L._clubStory) L._clubStory();   // 첫 시즌 개막 소식(구단 이야기)
      if (L._markRookies) L._markRookies();
      if (L.ensureProspects) L.ensureProspects();   // 첫 시즌의 드래프트 후보 풀(스카우팅 대상). 다른 선수 id에 영향이 없도록 가장 마지막에 만든다
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
        if (p.ct) { const c = p.contract; if (p.ct.years) c.years = p.ct.years; for (const k of ['total', 'bonus', 'from', 'end', 'opt', 'est']) if (p.ct[k] !== null && p.ct[k] !== undefined) c[k] = p.ct[k]; if (p.ct.cbt !== undefined) c.cbt = p.ct.cbt; if (c.bonus > 0 && c.from && c.end >= c.from) { c.yrs0 = c.end - c.from + 1; c.amort = Math.round(c.bonus / c.yrs0 * 100) / 100; } if (p.ct.salary) { c.salary = p.ct.salary; p.sal = p.ct.salary; } }
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
      if (!S.coach && L._ensureCoach) L._ensureCoach();   // 예전 저장: 가상 코칭스태프 생성
      L._legacyFin = !S.fin;   // 예전 저장: 재정 데이터 없음(데이터 파일이 필요해 복원하지 않음)
      for (const id in S.players) { const p = S.players[id]; if (p.foreign === undefined) p.foreign = !/[가-힣]/.test(p.ko || ''); }
      return L; }
    save() { return JSON.stringify(this.S); }
    static load(str) { return League.fromJSON(JSON.parse(str)); }

    /* ------------------------------------------------------------ 리그 평균 실력 수준(기준선 보정용) */
    talentLevel(shift, withFA) {   /* withFA: 시장에 나간 FA 승인 선수를 원소속 팀에 포함(시작 시점 기준선용) */
      const sh = shift || { B: 0, P: 0 }, out = { B: [], SP: [], RP: [] };
      for (const t of TEAMS) {
        const ex = withFA && this.faList ? this.faList().filter(p => !p.foreign && p.faInfo && p.faInfo.from === t) : [], H = this.hitters(t).concat(ex.filter(p => p.type === 'B')), lu = this.bestLineup(H);
        for (const x of lu) out.B.push(this._runsBS(this.S.players[x.id], sh.B));
        const P = this.pitchers(t).concat(ex.filter(p => p.type === 'P')).sort((a, b) => this._runsPS(b, sh.P) - this._runsPS(a, sh.P)), sp = P.filter(p => p.role === 'SP' || p.stamina >= 52).slice(0, 5), spi = new Set(sp.map(p => p.id));
        sp.forEach(p => out.SP.push(this._runsPS(p, sh.P))); P.filter(p => !spi.has(p.id)).slice(0, 8).forEach(p => out.RP.push(this._runsPS(p, sh.P)));
      }
      const m = a => a.reduce((x, y) => x + y, 0) / a.length;
      return { B: m(out.B), P: 0.65 * m(out.SP) + 0.35 * m(out.RP) };
    }
    /* 컨디션(분위기)·운영 방침: 내 팀 선수의 경기 능력치에 반영(엔진 입력만 바꾸므로 시뮬레이션 규칙은 그대로).
       mood: 선수 개별(-3~+3, 기한 있음) + 팀 분위기. 1단계 ≈ OVR 0.55 */
    moodOf(p) { const S = this.S, m = p.mood && S.day < p.mood.until ? p.mood.v : 0, tm = S.teamMood && S.day < S.teamMood.until && p.team === S.userTeam ? S.teamMood.v : 0, cb = p.team === S.userTeam && this.capBonus ? this.capBonus() : 0, cl = p.team === S.userTeam && /^post/.test(S.phase) && this.traitOf && this.traitOf(p) === 'clutch' ? 1 : 0; return clamp(m + tm + cb + cl, -4, 4); }
    policy() { const P = this.S.policy || {}; return { pitch: P.pitch || 'normal', run: P.run || 'normal' }; }
    setPolicy(k, v) { const ok = { pitch: ['save', 'normal', 'push'], run: ['low', 'normal', 'high'] }; if (!ok[k] || !ok[k].includes(v)) return false; this.S.policy = Object.assign({ pitch: 'normal', run: 'normal' }, this.S.policy, { [k]: v }); this.invalidate(); return true; }
    _modRates(p) {
      const S = this.S; if (p.team !== S.userTeam) return p.p; const m = this.moodOf(p), pol = this.policy(); let q = m ? this._shifted(p, 0.04 * m) : p.p;
      if (p.type === 'B' && pol.run !== 'normal') q = Object.assign({}, q, { sba: q.sba * (pol.run === 'high' ? 1.5 : 0.6) });
      return q;
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
    /* 재정 성장 가정(사용자 제공 실측·프록시, ⚠ 중간값 가정): 객단가 연 +5.75%(잠실 2028~2031 +2.75%, 2032 돔 개장 +30%), 모기업 광고 +2.5%, MD·기타 (1+관중 증가율)×(1+1.3×객단가 인상률)−1,
     * 비용 쪽 운영비 +5%, 시장 연봉 +5%(2028년부터; 경쟁균형세 상한 증액 5%와 같은 속도). S.econ 으로 조정·끄기(on:false = 이전과 동일). */
    econ() { return Object.assign({ on: true, price: 0.0575, priceJam: 0.0275, jamJump: 0.30, par: 0.025, cost: 0.05, sal: 0.05, mdK: 1.3 }, this.S.econ || {}); }
    salInfl() { const E = this.econ(); if (!E.on) return 1; const y = this.S.phase === 'offseason' ? this.S.year + 1 : this.S.year; return Math.pow(1 + E.sal, Math.max(0, y - 2027)); }   // 시장 연봉 물가(오프시즌에는 다음 시즌 기준)
    /* 최저연봉(규약 제71조): 2027년부터 3,300만원(육성선수 제외). 2026년 이전은 3,000만원 */
    minSal(y) { y = y === undefined ? this.S.year : y; return y >= 2027 ? 0.33 : 0.3; }
    _liftMinSal() { const S = this.S, m = this.minSal(); S.minLift = {}; for (const t of TEAMS) { let d = 0; for (const p of this.players(t)) if (p.contract && p.contract.salary > 0 && p.contract.salary < m) { d += m - p.contract.salary; p.contract.salary = m; } S.minLift[t] = Math.round(d * 100) / 100; } }   // minLift: 구단별 증가분(억, 기록용)
    price(p) { return Math.round((0.3 + 0.9 * Math.pow(this.war(p), 1.35) * (this.S.calib.salK || 1) * this.salInfl()) * 10) / 10; }   // 최저연봉 0.3억 + 가치분(실제 KBO 연봉 규모로 환산)
    /* 시장 가치(억 원 환산): 나이·잠재력 반영 */
    marketValue(p) {
      let v = this.price(p); const a = p.age;
      if (a <= 24) v *= 1 + 0.18 * (25 - a) / 3 + 0.35 * (p.pot || 0); else if (a >= 33) v *= Math.max(0.35, 1 - 0.12 * (a - 32));
      if (this.isInj(p)) v *= Math.max(0.35, 1 - this.injLeft(p) / 400);   // 장기 부상자는 가치 할인(복귀까지 400일이면 최대 65%)
      return Math.max(0.2, Math.round(v * 10) / 10);
    }
    /* ---- 경쟁균형세(샐러리캡): KBO 규정 ----
     * 산정: 연봉 상위 40명 합계(신인·외국인 제외). 상한 2027년 151.1709억, 2028년 158.7294억(+5%), 이후 동결 가정.
     * 하한 2027년부터 60.6538억(2028년 +5%). 초과: 1회 30%·2회 연속 50%·3회 연속 100%를 야구발전기금으로 납부(3회 연속이면 1라운드 지명 9단계 하락).
     * 미달: 1회 30%·2회 연속 50%·3회 연속 100%. */
    /* 상한: KBO 공식 2025 137.1165억 → 2026 143.9723 → 2027 151.1709 → 2028 158.7294(매년 +5%). 2029년 이후는 합의 없음 → 인상률 가정(S.cbt.growth, 기본 5%).
     * 하한: 2027 60.6538억부터 매년 +5%(공식 2028까지), 이후는 상한과 같은 인상률 가정. */
    capGrowth() { const g = this.S.cbt && this.S.cbt.growth; return g === undefined ? 0.05 : g; }
    cbtCap(y) { y = y === undefined ? this.S.year : y; if (y <= 2025) return 137.1165; if (y === 2026) return 143.9723; return Math.round(151.1709 * Math.pow(1.05, clamp(y - 2027, 0, 1)) * Math.pow(1 + this.capGrowth(), Math.max(0, y - 2028)) * 10000) / 10000; }
    cbtFloor(y) { y = y === undefined ? this.S.year : y; return y < 2027 ? null : Math.round(60.6538 * Math.pow(1.05, clamp(y - 2027, 0, 1)) * Math.pow(1 + this.capGrowth(), Math.max(0, y - 2028)) * 10000) / 10000; }
    /* 경쟁균형세 산정 보수: FA 다년계약은 (보장 총액/보장 연수), 그 외는 연봉 */
    cbtVal(p) { return p.contract.cbt !== undefined ? p.contract.cbt : p.contract.salary; }
    /* 래리 버드 룰(KBO판, 2027~): 구단이 매년 7시즌 이상 소속(등록)한 선수 1명을 예외 선수로 지정하면 그 선수 보수(계약금·옵션 포함)의 50%를 상위 40명 합계에서 제외 */
    excEligible(p, t) { return !!p && !p.foreign && p.team === (t || p.team) && (p.tnTeam === p.team ? p.tn || 0 : 0) >= 7 && p.rookie !== this.S.year; }
    cbtExc(t) {
      const S = this.S; if (S.year < 2027 && !S.cbt) return null; S.cbt = S.cbt || { over: {}, under: {}, drop: {}, fees: {}, log: [] }; const c = S.cbt; c.exc = c.exc || {};
      const cur = c.exc[t] && S.players[c.exc[t]]; if (cur && this.excEligible(cur, t)) return cur;
      let best = null; for (const p of this.players(t)) if (this.excEligible(p, t) && (!best || this.cbtVal(p) > this.cbtVal(best))) best = p;
      c.exc[t] = best ? best.id : null; return best;   // 지정이 없거나 무효(이적·은퇴·자격 상실)이면 자동 지정(가장 보수가 큰 자격자)
    }
    setCbtExc(id) { const S = this.S, p = S.players[id], t = S.userTeam; if (!p || p.team !== t) return '우리 팀 선수가 아닙니다.'; if (!this.excEligible(p, t)) return `${p.ko}은(는) 예외 선수 자격이 없습니다(우리 구단 7시즌 이상 등록 필요).`; S.cbt.exc = S.cbt.exc || {}; S.cbt.exc[t] = id; S.cbt.excManual = S.cbt.excManual || {}; S.cbt.excManual[t] = true; this.invalidate(); return null; }
    cbtPay(t, next) { const y = this.S.year + (next ? 1 : 0), exc = this.S.year >= 2027 || next ? this.cbtExc(t) : null, eid = exc ? exc.id : null; return Math.round(this.players(t).filter(p => p.rookie !== y && !p.foreign).map(p => this.cbtVal(p) * (p.id === eid ? 0.5 : 1)).sort((a, b) => b - a).slice(0, 40).reduce((a, b) => a + b, 0) * (this.S.calib.cbtK || 1) * 100) / 100; }
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
      const pool = this.startPool(t);
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
    /* 시작 1군 후보: 2026.10 등록 명단 + 명단에 없지만 능력이 명단 선수 상위 25% 이상인 건강한 선수(예: 한화 류현진·채은성). 확대 엔트리 시점의 등록 여부만으로 주전급이 2군에 남지 않게 한다 */
    startPool(t) {
      const reg = this.reg1Pool(t); if (reg.length < ACTIVE_MAX) return reg;
      const ov = reg.map(p => this.ovr(p)).sort((a, b) => a - b), med = ov[Math.floor(ov.length * 0.75)];
      const extra = this.players(t).filter(p => !p.reg1 && !p.rookie && !p.foreign && !this.isInj(p) && p.team !== 'MIL' && this.ovr(p) >= med);
      for (const p of extra) p.reg1 = true;
      return reg.concat(extra);
    }
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
    /* 설정 점검: 내 팀은 **무효가 된 칸만 최소 교체**하고(부상·2군행·방출), 나머지 라인업·타순·로테이션·불펜은 그대로 둔다. 교체가 있으면 소식에 남긴다.
       빈 칸을 채울 후보가 없을 때만 전체 자동 편성으로 되돌린다. AI 팀은 기존처럼 자동 */
    repairSettings(t) {
      const S = this.S, T = S.teams[t], set = T.set, ids = new Set(T.ids), act = id => ids.has(id) && S.players[id].active && !this.isInj(S.players[id]), user = t === S.userTeam, say = x => { if (user) S.news.unshift({ year: S.year, day: S.day, text: x }); };
      const nm = id => (S.players[id] ? S.players[id].ko : '선수');
      // 라인업: 무효 칸만 교체(같은 수비 위치를 소화하는 건강한 1군 타자 중 가치가 가장 높은 선수), 타순 유지
      const okL = set.lineup.length === 9 && set.lineup.every(x => S.players[x.id] && S.players[x.id].type === 'B') && new Set(set.lineup.map(x => x.id)).size === 9;
      if (user && okL && set.lineup.some(x => !act(x.id))) {
        const inL = new Set(set.lineup.map(x => x.id)), bench = this.hitters(t, true).filter(p => !inL.has(p.id) && !this.isInj(p)), fixed = []; let noCand = false;
        for (const x of set.lineup) { if (act(x.id)) continue; const val = q => this._runsB(q, true) + ((q.gs && q.gs[x.pos]) >= 40 ? 6 : 0) + (q.pos === x.pos ? 3 : 0), el = bench.filter(q => x.pos === 'DH' || (q.gs && q.gs[x.pos] >= 20) || q.pos === x.pos), c = (el.length ? el : bench).sort((a, b) => val(b) - val(a))[0] || null;   // 해당 위치 소화 가능 선수 우선, 없으면 가장 가치 높은 벤치 타자
          if (!c) { noCand = true; break; } bench.splice(bench.indexOf(c), 1); fixed.push([x, c]); }
        if (!noCand) { for (const [x, c] of fixed) { say(`라인업 자동 보정: ${nm(x.id)}(${x.pos}) 자리 → ${c.ko}`); x.id = c.id; } } else { set.lineup = this.bestLineup(this.hitters(t, true)); say('라인업을 대체할 선수가 없어 전체를 자동 편성했습니다.'); }
      } else if (!okL || (!user && set.lineup.some(x => !act(x.id)))) set.lineup = this.bestLineup(this.hitters(t, true));
      // 로테이션: 무효 선수만 제거하고 빈 칸은 불펜 비주전·남는 투수 중 선발 능력이 가장 높은 선수로 채움(순서·rotIdx 유지)
      const before = set.rotation.slice();
      set.rotation = set.rotation.filter(id => act(id));
      if (set.rotation.length < 5) {
        if (user) { const b0 = set.bullpen || {}, locked = new Set([b0.closer].concat(b0.setup || [])), inR = new Set(set.rotation), pool = this.pitchers(t, true).filter(p => !inR.has(p.id) && !this.isInj(p) && !locked.has(p.id)).sort((a, b) => (b.role === 'SP') - (a.role === 'SP') || b.stamina - a.stamina || this._runsP(b) - this._runsP(a));
          while (set.rotation.length < 5 && pool.length) { const c = pool.shift(); set.rotation.push(c.id); }
          const gone = before.filter(id => !set.rotation.includes(id)); if (gone.length) say(`로테이션 자동 보정: ${gone.map(nm).join(', ')} 제외 → ${set.rotation.filter(id => !before.includes(id)).map(nm).join(', ') || '대체 없음'}`);
          if (set.rotation.length < 5) this.autoSettings(t, 'rotation'); }
        else this.autoSettings(t, 'rotation');
      }
      if (set.rotIdx >= set.rotation.length) set.rotIdx = 0;
      const b = set.bullpen, used = new Set(set.rotation);
      const clean = a => a.filter(id => act(id) && !used.has(id) && used.add(id));
      const cl = b.closer && act(b.closer) && !used.has(b.closer) ? b.closer : null; if (cl) used.add(cl);
      set.bullpen = { closer: cl, setup: clean(b.setup), middle: clean(b.middle), long: clean(b.long) };
      const rest = this.pitchers(t, true).filter(p => !used.has(p.id) && !this.isInj(p)).sort((a, b) => this._runsP(b) - this._runsP(a));
      if (!set.bullpen.closer && rest.length) { const c = rest.shift(); set.bullpen.closer = c.id; if (user) say(`마무리 자동 지정: ${c.ko}`); }
      if (!set.bullpen.closer) { const bp = set.bullpen, c = bp.setup.shift() || bp.middle.shift() || bp.long.shift(); if (c) { bp.closer = c; if (user) say(`마무리 자동 지정: ${nm(c)}`); } }   // 불펜이 얇아도 마무리 칸은 비우지 않는다
      while (set.bullpen.setup.length < 2 && rest.length) set.bullpen.setup.push(rest.shift().id);
      for (const p of rest) set.bullpen.middle.push(p.id);
    }
    /* 리그 규정 제14조: 현역선수 등록 29명, 9월 1일 이후 정규시즌 막바지에는 5명을 추가해 34명(확대 엔트리). 포스트시즌은 다시 29명으로 둔다(실제 30명·출장 28명은 별도 확인 필요) */
    _lnews(text) { if (this._news) this._news(text); else { const S = this.S; S.news.unshift({ year: S.year, day: S.day, text }); if (S.news.length > 120) S.news.length = 120; } }   // 모듈 로드 순서와 무관하게 소식 기록
    activeMax() { const S = this.S; if (S.phase === 'regular' && S.schedule && S.day < S.schedule.length && this.todayN() >= Date.UTC(S.year, 8, 1) / 864e5) return ACTIVE_MAX + 5; return ACTIVE_MAX; }
    _trimActive(t) {   // 엔트리가 한도를 넘으면 주전·선발 등 핵심을 제외하고 가치가 낮은 순으로 2군에 내린다(경기일 잠금 없음)
      const S = this.S, max = this.activeMax(), set = S.teams[t].set; let A = this.players(t).filter(x => x.active); if (A.length <= max) return 0;
      const core = new Set([...(set.lineup || []).map(x => x.id || x), ...(set.rotation || []).slice(0, 5), set.bullpen && set.bullpen.closer].filter(Boolean)); let n = 0;
      const cand = A.filter(x => !core.has(x.id)).sort((a, b) => this.marketValue(a) - this.marketValue(b));
      for (const p of cand) { if (A.length <= max) break; const same = A.filter(x => x.type === p.type).length; if ((p.type === 'B' && same <= 10) || (p.type === 'P' && same <= 8)) continue; p.active = false; A = A.filter(x => x !== p); n++; }
      this._engDirty = true; this.invalidate(); return n;
    }
    _applyActiveMax() {   // 한도가 바뀌는 날(9/1 확대·포스트시즌 복귀) 모든 구단에 적용: AI는 자동 재편성, 내 팀은 확대 안내/초과분 정리
      const S = this.S, max = this.activeMax(); if (S.amx === undefined) S.amx = ACTIVE_MAX; if (S.amx === max) return; const up = max > S.amx; S.amx = max;
      for (const t of TEAMS) { if (t === S.userTeam) { if (!up) { const n = this._trimActive(t); if (n) { this.repairSettings(t); this._lnews(`1군 엔트리 ${ACTIVE_MAX}명 복귀: 가치가 낮은 ${n}명이 2군으로 내려갔습니다.`); } } else this._lnews(`9월 1일 확대 엔트리: 1군 엔트리가 ${max}명까지 늘었습니다. 2군 선수를 추가로 등록할 수 있습니다.`); continue; } this.autoActive(t); this.assignUsage(t); }
      this.invalidate();
    }
    setActive(t, id, on) {
      const p = this.S.players[id]; if (!p || p.team !== t) return '선수를 찾을 수 없습니다.';
      if (on && this.isInj(p)) return `${p.ko}은(는) 부상자 명단입니다.`;
      if (on && this.S.phase === 'post' && p.noPost === this.S.year) return `${p.ko}은(는) 8월 15일 이후 영입해 포스트시즌에 나갈 수 없습니다.`;
      if (on && this.players(t).filter(x => x.active).length >= this.activeMax()) return `1군 엔트리는 ${this.activeMax()}명까지입니다.`;
      p.active = !!on; this._engDirty = true; if (t === this.S.userTeam) this.repairSettings(t); return null;
    }

    /* ------------------------------------------------------------ AI 팀 사용량(출전·등판) */
    /* 2군 풀: 1군 엔트리에 없는 선수. 타자 9명/투수 8명에 못 미치면 1군 후보 중 가치가 낮은 선수로 메운다(드문 경우) */
    farmPool(t) {
      let H = this.hitters(t).filter(p => !p.active && !this.isInj(p)), P = this.pitchers(t).filter(p => !p.active && !this.isInj(p));
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
      const man = p => !!(p.dev && !p.dev.auto && p.dev.plan === 'SP'), spv = p => this._runsP(p) + 0.2 * (p.stamina - 50) + (farm && man(p) ? 60 : 0), nSP = farm ? 6 : 5, spc = P.filter(p => p.role === 'SP' || p.stamina >= 52 || man(p)).sort((a, b) => spv(b) - spv(a)).slice(0, nSP);   // 직접 정한 선발 육성 투수는 2군 로테이션(6인)에 우선 편성
      if (spc.length < Math.min(5, P.length)) { const have = new Set(spc.map(p => p.id)); spc.push(...P.filter(p => !have.has(p.id)).sort((a, b) => b.stamina - a.stamina).slice(0, Math.min(5, P.length) - spc.length)); }   // 선발감이 모자라면 체력 높은 순으로 메운다
      const GSs = [30, 29, 29, 28, 26, 22], sid = new Set();
      spc.forEach((p, i) => { const u = U(p); if (!farm) p.role = 'SP'; u.GS = GSs[i]; u.G = u.GS; u.ipgs = clamp(5.3 + (p.stamina - 50) * 0.05, 4.2, 6.8); u.IP = Math.round(u.GS * u.ipgs * 10) / 10; sid.add(p.id); });
      const rps = P.filter(p => !sid.has(p.id)).sort((a, b) => this._runsP(b) - this._runsP(a)), IPs = [66, 66, 64, 62, 60, 56, 52, 46, 40, 30];
      rps.forEach((p, i) => { const u = U(p); if (!farm) p.role = 'RP'; u.GS = 0; u.G = Math.round((IPs[i] || 8) * 1.05); u.IP = IPs[i] || 8; u.ipgs = null; });
    }
    /* AI 팀의 1군 28명 자동 편성: 주전 9 + 백업 5(포수 2명 이상) + 선발 5 + 불펜 9 */
    autoActive(t, pool) {
      const S = this.S, AM = t === S.userTeam ? ACTIVE_MAX : this.activeMax(), inPool = p => (!pool || pool.includes(p)) && !this.isInj(p), H = this.hitters(t).filter(inPool), P = this.pitchers(t).filter(inPool), act = new Set();
      const lineup = this.bestLineup(H); lineup.forEach(x => act.add(x.id));
      const bench = H.filter(p => !act.has(p.id)).sort((a, b) => this._runsB(b, true) - this._runsB(a, true)); let nb = 0;
      const needC = 2 - H.filter(p => act.has(p.id) && p.pos === 'C').length;
      if (needC > 0) for (const c of bench.filter(p => p.pos === 'C').slice(0, needC)) { act.add(c.id); nb++; }
      for (const p of bench) { if (nb >= 5) break; if (!act.has(p.id)) { act.add(p.id); nb++; } }
      const spv = p => this._runsP(p) + 0.2 * (p.stamina - 50), spc = P.filter(p => p.role === 'SP' || p.stamina >= 52).sort((a, b) => spv(b) - spv(a)).slice(0, 5);
      if (spc.length < 5) { const have = new Set(spc.map(p => p.id)); spc.push(...P.filter(p => !have.has(p.id)).sort((a, b) => b.stamina - a.stamina).slice(0, 5 - spc.length)); }
      spc.forEach(p => act.add(p.id));
      const rps = P.filter(p => !act.has(p.id)).sort((a, b) => this._runsP(b) - this._runsP(a)).slice(0, Math.max(0, AM - act.size)); rps.forEach(p => act.add(p.id));
      if (act.size < AM) {   // 명단 풀이 모자라면 팀의 나머지 선수 중 가치가 높은 순으로 28명까지 채운다(투수 최소 13명)
        const rest = this.players(t).filter(p => !act.has(p.id) && !this.isInj(p)).sort((a, b) => this.marketValue(b) - this.marketValue(a));
        while (act.size < AM && rest.length) { const needP = [...act].filter(id => S.players[id].type === 'P').length < 13; const i = rest.findIndex(p => needP ? p.type === 'P' : true); const p = rest.splice(i < 0 ? 0 : i, 1)[0]; act.add(p.id); }
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
        if (this.isInj(p)) return `${p.ko}은(는) 부상자 명단입니다(${p.inj.dx}, 복귀 예정 ${this.injDateStr(p)}).`;
        if (A.length >= this.activeMax()) return `1군 엔트리는 ${this.activeMax()}명까지입니다. 먼저 한 명을 2군으로 내리세요.`;
        if (locking && S.day < (p.lockUntil || 0)) return `${p.ko}은(는) 2군 말소 후 10경기일이 지나야 1군에 등록할 수 있습니다. (${p.lockUntil - S.day}일 남음)`;
        p.active = true; if (t === S.userTeam && !p.debut1 && S.phase === 'regular') p.debut1 = { y: S.year, d: S.day }; if (this._bondShift && (S.phase === 'regular' || S.phase === 'preseason')) this._bondShift(p, 1, '1군 승격');
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
            batters.push({ id, key: id, name: p.name, team: t, age: p.age, PA: u.PA, G: u.G, p: farm ? p.p : this._modRates(p), hand: p.bats || null });
            const gsE = farm ? u.aiGs : ((t !== S.userTeam && p.aiGs) || p.gs), d = {}; for (const k in gsE) d[k] = [0, gsE[k]]; defense[id] = d; const fr = {};
            for (const k in (p.fr || {})) if ((p.gs[k] || 0) >= FAM || k === p.pos) fr[k] = p.fr[k];
            for (const k in p.gs) { const g = p.gs[k]; if (g > 0 && g < FAM && k !== p.pos && PEN_R[k]) { const tt = 0.8 * g / FAM; fr[k] = { range: PEN_R[k] + (50 - PEN_R[k]) * tt, err_reg: C.fielding.lg.err[k] * (PEN_E[k] - (PEN_E[k] - 1) * tt) }; } }   // 경험이 조금 있는 포지션은 페널티를 경험만큼 줄인다
            fplayers[id] = fr;
            if (p.cs !== undefined && p.cs !== null) catchers[id] = { cs_reg: p.cs };
          } else pitchers.push({ id, name: p.name, team: t, age: p.age, GS: u.GS, G: u.G, IP: u.IP, ip_per_start: !farm && t === S.userTeam && u.ipgs ? u.ipgs * ({ save: 0.9, normal: 1, push: 1.1 }[this.policy().pitch]) : u.ipgs, p: farm ? p.p : this._modRates(p), stamina: p.stamina, hand: p.throws || null });
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
      const S = this.S; S.day = 0; S.phase = 'preseason';   // 부상 판정(달력)이 새 시즌 개막일 기준이 되도록 먼저 설정
      for (const p of Object.values(S.players)) p.lockUntil = 0;
      for (const t of TEAMS) { if (t !== S.userTeam) { const rp = first ? this.startPool(t) : []; this.autoActive(t, rp.length >= ACTIVE_MAX ? rp : null); this.assignUsage(t); } }
      this.repairSettings(S.userTeam);
      S.day = 0; S.results = []; S.stats = { bat: {}, pit: {} }; S.stats2 = { bat: {}, pit: {} }; S.recent = {}; S.rec2 = {}; for (const t of this.farmTeams()) S.rec2[t] = [0, 0, 0, 0, 0]; S.post = null; S.phase = 'preseason';
      S.rec = {}; S.h2h = {}; S.h2r = {}; S.tb = null; for (const t of TEAMS) { S.rec[t] = [0, 0, 0, 0, 0]; S.h2h[t] = {}; for (const u of TEAMS) S.h2h[t][u] = [0, 0, 0]; }
      for (const id in S.players) { S.players[id].fat = 0; S.players[id].lastStart = -99; }
      S.schedule = this.makeSchedule(); S.pendingDay = null; S.userGameDone = {};
      this.invalidate();
    }
    makeScheduleRR(salt, teams) {
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
    /* 1군 일정(KBO 방식): 개막 2연전 → 3연전 29회(전반기, 89경기일) → 올스타 휴식기 → 후반기 개막 4연전(개막 2연전 상대와 다시) → 3연전 14회 → 마지막 9경기일은 상대팀당 1경기(우천 순연용 미편성분).
     * 팀당 144경기 = 2 + 4 + 3×43 + 9. 같은 상대와 3연전은 같은 구장에서 치른다. 잠실(두산·LG)은 같은 날 동시에 홈이 되지 않는다. */
    makeSchedule() {
      const S = this.S, r = rngFor(S.seed, S.year, 777), T = TEAMS.slice(), n = T.length, F = [], arr = T.slice();
      for (let k = 0; k < n - 1; k++) { const m = []; for (let i = 0; i < n / 2; i++) m.push([arr[i], arr[n - 1 - i]]); F.push(m); arr.splice(1, 0, arr.pop()); }   // 서클 방식 1-팩터화: 9개 매치업 세트
      for (let i = F.length - 1; i > 0; i--) { const j = r.randbelow(i + 1); [F[i], F[j]] = [F[j], F[i]]; }   // F[0] = 개막 2연전·후반기 4연전 상대 세트
      // 3연전 슬롯 43개: F[0]은 3번, 나머지 8세트는 5번씩. 같은 세트가 연달아 나오지 않게(개막·후반기 개막 앞뒤 포함) 섞는다
      let seq = null;
      for (let tr = 0; tr < 2000 && !seq; tr++) {
        const s = []; for (let k = 0; k < F.length; k++) for (let c = 0; c < (k === 0 ? 3 : 5); c++) s.push(k);
        for (let i = s.length - 1; i > 0; i--) { const j = r.randbelow(i + 1); [s[i], s[j]] = [s[j], s[i]]; }
        let ok = s[0] !== 0 && s[28] !== 0 && s[29] !== 0; for (let i = 1; i < s.length && ok; i++) if (s[i] === s[i - 1]) ok = false;
        if (ok) seq = s;
      }
      if (!seq) { seq = []; for (let c = 0; c < 5; c++) for (let k = 1; k < F.length; k++) seq.push(k); for (let c = 0; c < 3; c++) seq.splice(1 + c * 14, 0, 0); }
      const singles = F.map((_, k) => k).sort(() => r.random() - 0.5); if (singles[0] === seq[seq.length - 1]) singles.push(singles.shift());
      const home = {}, gp = {}, ph = {}; for (const t of T) { home[t] = 0; gp[t] = 0; }
      const key = (a, b) => a < b ? a + '|' + b : b + '|' + a, rounds = [];
      const series = (m, len) => {
        // 홈 결정: 홈 경기 수가 모자란 팀(+상대와의 홈 경기 수가 모자란 팀)을 홈으로
        const o = m.map(([a, b]) => { const pk = key(a, b), pa = (ph[pk + '>' + a] || 0), pb = (ph[pk + '>' + b] || 0), da = (home[a] - gp[a] / 2) + 2 * (pa - pb) / 2, db = (home[b] - gp[b] / 2) + 2 * (pb - pa) / 2; return (da < db || (da === db && r.random() < 0.5)) ? [a, b, da, db] : [b, a, db, da]; });
        const ja = o.find(x => x[0] === 'Bears' || x[0] === 'Twins'), jb = o.find(x => x !== ja && (x[0] === 'Bears' || x[0] === 'Twins'));
        if (ja && jb && ja[0] !== jb[0]) { const f = ja[2] > jb[2] ? ja : jb; const t = f[0]; f[0] = f[1]; f[1] = t; }   // 잠실 동시 홈 금지
        for (const [h, a] of o) { home[h] += len; gp[h] += len; gp[a] += len; ph[key(h, a) + '>' + h] = (ph[key(h, a) + '>' + h] || 0) + len; }
        for (let d = 0; d < len; d++) rounds.push(o.map(([h, a]) => [h, a]));
      };
      series(F[0], 2);
      for (let i = 0; i < 29; i++) series(F[seq[i]], 3);
      series(F[0], 4);   // 올스타 휴식기 직후
      for (let i = 29; i < 43; i++) series(F[seq[i]], 3);
      for (const k of singles) series(F[k], 1);
      return rounds;
    }
    FIRST_HALF_DAYS() { return 89; }
    dateOf(day) { const d = new Date(Date.UTC(this.S.year, 2, 28)), off = (6 - d.getUTCDay() + 7) % 7; d.setUTCDate(d.getUTCDate() + (off > 3 ? off - 7 : off)); /* 개막: 3월 28일에 가장 가까운 토요일 */ let k = 0, br = false; while (k < day) { if (k === 88 && !br) { br = true; d.setUTCDate(d.getUTCDate() + 6); } d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 1) k++; } return d; }   // 월요일 휴식, 89경기일 뒤 올스타 휴식기(6일)
    /* ---- 부상 ---- 부상자는 1군 등록 불가(부상자 명단), 복귀 예정일(달력)이 지나면 복귀. */
    todayN() { const S = this.S, ms = d => Math.floor(d.getTime() / 864e5); if (S.phase === 'offseason') return Math.floor(Date.UTC(S.year, 10, 20) / 864e5); return ms(this.dateOf(Math.min(S.day || 0, (S.schedule || []).length))); }
    injRet(p) { if (!p.inj || !p.inj.ret) return null; if (p.inj.retN === undefined) { const t = Date.parse(p.inj.ret); p.inj.retN = isNaN(t) ? null : Math.floor(t / 864e5); } return p.inj.retN; }
    isInj(p) { if (!p.inj || p.inj.apply === false) return false; const r = this.injRet(p); return r !== null && r > this.todayN(); }
    injLeft(p) { return this.isInj(p) ? this.injRet(p) - this.todayN() : 0; }
    injDateStr(p) { const r = this.injRet(p); if (r === null) return ''; const d = new Date(r * 864e5); return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`; }
    dateStr(day) { const d = this.dateOf(day); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; }

    /* ------------------------------------------------------------ 순위 */
    standings() {
      const S = this.S, R = S.rec, H = S.h2h, HR = S.h2r || {}, pv = S.prevRank || {}, pct = t => (R[t][0] + R[t][1]) ? R[t][0] / (R[t][0] + R[t][1]) : 0;
      /* 리그 규정 제3조: 승률 → (동률 구단끼리) 상호 전체 전적 다승 → 상호 다득점 → 전년도 순위. 동률 구단이 3팀 이상이면 동률 구단들 사이 경기만 합산 */
      const pre = TEAMS.slice().sort((x, y) => pct(y) - pct(x) || (x < y ? -1 : 1)), order = [];
      for (let i = 0; i < pre.length;) {
        let j = i; while (j < pre.length && pct(pre[j]) === pct(pre[i])) j++;
        let g = pre.slice(i, j);
        if (g.length > 1) { const key = t => [g.reduce((a, u) => a + (u === t ? 0 : H[t][u][0]), 0), g.reduce((a, u) => a + (u === t ? 0 : ((HR[t] || {})[u] || 0)), 0), -(pv[t] || 99)]; const K = new Map(g.map(t => [t, key(t)])); g.sort((x, y) => { const a = K.get(x), b = K.get(y); for (let k = 0; k < 3; k++) if (a[k] !== b[k]) return b[k] - a[k]; return x < y ? -1 : 1; }); }
        order.push(...g); i = j;
      }
      const tb = S.tb && S.tb.year === S.year ? S.tb.games : [];   // 1위·5위 결정전 결과(2개 구단 동률일 때만 거행)
      for (const x of tb) { const i = order.indexOf(x.winner), k = order.indexOf(x.winner === x.home ? x.away : x.home); if (i > k && k >= 0 && i - k === 1) { order[k] = x.winner; order[i] = x.winner === x.home ? x.away : x.home; } }
      return order.map((t, i) => ({ rank: i + 1, team: t, w: R[t][0], l: R[t][1], d: R[t][2], pct: pct(t), rs: R[t][3], ra: R[t][4] }));
    }
    farmSchedule() { const S = this.S; if (!this._sch2 || this._sch2.y !== S.year || this._sch2.s !== S.seed || this._sch2.n !== this.farmTeams().length) this._sch2 = { y: S.year, s: S.seed, n: this.farmTeams().length, v: this.makeScheduleRR(888, this.farmTeams()) }; return this._sch2.v; }
    standings2() {
      const R = this.S.rec2, pct = t => (R[t][0] + R[t][1]) ? R[t][0] / (R[t][0] + R[t][1]) : 0;
      return this.farmTeams().sort((x, y) => pct(y) - pct(x) || (R[y][3] - R[y][4]) - (R[x][3] - R[x][4]) || (x < y ? -1 : 1)).map((t, i) => ({ rank: i + 1, team: t, w: R[t][0], l: R[t][1], d: R[t][2], pct: pct(t), rs: R[t][3], ra: R[t][4] }));
    }
    /* FA 자격 연수: 1군 등록일수 누적(경기일 1일 = 달력 7/6일) */
    /* 현역선수 등록일수(FA 자격 산정). 리그 규정 제14조 ③: 부상자 명단에 오른 기간은 시즌 최대 30일까지 등록일수로 인정한다(p.il = 올 시즌 인정 일수) */
    _tickService() { for (const t of TEAMS) for (const p of this.players(t)) { if (!p.fa) continue; if (p.active) p.fa.regDays += 7 / 6; else if (p.inj && (p.il || 0) < 30 && this.isInj(p)) { const d = Math.min(7 / 6, 30 - (p.il || 0)); p.il = (p.il || 0) + d; p.fa.regDays += d; } } }
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
      const S = this.S, R = S.rec; if (this._finGame && S.fin) this._finGame(home, away); R[home][3] += rh; R[home][4] += ra; R[away][3] += ra; R[away][4] += rh;
      const HR = S.h2r = S.h2r || {}; (HR[home] = HR[home] || {})[away] = ((HR[home] || {})[away] || 0) + rh; (HR[away] = HR[away] || {})[home] = ((HR[away] || {})[home] || 0) + ra;   // 상호 득점(순위 동률 해소용)
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
      this.S.base = null;   // 하루가 지나면 변경이 확정된 것으로 본다
      const S = this.S; if (S.day >= S.schedule.length) return { status: 'seasonEnd' };
      S.phase = 'regular'; this._applyActiveMax(); const E = this.engine(), rd = S.schedule[S.day], d = S.day, others = [];
      let ug = null;
      rd.forEach((g, i) => {
        if (g[0] === S.userTeam || g[1] === S.userTeam) { ug = { g, i }; return; }
        const r = rngFor(S.seed, S.year, d, i), [rh, ra, info] = E.game(g[0], g[1], 1 + d, 1 + d, r, E.newStats(), null);
        others.push({ home: g[0], away: g[1], rh, ra, spH: info.spH, spA: info.spA });
      });
      this.mergeTracking();
      for (const o of others) this.commit(o.home, o.away, o.rh, o.ra, { spH: o.spH, spA: o.spA });
      this._applyActiveMax(); this._decayFatigue(); this._tickService(); if (this._injuryDay) this._injuryDay(d); if (this._eventDay) this._eventDay(d); if (this._finSnapDay) this._finSnapDay(d); if (this._trainDay) this._trainDay(); if (this._scoutDay) this._scoutDay(); if (this._milestoneDay) this._milestoneDay(); this.playFutures(d); this.returnMilitary(this.milYM(d));
      if (!ug) { S.day++; return { status: 'ok', day: d }; }
      if (live) { S.pendingDay = d; return { status: 'userGame', day: d, game: ug.g, idx: ug.i }; }
      const L = this.startUserGame(ug.g, ug.i); this.playAuto(L); const res = this.finishUserGame(L);
      return { status: 'ok', day: d, user: res };
    }
    /* N일 또는 시즌 끝까지. live 모드에서는 내 경기에서 멈춘다. */
    advance(days, live, stopOnEvent) {
      if (this.S.faMkt && this.closeFA) this.closeFA();   // 개막과 함께 FA 협상 마감
      let n = 0; const out = [];
      const evSeq = this.S.events ? this.S.events.seq : 0;
      while (n < days && this.S.day < this.S.schedule.length) { const r = this.playDay(live); out.push(r); n++; if (r.status === 'userGame') return { status: 'userGame', ...r, played: n - 1 }; if (stopOnEvent && this.S.events && this.S.events.seq > evSeq) return { status: 'event', played: n, event: this.eventsOpen()[0] || null }; }   // 새 소식(결정 필요)이 생기면 그날 멈춘다
      if (this.S.day >= this.S.schedule.length) { this.S.phase = 'regular_done'; return { status: 'seasonEnd', played: n }; }
      return { status: 'ok', played: n };
    }

    /* ------------------------------------------------------------ 내 경기 */
    _fatigueOk(p) { return (p.fat || 0) < 35; }
    /* 피로 회복: 구원은 하루 8(1이닝 20 → 약 2.5일), 선발은 하루 20(한 경기 최대 약 95 → 5일 로테이션 안에 전부 회복). 선발의 회복이 8이면 등판마다 피로가 쌓여 계속 지쳐 보였다. 피로는 0~100 */
    _decayFatigue() { for (const p of this.players(this.S.userTeam)) if (p.type === 'P') p.fat = Math.max(0, Math.min(100, p.fat || 0) - (p.role === 'SP' ? 20 : 8) * (this._trainRec ? this._trainRec(p) : 1)); }
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
      // 오늘만 적용한 타순(경기 전 브리핑): 결장 대체까지 반영된 9인을 재배열한 것이므로 그대로 쓴다(저장 라인업은 그대로)
      const tn = this.tonightOf(); if (tn) return { spec: tn.lineup.map(x => ({ ...x })), absent, sp, rotIdx: ri, override: true };
      return { spec, absent, sp, rotIdx: ri, override: false };
    }
    startUserGame(g, idx) {
      const S = this.S, E = this.engine(), t = S.userTeam, home = g[0], away = g[1], userSide = home === t ? 'home' : 'away', oppSide = userSide === 'home' ? 'away' : 'home';
      const prep = this.prepareUserGame(g, idx), r = rngFor(S.seed, S.year, S.day, idx), d = S.day, opp = userSide === 'home' ? away : home;
      let ul = E.makeLineup(prep.spec); const ol = E.lineup(opp, 1 + d, r, false);
      const userStaff = new E.StaffState(this.pitchers(t, true).map(p => E.pitById[p.id]), r, E.pitById[prep.sp.id]);
      const oppStaff = new E.StaffState(E.staff(opp, 1 + d), r, null);
      { const pr = S.presets; if (!prep.override && pr && pr.on && oppStaff.sp) { const hd = oppStaff.sp.hand === 'L' ? 'L' : 'R', pl = pr[hd]; if (this._presetOk(pl)) { prep.spec = pl.map(x => ({ ...x })); ul = E.makeLineup(prep.spec); prep.presetUsed = hd === 'L' ? '좌투 상대' : '우투 상대'; } } }   // 상대 선발 손에 맞춘 프리셋 라인업
      const lineups = {}, staff = {}, penal = {}; lineups[userSide] = ul; lineups[oppSide] = { L: ol[0], assign: ol[1] }; staff[userSide] = userStaff; staff[oppSide] = oppStaff; penal[userSide] = true;
      const ctx = { auto: true, userSide, league: this, prep, g, idx };
      const live = new E.LiveGame({ home, away, lineups, staff, rng: r, maxInn: 11, penal, fatigue: true, hook: { [userSide]: (game, ss) => { ss.o += 3; } } });
      live.pre = { [userSide]: (game, ss) => this._autoBullpen(game, ss, userSide, ctx) };
      ctx.live = live; ctx.E = E; return ctx;
    }
    /* 내 팀 자동 불펜 운용: 하프 이닝 시작 전에 호출(ctx.auto 가 꺼져 있으면 건너뜀) */
    /* ---------------- 엔트리 관리(교체형 콜업·부상 복귀·변경 요약·할 일) ---------------- */
    /* 체력 표시: 남은 체력 = 100 − 피로(이닝당 −20, 하루 +8 회복). 등판 가능일: 선발은 4일 휴식, 불펜은 피로 35 미만 */
    restInfo(p) {
      const S = this.S, fat = Math.min(100, Math.max(0, p.fat || 0)), left = 100 - fat, inRot = p.role === 'SP' && S.teams[p.team] && S.teams[p.team].set.rotation.includes(p.id);
      const days = inRot ? Math.max(0, 4 - (S.day - (p.lastStart === undefined ? -99 : p.lastStart))) : (fat < 35 ? 0 : Math.ceil((fat - 34) / 8));
      return { left, days, label: days === 0 ? '오늘 가능' : `${days}일 뒤 가능`, level: fat >= 35 ? 'low' : fat >= 25 ? 'mid' : 'good', inRot };
    }
    fitTag(p, pos) { return pos === 'DH' ? 'ok' : p.pos === pos ? 'main' : (p.gs && (p.gs[pos] || 0) >= 20) ? 'ok' : 'bad'; }
    /* 콜업(교체) 후보: 같은 유형의 1군 선수. 약한 선수·부진/피로한 선수 순으로 추천하고 라인업·로테이션 소속은 표시 */
    downCandidates(upId) {
      const S = this.S, t = S.userTeam, up = S.players[upId], set = S.teams[t].set, lin = new Set(set.lineup.map(x => x.id)), rot = new Set(set.rotation), bp = set.bullpen;
      const act = this.players(t).filter(p => p.active && p.type === up.type && p.id !== upId), cat = this.players(t).filter(p => p.active && p.pos === 'C').length;
      return act.map(p => { const role = lin.has(p.id) ? '주전 라인업' : rot.has(p.id) ? '선발 로테이션' : bp.closer === p.id ? '마무리' : bp.setup.includes(p.id) ? '셋업' : '', fat = p.type === 'P' ? (p.fat || 0) : 0;
        const block = p.pos === 'C' && up.pos !== 'C' && cat <= 2 ? '포수가 2명 아래가 됩니다' : '';
        return { p, role, block, score: this.ovr(p) + (role ? 12 : 0) + (fat >= 35 ? -3 : 0) }; }).sort((a, b) => a.score - b.score);
    }
    swapActive(upId, downId) {   // 2군 선수를 올리고 같은 유형 1군 선수를 내리는 교체(한 번에 검증)
      const S = this.S, t = S.userTeam, up = S.players[upId], dn = S.players[downId];
      if (!up || !dn || up.team !== t || dn.team !== t) return '선수를 찾을 수 없습니다.'; if (up.active || !dn.active) return '1군/2군 상태가 바뀌었습니다.'; if (up.type !== dn.type) return '같은 유형(투수/타자)끼리만 교체할 수 있습니다.';
      if (this.isInj(up)) return `${up.ko}은(는) 부상자 명단입니다.`; if (up.pos !== 'C' && dn.pos === 'C' && this.players(t).filter(p => p.active && p.pos === 'C').length <= 2) return '1군에는 포수가 최소 2명 필요합니다.';
      const lock = S.day < S.schedule.length && S.day < (up.lockUntil || 0); if (lock) return `${up.ko}은(는) 2군 말소 후 10경기일이 지나야 1군에 등록할 수 있습니다. (${up.lockUntil - S.day}일 남음)`;
      this.pushUndo('콜업 교체'); dn.active = false; if (S.day < S.schedule.length && S.phase !== 'preseason') dn.lockUntil = S.day + 10; up.active = true; this.invalidate(); this.repairSettings(t); return null;
    }
    /* 변경 요약: 마지막 '확정' 이후의 변경과 규칙 점검 */
    diffSinceBase() {
      const S = this.S, b = S.base; if (!b || b.t !== S.userTeam) return null; const ps = this.players(b.t), up = [], down = [], ch = [];
      for (const p of ps) { if (!(p.id in b.act)) continue; if (p.active && !b.act[p.id]) up.push(p); else if (!p.active && b.act[p.id]) down.push(p); }
      const set = S.teams[b.t].set, nm = id => (S.players[id] || { ko: '?' }).ko;
      b.set.lineup.forEach((x, i) => { const y = set.lineup[i]; if (y && (y.id !== x.id || y.pos !== x.pos)) ch.push(`${i + 1}번 ${nm(x.id)}(${x.pos}) → ${nm(y.id)}(${y.pos})`); });
      b.set.rotation.forEach((id, i) => { if (set.rotation[i] !== id) ch.push(`${i + 1}선발 ${nm(id)} → ${nm(set.rotation[i])}`); });
      if (b.set.bullpen.closer !== set.bullpen.closer) ch.push(`마무리 ${nm(b.set.bullpen.closer)} → ${nm(set.bullpen.closer)}`);
      return { up, down, ch, n: up.length + down.length + ch.length };
    }
    validateEntry() {
      const S = this.S, t = S.userTeam, a = this.players(t).filter(p => p.active), w = [], P = a.filter(p => p.type === 'P').length, B = a.filter(p => p.type === 'B').length, C = a.filter(p => p.pos === 'C').length, set = S.teams[t].set;
      if (a.length < ACTIVE_MAX || a.length > this.activeMax()) w.push(`1군 엔트리 ${a.length}/${this.activeMax()}명`); if (P < 13) w.push(`투수 ${P}명 (13명 이상 권장)`); if (B < 13) w.push(`타자 ${B}명 (13명 이상 권장)`); if (C < 2) w.push(`포수 ${C}명 (최소 2명)`);
      if (set.rotation.length < 5) w.push('선발 로테이션 5명 미만'); if (!set.bullpen.closer) w.push('마무리 미지정');
      const bad = set.lineup.filter(x => this.fitTag(S.players[x.id], x.pos) === 'bad'); if (bad.length) w.push(`수비 부적합 ${bad.length}명 (${bad.map(x => S.players[x.id].ko).join(', ')})`);
      return w;
    }
    confirmChanges() { this.S.base = null; return true; }
    revertToBase() { const S = this.S, b = S.base; if (!b || b.t !== S.userTeam) return false; S.undo = (S.undo || []).filter(x => false); this._restore(b); S.base = null; return true; }
    /* 재배치 도우미(탭으로 맞바꾸기) */
    swapLineup(i, j) { const l = this.S.teams[this.S.userTeam].set.lineup; if (i === j || !l[i] || !l[j]) return false; this.pushUndo('타순 변경'); [l[i], l[j]] = [l[j], l[i]]; return true; }
    replaceLineup(i, id) {
      const S = this.S, l = S.teams[S.userTeam].set.lineup, p = S.players[id]; if (!l[i] || !p || p.team !== S.userTeam || p.type !== 'B' || !p.active || this.isInj(p)) return '올릴 수 없는 선수입니다.';
      this.pushUndo('라인업 교체'); const j = l.findIndex(x => x.id === id); if (j >= 0 && j !== i) { const t = l[i].id; l[i].id = id; l[j].id = t; } else l[i].id = id; return null;
    }
    setLineupPos(i, pos) { const l = this.S.teams[this.S.userTeam].set.lineup; if (!l[i]) return false; this.pushUndo('수비 위치 변경'); const j = l.findIndex((x, k) => x.pos === pos && k !== i); if (j >= 0) l[j].pos = l[i].pos; l[i].pos = pos; return true; }
    assignPitcher(k, i, nid) {   // k: rot|close|setup|mid|long
      const S = this.S, set = S.teams[S.userTeam].set, b = set.bullpen, p = S.players[nid]; if (!p || p.team !== S.userTeam || p.type !== 'P' || !p.active || this.isInj(p)) return '올릴 수 없는 선수입니다.';
      const get = (kk, ii) => kk === 'rot' ? set.rotation[ii] : kk === 'close' ? b.closer : kk === 'setup' ? b.setup[ii] : kk === 'mid' ? b.middle[ii] : b.long[ii];
      const put = (kk, ii, id) => { if (kk === 'rot') set.rotation[ii] = id; else if (kk === 'close') b.closer = id; else if (kk === 'setup') b.setup[ii] = id; else if (kk === 'mid') b.middle[ii] = id; else b.long[ii] = id; };
      const slots = []; set.rotation.forEach((id, ii) => slots.push({ k: 'rot', i: ii, id })); slots.push({ k: 'close', i: 0, id: b.closer }); b.setup.forEach((id, ii) => slots.push({ k: 'setup', i: ii, id })); b.middle.forEach((id, ii) => slots.push({ k: 'mid', i: ii, id })); b.long.forEach((id, ii) => slots.push({ k: 'long', i: ii, id }));
      this.pushUndo('투수진 교체'); const old = get(k, i), at = slots.find(s => s.id === nid && !(s.k === k && s.i === i)); if (at) put(at.k, at.i, old); put(k, i, nid); return null;
    }
    /* 되돌리기: 로스터·라인업·계획 변경 직전 상태를 저장(최대 20개). FA 계약·트레이드·방출 같은 되돌릴 수 없는 거래는 제외 */
    pushUndo(label) {
      const S = this.S, t = S.userTeam, act = {}, lock = {}; S.undo = S.undo || [];
      for (const p of this.players(t)) { act[p.id] = !!p.active; lock[p.id] = p.lockUntil || 0; }
      const cl = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
      const snap = { label, t, day: S.day, act, lock, set: cl(S.teams[t].set), plan: cl(S.plan), train: cl(S.train), policy: cl(S.policy), captain: S.captain || null, presets: cl(S.presets) }; S.undo.push(snap); if (S.undo.length > 20) S.undo.shift();
      if (!S.base || S.base.t !== t) S.base = JSON.parse(JSON.stringify(snap));   // 변경 요약의 기준(마지막 확정 시점)
    }
    undoLabel() { const u = this.S.undo; return u && u.length ? u[u.length - 1].label : null; }
    undo() {
      const S = this.S, e = S.undo && S.undo.pop(); if (!e) return null; if (e.t !== S.userTeam) { S.undo = []; return null; }
      this._restore(e); if (!S.undo.length) S.base = null; return e.label;
    }
    _restore(e) {
      const S = this.S;
      for (const p of this.players(e.t)) { if (p.id in e.act) { p.active = e.act[p.id] && !this.isInj(p); p.lockUntil = e.lock[p.id] || 0; } }
      S.teams[e.t].set = JSON.parse(JSON.stringify(e.set)); S.plan = e.plan; S.train = e.train; S.policy = e.policy; S.captain = e.captain; S.presets = e.presets;
      this.invalidate(); this.repairSettings(e.t);
    }
    /* 라인업 프리셋: 상대 선발 좌/우투에 따라 저장해 둔 라인업을 자동 적용 */
    /* 오늘 경기 한정 타순(경기 전 브리핑 제안). {day, lineup:[{id,pos}]} — 같은 날·유효한 9인일 때만 인정, 프리셋보다 우선 */
    /* 오늘 타순은 '현재 출전 9명의 순서만 바꾼 것'이라, 부상 중이어도 이미 그 라인업에 있던 선수는 그대로 인정한다(프리셋과 달리 새로 끼워 넣는 것이 아님) */
    _tonightOk(pl) { const S = this.S, t = S.userTeam; return !!pl && pl.length === 9 && new Set(pl.map(x => x.id)).size === 9 && pl.every(x => { const p = S.players[x.id]; return p && p.team === t && p.active && p.type === 'B'; }); }
    tonightOf() { const S = this.S, tn = S.tonight; if (!tn || tn.day !== S.day || !this._tonightOk(tn.lineup)) return null; return tn; }
    setTonight(order) { const S = this.S; if (!this.userGameToday() || !this._tonightOk(order)) return false; S.tonight = { day: S.day, lineup: order.map(x => ({ id: x.id, pos: x.pos })) }; return true; }
    clearTonight() { delete this.S.tonight; return true; }
    savePreset(hand) { const S = this.S, set = S.teams[S.userTeam].set; if (!['L', 'R'].includes(hand) || set.lineup.length !== 9) return false; S.presets = Object.assign({ on: false }, S.presets, { [hand]: set.lineup.map(x => ({ id: x.id, pos: x.pos })) }); return true; }
    clearPreset(hand) { const S = this.S; if (S.presets) delete S.presets[hand]; return true; }
    setPresetOn(on) { const S = this.S; S.presets = Object.assign({ on: false }, S.presets, { on: !!on }); return true; }
    _presetOk(pl) { const S = this.S, t = S.userTeam; return !!pl && pl.length === 9 && new Set(pl.map(x => x.id)).size === 9 && pl.every(x => { const p = S.players[x.id]; return p && p.team === t && p.active && p.type === 'B' && !this.isInj(p); }); }
    /* 경기 계획: 자동 진행(내 경기를 직접 지휘하지 않을 때)에도 적용되는 규칙. 기본값은 이전 동작과 같다(전부 끔/기본) */
    plan() { return Object.assign({ starter: 'normal', closer: 'ninth', contact: false, infIn: false, hold: false, careful: false, hlFrom: 7 }, this.S.plan || {}); }
    setPlan(k, v) {
      const ok = { starter: ['quick', 'normal', 'long'], closer: ['ninth', 'flex'], contact: [true, false], infIn: [true, false], hold: [true, false], careful: [true, false], hlFrom: [6, 7, 8] };
      if (!ok[k] || !ok[k].includes(v)) return false; this.S.plan = Object.assign({}, this.S.plan, { [k]: v }); return true;
    }
    _applyPlan(g, us) {   // 타석마다 상황 규칙으로 작전(타격 접근·전진 수비·견제·투구 접근)을 정한다
      const P = this.plan(), opp = us === 'home' ? 'away' : 'home', ls = this.liveScore(g), diff = ls[us] - ls[opp], b = g.h.bases, outs = g.h.outs, inn = g.inning;   // 진행 중인 이닝의 득점까지 더한 현재 점수차
      if (g.batSide === us) { g.setTactic(us, 'bat', P.contact && b[2] && outs < 2 && Math.abs(diff) <= 2 ? 'contact' : 'normal'); }
      else {
        g.setTactic(us, 'inf', !!(P.infIn && b[2] && outs < 2 && inn >= 7 && diff >= 0 && diff <= 2));
        const rn = b[0] && !b[1] ? this.S.players[b[0].id] : null; g.setTactic(us, 'hold', !!(P.hold && rn && this.sub(rn).주력 >= 58));
        g.setTactic(us, 'pit', P.careful && inn >= 8 && diff > 0 && diff <= 2 && (b[0] || b[1] || b[2]) ? 'careful' : 'normal');
      }
    }
    /* 내 경기 자동 진행(경기 계획 적용). until(g) 이 참이 되면 그 상태에서 멈추고 false 반환(하이라이트 개입), 끝까지 가면 true */
    playAuto(ctx, until) {
      const g = ctx.live, us = ctx.userSide;
      while (!g.finished) { if (until && until(g)) return false; this._applyPlan(g, us); g.step(); }
      return true;
    }
    /* 하이라이트: 설정한 이닝 이후 2점 차 이내 접전 */
    /* 현재 점수: 엔진의 g.score는 초/말이 끝나야 그 이닝 득점이 반영되므로 진행 중인 공격 이닝 득점(h.runs)을 더한다 */
    liveScore(g) { return { away: g.score.away + (g.top && !g.finished ? g.h.runs : 0), home: g.score.home + (!g.top && !g.finished ? g.h.runs : 0) }; }
    isHighlight(g, us) { const P = this.plan(), opp = us === 'home' ? 'away' : 'home', ls = this.liveScore(g); return g.inning >= P.hlFrom && Math.abs(ls[us] - ls[opp]) <= 2; }
    _autoBullpen(game, ss, side, ctx) {
      if (!ctx.auto) return;
      const S = this.S, E = ctx.E, set = S.teams[S.userTeam].set, bp = set.bullpen, opp = side === 'home' ? 'away' : 'home';
      const cur = ss.cur, sp = ss.sp; let change = false;
      const PL = this.plan(), hk = { quick: [-3, 4, 2], normal: [0, 6, 3], long: [3, 8, 4] }[PL.starter], fat = game.pitchFatigue(side); if (cur === sp) { if (ss.o >= ss.sp_outs + hk[0] || ss.runs >= hk[1] || fat.over >= hk[2]) change = true; } else change = true;
      if (!change) return;
      const inn = game.inning, lead = game.score[side] - game.score[opp], used = ss.used;
      const roster = id => { const p = S.players[id]; return p && p.active ? E.pitById[id] : null; };
      const avail = id => { const b = roster(id); return b && !used.has(b.name) && this._fatigueOk(S.players[id]) ? b : null; };
      let order;
      const close = (inn >= 9 && ((lead > 0 && lead <= 3) || (lead === 0 && side === 'home'))) || (PL.closer === 'flex' && inn === 8 && lead > 0 && lead <= 2), setup = (inn === 8 && lead > 0 && lead <= 3) || (inn === 7 && lead > 0 && lead <= 2), mop = lead <= -4 || (cur === sp && inn <= 5);
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
      const tr = E.tracking().pit, trB = E.tracking().bat || {};   // 이 경기 기록(리캡용)
      for (const p of this.pitchers(t)) { const c = tr[p.id]; if (c && c.outs > 0) p.fat = Math.min(100, (p.fat || 0) + 5 + 5 * c.outs); }   // 1이닝(3아웃) = 20, 3일 연투하면 휴식 필요
      for (const x of ctx.prep.spec) { const q = S.players[x.id]; if (q) this.learnPosition(q, x.pos); }
      const sp = ctx.prep.sp; sp.lastStart = d; const set = S.teams[t].set; set.rotIdx = (ctx.prep.rotIdx + 1) % set.rotation.length;
      this.mergeTracking();
      this.commit(live.home, live.away, rh, ra, { user: true, inns: live.inns, spH: live.staff.home.sp.name, spA: live.staff.away.sp.name, subs: { home: live.subs.home.length, away: live.subs.away.length } });
      const recap = this._recap ? this._recap(ctx, rh, ra, tr, trB) : null;
      delete S.tonight; S.pendingDay = null; S.day++; if (S.day >= S.schedule.length) S.phase = 'regular_done';
      return { recap, home: live.home, away: live.away, rh, ra, win: (live.home === t ? rh > ra : ra > rh), tie: rh === ra, inns: live.inns };
    }

    /* ------------------------------------------------------------ 포스트시즌 */
    /* 리그 규정 제3조: 정규시즌 1위 또는 5위가 2개 구단 동률이면 와일드카드 결정전 전날 단판 결정전(홈 = 동률 해소 기준 우위 구단, 기록은 정규시즌에 가산하지 않음).
     * 3개 구단 이상이면 거행하지 않고 상호 전적 기준으로 순위를 정한다. 연장은 포스트시즌과 같이 15회까지, 그래도 비기면 우위 구단이 진출. */
    _tieGames() {
      const S = this.S, st = this.standings(), games = [], E = this.engine(); S.tb = { year: S.year, games };
      for (const pos of [1, 5]) {
        const tied = st.filter(x => x.pct === st[pos - 1].pct); if (tied.length !== 2 || tied[0].rank !== pos) continue;
        const home = tied[0].team, away = tied[1].team, r = rngFor(S.seed, S.year, 9100 + pos), [rh, ra] = E.game(home, away, Math.min(144, 1 + S.day), Math.min(144, 1 + S.day), r, E.newStats(), { maxInn: 15 });
        const winner = ra > rh ? away : home; games.push({ pos, home, away, rh, ra, winner });
        this._lnews(`정규시즌 ${pos}위 결정전: ${KO[home] || home} ${rh} : ${ra} ${KO[away] || away} → ${KO[winner] || winner} ${pos === 1 ? '정규시즌 1위' : '와일드카드 결정전 진출'}`);
      }
      this.invalidate();
    }
    startPostseason() {
      this._tieGames(); this._applyActiveMax();
      const S = this.S, st = this.standings(), seeds = st.slice(0, 5).map(x => x.team), T = i => seeds[i];
      S.post = { seeds, rounds: [], cur: null, stage: 0, done: false, champion: null };
      S.phase = 'post'; if (this._postElig) this._postElig(); this._mkSeries(0); this.invalidate(); return S.post;
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
    /* 포스트시즌 대진 자가 복구: 앞 시리즈의 승자가 없는데 다음 시리즈가 만들어졌거나(상대 미정) 현재 시리즈의 팀이 비어 있는 손상 상태를 바로잡는다.
       손상된 시리즈의 경기 기록으로 승자를 확정할 수 있으면 확정하고, 아니면 그 시리즈를 현재 시리즈로 되돌려 이어 진행한다. 반환: 복구했으면 true */
    _postHeal() {
      const P = this.S.post; if (!P || P.done || !P.rounds) return false;
      let k = -1; for (let i = 0; i < P.stage; i++) { const x = P.rounds[i]; if (!x || !x.winner) { k = i; break; } }
      const cur = P.rounds[P.stage]; if (k < 0 && (!cur || !cur.hi || !cur.lo) && P.stage > 0) k = P.stage - 1;
      if (k < 0 && (!cur || !cur.hi || !cur.lo)) return false; if (k < 0) return false;
      const s = P.rounds[k]; P.rounds.length = k + 1;
      if (!s) { this._mkSeries(k); return true; }
      let win = null;
      if (s.wc) { const hw = s.games.filter(x => !x.draw && (x.rh > x.ra ? x.home === s.hi : x.away === s.hi)).length, lw = s.games.filter(x => !x.draw).length - hw; if (hw >= 1) win = s.hi; else if (s.games.length >= 2) win = lw >= 2 ? s.lo : s.hi; }
      else { const w = { [s.hi]: 0, [s.lo]: 0 }; for (const x of s.games) if (!x.draw) w[x.rh > x.ra ? x.home : x.away]++; s.w = w; win = w[s.hi] >= s.need ? s.hi : w[s.lo] >= s.need ? s.lo : null; }
      if (win) { s.winner = win; if (k === 3) { P.done = true; P.champion = win; P.runnerUp = win === s.hi ? s.lo : s.hi; this.S.phase = 'post_done'; } else this._mkSeries(k + 1); return true; }
      s.winner = null; P.cur = s; P.stage = k; return true;
    }
    postNextGame() {
      this._postHeal(); const P = this.S.post; if (!P || P.done) return null; const s = P.cur;
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
