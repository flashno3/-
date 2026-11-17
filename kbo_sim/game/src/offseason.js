/* KBO 감독 모드 오프시즌 + 트레이드
 * 성장·노화·은퇴 → 계약 만료/재계약 → 신인 드래프트 → FA 시장 → 새 시즌. 트레이드는 시즌 중(마감 전)과 오프시즌에 가능.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { League, ORDER, ACTIVE_MAX, ROSTER_MAX, ROSTER_MIN, rngFor, clamp } = LG;
  const { TEAMS } = Engine;
  const SURN = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남'];
  const GIV = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준우', '현우', '도현', '건우', '우진', '승현', '민재', '재원', '태양', '성민', '동현', '진우', '유찬', '지훈', '수호', '현준', '재윤', '정우', '시윤', '은우', '준혁', '태윤', '민성', '승우', '하린', '찬영', '다온', '규민', '원준', '세훈', '상원'];
  const POSW = [['C', 10], ['1B', 8], ['2B', 11], ['3B', 11], ['SS', 12], ['LF', 14], ['CF', 12], ['RF', 14], ['DH', 8]];
  const gauss = (r, m, s) => r.gauss(m, s);
  const LIM_DEADLINE = 110;   // 트레이드 마감(일차)

  const proto = League.prototype;
  const news = (L, text) => { const S = L.S; S.news.unshift({ year: S.year, day: S.day, text }); if (S.news.length > 120) S.news.length = 120; };

  /* ---------------- 선수 성장 / 노화 ---------------- */
  const BCURVE = { 18: .32, 19: .30, 20: .28, 21: .26, 22: .22, 23: .18, 24: .13, 25: .08, 26: .04, 27: .01, 28: -.02, 29: -.04, 30: -.06, 31: -.08, 32: -.11, 33: -.14, 34: -.18, 35: -.22 };
  const PCURVE = { 18: .30, 19: .28, 20: .26, 21: .22, 22: .18, 23: .14, 24: .10, 25: .06, 26: .03, 27: .0, 28: -.02, 29: -.04, 30: -.06, 31: -.09, 32: -.12, 33: -.16, 34: -.2, 35: -.25 };
  /* 올 시즌 출전 비율(0~1): 1군 기록 + 0.8×2군 기록을 풀타임 기준(타자 450타석, 선발 550·불펜 200타자)과 비교 */
  proto.playShare = function (p) {
    if (p.team === 'MIL') return 0.7;   // 상무에서 꾸준히 출전한다고 가정
    const S = this.S, a = S.stats, b = S.stats2 || { bat: {}, pit: {} };
    if (p.type === 'B') { const w = ((a.bat[p.id] || {}).PA || 0) + 0.8 * ((b.bat[p.id] || {}).PA || 0); return clamp(w / 450, 0, 1); }
    const w = ((a.pit[p.id] || {}).BF || 0) + 0.8 * ((b.pit[p.id] || {}).BF || 0); return clamp(w / (p.role === 'SP' ? 550 : 200), 0, 1);
  };
  proto.progress = function (p, r, play) {   // play: 0~1 출전 비율(젊은 선수 성장에 반영)
    const sc = this.S.calib.scale[p.type], lb = this.S.calib.lb, old = this.ovr(p), a = p.age + 1;
    p.age = a;
    const curve = (p.type === 'B' ? BCURVE : PCURVE)[clamp(a, 18, 35)] !== undefined ? (p.type === 'B' ? BCURVE : PCURVE)[clamp(a, 18, 35)] : -.3;
    let gain = (a > 35 ? -.32 : curve) + gauss(r, 0, 0.12);
    if (a >= 33 && gain < 0) gain *= 1 - 0.4 * clamp((old - 55) / 20, 0, 1);   // 상위권 선수는 에이징 하락이 최대 40% 완만(류현진·양의지·최정 등)
    const pf = play === undefined ? 1 : 0.55 + 0.45 * clamp(play, 0, 1);   // 경기에 못 나온 젊은 선수는 성장이 더딘다(최대 -45%)
    if (a <= 26 && gain > 0 && p.peak === undefined) gain *= pf;
    if (p.peak !== undefined) {
      if (a <= 27) {   // 드래프트 신인: 정점을 향해 해마다 격차를 좁힌다(해마다 정점 자체도 흔들림: 대성장·정체 가능)
        p.peak = clamp(p.peak + gauss(r, 0, 1.8) + (r.random() < 0.05 ? (r.random() < 0.5 ? 5 : -5) : 0), 25, 85);
        const yrs = Math.max(1, 28 - a), g0 = clamp(((p.peak - old) / yrs) / 14 * (1 + gauss(r, 0, 0.3)) + gauss(r, 0, 0.04), -0.15, 0.7);
        gain = g0 > 0 ? g0 * pf : g0;
        p.scout.ceil = clamp(0.6 * p.scout.ceil + 0.4 * (p.peak + gauss(r, 0, 3)), 25, 85);   // 스카우트 평가가 시간이 지나며 정확해진다
      } else { delete p.peak; delete p.pot; }
    } else if (a <= 26 && p.pot > 0) { const g2 = Math.min(p.pot, 0.4) * (0.6 + 0.8 * r.random()) * pf; gain = Math.max(gain, g2); p.pot = Math.max(0, p.pot - Math.max(0, g2)); }
    const shift = f => gain * 0.75 + gauss(r, 0, 0.1);
    const set = (f, dir, lo, hi, s) => { p.p[f] = clamp(p.p[f] + dir * s * sc[f][1], lo, hi); };
    if (p.type === 'B') {
      set('k', -1, 0.06, 0.45, shift()); set('bb', 1, 0.015, 0.20, shift()); set('hr', 1, 0.002, 0.07, shift()); set('babip', 1, 0.24, 0.39, shift()); set('xbh', 1, 0.10, 0.32, shift());
      const sp = (a <= 24 ? 0.04 : a <= 28 ? -0.05 : -0.2) + gauss(r, 0, 0.08); set('sba', 1, 0.005, 0.25, sp); p.p.tri = clamp(p.p.tri * (1 + sp * 0.25), 0.01, 0.2);
      if (a >= 31) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range - 1.1 * r.random() * 1.6, 25, 80);
      else if (a <= 24) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range + 0.8 * r.random() * 1.6, 25, 80);
    } else {
      set('k', 1, 0.08, 0.40, shift()); set('bb', -1, 0.02, 0.18, shift()); set('hr', -1, 0.004, 0.06, shift()); set('babip', -1, 0.25, 0.37, shift());
      p.stamina = clamp(p.stamina + (a <= 25 ? 1.2 : a >= 33 ? -1.5 : 0) + gauss(r, 0, 1.2), 25, 75);
    }
    if (p.peak !== undefined) p.pot = clamp((p.peak - this.ovr(p)) / 30, 0, 1.4);
    return this.ovr(p) - old;
  };
  /* 은퇴 확률: 나이 + 능력치. 에이징 구간에서도 능력치가 높은 선수는 오래 뛴다(42세 일괄 은퇴 폐지) */
  proto.retireChance = function (p) {
    const o = this.ovr(p), a = p.age; if (a >= 48) return 1; if (a < 35) return 0;
    let c = a >= 42 ? 0.35 + 0.1 * (a - 42) : 0.07 * (a - 34);
    c += o < 45 ? 0.25 : o < 50 ? 0.1 : 0;
    c -= o >= 70 ? 0.4 : o >= 65 ? 0.3 : o >= 60 ? 0.2 : o >= 55 ? 0.1 : 0;
    return clamp(c, 0.02, 0.97);
  };

  /* ---------------- 신인 생성 ---------------- */
  /* ---------------- 신인 잠재력(최종 도달 능력치, 확률 분포) ----------------
   * 드래프트 순번과 무관하게 선수마다 숨은 '정점 OVR'(peak)을 확률로 뽑는다. 스카우트 평가(scout.ceil)는 정점 + 오차(σ=16)라서
   * 높은 순번일수록 정점이 높을 가능성은 크지만 확정은 아니다(1라운드 실패·하위 지명 대박 모두 가능). */
  const TIERS = [   // [이름, 확률, 정점 OVR 범위]
    ['슈퍼스타', 0.025, 68, 80], ['확실한 주전', 0.12, 57, 67.9], ['준주전', 0.25, 48, 56.9], ['후보', 0.38, 38, 47.9], ['육성', 0.225, 28, 37.9]
  ];
  /* tilt: 지명 순위·계약금 등 사전 평가에 따른 기울기(0=무관). 등급 확률 ∝ 기본확률 × exp(tilt × [2,1,0,-1,-2]) — 확률만 바뀌고 결과는 열려 있다 */
  proto.rollPeak = function (r, tilt) {
    const q = [2, 1, 0, -1, -2], w = TIERS.map((t, i) => t[1] * Math.exp((tilt || 0) * q[i])), tot = w.reduce((a, b) => a + b, 0);
    let x = r.random() * tot; for (let i = 0; i < TIERS.length; i++) { if ((x -= w[i]) < 0) return TIERS[i][2] + (TIERS[i][3] - TIERS[i][2]) * r.random(); }
    return 36;
  };
  proto.tierLabel = function (v) { return v >= 68 ? '슈퍼스타급' : v >= 57 ? '확실한 주전급' : v >= 48 ? '준주전급' : v >= 38 ? '후보급' : '육성급'; };
  /* 능력치를 gain만큼 이동(1.0 ≈ OVR +14 정도). 잠재력 정렬과 성장에 공통 사용 */
  proto._gain = function (p, g, r, noise) {
    const sc = this.S.calib.scale[p.type], n = () => (noise ? gauss(r, 0, noise) : 0), set = (f, dir, lo, hi) => { p.p[f] = clamp(p.p[f] + dir * (g * 0.75 + n()) * sc[f][1], lo, hi); };
    if (p.type === 'B') { set('k', -1, 0.06, 0.45); set('bb', 1, 0.015, 0.20); set('hr', 1, 0.002, 0.07); set('babip', 1, 0.24, 0.39); set('xbh', 1, 0.10, 0.32); }
    else { set('k', 1, 0.08, 0.40); set('bb', -1, 0.02, 0.18); set('hr', -1, 0.004, 0.06); set('babip', -1, 0.25, 0.37); }
  };
  /* ---------------- 2027 신인 드래프트 지명 결과(실제) ----------------
   * 순번·라운드·계약금으로 정점 확률을 기울인다(1라운드 +0.9 … 11라운드 −0.3, 계약금은 2.5억 초과분 ×0.12, 최대 +1.2). 능력치는 가상(확률적). */
  const DRAFT_TILT = [0.9, 0.45, 0.25, 0.1, 0.1, 0, 0, -0.15, -0.15, -0.3, -0.3];
  const TWOYR = ['동의과학대', '부산과학기술대', '동원과학기술대', '강릉영동대', '김포대'];
  proto._addDraftClass = function (list) {
    if (!list || !list.length) return;
    const S = this.S, r = rngFor(S.seed, 2027, 61);
    for (const d of list) {
      const parts = d.school.split('-').map(x => x.replace('[얼리]', '')), univ = parts.filter(x => /대$/.test(x) && x !== '메이저리그')[0];
      let by = d.birthYear, ageEst = false; if (!by) { by = /\[얼리\]/.test(d.school) ? 2006 : univ ? (TWOYR.includes(univ) ? 2005 : 2004) : 2008; ageEst = !d.birthYear; }
      const type = d.pos === '투수' || d.pos === '투타겸업' ? 'P' : 'B', pos = { 포수: 'C' }[d.pos] || (d.pos === '내야수' ? ['1B', '2B', '3B', 'SS'][Math.floor(r.random() * 4)] : d.pos === '외야수' ? ['LF', 'CF', 'RF'][Math.floor(r.random() * 3)] : undefined);
      // 이미 데이터에 있는 선수(예: 울산 웨일즈 출신 최지만)는 새로 만들지 않고 구단만 옮긴다
      const ex = Object.values(S.players).find(p => p.ko === d.name && p.team === 'Whales' && p.type === type);
      if (ex) { S.fteams.Whales.ids = S.fteams.Whales.ids.filter(x => x !== ex.id); ex.team = d.team; S.teams[d.team].ids.push(ex.id); ex.rookie = S.year; ex.draft = { round: d.round, school: d.school }; if (d.name === '최지만') { ex.age = 2027 - 1991; ex.birth = '1991-05-26'; delete ex.ageEst; } continue; }
      const tilt = DRAFT_TILT[d.round - 1] + (d.bonus ? Math.min(1.2, 0.12 * Math.max(0, d.bonus - 2.5)) : 0);
      const p = this.makeRookie(r, type, pos, { name: d.name, age: 2027 - by, tilt });
      p.team = d.team; p.rookie = S.year; p.draft = { round: d.round, school: d.school }; if (d.bonus) p.bonus = d.bonus; if (d.name === '윤예성') p.bonusUnknown = true; if (d.pos === '투타겸업') p.twoWay = true; if (ageEst) p.ageEst = true;
      p.contract = { salary: 0.3, years: 3 }; p.fa.univ = !!univ; S.teams[d.team].ids.push(p.id);
    }
    this.invalidate();
  };

  proto.scoutScore = function (p) { return 0.35 * p.scout.o + 0.65 * p.scout.ceil; };
  proto.makeRookie = function (r, type, forcePos, opts) {
    opts = opts || {};
    const S = this.S, sc = S.calib.scale[type], lb = S.calib.lb, id = (type === 'B' ? 'B' : 'P') + (S.nextId++);
    const g = gauss(r, 0, 0.5), z = () => -1.1 + g + gauss(r, 0, 0.6);
    let name = opts.name; if (!name) do { name = SURN[Math.floor(r.random() * SURN.length)] + GIV[Math.floor(r.random() * GIV.length)]; } while (this._nameTaken && this._nameTaken.has(name) && this._nameTaken.size < 800);
    (this._nameTaken = this._nameTaken || new Set()).add(name);
    const age = opts.age || 18 + Math.min(5, Math.floor(r.random() * r.random() * 6 + r.random() * 2));
    const p = { id, type, name, ko: name, team: 'DRAFT', age, rookie: S.year + 1, foreign: false, active: false, fat: 0, lastStart: -99, retired: false, pot: Math.max(0, gauss(r, 0.75, 0.5)), p: {} };
    if (type === 'B') {
      const cl = (v, a, b) => clamp(v, a, b);
      p.p = { k: cl(sc.k[0] - z() * sc.k[1], .08, .40), bb: cl(sc.bb[0] + z() * sc.bb[1], .02, .17), hr: cl(sc.hr[0] + z() * sc.hr[1], .002, .06), babip: cl(sc.babip[0] + z() * sc.babip[1], .25, .37), xbh: cl(sc.xbh[0] + z() * sc.xbh[1], .12, .30), sba: cl(sc.sba[0] + z() * sc.sba[1], .01, .2), hbp: lb.hbp * (0.6 + 0.8 * r.random()), tri: lb.tri * (0.6 + 0.9 * r.random()), sbp: cl(lb.sbp - 0.04 + gauss(r, 0, 0.07), .5, .9) };
      let x = r.random() * POSW.reduce((a, b) => a + b[1], 0), pos = 'LF'; for (const [q, w] of POSW) { if ((x -= w) < 0) { pos = q; break; } }
      if (forcePos) pos = forcePos;
      p.pos = pos; p.gs = pos === 'DH' ? {} : { [pos]: 40 }; p.fr = {}; if (pos !== 'DH') p.fr[pos] = { range: clamp(50 + gauss(r, 0, 7), 28, 75), err_reg: S.calib.fielding.lg.err[pos] * clamp(1 + gauss(r, 0, 0.25), 0.5, 1.8) };
      if (pos === 'C') p.cs = clamp(S.calib.fielding.lg.cs + gauss(r, 0, 0.04), 0.1, 0.4);
      p.PA = 12; p.G = 10;
    } else {
      p.p = { k: clamp(sc.k[0] + z() * sc.k[1], .08, .35), bb: clamp(sc.bb[0] - z() * sc.bb[1], .03, .16), hr: clamp(sc.hr[0] - z() * sc.hr[1], .006, .05), babip: clamp(sc.babip[0] - z() * sc.babip[1], .26, .36), hbp: lb.hbp * (0.7 + 0.6 * r.random()) };
      p.stamina = clamp(gauss(r, 45, 12), 25, 70); p.role = p.stamina >= 50 && r.random() < 0.7 ? 'SP' : 'RP'; p.GS = 0; p.G = 5; p.IP = 8; p.ipgs = null;
    }
    if (type === 'B') p.bats = r.random() < 0.06 ? 'S' : r.random() < 0.35 ? 'L' : 'R'; else p.throws = r.random() < 0.27 ? 'L' : 'R';   // 가상 신인의 투타
    p.contract = { salary: 0.3, years: 3 }; p.fa = { svc: 0, used: 0, last: null, regDays: 0, rem: 0, univ: false }; p.salHist = [0.3];
    S.players[id] = p;
    p.peak = this.rollPeak(r, opts.tilt);   // 숨은 정점 OVR
    const target = Math.min(clamp(p.peak - (27 - p.age) * 2.0 - 4 + gauss(r, 0, 7), 20, p.peak), 38 + (p.age - 18) * 4);   // 어린 신인이 곧바로 주전급이 되지 않도록 현재 능력치 상한   // 현재 능력치를 정점에 맞춰 정렬(어릴수록 격차 큼)
    for (let k = 0; k < 5; k++) { const g = (target - this.ovr(p)) / 14; if (Math.abs(g) < 0.08) break; this._gain(p, g, r, 0); }
    p.pot = clamp((p.peak - this.ovr(p)) / 30, 0, 1.4);
    p.scout = { o: this.ovr(p) + Math.round(gauss(r, 0, 3)), ceil: clamp(p.peak + gauss(r, 0, 16), 25, 85) };
    S.players[id] = p; return p;
  };
  proto.potGrade = function (v) { return v >= 1.3 ? 'A' : v >= 0.9 ? 'B' : v >= 0.55 ? 'C' : v >= 0.25 ? 'D' : 'E'; };

  /* ---------------- 오프시즌 ---------------- */
  proto.askSalary = function (p) { return Math.max(0.3, Math.round(this.price(p) * (p.age >= 34 ? 0.9 : 1.12) * 10) / 10); };
  proto.release = function (t, id, exercise) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== t) return;
    p.faInfo = { from: t, grade: exercise && !p.foreign ? this.faGrade(p, t) : null, prev: p.contract.salary };   // FA 자격이 있으면 등급·보상 정보를 남긴다
    S.teams[t].ids = S.teams[t].ids.filter(x => x !== id); p.active = false; p.team = 'FA'; p.contract = { salary: this.askSalary(p), years: 1 };
    S.fa = S.fa || []; S.fa.push(id); this.invalidate(); if (t === S.userTeam) this.repairSettings(t);
  };
  proto.removeFromTeam = function (t, id) { const S = this.S; if (!S.teams[t]) { if (S.fteams && S.fteams[t]) S.fteams[t].ids = S.fteams[t].ids.filter(x => x !== id); else S.mil = (S.mil || []).filter(x => x !== id); return; } S.teams[t].ids = S.teams[t].ids.filter(x => x !== id); };

  proto.startOffseason = function () {
    const S = this.S, r = rngFor(S.seed, S.year, 31), user = S.userTeam, rep = { prog: [], retired: [], expiring: [] };
    const st = this.standings(); S.history.push({ year: S.year, champion: S.post ? S.post.champion : null, runnerUp: S.post ? S.post.runnerUp : null, userRank: st.find(x => x.team === user).rank, userRec: st.find(x => x.team === user), top: st.slice(0, 5).map(x => x.team) });
    this.mergeTracking();
    // 0) 경쟁균형세 정산(시즌 종료 시점 연봉 기준)
    { const log = this.settleCBT(), my = log.find(x => x.team === user);
      if (my.kind === 'over') news(this, `경쟁균형세: 연봉 ${my.pay}억이 상한 ${my.cap}억을 초과(${my.n}회 연속) → 야구발전기금 ${my.fee}억 납부${my.drop ? ', 다음 드래프트 1라운드 지명 9단계 하락' : ''}`);
      else if (my.kind === 'under') news(this, `경쟁균형세: 연봉 ${my.pay}억이 하한 ${my.fl}억에 미달(${my.n}회 연속) → 유소년 발전기금 ${my.fee}억 납부`);
    }
    // 1) 성장·노화
    for (const id in S.players) {
      const p = S.players[id]; if (p.retired || p.team === 'DRAFT') continue;
      const d = this.progress(p, rngFor(S.seed, S.year, 32, parseInt(id.slice(1))), this.playShare(p));
      if (p.team === user) rep.prog.push({ id, d });
    }
    // 2) 은퇴
    for (const id in S.players) {
      const p = S.players[id]; if (p.retired || p.team === 'DRAFT') continue;
      if (rngFor(S.seed, S.year, 33, parseInt(id.slice(1))).random() < this.retireChance(p)) {
        p.retired = true; if (p.team !== 'FA') this.removeFromTeam(p.team, id); else S.fa = (S.fa || []).filter(x => x !== id);
        if (p.team === user) { rep.retired.push(id); news(this, `${p.ko}(${p.age}세) 은퇴`); } p.team = 'RET'; p.active = false;
      }
    }
    this._closeSeason();   // 1군 등록일수 → FA 자격 연수, 연봉 이력
    // 3) 계약 만료
    for (const t of TEAMS) for (const id of S.teams[t].ids.slice()) {
      const p = S.players[id]; p.contract.years -= 1; if (p.contract.years > 0) continue;
      if (t === user) { rep.expiring.push(id); continue; }
      const o = this.ovr(p), elig = this.faEligible(p), keep = r.random() < (elig || p.foreign ? clamp(0.25 + (o - 40) * 0.025 - (p.age >= 34 ? 0.25 : 0), 0.08, 0.72) : 0.9);   // FA 자격자는 시장에 나올 수 있고, 미자격자는 구단이 계속 보유(재계약 우선)
      let ask = this.askSalary(p); if (p.foreign) ask = Math.min(ask, p.faInfo ? 1e9 : Math.max(FOREIGN_NEW[p.aq ? 'aq' : 'gen'], p.contract.salary + FOREIGN_RAISE[p.aq ? 'aq' : 'gen']));
      const over = this.cbtPay(t) + Math.max(0, ask - p.contract.salary) * (S.calib.cbtK || 1) > this.cbtCap() * 0.97;   // AI 구단은 상한을 넘기는 재계약은 하지 않는다
      if (keep && !over) { p.contract = { salary: ask, years: p.foreign ? 1 : 1 + Math.floor(r.random() * 3) }; p.salHist = (p.salHist || []).slice(-2).concat([ask]); } else { this.release(t, id, true); }
    }
    S.phase = 'offseason'; S.off = { step: 'review', rep, year: S.year + 1, draft: null, fa: S.fa || [] };
    this.repairSettings(user); this.invalidate();
    return S.off;
  };
  proto.resign = function (id, years) {
    const S = this.S, p = S.players[id], ask = this.askSalary(p), off = S.off;
    if (!off || !off.rep.expiring.includes(id)) return '재계약 대상이 아닙니다.';
    const t = S.userTeam;
    p.contract = { salary: ask, years: clamp(years || 2, 1, 4) }; off.rep.expiring = off.rep.expiring.filter(x => x !== id); news(this, `${p.ko} 재계약 (${ask}억, ${p.contract.years}년)`); return null;
  };
  proto.finishContracts = function () {   // 재계약하지 않은 선수는 FA 시장으로
    const S = this.S, off = S.off; for (const id of off.rep.expiring.slice()) this.release(S.userTeam, id, true);
    off.rep.expiring = []; off.fa = S.fa; this.invalidate();
  };

  /* ---------- 드래프트 ---------- */
  proto.buildDraft = function () {
    const S = this.S, r = rngFor(S.seed, S.year, 41), pool = [];
    for (let i = 0; i < 120; i++) pool.push(this.makeRookie(r, i % 2 === 0 ? 'B' : 'P').id);
    const st = this.standings().slice().reverse().map(x => x.team), order = [], st1 = st.slice();
    for (const t of st) if (S.cbt && S.cbt.drop && S.cbt.drop[t]) { const i = st1.indexOf(t); st1.splice(i, 1); st1.splice(Math.min(i + 9, st1.length), 0, t); }   // 경쟁균형세 3회 연속 초과: 1라운드 지명 9단계 하락
    order.push(...st1); for (let k = 1; k < 10; k++) order.push(...st);
    S.off.draft = { pool, order, pick: 0, picks: [], rounds: 10 }; return S.off.draft;
  };
  proto.draftOnClock = function () { const d = this.S.off.draft; return d.pick < d.order.length ? d.order[d.pick] : null; };
  proto._draftTake = function (t, id) {
    const S = this.S, d = S.off.draft, p = S.players[id]; d.pool = d.pool.filter(x => x !== id); p.team = t; p.contract = { salary: 0.3, years: 3 }; S.teams[t].ids.push(id);
    d.picks.push({ pick: d.pick + 1, team: t, id }); d.pick++; this.invalidate();
    if (t === S.userTeam) news(this, `드래프트 ${Math.ceil(d.pick / 10)}라운드: ${p.ko} 지명`);
    if (S.teams[t].ids.length > ROSTER_MAX) { const worst = S.teams[t].ids.map(x => S.players[x]).filter(x => x.id !== id && !x.active).sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; if (worst) { if (t === S.userTeam) { /* 사용자 팀은 직접 정리 */ } else this._retireOrRelease(t, worst.id); } }
  };
  proto._retireOrRelease = function (t, id) { const p = this.S.players[id]; this.removeFromTeam(t, id); p.retired = true; p.team = 'RET'; p.active = false; };
  proto.draftAiUntilUser = function () {
    const S = this.S, d = S.off.draft, r = rngFor(S.seed, S.year, 42);
    while (d.pick < d.order.length) {
      const t = d.order[d.pick]; if (t === S.userTeam) return true;
      const best = d.pool.map(id => { const p = S.players[id]; return { id, s: this.scoutScore(p) + gauss(r, 0, 2) }; }).sort((a, b) => b.s - a.s)[0];
      this._draftTake(t, best.id);
    }
    return false;
  };
  proto.draftPick = function (id) {
    const S = this.S, d = S.off.draft; if (this.draftOnClock() !== S.userTeam) return '아직 내 순서가 아닙니다.';
    if (!d.pool.includes(id)) return '이미 지명된 선수입니다.'; if (S.teams[S.userTeam].ids.length >= ROSTER_MAX) return `보유 선수 ${ROSTER_MAX}명 제한입니다. 먼저 선수를 정리하세요.`;
    this._draftTake(S.userTeam, id); return null;
  };
  proto.draftAutoRest = function () {   // 내 순서도 자동 지명(추천 순)
    const S = this.S, d = S.off.draft;
    while (d.pick < d.order.length) { if (this.draftOnClock() === S.userTeam) { if (S.teams[S.userTeam].ids.length >= ROSTER_MAX) { d.pick++; continue; } const best = d.pool.map(id => ({ id, s: this.scoutScore(S.players[id]) })).sort((a, b) => b.s - a.s)[0]; this._draftTake(S.userTeam, best.id); } else this.draftAiUntilUser(); }
  };
  proto.finishDraft = function () {
    const S = this.S, d = S.off.draft; for (const id of d.pool) { S.players[id].retired = true; S.players[id].team = 'RET'; } d.pool = [];
  };

  /* ---------- FA ---------- */

  /* ---------------- KBO FA 제도 ----------------
   * 자격: 고졸 8시즌/대졸 7시즌(1군 등록 145일 이상이 1시즌, 모자란 해는 합산), 행사 후 4시즌 추가.
   * 등급(최근 3년 연봉 순위): A(팀 3위 이내 & 리그 30위 이내) / B(팀 10위 이내 & 리그 60위 이내) / C(그 외, 만 35세 이상).
   *   재자격: 직전 A·B였던 두 번째 FA는 B, 세 번째 이상이거나 직전 C는 C. 보상: A 보호 20명 + 전년 연봉 200% 또는 300%, B 25명 + 100% 또는 200%, C 150%(선수 없음).
   * 외부 FA 영입은 구단당 스토브리그 3명. 외국인: 일반 3명(같은 포지션 3명 불가) + 아시아쿼터 1명, 신규 상한 100만$(14억)·AQ 20만$(2.8억). */
  const FA_REG_DAYS = 145, EXT_LIMIT = 3, FOREIGN_NEW = { gen: 14, aq: 2.8 }, FOREIGN_RAISE = { gen: 7, aq: 1.4 };
  const FSUR = ['카르', '로페', '미첼', '스미', '브라', '윌슨', '존슨', '해리', '터너', '로저', '필립', '데이', '콜린', '다니', '레이', '헤이', '모리', '샌더', '프레', '그랜'], FGIV = ['스', '슨', '즈', '트', '드', '로', '닐', '크'];
  proto.faReq = function (p) { return p.fa.used > 0 ? 4 : (p.fa.univ ? 7 : 8); };
  proto.faEligible = function (p) { return !!(p.fa && !p.foreign && p.fa.svc >= this.faReq(p)); };
  proto.faSeasonsLeft = function (p) { return p.fa ? Math.max(0, Math.ceil(this.faReq(p) - p.fa.svc)) : null; };
  proto._salAvg = function (p) { const h = p.salHist && p.salHist.length ? p.salHist : [p.contract.salary]; return h.reduce((a, b) => a + b, 0) / h.length; };
  /* 등급 산정(팀 내·리그 연봉 순위는 최근 3년 평균 연봉) */
  proto.faGrade = function (p, team) {
    if (!this.faEligible(p)) return null;
    if (p.fa.used >= 2 || p.fa.last === 'C') return 'C';
    if (p.fa.used === 1) return (p.fa.last === 'A' || p.fa.last === 'B') ? 'B' : 'C';
    if (p.age >= 36) return 'C';   // 만 35세 이상
    const ranks = this._salRanks(), tr = ranks.team[p.id], lr = ranks.league[p.id];
    if (tr <= 3 && lr <= 30) return 'A';
    if (tr <= 10 && lr <= 60) return 'B';
    return 'C';
  };
  proto._salRanks = function () {
    const S = this.S, key = S.year + ':' + S.day + ':' + S.phase + ':' + (S.off ? S.off.step : '');
    if (this._rk && this._rk.key === key && this._rk.n === Object.keys(S.players).length) return this._rk;
    const team = {}, all = [];
    for (const t of TEAMS) { const l = this.players(t).slice().sort((a, b) => this._salAvg(b) - this._salAvg(a)); l.forEach((p, i) => { team[p.id] = i + 1; all.push(p); }); }
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
      if (p.rookie === S.year || p.draft) svc = 0;
      if (p.team === 'MIL') svc = Math.max(0, svc - 1.5);
      p.fa = { svc: Math.round(svc * 10) / 10, used: 0, last: null, regDays: 0, rem: 0, univ: !!(p.draft && /대/.test(p.draft.school.replace('메이저리그', ''))), est: true };
      if (p.ct && p.ct.from && p.ct.from <= 2026) { p.fa.used = p.age >= 37 ? 2 : 1; p.fa.svc = Math.max(0, 2026 - p.ct.from + 1); p.fa.last = p.ct.total >= 60 ? 'A' : p.ct.total >= 30 ? 'B' : 'C'; }
      else if (p.ct && p.ct.from === 2027) { p.fa.used = 1; p.fa.svc = 0; p.fa.last = p.ct.total >= 60 ? 'A' : 'B'; }
      p.salHist = [p.contract.salary, p.contract.salary, p.contract.salary];   // 최근 3년 연봉(자료는 2026년뿐이라 같은 값으로 가정)
      if (p.foreign) p.contract.years = 1;
    }
    this._initForeign();
  };
  /* 외국인 슬롯: 팀당 일반 3명(같은 포지션 3명 불가) + 아시아쿼터 1명. 넘치는 선수는 시장(자유계약)으로 */
  proto.foreignOf = function (t) { return this.players(t).filter(p => p.foreign); };
  proto.foreignOK = function (t, p) {
    const f = this.foreignOf(t); if (p.aq) return f.filter(x => x.aq).length < 1;
    const g = f.filter(x => !x.aq); if (g.length >= 3) return false; return !(g.length === 2 && g.every(x => x.type === p.type));
  };
  proto._initForeign = function () {
    const S = this.S;
    for (const t of TEAMS) {
      const f = this.foreignOf(t).sort((a, b) => (b.reg1 ? 1 : 0) - (a.reg1 ? 1 : 0) || this.war(b) - this.war(a)), keep = [];
      const aq = f.filter(p => p.aq)[0]; if (aq) keep.push(aq);
      const gen = f.filter(p => !p.aq); let pick = gen.slice(0, 3);
      if (pick.length === 3 && pick.every(p => p.type === pick[0].type)) { const alt = gen.slice(3).find(p => p.type !== pick[0].type); if (alt) pick[2] = alt; else pick = pick.slice(0, 2); }
      keep.push(...pick);
      for (const p of f) if (!keep.includes(p)) { S.teams[t].ids = S.teams[t].ids.filter(x => x !== p.id); p.team = 'FA'; p.active = false; p.faInfo = { from: t, grade: null, prev: p.contract.salary }; (S.fa = S.fa || []).push(p.id); }
    }
  };
  proto.foreignCap = function (p, t) {
    const k = p.aq ? 'aq' : 'gen', base = FOREIGN_NEW[k];
    return p.faInfo && p.faInfo.from === t ? Math.max(base, (p.faInfo.prev || 0) + FOREIGN_RAISE[k]) : base;
  };
  proto.makeForeign = function (r, type, aq) {
    const p = this.makeRookie(r, type), tg = aq ? 46 + gauss(r, 0, 4) : 55 + gauss(r, 0, 5);
    p.age = 25 + Math.floor(r.random() * 7); p.peak = undefined; delete p.peak; delete p.scout; p.pot = 0; p.rookie = undefined; p.foreign = true; p.aq = !!aq; p.draft = undefined;
    for (let k = 0; k < 8; k++) { const g = (tg - this.ovr(p)) / 14; if (Math.abs(g) < 0.06) break; this._gain(p, g, r, 0); }
    p.name = p.ko = FSUR[Math.floor(r.random() * FSUR.length)] + FGIV[Math.floor(r.random() * FGIV.length)]; p.stamina = Math.max(p.stamina || 0, 45);
    p.fa = { svc: 0, used: 0, last: null, regDays: 0, rem: 0 }; p.contract = { salary: aq ? 2.8 : 10, years: 1 }; p.salHist = [p.contract.salary];
    return p;
  };
  /* AI 구단의 외국인 슬롯 보충: 시장의 외국인 → 없으면 새로 영입 */
  proto._fillForeign = function (t, r) {
    const S = this.S;
    for (const aq of [false, true]) for (let k = 0; k < 3; k++) {
      const have = this.foreignOf(t).filter(x => !!x.aq === aq).length; if (have >= (aq ? 1 : 3)) break;
      let cand = this.faList().filter(x => x.foreign && !!x.aq === aq && this.foreignOK(t, x)).sort((a, b) => this.war(b) - this.war(a))[0];
      if (!cand) { const tp = this.foreignOf(t).filter(x => !x.aq && x.type === 'P').length >= 2 ? 'B' : (this.foreignOf(t).filter(x => !x.aq && x.type === 'B').length >= 1 ? 'P' : (r.random() < 0.7 ? 'P' : 'B')); cand = this.makeForeign(r, tp, aq); cand.team = 'FA'; (S.fa = S.fa || []).push(cand.id); }
      if (!this.foreignOK(t, cand)) break;
      const cap = this.foreignCap(cand, t), ask = Math.min(cap, Math.max(this.askSalary(cand), aq ? 2 : 6));
      this._doSign(t, cand, 1, ask);
    }
  };
  /* 공통 영입 처리: 팀 이동·계약·FA 행사(재취득 연수 리셋)·보상 */
  proto._doSign = function (t, p, years, ask) {
    const S = this.S, info = p.faInfo, graded = info && info.grade, comp = graded && info.from !== t ? graded : null;
    S.fa = (S.fa || []).filter(x => x !== p.id); p.team = t; p.active = false; S.teams[t].ids.push(p.id);
    p.contract = { salary: ask, years: p.foreign ? 1 : years }; p.salHist = (p.salHist || []).slice(-2).concat([ask]);
    if (graded && p.fa) { p.fa.used += 1; p.fa.last = graded; p.fa.svc = 0; p.fa.rem = 0; }
    if (comp) { this._faCount(t, 1); this._compensate(t, p, info); }
    p.faInfo = undefined; this.invalidate();
  };
  proto._faCount = function (t, d) { const S = this.S, k = S.off ? S.off.year : S.year; S.faSign = S.faSign && S.faSign.k === k ? S.faSign : { k, c: {} }; if (d) S.faSign.c[t] = (S.faSign.c[t] || 0) + d; return S.faSign.c[t] || 0; };
  /* 보상: 보호선수(A 20명·B 25명)를 뺀 가장 가치 높은 선수 또는 보상금. 원소속 구단이 선수가 쓸 만하면 선수, 아니면 보상금(옵션2) */
  proto._compensate = function (t, p, info) {
    const S = this.S, g = info.grade, prev = info.prev || 0, old = info.from, sc = { A: [20, 2, 3], B: [25, 1, 2], C: [0, 0, 1.5] }[g]; let msg;
    if (sc[0] > 0) {
      const pool = this.players(t).filter(x => x.id !== p.id && !x.foreign && x.rookie !== S.year).sort((a, b) => this.marketValue(b) - this.marketValue(a)), best = pool.slice(sc[0])[0];
      if (best && this.marketValue(best) >= 0.35 * this.marketValue(p) && S.teams[t].ids.length > ROSTER_MIN + 2) {
        S.teams[t].ids = S.teams[t].ids.filter(x => x !== best.id); best.team = old; best.active = false; S.teams[old].ids.push(best.id);
        msg = `보상선수 ${best.ko}(${old}) + 보상금 ${(prev * sc[1]).toFixed(1)}억`; if (old === S.userTeam || t === S.userTeam) this.refreshTeam(t === S.userTeam ? old : t);
      } else msg = `보상금 ${(prev * sc[2]).toFixed(1)}억`;
    } else msg = `보상금 ${(prev * sc[2]).toFixed(1)}억`;
    (S.compLog = S.compLog || []).push({ year: S.year, from: old, to: t, id: p.id, grade: g, text: msg }); if (S.compLog.length > 60) S.compLog.shift();
    if (old === S.userTeam || t === S.userTeam) news(this, `FA 보상(${g}등급 ${p.ko} ${old}→${t}): ${msg}`);
    this.invalidate();
  };
  /* 시즌 종료: 1군 등록일수로 FA 자격 연수 갱신, 연봉 이력 기록 */
  proto._closeSeason = function () {
    for (const p of Object.values(this.S.players)) {
      if (!p.fa || p.retired) continue;
      if (p.fa.regDays >= FA_REG_DAYS) p.fa.svc += 1; else { p.fa.rem += p.fa.regDays; while (p.fa.rem >= FA_REG_DAYS) { p.fa.svc += 1; p.fa.rem -= FA_REG_DAYS; } }
      p.fa.regDays = 0; p.fa.est = false;
      if (p.team in this.S.teams || p.team === 'MIL') p.salHist = (p.salHist || []).slice(-2).concat([p.contract.salary]);
    }
  };
  proto.faList = function () { const S = this.S; return (S.fa || []).map(id => S.players[id]).filter(p => p && p.team === 'FA'); };
  proto.signFA = function (id, years) {
    const S = this.S, p = S.players[id], t = S.userTeam; if (!p || p.team !== 'FA') return '이미 계약된 선수입니다.';
    if (S.teams[t].ids.length >= ROSTER_MAX) return `보유 선수 ${ROSTER_MAX}명 제한입니다.`;
    const info = p.faInfo, graded = info && info.grade, ext = graded && info.from !== t;
    if (ext && this._faCount(t) >= EXT_LIMIT) return `외부 FA는 한 시즌에 ${EXT_LIMIT}명까지만 영입할 수 있습니다.`;
    let ask = this.askSalary(p);
    if (p.foreign) { if (!this.foreignOK(t, p)) return p.aq ? '아시아쿼터는 구단당 1명입니다.' : '일반 외국인은 3명까지이며 같은 포지션 3명은 안 됩니다.'; ask = Math.min(ask, this.foreignCap(p, t)); }
    this._doSign(t, p, clamp(years || 2, 1, 4), ask);   // 상한 초과는 허용(시즌 종료 시 야구발전기금 부과)
    news(this, `FA ${p.ko} 영입 (${ask}억, ${p.contract.years}년${graded ? `, ${graded}등급` : ''})`); return null;
  };
  proto.finishFA = function () {   // AI 팀이 남은 FA를 영입하고 로스터를 채운다
    const S = this.S, r = rngFor(S.seed, S.year, 51), teams = TEAMS.filter(t => t !== S.userTeam).sort(() => r.random() - 0.5);
    for (const t of teams) {
      let n = 0; const need = k => this.players(t).filter(p => p.type === k).length;
      const pool = this.faList().sort((a, b) => this.war(b) - this.war(a));
      for (const p of pool) {
        if (this._faCount(t) >= EXT_LIMIT || S.teams[t].ids.length >= ROSTER_MAX - 4) break;
        if (p.foreign) continue;   // 외국인은 아래에서 슬롯별로 채운다
        let ask = this.askSalary(p); if (this.cbtPay(t) + ask * (S.calib.cbtK || 1) > this.cbtCap() * 0.97) continue; if (this.war(p) < 1.0) continue;   // AI 구단은 상한을 지킨다
        if (r.random() < (this.war(p) >= 2 ? 0.75 : 0.5)) this._doSign(t, p, 1 + Math.floor(r.random() * 3), ask);
      }
      this._fillForeign(t, r);
      // 연봉 하한(2027~) 미달이면 하한을 넘길 때까지 FA를 영입한다(미달 시 기금 납부를 피하려고)
      { const fl = this.cbtFloor(); if (fl !== null) for (let k = 0; k < 6 && this.cbtPay(t) < fl * 1.03 && S.teams[t].ids.length < ROSTER_MAX; k++) {
        const p = this.faList().filter(x => !x.foreign && !(x.faInfo && x.faInfo.grade && x.faInfo.from !== t && this._faCount(t) >= EXT_LIMIT) && this.cbtPay(t) + this.askSalary(x) * (S.calib.cbtK || 1) <= this.cbtCap() * 0.97).sort((a, b) => this.war(b) - this.war(a))[0]; if (!p) break;
        this._doSign(t, p, 1 + Math.floor(r.random() * 3), this.askSalary(p));
      } }
      // 핵심 포지션(포수·유격수·중견수·2루수·3루수)에 주포지션 선수가 2명 미만이면 보강
      for (const pos of ['C', 'SS', 'CF', '2B', '3B']) {
        while (this.hitters(t).filter(x => x.pos === pos).length < 2) {
          const fa = this.faList().filter(x => x.type === 'B' && x.pos === pos && !x.foreign && !(x.faInfo && x.faInfo.grade && x.faInfo.from !== t)).sort((a, b) => this.war(b) - this.war(a))[0], np = fa || this.makeRookie(r, 'B', pos);
          if (fa) S.fa = S.fa.filter(x => x !== fa.id); np.team = t; np.contract = { salary: Math.max(0.3, Math.min(this.askSalary(np), 0.8)), years: 1 }; S.teams[t].ids.push(np.id);
        }
      }
      // 최소 인원 보장
      for (const kind of ['B', 'P']) while (need(kind) < (kind === 'B' ? 24 : 26)) {
        const p = this.faList().filter(x => x.type === kind && !x.foreign && !(x.faInfo && x.faInfo.grade && x.faInfo.from !== t)).sort((a, b) => this.war(b) - this.war(a))[0] || this.makeRookie(r, kind);
        if (p.team === 'FA') S.fa = S.fa.filter(x => x !== p.id); p.team = t; p.contract = { salary: Math.max(0.3, Math.min(this.askSalary(p), 0.6)), years: 1 }; S.teams[t].ids.push(p.id);
      }
      while (S.teams[t].ids.length > ROSTER_MAX) { const w = this.players(t).sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; this._retireOrRelease(t, w.id); }
    }
    // 시장에 남은 선수: 나이 많고 가치 낮으면 은퇴
    for (const p of this.faList()) if (p.age >= 33 && this.war(p) < 0.6) { p.retired = true; p.team = 'RET'; S.fa = S.fa.filter(x => x !== p.id); }
    // FA 풀 정리: 가치 순 상위 70명만 남기고 나머지는 시장을 떠난다
    S.fa = (S.fa || []).filter(id => S.players[id].team === 'FA');
    const keep = new Set(this.faList().sort((a, b) => this.war(b) - this.war(a)).slice(0, 70).map(p => p.id));
    for (const id of S.fa.slice()) if (!keep.has(id)) { const p = S.players[id]; p.retired = true; p.team = 'RET'; }
    S.fa = S.fa.filter(id => keep.has(id));
    this.invalidate();
  };

  /* ---------------- 새 시즌 ---------------- */
  proto.ensureActive = function (t) {   // 1군 28명 유지(부족하면 가치 높은 선수로 채움, 초과하면 낮은 순으로 내림)
    const S = this.S, P = this.players(t);
    for (const p of P) if (!S.teams[t].ids.includes(p.id)) p.active = false;
    let act = P.filter(p => p.active);
    const need = () => ({ B: act.filter(p => p.type === 'B').length, P: act.filter(p => p.type === 'P').length, C: act.filter(p => p.pos === 'C').length });
    while (act.length > ACTIVE_MAX) { const w = act.sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; w.active = false; act = P.filter(p => p.active); }
    const fill = (pred, count) => { const c = P.filter(p => !p.active && pred(p)).sort((a, b) => this.marketValue(b) - this.marketValue(a)).slice(0, count); c.forEach(p => { p.active = true; }); act = P.filter(p => p.active); };
    let n = need();
    if (n.B < 13) fill(p => p.type === 'B', 13 - n.B); n = need();
    if (n.C < 2) fill(p => p.pos === 'C', 2 - n.C);
    n = need(); if (n.P < 13) fill(p => p.type === 'P', 13 - n.P);
    act = P.filter(p => p.active);
    if (act.length < ACTIVE_MAX) fill(() => true, ACTIVE_MAX - act.length);
    act = P.filter(p => p.active); while (act.length > ACTIVE_MAX) { const w = act.filter(p => p.type === 'B').sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; w.active = false; act = P.filter(p => p.active); }
  };
  /* 울산 웨일즈(퓨처스 전용): 은퇴로 줄어든 선수를 신인으로 채워 규모(타자 24·투수 22 이상)를 유지 */
  proto.topUpWhales = function () {
    const S = this.S, w = S.fteams && S.fteams.Whales; if (!w || w.ids.length < 20) return;
    const r = rngFor(S.seed, S.year, 61), cnt = k => w.ids.filter(id => S.players[id] && S.players[id].type === k).length;
    for (const k of ['B', 'P']) while (cnt(k) < (k === 'B' ? 24 : 22)) { const p = this.makeRookie(r, k); p.team = 'Whales'; p.rookie = undefined; p.contract = { salary: 0.3, years: 2 }; w.ids.push(p.id); }
    this.invalidate();
  };
  proto.startNewSeason = function () {
    const S = this.S; S.year += 1; S.off = null; S.fa = (S.fa || []);
    for (const id in S.players) if (S.players[id].retired || S.players[id].team === 'RET') delete S.players[id];   // 은퇴·이탈 선수 정리(저장 용량)
    this.finishFA === undefined; const adj = this.normalizeTalent(); S.lastAdj = adj;
    for (const t of TEAMS) if (t === S.userTeam) this.ensureActive(t);
    this.topUpWhales();
    this.returnMilitary(S.year * 12 + 2);   // 새 시즌 개막(3월) 전까지 전역한 선수 복귀
    this.newSeasonSetup(false); this.repairSettings(S.userTeam);
    const cap = S.calib.cap; S.calib.cap = cap;
    news(this, `${S.year} 시즌 개막 준비`);
  };

  /* ---------------- 트레이드 ---------------- */
  proto.canTrade = function () { const S = this.S; if (S.phase === 'offseason') return true; if (S.phase === 'preseason') return true; if (S.phase === 'regular' || S.phase === 'regular_done') return S.day < LIM_DEADLINE; return false; };
  proto.tradeValue = function (p, aiTeam) { let v = this.marketValue(p); if (p.team === aiTeam) v *= 1.18; return v; };
  proto.evaluateTrade = function (aiTeam, give, get) {
    const S = this.S, me = S.userTeam; if (!this.canTrade()) return { ok: false, why: S.phase === 'post' || S.phase === 'post_done' ? '포스트시즌에는 트레이드할 수 없습니다.' : `트레이드 마감(${LIM_DEADLINE}일차) 이후에는 할 수 없습니다.` };
    if (!give.length || !get.length) return { ok: false, why: '양쪽에서 최소 1명씩 선택하세요.' };
    const gp = give.map(id => S.players[id]), tp = get.map(id => S.players[id]);
    if (gp.some(p => p.team !== me) || tp.some(p => p.team !== aiTeam)) return { ok: false, why: '선수 소속이 올바르지 않습니다.' };
    const vGet = tp.reduce((a, p) => a + this.tradeValue(p, aiTeam), 0), vGive = gp.reduce((a, p) => a + this.tradeValue(p, aiTeam), 0);
    const aiN = S.teams[aiTeam].ids.length - tp.length + gp.length, myN = S.teams[me].ids.length + tp.length - gp.length;
    if (aiN > ROSTER_MAX || myN > ROSTER_MAX) return { ok: false, why: `보유 선수 ${ROSTER_MAX}명 제한을 넘습니다.` };
    if (aiN < ROSTER_MIN || myN < ROSTER_MIN) return { ok: false, why: `보유 선수 최소 ${ROSTER_MIN}명이 필요합니다.` };
    // AI 구단은 트레이드로 상한을 넘기지 않는다
    const aiPay = this.cbtPay(aiTeam) + (S.calib.cbtK || 1) * (gp.reduce((a, p) => a + (p.rookie === S.year || p.foreign ? 0 : p.contract.salary), 0) - tp.reduce((a, p) => a + (p.rookie === S.year || p.foreign ? 0 : p.contract.salary), 0));
    if (aiPay > this.cbtCap() && aiPay > this.cbtPay(aiTeam)) return { ok: false, why: `${aiTeam} 구단이 연봉 상한(${this.cbtCap()}억)을 넘게 되어 수락하지 않습니다.` };
    // AI가 핵심 선수를 내줄 때는 더 큰 대가를 요구
    const star = tp.some(p => this.ovr(p) >= 65) ? 1.25 : 1.0, need = vGet * 1.12 * star + 0.1;
    return { ok: vGive >= need, vGive: Math.round(vGive * 10) / 10, vGet: Math.round(vGet * 10) / 10, need: Math.round(need * 10) / 10, why: vGive >= need ? null : `상대 구단이 받는 가치(${Math.round(vGive * 10) / 10})가 요구 수준(${Math.round(need * 10) / 10})에 못 미칩니다.` };
  };
  proto.executeTrade = function (aiTeam, give, get) {
    const S = this.S, ev = this.evaluateTrade(aiTeam, give, get); if (!ev.ok) return ev; const me = S.userTeam;
    for (const id of give) { this.removeFromTeam(me, id); S.players[id].team = aiTeam; S.players[id].active = false; S.teams[aiTeam].ids.push(id); }
    for (const id of get) delete S.players[id].aiGs;
    for (const id of get) { this.removeFromTeam(aiTeam, id); S.players[id].team = me; S.players[id].active = false; S.teams[me].ids.push(id); }
    news(this, `트레이드: ${give.map(i => S.players[i].ko).join(', ')} ↔ ${get.map(i => S.players[i].ko).join(', ')} (${aiTeam})`);
    this.refreshTeam(aiTeam); this.repairSettings(me); this.invalidate(); return ev;
  };
});
