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
    const pf = play === undefined ? 1 : 0.55 + 0.45 * clamp(play, 0, 1);   // 경기에 못 나온 젊은 선수는 성장이 더딘다(최대 -45%)
    if (a <= 26 && gain > 0) gain *= pf;
    if (a <= 26 && p.pot > 0) { const g2 = Math.min(p.pot, 0.4) * (0.6 + 0.8 * r.random()) * pf; gain = Math.max(gain, g2); p.pot = Math.max(0, p.pot - Math.max(0, g2)); }
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
    return this.ovr(p) - old;
  };
  proto.retireChance = function (p) { const o = this.ovr(p), a = p.age; if (a >= 42) return 1; if (a < 35) return 0; return clamp(0.10 * (a - 34) + (o < 45 ? 0.25 : o < 50 ? 0.1 : 0) - (o >= 60 ? 0.15 : 0), 0, 0.95); };

  /* ---------------- 신인 생성 ---------------- */
  proto.makeRookie = function (r, type, forcePos) {
    const S = this.S, sc = S.calib.scale[type], lb = S.calib.lb, id = (type === 'B' ? 'B' : 'P') + (S.nextId++);
    const g = gauss(r, 0, 0.5), z = () => -1.1 + g + gauss(r, 0, 0.6);
    let name; do { name = SURN[Math.floor(r.random() * SURN.length)] + GIV[Math.floor(r.random() * GIV.length)]; } while (this._nameTaken && this._nameTaken.has(name) && this._nameTaken.size < 800);
    (this._nameTaken = this._nameTaken || new Set()).add(name);
    const age = 18 + Math.min(5, Math.floor(r.random() * r.random() * 6 + r.random() * 2));
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
    p.contract = { salary: 0.3, years: 3 };
    p.scout = { o: this.ovr(p) + Math.round(gauss(r, 0, 3)), pot: clamp(p.pot + gauss(r, 0, 0.25), 0, 2) };
    S.players[id] = p; return p;
  };
  proto.potGrade = function (v) { return v >= 1.3 ? 'A' : v >= 0.9 ? 'B' : v >= 0.55 ? 'C' : v >= 0.25 ? 'D' : 'E'; };

  /* ---------------- 오프시즌 ---------------- */
  proto.askSalary = function (p) { return Math.max(0.3, Math.round(this.price(p) * (p.age >= 34 ? 0.9 : 1.12) * 10) / 10); };
  proto.release = function (t, id) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== t) return;
    S.teams[t].ids = S.teams[t].ids.filter(x => x !== id); p.active = false; p.team = 'FA'; p.contract = { salary: this.askSalary(p), years: 1 };
    S.fa = S.fa || []; S.fa.push(id); this.invalidate(); if (t === S.userTeam) this.repairSettings(t);
  };
  proto.removeFromTeam = function (t, id) { const S = this.S; if (!S.teams[t]) { S.mil = (S.mil || []).filter(x => x !== id); return; } S.teams[t].ids = S.teams[t].ids.filter(x => x !== id); };

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
    // 3) 계약 만료
    for (const t of TEAMS) for (const id of S.teams[t].ids.slice()) {
      const p = S.players[id]; p.contract.years -= 1; if (p.contract.years > 0) continue;
      if (t === user) { rep.expiring.push(id); continue; }
      const o = this.ovr(p), keep = r.random() < clamp(0.25 + (o - 40) * 0.025 - (p.age >= 34 ? 0.25 : 0), 0.08, 0.72);   // 스타도 28%는 FA 시장에 나온다
      if (keep) { p.contract = { salary: this.askSalary(p), years: 1 + Math.floor(r.random() * 3) }; } else { this.release(t, id); }
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
    const S = this.S, off = S.off; for (const id of off.rep.expiring.slice()) this.release(S.userTeam, id);
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
      const best = d.pool.map(id => { const p = S.players[id]; return { id, s: this.ovr(p) + 14 * p.pot + gauss(r, 0, 3) }; }).sort((a, b) => b.s - a.s)[0];
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
    while (d.pick < d.order.length) { if (this.draftOnClock() === S.userTeam) { if (S.teams[S.userTeam].ids.length >= ROSTER_MAX) { d.pick++; continue; } const best = d.pool.map(id => ({ id, s: S.players[id].scout.o + 14 * S.players[id].scout.pot })).sort((a, b) => b.s - a.s)[0]; this._draftTake(S.userTeam, best.id); } else this.draftAiUntilUser(); }
  };
  proto.finishDraft = function () {
    const S = this.S, d = S.off.draft; for (const id of d.pool) { S.players[id].retired = true; S.players[id].team = 'RET'; } d.pool = [];
  };

  /* ---------- FA ---------- */
  proto.faList = function () { const S = this.S; return (S.fa || []).map(id => S.players[id]).filter(p => p && p.team === 'FA'); };
  proto.signFA = function (id, years) {
    const S = this.S, p = S.players[id], t = S.userTeam; if (!p || p.team !== 'FA') return '이미 계약된 선수입니다.';
    const ask = this.askSalary(p);   // 상한 초과는 허용(시즌 종료 시 야구발전기금 부과)
    if (S.teams[t].ids.length >= ROSTER_MAX) return `보유 선수 ${ROSTER_MAX}명 제한입니다.`;
    p.team = t; p.contract = { salary: ask, years: clamp(years || 2, 1, 4) }; S.teams[t].ids.push(id); S.fa = S.fa.filter(x => x !== id); this.invalidate(); news(this, `FA ${p.ko} 영입 (${ask}억, ${p.contract.years}년)`); return null;
  };
  proto.finishFA = function () {   // AI 팀이 남은 FA를 영입하고 로스터를 채운다
    const S = this.S, r = rngFor(S.seed, S.year, 51), teams = TEAMS.filter(t => t !== S.userTeam).sort(() => r.random() - 0.5);
    for (const t of teams) {
      let n = 0; const need = k => this.players(t).filter(p => p.type === k).length;
      const pool = this.faList().sort((a, b) => this.war(b) - this.war(a));
      for (const p of pool) {
        if (n >= 3 || S.teams[t].ids.length >= ROSTER_MAX - 4) break;
        const ask = this.askSalary(p); if (this.cbtPay(t) + ask > this.cbtCap() * 0.97) continue; if (this.war(p) < 1.0) continue;   // AI 구단은 상한을 지킨다
        if (r.random() < (this.war(p) >= 2 ? 0.75 : 0.5)) { p.team = t; p.contract = { salary: ask, years: 1 + Math.floor(r.random() * 3) }; S.teams[t].ids.push(p.id); S.fa = S.fa.filter(x => x !== p.id); n++; }
      }
      // 연봉 하한(2027~) 미달이면 하한을 넘길 때까지 FA를 영입한다(미달 시 기금 납부를 피하려고)
      { const fl = this.cbtFloor(); if (fl !== null) for (let k = 0; k < 6 && this.cbtPay(t) < fl * 1.03 && S.teams[t].ids.length < ROSTER_MAX; k++) {
        const p = this.faList().filter(x => this.cbtPay(t) + this.askSalary(x) <= this.cbtCap() * 0.97).sort((a, b) => this.war(b) - this.war(a))[0]; if (!p) break;
        p.team = t; p.contract = { salary: this.askSalary(p), years: 1 + Math.floor(r.random() * 3) }; S.teams[t].ids.push(p.id); S.fa = S.fa.filter(x => x !== p.id);
      } }
      // 핵심 포지션(포수·유격수·중견수·2루수·3루수)에 주포지션 선수가 2명 미만이면 보강
      for (const pos of ['C', 'SS', 'CF', '2B', '3B']) {
        while (this.hitters(t).filter(x => x.pos === pos).length < 2) {
          const fa = this.faList().filter(x => x.type === 'B' && x.pos === pos).sort((a, b) => this.war(b) - this.war(a))[0], np = fa || this.makeRookie(r, 'B', pos);
          if (fa) S.fa = S.fa.filter(x => x !== fa.id); np.team = t; np.contract = { salary: Math.max(0.3, Math.min(this.askSalary(np), 0.8)), years: 1 }; S.teams[t].ids.push(np.id);
        }
      }
      // 최소 인원 보장
      for (const kind of ['B', 'P']) while (need(kind) < (kind === 'B' ? 24 : 26)) {
        const p = this.faList().filter(x => x.type === kind).sort((a, b) => this.war(b) - this.war(a))[0] || this.makeRookie(r, kind);
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
  proto.startNewSeason = function () {
    const S = this.S; S.year += 1; S.off = null; S.fa = (S.fa || []);
    for (const id in S.players) if (S.players[id].retired || S.players[id].team === 'RET') delete S.players[id];   // 은퇴·이탈 선수 정리(저장 용량)
    this.finishFA === undefined; const adj = this.normalizeTalent(); S.lastAdj = adj;
    for (const t of TEAMS) if (t === S.userTeam) this.ensureActive(t);
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
    const aiPay = this.cbtPay(aiTeam) + gp.reduce((a, p) => a + (p.rookie === S.year || p.foreign ? 0 : p.contract.salary), 0) - tp.reduce((a, p) => a + (p.rookie === S.year || p.foreign ? 0 : p.contract.salary), 0);
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
