(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 오프시즌 계약·FA 시장가·구단 충성도 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, clamp, TEAMS, FA_END, BONUS_SHARE, rngFor, news, FOREIGN_NEW, FOREIGN_RAISE } = LG.OFFC;
  /* ---------------- 오프시즌 ---------------- */
  proto.askSalary = function (p) { return Math.max(this.minSal(), Math.round(this.price(p) * (p.age >= 34 ? 0.9 : 1.12) * 10) / 10); };
  /* ---------------- FA 시장가·제시(계약금 포함) ----------------
   * 시장가(mv) = 연 보수(계약금 + 연봉 합계 ÷ 계약 연수). FA 승인 선수 풀에서 가치 순위(WAR + 최근 연봉 평균의 10%)를 매겨 실제 FA 계약 분포로 환산한다.
   * 2025·2026 FA 계약(연 보수): 1위권 25~28억 · 상위 10% 20억 · 20% 16.5억 · 35% 13억 · 중간 10억 · 65% 7.5억 · 80% 5억 · 하위 2.5억.
   * 선수는 제시 연 보수(= (계약금 + 연봉 × 연수) ÷ 연수)가 요구액 이상일 때만 응한다. 요구액 = 시장가 × 이적 프리미엄(원소속 외 +4%) × 경쟁(관심 구단당 +1.5%, 최대 4곳)
   * × 계약 기간 보정(선호 기간보다 짧으면 연 4%↑) × 시장 경과 할인(시즌 중 하루 0.4%↓, 최대 30%). 계약금은 계약 시 한 번에 지급(현금), 경쟁균형세는 연 평균 보수로 계산. */
  const FA_CURVE = [[0, 28], [0.1, 21], [0.2, 17], [0.35, 13], [0.5, 10], [0.65, 7.5], [0.8, 5], [1, 2.5]];
  const faCurve = q => { for (let i = 1; i < FA_CURVE.length; i++) if (q <= FA_CURVE[i][0]) { const a = FA_CURVE[i - 1], b = FA_CURVE[i]; return a[1] + (b[1] - a[1]) * (q - a[0]) / (b[0] - a[0]); } return FA_CURVE[FA_CURVE.length - 1][1]; };
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
  /* 프랜차이즈 스타: 이 구단(t)의 충성도가 70 이상이고 가치(WAR 1.0 이상)가 높은 국내 선수가 이 구단에서 FA로 나왔을 때.
     구단은 이사회를 강하게 설득해 예산을 넘겨서라도 붙잡으려 한다 — 내 팀은 이사회 설득 성공 확률↑·신뢰도 하락↓, AI 구단은 여유자금이 모자라도(부족분이 비용의 45% 이내) 특별 승인으로 우선 입찰한다. */
  proto.faStar = function (p, t) {
    if (!p || p.foreign || p.team !== 'FA' || !p.faInfo || !t || p.faInfo.from !== t || this.war(p) < 1.0) return null;
    const l = this.loyalty(p, t); if (!l || l.team !== t || l.v < 70) return null; return { v: l.v, s: clamp((l.v - 70) / 30, 0, 1) };
  };
  proto._blendAsk = function (p) { const cur = p.contract.salary, ask = this.askSalary(p); return Math.max(this.minSal(), Math.round((cur + (ask > cur ? 0.6 : 0.4) * (ask - cur)) * 10) / 10); };
  proto.resignAsk = function (p) {
    const ld = 1 - 0.5 * this.loyDiscount(p, p.team), base = Math.max(this.minSal(), Math.round(this._blendAsk(p) * ld * 10) / 10); if (p.foreign || !this.faEligible(p)) return base;
    const sc = this._fvScore(p); let n = 0, rank = 0; for (const t of TEAMS) for (const q of this.players(t)) if (!q.foreign && this.faEligible(q)) { n++; if (this._fvScore(q) > sc) rank++; }
    const mv = faCurve(Math.min(1, rank / Math.max(1, 0.27 * n)));
    return Math.max(base, Math.round(0.8 * mv * ld * 10) / 10);
  };
  const faDecayAt = d => 1 - Math.min(0.3, 0.0015 * d + 0.00004 * d * d);   // 미계약 기간이 길수록 요구액 하락이 가속: 30일 -8%, 60일 -23%, 75일 -30%(한도)
  proto._marketDecay = function () { const S = this.S, m = S.faMkt; return m ? faDecayAt(m.day) : S.phase === 'offseason' ? 1 : faDecayAt(FA_END) * (1 - Math.min(0.2, 0.003 * (S.day || 0))); };   // 개막 후에는 추가로 -0.3%/일(최대 -20%)
  proto.faTerms = function (p, t, noAdj) {
    const S = this.S; t = t || S.userTeam; const info = p.faInfo, graded = !!(info && info.grade) && !p.foreign, decay = this._marketDecay() * (noAdj || !this._negAdj ? 1 : this._negAdj(p, t));   // 협상 중 호감도 보정(±7%)
    if (!graded) { const ask = Math.round(this.askSalary(p) * decay * 10) / 10; return { graded: false, pref: 1, maxYears: 1, mv: ask, ext: false, comp: 1, req: () => Math.max(this.minSal(), ask) }; }
    const mv = this.faMV(p), pref = this._prefYears(p), ext = info.from !== t;
    let n = 0; for (const x of TEAMS) if (x !== t && x !== S.userTeam && this.faRoom(x) >= mv && this.cbtPay(x, this.S.phase === 'offseason') + mv < this.cbtCap() * 0.97) n++;
    const comp = info.grade === 'C' ? 1 : 1 + 0.015 * Math.min(4, n), disc = ext ? 0 : this.loyDiscount(p, t), base = mv * decay * (ext ? (this._hometown(p, t) ? 1.0 : 1.04) : 1 - disc) * comp;
    return { graded: true, pref, maxYears: 4, mv, ext, comp, disc, req: y => Math.round(base * (1 + 0.04 * Math.max(0, pref - y)) * (1 - 0.02 * Math.max(0, y - pref)) * 100) / 100 };
  };
  /* 요구 조건에 맞춘 기본 제시(계약금 35%): 연봉은 올림해서 요구액을 넘긴다 */
  proto.faDefaultOffer = function (p, t, years) {
    const tm = this.faTerms(p, t), y = clamp(years || tm.pref, 1, tm.maxYears), total = tm.req(y) * y;
    if (!tm.graded) return { years: 1, salary: Math.ceil(tm.req(1) * 10) / 10, bonus: 0 };
    const bonus = y >= 2 ? Math.round(total * BONUS_SHARE * 10) / 10 : 0, salary = Math.ceil(((total - bonus) / y) * 10 - 1e-9) / 10;   // 계약금은 2년 이상 계약에만(단년 계약은 연봉만)
    return { years: y, salary, bonus };
  };
  proto.faEvaluate = function (p, offer, t) {
    const tm = this.faTerms(p, t), y = Math.round(offer.years), sal = +offer.salary, bon = +offer.bonus || 0;
    if (!(y >= 1 && y <= tm.maxYears)) return { ok: false, msg: tm.graded ? `계약 기간은 1~${tm.maxYears}년이어야 합니다.` : 'FA 자격이 없는 선수는 1년 계약만 가능합니다.' };
    if (!(sal >= this.minSal() - 1e-9)) return { ok: false, msg: `연봉은 최소 ${this.minSal()}억입니다.` };
    if (bon < 0 || (!tm.graded && bon > 0)) return { ok: false, msg: tm.graded ? '계약금은 0 이상이어야 합니다.' : '자격이 없는 선수에게는 계약금을 줄 수 없습니다.' };
    if (bon > 0 && y < 2) return { ok: false, msg: '계약금은 2년 이상 계약에만 줄 수 있습니다. 단년 계약은 연봉만 제시하세요.' };
    const per = (bon + sal * y) / y, req = tm.req(y);
    if (bon > 0.7 * (bon + sal * y)) return { ok: false, msg: '계약금은 총액의 70%를 넘을 수 없습니다.', per, req, tm };
    if (per + 1e-9 < req) return { ok: false, msg: `거절: 제시 총액 ${(per * y).toFixed(1)}억(연 ${per.toFixed(1)}억 × ${y}년)이 요구액 ${(req * y).toFixed(1)}억(연 ${req.toFixed(1)}억)에 못 미칩니다.${per >= req * 0.9 ? ' 근접합니다.' : ''}`, per, req, tm };
    return { ok: true, per, req, tm, y, sal, bon };
  };
  proto._aiDeal = function (t, p) {   // AI 구단의 영입 조건(선호 기간, 요구액 그대로, 계약금 35%) — 여유자금·상한 안이면 계약
    const tm = this.faTerms(p, t), o = this.faDefaultOffer(p, t, tm.pref), per = (o.bonus + o.salary * o.years) / o.years;
    if (this.cbtPay(t, this.S.phase === 'offseason') + per * (this.S.calib.cbtK || 1) > this.cbtCap() * 0.97) return null;
    const cost = o.salary + o.bonus / o.years + this.faCompCost(p, t), room = this.faRoom(t), star = this.faStar(p, t);   // 외부 FA 영입 시 보상금도 예산에 반영
    if (room < cost) { if (!star || cost - room > 0.45 * cost) return null; return Object.assign({ per, tm, special: Math.round((cost - room) * 10) / 10 }, o); }   // 프랜차이즈 스타: 이사회 특별 승인(예산 초과 허용)
    return Object.assign({ per, tm }, o);
  };
  /* 입단 경로를 사람이 읽기 쉬운 짧은 표현으로(예: 2라운드 지명 · FA 영입 · 외국인 영입 · 트레이드 영입(KIA)). 옛 저장 파일의 표기('외국인 선수 계약')도 변환 */
  proto.fromLabel = function (p) {
    const h = p.myFrom && p.myFrom.how; if (!h) return ''; const m = /^드래프트 (\d+)라운드 지명$/.exec(h); if (m) return `${m[1]}라운드 지명`;
    if (/^트레이드\(/.test(h)) return h.replace(/^트레이드\((.*)\)$/, '트레이드 영입($1)'); if (h === '외국인 선수 계약') return p.aq ? '아시아쿼터 영입' : '외국인 영입'; if (h === '부상 대체 외국인') return '대체 외국인 영입'; return h;
  };
  proto._fromText = function (p) { const l = this.fromLabel(p); return l ? ` (${l})` : ''; };   // 기록 소식에 붙는 입단 경로 표기

  proto.release = function (t, id, exercise) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== t) return;
    if (p.sub) delete p.sub; if (p.rehab) delete p.rehab;
    p.faInfo = { from: t, grade: exercise && !p.foreign ? this.faGrade(p, t) : null, prev: p.contract.salary };   // FA 자격이 있으면 등급·보상 정보를 남긴다
    S.teams[t].ids = S.teams[t].ids.filter(x => x !== id); p.active = false; p.team = 'FA'; p.contract = { salary: this.askSalary(p), years: 1 };
    S.fa = S.fa || []; S.fa.push(id); this.invalidate(); if (t === S.userTeam) this.repairSettings(t);
  };
  proto.removeFromTeam = function (t, id) { const S = this.S; if (!S.teams[t]) { if (S.fteams && S.fteams[t]) S.fteams[t].ids = S.fteams[t].ids.filter(x => x !== id); else S.mil = (S.mil || []).filter(x => x !== id); return; } S.teams[t].ids = S.teams[t].ids.filter(x => x !== id); };

  proto.startOffseason = function () {
    const S = this.S, r = rngFor(S.seed, S.year, 31), user = S.userTeam, rep = { prog: [], retired: [], expiring: [] };
    if (this._subEnd) this._subEnd();   // 시즌이 끝나면 부상 대체 계약은 종료(FA 공시)
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
      const share = this.playShare(p), pre = p.team === user ? { o0: this.ovr(p), s0: this.sub(p), a0: p.age, ps: Math.round(share * 100), trd: p.tr && p.tr.y === S.year ? p.tr.total : null } : null;   // 성장 공개 연출용 '성장 전' 기록(읽기 전용)
      const d = this.progress(p, rngFor(S.seed, S.year, 32, parseInt(id.slice(1))), p.team === user && this.investFarm && this.investFarm() > 0 ? clamp(share + this.investFarm(), 0, 1) : share);   // 육성 시설 투자: 내 선수의 출전 비중 보정(투자하지 않으면 그대로)
      if (p.team === user && this._trainRecord) this._trainRecord(p, d);   // 훈련 효과 분석용 기록(읽기 전용)
      if (p.team === user) { rep.prog.push(Object.assign({ id, d }, pre)); (p.ovrHist = p.ovrHist || []).push({ y: S.year + 1, o: this.ovr(p) }); if (p.ovrHist.length > 8) p.ovrHist.shift(); }
    }
    for (const x of rep.prog) { const p = S.players[x.id]; if (p && p.age <= 24 && x.d >= 5) this.story('train', `유망주 급성장: ${p.ko}(${p.age}세) OVR ${x.o0}→${this.ovr(p)} (+${x.d})`, 2); }
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
      const decl = elig ? clamp(0.12 + 0.07 * Math.max(0, this.war(p)) - (p.age >= 36 ? 0.05 : 0), 0.08, 0.5) : 0, keepBase = p.foreign ? clamp(0.25 + (o - 40) * 0.025 - (p.age >= 34 ? 0.25 : 0), 0.08, 0.72) : 1;   // FA 자격이 없는 선수는 시장에 나갈 수 없으므로 구단이 항상 재계약(보유권)
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
    for (const id of off.rep.expiring.slice()) {
      const p = S.players[id];
      if (p && !p.foreign && !this.faEligible(p)) {   // FA 자격(등록일수)이 없는 선수는 구단 보유권이 있어 시장에 나갈 수 없다 → 재계약하지 않았어도 시장 요구액으로 1년 자동 재계약
        const a = this._blendAsk(p); p.contract = this._newContract(p, a, 1); p.salHist = (p.salHist || []).slice(-2).concat([a]); off.rep.auto = (off.rep.auto || 0) + 1; continue;
      }
      this.release(S.userTeam, id, true);
    }
    off.rep.expiring = []; off.fa = S.fa; this._priceClass(true); this.invalidate();   // 이번 FA 풀의 시장가 확정
  };

});
