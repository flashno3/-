/* AI 구단의 운영 성향과 구단 간 트레이드: 세계가 살아 있도록 AI 구단끼리도 시즌 중에 선수를 맞바꾼다.
 *  - 성향(우승 도전/균형/리빌딩)은 시즌 시작(전력 순위)과 시즌 중간(60일차 실제 순위)에 정한다. 우승 도전 구단은 현재 전력을, 리빌딩 구단은 젊은 선수를 선호한다.
 *  - 트레이드는 1대1 맞교환만: 같은 유형(타자/투수·선발/구원·포수), 시장 가치 ±15% 이내, 양쪽 구단의 경쟁균형세 상한·보유 인원 유지, 외국인·부상자·영구결번 후보·팀 핵심(구단 WAR 상위 3명)은 제외.
 *  - 빈도(⚠ 가정): 시즌 최대 8건, 구단당 최대 2건, 10~104일차(마감 110일 전). 규칙·확률은 실제 KBO 트레이드 빈도 자료 없이 설정한 값이다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TEAMS, KO0, news } = LG.OFFC;
  const STYLE = { contend: '우승 도전', balance: '균형', rebuild: '리빌딩' };
  const MAX_SEASON = 8, MAX_TEAM = 2;
  proto.aiStyleName = k => STYLE[k] || STYLE.balance;
  proto.aiStyle = function (t) { const m = this.S.aiStyle; return (m && m[t] && m[t].k) || 'balance'; };
  /* 전력(1군 상위 26명 WAR 합)이나 실제 순위로 성향 갱신(내 구단 제외) */
  proto._aiStyleUpdate = function (mode) {
    const S = this.S, st = mode === 'rank' ? this.standings() : null; const strength = t => this.players(t).filter(p => !this.isInj(p)).map(p => this.war(p)).sort((a, b) => b - a).slice(0, 26).reduce((a, x) => a + x, 0);
    const ranks = TEAMS.map(t => ({ t, v: st ? -st.find(x => x.team === t).rank : strength(t) })).sort((a, b) => b.v - a.v), m = S.aiStyle = S.aiStyle || {};
    ranks.forEach((x, i) => { if (x.t === S.userTeam) return; const k = i < 3 ? 'contend' : i >= 7 ? 'rebuild' : 'balance'; m[x.t] = { k, y: S.year, how: mode === 'rank' ? '시즌 중 순위' : '시즌 전 전력', rank: i + 1 }; });
  };
  const young = p => p.age <= 25, vet = p => p.age >= 29;
  proto._aiTradeOk = function (p) {   // 트레이드 대상 선수 조건
    const S = this.S; if (p.foreign || p.retired || this.isInj(p) || p.sub || p.rehab || p.team === 'MIL') return false;
    if ((p.moveY || 0) === S.year) return false;   // 올해 이미 이적한 선수
    if (this.legendBound && this.legendBound(p, p.team)) return false;   // 영구결번 후보(구단 상징)는 보내지 않는다
    return true;
  };
  proto._aiCore = function (t) { return new Set(this.players(t).sort((a, b) => this.war(b) - this.war(a)).slice(0, 3).map(p => p.id)); };
  proto._aiSwap = function (A, B, pa, pb, why) {
    const S = this.S, ia = pa.active, ib = pb.active;
    this.removeFromTeam(A, pa.id); this.removeFromTeam(B, pb.id);
    pa.team = B; pb.team = A; S.teams[B].ids.push(pa.id); S.teams[A].ids.push(pb.id); pa.active = ia; pb.active = ib; pa.lockUntil = 0; pb.lockUntil = 0; pa.moveY = pb.moveY = S.year; delete pa.aiGs; delete pb.aiGs;
    this._engDirty = true; this._f2dirty = true; this.refreshTeam(A); this.refreshTeam(B);
    const pos = p => p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos, rec = { y: S.year, d: S.day, a: A, b: B, pa: { id: pa.id, ko: pa.ko, age: pa.age, pos: pos(pa) }, pb: { id: pb.id, ko: pb.ko, age: pb.age, pos: pos(pb) }, why };
    (S.aiTrades = S.aiTrades || []).unshift(rec); if (S.aiTrades.length > 40) S.aiTrades.length = 40;
    this._lnews(`구단 간 트레이드: ${KO0[A] || A} ${pa.ko}(${rec.pa.pos}·${pa.age}세) ↔ ${KO0[B] || B} ${pb.ko}(${rec.pb.pos}·${pb.age}세) — ${why}`);
    return rec;
  };
  proto._aiTradeTry = function (A, B, r) {   // A: 우승 도전(현재 전력 선호), B: 리빌딩(젊은 선수 선호)
    const S = this.S, coreA = this._aiCore(A), coreB = this._aiCore(B);
    const cand = (t, core, pred) => this.players(t).filter(p => this._aiTradeOk(p) && !core.has(p.id) && pred(p));
    const ya = cand(A, coreA, p => young(p) && this.marketValue(p) >= 1.0).sort((a, b) => this.marketValue(b) - this.marketValue(a)).slice(0, 8), vb = cand(B, coreB, p => vet(p) && this.marketValue(p) >= 1.0 && this.war(p) >= 0.5).sort((a, b) => this.war(b) - this.war(a)).slice(0, 10);
    const pairs = []; for (const pa of ya) for (const pb of vb) {
      if (pa.type !== pb.type) continue; if (pa.type === 'P' ? (pa.role === 'SP') !== (pb.role === 'SP') : (pa.pos === 'C') !== (pb.pos === 'C')) continue;
      const va = this.marketValue(pa), vbv = this.marketValue(pb), ratio = va / vbv; if (ratio < 0.85 || ratio > 1.15) continue;
      if (this.war(pb) < this.war(pa) + 0.3) continue;   // A는 당장의 전력이 나아져야 한다
      const kk = (S.calib && S.calib.cbtK) || 1, sa = pa.rookie === S.year ? 0 : pa.contract.salary, sb = pb.rookie === S.year ? 0 : pb.contract.salary;
      const payA = this.cbtPay(A) + kk * (sb - sa), payB = this.cbtPay(B) + kk * (sa - sb); if ((payA > this.cbtCap() && payA > this.cbtPay(A)) || (payB > this.cbtCap() && payB > this.cbtPay(B))) continue;   // 상한을 넘기는 방향의 교환은 하지 않는다
      pairs.push({ pa, pb, s: Math.abs(1 - ratio) - 0.05 * (this.war(pb) - this.war(pa)) });
    }
    if (!pairs.length) return null; pairs.sort((x, y) => x.s - y.s); const pick = pairs[Math.min(pairs.length - 1, Math.floor(r.random() * Math.min(3, pairs.length)))];
    return this._aiSwap(A, B, pick.pa, pick.pb, `${KO0[A] || A}(우승 도전)은 즉시 전력을, ${KO0[B] || B}(리빌딩)은 젊은 선수를 택했습니다`);
  };
  proto._aiTradeDay = function (d) {
    const S = this.S; if (S.phase !== 'regular') return;
    if (d === 0 || !S.aiStyle) this._aiStyleUpdate('power'); else if (d === 60) this._aiStyleUpdate('rank');
    if (d < 10 || d > 104 || d % 5 !== 0) return;
    const T = S.aiTradeSeason = S.aiTradeSeason && S.aiTradeSeason.y === S.year ? S.aiTradeSeason : { y: S.year, n: 0, by: {} };
    if (T.n >= MAX_SEASON) return; const r = rngFor(S.seed, S.year, d, 7700); if (r.random() > 0.5) return;
    const ai = TEAMS.filter(t => t !== S.userTeam), buyers = ai.filter(t => this.aiStyle(t) === 'contend' && (T.by[t] || 0) < MAX_TEAM), sellers = ai.filter(t => this.aiStyle(t) === 'rebuild' && (T.by[t] || 0) < MAX_TEAM);
    if (!buyers.length || !sellers.length) return;
    for (let k = 0; k < 6; k++) {
      const A = buyers[Math.floor(r.random() * buyers.length)], B = sellers[Math.floor(r.random() * sellers.length)];
      const rec = this._aiTradeTry(A, B, r); if (rec) { T.n++; T.by[A] = (T.by[A] || 0) + 1; T.by[B] = (T.by[B] || 0) + 1; return rec; }
    }
  };
});
