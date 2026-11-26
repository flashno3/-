/* 영구결번 시스템(구단 역사 2층). 1층(실제 영구결번)은 club_history.js, 여기서는 게임 안에서 새로 만들어지는 결번을 다룬다.
 * 기준(사용자 확정): 한 구단에서만 뛴 선수(이적 경력 제한)·외국인 제외·리그 전체(AI 구단 포함)·내 구단은 이사회 이벤트로 선택.
 *  - 구단 WAR = 과거 누적(p.lg: 04~ 구단별 실제 WAR, game/refdata) + 게임 내 누적(p.lw: 시즌마다 war(p)×출전비중×배율)
 *  - 확실 ≥ 50 · 회색 40~50 (⚠ 제안값, 실제 영구결번 기준은 공식 규정이 없음), 구원투수는 확실 30 · 회색 24
 *  - 구단당 연 1건(이사회 심의 한도). 더 있으면 WAR 높은 순으로 다음 해로 넘긴다.
 * 게임 내 WAR 배율은 ⚠ 가정(타자 1.0·선발 1.3·구원 2.2): war()의 규모를 실제 STATIZ 규모에 맞추기 위한 값이며 시뮬레이션으로 보정했다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TEAMS, KO0, news } = LG.OFFC;
  const K = { B: 1.35, SP: 1.75, RP: 1.5 };
  const TH = { main: { sure: 50, gray: 40 }, rp: { sure: 30, gray: 24 } };
  const MIN_YEARS = 10, MAX_HOLD = 2;
  const kind0 = p => p.type === 'B' ? 'B' : p.role === 'SP' ? 'SP' : 'RP';
  /* 선발·구원 구분은 은퇴 때의 보직이 아니라 커리어 중 더 오래 맡은 보직(말년에 구원으로 옮겨 낮은 기준을 적용받는 것을 막는다) */
  const kind = p => { if (p.type === 'B') return 'B'; const c = p.lkc || {}; const sp = c.SP || 0, rp = c.RP || 0; return sp + rp === 0 ? kind0(p) : sp >= rp ? 'SP' : 'RP'; };
  const r1 = x => Math.round(x * 10) / 10;
  proto.legends = function () { const S = this.S; return S.legends = S.legends || { list: [], q: [] }; };
  /* 시즌 종료 성장 직전에 한 번: 그 해 구단 WAR 대용치를 쌓는다 */
  proto._legendAccrue = function (p, share) {
    if (p.foreign || p.retired || !(p.team in this.S.teams)) return;
    if (p.type === 'P') { p.lkc = p.lkc || { [kind0(p)]: 8 }; if (share > 0.2) p.lkc[kind0(p)] = (p.lkc[kind0(p)] || 0) + 1; }   // 보직 기록(커리어 구분용, 데이터 시작 시점 보직을 8시즌으로 간주)
    const w = this.war(p) * clamp(share, 0, 1) * K[kind(p)]; if (w <= 0) return;
    p.lw = p.lw || {}; p.lw[p.team] = r1((p.lw[p.team] || 0) + w); p.lwy = p.lwy || {}; p.lwy[this.S.year] = r1(((p.lwy[this.S.year]) || 0) + w); const ys = Object.keys(p.lwy); if (ys.length > 25) delete p.lwy[ys[0]];   // 연도별 구단 WAR 대용치(경력 화면용)
  };
  proto.legendWar = function (p, club) { return r1(((p.lg && p.lg[club]) || 0) + ((p.lw && p.lw[club]) || 0)); };
  /* 한 구단 선수인지: 데이터상 원클럽(dh.one)·입단 구단(dh.dt)과 게임 안 소속 이력(p.seasons)이 모두 그 구단이어야 한다 */
  proto._legendOneClub = function (p, club) {
    if (p.foreign || !club || !(club in this.S.teams)) return false;
    const dh = p.dh || {}; if (dh.one === false || (dh.dt && dh.dt !== club)) return false;
    return (p.seasons || []).every(x => x.t === club || x.t === 'MIL');
  };
  proto._legendYears = function (p) { const dh = p.dh || {}, s0 = (p.seasons || [])[0], y0 = dh.y || (s0 && s0.y) || null; return y0 ? this.S.year - y0 + 1 : 0; };
  proto._legendTier = function (p, war) {
    const th = kind(p) === 'RP' ? TH.rp : TH.main; return war >= th.sure ? 'sure' : war >= th.gray ? 'gray' : null;
  };
  proto._legendEval = function (p, club) {
    if (!this._legendOneClub(p, club)) return { tier: null, why: '이적 경력·외국인' };
    const yrs = this._legendYears(p); if (yrs < MIN_YEARS) return { tier: null, why: '근속 ' + yrs + '년' };
    const war = this.legendWar(p, club); return { tier: this._legendTier(p, war), war, yrs };
  };
  /* 현역 후보(은퇴 전): 한 구단 선수 중 회색선의 80% 이상 */
  proto.legendCandidates = function (team) {
    team = team || this.S.userTeam; const out = [];
    for (const p of this.players(team)) {
      if (!this._legendOneClub(p, team)) continue; const war = this.legendWar(p, team), th = kind(p) === 'RP' ? TH.rp : TH.main;
      if (war < th.gray * 0.8) continue; out.push({ id: p.id, name: p.ko, pos: p.type === 'P' ? (kind(p) === 'SP' ? '선발' : '구원') : p.pos, age: p.age, war, tier: war >= th.sure ? 'sure' : war >= th.gray ? 'gray' : 'near', yrs: this._legendYears(p) });
    }
    return out.sort((a, b) => b.war - a.war);
  };
  proto.legendList = function (team) { return (this.legends().list || []).filter(x => !team || x.team === team); };
  proto._legendClub = function (p) { return p.legClub || (p.faInfo && p.faInfo.from) || p.tnTeam || null; };
  /* 은퇴 직후(그리고 시즌 전환 직전) 호출: 새 은퇴자를 평가해 대기열에 넣고, 구단마다 해마다 한 건만 심의한다 */
  proto._legendProcess = function () {
    const S = this.S, LGd = this.legends(), user = S.userTeam;
    for (const p of Object.values(S.players)) {
      if (!p.retired || p.legJ) continue; p.legJ = 1; const club = this._legendClub(p); if (!club) continue;
      const ev = this._legendEval(p, club); if (!ev.tier) continue;
      LGd.q.push({ pid: p.id, team: club, name: p.ko, pos: p.type === 'P' ? (kind(p) === 'SP' ? '선발' : '구원') : p.pos, age: p.age, yrs: ev.yrs, war: ev.war, tier: ev.tier, since: S.year, holds: 0 });
    }
    LGd.q.sort((a, b) => b.war - a.war);
    const done = {};
    for (const c of LGd.q.slice()) {
      if (done[c.team] || (c.holds > 0 && c.since >= S.year)) continue;
      if (c.team === user) { if (this.eventsOpen().some(e => e.type === 'legend' || (e.type === 'retcer' && e.data.pid === c.pid))) { done[c.team] = 1; continue; } this._legendEvent(c); done[c.team] = 1; continue; }
      done[c.team] = 1; this._legendAI(c);
    }
  };
  proto._legendAI = function (c) {
    const S = this.S, LGd = this.legends(), th = c.pos === '구원' ? TH.rp : TH.main, r = rngFor(S.seed, S.year, 77, parseInt(String(c.pid).slice(1)) || 1).random();
    const pr = c.tier === 'sure' ? 0.9 : clamp(0.2 + 0.5 * (c.war - th.gray) / Math.max(1, th.sure - th.gray), 0.2, 0.6);
    LGd.q = LGd.q.filter(x => x !== c);
    if (r < pr) this._legendGrant(c, 'ai'); else if (c.holds < MAX_HOLD && c.tier === 'gray') { c.holds++; c.since = S.year; LGd.q.push(c); }
  };
  proto._legendGrant = function (c, by) {
    const S = this.S, LGd = this.legends(); LGd.q = LGd.q.filter(x => x !== c);
    LGd.list.push({ team: c.team, pid: c.pid, name: c.name, pos: c.pos, y: S.year, war: c.war, tier: c.tier, by, yrs: c.yrs });
    const text = `${KO0[c.team] || c.team} 영구결번 지정: ${c.name}(${c.pos}, 구단 ${c.yrs}시즌 · 구단 WAR ${c.war.toFixed(1)})`;
    this._lnews(text); if (c.team === S.userTeam) this.story('legend', `${c.name} 영구결번 — ${c.pos}, ${c.yrs}시즌 · 구단 WAR ${c.war.toFixed(1)}`, 3);
  };
  proto._legendEvent = function (c) {
    const S = this.S, tier = c.tier === 'sure' ? '구단 역사에 남을 만한 기록입니다' : '논란의 여지가 있는 후보입니다(기준선 바로 위/아래)';
    this._evAdd({ type: 'legend', title: `영구결번 심의 — ${c.name}`, ttl: 1e9, def: 'hold', rec: c.tier === 'sure' ? 'retire' : 'hold', data: { pid: c.pid }, text: `${c.name}(${c.pos}, 구단 ${c.yrs}시즌 · 구단 WAR ${c.war.toFixed(1)})이(가) 은퇴했습니다. 한 구단에서만 뛴 선수이고, ${tier}. 영구결번을 지정할까요?${c.holds ? ` (${c.holds}회 보류됨)` : ''}`, choices: [
      { k: 'retire', label: '영구결번 지정', hint: `이사회 신뢰도 +${c.tier === 'sure' ? 2 : 1} · 구단 역사에 기록` },
      { k: 'hold', label: '보류(내년 재심)', hint: c.holds >= MAX_HOLD ? '더 보류할 수 없음 — 지정하지 않음으로 처리' : `최대 ${MAX_HOLD}회까지 · 변화 없음` },
      { k: 'decline', label: '지정하지 않음', hint: c.tier === 'sure' ? '팬들의 실망 — 이사회 신뢰도 −2' : '변화 없음' }] });
  };
  proto._legendResolve = function (e, k) {
    const S = this.S, LGd = this.legends(), c = LGd.q.find(x => x.pid === e.data.pid && x.team === S.userTeam), f = S.fin && S.fin.teams[S.userTeam];
    if (!c) return '이미 처리된 심의입니다.';
    const tr = d => { if (f) f.trust = clamp(Math.round(((f.trust === undefined ? 70 : f.trust) + d) * 10) / 10, 0, 100); };
    if (k === 'retire') { this._legendGrant(c, 'user'); if (this._front) { this._front('legend', { head: `${c.name}, 영원한 ${KO0[this.S.userTeam] || ''}의 전설`, sub: '영구결번 지정', pid: c.pid, facts: [] }); const lp = this.S.players[c.pid]; if (lp && this._card) { this._card(lp, `영구결번 ${c.name}`, 'holo', '구단의 영원한 상징'); (this.S.cardNew = this.S.cardNew || []).push(this.S.cardSeq); } } tr(c.tier === 'sure' ? 2 : 1); return `${c.name}의 등번호를 영구결번으로 지정했습니다(이사회 신뢰도 +${c.tier === 'sure' ? 2 : 1}).`; }
    if (k === 'decline') { LGd.q = LGd.q.filter(x => x !== c); if (c.tier === 'sure') tr(-2); return `${c.name}의 영구결번을 지정하지 않기로 했습니다${c.tier === 'sure' ? '(팬들의 실망, 이사회 신뢰도 −2)' : ''}.`; }
    if (c.holds >= MAX_HOLD) { LGd.q = LGd.q.filter(x => x !== c); return `${c.name}: 보류 한도를 넘어 지정하지 않음으로 처리했습니다.`; }
    c.holds++; c.since = S.year; return `${c.name}의 심의를 내년으로 보류했습니다(${c.holds}/${MAX_HOLD}).`;
  };

  /* ---- 영구결번 후보와 FA·이적: 후보 판정, 놓쳤을 때의 팬 충성도 하락(→ 관중·MD 수입 감소) ---- */
  proto.legendBound = function (p, t) {   // 한 구단 선수이면서 구단 WAR이 회색선 이상인 영구결번 후보(현역·FA 모두)
    if (!p || p.foreign || !t || !(t in this.S.teams) || !this._legendOneClub(p, t)) return null;
    const war = this.legendWar(p, t), th = kind(p) === 'RP' ? TH.rp : TH.main; return war >= th.gray ? { tier: war >= th.sure ? 'sure' : 'gray', war } : null;
  };
  const trustD = (L, d) => { const f = L.S.fin && L.S.fin.teams[L.S.userTeam]; if (f) f.trust = clamp(Math.round(((f.trust === undefined ? 70 : f.trust) + d) * 10) / 10, 0, 100); };
  proto._legendLoss = function (p, club, to, how, lb) {
    const S = this.S, user = S.userTeam, f = S.fin && S.fin.teams[club]; if (!f || !lb) return;
    const hit = lb.tier === 'sure' ? 16 + clamp((lb.war - 50) * 0.15, 0, 6) : 9, before = f.fl === undefined ? 100 : f.fl;
    f.fl = Math.max(55, Math.round((before - hit) * 10) / 10); (f.flLog = f.flLog || []).push({ y: S.year, name: p.ko, hit: Math.round((before - f.fl) * 10) / 10 }); if (f.flLog.length > 10) f.flLog.shift();
    const dest = how === 'FA 이적' || how === '트레이드' ? `${KO0[to] || to}으로 떠났습니다` : '팀을 떠났습니다', tierTxt = lb.tier === 'sure' ? '영구결번이 확실시되던' : '영구결번 후보였던';
    if (club === user || lb.tier === 'sure') this._lnews(`${KO0[club] || club} 팬들 충격: ${tierTxt} ${p.ko}(구단 WAR ${lb.war.toFixed(1)})이(가) ${dest}.`);
    if (club !== user) return;
    trustD(this, lb.tier === 'sure' ? -3 : -1.5);
    for (const q of this.players(user)) if (q.id !== p.id) q.loyAdj = clamp((q.loyAdj || 0) - (lb.tier === 'sure' ? 2 : 1), -15, 15);   // 선수단도 구단이 레전드를 지키지 못했다고 본다
    this.story('legend', `${p.ko} ${how} — ${tierTxt} 선수를 놓쳤습니다(팬 충성도 ${before.toFixed(0)} → ${f.fl.toFixed(0)})`, 3);
    if (this.eventsOpen().some(e => e.type === 'fanloss')) return;
    const im = this.fanImpact(user);
    this._evAdd({ type: 'fanloss', title: `📉 팬 반응 — ${p.ko}`, ttl: 1e9, def: 'ignore', rec: lb.tier === 'sure' ? 'apology' : 'event', data: { name: p.ko },
      text: `${tierTxt} ${p.ko}(구단 WAR ${lb.war.toFixed(1)})을(를) ${how === '방출' ? '방출했습니다' : '놓쳤습니다'}. 팬 충성도 지수가 ${before.toFixed(0)}에서 ${f.fl.toFixed(0)}로 떨어졌고(평년 100) 평균 관중 약 ${Math.round(im.attPct * 100)}% 감소, 예상 입장·MD 수입이 연 ${im.total.toFixed(1)}억 줄어듭니다. 이사회 신뢰도(${lb.tier === 'sure' ? '−3' : '−1.5'})와 선수단 충성도(${lb.tier === 'sure' ? '−2' : '−1'})도 내려갔습니다. 지수는 해마다 격차의 25%씩 회복됩니다. 어떻게 대응할까요?`, choices: [
        { k: 'apology', label: '팬 소통 행사(1.0억)', hint: '팬 충성도 지수 +5 · 비용 1.0억' },
        { k: 'event', label: '팬 감사 이벤트(0.4억)', hint: '팬 충성도 지수 +2.5 · 비용 0.4억' },
        { k: 'ignore', label: '대응하지 않음', hint: '자연 회복만(해마다 격차의 25%)' }] });
  };
  proto._fanLossResolve = function (e, k) {
    const S = this.S, f = S.fin && S.fin.teams[S.userTeam]; if (!f) return '';
    const up = k === 'apology' ? 5 : k === 'event' ? 2.5 : 0, c = k === 'apology' ? 1.0 : k === 'event' ? 0.4 : 0;
    if (up && f.fl !== undefined) f.fl = Math.min(100, Math.round((f.fl + up) * 10) / 10); if (c) f.evCost = Math.round(((f.evCost || 0) + c) * 10) / 10;
    return k === 'ignore' ? `${e.data.name} 건에 대응하지 않았습니다(팬 충성도 지수 ${this.fanLoy(S.userTeam).toFixed(0)}, 자연 회복).` : `${k === 'apology' ? '팬 소통 행사' : '팬 감사 이벤트'}를 열었습니다(팬 충성도 지수 +${up}, ${c.toFixed(1)}억 → ${this.fanLoy(S.userTeam).toFixed(0)}).`;
  };
  /* 시즌 전환: 보류된 내 구단 후보는 다음 해 오프시즌에 다시 이벤트로 올린다(이벤트는 한 건씩) */
  proto._legendRollover = function () { if (this._legendProcess) this._legendProcess(); };
});
