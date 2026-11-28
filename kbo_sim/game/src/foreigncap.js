/* 외국인 연봉 상한(52단계, KBO 규약 — 2022.10 이사회 의결, 2023 시행):
 *  · 일반 외국인 3명 합산 ≤ 400만$(연봉·계약금·이적료·옵션 실지급액) + 재계약 선수의 재계약 횟수 × 10만$(예: 5년째 선수 +40만$).
 *  · 신규 계약 1명 100만$ 상한. 재계약은 개인 상한 없음(합산 상한만). 아시아쿼터: 신규 20만$, 재계약 시 해마다 +10만$까지.
 *  · 모든 구단에 같은 규칙(이전에는 합산 상한을 내 구단에만 적용, 재계약 개인 한도 +50만$은 규약에 없는 값이었음).
 *  연차 = 현 구단 연속 시즌 수(시작 값은 KBO 실제 기록의 연도별 팀). ⚠ 1$=1,400원 고정, 400만$의 2026~2027 변경 여부는 확인 안 됨.
 * 시즌 중 대체 후보군: 5/1·7/1에 해외 방출·마이너 선수 후보가 외국인 시장에 나온다(일반 25·아시아쿼터 15, 오프시즌 후보보다 약간 낮은 수준),
 *  7/1에는 5월 후보 중 절반이 다른 리그와 계약해 빠진다. 미계약 후보는 오프시즌 외국인 시장까지 남고 새 시즌 시작 때 정리. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, rngFor } = LG.OFFC;
  const USD = 0.14, BASE = 400 * USD, PER = 10 * USD, NEW_GEN = 100 * USD, AQ_NEW = 20 * USD, AQ_RAISE = 10 * USD;   // 억 원(1만$ = 0.014억)
  const r1 = x => Math.round(x * 10) / 10;
  /* 계약이 적용되는 시즌: 오프시즌에는 다음 해 */
  proto.fSeason = function () { const S = this.S; return S.phase === 'offseason' ? S.year + 1 : S.year; };
  /* 선수 p 가 구단 t 에서 season 에 몇 년째인지 */
  const ensure = (L, p, y) => { if (p && p.foreign && !p.ftenT && p.team in L.S.teams) { p.ftenT = p.team; p.ften = 1; p.ftenY = y; } };   // 게임 생성 때 만든 2027 신규 외국인 등 기록이 없으면 그해 1년째
  proto.fTenure = function (p, t, season) {
    if (!p) return 1; ensure(this, p, this.S.year); t = t || p.team; season = season || this.fSeason();
    if (p.ftenT !== t || !p.ften) return 1; if (p.ftenY === season) return p.ften; if (p.ftenY === season - 1) return p.ften + 1; return 1;
  };
  const genOn = (L, t) => L.foreignOf(t).filter(x => !x.aq && !x.sub);
  /* 합산 상한(억): 400만$ + Σ(재계약 횟수 × 10만$). cand 는 영입·재계약하려는 선수(그 선수의 연차도 포함) */
  proto.foreignTotalCap = function (t, cand) {
    const season = this.fSeason(), list = genOn(this, t).filter(x => !cand || x.id !== cand.id).concat(cand && !cand.aq ? [cand] : []);
    return r1(BASE + PER * list.reduce((a, x) => a + Math.max(0, this.fTenure(x, t, season) - 1), 0));
  };
  proto.foreignCapInfo = function (t) {
    const season = this.fSeason(), list = genOn(this, t), total = this.foreignTotalCap(t), pay = this.foreignGenPay ? this.foreignGenPay(t) : 0;
    return { season, base: r1(BASE), bonus: r1(total - BASE), total, pay: r1(pay), room: r1(Math.max(0, total - pay)), list: list.map(x => ({ id: x.id, name: x.ko, ten: this.fTenure(x, t, season), sal: x.contract.salary })) };
  };
  /* 합산 상한 안의 남은 여유(재계약 후보의 연차 증액 포함) */
  proto.foreignRoom = function (t, excl, cand) { return Math.max(0, r1(this.foreignTotalCap(t, cand) - (this.foreignGenPay ? this.foreignGenPay(t, excl) : 0))); };
  /* 개인 상한: 신규 100만$ / 재계약(현 구단 연속) 개인 상한 없음 · 아시아쿼터 신규 20만$, 재계약 직전 +10만$ — 그리고 합산 여유(모든 구단) */
  proto.foreignCap = function (p, t) {
    const re = p.ftenT === t && p.ften && (p.team === t || (p.faInfo && p.faInfo.from === t));
    let cap;
    if (p.aq) cap = re ? Math.max(AQ_NEW, r1((p.faInfo && p.faInfo.prev !== undefined ? p.faInfo.prev : p.contract.salary) + AQ_RAISE)) : AQ_NEW;
    else cap = Math.min(re ? Infinity : NEW_GEN, this.foreignRoom(t, p.id, p));
    return r1(cap === Infinity ? 999 : cap);
  };
  /* 연차 기록: 영입(다른 구단) → 1년째, 같은 구단 재계약은 유지, 새 시즌에 계속 있으면 +1 */
  const _sign = proto._doSign;
  proto._doSign = function (t, p, years, ask, bonus) {
    const season = this.fSeason(), same = p && p.foreign && p.ftenT === t && (p.ftenY === season || p.ftenY === season - 1);
    const r = _sign.apply(this, arguments);
    if (p && p.foreign && !same) { p.ftenT = t; p.ften = 1; p.ftenY = season; }
    return r;
  };
  const _ns = proto.startNewSeason;
  proto.startNewSeason = function () {
    const r = _ns.apply(this, arguments), S = this.S;
    for (const id of S.fa || []) { const q = S.players[id]; if (q && q.mid && q.midY < S.year && q.team === 'FA') { q.team = 'RET'; q.retired = true; } }   // 지난 시즌 대체 후보 중 미계약자는 다른 리그로(오프시즌 시장까지는 남김)
    S.fa = (S.fa || []).filter(id => S.players[id] && S.players[id].team === 'FA');
    for (const t of Object.keys(S.teams)) for (const p of this.foreignOf(t)) {
      ensure(this, p, S.year - 1);   // 지난 시즌부터 있던 선수
      if (p.ftenT === t && p.ftenY === S.year - 1) { p.ften = (p.ften || 1) + 1; p.ftenY = S.year; }
      else if (!(p.ftenT === t && p.ftenY === S.year)) { p.ftenT = t; p.ften = 1; p.ftenY = S.year; }
    }
    return r;
  };
  const _res = proto.resign;
  proto.resign = function (id) {
    const p = this.S.players[id];
    if (p && p.foreign) { const ask = this.resignAsk(p), cap = this.foreignCap(p, p.team); if (ask > cap + 1e-9) return `${p.ko} 재계약 불가: 요구 ${ask}억이 외국인 상한 ${cap}억(${p.aq ? '아시아쿼터 재계약 +10만$' : '일반 외국인 합산 상한 여유'})을 넘습니다.`; }
    return _res.call(this, id);
  };
  /* ---------------- 시장의 외국인 요구 연봉 ----------------
   * 시장(FA·해외 후보)에 나온 외국인은 능력에 비례하되 신규 상한을 넘지 않게 요구한다(상한을 넘게 원하는 선수는 KBO 시장에 오지 않음).
   *  일반: 4.2억(30만$) + 0.42억 × (OVR − 42), 4.2~14억 · 아시아쿼터: 1.4억 + 0.1억 × (OVR − 40), 1.0~2.8억.
   *  구단 소속 선수의 재계약 요구는 기존 계산(성적 기반, 일반 외국인은 개인 상한 없음). ⚠ 기울기·범위는 게임 설정(2026 신규 외국인 다수가 70만~100만$, 아시아쿼터 다수가 15만~20만$) */
  const _ask = proto.askSalary;
  proto.askSalary = function (p) {
    if (p && p.foreign && (p.team === 'FA' || p.team === 'DRAFT')) { const o = this.ovr(p); return p.aq ? r1(Math.min(AQ_NEW, Math.max(1.0, 1.4 + 0.1 * (o - 40)))) : r1(Math.min(NEW_GEN, Math.max(4.2, 4.2 + 0.42 * (o - 42)))); }
    return _ask.call(this, p);
  };
  /* ---------------- 게임 시작 시장(2027년 1월): 해외 후보군 ----------------
   * 시즌 중 관찰하는 해외 후보군(S.fpool)은 그 시즌이 끝난 뒤 시장에 나온다. 게임 시작 시점(2027 시즌 직전 FA 기간)에는 직전 오프시즌 후보군이
   * 이미 시장에 있어야 하므로, 같은 규모(일반 투수 36·타자 30, 아시아쿼터 투수 28·타자 22)를 바로 시장에 낸다. AI 구단은 실제 2027 계약을 반영한 뒤
   * 빈자리만 채우므로(이 후보들이 나오기 전) 리그 외국인 구성은 그대로. 미계약자는 2027 오프시즌 정리 때 사라진다(fpy 2026). */
  const _initF = proto._initForeign;
  proto._initForeign = function () {
    const r0 = _initF.apply(this, arguments), S = this.S, r = rngFor(S.seed, S.year - 1, 7700), taken = new Set(Object.values(S.players).map(q => q.ko)); let n = 0;
    for (const [aq, nP, nB] of [[false, 36, 30], [true, 28, 22]]) for (const [ti, k] of [['P', nP], ['B', nB]]) for (let i = 0; i < k; i++) {
      const p = this.makeForeign(r, ti, aq, { name: this._foreignName ? this._foreignName(r, aq, taken) : undefined }); p.team = 'FA'; p.active = false; p.virtual = true; p.fpy = S.year - 1; p.startPool = true; (S.fa = S.fa || []).push(p.id); n++;
    }
    S.fStart = n; return r0;
  };
  /* ---------------- 시즌 중 대체 후보군 ---------------- */
  const MID = [[5, 1, 'may'], [7, 1, 'jul']];
  proto._foreignMidDay = function (d) {
    const S = this.S; if (S.phase !== 'regular') return; const dt = this.dateOf(d), v = (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
    const M = S.fMid && S.fMid.y === S.year ? S.fMid : (S.fMid = { y: S.year, done: {} });
    for (const [m, dd, key] of MID) {
      if (M.done[key] || v < m * 100 + dd) continue; M.done[key] = true;
      const r = rngFor(S.seed, S.year, 7800 + (key === 'may' ? 1 : 2)), taken = new Set(Object.values(S.players).map(q => q.ko)), ids = [];
      if (key === 'jul') { const old = (S.fa || []).filter(id => { const q = S.players[id]; return q && q.midY === S.year && q.mid === 'may' && q.team === 'FA'; }); for (const id of old) if (r.random() < 0.5) { const q = S.players[id]; q.team = 'RET'; q.retired = true; } S.fa = (S.fa || []).filter(id => S.players[id] && S.players[id].team === 'FA'); }
      for (const [aq, nP, nB] of [[false, 15, 10], [true, 10, 5]]) for (const [ti, n] of [['P', nP], ['B', nB]]) for (let i = 0; i < n; i++) {
        const p = this.makeForeign(r, ti, aq, { name: this._foreignName ? this._foreignName(r, aq, taken) : undefined });
        const want = this.ovr(p) - 2;   // 대체 후보는 오프시즌 후보보다 약간 낮게(분포 평균 −2)
        for (let k = 0; k < 4; k++) { const g = (want - this.ovr(p)) / 14; if (Math.abs(g) < 0.06) break; this._gain(p, g, r, 0); }
        for (let k = 0; k < 6 && this.ovr(p) > 68; k++) this._gain(p, -0.3, r, 0);   // 시즌 중 시장에 특급 선수는 드묾(최고 약 68)
        p.team = 'FA'; p.active = false; p.virtual = true; p.fpy = S.year; p.mid = key; p.midY = S.year; p.contract = { salary: aq ? 1.4 : 7, years: 1 }; p.salHist = [p.contract.salary]; (S.fa = S.fa || []).push(p.id); ids.push(p.id);
      }
      if (S.news) { S.news.unshift({ year: S.year, day: S.day, text: `${m}월 외국인 대체 후보 ${ids.length}명이 시장에 나왔습니다(마이너리그·해외 방출 선수 등).` }); if (S.news.length > 120) S.news.length = 120; }
    }
  };
  const _dd = proto._decDay;
  proto._decDay = function (d) { const r = _dd.call(this, d); this._foreignMidDay(d); return r; };
});
