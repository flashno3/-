(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 신인 생성·잠재력·드래프트 지명 결과 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, TIERS, clamp, gauss, rngFor, slotPrior, SURN, GIV, POSW } = LG.OFFC;
  /* ---------------- 신인 생성 ---------------- */
  /* ---------------- 신인 잠재력(최종 도달 능력치, 확률 분포) ----------------
   * 드래프트 순번과 무관하게 선수마다 숨은 '정점 OVR'(peak)을 확률로 뽑는다. 스카우트 평가(scout.ceil)는 정점 + 오차(σ=16)라서
   * 높은 순번일수록 정점이 높을 가능성은 크지만 확정은 아니다(1라운드 실패·하위 지명 대박 모두 가능). */
  /* tilt: 지명 순위·계약금 등 사전 평가에 따른 기울기(0=무관). 등급 확률 ∝ 기본확률 × exp(tilt × [2,1,0,-1,-2]) — 확률만 바뀌고 결과는 열려 있다 */
  proto.rollPeak = function (r, tilt, prior) {   // prior: 슬롯별 실제 등급 분포(5개 확률), 없으면 기본 확률
    const q = [2, 1, 0, -1, -2], w = TIERS.map((t, i) => (prior ? prior[i] : t[1]) * Math.exp((tilt || 0) * q[i])), tot = w.reduce((a, b) => a + b, 0);
    let x = r.random() * tot; for (let i = 0; i < TIERS.length; i++) { if ((x -= w[i]) < 0) return TIERS[i][2] + (TIERS[i][3] - TIERS[i][2]) * r.random(); }
    return 36;
  };
  /* 2002~2017 신인 드래프트 1,528명의 실제 경력(통산 타석·이닝)으로 본 지명 슬롯별 최종 등급 분포 [슈퍼스타, 확실한 주전, 준주전, 후보, 육성급].
   * 등급 기준: 타자 통산 타석 5000/2500/1000/200, 투수 통산 이닝 1200/600/250/50 이상. 표본이 작은 슬롯은 기본 분포를 15% 섞는다. */
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
      p.contract = { salary: this.minSal(), years: 1 }; p.fa.univ = !!univ; S.teams[d.team].ids.push(p.id);
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
    const dupName = !!opts.name && this._nameTaken.has(name);   // 실제 지명자 이름이 기존 선수와 겹치면 동명이인으로 표시(무작위 이름은 겹치지 않게 뽑는다)
    this._nameTaken.add(name); this._nameTakenN = nPl + 1;
    const age = opts.age || 18 + Math.min(5, Math.floor(r.random() * r.random() * 6 + r.random() * 2));
    const p = { id, type, name, ko: name, team: 'DRAFT', age, rookie: S.year + 1, foreign: false, active: false, fat: 0, lastStart: -99, retired: false, pot: Math.max(0, gauss(r, 0.75, 0.5)), p: {}, mil: { st: 'pending', src: 'gen' } };   // 국내 신인은 병역 미필로 시작
    if (dupName) { p.ns = true; for (const q of Object.values(S.players)) if (q.ko === name) q.ns = true; }
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
    p.contract = { salary: this.minSal(), years: 1 }; p.fa = { svc: 0, used: 0, last: null, regDays: 0, rem: 0, univ: false }; p.salHist = [this.minSal()];
    S.players[id] = p;
    p.peak = this.rollPeak(r, opts.tilt, opts.prior);   // 숨은 정점 OVR
    const target = Math.min(clamp(p.peak - (27 - p.age) * 2.0 - 4 + gauss(r, 0, 7), 20, p.peak), 38 + (p.age - 18) * 4);   // 어린 신인이 곧바로 주전급이 되지 않도록 현재 능력치 상한   // 현재 능력치를 정점에 맞춰 정렬(어릴수록 격차 큼)
    for (let k = 0; k < 5; k++) { const g = (target - this.ovr(p)) / 14; if (Math.abs(g) < 0.08) break; this._gain(p, g, r, 0); }
    p.pot = clamp((p.peak - this.ovr(p)) / 30, 0, 1.4);
    p.scout = { o: this.ovr(p) + Math.round(gauss(r, 0, 3)), ceil: clamp(p.peak + gauss(r, 0, 16), 25, 85) };
    S.players[id] = p; return p;
  };
  proto.potGrade = function (v) { return v >= 1.3 ? 'A' : v >= 0.9 ? 'B' : v >= 0.55 ? 'C' : v >= 0.25 ? 'D' : 'E'; };

});
