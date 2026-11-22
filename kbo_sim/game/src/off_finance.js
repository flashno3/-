(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 재정(손익) 모델 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, TEAMS, clamp, news } = LG.OFFC;
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
  /* 관중 수요 모델: 경기별 수요를 로그정규분포(평균 = 잠재 수요 dem, 변동 σ)로 보고, 관중 = 수요와 좌석 수 중 작은 값의 기댓값 E[min(수요, 좌석)].
     2026 실제 평균 관중(att)은 매진으로 '잘린' 값이라, 좌석 점유율이 높은 구단은 잠재 수요가 좌석보다 크다(예: 삼성 98%). 좌석을 늘리면 그만큼 관중이 늘고,
     성적·가격 변화는 매진 구단에서 덜 민감하다. σ=0.32는 2026 리그 매진 345/720경기(48%)에 맞춘 값(⚠ 구단별 매진 횟수 자료는 없음). 시작 시점 기대 관중은 실제 평균과 같다. */
  const SIG = 0.32, erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }, Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const expMin = (mu, c) => { if (!(mu > 0)) return 0; const a = (Math.log(c / mu) - SIG * SIG / 2) / SIG, b = (Math.log(c / mu) + SIG * SIG / 2) / SIG; return mu * Phi(a) + c * (1 - Phi(b)); };
  const invDem = (A, c) => { let lo = A, hi = A * 5; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (expMin(m, c) < A) lo = m; else hi = m; } return (lo + hi) / 2; };
  const PS_SHARE = { reg: 0.2, ks: 0.4, ksL: 0.192, poL: 0.112, jpoL: 0.072, wcL: 0.024 };
  const PRICE_PM = [0.9, 1, 1.1, 1.2];
  proto._initFinance = function (data) {
    const S = this.S; S.fin = { v: 3, teams: {}, hist: [] }; if (!data) return;
    const kn = TEAMS.filter(t => data[t] && data[t].gate), avgPrice = kn.length ? kn.reduce((a, t) => a + data[t].gate / data[t].tot25, 0) / kn.length : FIN_PRICE;   // 객단가 = 2025 입장수입 ÷ 2025 총관중(KBO 공식). 입장수입 미공시 구단에는 평균 적용
    for (const t of TEAMS) {
      const d = data[t]; if (!d) continue;
      const price = d.gate26 ? d.gate26 / d.tot26 : d.gate ? d.gate / d.tot25 : avgPrice * d.tot25 / (d.att25 * FIN_GAMES), estGate = d.gate || d.att25 * FIN_GAMES * price, pay0 = this.payroll(t), par = d.par !== null && d.par !== undefined ? d.par / 100 : PAR_DEFAULT;
      S.fin.teams[t] = { att0: d.att, dem: invDem(d.att, d.cap), cap: d.cap, capchg: d.capchg || [], capsrc: d.capsrc, chgsrc: d.chgsrc, price, pm: 1, par, parKnown: d.par !== null && d.par !== undefined, parAds: Math.round(d.rev * par * 10) / 10, other: Math.round((d.rev - estGate - d.rev * par - BC_BASE) * 10) / 10, opex: Math.round((d.cost - pay0) * 10) / 10, parts: this._opexParts(d, pay0), costNote: d.costs ? d.costs.note : '', rev0: d.rev, op0: d.op, audit: d.audit || [], parsrc: d.parsrc, park: d.park, note: d.note, gateKnown: !!d.gate, price26: !!d.gate26, tot26: d.tot26, gate26: d.gate26, gate25: d.gate, gate: 0, games: 0, lastRev: d.rev, trust: 60 };
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
  /* 구장 계획(사용자 제공 2차 자료, ⚠ 수치 일부 가정): 잠실(LG·두산) 2027~2031 올림픽주경기장 임시 이전 — 정규시즌 1~2층 약 18,000석(일반 경기, finCap), 빅매치는 3층 추가 개방으로 최대 3만 석 이상(3만~3만 4천 → 30,000석으로 가정),
   * 포스트시즌 홈경기도 3층 개방 30,000석, 객단가 ×1.12. 2032~ 잠실돔 30,673석(객단가는 자료 없음 → 1.0 가정). SSG는 2028 청라돔 이전으로 객단가 +35~45%라는 자료가 있으나 한 구단만 튀어 사용자 요청으로 ×1.15(리그 최대 연 인상폭 +13.6%(2025) 수준의 일회성 점프)로 낮춰 반영(좌석 수 동일).
   * 빅매치 = 잠실 라이벌전(LG–두산) + 홈 개막전 + 어린이날(5/5) 홈경기(연간 경기 수는 공식 미확정 — 자료가 거론한 라이벌전·개막전 + 가정, ≈10경기). '주말 인기 매치'는 기준이 없어 미반영. 포스트시즌 입장 수입은 기존 PS 객단가(45,000원)를 유지하고 수용량만 바꾼다(자료의 ×1.25는 정규 객단가 대비 값인데 게임의 PS 객단가가 이미 더 높다). */
  const STADIUM = { Twins: { tier: [2027, 2031], bigCap: 30000, psCap: 30000, price: [[2027, 1.12], [2032, 1]] }, Bears: { tier: [2027, 2031], bigCap: 30000, psCap: 30000, price: [[2027, 1.12], [2032, 1]] }, Landers: { price: [[2028, 1.15]] } }, BIG_SHARE = 10 / 72;
  proto.finTier = function (t, year) { const s = STADIUM[t], y = year || this.S.year; return s && s.tier && y >= s.tier[0] && y <= s.tier[1] ? s : null; };
  proto.finPriceMult = function (t, year) { const s = STADIUM[t], y = year || this.S.year; let m = 1; if (s && s.price) for (const [yy, v] of s.price) if (y >= yy) m = v; return m; };
  proto.isBigMatch = function (home, away) { if (!this.finTier(home)) return false; if (this.isRival(home, away)) return true; const fin = this.S.fin && this.S.fin.teams[home]; if (fin && fin.games === 0) return true;   // 홈 개막전(그 팀의 첫 홈경기)
    const d = this.dateOf(this.S.day); return d.getUTCMonth() === 4 && d.getUTCDate() === 5; };
  proto.finCapPS = function (t) { const s = this.finTier(t); return s ? s.psCap : this.finCap(t); };
  proto.finGateAvg = function (t) {   // 홈경기 1경기 평균 입장 수입(예상용): 이원화 구장은 일반·빅매치를 비중대로 섞는다
    const f = this.S.fin.teams[t], pm = this.finPriceMult(t), tier = this.finTier(t), att = tier ? (1 - BIG_SHARE) * this.finAtt(t, false) + BIG_SHARE * this.finAtt(t, true) : this.finAtt(t);
    return att * f.price * f.pm * pm;
  };
  proto.finCap = function (t, year) { const f = this.S.fin.teams[t]; let c = f.cap; for (const [y, v] of f.capchg) if ((year || this.S.year) >= y) c = v; return c; };
  proto._dem = function (f) { if (!(f.dem > 0)) f.dem = invDem(f.att0, f.cap); return f.dem; };   // 구버전 저장 파일은 처음 쓸 때 계산
  proto.finAtt = function (t, big) {   // 홈 관중 = E[min(수요, 좌석)], 수요 = 잠재 수요 × 성적 보정 × 티켓 가격 탄력성 × 이벤트 보정(big: 이원화 구장의 빅매치는 더 많은 좌석 개방)
    const S = this.S, f = S.fin.teams[t], r = S.rec[t], wp = (r[0] + r[1] + r[2]) >= 10 ? r[0] / Math.max(1, r[0] + r[1]) : 0.5, tier = big ? this.finTier(t) : null;
    const mu = this._dem(f) * clamp(1 + 0.8 * (wp - 0.5), 0.8, 1.25) * clamp(1 - ELAST * (f.pm - 1), 0.6, 1.2) * (f.attMult || 1) * (f.promo && S.day < f.promo.until ? f.promo.mult : 1);
    return Math.round(expMin(mu, tier ? Math.max(this.finCap(t), tier.bigCap) : this.finCap(t)));
  };
  proto._finGame = function (home, away) { if (!this.finReady()) return; const f = this.S.fin.teams[home]; if (!f) return; f.gate += this.finAtt(home, this.isBigMatch(home, away)) * f.price * f.pm * this.finPriceMult(home) * (this.isRival(home, away) ? 1.04 : 1); f.games++; };   // 라이벌전은 홈 관중 +4%
  proto.setTicketPolicy = function (t, pm) { if (!this.finReady() || !PRICE_PM.includes(pm)) return false; this.S.fin.teams[t].pm = pm; return true; };
  proto.finPay = function (t) { return Math.round((this.payroll(t) + this.coachPayDelta(t) + (this.scoutPay ? this.scoutPay(t) : 0) + this.deadNow(t) + this.S.teams[t].ids.reduce((a, id) => { const c = this.S.players[id].contract; return a + (c.amort && c.years > 0 ? c.amort : 0); }, 0)) * 10) / 10; };   // 선수단 보수 = 연봉 + 신규 FA 계약금 상각
  proto.finAllowed = function (t) { const f = this.S.fin.teams[t]; return f.lastRev * LOSS * (0.5 + f.trust / 100); };
  proto.finBudget = function (t) { const f = this.S.fin.teams[t]; return Math.round((f.lastRev - f.opex + this.finAllowed(t) + (f.boardExtra || 0)) * 10) / 10; };   // 이사회 승인 추가 예산 포함
  proto.faRoom = function (t) { return this.finReady() ? Math.round((this.finBudget(t) - this.finPay(t)) * 10) / 10 : 1e9; };
  proto.finPreview = function (t) {   // 시즌 예상 손익(진행분 + 남은 홈 경기를 현재 관중으로 환산), 포스트시즌 수입 제외
    const S = this.S, f = S.fin.teams[t], rem = Math.max(0, FIN_GAMES - f.games), gate = f.gate + rem * this.finGateAvg(t);
    const pay = this.finPay(t), v = this.cbtPreview(t), cbt = v.fee || 0, bc = this.finBC(), ev = f.evRev || 0, evc = f.evCost || 0, rev = gate + f.parAds + f.other + bc + ev;
    return { gate, par: f.parAds, other: f.other, bc, ev, evc, dead: this.deadNow(t), parts: f.parts, rev, pay, opex: f.opex, cbt, op: rev - pay - f.opex - evc - cbt, att: this.finAtt(t), cap: this.finCap(t), room: this.faRoom(t), budget: this.finBudget(t), trust: f.trust, allowed: this.finAllowed(t) };
  };
  proto._psSettle = function () {   // 포스트시즌 입장수입 → 배당 재원 → 팀별 배당
    const P = this.S.post; if (!P || !P.rounds || !P.rounds.length) return null;
    let gate = 0, games = 0; const alloc = {}, add = (t, x) => { if (t) alloc[t] = (alloc[t] || 0) + x; };
    P.rounds.forEach(r => { if (r) for (const g of r.games) { gate += this.finCapPS(g.home) * PS_PRICE; games++; } });
    const pool = gate * (1 - PS_COST), lose = r => r.winner === r.hi ? r.lo : r.hi;
    add(P.seeds[0], pool * PS_SHARE.reg);
    const keys = ['wcL', 'jpoL', 'poL']; P.rounds.forEach((r, i) => { if (r && r.winner) { if (i < 3) add(lose(r), pool * PS_SHARE[keys[i]]); else { add(r.winner, pool * PS_SHARE.ks); add(lose(r), pool * PS_SHARE.ksL); } } });
    return { gate, games, pool, alloc, champion: P.done ? P.champion : null, runnerUp: P.done ? P.runnerUp : null };
  };
  /* 연도별 성장(재정 성장 가정, league.js econ() 참조): 다음 시즌 객단가·MD/기타·모기업 광고·운영비를 올리고, 예산 기준 매출(lastRev)에도 확정된 성장분을 더한다
   * (안 더하면 '작년 매출 − 올해 운영비'가 되어 성장 속도만큼 예산이 줄어든다). 중계권은 2027~2031 균등 분배 144억 고정. */
  const r1e = x => Math.round(x * 10) / 10;
  proto.priceGrowth = function (t, y) {   // 명목 객단가 인상률(해당 연도 대비 전년)
    const E = this.econ(); if (t === 'Twins' || t === 'Bears') { if (y >= 2028 && y <= 2031) return E.priceJam; if (y === 2032) return (1 + E.jamJump) * this.finPriceMult(t, 2031) / this.finPriceMult(t, 2032) - 1; }   // 2032 돔 개장 +30%(임시 구장 ×1.12 해제분 보상)
    return E.price;
  };
  proto._econStep = function (t, f, v, att0Old) {
    const S = this.S, E = this.econ(), y = S.year + 1, gP = this.priceGrowth(t, y), gEff = (1 + gP) * this.finPriceMult(t, y) / this.finPriceMult(t, S.year) - 1, gMD = (t === 'Twins' || t === 'Bears') && y >= 2028 && y <= 2031 ? E.priceJam : E.price, attG = att0Old ? f.att0 / att0Old - 1 : 0;
    const oldOther = f.other, oldPar = f.parAds, k = 1 + E.cost;   // MD·기타는 일반 객단가 인상률(gMD)에 연동한다(신구장 개장 같은 일회성 가격 점프는 MD에 반영하지 않음)
    f.price *= 1 + gP; f.other = r1e(f.other * (1 + attG) * (1 + E.mdK * gMD)); f.parAds = r1e(f.parAds * (1 + E.par)); f.opex = r1e(f.opex * k);
    if (f.parts) for (const key of Object.keys(f.parts)) if (typeof f.parts[key] === 'number') f.parts[key] = r1e(f.parts[key] * k);
    f.lastRev = r1e(f.lastRev + (f.other - oldOther) + (f.parAds - oldPar) + v.gate * ((1 + attG) * (1 + gEff) - 1));
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
      f.lastRev = v.rev - (f.evRev || 0); f.trust = trust; f.evRev = 0; f.evCost = 0; f.attMult = 1; f.promo = null; f.boardExtra = 0; f.pers = null; f.snap = []; f.dead = (f.dead || []).filter(x => x.year > S.year);   // 시즌 한정 이벤트 효과 정리·지난 위약금 소멸
      f.dem = Math.min(this._dem(f) * clamp(1 + 0.35 * (wp - 0.5) + (champ ? 0.03 : 0), 0.92, 1.1), 2.2 * Math.max(f.cap, this.finCap(t, S.year + 1)));   // 잠재 수요도 성적에 따라 오르내린다(좌석으로 잘리지 않음, 좌석의 2.2배까지)
      const att0Old = f.att0; f.att0 = Math.min(Math.max(this.finCap(t, S.year + 1), f.cap), Math.round(f.att0 * clamp(1 + 0.35 * (wp - 0.5) + (champ ? 0.03 : 0), 0.92, 1.1)));   // 성적이 좋으면 다음 해 기준 관중 상승(수요는 임시 구장의 좌석 축소로 사라지지 않게 처음 수용량 이내로만 제한)
      if (this.econ().on) this._econStep(t, f, v, att0Old);   // 연도별 가격·수익·비용 성장
      f.gate = 0; f.games = 0;
    }
    S.fin.hist.push(row); if (S.fin.hist.length > 20) S.fin.hist.shift();
    const my = row.teams[S.userTeam]; news(this, `재정 결산 ${S.year}: 매출 ${my.rev}억 · 선수단 ${my.pay}억 · 영업이익 ${my.op >= 0 ? '+' : ''}${my.op}억${my.ps ? ` (포스트시즌 배당 ${my.ps}억${my.bonus ? ` + 모기업 보너스 ${my.bonus}억, 선수단 포상 ${my.prize}억` : ''})` : ''} · 이사회 신뢰도 ${my.trust}(${my.dTrust >= 0 ? '+' : ''}${my.dTrust})`);
  };

});
