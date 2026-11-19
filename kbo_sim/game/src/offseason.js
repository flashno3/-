/* KBO 감독 모드 오프시즌 + 트레이드
 * 성장·노화·은퇴 → 계약 만료/재계약 → 신인 드래프트 → FA 시장 → 새 시즌. 트레이드는 시즌 중(마감 전)과 오프시즌에 가능.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { factory(require('./league.js'), require('../../web/src/engine.js')); require('./negotiate.js'); require('./world.js'); require('./training.js'); require('./scout.js'); }
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { League, ORDER, ACTIVE_MAX, ROSTER_MAX, ROSTER_MIN, rngFor, clamp } = LG;
  const { TEAMS } = Engine;
  const SURN = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남'];
  const GIV = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준우', '현우', '도현', '건우', '우진', '승현', '민재', '재원', '태양', '성민', '동현', '진우', '유찬', '지훈', '수호', '현준', '재윤', '정우', '시윤', '은우', '준혁', '태윤', '민성', '승우', '하린', '찬영', '다온', '규민', '원준', '세훈', '상원'];
  const POSW = [['C', 10], ['1B', 8], ['2B', 11], ['3B', 11], ['SS', 12], ['LF', 14], ['CF', 12], ['RF', 14], ['DH', 8]];
  const gauss = (r, m, s) => r.gauss(m, s);
  const KO0 = { Bears: '두산', Twins: 'LG', Heroes: '키움', Landers: 'SSG', Wiz: 'KT', Eagles: '한화', Tigers: 'KIA', Giants: '롯데', Dinos: 'NC', Lions: '삼성' };
  const LIM_DEADLINE = 110;   // 트레이드 마감(일차)

  const proto = League.prototype;
  const news = (L, text) => { const S = L.S; S.news.unshift({ year: S.year, day: S.day, text }); if (S.news.length > 120) S.news.length = 120; if (L._storyFromNews) L._storyFromNews(text); };

  /* ---------------- 선수 성장 / 노화 ---------------- */
  const AGING_SCALE = 0.7;
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
    let gain = (a > 35 ? -.24 : curve) + gauss(r, 0, 0.09);
    if (gain < 0) gain *= AGING_SCALE;   // 노화 하락 완화(체감 하락폭 조정): 30~32세 약 −0.7, 33~35세 약 −2, 36세+ 약 −3 OVR/년
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
    const dv = a <= 28 && this.S.coach ? this._devEffects(p) : null;   // 육성 방향·코치진 효과(28세 이하)
    if (dv && gain > 0) gain *= dv.mul;
    const te = p.team === this.S.userTeam && this._trainEff ? this._trainEff(p) : { mult: 1, w: {}, speed: 0, range: 0, stamina: 0 };   // 시즌 중 훈련(팀·개별·캠프) 누적 효과
    if (gain > 0) gain *= te.mult; const tw = gain > 0 ? te.w : {};
    const shift = f => gain * 0.75 * (dv ? dv.w[f] || 1 : 1) * (tw[f] || 1) + gauss(r, 0, 0.07);
    const set = (f, dir, lo, hi, s) => { p.p[f] = clamp(p.p[f] + dir * s * sc[f][1], lo, hi); };
    if (p.type === 'B') {
      set('k', -1, 0.06, 0.45, shift('k')); set('bb', 1, 0.015, 0.20, shift('bb')); set('hr', 1, 0.002, 0.07, shift('hr')); set('babip', 1, 0.24, 0.39, shift('babip')); set('xbh', 1, 0.10, 0.32, shift('xbh'));
      const sp = (a <= 24 ? 0.04 : a <= 28 ? -0.05 : -0.2) + (dv ? dv.speed : 0) + (gain > 0 ? te.speed : 0) + gauss(r, 0, 0.08); set('sba', 1, 0.005, 0.25, sp); p.p.tri = clamp(p.p.tri * (1 + sp * 0.25), 0.01, 0.2);
      if (a >= 31) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range - 1.1 * r.random() * 1.6, 25, 80);
      else if (a <= 24) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range + 0.8 * r.random() * 1.6 + (dv ? dv.range : 0) + (gain > 0 ? te.range : 0), 25, 80);
      if (a > 24 && a < 31 && (dv && dv.range || gain > 0 && te.range)) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range + (dv ? dv.range : 0) + (gain > 0 ? te.range : 0), 25, 80);
    } else {
      set('k', 1, 0.08, 0.40, shift('k')); set('bb', -1, 0.02, 0.18, shift('bb')); set('hr', -1, 0.004, 0.06, shift('hr')); set('babip', -1, 0.25, 0.37, shift('babip'));
      p.stamina = clamp(p.stamina + (a <= 25 ? 1.2 : a >= 33 ? -1.5 : 0) + (dv ? dv.stamina : 0) + (gain > 0 ? te.stamina : 0) + gauss(r, 0, 1.2), 25, 75);
      if (dv) this._devRole(p, dv.plan);
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
  proto.rollPeak = function (r, tilt, prior) {   // prior: 슬롯별 실제 등급 분포(5개 확률), 없으면 기본 확률
    const q = [2, 1, 0, -1, -2], w = TIERS.map((t, i) => (prior ? prior[i] : t[1]) * Math.exp((tilt || 0) * q[i])), tot = w.reduce((a, b) => a + b, 0);
    let x = r.random() * tot; for (let i = 0; i < TIERS.length; i++) { if ((x -= w[i]) < 0) return TIERS[i][2] + (TIERS[i][3] - TIERS[i][2]) * r.random(); }
    return 36;
  };
  /* 2002~2017 신인 드래프트 1,528명의 실제 경력(통산 타석·이닝)으로 본 지명 슬롯별 최종 등급 분포 [슈퍼스타, 확실한 주전, 준주전, 후보, 육성급].
   * 등급 기준: 타자 통산 타석 5000/2500/1000/200, 투수 통산 이닝 1200/600/250/50 이상. 표본이 작은 슬롯은 기본 분포를 15% 섞는다. */
  const SLOT_PRIOR = { '1차': [0.124, 0.124, 0.143, 0.248, 0.362], 'R1top3': [0.083, 0.312, 0.25, 0.229, 0.125], 'R1': [0.098, 0.174, 0.174, 0.196, 0.359], 'R2': [0.058, 0.094, 0.174, 0.283, 0.391], 'R3': [0.036, 0.087, 0.116, 0.174, 0.587], 'R4': [0.007, 0.029, 0.109, 0.159, 0.696], 'R5': [0.008, 0.028, 0.044, 0.111, 0.809], '육성': [0.039, 0.039, 0.109, 0.305, 0.508] };
  const slotPrior = dh => {
    let k = 'R5'; if (dh) { if (dh.kind === '1차') k = '1차'; else if (dh.kind === '육성선수') k = '육성'; else if (dh.kind === '해외') k = 'R1'; else if (dh.round) k = dh.round === 1 ? (dh.pick && dh.pick <= 3 ? 'R1top3' : 'R1') : 'R' + Math.min(dh.round, 5); }
    return SLOT_PRIOR[k].map((v, i) => 0.85 * v + 0.15 * TIERS[i][1]);
  };
  const GROW = age => age <= 19 ? 17 : age === 20 ? 15 : age === 21 ? 12 : age === 22 ? 9 : age === 23 ? 6 : age === 24 ? 3.5 : age === 25 ? 1.5 : 0.5;   // 정점까지 남은 기대 성장(엔진 성장 곡선 기준 OVR)
  /* 현재 OVR·나이를 증거로 갱신한 정점 분포에서 표본 추출: 사전분포(슬롯) × 관측 가능도 N(현재 OVR; 정점 − 남은 성장, σ=5.5) */
  proto._posteriorPeak = function (r, ov, age, prior, n) {   // n: 표본 크기(투수 이닝·타자 타석 환산 0~1) — 표본이 작을수록 현재 OVR의 증거 가치가 낮다(σ 5.5 → 최대 13)
    const g = GROW(age), w = [], sd = 5.5 + 7.5 * Math.exp(-(n === undefined ? 1 : n)); let tot = 0;
    for (let pk = 28; pk <= 80; pk++) { const ti = TIERS.findIndex(t => pk >= t[2] && pk <= t[3] + 0.99), den = prior[ti < 0 ? 4 : ti] / (TIERS[ti < 0 ? 4 : ti][3] - TIERS[ti < 0 ? 4 : ti][2] + 1), z = (ov - (pk - g)) / sd, wt = pk >= ov ? den * Math.exp(-0.5 * z * z) : 0; w.push(wt); tot += wt; }
    if (!(tot > 0)) return clamp(ov + g, 25, 85);
    let x = r.random() * tot; for (let i = 0; i < w.length; i++) { if ((x -= w[i]) < 0) return 28 + i + r.random() * 0.99; }
    return clamp(ov + g, 25, 85);
  };
  /* 잠재력 등급(절대 정점 기준): A 슈퍼스타급(68+) · B 확실한 주전급(57+) · C 준주전급(48+) · D 후보급(38+) · E 육성급. 현재 OVR보다 낮게 표시되지 않는다 */
  proto.potLetter = function (p) {
    const est = Math.max(this.ovr(p), p.scout ? p.scout.ceil : p.peak !== undefined ? p.peak : this.ovr(p) + (p.pot || 0) * 30);
    return est >= 68 ? 'A' : est >= 57 ? 'B' : est >= 48 ? 'C' : est >= 38 ? 'D' : 'E';
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
    const S = this.S, r = rngFor(S.seed, 2027, 61), pk = {};
    for (const d of list) {
      const parts = d.school.split('-').map(x => x.replace('[얼리]', '')), univ = parts.filter(x => /대$/.test(x) && x !== '메이저리그')[0];
      let by = d.birthYear, ageEst = false; if (!by) { by = /\[얼리\]/.test(d.school) ? 2006 : univ ? (TWOYR.includes(univ) ? 2005 : 2004) : 2008; ageEst = !d.birthYear; }
      const type = d.pos === '투수' || d.pos === '투타겸업' ? 'P' : 'B', pos = { 포수: 'C' }[d.pos] || (d.pos === '내야수' ? ['1B', '2B', '3B', 'SS'][Math.floor(r.random() * 4)] : d.pos === '외야수' ? ['LF', 'CF', 'RF'][Math.floor(r.random() * 3)] : undefined);
      // 이미 데이터에 있는 선수(예: 울산 웨일즈 출신 최지만)는 새로 만들지 않고 구단만 옮긴다
      const ex = Object.values(S.players).find(p => p.ko === d.name && p.team === 'Whales' && p.type === type);
      if (ex) { S.fteams.Whales.ids = S.fteams.Whales.ids.filter(x => x !== ex.id); ex.team = d.team; S.teams[d.team].ids.push(ex.id); ex.rookie = S.year; ex.draft = { round: d.round, school: d.school }; if (d.name === '최지만') { ex.age = 2027 - 1991; ex.birth = '1991-05-26'; delete ex.ageEst; } continue; }
      const pickNo = (pk[d.round] = (pk[d.round] || 0) + 1), tilt = d.bonus ? Math.min(1.2, 0.12 * Math.max(0, d.bonus - 2.5)) : 0;   // 지명 슬롯은 실제 분포(사전), 계약금은 추가 기울기
      const p = this.makeRookie(r, type, pos, { name: d.name, age: 2027 - by, tilt, prior: slotPrior({ round: d.round, pick: pickNo }) });
      p.team = d.team; p.rookie = S.year; p.draft = { round: d.round, school: d.school }; if (d.bonus) p.bonus = d.bonus; if (d.name === '윤예성') p.bonusUnknown = true; if (d.pos === '투타겸업') p.twoWay = true; if (ageEst) p.ageEst = true;
      p.contract = { salary: 0.3, years: 1 }; p.fa.univ = !!univ; S.teams[d.team].ids.push(p.id);
    }
    this.invalidate();
  };

  proto.scoutScore = function (p) { return 0.35 * p.scout.o + 0.65 * p.scout.ceil; };
  proto.makeRookie = function (r, type, forcePos, opts) {
    opts = opts || {};
    const S = this.S, sc = S.calib.scale[type], lb = S.calib.lb, id = (type === 'B' ? 'B' : 'P') + (S.nextId++);
    const g = gauss(r, 0, 0.5), z = () => -1.1 + g + gauss(r, 0, 0.6);
    const nPl = Object.keys(S.players).length; if (!this._nameTaken || this._nameTakenS !== S || this._nameTakenN !== nPl) { this._nameTaken = new Set(Object.values(S.players).map(q => q.ko)); this._nameTakenS = S; }   // 선수 수가 바뀌면(다른 경로로 생긴 선수 포함) 다시 모은다   // 이미 있는 모든 선수 이름과 겹치지 않게(가상 신인이 실제 선수와 같은 이름이 되어 중복처럼 보이는 것을 막는다)
    let name = opts.name; if (!name) for (let k = 0; k < 60; k++) { name = SURN[Math.floor(r.random() * SURN.length)] + GIV[Math.floor(r.random() * GIV.length)]; if (!this._nameTaken.has(name)) break; }
    this._nameTaken.add(name); this._nameTakenN = nPl + 1;
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
    p.contract = { salary: 0.3, years: 1 }; p.fa = { svc: 0, used: 0, last: null, regDays: 0, rem: 0, univ: false }; p.salHist = [0.3];
    S.players[id] = p;
    p.peak = this.rollPeak(r, opts.tilt, opts.prior);   // 숨은 정점 OVR
    const target = Math.min(clamp(p.peak - (27 - p.age) * 2.0 - 4 + gauss(r, 0, 7), 20, p.peak), 38 + (p.age - 18) * 4);   // 어린 신인이 곧바로 주전급이 되지 않도록 현재 능력치 상한   // 현재 능력치를 정점에 맞춰 정렬(어릴수록 격차 큼)
    for (let k = 0; k < 5; k++) { const g = (target - this.ovr(p)) / 14; if (Math.abs(g) < 0.08) break; this._gain(p, g, r, 0); }
    p.pot = clamp((p.peak - this.ovr(p)) / 30, 0, 1.4);
    p.scout = { o: this.ovr(p) + Math.round(gauss(r, 0, 3)), ceil: clamp(p.peak + gauss(r, 0, 16), 25, 85) };
    S.players[id] = p; return p;
  };
  proto.potGrade = function (v) { return v >= 1.3 ? 'A' : v >= 0.9 ? 'B' : v >= 0.55 ? 'C' : v >= 0.25 ? 'D' : 'E'; };

  /* ---------------- 오프시즌 ---------------- */
  proto.askSalary = function (p) { return Math.max(0.3, Math.round(this.price(p) * (p.age >= 34 ? 0.9 : 1.12) * 10) / 10); };
  /* ---------------- FA 시장가·제시(계약금 포함) ----------------
   * 시장가(mv) = 연 보수(계약금 + 연봉 합계 ÷ 계약 연수). FA 승인 선수 풀에서 가치 순위(WAR + 최근 연봉 평균의 10%)를 매겨 실제 FA 계약 분포로 환산한다.
   * 2025·2026 FA 계약(연 보수): 1위권 25~28억 · 상위 10% 20억 · 20% 16.5억 · 35% 13억 · 중간 10억 · 65% 7.5억 · 80% 5억 · 하위 2.5억.
   * 선수는 제시 연 보수(= (계약금 + 연봉 × 연수) ÷ 연수)가 요구액 이상일 때만 응한다. 요구액 = 시장가 × 이적 프리미엄(원소속 외 +4%) × 경쟁(관심 구단당 +1.5%, 최대 4곳)
   * × 계약 기간 보정(선호 기간보다 짧으면 연 4%↑) × 시장 경과 할인(시즌 중 하루 0.4%↓, 최대 30%). 계약금은 계약 시 한 번에 지급(현금), 경쟁균형세는 연 평균 보수로 계산. */
  const FA_CURVE = [[0, 28], [0.1, 21], [0.2, 17], [0.35, 13], [0.5, 10], [0.65, 7.5], [0.8, 5], [1, 2.5]];
  const faCurve = q => { for (let i = 1; i < FA_CURVE.length; i++) if (q <= FA_CURVE[i][0]) { const a = FA_CURVE[i - 1], b = FA_CURVE[i]; return a[1] + (b[1] - a[1]) * (q - a[0]) / (b[0] - a[0]); } return FA_CURVE[FA_CURVE.length - 1][1]; };
  const BONUS_SHARE = 0.35;   // 실제 FA 계약 26건의 계약금 비중 평균 36%(12~73%)
  proto._fvScore = function (p) { const a = p.age, f = a <= 29 ? 1.12 : a <= 31 ? 1 : Math.max(0.55, 1 - 0.07 * (a - 31)); return Math.max(0, this.war(p)) * f + 0.1 * this._salAvg(p); };   // 가치 = WAR × 나이 보정(젊을수록 가산, 32세부터 감가) + 최근 연봉 평균의 10%
  proto._prefYears = function (p) { const a = p.age; return a <= 34 ? 4 : a <= 37 ? 3 : a <= 40 ? 2 : 1; };
  proto._priceClass = function (final) {   // FA 승인 선수 풀의 시장가 산정(final=true 이면 확정)
    const pool = this.faList().filter(p => p.faInfo && p.faInfo.grade && !p.foreign && !p.faInfo.mvFinal).sort((a, b) => this._fvScore(b) - this._fvScore(a)), n = pool.length;
    pool.forEach((p, i) => { p.faInfo.mv = Math.round(faCurve(n > 1 ? i / (n - 1) : 0) * 10) / 10; if (final) p.faInfo.mvFinal = true; });
  };
  proto.faMV = function (p) { if (!p.faInfo || !p.faInfo.grade || p.foreign) return null; if (p.faInfo.mv === undefined) this._priceClass(false); return p.faInfo.mv; };
  /* FA 자격자의 1년 재계약 요구액: 리그 FA 자격자 중 가치 순위 상위 27%가 시장에 나온다고 보고 시장가 곡선에 대입(재계약은 시장가의 80%) */
  /* 1년 재계약 연봉: 현재 연봉에서 시장 요구액(가치)으로 부분 조정 — 오르면 60%, 내리면 40%만 반영(연봉 급등락 완화) */
  /* ---------------- 구단 충성도(0~100) ----------------
     근속(해당 구단 등록 시즌 수 `p.tn`), 입단 구단(드래프트 지명 구단 = 현 구단), 연고 출신(고교 소재지가 구단 연고, 지역 연고 학교 표), 원클럽 이력, 베테랑 가산으로 산정.
     충성도 55 초과분은 원소속 구단과의 계약에서 요구액 할인(최대 12%)으로 반영(재계약 요구액은 절반 적용). 선수 평가 점수에서도 원소속 가산을 키운다. */
  proto.loyalty = function (p, t) {
    t = t || p.team; if (p.foreign || !t || t === 'FA' || !(t in this.S.teams)) { if (!(p.faInfo && p.faInfo.from)) return null; t = p.faInfo.from; }
    const dh = p.dh || {}, tn = p.tnTeam === t ? (p.tn || 0) : 0, own = dh.dt === t, items = [];
    let v = 40; if (tn > 0) { const a = Math.min(7, tn) * 4 + Math.min(3, Math.max(0, tn - 7)); v += a; items.push(['근속 ' + tn + '년', a]); }
    if (own) { v += 8; items.push(['입단 구단(' + (dh.y || '') + ' 지명)', 8]); if (dh.one) { v += 5; items.push(['원클럽 이력', 5]); } }
    if (this._hometown(p, t)) { v += 8; items.push(['연고 출신(' + dh.school + ')', 8]); }
    if (own && p.age >= 33) { v += 3; items.push(['베테랑', 3]); }
    if (p.loyAdj && t === p.team) { v += p.loyAdj; items.push(['최근 대우(면담·출전)', p.loyAdj]); }
    return { team: t, v: clamp(Math.round(v), 0, 100), items };
  };
  proto._hometown = function (p, t) { const h = (this.S.schoolHome || {})[p.dh && p.dh.school]; return !!(h && h.includes(t)); };   // 고교 소재 지역이 해당 구단 연고
  proto.loyDiscount = function (p, t) { const l = this.loyalty(p, t); return !l || l.team !== (t || p.team) ? 0 : Math.max(0, Math.min(0.12, (l.v - 55) * 0.0027)); };
  proto._blendAsk = function (p) { const cur = p.contract.salary, ask = this.askSalary(p); return Math.max(0.3, Math.round((cur + (ask > cur ? 0.6 : 0.4) * (ask - cur)) * 10) / 10); };
  proto.resignAsk = function (p) {
    const ld = 1 - 0.5 * this.loyDiscount(p, p.team), base = Math.max(0.3, Math.round(this._blendAsk(p) * ld * 10) / 10); if (p.foreign || !this.faEligible(p)) return base;
    const sc = this._fvScore(p); let n = 0, rank = 0; for (const t of TEAMS) for (const q of this.players(t)) if (!q.foreign && this.faEligible(q)) { n++; if (this._fvScore(q) > sc) rank++; }
    const mv = faCurve(Math.min(1, rank / Math.max(1, 0.27 * n)));
    return Math.max(base, Math.round(0.8 * mv * ld * 10) / 10);
  };
  const faDecayAt = d => 1 - Math.min(0.3, 0.0015 * d + 0.00004 * d * d);   // 미계약 기간이 길수록 요구액 하락이 가속: 30일 -8%, 60일 -23%, 75일 -30%(한도)
  proto._marketDecay = function () { const S = this.S, m = S.faMkt; return m ? faDecayAt(m.day) : S.phase === 'offseason' ? 1 : faDecayAt(FA_END) * (1 - Math.min(0.2, 0.003 * (S.day || 0))); };   // 개막 후에는 추가로 -0.3%/일(최대 -20%)
  proto.faTerms = function (p, t, noAdj) {
    const S = this.S; t = t || S.userTeam; const info = p.faInfo, graded = !!(info && info.grade) && !p.foreign, decay = this._marketDecay() * (noAdj || !this._negAdj ? 1 : this._negAdj(p, t));   // 협상 중 호감도 보정(±7%)
    if (!graded) { const ask = Math.round(this.askSalary(p) * decay * 10) / 10; return { graded: false, pref: 1, maxYears: 1, mv: ask, ext: false, comp: 1, req: () => Math.max(0.3, ask) }; }
    const mv = this.faMV(p), pref = this._prefYears(p), ext = info.from !== t;
    let n = 0; for (const x of TEAMS) if (x !== t && x !== S.userTeam && this.faRoom(x) >= mv && this.cbtPay(x, this.S.phase === 'offseason') + mv < this.cbtCap() * 0.97) n++;
    const comp = info.grade === 'C' ? 1 : 1 + 0.015 * Math.min(4, n), disc = ext ? 0 : this.loyDiscount(p, t), base = mv * decay * (ext ? (this._hometown(p, t) ? 1.0 : 1.04) : 1 - disc) * comp;
    return { graded: true, pref, maxYears: 4, mv, ext, comp, disc, req: y => Math.round(base * (1 + 0.04 * Math.max(0, pref - y)) * (1 - 0.02 * Math.max(0, y - pref)) * 100) / 100 };
  };
  /* 요구 조건에 맞춘 기본 제시(계약금 35%): 연봉은 올림해서 요구액을 넘긴다 */
  proto.faDefaultOffer = function (p, t, years) {
    const tm = this.faTerms(p, t), y = clamp(years || tm.pref, 1, tm.maxYears), total = tm.req(y) * y;
    if (!tm.graded) return { years: 1, salary: Math.ceil(tm.req(1) * 10) / 10, bonus: 0 };
    const bonus = Math.round(total * BONUS_SHARE * 10) / 10, salary = Math.ceil(((total - bonus) / y) * 10 - 1e-9) / 10;
    return { years: y, salary, bonus };
  };
  proto.faEvaluate = function (p, offer, t) {
    const tm = this.faTerms(p, t), y = Math.round(offer.years), sal = +offer.salary, bon = +offer.bonus || 0;
    if (!(y >= 1 && y <= tm.maxYears)) return { ok: false, msg: tm.graded ? `계약 기간은 1~${tm.maxYears}년이어야 합니다.` : 'FA 자격이 없는 선수는 1년 계약만 가능합니다.' };
    if (!(sal >= 0.3)) return { ok: false, msg: '연봉은 최소 0.3억입니다.' };
    if (bon < 0 || (!tm.graded && bon > 0)) return { ok: false, msg: tm.graded ? '계약금은 0 이상이어야 합니다.' : '자격이 없는 선수에게는 계약금을 줄 수 없습니다.' };
    const per = (bon + sal * y) / y, req = tm.req(y);
    if (bon > 0.7 * (bon + sal * y)) return { ok: false, msg: '계약금은 총액의 70%를 넘을 수 없습니다.', per, req, tm };
    if (per + 1e-9 < req) return { ok: false, msg: `거절: 제시 총액 ${(per * y).toFixed(1)}억(연 ${per.toFixed(1)}억 × ${y}년)이 요구액 ${(req * y).toFixed(1)}억(연 ${req.toFixed(1)}억)에 못 미칩니다.${per >= req * 0.9 ? ' 근접합니다.' : ''}`, per, req, tm };
    return { ok: true, per, req, tm, y, sal, bon };
  };
  proto._aiDeal = function (t, p) {   // AI 구단의 영입 조건(선호 기간, 요구액 그대로, 계약금 35%) — 여유자금·상한 안이면 계약
    const tm = this.faTerms(p, t), o = this.faDefaultOffer(p, t, tm.pref), per = (o.bonus + o.salary * o.years) / o.years;
    if (this.cbtPay(t, this.S.phase === 'offseason') + per * (this.S.calib.cbtK || 1) > this.cbtCap() * 0.97) return null;
    if (this.faRoom(t) < o.salary + o.bonus / o.years + this.faCompCost(p, t)) return null;   // 외부 FA 영입 시 보상금도 예산에 반영
    return Object.assign({ per, tm }, o);
  };
  proto._fromText = function (p) {   // 기록 소식에 붙는 '내가 데려온 선수' 표기
    const h = p.myFrom && p.myFrom.how; if (!h) return ''; if (/^드래프트/.test(h)) return ` (내가 ${h})`; if (/^트레이드/.test(h)) return ` (내가 ${h}로 데려옴)`; if (h === 'FA 영입') return ' (내가 FA로 영입)'; if (h === '외국인 선수 계약') return ' (내가 계약한 외국인)'; return ` (${h})`;
  };
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
    this.mergeTracking(); if (this._careerSnapshot) this._careerSnapshot();
    // 0) 경쟁균형세 정산(시즌 종료 시점 연봉 기준)
    { const log = this.settleCBT(), my = log.find(x => x.team === user);
      if (my.kind === 'over') news(this, `경쟁균형세: 연봉 ${my.pay}억이 상한 ${my.cap}억을 초과(${my.n}회 연속) → 야구발전기금 ${my.fee}억 납부${my.drop ? ', 다음 드래프트 1라운드 지명 9단계 하락' : ''}`);
      else if (my.kind === 'under') news(this, `경쟁균형세: 연봉 ${my.pay}억이 하한 ${my.fl}억에 미달(${my.n}회 연속) → 유소년 발전기금 ${my.fee}억 납부`);
    }
    const gs0 = this.goalStatus(); if (gs0) this._lastOp = gs0.profit.cur;   // 결산 직전 시즌 손익(목표 평가용)
    this.settleFinance();   // 시즌 재정 결산(CBT 정산과 같은 시점의 보수 기준)
    this._seasonReport();   // 시상·목표 평가·해임 판정
    if (this._challengeEval) { this._rivalSeason(); this._challengeEval(); }
    if (S.coach) this.refreshCoachMarket();   // 코치 시장 일부 교체
    // 1) 성장·노화
    for (const id in S.players) {
      const p = S.players[id]; if (p.retired || p.team === 'DRAFT') continue;
      const d = this.progress(p, rngFor(S.seed, S.year, 32, parseInt(id.slice(1))), this.playShare(p));
      if (p.team === user) { rep.prog.push({ id, d }); (p.ovrHist = p.ovrHist || []).push({ y: S.year + 1, o: this.ovr(p) }); if (p.ovrHist.length > 8) p.ovrHist.shift(); }
    }
    // 2) 은퇴
    for (const id in S.players) {
      const p = S.players[id]; if (p.retired || p.team === 'DRAFT') continue;
      if (rngFor(S.seed, S.year, 33, parseInt(id.slice(1))).random() < this.retireChance(p)) {
        p.retired = true; if (p.team !== 'FA') this.removeFromTeam(p.team, id); else S.fa = (S.fa || []).filter(x => x !== id);
        if (p.team === user) { rep.retired.push(id); news(this, `${p.ko}(${p.age}세) 은퇴`); if (this._hofCheck) this._hofCheck(p); } p.team = 'RET'; p.active = false;
      }
    }
    this._closeSeason();   // 1군 등록일수 → FA 자격 연수, 연봉 이력
    // 3) 계약 만료
    for (const t of TEAMS) for (const id of S.teams[t].ids.slice()) {
      const p = S.players[id]; p.contract.years -= 1; if (p.contract.years > 0) continue;
      if (t === user) {   // 내 팀: 모든 계약이 1년이므로 FA 자격자·외국인·연봉 2억 이상·35세 이상만 직접 협상하고, 나머지는 시장 요구액(연봉 조정 반영)으로 자동 재계약
        if (p.foreign || this.faEligible(p) || p.contract.salary >= 2 || p.age >= 35) rep.expiring.push(id); else { const a = this._blendAsk(p); p.contract = this._newContract(p, a, 1); p.salHist = (p.salHist || []).slice(-2).concat([a]); rep.auto = (rep.auto || 0) + 1; }
        continue;
      }
      const o = this.ovr(p), elig = !p.foreign && this.faEligible(p);
      // 모든 비FA 계약은 1년. FA 자격자는 약 20~30%가 FA를 신청하고(가치가 높을수록 신청), 나머지는 1년 재계약. 미자격자·외국인은 구단이 재계약을 우선한다
      const decl = elig ? clamp(0.12 + 0.07 * Math.max(0, this.war(p)) - (p.age >= 36 ? 0.05 : 0), 0.08, 0.5) : 0, keepBase = p.foreign ? clamp(0.25 + (o - 40) * 0.025 - (p.age >= 34 ? 0.25 : 0), 0.08, 0.72) : (elig ? 1 : 0.9);
      const keep = r.random() >= decl && r.random() < keepBase;
      let ask = p.foreign ? this.askSalary(p) : this.resignAsk(p); if (p.foreign) ask = Math.min(ask, p.faInfo ? 1e9 : Math.max(FOREIGN_NEW[p.aq ? 'aq' : 'gen'], p.contract.salary + FOREIGN_RAISE[p.aq ? 'aq' : 'gen']));
      const inc = Math.max(0, ask - this.cbtVal(p) * (S.calib.cbtK || 1)), over = inc > 0.05 && this.cbtPay(t, true) + inc > this.cbtCap() * 0.97;   // AI 구단은 상한을 넘기게 되는 증액 재계약은 하지 않는다(증액이 없으면 재계약)
      if (keep && over && !elig && !p.foreign) ask = p.contract.salary;   // 상한 때문에 증액할 수 없으면 현 연봉으로 재계약
      if (keep && (!over || (!elig && !p.foreign))) { p.contract = this._newContract(p, ask, 1); p.salHist = (p.salHist || []).slice(-2).concat([ask]); } else { this.release(t, id, true); }
    }
    S.phase = 'offseason'; S.off = { step: 'review', rep, year: S.year + 1, draft: null, fa: S.fa || [] };
    this.repairSettings(user); this.invalidate();
    return S.off;
  };
  proto.resign = function (id) {   // 재계약은 모두 1년(연봉 계약). FA 자격자가 여러 해 계약을 원하면 FA 시장에서 계약금을 포함해 협상한다
    const S = this.S, p = S.players[id], ask = this.resignAsk(p), off = S.off;
    if (!off || !off.rep.expiring.includes(id)) return '재계약 대상이 아닙니다.';
    p.contract = this._newContract(p, ask, 1); p.salHist = (p.salHist || []).slice(-2).concat([ask]); off.rep.expiring = off.rep.expiring.filter(x => x !== id); news(this, `${p.ko} 재계약 (${ask}억, 1년)`); return null;
  };
  proto.resignAll = function () { const off = this.S.off; if (!off) return 0; let n = 0; for (const id of off.rep.expiring.slice()) { const p = this.S.players[id]; if (p.foreign) continue; if (!this.resign(id)) n++; } return n; };   // 외국인을 제외한 전원을 1년 재계약
  proto.finishContracts = function () {   // 재계약하지 않은 선수는 FA 시장으로
    const S = this.S, off = S.off; if (this._releaseForeignPool) this._releaseForeignPool();   // 해외 후보군도 외국인 FA 시장에 합류
    for (const id of off.rep.expiring.slice()) this.release(S.userTeam, id, true);
    off.rep.expiring = []; off.fa = S.fa; this._priceClass(true); this.invalidate();   // 이번 FA 풀의 시장가 확정
  };

  /* ---------- 드래프트 ---------- */
  proto.buildDraft = function () {
    const S = this.S, r = rngFor(S.seed, S.year, 41); let pool = [];
    const pr = this.ensureProspects ? this.ensureProspects() : null;   // 시즌 시작 때 미리 공개된 후보 풀(스카우팅 대상)을 그대로 사용
    if (pr && pr.y === S.year) { pool = pr.ids.filter(id => S.players[id] && S.players[id].team === 'DRAFT'); S.prospects = null; S.prospectsDone = S.year; }
    else for (let i = 0; i < 120; i++) pool.push(this.makeRookie(r, i % 2 === 0 ? 'B' : 'P').id);   // 구 저장 파일·예외 시 기존 방식
    const st = this.standings().slice().reverse().map(x => x.team), order = [], st1 = st.slice();
    for (const t of st) if (S.cbt && S.cbt.drop && S.cbt.drop[t]) { const i = st1.indexOf(t); st1.splice(i, 1); st1.splice(Math.min(i + 9, st1.length), 0, t); }   // 경쟁균형세 3회 연속 초과: 1라운드 지명 9단계 하락
    order.push(...st1); for (let k = 1; k < 10; k++) order.push(...st);
    S.off.draft = { pool, order, pick: 0, picks: [], rounds: 10 }; return S.off.draft;
  };
  proto.draftOnClock = function () { const d = this.S.off.draft; return d.pick < d.order.length ? d.order[d.pick] : null; };
  proto._draftTake = function (t, id) {
    const S = this.S, d = S.off.draft, p = S.players[id]; d.pool = d.pool.filter(x => x !== id); p.team = t; p.contract = { salary: 0.3, years: 1 }; S.teams[t].ids.push(id);
    d.picks.push({ pick: d.pick + 1, team: t, id }); d.pick++; this.invalidate();
    if (t === S.userTeam && this._scoutCarry) this._scoutCarry(p);
    if (t === S.userTeam) { p.myFrom = { y: S.year, how: `드래프트 ${Math.ceil(d.pick / 10)}라운드 지명` }; news(this, `드래프트 ${Math.ceil(d.pick / 10)}라운드: ${p.ko} 지명`); }
    if (S.teams[t].ids.length > ROSTER_MAX) { const worst = S.teams[t].ids.map(x => S.players[x]).filter(x => x.id !== id && !x.active).sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; if (worst) { if (t === S.userTeam) { /* 사용자 팀은 직접 정리 */ } else this._retireOrRelease(t, worst.id); } }
  };
  proto._retireOrRelease = function (t, id) { const p = this.S.players[id]; this.removeFromTeam(t, id); p.retired = true; p.team = 'RET'; p.active = false; };
  proto.draftAiUntilUser = function () {   // 한 픽씩 진행(draftAiStep)과 같은 규칙·같은 난수라서 '건너뛰기'와 '발표 보기' 결과가 같다
    const S = this.S, d = S.off.draft; for (let g = 0; g < 2000; g++) { const r = this.draftAiStep(); if (r.userTurn) return true; if (r.done) return false; } return false;
  };
  proto.draftPick = function (id) {
    const S = this.S, d = S.off.draft; if (this.draftOnClock() !== S.userTeam) return '아직 내 순서가 아닙니다.';
    if (!d.pool.includes(id)) return '이미 지명된 선수입니다.'; if (S.teams[S.userTeam].ids.length >= ROSTER_MAX) return `보유 선수 ${ROSTER_MAX}명 제한입니다. 먼저 선수를 정리하세요.`;
    this._draftTake(S.userTeam, id); return null;
  };
  proto.draftAutoRest = function () {   // 내 순서도 자동 지명(추천 순)
    const S = this.S, d = S.off.draft;
    while (d.pick < d.order.length) { if (this.draftOnClock() === S.userTeam) { if (S.teams[S.userTeam].ids.length >= ROSTER_MAX) { d.pick++; continue; } const best = d.pool.map(id => ({ id, s: this.userScore ? this.userScore(S.players[id]) : this.scoutScore(S.players[id]) })).sort((a, b) => b.s - a.s)[0]; this._draftTake(S.userTeam, best.id); } else this.draftAiUntilUser(); }
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
  const FA_END = 75, FA_REG_DAYS = 145, EXT_LIMIT = 3, FOREIGN_NEW = { gen: 14, aq: 2.8 }, FOREIGN_RAISE = { gen: 7, aq: 1.4 };
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
    const f = this.foreignOf(t).filter(x => x.id !== this._replacing); if (p.aq) return f.filter(x => x.aq).length < 1;   // _replacing: 교체 영입 시 내보낼 선수는 제외하고 계산
    const g = f.filter(x => !x.aq); if (g.length >= 3) return false; return !(g.length === 2 && g.every(x => x.type === p.type));
  };
  /* 2027 시작 상태: 뉴스로 계약이 확정된 외국인만 반영하고(foreign_2027.csv), 나머지 선수는 시장으로 보낸 뒤
   * 구단별 빈 슬롯을 채운다(원소속 선수 우선 → 시장 최고 → 가상 영입). 채운 선수는 `assumed`(2027 계약 미확정 가정)로 표시 */
  proto._initForeign = function () {
    const S = this.S, r = rngFor(S.seed, 2027, 88), KRW = 1335 / 1e8, keep = new Set();
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
  proto.foreignCap = function (p, t) {
    const k = p.aq ? 'aq' : 'gen', base = FOREIGN_NEW[k];
    return p.faInfo && p.faInfo.from === t ? Math.max(base, (p.faInfo.prev || 0) + FOREIGN_RAISE[k]) : base;
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
      const pool = this.faList().filter(x => x.foreign && !!x.aq === aq && this.foreignOK(t, x)).sort((a, b) => ((b.faInfo && b.faInfo.from === t) ? 1000 : 0) + this.war(b) - (((a.faInfo && a.faInfo.from === t) ? 1000 : 0) + this.war(a)));
      let cand = pool[0];
      if (!cand) { const tp = aq ? (r.random() < 0.7 ? 'P' : 'B') : (this.foreignOf(t).filter(x => !x.aq && x.type === 'P').length >= 2 ? 'B' : (this.foreignOf(t).filter(x => !x.aq && x.type === 'B').length >= 1 ? 'P' : (r.random() < 0.75 ? 'P' : 'B'))); cand = this.makeForeign(r, tp, aq); cand.team = 'FA'; (S.fa = S.fa || []).push(cand.id); }
      if (!this.foreignOK(t, cand)) break;
      const cap = this.foreignCap(cand, t), ask = Math.min(cap, Math.max(this.askSalary(cand), aq ? 2 : 6));
      this._doSign(t, cand, 1, ask); if (initial || (S.year === 2027 && S.phase === 'preseason')) cand.assumed = true;
    }
  };
  /* 공통 영입 처리: 팀 이동·계약·FA 행사(재취득 연수 리셋)·보상 */
  proto._doSign = function (t, p, years, ask, bonus) {
    const S = this.S, info = p.faInfo, graded = info && info.grade, comp = graded && info.from !== t ? graded : null;
    S.fa = (S.fa || []).filter(x => x !== p.id); p.team = t; p.active = false; S.teams[t].ids.push(p.id); if (t === S.userTeam) p.myFrom = { y: S.year, how: p.foreign ? '외국인 선수 계약' : 'FA 영입' };
    ask = Math.round(ask * 10) / 10; bonus = Math.round((bonus || 0) * 10) / 10; p.contract = this._newContract(p, ask, p.foreign || !graded ? 1 : years, p.foreign || !graded ? 0 : bonus); p.salHist = (p.salHist || []).slice(-2).concat([Math.round(((p.contract.bonus || 0) / p.contract.years + ask) * 10) / 10]);
    if (t === S.userTeam && this._contractNote) this._contractNote(p, p.foreign ? '외국인' : graded ? 'FA' : '재계약');
    if (graded && p.fa) { p.fa.used += 1; p.fa.last = graded; p.fa.svc = 0; p.fa.rem = 0; }
    if (comp) { this._faCount(t, 1); this._compensate(t, p, info); }
    p.faInfo = undefined; this.invalidate();
  };
  proto._foreignJoin = function (p) {   // 외국인은 영입 즉시 1군 엔트리에 등록한다(자리가 없으면 2군 대기)
    const S = this.S, t = S.userTeam; p.reg1 = true; p.lockUntil = 0; if (this.players(t).filter(x => x.active).length < ACTIVE_MAX) p.active = true; if (this.repairSettings) this.repairSettings(t); this.invalidate();
  };
  proto._faCount = function (t, d) { const S = this.S, k = S.off ? S.off.year : S.year; S.faSign = S.faSign && S.faSign.k === k ? S.faSign : { k, c: {} }; if (d) S.faSign.c[t] = (S.faSign.c[t] || 0) + d; return S.faSign.c[t] || 0; };
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
      this._evAdd({ type: 'comp', title: `FA 보상 선택: ${p.ko}(${g}등급) → ${KO0[t]}`, ttl: 30, data: { signer: t, fa: p.id, grade: g, prev, cands: top.map(x => x.id) },
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
      p.fa.regDays = 0; p.fa.est = false;
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
      if (this._faCount(t) >= EXT_LIMIT || S.teams[t].ids.length >= ROSTER_MAX - 4) continue;
      let deal = null;
      const cand = this.faList().filter(p => !p.foreign).sort((a, b) => this.war(b) - this.war(a)).find(p => {
        if (this.war(p) < 1.0 || !((!(p.faInfo && p.faInfo.grade)) || p.faInfo.from === t || this._faCount(t) < EXT_LIMIT) || !(r.random() < (this.war(p) >= 2 ? 0.7 : 0.45))) return false;
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
    if (ext && this._faCount(t) >= EXT_LIMIT) return `외부 FA는 한 시즌에 ${EXT_LIMIT}명까지만 영입할 수 있습니다.`;
    if (p.foreign) {
      if (!this.foreignOK(t, p)) return p.aq ? '아시아쿼터는 구단당 1명입니다.' : '일반 외국인은 3명까지이며 같은 포지션 3명은 안 됩니다.';
      let ask;
      if (offer && typeof offer === 'object') { const ev = this._negEval(p, Object.assign({ years: 1, bonus: 0 }, offer), 'foreign'); if (!ev.ok) return ev.msg; ask = ev.sal; }   // 협상 테이블: 호감도로 낮춘 요구액 이상·상한 이하
      else ask = Math.min(this.askSalary(p), this.foreignCap(p, t));
      this._doSign(t, p, 1, ask, 0); this._foreignJoin(p);
      news(this, `${p.aq ? '아시아쿼터' : '외국인'} 선수 ${p.ko} 계약 (${ask}억, 1년)`); return null;
    }
    if (typeof offer !== 'object' || offer === null) offer = this.faDefaultOffer(p, t, typeof offer === 'number' ? offer : undefined);   // 숫자만 주면 요구 조건에 맞춘 기본 제시
    const ev = this.faEvaluate(p, offer, t); if (!ev.ok) return ev.msg;
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
  proto.finishFA = function () {   // AI 팀이 남은 FA를 영입하고 로스터를 채운다
    const S = this.S, r = rngFor(S.seed, S.year, 51), teams = TEAMS.filter(t => t !== S.userTeam).sort(() => r.random() - 0.5);
    for (const t of teams) {
      let n = 0; const need = k => this.players(t).filter(p => p.type === k).length;
      const pool = this.faList().sort((a, b) => this.war(b) - this.war(a));
      for (const p of pool) {
        if (this._faCount(t) >= EXT_LIMIT || S.teams[t].ids.length >= ROSTER_MAX - 4) break;
        if (p.foreign) continue;   // 외국인은 아래에서 슬롯별로 채운다
        if (this.war(p) < 1.0) continue; const deal = this._aiDeal(t, p); if (!deal) continue;   // AI 구단은 상한·여유자금을 지킨다
        if (r.random() < (this.war(p) >= 2 ? 0.75 : 0.5)) this._doSign(t, p, deal.years, deal.salary, deal.bonus);
      }
      this._fillForeign(t, r);
      // 연봉 하한(2027~) 미달이면 하한을 넘길 때까지 FA를 영입한다(미달 시 기금 납부를 피하려고)
      { const fl = this.cbtFloor(); if (fl !== null) for (let k = 0; k < 6 && this.cbtPay(t) < fl * 1.03 && S.teams[t].ids.length < ROSTER_MAX; k++) {
        let dl = null; const p = this.faList().filter(x => !x.foreign && !(x.faInfo && x.faInfo.grade && x.faInfo.from !== t && this._faCount(t) >= EXT_LIMIT)).sort((a, b) => this.war(b) - this.war(a)).find(x => { dl = this._aiDeal(t, x); return !!dl; }); if (!p) break;
        this._doSign(t, p, dl.years, dl.salary, dl.bonus);   // 연봉 하한 미달 팀의 보강 영입(계약금 포함)
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
      const tot = per * y, bon = Math.round(tot * BONUS_SHARE * 10) / 10, sal = Math.ceil(((tot - bon) / y) * 10 - 1e-9) / 10;
      if (!best || this._offerScore(p, t, y, sal, bon) > best.score + 1e-9) return { years: y, salary: sal, bonus: bon, per: (bon + sal * y) / y };
    }
    return this.faDefaultOffer(p, t, y);
  };
  proto.faBidInfo = function (id) {
    const m = this.S.faMkt; if (!m) return null; const bs = m.bids[id] || [], best = this._bestBid(id), pe = m.pend[id] || null;
    return { n: bs.length, best: best ? best.b : null, bestScore: best ? best.score : 0, pend: pe, pendLeft: pe ? Math.max(0, pe.day + 5 - m.day) : 0, bids: bs.map(b => ({ team: b.team, per: b.per, y: b.y })).sort((a, b) => b.per - a.per) };
  };
  proto._aiSign = function (t, p, per, y, d) {   // 입찰 금액으로 계약(여유자금·로스터 확인). 성공 여부 반환
    const S = this.S, bon = Math.round(per * y * BONUS_SHARE * 10) / 10, sal = Math.ceil(((per * y - bon) / y) * 10 - 1e-9) / 10;
    if (S.teams[t].ids.length >= ROSTER_MAX - 2 || this.faRoom(t) < sal + bon / y) return false;
    const g = p.faInfo && p.faInfo.grade, from = p.faInfo && p.faInfo.from;
    this._doSign(t, p, y, sal, bon); this.refreshTeam(t);
    const text = `FA ${p.ko}(${from ? KO0[from] + ' ' : ''}${g ? g + '등급' : ''}) → ${KO0[t]} (${y}년 총 ${(per * y).toFixed(1)}억, 계약금 ${bon.toFixed(1)})`;
    if (this._faFeedAdd) this._faFeedAdd('sign', text, p.id);
    (S.faLog = S.faLog || []).unshift({ year: S.year, day: d, text }); if (S.faLog.length > 40) S.faLog.pop(); news(this, text); return true;
  };
  proto._postBids = function (d) {
    const S = this.S, m = S.faMkt, pool = this.faList().filter(p => !p.foreign && this.war(p) >= 1.0).sort((a, b) => this.war(b) - this.war(a)).slice(0, 30); if (!pool.length) return;
    const pr = 0.02 + 0.3 * Math.exp(-d / 12), r = rngFor(S.seed, S.year, 7000 + d, 5000), teams = TEAMS.filter(t => t !== S.userTeam).sort(() => r.random() - 0.5);
    for (const t of teams) {
      if (r.random() > pr) continue;
      if (this._faCount(t) >= EXT_LIMIT || S.teams[t].ids.length >= ROSTER_MAX - 4) continue;
      if (pool.filter(p => (m.bids[p.id] || []).some(b => b.team === t)).length >= 2) continue;   // 동시 입찰 2명까지
      for (const p of pool) {
        if (p.team !== 'FA' || (m.bids[p.id] || []).some(b => b.team === t)) continue;
        const g = p.faInfo && p.faInfo.grade; if (g && p.faInfo.from !== t && this._faCount(t) >= EXT_LIMIT) continue;
        if (!(r.random() < (this.war(p) >= 2 ? 0.7 : 0.45))) continue;
        const deal = this._aiDeal(t, p); if (!deal) continue;
        (m.bids[p.id] = m.bids[p.id] || []).push({ team: t, per: Math.round(deal.per * 100) / 100, ceil: Math.round(deal.per * (1.02 + 0.1 * r.random()) * 100) / 100, y: deal.years, day: d }); if (this._faFeedAdd) this._faFeedAdd('bid', `${KO0[t]}이(가) ${p.ko}에게 ${deal.years}년 연 ${deal.per.toFixed(1)}억을 제시했습니다.`, p.id); break;
      }
    }
  };
  proto._userSignPend = function (p, pe) {   // 보류 제시가 이기면 계약(예산·인원 재확인)
    const S = this.S, t = S.userTeam, tm = this.faTerms(p, t), per = (pe.bonus + pe.salary * pe.years) / pe.years;
    if (S.teams[t].ids.length >= ROSTER_MAX || this.faRoom(t) < pe.salary + pe.bonus / pe.years || (tm.ext && this._faCount(t) >= EXT_LIMIT) || per + 1e-9 < tm.req(pe.years)) return false;
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
    while (k < n && m.day < FA_END) { this._postBids(m.day); this._resolveBids(m.day, false); m.day++; k++; }
    this.invalidate(); return k;
  };
  /* FA 마감(개막 전): 입찰 중인 계약을 확정하고 AI가 남은 FA·로스터를 정리한다 */
  proto.closeFA = function () {
    const S = this.S, m = S.faMkt;
    if (m && !m.closed) { this._resolveBids(m.day, true); this.finishFA(); for (const t of TEAMS) if (t !== S.userTeam && S.phase !== 'offseason' && this.players(t).filter(p => p.active).length !== ACTIVE_MAX) this.ensureActive(t); m.closed = true; for (const id in m.pend) delete m.pend[id]; this.invalidate(); }
    else if (!m) this.finishFA();
    if (S.phase !== 'offseason') S.faMkt = null;
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
    this.release(t, id); if (this._bondShift && (p.tn >= 3 || this.ovr(p) >= 50)) this._bondShift(p, -1, '방출', bl0);
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
    const prob = clamp(0.12 + 0.6 * (f.trust / 100) + (this.war(p) >= 2 ? 0.1 : this.war(p) >= 1 ? 0.04 : 0) - 0.5 * need / Math.max(cost, 0.1), 0.05, 0.9);
    return { ok: true, need, cost, room, prob: Math.round(prob * 100) / 100, tries: pers.n, left, max: 3, ev, now };
  };
  proto.persuadeBoard = function (id, offer) {
    const S = this.S, t = S.userTeam, o = this.boardOdds(id, offer); if (!o.ok) return { ok: false, msg: o.msg };
    const f = S.fin.teams[t], p = S.players[id]; f.pers = f.pers || { n: 0, last: -99 };
    if (o.need <= 0) return { ok: false, msg: '예산 안에서 영입할 수 있습니다. 설득이 필요 없습니다.' };
    if (f.pers.n >= o.max) return { ok: false, msg: `이사회 설득은 시즌당 ${o.max}회까지입니다.` };
    if (o.left > 0) return { ok: false, msg: `이사회가 재논의를 거부합니다. ${o.left}일 뒤에 다시 요청하세요.` };
    f.pers.n++; f.pers.last = o.now;
    const r = rngFor(S.seed, S.year, (S.faMkt ? S.faMkt.day : S.day) * 10 + f.pers.n, 9100);
    if (r.random() < o.prob) {
      const drop = clamp(2 + o.need * 0.4, 2, 8); f.boardExtra = Math.round(((f.boardExtra || 0) + o.need * 1.05 + 0.1) * 10) / 10; f.trust = clamp(Math.round((f.trust - drop) * 10) / 10, 0, 100);
      this._doSign(t, p, o.ev.y, o.ev.sal, o.ev.bon);
      if (S.faMkt) { delete S.faMkt.pend[id]; delete S.faMkt.bids[id]; }
      news(this, `이사회 설득 성공: ${p.ko} 영입 승인 (초과 ${o.need}억 추가 예산, 신뢰도 −${drop.toFixed(1)}) — ${o.ev.y}년 총 ${(o.ev.per * o.ev.y).toFixed(1)}억`);
      return { ok: true, success: true, drop, need: o.need };
    }
    f.trust = clamp(Math.round((f.trust - 3) * 10) / 10, 0, 100);
    news(this, `이사회 설득 실패: ${p.ko} 영입안이 부결되었습니다 (신뢰도 −3). ${o.left <= 0 ? '7일 뒤 재논의 가능' : ''}`);
    return { ok: true, success: false, msg: '이사회가 영입안을 부결했습니다. 신뢰도가 하락했습니다.' };
  };

  /* ---------------- 시즌 중 이벤트 ----------------
     S.events = { seq, list:[{id,type,day,year,title,text,choices:[{k,label,hint}],data,exp,status,result}] }
     - 선수 불만(출전 기회) · 스폰서 제안 · 팬 이벤트 · 이사회 중간 점검 · 월간 MVP(정보)
     - 새 이벤트가 생기면 advance()가 그날 멈춘다. 만료되면 기본 선택으로 자동 처리. */
  proto.eventsOpen = function () { const E = this.S.events; return E ? E.list.filter(e => e.status === 'open') : []; };
  proto._evAdd = function (e) { const S = this.S, E = S.events = S.events || { seq: 0, list: [] }; e.id = 'E' + (++E.seq); e.day = S.day; e.year = S.year; e.status = 'open'; e.exp = S.day + (e.ttl || 10); E.list.unshift(e); if (E.list.length > 60) E.list.length = 60; return e; };
  proto._evCount = function (type) { const E = this.S.events; return E ? E.list.filter(e => e.type === type && e.year === this.S.year).length : 0; };
  proto._evOpenOf = function (type) { return this.eventsOpen().some(e => e.type === type); };
  proto._eventDay = function (d) {
    const S = this.S, t = S.userTeam, f = S.fin && S.fin.teams[t]; if (!f || S.phase !== 'regular' && S.phase !== 'preseason') return; if (S.phase === 'preseason' && d < 1) return;
    const r = rngFor(S.seed, S.year, d, 8800), E = S.events = S.events || { seq: 0, list: [] };
    { let ch = S.teamMood && S.teamMood.until === d; for (const p of this.players(t)) if (p.mood && p.mood.until === d) ch = true; if (ch) this.invalidate(); }   // 컨디션 효과 종료일에 엔진 입력 갱신
    if (this._promiseTick) this._promiseTick(d); if (this._loyDecay && d > 0 && d % 30 === 0) this._loyDecay(1);   // 충성도 보정 회복(30일마다 1)
    // 만료 → 기본 처리
    for (const e of this.eventsOpen()) if (d >= e.exp) this.resolveEvent(e.id, e.def || (e.choices[e.choices.length - 1] || {}).k, true);
    const open = this.eventsOpen().length; if (open >= 3) return;
    // 1) 이사회 중간 점검: 72일·120일차(경기일)
    if ((d === 72 || d === 120) && !E.list.some(e => e.type === 'board' && e.year === S.year && e.data.at === d)) {
      const st = this.standings(), me = st.find(x => x.team === t), pays = TEAMS.map(x => [x, this.finPay(x)]).sort((a, b) => b[1] - a[1]), exp = pays.findIndex(x => x[0] === t) + 1, gap = me.rank - exp;   // 기대 순위 = 선수단 보수 순위
      const v = this.finPreview(t), over = gap <= -2, under = gap >= 2;
      this._evAdd({ type: 'board', title: `이사회 중간 점검 (${me.w}승 ${me.l}패 · ${me.rank}위)`, ttl: 8, data: { at: d, gap, rank: me.rank, exp, op: Math.round(v.op) },
        text: over ? `보수 순위(${exp}위)를 웃도는 ${me.rank}위입니다. 이사회가 선전을 평가하며 보강 투자를 제안합니다.` : under ? `보수 순위(${exp}위)에 못 미치는 ${me.rank}위입니다. 이사회가 성적 부진에 우려를 표했습니다. 시즌 예상 손익 ${Math.round(v.op)}억.` : `기대 순위(${exp}위)와 비슷한 ${me.rank}위입니다. 이사회가 시즌 후반 운영 방향을 묻습니다.`,
        choices: over ? [{ k: 'invest', label: '보강 예산 5억 승인 받기', hint: '신뢰도 변화 없음, 올 시즌 FA 예산 +5억' }, { k: 'thanks', label: '감사 표하고 넘어가기', hint: '신뢰도 +2' }] : under ? [{ k: 'plead', label: '보강 예산 요청', hint: `확률 ${Math.round(clamp(0.2 + 0.5 * f.trust / 100, 0.1, 0.8) * 100)}% 성공 시 +6억, 실패 시 신뢰도 −3`, def: false }, { k: 'accept', label: '책임 인정(조용히 넘어감)', hint: '신뢰도 −1' }] : [{ k: 'hold', label: '현 전력 유지', hint: '변화 없음' }, { k: 'ask', label: '소폭 증액 요청', hint: '신뢰도 −1, 예산 +2억' }], def: over ? 'thanks' : under ? 'accept' : 'hold' });
      return;
    }
    // 2) 선수 불만(출전 기회) — 하루 4%
    if (!this._evOpenOf('grievance') && r.random() < 0.04) {   // 모범생은 불만을 잘 드러내지 않는다(후보에서 절반 제외)
      const act = this.players(t).filter(p => p.active), med = act.map(p => this.ovr(p)).sort((a, b) => a - b)[Math.floor(act.length * 0.5)] || 0, rec = new Set((E.list || []).filter(e => e.type === 'grievance' && e.day > d - 40).map(e => e.data.pid));
      const c = this.players(t).filter(p => !p.active && !this.isInj(p) && !p.foreign && this.ovr(p) >= med + 4 && !rec.has(p.id) && !p.lockUntil && !(this.traitOf(p) === 'model' && r.random() < 0.5)).sort((a, b) => this.ovr(b) - this.ovr(a))[0];
      if (c) { this._evAdd({ type: 'grievance', title: `${c.ko} 출전 기회 불만`, ttl: 7, data: { pid: c.id }, text: `2군에 있는 ${c.ko}(OVR ${this.ovr(c)})가 "1군 경기에 뛸 자격이 있다"며 면담을 요청했습니다. (1군 중앙값 OVR ${med})`,
        choices: [{ k: 'promote', label: '1군에 등록한다', hint: '엔트리에 여유가 있어야 합니다. 충성도 +4' }, { k: 'talk', label: '면담으로 설득한다', hint: `성공 ${Math.round(clamp(0.35 + (this.loyalty(c) ? this.loyalty(c).v : 40) / 200, 0.2, 0.85) * 100)}% — 성공 시 충성도 +1, 실패 시 −5` }, { k: 'ignore', label: '무시한다', hint: '충성도 −6' }], def: 'ignore' }); return; }
    }
    // 2b) 부진(슬럼프): 최근 경기 성적이 나쁜 1군 선수 — 하루 3%, 같은 선수 30일 간격
    if (!this._evOpenOf('slump') && r.random() < 0.03) {
      const rec = new Set((E.list || []).filter(e => e.type === 'slump' && e.day > d - 30).map(e => e.data.pid)), form = p => { const x = S.recent[p.id] || []; if (p.type === 'B') { let ab = 0, h = 0; for (const e of x) { ab += e[1]; h += e[2]; } return ab >= 30 ? { bad: h / ab < 0.17 + (['free', 'shy'].includes(this.traitOf(p)) ? 0.018 : 0), txt: `최근 ${x.length}경기 타율 ${(h / ab).toFixed(3).slice(1)}`, s: h / ab } : null; } let o = 0, R = 0; for (const e of x) { o += e[1]; R += e[2]; } return o >= 18 ? { bad: R * 27 / o > 8.5, txt: `최근 ${x.length}경기 RA9 ${(R * 27 / o).toFixed(2)}`, s: -R * 27 / o } : null; };
      const c = this.players(t).filter(p => p.active && !rec.has(p.id)).map(p => ({ p, f: form(p) })).filter(x => x.f && x.f.bad).sort((a, b) => a.f.s - b.f.s)[0];
      if (c) { const p = c.p, pr = Math.round(clamp(0.45 + 0.15 * (this.coachRating(t, p.type === 'P' ? 'control' : 'contact') - 55) / 20, 0.3, 0.75) * 100);
        this._evAdd({ type: 'slump', title: `${p.ko} 부진`, ttl: 6, data: { pid: p.id }, text: `${p.ko}(OVR ${this.ovr(p)})가 ${c.f.txt}로 부진합니다. 대응에 따라 컨디션(경기 능력치 ±)이 바뀝니다.`,
          choices: [{ k: 'coach', label: '코치진 집중 지도 (비용 0.3억)', hint: `성공 ${pr}% → 20일간 컨디션 +2, 실패 → 10일간 −1` }, { k: 'trust', label: '믿고 계속 기용', hint: '40% 회복(14일 +1), 60% 부진 지속(14일 −1)' }, { k: 'farm', label: '2군 재조정 (10경기일 등록 불가)', hint: '2군으로 내리고 복귀 시 25일간 컨디션 +2' }], def: 'trust' }); return; }
    }
    // 2c) 연승·연패: 선수단 분위기 — 연승 7·연패 6 이상
    if (!this._evOpenOf('streak') && !(E.list || []).some(e => e.type === 'streak' && e.day > d - 20)) {
      const g = (S.results || []).filter(x => x.home === t || x.away === t).slice(-12).map(x => { const my = x.home === t ? x.rh : x.ra, op = x.home === t ? x.ra : x.rh; return my > op ? 1 : my < op ? -1 : 0; }); let n = 0, k = g.length ? g[g.length - 1] : 0; for (let i = g.length - 1; i >= 0 && g[i] === k && k; i--) n++;
      if (k === 1 && n >= 7) { this._evAdd({ type: 'streak', title: `${n}연승 — 선수단 분위기`, ttl: 5, data: { kind: 'win', n }, text: `팀이 ${n}연승 중입니다. 분위기를 이어갈 방법을 고르세요.`,
          choices: [{ k: 'bonus', label: '연승 격려금 (0.3억)', hint: '20일간 팀 컨디션 +1' }, { k: 'rest', label: '선수단 휴식 배려', hint: '14일간 부상 위험 −30%' }, { k: 'none', label: '그대로 진행', hint: '변화 없음' }], def: 'none' }); return; }
      if (k === -1 && n >= 6) { this._evAdd({ type: 'streak', title: `${n}연패 — 선수단 분위기`, ttl: 5, data: { kind: 'lose', n }, text: `팀이 ${n}연패 중입니다. 분위기 반전이 필요합니다.`,
          choices: [{ k: 'meeting', label: '선수단 면담·미팅', hint: '60% 성공: 15일간 팀 컨디션 +1, 실패: 7일간 −1' }, { k: 'camp', label: '휴식일 부여(훈련 강도 ↓)', hint: '10일간 팀 컨디션 +1, 부상 위험 −20%' }, { k: 'none', label: '정면 돌파(그대로)', hint: '변화 없음' }], def: 'none' }); return; }
    }
    // 2c2) 선수 요청 트레이드 — 충성도가 많이 깎였거나 자유분방 + 컨디션 부진, 하루 5%, 시즌 2회
    if (!this._evOpenOf('request') && this._evCount('request') < 2 && d > 10 && d < LIM_DEADLINE - 3 && this.canTrade() && r.random() < 0.05) {
      const c = this.players(t).filter(p => !p.foreign && p.rookie !== S.year && !this.isInj(p) && ((p.loyAdj || 0) <= -5 || (this.traitOf(p) === 'free' && this.moodOf(p) <= -2))).sort((a, b) => (a.loyAdj || 0) - (b.loyAdj || 0))[0];
      if (c) { const off = this._offerFor(c, r); if (off) { const cap = this.captain(), pr = Math.round(clamp(0.3 + (cap ? 0.15 * (this.traitOf(cap) === 'leader' ? 1.5 : 1) : 0) + (this.loyalty(c) ? this.loyalty(c).v : 40) / 250 + (this.traitOf(c) === 'leader' ? 0.1 : this.traitOf(c) === 'free' ? -0.1 : 0), 0.1, 0.85) * 100);
        this._evAdd({ type: 'request', title: `${c.ko} 트레이드 요청`, ttl: 7, data: { pid: c.id, t: off.t, get: off.y.id }, text: `${c.ko}(${TRAITS[this.traitOf(c)]}, OVR ${this.ovr(c)})가 구단에 트레이드를 요청했습니다. ${KO0[off.t]}가 ${off.y.ko}(OVR ${this.ovr(off.y)})와의 맞교환에 응할 의사가 있습니다.`,
          choices: [{ k: 'trade', label: `요청 수락: ${c.ko} ↔ ${off.y.ko}`, hint: `즉시 트레이드(받는 선수는 2군 등록)` }, { k: 'talk', label: `면담으로 설득${cap ? ' (주장 도움)' : ''}`, hint: `성공 ${pr}% — 성공 시 충성도 +5·컨디션 +1(15일), 실패 시 컨디션 −2` }, { k: 'refuse', label: '요청 거절', hint: '충성도 −4·컨디션 −2(30일)' }], def: 'refuse' }); return; } }
    }
    // 2c3) 선수 갈등 — 같은 포지션 1군 선수 중 승부사/자유분방 조합, 하루 2%, 시즌 1회
    if (!this._evOpenOf('conflict') && this._evCount('conflict') < 1 && d > 15 && r.random() < 0.02) {
      const act = this.players(t).filter(p => p.active && p.type === 'B' && !this.isInj(p)), by = {}; for (const p of act) (by[p.pos] = by[p.pos] || []).push(p);
      const pair = Object.values(by).map(g => g.filter(p => ['clutch', 'free'].includes(this.traitOf(p)))).find(g => g.length >= 2);
      if (pair) { const [a, b] = pair, cap = this.captain(), pm = Math.round(clamp(cap ? 0.6 + (this.traitOf(cap) === 'leader' ? 0.2 : 0) : 0.25, 0.1, 0.9) * 100);
        this._evAdd({ type: 'conflict', title: `${a.ko}·${b.ko} 갈등`, ttl: 6, data: { a: a.id, b: b.id }, text: `같은 ${a.pos} 자리를 놓고 ${a.ko}(${TRAITS[this.traitOf(a)]})와 ${b.ko}(${TRAITS[this.traitOf(b)]})의 신경전이 클럽하우스로 번지고 있습니다.`,
          choices: [{ k: 'captain', label: cap ? `주장 ${cap.ko}가 중재` : '주장 없이 중재(성공 낮음)', hint: `성공 ${pm}% — 성공 시 팀 컨디션 +1(10일), 실패 시 −1(7일)` }, { k: 'talk', label: '각각 면담 (0.2억)', hint: '성공 55% — 성공 시 팀 컨디션 +1(8일), 실패 시 −1(7일)' }, { k: 'ignore', label: '지켜본다', hint: '팀 컨디션 −1(10일)' }], def: 'ignore' }); return; }
    }
    // 2d) AI 트레이드 제안 — 하루 1.5%, 시즌 3회, 마감 전
    if (!this._evOpenOf('trade') && this._evCount('trade') < 3 && d > 8 && d < LIM_DEADLINE - 5 && r.random() < 0.015) {
      const o = this._tradeOffer(r);
      if (o) { const d1 = (p, tt) => `${p.ko} (${p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos} · OVR ${this.ovr(p)} · ${p.age}세 · 연봉 ${p.contract.salary}억 · ${p.contract.years}년)`;
        this._evAdd({ type: 'trade', title: `${KO0[o.t]} 트레이드 제안`, ttl: 6, data: { t: o.t, give: o.mine.id, get: o.y.id }, text: `${KO0[o.t]}가 ${o.mine.ko}를 원합니다. 대가로 ${o.y.ko}를 제시했습니다. 수락하면 즉시 이동하며 2군에 등록됩니다.`,
          choices: [{ k: 'accept', label: `수락: ${o.mine.ko} ↔ ${o.y.ko}`, hint: `내줌: ${d1(o.mine)} / 받음: ${d1(o.y)}` }, { k: 'decline', label: '거절', hint: '변화 없음' }], def: 'decline' }); return; }
    }
    // 3) 스폰서 제안 — 하루 1.2%, 시즌 2회
    if (!this._evOpenOf('sponsor') && this._evCount('sponsor') < 2 && d > 10 && d < 120 && r.random() < 0.012) {
      const amt = Math.round(f.lastRev * (0.004 + 0.004 * r.random()) * 10) / 10;
      this._evAdd({ type: 'sponsor', title: '구장 광고·스폰서 확대 제안', ttl: 10, data: { amt }, text: `모기업 계열 스폰서가 구장 광고판과 중계 노출 확대를 조건으로 시즌 ${amt}억을 제안했습니다. 다만 광고 확대로 관람 환경이 다소 나빠질 수 있습니다(관중 −1.5%).`,
        choices: [{ k: 'accept', label: `수락 (+${amt}억)`, hint: '올 시즌 매출 +' + amt + '억, 관중 −1.5%' }, { k: 'decline', label: '거절', hint: '변화 없음' }], def: 'decline' }); return;
    }
    // 4) 팬 이벤트 — 하루 1.2%, 시즌 2회
    if (!this._evOpenOf('promo') && this._evCount('promo') < 2 && d > 5 && d < 130 && !(f.promo && d < f.promo.until) && r.random() < 0.012) {
      const cost = Math.round(f.lastRev * 0.001 * 10) / 10;
      this._evAdd({ type: 'promo', title: '팬 감사 이벤트 제안', ttl: 8, data: { cost }, text: `마케팅팀이 팬 사인회·유니폼 증정 이벤트를 제안했습니다. 비용 ${cost}억, 향후 20일 홈 관중 +6% 예상.`,
        choices: [{ k: 'go', label: `진행 (−${cost}억)`, hint: '운영비 +' + cost + '억, 20일간 관중 +6%' }, { k: 'skip', label: '보류', hint: '변화 없음' }], def: 'skip' }); return;
    }
    // 5) 월간 MVP(정보) — 30일마다
    if (d > 0 && d % 30 === 0) {
      const bat = Object.entries(S.stats.bat).map(([id, c]) => ({ p: S.players[id], c })).filter(x => x.p && x.p.team === t && x.c.PA >= 40).map(x => { const ab = x.c.PA - x.c.BB - x.c.HBP - x.c.SF, h = x.c['1B'] + x.c['2B'] + x.c['3B'] + x.c.HR; return { p: x.p, s: (ab ? h / ab : 0) + 0.02 * x.c.HR / Math.max(1, x.c.PA / 20), txt: `${x.p.ko} 타율 ${ab ? (h / ab).toFixed(3).slice(1) : '-'} ${x.c.HR}홈런 ${x.c.RBI}타점` }; });
      const pit = Object.entries(S.stats.pit).map(([id, c]) => ({ p: S.players[id], c })).filter(x => x.p && x.p.team === t && x.c.outs >= 45).map(x => ({ p: x.p, s: 1.2 - x.c.R * 27 / x.c.outs / 10 + x.c.K / 400, txt: `${x.p.ko} ${(x.c.R * 27 / x.c.outs).toFixed(2)} RA9 ${x.c.K}탈삼진` }));
      const best = bat.concat(pit).sort((a, b) => b.s - a.s)[0]; if (best) news(this, `${S.year} ${Math.floor(d / 30)}개월차 팀 MVP: ${best.txt}`);
    }
  };
  /* 월별 재정 스냅샷(내 팀): 월말 기준 시즌 예상 손익·평균 관중·순위. 매 경기일 갱신해 달이 바뀌면 직전 달 값이 남는다 */
  proto._finSnapDay = function (d) {
    const S = this.S; if (!this.finReady() || S.phase !== 'regular' && S.phase !== 'preseason') return; const t = S.userTeam, f = S.fin.teams[t]; if (!f) return;
    const m = this.dateOf(d).getUTCMonth() + 1, v = this.finPreview(t), me = this.standings().find(x => x.team === t); f.snap = f.snap || [];
    const row = { m, day: d, op: Math.round(v.op * 10) / 10, att: v.att, price: f.price * f.pm, games: f.games, gate: Math.round(f.gate * 10) / 10, rank: me.rank, w: me.w, l: me.l, pay: v.pay, room: v.room, trust: f.trust };
    const last = f.snap[f.snap.length - 1]; if (last && last.m === m) f.snap[f.snap.length - 1] = row; else f.snap.push(row);
  };
  proto.resolveEvent = function (id, k, auto, opts) {
    const S = this.S, t = S.userTeam, f = S.fin.teams[t], e = ((S.events || {}).list || []).find(x => x.id === id); if (!e || e.status !== 'open') return { ok: false, msg: '처리할 수 없는 소식입니다.' };
    let res = '';
    const adj = (p, v) => { p.loyAdj = clamp((p.loyAdj || 0) + v, -15, 15); }, mood = (p, v, days) => { p.mood = { v, until: S.day + days }; this.invalidate(); }, tmood = (v, days) => { S.teamMood = { v, until: S.day + days }; this.invalidate(); }, rr = salt => rngFor(S.seed, S.year, S.day, salt).random();
    if (e.type === 'grievance') {
      const p = S.players[e.data.pid];
      if (!p || p.team !== t) res = '선수가 이미 팀을 떠났습니다.';
      else if (k === 'promote') { const err = this.moveActive(p.id, true); if (err) { if (!auto) return { ok: false, msg: err }; adj(p, -6); mood(p, -2, 30); res = `${p.ko} 불만을 처리하지 못했습니다(${err}). 컨디션 −2(30일).`; } else { adj(p, 4); mood(p, 1, 20); res = `${p.ko}을(를) 1군에 등록했습니다. 충성도 +4, 컨디션 +1(20일).`; } }
      else if (k === 'talk') { const pr = clamp(0.35 + (this.loyalty(p) ? this.loyalty(p).v : 40) / 200, 0.2, 0.85); if (opts && opts.talk !== undefined ? opts.talk : rngFor(S.seed, S.year, S.day, 8810 + parseInt(p.id.slice(1))).random() < pr) { adj(p, 1); mood(p, 1, 15); res = `면담이 잘 풀렸습니다. ${p.ko} 충성도 +1, 컨디션 +1(15일).`; } else { adj(p, -5); mood(p, -2, 20); res = `면담이 결렬되었습니다. ${p.ko} 충성도 −5, 컨디션 −2(20일).`; } }
      else { const hv = this.traitOf(p) === 'clutch' ? 3 : this.traitOf(p) === 'model' ? 1 : 2; adj(p, -6); mood(p, -hv, 30); res = `${p.ko}(${TRAITS[this.traitOf(p)]}) 불만을 방치했습니다. 충성도 −6(FA·재계약 협상), 컨디션 −${hv}(30일).`; }
    } else if (e.type === 'slump') {
      const p = S.players[e.data.pid];
      if (!p || p.team !== t) res = '선수가 팀을 떠났습니다.';
      else if (k === 'coach') { f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; if (rr(8830 + parseInt(p.id.slice(1))) < clamp(0.45 + 0.15 * (this.coachRating(t, p.type === 'P' ? 'control' : 'contact') - 55) / 20 + (this.traitOf(p) === 'shy' ? -0.1 : this.traitOf(p) === 'leader' ? 0.05 : 0), 0.2, 0.75)) { mood(p, 2, 20); res = `${p.ko} 집중 지도 성공: 컨디션 +2(20일).`; } else { mood(p, -1, 10); res = `${p.ko} 집중 지도가 통하지 않았습니다: 컨디션 −1(10일).`; } }
      else if (k === 'farm') { const err = this.moveActive(p.id, false); if (err) { res = `2군 재조정 불가(${err}).`; } else { mood(p, 2, 25); res = `${p.ko}을(를) 2군에서 재조정합니다. 복귀 후 컨디션 +2(~25일).`; } }
      else { if (rr(8840 + parseInt(p.id.slice(1))) < (this.traitOf(p) === 'clutch' ? 0.5 : this.traitOf(p) === 'shy' ? 0.3 : 0.4)) { mood(p, 1, 14); res = `${p.ko}이(가) 부진을 털었습니다: 컨디션 +1(14일).`; } else { mood(p, -1, 14); res = `${p.ko}의 부진이 이어집니다: 컨디션 −1(14일).`; } }
    } else if (e.type === 'streak') {
      if (k === 'bonus') { f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; tmood(1, 20); res = '격려금 지급: 팀 컨디션 +1(20일), 비용 0.3억.'; }
      else if (k === 'rest') { S.restUntil = S.day + 14; res = '휴식 배려: 14일간 부상 위험 −30%.'; }
      else if (k === 'meeting') { if (rr(8850) < 0.6) { tmood(1, 15); res = '면담 성공: 팀 컨디션 +1(15일).'; } else { tmood(-1, 7); res = '면담이 역효과: 팀 컨디션 −1(7일).'; } }
      else if (k === 'camp') { S.restUntil = S.day + 10; tmood(1, 10); res = '휴식일 부여: 팀 컨디션 +1(10일), 부상 위험 −20%.'; }
      else res = '그대로 진행합니다.';
    } else if (e.type === 'sponsor') {
      if (k === 'accept') { f.evRev = Math.round(((f.evRev || 0) + e.data.amt) * 10) / 10; f.attMult = (f.attMult || 1) * 0.985; res = `스폰서 계약 체결: 올 시즌 매출 +${e.data.amt}억, 관중 −1.5%.`; } else res = '제안을 거절했습니다.';
    } else if (e.type === 'promo') {
      if (k === 'go') { f.evCost = Math.round(((f.evCost || 0) + e.data.cost) * 10) / 10; f.promo = { until: S.day + 20, mult: 1.06 }; res = `팬 이벤트 진행: 비용 ${e.data.cost}억, 20일간 관중 +6%.`; } else res = '이벤트를 보류했습니다.';
    } else if (e.type === 'request') {
      const D = e.data, p = S.players[D.pid];
      if (!p || p.team !== t) res = '선수가 이미 팀을 떠났습니다.';
      else if (k === 'trade') { const ev = this.executeTrade(D.t, [D.pid], [D.get]); res = ev.ok ? `요청을 수락해 트레이드했습니다: ${S.players[D.get].ko} 영입(2군 등록), ${p.ko} 이적.` : `트레이드가 성사되지 않았습니다(${ev.why || '조건 변경'}).`; }
      else if (k === 'talk') { const cap = this.captain(), pr = clamp(0.3 + (cap ? 0.15 * (this.traitOf(cap) === 'leader' ? 1.5 : 1) : 0) + (this.loyalty(p) ? this.loyalty(p).v : 40) / 250 + (this.traitOf(p) === 'leader' ? 0.1 : this.traitOf(p) === 'free' ? -0.1 : 0), 0.1, 0.85); if (opts && opts.talk !== undefined ? opts.talk : rr(8860 + parseInt(p.id.slice(1))) < pr) { adj(p, 5); mood(p, 1, 15); res = `면담이 통했습니다. ${p.ko} 잔류 — 충성도 +5, 컨디션 +1(15일).`; } else { mood(p, -2, 20); res = `설득에 실패했습니다. ${p.ko} 컨디션 −2(20일).`; } }
      else { adj(p, -4); mood(p, -2, 30); res = `요청을 거절했습니다. ${p.ko} 충성도 −4, 컨디션 −2(30일).`; }
    } else if (e.type === 'conflict') {
      const cap = this.captain(), pm = clamp(cap ? 0.6 + (this.traitOf(cap) === 'leader' ? 0.2 : 0) : 0.25, 0.1, 0.9);
      if (k === 'captain') { if (rr(8870) < pm) { tmood(1, 10); res = '주장의 중재가 통했습니다: 팀 컨디션 +1(10일).'; } else { tmood(-1, 7); res = '중재가 먹히지 않았습니다: 팀 컨디션 −1(7일).'; } }
      else if (k === 'talk') { f.evCost = Math.round(((f.evCost || 0) + 0.2) * 10) / 10; if (rr(8871) < 0.55) { tmood(1, 8); res = '면담 후 화해했습니다: 팀 컨디션 +1(8일), 비용 0.2억.'; } else { tmood(-1, 7); res = '면담이 오히려 불씨가 됐습니다: 팀 컨디션 −1(7일), 비용 0.2억.'; } }
      else { tmood(-1, 10); res = '갈등을 방치했습니다: 팀 컨디션 −1(10일).'; }
    } else if (e.type === 'return') {
      const p = S.players[e.data.pid];
      if (!p || p.team !== t) res = '선수가 팀을 떠났습니다.';
      else if (k === 'callup') { if (p.active) res = `${p.ko}을(를) 1군에 콜업했습니다.`; else if (this.players(t).filter(x => x.active).length < ACTIVE_MAX) { const err = this.moveActive(p.id, true); if (err) { if (!auto) return { ok: false, msg: err }; res = err; } else res = `${p.ko}을(를) 1군에 콜업했습니다.`; } else if (!auto) return { ok: false, need: 'swap', msg: '1군 엔트리가 가득 찼습니다. 교체할 선수를 고르세요.' }; else res = '엔트리가 가득 차 콜업하지 못했습니다.'; }
      else res = `${p.ko}은(는) 2군에서 컨디션을 조절합니다.`;
    } else if (e.type === 'trade') {
      const D = e.data;
      if (k !== 'accept') res = '제안을 거절했습니다.';
      else { const ev = this.executeTrade(D.t, [D.give], [D.get]); res = ev.ok ? `트레이드 성사: ${S.players[D.get].ko} 영입(2군 등록), ${S.players[D.give].ko} 이적.` : `성사되지 않았습니다(${ev.why || ev.msg || '조건 변경'}).`; }
    } else if (e.type === 'comp') {
      const D = e.data, fa = S.players[D.fa], pid = k && k.startsWith('p:') ? k.slice(2) : null, pl = pid ? S.players[pid] : null, valid = pl && pl.team === D.signer;
      for (const id of D.cands || []) if (S.players[id]) delete S.players[id].compHold;
      const lg = (S.compLog || []).find(c => c.pending && c.id === D.fa); if (lg) { const i = S.compLog.indexOf(lg); S.compLog.splice(i, 1); }
      res = this._compApply(D.signer, t, fa, D.grade, D.prev, valid ? pid : null);
    } else if (e.type === 'board') {
      const tr = d => { f.trust = clamp(Math.round((f.trust + d) * 10) / 10, 0, 100); };
      if (k === 'invest') { f.boardExtra = (f.boardExtra || 0) + 5; res = '이사회가 보강 예산 5억을 승인했습니다.'; }
      else if (k === 'thanks') { tr(2); res = '이사회 신뢰도 +2.'; }
      else if (k === 'plead') { if (rngFor(S.seed, S.year, S.day, 8820).random() < clamp(0.2 + 0.5 * f.trust / 100, 0.1, 0.8)) { f.boardExtra = (f.boardExtra || 0) + 6; res = '이사회가 보강 예산 6억을 승인했습니다.'; } else { tr(-3); res = '요청이 거절되었습니다. 신뢰도 −3.'; } }
      else if (k === 'accept') { tr(-1); res = '책임을 인정했습니다. 신뢰도 −1.'; }
      else if (k === 'ask') { tr(-1); f.boardExtra = (f.boardExtra || 0) + 2; res = '소폭 증액(+2억), 신뢰도 −1.'; }
      else res = '현 전력을 유지합니다.';
    }
    e.status = 'done'; e.choice = k; e.result = res; e.auto = !!auto; news(this, `${e.title}: ${res}`); this.invalidate();
    return { ok: true, msg: res };
  };
  /* ---------------- 시즌 목표 · 평가 · 해임 압박 ----------------
     시즌 시작 시 이사회가 목표를 제시한다: ① 순위(선수단 보수 순위를 기대 순위로 환산) ② 재정(손익이 허용 적자 이내) ③ 육성(25세 이하 3명이 1군에서 100타석·50이닝 이상).
     시즌 종료 시 달성 여부가 이사회 신뢰도를 바꾸고, 신뢰도가 12 이하로 떨어지면 해임 → 다른 구단을 맡는다. */
  const RANK_GOAL = [3, 3, 3, 5, 5, 5, 7, 7, 8, 8];   // 보수 순위 1~10 → 목표 순위(이내)
  proto._payRank = function (t) { const pays = TEAMS.map(x => [x, this.finPay(x)]).sort((a, b) => b[1] - a[1]); return pays.findIndex(x => x[0] === t) + 1; };
  proto._setGoals = function () {
    const S = this.S, t = S.userTeam; if (!this.finReady()) return; const pr = this._payRank(t), f = S.fin.teams[t];
    S.goals = { year: S.year, team: t, payRank: pr, rank: RANK_GOAL[pr - 1], profit: -Math.round(this.finAllowed(t) * 10) / 10, youth: 3 };
  };
  proto.goalStatus = function () {
    const S = this.S, g = S.goals; if (!g || g.team !== S.userTeam) return null; const t = S.userTeam, st = this.standings(), me = st.find(x => x.team === t), played = me.w + me.l + me.d;
    const v = this.finPreview(t), y = this.players(t).filter(p => !p.foreign && p.age <= 25).filter(p => { if (p.type === 'B') return (((S.stats.bat[p.id] || {}).PA) || 0) >= 100; return (((S.stats.pit[p.id] || {}).outs) || 0) >= 150; }).length;
    return { g, rank: { cur: me.rank, goal: g.rank, ok: played ? me.rank <= g.rank : null }, profit: { cur: Math.round(v.op * 10) / 10, goal: g.profit, ok: v.op >= g.profit }, youth: { cur: y, goal: g.youth, ok: y >= g.youth }, played };
  };
  /* 가을야구(5위 이내)·1위 확률: 남은 경기를 현재 성적·득실 마진(피타고리안)으로 몬테카를로 */
  proto.playoffOdds = function (n) {
    const S = this.S, st = this.standings(), N = n || 400, r = rngFor(S.seed, S.year, S.day, 9700), len = S.schedule ? S.schedule.length || 144 : 144;
    const rem = Object.fromEntries(st.map(x => [x.team, Math.max(0, len - (x.w + x.l + x.d))]));
    const pw = Object.fromEntries(st.map(x => { const g = x.w + x.l + x.d, rs = x.rs + 80, ra = x.ra + 80, pyth = Math.pow(rs, 1.83) / (Math.pow(rs, 1.83) + Math.pow(ra, 1.83)), wp = g ? (x.w + 0.5 * x.d) / g : 0.5; return [x.team, clamp(0.5 + (pyth - 0.5) * 0.6 + (wp - 0.5) * 0.25 * Math.min(1, g / 60), 0.32, 0.68)]; }));
    const out = {}; for (const x of st) out[x.team] = { top5: 0, top1: 0, exp: 0 };
    for (let k = 0; k < N; k++) {
      const w = st.map(x => { let wins = x.w + 0.5 * x.d; const p = pw[x.team]; for (let i = 0; i < rem[x.team]; i++) if (r.random() < p) wins++; return { t: x.team, wins: wins + r.random() * 0.01 }; }).sort((a, b) => b.wins - a.wins);
      w.forEach((x, i) => { if (i < 5) out[x.t].top5++; if (i === 0) out[x.t].top1++; out[x.t].exp += x.wins; });
    }
    for (const t in out) { out[t].top5 = Math.round(out[t].top5 / N * 100); out[t].top1 = Math.round(out[t].top1 / N * 100); out[t].exp = Math.round(out[t].exp / N * 10) / 10; }
    return out;
  };
  /* 신인왕 자격(KBO: 입단 5년 이내, 이전 누적 투수 30이닝·타자 60타석 이하): 시작 시점 입단 2023년 이후 + 기록 한도 이내, 신규 드래프트 선수. 첫 풀 시즌 후 기록 초과 시 자격 상실 */
  proto._markRookies = function () { for (const p of Object.values(this.S.players)) { const d = p.dh; if (p.foreign || p.team === 'MIL') continue; if (d && d.y >= 2023 && (d.pa || 0) <= 60 && (d.ip || 0) <= 30) p.rk = true; } };
  proto._seasonReport = function () {   // startOffseason 직후: 시상·팀 하이라이트·목표 평가·해임 판정
    const S = this.S, t = S.userTeam, st = this.standings(), me = st.find(x => x.team === t), games = me.w + me.l + me.d, aw = [];
    const bat = Object.entries(S.stats.bat).map(([id, c]) => { const p = S.players[id]; if (!p || !c.PA) return null; const ab = c.PA - c.BB - c.HBP - c.SF, h = c['1B'] + c['2B'] + c['3B'] + c.HR, tb = c['1B'] + 2 * c['2B'] + 3 * c['3B'] + 4 * c.HR, obp = (h + c.BB + c.HBP) / Math.max(1, c.PA), slg = ab ? tb / ab : 0; return { p, c, PA: c.PA, avg: ab ? h / ab : 0, H: h, HR: c.HR, RBI: c.RBI, SB: c.SB || 0, ops: obp + slg, val: (obp + slg - 0.72) * c.PA / 9 }; }).filter(Boolean);
    const pit = Object.entries(S.stats.pit).map(([id, c]) => { const p = S.players[id]; if (!p || c.outs < 3) return null; const ra9 = c.R * 27 / c.outs; return { p, c, outs: c.outs, ra9, K: c.K, val: (4.8 - ra9) * c.outs / 27 * 1.1 }; }).filter(Boolean);
    const qB = bat.filter(x => x.PA >= 3.1 * games), qP = pit.filter(x => x.outs >= games * 3 * 0.9), nm = x => ({ id: x.p.id, name: x.p.ko, team: x.p.team });
    const top = (arr, f, label, txt) => { const x = arr.slice().sort((a, b) => f(b) - f(a))[0]; if (x) aw.push(Object.assign(nm(x), { label, txt: txt(x) })); };
    const mv = bat.map(x => ({ x, v: x.val })).concat(pit.map(x => ({ x, v: x.val }))).sort((a, b) => b.v - a.v)[0];
    if (mv) aw.push(Object.assign(nm(mv.x), { label: 'MVP', txt: mv.x.ops !== undefined ? `OPS ${mv.x.ops.toFixed(3)} ${mv.x.HR}홈런 ${mv.x.RBI}타점` : `RA9 ${mv.x.ra9.toFixed(2)} ${Math.floor(mv.x.outs / 3)}이닝 ${mv.x.K}K` }));
    top(qB, x => x.avg, '타율왕', x => `타율 ${x.avg.toFixed(3).slice(1)}`); top(bat, x => x.HR, '홈런왕', x => `${x.HR}홈런`); top(bat, x => x.RBI, '타점왕', x => `${x.RBI}타점`); top(bat, x => x.SB, '도루왕', x => `${x.SB}도루`);
    top(qP, x => -x.ra9, '최저 RA9', x => `RA9 ${x.ra9.toFixed(2)}`); top(pit, x => x.K, '탈삼진왕', x => `${x.K}탈삼진`);
    const mine = bat.filter(x => x.p.team === t).map(x => ({ id: x.p.id, name: x.p.ko, v: x.val, txt: `타율 ${x.avg.toFixed(3).slice(1)} ${x.HR}홈런 ${x.RBI}타점` })).concat(pit.filter(x => x.p.team === t).map(x => ({ id: x.p.id, name: x.p.ko, v: x.val, txt: `RA9 ${x.ra9.toFixed(2)} ${Math.floor(x.outs / 3)}이닝 ${x.K}K` }))).sort((a, b) => b.v - a.v).slice(0, 3);
    // 골든글러브(포지션별 1명, 외야 3명): 주 포지션 기준 시즌 가치 최고(타자 PA 규정의 70% 이상, 투수 이닝 규정의 70% 이상)
    { const gg = [], used = new Set(), okB = bat.filter(x => x.PA >= 3.1 * games * 0.7), okP = pit.filter(x => x.outs >= games * 3 * 0.9 * 0.7), pk = (arr, pred) => arr.filter(x => pred(x.p) && !used.has(x.p.id)).sort((a, b) => b.val - a.val);
      const pw = pk(okP, p => true)[0]; if (pw) { used.add(pw.p.id); gg.push(Object.assign(nm(pw), { label: '골든글러브 투수', txt: `RA9 ${pw.ra9.toFixed(2)} ${Math.floor(pw.outs / 3)}이닝 ${pw.K}K` })); }
      for (const [lab, pr, cnt] of [['포수', p => p.pos === 'C', 1], ['1루수', p => p.pos === '1B', 1], ['2루수', p => p.pos === '2B', 1], ['3루수', p => p.pos === '3B', 1], ['유격수', p => p.pos === 'SS', 1], ['외야수', p => ['LF', 'CF', 'RF'].includes(p.pos), 3]]) {
        for (const x of pk(okB, pr).slice(0, cnt)) { used.add(x.p.id); gg.push(Object.assign(nm(x), { label: '골든글러브 ' + lab, txt: `타율 ${x.avg.toFixed(3).slice(1)} ${x.HR}홈런 ${x.RBI}타점 OPS ${x.ops.toFixed(3)}` })); } }
      const dh = pk(okB, p => p.pos === 'DH')[0] || pk(okB, p => true)[0]; if (dh) { used.add(dh.p.id); gg.push(Object.assign(nm(dh), { label: '골든글러브 지명타자', txt: `타율 ${dh.avg.toFixed(3).slice(1)} ${dh.HR}홈런 ${dh.RBI}타점` })); }
      // 신인왕
      const rk = x => { const p = x.p; return p.rkx !== false && (p.rk === true || (p.rookie !== undefined && p.rookie >= S.year - 1)) && !p.foreign; };
      const rkc = bat.filter(rk).filter(x => x.PA >= 60).map(x => ({ x, v: x.val })).concat(pit.filter(rk).filter(x => x.outs >= 45).map(x => ({ x, v: x.val }))).sort((a, b) => b.v - a.v)[0];
      if (rkc) aw.push(Object.assign(nm(rkc.x), { label: '신인왕', txt: rkc.x.ops !== undefined ? `타율 ${rkc.x.avg.toFixed(3).slice(1)} ${rkc.x.HR}홈런 ${rkc.x.RBI}타점 OPS ${rkc.x.ops.toFixed(3)}` : `RA9 ${rkc.x.ra9.toFixed(2)} ${Math.floor(rkc.x.outs / 3)}이닝 ${rkc.x.K}K` }));
      for (const x of bat) if (x.p.rk && x.PA > 60) x.p.rkx = false; for (const x of pit) if (x.p.rk && x.outs > 90) x.p.rkx = false;   // 기록 한도를 넘으면 신인 자격 상실
      aw.push(...gg); }
    // 목표 평가 → 신뢰도 반영
    const gs = this.goalStatus(), f = S.fin.teams[t], res = []; let d = 0;
    if (gs) {
      const r = gs.rank; const rd = r.goal - r.cur; let dr = rd >= 2 ? 5 : rd >= 0 ? 3 : rd <= -3 ? -3 : 0; res.push({ k: 'rank', label: `순위 목표 ${r.goal}위 이내`, got: `${r.cur}위`, ok: rd >= 0, d: dr }); d += dr;
      const pr = this._lastOp !== undefined ? this._lastOp : gs.profit.cur; const okp = pr >= gs.profit.goal; res.push({ k: 'profit', label: `손익 ${gs.profit.goal.toFixed(1)}억 이상`, got: `${pr >= 0 ? '+' : ''}${pr.toFixed(1)}억`, ok: okp, d: 0 });
      const dy = gs.youth.ok ? 2 : 0; res.push({ k: 'youth', label: `25세 이하 ${gs.youth.goal}명 이상 출전(100타석·50이닝)`, got: `${gs.youth.cur}명`, ok: gs.youth.ok, d: dy }); d += dy;
      f.trust = clamp(Math.round((f.trust + d) * 10) / 10, 0, 100);
    }
    (S.awardsHist = S.awardsHist || []).push({ year: S.year, awards: aw }); for (const m of mine.slice(0, 3)) if (S.players[m.id]) this._bondShift(S.players[m.id], 1, '시즌 활약');
    S.report = { year: S.year, rank: me.rank, w: me.w, l: me.l, d: me.d, champion: S.post ? S.post.champion : null, awards: aw, mine, goals: res, goalTrust: d, trust: f.trust };
    if (res.length) news(this, `시즌 목표 평가: ${res.map(x => `${x.label} ${x.ok ? '달성' : '미달'}`).join(' · ')} → 이사회 신뢰도 ${d >= 0 ? '+' : ''}${d} (현재 ${f.trust})`);
    if (f.trust <= 12) { S.fired = { year: S.year, trust: f.trust, done: false }; news(this, `이사회가 감독 해임을 결정했습니다 (신뢰도 ${f.trust}).`); }
  };
  proto.takeOverTeam = function (t) {   // 해임 후 다른 구단 지휘: 라인업·로테이션 자동 편성, 신뢰도 55로 시작
    const S = this.S; if (!(t in S.teams) || t === S.userTeam) return false; const old = S.userTeam;
    S.userTeam = t; this.autoSettings(t); this.repairSettings(t); const f = S.fin.teams[t]; f.trust = 55;
    S.protect = undefined; S.policy = { pitch: 'normal', run: 'normal' }; S.teamMood = null; if (S.events) for (const e of S.events.list) if (e.status === 'open') { e.status = 'done'; e.result = '감독 교체로 종결'; }
    for (const id in S.players) if (S.players[id].mood) delete S.players[id].mood;
    if (S.fired) S.fired.done = true; this._setGoals(); this.invalidate(); news(this, `${KO0[old]} 감독 해임 → ${KO0[t]} 감독 취임`); return true;
  };
  /* AI 트레이드 제안: 내 선수 1명을 원하는 구단이 동등 가치의 선수 1명을 제시(트레이드 평가 규칙을 통과하는 안만) */
  proto._tradeOffer = function (r) {
    const S = this.S, me = S.userTeam, cands = this.players(me).filter(p => !p.foreign && p.rookie !== S.year && this.marketValue(p) >= 1.5 && !this.isInj(p)).sort((a, b) => this.marketValue(b) - this.marketValue(a)).slice(3, 18); if (!cands.length) return null;
    const mine = cands[Math.floor(r.random() * cands.length)], ai = TEAMS.filter(t => t !== me).sort(() => r.random() - 0.5);
    for (const t of ai) {
      const vGive = this.tradeValue(mine, t), opts = this.players(t).filter(p => !p.foreign && p.type === mine.type && p.rookie !== S.year && this.tradeValue(p, t) * 1.12 + 0.1 <= vGive).sort((a, b) => this.ovr(b) - this.ovr(a));
      for (const y of opts.slice(0, 4)) { if (this.ovr(y) < this.ovr(mine) - 8) continue; const ev = this.evaluateTrade(t, [mine.id], [y.id]); if (ev.ok) return { t, mine, y }; }
    }
    return null;
  };
  /* ---------------- 다음 중요 순간까지 진행 ----------------
     내가 정한 조건 중 하나가 생기면 그날 멈춘다: 새 소식(결정 필요) · 내 1군 선수 부상 · 트레이드 마감 5일 전 · 가을야구 확률 구간 변화 · 시즌 목표(순위) 달성 여부 변화 · 월초 점검(선택). 내 경기 직접 지휘를 켜면 내 경기 직전에도 멈춘다. */
  proto.stopOpts = function () { return Object.assign({ event: true, injury: true, deadline: true, odds: true, goal: true, month: false }, this.S.stopOpts || {}); };
  proto.setStop = function (k, v) { if (!['event', 'injury', 'deadline', 'odds', 'goal', 'month'].includes(k)) return false; this.S.stopOpts = Object.assign({}, this.S.stopOpts, { [k]: !!v }); return true; };
  proto._momState = function () { const S = this.S, t = S.userTeam, gs = this.goalStatus(); return { inj: this.players(t).filter(p => this.isInj(p) && p.inj && p.inj.generated).map(p => p.id), rankOk: gs ? gs.rank.ok : null, band: S._band === undefined ? null : S._band, ev: S.events ? S.events.seq : 0 }; };
  /* 중요 경기(직접 지휘 모드에서 멈출 경기): 30일차 이후 상대가 상위 3팀이거나 순위 차이가 2 이내인 순위 경쟁 맞대결 */
  proto._keyGame = function (g) {
    const S = this.S, t = S.userTeam; if (S.day < 30) return null; const st = this.standings(), me = st.find(x => x.team === t), opp = st.find(x => x.team === (g[0] === t ? g[1] : g[0]));
    return opp.rank <= 3 || Math.abs(opp.rank - me.rank) <= 2 ? `중요 경기: ${KO0[opp.team]}(${opp.rank}위) 전` : null;
  };
  proto.advanceMoment = function (live, hl) {
    const S = this.S, o = this.stopOpts(), t = S.userTeam, len = S.schedule.length; if (S.faMkt && this.closeFA) this.closeFA();
    let n = 0; const band = p => p < 10 ? 0 : p < 40 ? 1 : p < 70 ? 2 : 3, bandTxt = ['가을야구 가능성 희박(10% 미만)', '가을야구 가능성 낮음(10~40%)', '가을야구 경합(40~70%)', '가을야구 유력(70% 이상)'];
    let st = this._momState(); if (S.day >= 10 && S._band === undefined) { S._band = band(this.playoffOdds(200)[t].top5); st.band = S._band; }
    while (S.day < len) {
      const before = st, r = this.playDay(live); n++;
      if (r.status === 'userGame') {   // 직접 지휘 모드: 내 경기마다 멈추지 않고 '중요한' 경기·접전에서만 멈춘다
        const kg = hl ? null : this._keyGame(r.game);
        if (!hl && kg) return { status: 'userGame', ...r, played: n - 1, reason: kg };
        const ctx = this.startUserGame(r.game, r.idx), us = ctx.userSide;
        if (hl) { const done = this.playAuto(ctx, gm => this.isHighlight(gm, us)); if (!done) return { status: 'highlight', ctx, game: r.game, idx: r.idx, played: n, reason: `접전: ${KO0[r.game[0] === t ? r.game[1] : r.game[0]]} 전` }; }
        else this.playAuto(ctx);
        this.finishUserGame(ctx);
      }
      const now = this._momState(), why = [];
      if (o.event && S.events && S.events.seq > before.ev) { const e = this.eventsOpen()[0]; why.push('새 소식' + (e ? `: ${e.title}` : '')); }
      if (o.injury) { const nw = now.inj.filter(id => !before.inj.includes(id)); if (nw.length) why.push(`부상: ${nw.map(id => S.players[id].ko).join(', ')}`); }
      if (o.deadline && S.day === LIM_DEADLINE - 5) why.push('트레이드 마감 5일 전');
      if (o.month && S.day > 0 && this.dateOf(S.day - 1).getUTCMonth() !== this.dateOf(S.day).getUTCMonth()) why.push(`${this.dateOf(S.day).getUTCMonth() + 1}월 점검`);
      if (S.day >= 10 && S.day % 7 === 0) {
        if (o.odds) { const b = band(this.playoffOdds(200)[t].top5), prev = S._band === undefined ? b : S._band; if (b !== prev) why.push(`${b > prev ? '▲' : '▼'} ${bandTxt[b]}`); S._band = b; } else S._band = undefined;
        if (o.goal && before.rankOk !== null && now.rankOk !== null && before.rankOk !== now.rankOk) why.push(`시즌 목표 순위 ${now.rankOk ? '달성권 진입' : '미달권으로 하락'}`);
      }
      st = now; st.band = S._band === undefined ? null : S._band;
      if (why.length) return { status: 'moment', reason: why.join(' · '), played: n };
    }
    S.phase = 'regular_done'; return { status: 'seasonEnd', played: n };
  };
  /* ---------------- 훈련 방침 · 기록 달성 ----------------
     훈련 방침(집중 분야 × 강도)은 시즌 중 날짜별로 누적되어 연말 성장(양의 성장분)과 부상 위험에 반영된다.
       분야: 타격(타자 100%·성장 +) / 투구(투수 100%) / 수비(타자 50%) / 컨디션 관리(전원 40%·부상 위험 −12%)
       강도: 가볍게(효과 ×0.5·부상 −8%) / 보통 / 강하게(효과 ×1.5·부상 +15%)
       효과 = 1 + 0.12 × Σ(분야별 강도 가중 누적 일수 ÷ 시즌 일수 × 해당 분야 비중) — 시즌 내내 보통 강도로 같은 분야면 +12%(강하게 +18%) */
  proto.train = function () { return Object.assign({ focus: 'none', inten: 'normal' }, this.S.train || {}); };
  proto.setTrain = function (k, v) { const ok = { focus: ['none', 'bat', 'pit', 'def', 'cond'], inten: ['light', 'normal', 'heavy'] }; if (!ok[k] || !ok[k].includes(v)) return false; this.S.train = Object.assign({}, this.S.train, { [k]: v }); return true; };
  proto._trainDay = function () { const S = this.S; if (S.phase !== 'regular' && S.phase !== 'preseason') return; const T = this.train(), a = S.trainAcc = S.trainAcc || { total: 0 }; a.total++; a[T.focus] = (a[T.focus] || 0) + ({ light: 0.5, normal: 1, heavy: 1.5 }[T.inten] || 1); };   // 강도는 날짜별 가중으로 누적
  proto._trainMult = function (p) {
    const a = this.S.trainAcc; if (!a || !a.total) return 1; let tot = 0;
    for (const f of ['bat', 'pit', 'def', 'cond']) { const share = (a[f] || 0) / a.total; tot += share * ({ bat: p.type === 'B' ? 1 : 0, pit: p.type === 'P' ? 1 : 0, def: p.type === 'B' ? 0.5 : 0, cond: 0.4 }[f]) ; }
    return 1 + 0.12 * tot;
  };
  proto._trainInj = function () { const T = this.train(); return ({ light: 0.92, normal: 1, heavy: 1.15 }[T.inten]) * (T.focus === 'cond' ? 0.88 : 1); };
  proto.trainForecast = function () { const a = this.S.trainAcc || { total: 0 }, pl = this.players(this.S.userTeam).filter(p => p.age <= 30 && !p.foreign), avg = pl.length ? pl.reduce((x, p) => x + (this._trainMult(p) - 1), 0) / pl.length : 0; return { days: a.total, acc: a, avgBonus: Math.round(avg * 1000) / 10 }; };
  const MS_B = [['H', 100, '안타'], ['H', 150, '안타'], ['H', 200, '안타'], ['HR', 10, '홈런'], ['HR', 20, '홈런'], ['HR', 30, '홈런'], ['HR', 40, '홈런'], ['RBI', 50, '타점'], ['RBI', 100, '타점'], ['SB', 20, '도루'], ['SB', 30, '도루']];
  proto._milestoneDay = function () {
    const S = this.S, t = S.userTeam;
    for (const p of this.players(t)) {
      p.ms = p.ms && p.ms.y === S.year ? p.ms : { y: S.year, d: {} };
      if (p.type === 'B') { const c = S.stats.bat[p.id]; if (!c) continue; const v = { H: c['1B'] + c['2B'] + c['3B'] + c.HR, HR: c.HR, RBI: c.RBI, SB: c.SB || 0 }; for (const [k, n, lab] of MS_B) { const key = k + n; if (v[k] >= n && !p.ms.d[key]) { p.ms.d[key] = S.day; news(this, `기록 달성: ${p.ko} 시즌 ${n}${lab}${this._fromText(p)}`); this._bondShift(p, 1, '기록 달성'); this._bondShift(p, 1, '기록 달성'); } } }
      else { const c = S.stats.pit[p.id]; if (!c) continue; const v = { K: c.K, IP: Math.floor(c.outs / 3) }; for (const [k, n, lab] of [['K', 100, '탈삼진'], ['K', 150, '탈삼진'], ['K', 200, '탈삼진'], ['IP', 100, '이닝'], ['IP', 150, '이닝']]) { const key = k + n; if (v[k] >= n && !p.ms.d[key]) { p.ms.d[key] = S.day; news(this, `기록 달성: ${p.ko} 시즌 ${n}${lab}${this._fromText(p)}`); this._bondShift(p, 1, '기록 달성'); } } }
    }
  };
  /* ---------------- 라이벌 · 경기 프리뷰 · 리캡 ----------------
     라이벌(게임 설정): 잠실 더비 두산-LG, 낙동강 더비 롯데-NC, 영호남 삼성-KIA, 경인 SSG-KT, 한화-키움. 라이벌전은 홈 관중 +4%, 프리뷰·리캡에 표시. */
  const RIVAL_PAIRS = [['Twins', 'Bears', '잠실 시리즈'], ['Giants', 'Dinos', '낙동강 시리즈'], ['Lions', 'Tigers', '달빛 시리즈'], ['Wiz', 'Landers', '수인선 시리즈'], ['Giants', 'Landers', '항구 시리즈'], ['Giants', 'Lions', '클래식 시리즈'], ['Twins', 'Wiz', '통신사 시리즈'], ['Bears', 'Tigers', '단군 매치'], ['Bears', 'Lions', '싸대기 매치'], ['Giants', 'Tigers', '헤리티지 시리즈'], ['Twins', 'Giants', '엘롯라시코'], ['Twins', 'Heroes', '엘키라시코']];   // 사용자 제공 목록(한화는 해당 없음)
  const rivalOf = (a, b) => RIVAL_PAIRS.find(r => (r[0] === a && r[1] === b) || (r[0] === b && r[1] === a));
  proto.isRival = function (a, b) { return !!rivalOf(a, b); };
  proto.rivalName = function (t, opp) { if (opp) { const r = rivalOf(t, opp); return r ? r[2] : ''; } const r = RIVAL_PAIRS.find(x => x[0] === t || x[1] === t); return r ? r[2] : ''; };
  proto.gamePreview = function (g) {
    const S = this.S, me = S.userTeam, home = g.home, opp = home === me ? g.away : g.home, st = this.standings(), so = st.find(x => x.team === opp), sm = st.find(x => x.team === me), h2 = (S.h2h[me] && S.h2h[me][opp]) || [0, 0, 0];
    const res = (S.results || []).filter(r => r.home === opp || r.away === opp).slice(-5).map(r => { const my = r.home === opp ? r.rh : r.ra, op = r.home === opp ? r.ra : r.rh; return my > op ? '승' : my < op ? '패' : '무'; });
    const bats = this.hitters(opp, true).sort((a, b) => this.ovr(b) - this.ovr(a)).slice(0, 2), sps = this.pitchers(opp, true).filter(p => p.role === 'SP').sort((a, b) => this._runsP(b) - this._runsP(a)).slice(0, 2), pf = S.calib.pf[home] || { runs: 1, hr: 1 };
    const rot = S.teams[me].set.rotation, mySp = S.players[rot[S.teams[me].set.rotIdx % rot.length]];
    const lines = []; if (this.isRival(me, opp)) lines.push(`${this.rivalName(me, opp)} — 라이벌전입니다. 홈 관중이 평소보다 늘어납니다.`);
    if (pf.hr >= 1.08) lines.push('타자 친화 구장(홈런 ↑)'); else if (pf.hr <= 0.85) lines.push('투수 친화 구장(홈런 ↓)');
    if (so.rank <= 3) lines.push(`상위권 상대(${so.rank}위) — 접전 가능성이 높습니다.`); else if (Math.abs(so.rank - sm.rank) <= 2) lines.push('순위 경쟁 상대 — 이기면 순위가 직접 바뀝니다.');
    if (mySp) lines.push(`우리 선발 ${mySp.ko}(OVR ${this.ovr(mySp)}) vs 상대 주요 선발 ${sps[0] ? sps[0].ko + '(OVR ' + this.ovr(sps[0]) + ')' : '-'}`);
    return { opp, home, rank: so.rank, rec: `${so.w}승 ${so.l}패`, h2h: h2, recent: res, bats: bats.map(p => ({ id: p.id, ko: p.ko, ovr: this.ovr(p) })), sps: sps.map(p => ({ id: p.id, ko: p.ko, ovr: this.ovr(p) })), pf, rival: this.isRival(me, opp), lines, mySp: mySp ? { id: mySp.id, ko: mySp.ko, ovr: this.ovr(mySp) } : null };
  };
  proto._recap = function (ctx, rh, ra, trP, trB) {
    const S = this.S, t = S.userTeam, home = ctx.live.home === t, my = home ? rh : ra, op = home ? ra : rh, opp = home ? ctx.live.away : ctx.live.home, win = my > op, tie = my === op;
    const mine = id => { const p = S.players[id]; return p && p.team === t ? p : null; };
    const bs = Object.entries(trB).map(([id, c]) => ({ p: mine(id), c })).filter(x => x.p && x.p.type === 'B').map(x => { const h = (x.c['1B'] || 0) + (x.c['2B'] || 0) + (x.c['3B'] || 0) + (x.c.HR || 0); return { p: x.p, h, hr: x.c.HR || 0, rbi: x.c.RBI || 0, s: (x.c.HR || 0) * 4 + (x.c.RBI || 0) * 1.5 + h }; }).sort((a, b) => b.s - a.s)[0];
    const sp = ctx.prep && ctx.prep.sp, sc = sp && trP[sp.id];
    const bits = []; if (ctx.prep && ctx.prep.presetUsed) bits.push(`프리셋 라인업(${ctx.prep.presetUsed})`); if (bs && bs.s >= 3) bits.push(`${bs.p.ko} ${bs.h}안타${bs.hr ? ' ' + bs.hr + '홈런' : ''}${bs.rbi ? ' ' + bs.rbi + '타점' : ''}`);
    if (sc && sc.outs >= 12) bits.push(`선발 ${sp.ko} ${Math.floor(sc.outs / 3)}${sc.outs % 3 ? '⅓⅔'[sc.outs % 3 - 1] : ''}이닝 ${sc.R}실점${sc.K ? ' ' + sc.K + 'K' : ''}`);
    const g = (S.results || []).filter(r => r.home === t || r.away === t).slice(-15).map(r => (r.home === t ? r.rh : r.ra) - (r.home === t ? r.ra : r.rh)); let n = 0; for (let i = g.length - 1; i >= 0 && !tie && g[i] !== 0 && ((g[i] > 0) === win); i--) n++;
    const text = `${this.isRival(t, opp) ? '[' + this.rivalName(t, opp) + '] ' : ''}${KO0[opp]}전 ${my}:${op} ${tie ? '무승부' : win ? '승' : '패'}${!tie && n >= 3 ? ` (${n}${win ? '연승' : '연패'})` : ''}${bits.length ? ' — ' + bits.join(' · ') : ''}`;
    (S.recap = S.recap || []).unshift({ day: S.day, text, win, tie }); if (S.recap.length > 20) S.recap.pop(); news(this, text); return text;
  };
  /* ---------------- 선수 성격 · 주장 · 클럽하우스 ----------------
     성격(선수별 고정, 시드 기반): 승부사(포스트시즌 컨디션 +1·불만 방치 시 반발 큼) / 모범생(불만 이벤트 드묾·방치 충격 작음) / 자유분방(부진·불만에 취약, 면담 성공률 −) / 리더형(면담 성공률 +, 주장 효과 큼) / 소심형(부진 잘 빠짐, 집중 지도 효과 −).
     주장: 임명하면 팀 전체 컨디션 보정(리더형 +1.0·모범생 +0.6·승부사 +0.4·그 외 +0.3). 요청 트레이드·선수 갈등 이벤트의 해결 확률에도 영향. */
  const TRAITS = { clutch: '승부사', model: '모범생', free: '자유분방', leader: '리더형', shy: '소심형' };
  proto.traitName = function (k) { return TRAITS[k] || ''; };
  proto.traitOf = function (p) {
    if (p.foreign && !p.team) return null; if (p.trait) return p.trait;
    const r = rngFor(this.S.seed, 4242, parseInt(p.id.slice(1))).random(), lead = (p.tn || 0) >= 7 && p.age >= 30 ? 0.12 : 0;
    const x = r - lead; p.trait = lead && r < lead + 0.15 ? 'leader' : x < 0.15 ? 'leader' : x < 0.37 ? 'clutch' : x < 0.62 ? 'model' : x < 0.80 ? 'free' : 'shy'; return p.trait;
  };
  proto.captain = function () { const S = this.S, p = S.captain ? S.players[S.captain] : null; return p && p.team === S.userTeam ? p : null; };
  proto.setCaptain = function (id) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== S.userTeam) return '우리 팀 선수만 주장으로 임명할 수 있습니다.'; if (p.foreign) return '외국인 선수는 주장이 될 수 없습니다.';
    if (S.captain === id) { S.captain = null; news(this, `${p.ko} 주장 해임`); this.invalidate(); return null; }
    S.captain = id; this.traitOf(p); news(this, `${p.ko}(${TRAITS[p.trait]}) 주장 임명 — 팀 컨디션 +${this.capBonus().toFixed(1)}`); this.invalidate(); return null;
  };
  proto.capBonus = function () { const c = this.captain(); if (!c) return 0; return { leader: 1.0, model: 0.6, clutch: 0.4, free: 0.3, shy: 0.3 }[this.traitOf(c)] || 0.3; };
  proto.clubhouse = function () {
    const S = this.S, t = S.userTeam, act = this.players(t).filter(p => p.active), ms = act.map(p => this.moodOf(p)), avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0, cnt = {};
    for (const p of this.players(t)) { const k = this.traitOf(p); cnt[k] = (cnt[k] || 0) + 1; }
    return { captain: this.captain(), mood: Math.round(avg * 10) / 10, counts: cnt, unhappy: this.players(t).filter(p => !p.foreign && (p.loyAdj || 0) <= -4).length };
  };
  /* 요청 트레이드·선수 갈등 이벤트에서 쓰는 보조: 특정 내 선수에 대해 규칙을 통과하는 1대1 제안 */
  proto._offerFor = function (mine, r) {
    const S = this.S, me = S.userTeam; for (const t of TEAMS.filter(x => x !== me).sort(() => r.random() - 0.5)) {
      const vGive = this.tradeValue(mine, t), opts = this.players(t).filter(p => !p.foreign && p.type === mine.type && p.rookie !== S.year && this.tradeValue(p, t) * 1.12 + 0.1 <= vGive).sort((a, b) => this.ovr(b) - this.ovr(a));
      for (const y of opts.slice(0, 4)) { if (this.ovr(y) < this.ovr(mine) - 10) continue; if (this.evaluateTrade(t, [mine.id], [y.id]).ok) return { t, y }; }
    }
    return null;
  };
  /* 부상 복귀: 콜업할지 묻는 결정 카드(콜업 시 교체할 선수는 화면에서 고름). 부상 선수는 콜업 후보 목록에 나오지 않는다 */
  proto._returnEvent = function (p) {
    const S = this.S; if (!S.events) S.events = { seq: 0, list: [] }; if (this.eventsOpen().some(e => e.type === 'return' && e.data.pid === p.id)) return;
    const act = this.players(S.userTeam).filter(x => x.active && x.type === p.type), weak = act.sort((a, b) => this.ovr(a) - this.ovr(b))[0], rec = weak && this.ovr(p) >= this.ovr(weak) + 1 ? 'callup' : 'stay';
    this._evAdd({ type: 'return', title: `${p.ko} 부상 복귀`, ttl: 12, rec, def: 'stay', data: { pid: p.id }, text: `${p.ko}(${p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos} · OVR ${this.ovr(p)})가 ${p.inj ? p.inj.dx : '부상'}에서 복귀했습니다. 1군에 콜업할까요? ${rec === 'callup' ? `(1군 최저 ${weak.ko} OVR ${this.ovr(weak)}보다 높아 콜업을 추천합니다)` : ''}`,
      choices: [{ k: 'callup', label: '콜업 (교체할 선수 선택)', hint: '1군 엔트리에서 같은 유형의 선수와 교체합니다' }, { k: 'stay', label: '2군에서 컨디션 조절', hint: '나중에 직접 올릴 수 있습니다' }] });
  };
  proto.resolveAllRecommended = function () {   // 할 일 함: 추천(없으면 기본) 선택으로 모두 처리
    const out = []; for (const e of this.eventsOpen().slice()) {
      let k = e.rec || e.def || (e.choices[e.choices.length - 1] || {}).k, res;
      if (e.type === 'return' && k === 'callup') { const p = this.S.players[e.data.pid], cs = p ? this.downCandidates(p.id).filter(c => !c.block) : [], c = cs[0]; if (!p || p.active || !c || this.swapActive(p.id, c.p.id)) k = 'stay'; }
      res = this.resolveEvent(e.id, k, true); out.push({ id: e.id, title: e.title, k, msg: res.msg });
    }
    return out;
  };
  /* ---------------- 새 시즌 ---------------- */
  proto.ensureActive = function (t) {   // 1군 28명 유지(부족하면 가치 높은 선수로 채움, 초과하면 낮은 순으로 내림)
    const S = this.S, P = this.players(t);
    for (const p of P) if (!S.teams[t].ids.includes(p.id)) p.active = false;
    let act = P.filter(p => p.active);
    const need = () => ({ B: act.filter(p => p.type === 'B').length, P: act.filter(p => p.type === 'P').length, C: act.filter(p => p.pos === 'C').length });
    while (act.length > ACTIVE_MAX) { const w = act.sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; w.active = false; act = P.filter(p => p.active); }
    const fill = (pred, count) => { const c = P.filter(p => !p.active && !this.isInj(p) && pred(p)).sort((a, b) => this.marketValue(b) - this.marketValue(a)).slice(0, count); c.forEach(p => { p.active = true; }); act = P.filter(p => p.active); };
    let n = need();
    if (n.B < 13) fill(p => p.type === 'B', 13 - n.B); n = need();
    if (n.C < 2) fill(p => p.pos === 'C', 2 - n.C);
    n = need(); if (n.P < 13) fill(p => p.type === 'P', 13 - n.P);
    act = P.filter(p => p.active);
    if (act.length < ACTIVE_MAX) fill(() => true, ACTIVE_MAX - act.length);
    act = P.filter(p => p.active); while (act.length > ACTIVE_MAX) { const w = act.filter(p => p.type === 'B').sort((a, b) => this.marketValue(a) - this.marketValue(b))[0]; w.active = false; act = P.filter(p => p.active); }
    this.invalidate();
  };
  /* 울산 웨일즈(퓨처스 전용): 은퇴로 줄어든 선수를 신인으로 채워 규모(타자 24·투수 22 이상)를 유지 */
  proto.topUpWhales = function () {
    const S = this.S, w = S.fteams && S.fteams.Whales; if (!w || w.ids.length < 20) return;
    const r = rngFor(S.seed, S.year, 61), cnt = k => w.ids.filter(id => S.players[id] && S.players[id].type === k).length;
    for (const k of ['B', 'P']) while (cnt(k) < (k === 'B' ? 24 : 22)) { const p = this.makeRookie(r, k); p.team = 'Whales'; p.rookie = undefined; p.contract = { salary: 0.3, years: 2 }; w.ids.push(p.id); }
    this.invalidate();
  };
  proto.startNewSeason = function () {
    const S = this.S; S.year += 1; S.off = null; S.faMkt = null; S.teamMood = null; S.restUntil = 0; S.trainAcc = { total: 0, B: {}, P: {} }; S.trainTrack = []; for (const id in S.players) if (S.players[id].tr) delete S.players[id].tr; for (const id in S.players) if (S.players[id].mood) delete S.players[id].mood; if (S.events) for (const e of (S.events.list || [])) if (e.status === 'open') { e.status = 'done'; e.result = '시즌 종료로 자동 종결'; } S.fa = (S.fa || []);
    for (const id in S.players) if (S.players[id].retired || S.players[id].team === 'RET') delete S.players[id];   // 은퇴·이탈 선수 정리(저장 용량)
    this.finishFA === undefined; const adj = this.normalizeTalent(); S.lastAdj = adj;
    for (const t of TEAMS) if (t === S.userTeam) this.ensureActive(t);
    this.topUpWhales();
    this.returnMilitary(S.year * 12 + 2);   // 새 시즌 개막(3월) 전까지 전역한 선수 복귀
    this.newSeasonSetup(false); this.repairSettings(S.userTeam);
    const cap = S.calib.cap; S.calib.cap = cap;
    this._setGoals(); S.report = S.report;
    if (this._campApply) this._campApply(); if (this._loyDecay) this._loyDecay(2);   // 새 시즌: 오래된 불만·기쁨이 가라앉는다
    S.prospectsDone = null; S.scWatch = []; S.scPtr = 0; if (this.ensureProspects) this.ensureProspects();   // 이번 시즌의 드래프트 후보 풀 공개
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
    const gb = give.map(id => ({ id, bl: this.bonds ? this.bonds(S.players[id]) : [] }));
    for (const id of give) { this.removeFromTeam(me, id); S.players[id].team = aiTeam; S.players[id].active = false; S.teams[aiTeam].ids.push(id); }
    for (const id of get) delete S.players[id].aiGs;
    for (const id of get) { this.removeFromTeam(aiTeam, id); S.players[id].team = me; S.players[id].active = false; S.teams[me].ids.push(id); }
    for (const id of get) S.players[id].myFrom = { y: S.year, how: `트레이드(${KO0[aiTeam]})` };
    news(this, `트레이드: ${give.map(i => S.players[i].ko).join(', ')} ↔ ${get.map(i => S.players[i].ko).join(', ')} (${aiTeam})`);
    if (this._bondShift) for (const x of gb) this._bondShift(S.players[x.id], -1, '트레이드', x.bl);
    this.refreshTeam(aiTeam); this.repairSettings(me); this.invalidate(); return ev;
  };

  /* ---------------- 재정(손익) 모델 v2 ----------------
   * [데이터] finance_2025.csv: 2025 매출·영업비용·영업이익, 2026 평균 관중, 구장 좌석(검색에서 가장 많이 언급된 값), 모기업(계열사) 의존도(삼성·SSG·롯데만 보도).
   * [수입] 중계권 분배(KBOP 균등: 2026까지 구단당 99억, 2027~2031 144억) + 입장(홈 관중 × 객단가[2026 입장수입 ÷ 2026 총관중] × 티켓 가격 정책) + 모기업·계열사 거래 매출(매출 × 비율, 구단별 감사보고서 값)
   *        + 중계·KBO 분배·MD·기타(2025 매출에서 역산해 고정) + 포스트시즌 배당금 + 우승 시 모기업 보너스.
   * [포스트시즌 배당] 입장수입(경기당 좌석 × 4.5만 원, 전 경기 매진 가정) − 운영비 44% = 배당 재원. 정규시즌 1위 20%, 나머지 80%를
   *        한국시리즈 우승 50 / 준우승 24 / 플레이오프 패 14 / 준PO 패 9 / 와일드카드 패 3 으로 분배(2025 LG 52.8억=17.6+35.2, 한화 16.9억으로 검증).
   *        우승 팀은 배당금의 50%를 모기업 보너스로 추가(LG 79.2억), 그중 선수단 포상금으로 30% 지출(가정).
   * [비용] 선수단 보수 + 운영비(2025 영업비용 − 초기 보수) + 야구발전기금(CBT) + 우승 포상금.
   * [예산] FA 여유자금 = 직전 시즌 매출 − 운영비 + 허용 적자(매출의 3% × (0.5 + 이사회 신뢰도/100)) − 선수단 보수.
   * [이사회 신뢰도] 0~100(시작 60): 성적·포스트시즌·우승, 영업 손익이 허용 적자 안인지에 따라 변동. 낮으면 허용 적자(예산)가 줄어든다. */
  const BC_BASE = 99, BC_NEXT = 144, FIN_PRICE = 15600 / 1e8, FIN_GAMES = 72, PS_PRICE = 45000 / 1e8, PS_COST = 0.44, PARENT_BONUS = 0.5, PLAYER_BONUS = 0.3, PAR_DEFAULT = 0.30, ELAST = 0.6, LOSS = 0.03;
  const PS_SHARE = { reg: 0.2, ks: 0.4, ksL: 0.192, poL: 0.112, jpoL: 0.072, wcL: 0.024 };
  const PRICE_PM = [0.9, 1, 1.1, 1.2];
  proto._initFinance = function (data) {
    const S = this.S; S.fin = { v: 3, teams: {}, hist: [] }; if (!data) return;
    const kn = TEAMS.filter(t => data[t] && data[t].gate), avgPrice = kn.length ? kn.reduce((a, t) => a + data[t].gate / data[t].tot25, 0) / kn.length : FIN_PRICE;   // 객단가 = 2025 입장수입 ÷ 2025 총관중(KBO 공식). 입장수입 미공시 구단에는 평균 적용
    for (const t of TEAMS) {
      const d = data[t]; if (!d) continue;
      const price = d.gate26 ? d.gate26 / d.tot26 : d.gate ? d.gate / d.tot25 : avgPrice * d.tot25 / (d.att25 * FIN_GAMES), estGate = d.gate || d.att25 * FIN_GAMES * price, pay0 = this.payroll(t), par = d.par !== null && d.par !== undefined ? d.par / 100 : PAR_DEFAULT;
      S.fin.teams[t] = { att0: d.att, cap: d.cap, capchg: d.capchg || [], capsrc: d.capsrc, chgsrc: d.chgsrc, price, pm: 1, par, parKnown: d.par !== null && d.par !== undefined, parAds: Math.round(d.rev * par * 10) / 10, other: Math.round((d.rev - estGate - d.rev * par - BC_BASE) * 10) / 10, opex: Math.round((d.cost - pay0) * 10) / 10, parts: this._opexParts(d, pay0), costNote: d.costs ? d.costs.note : '', rev0: d.rev, op0: d.op, audit: d.audit || [], parsrc: d.parsrc, park: d.park, note: d.note, gateKnown: !!d.gate, price26: !!d.gate26, tot26: d.tot26, gate26: d.gate26, gate25: d.gate, gate: 0, games: 0, lastRev: d.rev, trust: 60 };
    }
  };
  /* 운영비 분해(2025 감사보고서): 선수단 기타(선수단운영비 − 현재 보수) / 프런트·직원 / 경기진행 / 사업·구장 원가 / 기타(감가·수수료·협회비 등). 합 = 2025 영업비용 − 초기 보수 */
  proto._opexParts = function (d, pay0) {
    const c = d.costs, r1 = x => Math.round(x * 100) / 100; if (!c) return null;
    const tm = c.team !== null ? c.team : c.unsplit;   // 두산: 선수단운영비와 사업원가가 분리되어 있지 않아 매출원가 전체를 선수단 쪽에 둔다
    return { teamX: r1(tm - pay0), staff: c.staff || 0, game: c.game || 0, biz: c.biz || 0, other: c.other || 0, unsplit: c.team === null };
  };
  proto.finBC = function (year) { return (year || this.S.year) >= 2027 ? BC_NEXT : BC_BASE; };   // KBOP 중계권 균등 분배: 2024~2026 연 990억/10 = 99억, 2027~2031 연 1,440억/10 = 144억
  proto.finReady = function () { const F = this.S.fin; return !!(F && F.v === 3 && F.teams && F.teams.Lions); };
  proto.finCap = function (t, year) { const f = this.S.fin.teams[t]; let c = f.cap; for (const [y, v] of f.capchg) if ((year || this.S.year) >= y) c = v; return c; };
  proto.finAtt = function (t) {   // 홈 관중: 기준 관중 × 성적 보정 × 티켓 가격 탄력성, 좌석 수 이내
    const S = this.S, f = S.fin.teams[t], r = S.rec[t], wp = (r[0] + r[1] + r[2]) >= 10 ? r[0] / Math.max(1, r[0] + r[1]) : 0.5;
    return Math.min(this.finCap(t), Math.round(f.att0 * clamp(1 + 0.8 * (wp - 0.5), 0.8, 1.25) * clamp(1 - ELAST * (f.pm - 1), 0.6, 1.2) * (f.attMult || 1) * (f.promo && S.day < f.promo.until ? f.promo.mult : 1)));   // 이벤트(광고 확대·팬 이벤트) 보정
  };
  proto._finGame = function (home, away) { if (!this.finReady()) return; const f = this.S.fin.teams[home]; if (!f) return; f.gate += this.finAtt(home) * f.price * f.pm * (this.isRival(home, away) ? 1.04 : 1); f.games++; };   // 라이벌전은 홈 관중 +4%
  proto.setTicketPolicy = function (t, pm) { if (!this.finReady() || !PRICE_PM.includes(pm)) return false; this.S.fin.teams[t].pm = pm; return true; };
  proto.finPay = function (t) { return Math.round((this.payroll(t) + this.coachPayDelta(t) + (this.scoutPay ? this.scoutPay(t) : 0) + this.deadNow(t) + this.S.teams[t].ids.reduce((a, id) => { const c = this.S.players[id].contract; return a + (c.amort && c.years > 0 ? c.amort : 0); }, 0)) * 10) / 10; };   // 선수단 보수 = 연봉 + 신규 FA 계약금 상각
  proto.finAllowed = function (t) { const f = this.S.fin.teams[t]; return f.lastRev * LOSS * (0.5 + f.trust / 100); };
  proto.finBudget = function (t) { const f = this.S.fin.teams[t]; return Math.round((f.lastRev - f.opex + this.finAllowed(t) + (f.boardExtra || 0)) * 10) / 10; };   // 이사회 승인 추가 예산 포함
  proto.faRoom = function (t) { return this.finReady() ? Math.round((this.finBudget(t) - this.finPay(t)) * 10) / 10 : 1e9; };
  proto.finPreview = function (t) {   // 시즌 예상 손익(진행분 + 남은 홈 경기를 현재 관중으로 환산), 포스트시즌 수입 제외
    const S = this.S, f = S.fin.teams[t], rem = Math.max(0, FIN_GAMES - f.games), gate = f.gate + rem * this.finAtt(t) * f.price * f.pm;
    const pay = this.finPay(t), v = this.cbtPreview(t), cbt = v.fee || 0, bc = this.finBC(), ev = f.evRev || 0, evc = f.evCost || 0, rev = gate + f.parAds + f.other + bc + ev;
    return { gate, par: f.parAds, other: f.other, bc, ev, evc, dead: this.deadNow(t), parts: f.parts, rev, pay, opex: f.opex, cbt, op: rev - pay - f.opex - evc - cbt, att: this.finAtt(t), cap: this.finCap(t), room: this.faRoom(t), budget: this.finBudget(t), trust: f.trust, allowed: this.finAllowed(t) };
  };
  proto._psSettle = function () {   // 포스트시즌 입장수입 → 배당 재원 → 팀별 배당
    const P = this.S.post; if (!P || !P.rounds || !P.rounds.length) return null;
    let gate = 0, games = 0; const alloc = {}, add = (t, x) => { if (t) alloc[t] = (alloc[t] || 0) + x; };
    P.rounds.forEach(r => { if (r) for (const g of r.games) { gate += this.finCap(g.home) * PS_PRICE; games++; } });
    const pool = gate * (1 - PS_COST), lose = r => r.winner === r.hi ? r.lo : r.hi;
    add(P.seeds[0], pool * PS_SHARE.reg);
    const keys = ['wcL', 'jpoL', 'poL']; P.rounds.forEach((r, i) => { if (r && r.winner) { if (i < 3) add(lose(r), pool * PS_SHARE[keys[i]]); else { add(r.winner, pool * PS_SHARE.ks); add(lose(r), pool * PS_SHARE.ksL); } } });
    return { gate, games, pool, alloc, champion: P.done ? P.champion : null, runnerUp: P.done ? P.runnerUp : null };
  };
  proto.settleFinance = function () {
    const S = this.S; if (!this.finReady()) return; const row = { year: S.year, teams: {} }, ps = this._psSettle(), st = this.standings();
    row.ps = ps ? { gate: Math.round(ps.gate * 10) / 10, games: ps.games, pool: Math.round(ps.pool * 10) / 10 } : null;
    for (const t of TEAMS) {
      const f = S.fin.teams[t], v = this.finPreview(t), lg = (S.cbt.log || []).filter(x => x.team === t && x.year === S.year).pop(); if (lg) { v.op += v.cbt - lg.fee; v.cbt = lg.fee; }   // 야구발전기금은 방금 정산한 실제 금액
      const rr = S.rec[t], wp = rr[0] / Math.max(1, rr[0] + rr[1]), div = ps ? (ps.alloc[t] || 0) : 0, champ = ps && ps.champion === t, bonus = champ ? div * PARENT_BONUS : 0, prize = champ ? (div + bonus) * PLAYER_BONUS : 0;
      const op = v.op + div + bonus - prize, rank = st.find(x => x.team === t).rank, inPS = S.post && S.post.seeds.includes(t);
      let d = champ ? 12 : (ps && ps.runnerUp === t) ? 6 : inPS ? 3 : rank > 7 ? -6 : -3;
      d += op >= 0 ? 2 : (-op > f.lastRev * LOSS * (0.5 + f.trust / 100) ? -6 : -1);
      const trust = clamp(Math.round(f.trust + d), 0, 100);
      row.teams[t] = { gate: Math.round(v.gate * 10) / 10, par: f.parAds, other: f.other, bc: v.bc, rev: Math.round((v.rev + div + bonus) * 10) / 10, ps: Math.round(div * 10) / 10, bonus: Math.round(bonus * 10) / 10, prize: Math.round(prize * 10) / 10, pay: Math.round(v.pay * 10) / 10, opex: f.opex, cbt: Math.round(v.cbt * 100) / 100, op: Math.round(op * 10) / 10, att: v.att, trust, dTrust: trust - f.trust, rank };
      f.lastRev = v.rev - (f.evRev || 0); f.trust = trust; f.evRev = 0; f.evCost = 0; f.attMult = 1; f.promo = null; f.boardExtra = 0; f.pers = null; f.snap = []; f.dead = (f.dead || []).filter(x => x.year > S.year);   // 시즌 한정 이벤트 효과 정리·지난 위약금 소멸 f.att0 = Math.min(this.finCap(t, S.year + 1), Math.round(f.att0 * clamp(1 + 0.35 * (wp - 0.5) + (champ ? 0.03 : 0), 0.92, 1.1)));   // 성적이 좋으면 다음 해 기준 관중 상승
      f.gate = 0; f.games = 0;
    }
    S.fin.hist.push(row); if (S.fin.hist.length > 20) S.fin.hist.shift();
    const my = row.teams[S.userTeam]; news(this, `재정 결산 ${S.year}: 매출 ${my.rev}억 · 선수단 ${my.pay}억 · 영업이익 ${my.op >= 0 ? '+' : ''}${my.op}억${my.ps ? ` (포스트시즌 배당 ${my.ps}억${my.bonus ? ` + 모기업 보너스 ${my.bonus}억, 선수단 포상 ${my.prize}억` : ''})` : ''} · 이사회 신뢰도 ${my.trust}(${my.dTrust >= 0 ? '+' : ''}${my.dTrust})`);
  };

  /* ---------------- 부상 ----------------
   * [초기 장기 부상자] 뉴스 기반(data/injuries_2026.csv): 문동주·엄상백·윤영철·박진·이호성·신민혁·김영규·양재훈 등은 복귀 예정일까지 부상자 명단(1군 등록 불가).
   * [시즌 중 부상] 1군 선수가 경기일마다 확률적으로 부상(타자 0.30%·선발 0.42%·불펜 0.33%/일, 33세 이상 ×1.3, 24세 이하 ×0.9).
   *   경상 55%(7~14일) · 중등도 30%(15~35일) · 장기 12%(45~100일) · 시즌 아웃급 3%(150~330일, 수술). 달력 기준으로 회복하며, 회복하면 2군에서 대기(내 팀은 직접 등록, AI는 자동). */
  const INJ_B = [['햄스트링 염좌', 3], ['허리 통증', 2], ['손목 통증', 2], ['어깨 통증', 2], ['무릎 통증', 2], ['발목 염좌', 2], ['옆구리(복사근) 통증', 2], ['손가락 골절', 1], ['종아리 근육통', 2], ['사구 타박상', 2]];
  const INJ_P = [['팔꿈치 통증', 4], ['어깨 통증', 3], ['팔 피로 누적', 3], ['손가락 물집', 2], ['내전근 통증', 1], ['옆구리(복사근) 통증', 2], ['허리 통증', 1], ['햄스트링 염좌', 1]];
  const pickW = (r, list) => { let x = r.random() * list.reduce((a, b) => a + b[1], 0); for (const [n, w] of list) { if ((x -= w) < 0) return n; } return list[0][0]; };
  proto._injFix = function () { for (const p of Object.values(this.S.players)) if (p.inj && !this.isInj(p) && p.inj.generated) delete p.inj; };
  proto._injuryDay = function (d) {
    const S = this.S, now = this.todayN(), r = rngFor(S.seed, S.year, d, 7000), changed = new Set(), user = S.userTeam, back = {}, out = {};
    for (const t of TEAMS) for (const p of this.players(t)) {
      if (p.inj && p.inj.apply !== false && !this.isInj(p)) {   // 복귀
        if (t === user) { news(this, `부상 복귀: ${p.ko} (${p.inj.dx}) — 2군에서 대기 중`); this._bondShift(p, 1, '부상 복귀'); if (!p.foreign || true) this._returnEvent(p); }
        if (p.inj.generated) delete p.inj; else p.inj.apply = false; changed.add(t); (back[t] = back[t] || []).push(p);
      }
    }
    for (const t of TEAMS) for (const p of this.players(t)) {
      if (!p.active || this.isInj(p)) continue;
      const pol = t === user ? this.policy() : null, hz = (p.type === 'B' ? 0.0030 : p.role === 'SP' ? 0.0042 : 0.0033) * (p.age >= 33 ? 1.3 : p.age <= 24 ? 0.9 : 1) * (pol ? (p.type === 'P' ? { save: 0.8, normal: 1, push: 1.3 }[pol.pitch] : { low: 0.95, normal: 1, high: 1.1 }[pol.run]) * (S.restUntil && d < S.restUntil ? 0.75 : 1) * this._trainInjFor(p) : 1);   // 운영 방침: 투수 혹사(push)·적극 주루는 부상 위험↑
      if (r.random() >= hz) continue;
      const u = r.random(), days = u < 0.55 ? 7 + Math.floor(r.random() * 8) : u < 0.85 ? 15 + Math.floor(r.random() * 21) : u < 0.97 ? 45 + Math.floor(r.random() * 56) : 150 + Math.floor(r.random() * 181);
      const sev = u < 0.55 ? '' : u < 0.85 ? '' : u < 0.97 ? '(장기)' : '(수술·시즌 아웃급)', part = pickW(r, p.type === 'B' ? INJ_B : INJ_P);
      const retN = now + days, rd = new Date(retN * 864e5);
      p.inj = { dx: u >= 0.97 ? part.replace('통증', '손상 → 수술') : part, since: `${S.year}-${String(new Date(now * 864e5).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(now * 864e5).getUTCDate()).padStart(2, '0')} 발생`, ret: rd.toISOString().slice(0, 10), retN, basis: '시즌 중 발생한 부상(확률 모델)', apply: true, generated: true };
      p.active = false; changed.add(t); (out[t] = out[t] || []).push(p);
      if (t === user) { news(this, `부상: ${p.ko} — ${p.inj.dx}${sev}, 약 ${days}일 (복귀 예정 ${this.injDateStr(p)})`); if (days >= 30) this._bondShift(p, -1, '장기 부상'); }
    }
    {   // 부상으로 1군이 최소 인원(타자 10·투수 8) 아래가 되면 건강한 2군 선수를 자동 등록(경기 진행 불가 방지)
      const a = this.players(user).filter(p => p.active), nb = a.filter(p => p.type === 'B').length, np = a.filter(p => p.type === 'P').length;
      if (nb < 10 || np < 8) { this.ensureActive(user); this.repairSettings(user); this.invalidate(); news(this, '부상자 때문에 1군 엔트리가 최소 인원(타자 10·투수 8) 아래로 내려가 건강한 2군 선수를 자동 등록했습니다.'); }   // 내가 직접 정한 엔트리는 존중하고 경기 진행에 필요한 최소 인원일 때만 개입
    }
    for (const t of changed) {
      if (t === user) { this.repairSettings(t); this.invalidate(); continue; }
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
  proto._devRole = function (p, plan) { const manual = p.dev && !p.dev.auto; if (plan === 'SP') { if (manual || (p.stamina >= 50 && p.role !== 'SP')) p.role = 'SP'; } else if (p.role === 'SP' && plan !== 'SP' && manual) p.role = 'RP'; };
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
