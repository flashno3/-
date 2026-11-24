(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 새 시즌·트레이드 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, ACTIVE_MAX, rngFor, TEAMS, news, LIM_DEADLINE, ROSTER_MAX, ROSTER_MIN, KO0 } = LG.OFFC;
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
    if (this._campEvClose) this._campEvClose();   // 결정하지 않은 캠프 소식은 기본(변화 없음)으로 처리
    const S = this.S; if (this._arcRollover) this._arcRollover(); if (this._legendRollover) this._legendRollover(); if (this._unrestRollover) this._unrestRollover(); S.year += 1; S.off = null; S.faMkt = null; S.teamMood = null; S.restUntil = 0; S.trainAcc = { total: 0, B: {}, P: {} }; S.trainTrack = []; for (const id in S.players) if (S.players[id].tr) delete S.players[id].tr; for (const id in S.players) if (S.players[id].mood) delete S.players[id].mood; if (S.events) for (const e of (S.events.list || [])) if (e.status === 'open' && e.type !== 'legend') { if ((e.type === 'retcer' || e.type === 'awards' || e.type === 'fanloss' || e.type === 'unrest') && this._cerResolve) this.resolveEvent(e.id, e.def, true); else { e.status = 'done'; e.result = '시즌 종료로 자동 종결'; } } S.fa = (S.fa || []);
    for (const id in S.players) if (S.players[id].retired || S.players[id].team === 'RET') delete S.players[id];   // 은퇴·이탈 선수 정리(저장 용량)
    this.finishFA === undefined; const adj = this.normalizeTalent(); S.lastAdj = adj;
    for (const t of TEAMS) if (t === S.userTeam) this.ensureActive(t);
    this.topUpWhales();
    this.returnMilitary(S.year * 12 + 2);   // 새 시즌 개막(3월) 전까지 전역한 선수 복귀
    if (S.cbt && S.cbt.excPrompt) S.cbt.excPrompt = null;   // 확인하지 않아도 추천 선수로 적용된 상태로 새 시즌 시작
    this.newSeasonSetup(false);
    for (const t of TEAMS) {   // 1군 편성은 오프시즌 달력(11월 20일) 기준으로 이뤄졌으므로, 개막일 기준 부상자(복귀가 3~4월 이후인 선수)를 1군에서 내리고 건강한 선수로 채운다
      let ch = false; for (const p of this.players(t)) if (p.active && this.isInj(p)) { p.active = false; ch = true; }
      if (ch) this.ensureActive(t);
    }
    this.repairSettings(S.userTeam);
    const cap = S.calib.cap; S.calib.cap = cap;
    this._setGoals(); S.report = S.report; if (this._clubStory) this._clubStory();
    if (this._campApply) this._campApply(); if (this._campEvApply) this._campEvApply(); if (this._investApply) this._investApply(); if (this._loyDecay) this._loyDecay(2);   // 새 시즌: 오래된 불만·기쁨이 가라앉는다
    S.prospectsDone = null; S.scWatch = []; S.scPtr = 0; if (this.ensureProspects) this.ensureProspects();   // 이번 시즌의 드래프트 후보 풀 공개
    news(this, `${S.year} 시즌 개막 준비`);
  };

  /* ---------------- 트레이드 ---------------- */
  proto.canTrade = function () { const S = this.S; if (S.phase === 'offseason') return true; if (S.phase === 'preseason') return true; if (S.phase === 'regular' || S.phase === 'regular_done') return S.day < LIM_DEADLINE; return false; };
  proto.tradeValue = function (p, aiTeam) { let v = this.marketValue(p); if (p.team === aiTeam) v *= 1.18; return v; };
  /* 묶음 가치: 선수별 가치에서 대체 수준(0.5억)을 뺀 뒤 큰 순서대로 비중(1 · 0.55 · 0.3 · 0.15 · 0.08 …)을 곱해 더한다.
     여러 명을 모아 한 명의 핵심 선수와 바꾸는 '다대일'은 로스터 자리·출전 기회 때문에 가치가 합만큼 되지 않는다(상대 구단은 남는 선수를 정리해야 함). 한 명 대 한 명은 기존과 거의 같다. */
  const LOT_R = 0.5, LOT_W = [1, 0.55, 0.3, 0.15, 0.08];
  proto.tradeLot = function (ps, aiTeam) { return ps.map(p => Math.max(0, this.tradeValue(p, aiTeam) - LOT_R)).sort((a, b) => b - a).reduce((a, x, i) => a + x * (LOT_W[i] !== undefined ? LOT_W[i] : 0.04), 0); };
  /* 양도 제한: 부상 대체 외국인(단기 계약)·재활선수명단에 올라 대체된 외국인은 양도할 수 없다. 외국인 양도 뒤에도 양쪽 구단이 외국인 한도(일반 3명·아시아쿼터 1명, 일반 3명 같은 포지션 불가)를 지켜야 한다. ⚠ 대체 외국인 양도 금지는 규약 문구 확인 전 가정 */
  proto._tradeForeignBlock = function (me, aiTeam, gp, tp) {
    const bad = [...gp, ...tp].find(p => p.sub || p.rehab); if (bad) return `${bad.ko}은(는) 부상 대체 계약 중인 외국인이라 양도할 수 없습니다.`;
    const chk = (t, add, rem) => { const cur = this.foreignOf(t).filter(p => !p.sub && !rem.has(p.id)).concat(add.filter(p => p.foreign)), gen = cur.filter(p => !p.aq), aq = cur.filter(p => p.aq); if (gen.length > 3 || aq.length > 1) return `${KO0[t] || t}의 외국인 한도(일반 3명·아시아쿼터 1명)를 넘습니다.`; if (gen.length === 3 && gen.every(p => p.type === gen[0].type)) return `${KO0[t] || t}의 일반 외국인 3명이 같은 포지션이 됩니다.`; return null; };
    return chk(me, tp, new Set(gp.map(p => p.id))) || chk(aiTeam, gp, new Set(tp.map(p => p.id)));
  };
  proto.evaluateTrade = function (aiTeam, give, get) {
    const S = this.S, me = S.userTeam; if (!this.canTrade()) return { ok: false, why: S.phase === 'post' || S.phase === 'post_done' ? '포스트시즌에는 트레이드할 수 없습니다.' : `트레이드 마감(${LIM_DEADLINE}일차) 이후에는 할 수 없습니다.` };
    if (!give.length || !get.length) return { ok: false, why: '양쪽에서 최소 1명씩 선택하세요.' };
    const gp = give.map(id => S.players[id]), tp = get.map(id => S.players[id]);
    if (gp.some(p => p.team !== me) || tp.some(p => p.team !== aiTeam)) return { ok: false, why: '선수 소속이 올바르지 않습니다.' };
    { const fb = this._tradeForeignBlock(me, aiTeam, gp, tp); if (fb) return { ok: false, why: fb }; }
    const vGet = this.tradeLot(tp, aiTeam), vGive = this.tradeLot(gp, aiTeam);   // 묶음 가치(다대일은 합보다 낮게 평가)
    const aiN = S.teams[aiTeam].ids.length - tp.length + gp.length, myN = S.teams[me].ids.length + tp.length - gp.length;
    if (aiN > ROSTER_MAX || myN > ROSTER_MAX) return { ok: false, why: `보유 선수 ${ROSTER_MAX}명 제한을 넘습니다.` };
    if (aiN < ROSTER_MIN || myN < ROSTER_MIN) return { ok: false, why: `보유 선수 최소 ${ROSTER_MIN}명이 필요합니다.` };
    { const cb = this.capBlockTrade(me, tp, gp); if (cb) return { ok: false, why: cb }; }   // 내 구단도 FA 영입과 같은 상한 규칙
    // AI 구단은 트레이드로 상한을 넘기지 않는다
    const aiPay = this.cbtPay(aiTeam) + (S.calib.cbtK || 1) * (gp.reduce((a, p) => a + (p.rookie === S.year || p.foreign ? 0 : p.contract.salary), 0) - tp.reduce((a, p) => a + (p.rookie === S.year || p.foreign ? 0 : p.contract.salary), 0));
    if (aiPay > this.cbtCap() && aiPay > this.cbtPay(aiTeam)) return { ok: false, why: `${aiTeam} 구단이 연봉 상한(${this.cbtCap()}억)을 넘게 되어 수락하지 않습니다.` };
    // AI가 핵심 선수를 내줄 때는 더 큰 대가를 요구
    const star = tp.some(p => this.ovr(p) >= 65) ? 1.25 : 1.0, need = vGet * 1.12 * star + 0.1;   // 가치는 묶음 가치 기준
    return { ok: vGive >= need, vGive: Math.round(vGive * 10) / 10, vGet: Math.round(vGet * 10) / 10, need: Math.round(need * 10) / 10, why: vGive >= need ? null : `상대 구단이 받는 가치(${Math.round(vGive * 10) / 10})가 요구 수준(${Math.round(need * 10) / 10})에 못 미칩니다.` };
  };
  proto.executeTrade = function (aiTeam, give, get) {
    const S = this.S, ev = this.evaluateTrade(aiTeam, give, get); if (!ev.ok) return ev; const me = S.userTeam;
    const gb = give.map(id => ({ id, bl: this.bonds ? this.bonds(S.players[id]) : [] }));
    const lbGive = give.map(id => ({ p: S.players[id], lb: this.legendBound ? this.legendBound(S.players[id], me) : null })).filter(x => x.lb);
    for (const id of give) { this.removeFromTeam(me, id); S.players[id].team = aiTeam; S.players[id].active = false; S.teams[aiTeam].ids.push(id); }
    for (const id of get) delete S.players[id].aiGs;
    for (const id of get) { this.removeFromTeam(aiTeam, id); S.players[id].team = me; S.players[id].active = false; S.teams[me].ids.push(id); }
    for (const id of get) S.players[id].myFrom = { y: S.year, how: `트레이드(${KO0[aiTeam]})` };
    for (const x of lbGive) this._legendLoss(x.p, me, aiTeam, '트레이드', x.lb);   // 영구결번 후보를 내보내면 팬 충성도 하락
    news(this, `트레이드: ${give.map(i => S.players[i].ko).join(', ')} ↔ ${get.map(i => S.players[i].ko).join(', ')} (${aiTeam})`);
    if (this._bondShift) for (const x of gb) this._bondShift(S.players[x.id], -1, '트레이드', x.bl);
    this.refreshTeam(aiTeam); this.repairSettings(me); this.invalidate(); return ev;
  };

});
