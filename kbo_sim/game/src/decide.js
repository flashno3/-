/* 감독 결정 분기점(43단계): 시즌 중 자주 마주치는 선택 — 결과는 한 가지로 정해지지 않고 확률로 갈리며(성격·분위기·코치·투자·나이가 확률을 바꿈),
 *  일부 결과는 후속 사건(주전 경쟁·재부상 논란·주전 도약)으로 이어진다. 효과는 기간 한정 능력치 보정(_decMod → _modRates)으로 실제 경기에 반영되고,
 *  '결정 효과' 장부에 예상 승수(⚠ 환산: 팀 전체 +0.1 ≈ 시즌 +2.5승, 같은 시드 짝 비교 측정)를 남긴다.
 *  ⚠ 게임 설정: 효과 크기·확률·재사용 간격은 '잘 쓰면 시즌 +5승 안팎, 남용하면 손해'를 목표로 정한 값이다(실제 야구의 감독 영향 추정 ±2~3승보다 크게). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, rngFor, clamp, KO0, LIM_DEADLINE } = LG.OFFC; const LIM_DL = LIM_DEADLINE || 110;
  const DEC_K = 3.5;   // 결정 보정 배율(⚠ 게임 설정: 같은 시드 짝 비교로 '추천대로 운영하면 시즌 +5승 안팎'이 되도록 맞춘 값)
  const WPS = { all: 25, bat: 15, pit: 6, bull: 3 };   // 시즌 전체(144경기) 적용 시 보정 1.0당 승수(⚠ 측정 근사)
  const pidW = p => p.type === 'B' ? 1.7 : p.role === 'SP' ? 1.2 : 0.4;
  const pct = x => Math.round(x * 100) + '%';
  const jo = (n, a, b) => { const c = String(n).charCodeAt(String(n).length - 1); return n + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b); };   // 받침에 맞는 조사(이/가, 을/를, 은/는, 과/와)
  proto._dec = function () { const S = this.S; return S.dec || (S.dec = { mods: [], log: [], cd: {}, seq: 0 }); };
  /* 기간 한정 보정: who = all|bat|pit|bull|pid, d1 = 끝나는 경기일(미포함) */
  proto._decMod = function (o) { const D = this._dec(), S = this.S; D.mods.push(Object.assign({ d0: S.day }, o)); this._engDirty = true; this.invalidate(); return o; };
  proto._decShift = function (p) {
    const S = this.S; if (!S.dec || p.team !== S.userTeam) return 0; let s = 0;
    for (const m of S.dec.mods) { if (S.day < m.d0 || S.day >= m.d1) continue; if (m.who === 'all' || (m.who === 'bat' && p.type === 'B') || (m.who === 'pit' && p.type === 'P') || (m.who === 'bull' && p.type === 'P' && p.role !== 'SP') || (m.who === 'pid' && m.pid === p.id)) s += m.v * DEC_K; }
    return s + (this._wearShift ? this._wearShift(p) : 0);   // 선수단 피로도(wear.js)
  };
  proto._decWins = function (who, v, days, p) { return Math.round(v * DEC_K * (who === 'pid' ? pidW(p) : WPS[who]) * days / 144 * 10) / 10; };
  proto._decLog = function (o) { const D = this._dec(), S = this.S; D.log.unshift(Object.assign({ y: S.year, d: S.day }, o)); if (D.log.length > 80) D.log.length = 80; return o; };
  proto.decLedger = function () {
    const S = this.S, D = this._dec(), cur = D.log.filter(x => x.y === S.year);
    const by = {}; for (const x of cur) by[x.cat] = Math.round(((by[x.cat] || 0) + (x.w || 0)) * 10) / 10;
    return { list: cur.slice(0, 30), total: Math.round(cur.reduce((a, x) => a + (x.w || 0), 0) * 10) / 10, by, active: D.mods.filter(m => S.day >= m.d0 && S.day < m.d1) };
  };
  const roll = (L, salt) => rngFor(L.S.seed, L.S.year, L.S.day, 9300 + salt).random();
  function pick(L, outs, salt) { const tot = outs.reduce((a, o) => a + o.p, 0); let x = roll(L, salt) * tot; for (const o of outs) { if ((x -= o.p) < 0) return o; } return outs[outs.length - 1]; }
  const blur = (L, p) => { const lv = L.investLv ? L.investLv('scout') : 0; const e = [0.15, 0.1, 0.06, 0.03][lv] || 0.15; return `${pct(clamp(p - e, 0, 1))}~${pct(clamp(p + e, 0, 1))}`; };   // 전력분석 투자 수준이 낮을수록 확률이 흐리게 보인다
  const myGames = (L, from, n) => { const S = L.S, out = []; for (let d = from; d < S.schedule.length && out.length < n; d++) { const g = (S.schedule[d] || []).find(x => x[0] === S.userTeam || x[1] === S.userTeam); if (g) out.push({ d, opp: g[0] === S.userTeam ? g[1] : g[0] }); } return out; };
  const seriesEnd = (L, opp) => { const g = myGames(L, L.S.day, 6); let end = L.S.day; for (const x of g) { if (x.opp !== opp) break; end = x.d + 1; } return Math.max(end, L.S.day + 1); };
  const traitK = (L, p) => L.traitOf ? L.traitOf(p) : 'model';
  /* ---- 결정 생성(매일) ---- */
  proto._decDay = function (d) {
    const S = this.S, t = S.userTeam, D = this._dec(); if (S.phase !== 'regular' && S.phase !== 'preseason') return;
    const before = D.mods.length; D.mods = D.mods.filter(m => m.d1 > d); if (D.mods.length !== before) this._engDirty = true;
    for (const m of D.mods) if (m.force && d >= m.d0 && d < m.d1) this._decForce(m);
    if (d === 0 && D.dirY !== S.year) { D.dirY = S.year; this._decDir(); this._decCamp(); return; }
    if (d === LIM_DL - 6 && D.tdY !== S.year) { D.tdY = S.year; if (this._decDeadline()) return; }
    const open = this.eventsOpen().filter(e => e.type === 'dec').length; if (open >= 2) return;
    const cd = k => (D.cd[k] || -99) > d, setCd = (k, n) => { D.cd[k] = d + n; }, r = rngFor(S.seed, S.year, d, 9200), st = this.standings(), me = st.find(x => x.team === t);
    const nx = myGames(this, d, 3), opp = nx[0] && nx[0].d === d ? nx[0].opp : null;
    // ① 총력전: 순위 경쟁 상대(3경기 차 이내) 또는 1위 팀과의 시리즈 첫 경기
    if (opp && !cd('allin') && d >= 10) { const o = st.find(x => x.team === opp), gb = Math.abs((me.w - me.l) - (o.w - o.l)) / 2, prev = (S.schedule[d - 1] || []).some(g => g.includes(t) && g.includes(opp));
      if (!prev && (gb <= 3 || o.rank === 1) && r.random() < 0.6) { setCd('allin', 9); return this._decAllin(opp, gb, o.rank); } }
    // ② 전력분석 집중: 주 1회 정도, 다음 시리즈 상대
    if (opp && !cd('scout') && r.random() < 0.1) { setCd('scout', 10); return this._decScout(opp); }
    // ③ 주전 휴식: 30세 이상 주전 타자가 연속 출전 중일 때
    if (!cd('rest') && r.random() < 0.08) { const lu = (S.teams[t].set.lineup || []).map(x => S.players[x.id]).filter(p => p && p.age >= 30 && !this.isInj(p)); const p = lu.sort((a, b) => b.age - a.age)[0]; if (p) { setCd('rest', 12); return this._decRest(p); } }
    // ④ 유망주 기회: 한 달에 한 번 정도
    if (!cd('youth') && d >= 20 && r.random() < (D.dir === 'build' ? 0.12 : 0.05)) { const c = this.players(t).filter(p => p.type === 'B' && p.age <= 24 && p.peak !== undefined && p.peak - this.ovr(p) >= 6 && !this.isInj(p) && !(S.day < (p.lockUntil || 0)) && !(S.teams[t].set.lineup || []).some(x => x.id === p.id)).sort((a, b) => b.peak - a.peak)[0]; if (c) { setCd('youth', 28); return this._decYouth(c); } }
    // ⑤ 분위기 처방: 4연패 이상 또는 5연승 이상, 또는 2주에 한 번 정도
    { const gs = S.results.filter(x => x.home === t || x.away === t).slice(-6), wl = gs.map(x => (x.home === t ? x.rh - x.ra : x.ra - x.rh)), lose = wl.slice(-4).every(v => v < 0) && wl.length >= 4, win = wl.slice(-5).every(v => v > 0) && wl.length >= 5;
      if (!cd('mood') && (lose || win || r.random() < 0.03) && !this._evOpenOf('streak')) { setCd('mood', 12); return this._decMood(lose ? 'lose' : win ? 'win' : 'flat'); } }
    // ⑥ 부상 복귀 시점: 복귀까지 4~9일 남은 주전급
    if (!cd('ret')) { const p = this.players(t).filter(q => q.inj && !q.inj.natl && !q.inj.unrest && q.inj.generated && this.isInj(q) && this.injLeft(q) >= 4 && this.injLeft(q) <= 9 && this.ovr(q) >= 45 && !(D.retAsked || []).includes(q.id + ':' + q.inj.since))[0]; if (p) { setCd('ret', 6); (D.retAsked = D.retAsked || []).push(p.id + ':' + p.inj.since); return this._decReturn(p); } }
  };
  const ev = (L, kind, title, text, choices, data, def) => L._evAdd({ type: 'dec', title, ttl: 2, def: def || choices[choices.length - 1].k, rec: data.rec, data: Object.assign({ kind }, data), text, choices });
  /* ⑪ 시즌 방향(개막일) */
  proto._decTeamRank = function () { const S = this.S, sc = t => this.players(t).map(p => this.war(p)).sort((a, b) => b - a).slice(0, 26).reduce((a, b) => a + b, 0), T = Object.keys(S.teams).sort((a, b) => sc(b) - sc(a)); return T.indexOf(S.userTeam) + 1; };
  proto._decDir = function () {
    const S = this.S, f = S.fin.teams[S.userTeam], tr = f.trust, rk = this._decTeamRank(), sup = clamp(0.45 + (tr - 50) / 100, 0.2, 0.85);
    return ev(this, 'dir', `${S.year} 시즌 방향 선언`, `개막을 앞두고 이사회와 팬에게 올 시즌 방향을 밝힙니다. 선수단 전력은 리그 ${rk}위 수준입니다(이사회 신뢰도 ${Math.round(tr)}).`,
      [{ k: 'win', label: '윈나우 — 올해 우승에 건다', hint: `순위 목표 한 단계 상향 · 이사회 지지 ${blur(this, sup)}(보강 예산) · 시즌 초 선수단 사기 상승` }, { k: 'build', label: '리빌딩 — 젊은 팀으로', hint: '순위 목표 완화 · 유망주 목표 상향 · 유망주 기회 결정 늘어남 · 팬 반발 가능성' }, { k: 'bal', label: '균형 — 무리하지 않는다' }], { sup, rec: rk <= 3 ? 'win' : rk >= 8 ? 'build' : 'bal' }, 'bal');
  };
  /* ⑫ 스프링캠프 주제(개막일, 캠프 결산 형식) */
  proto._decCamp = function () {
    return ev(this, 'camp', '스프링캠프 주제 결산', '올해 캠프에서 무엇에 집중했는지 정합니다. 효과는 시즌 초반(약 40일)에 나타납니다.',
      [{ k: 'skill', label: '기술 — 타격·투구 완성도', hint: '시즌 초 타선·마운드 강화 · 대박 또는 부상자 발생 가능' }, { k: 'tac', label: '전술 — 작전·분석 체계', hint: '올 시즌 전력분석·총력전 결과가 좋아짐 · 초반 혼선 가능' }, { k: 'fit', label: '체력 — 부상 없는 시즌', hint: '시즌 초 부상 위험 감소(안전)' }], { rec: 'skill' }, 'fit');
  };
  /* ⑩ 트레이드 마감 방향(마감 6일 전): 순위에 따라 실제 거래안을 만든다 */
  proto._decDeadline = function () {
    const S = this.S, t = S.userTeam, st = this.standings(), me = st.find(x => x.team === t), fifth = st[4], gb5 = ((fifth.w - fifth.l) - (me.w - me.l)) / 2, contend = me.rank <= 5 || gb5 <= 3;
    const mine = this.players(t), lu = new Set((S.teams[t].set.lineup || []).map(x => x.id));
    let buy = null, sell = null;
    if (contend) {   // 사들이기: 하위권 구단의 30세 전후 즉시 전력 ↔ 내 유망주
      const sellers = st.filter(x => x.rank >= 7 && x.team !== t).map(x => x.team);
      const cands = []; for (const a of sellers) for (const q of this.players(a)) if (!q.foreign && q.age >= 28 && this.war(q) >= 1.5 && !this.isInj(q)) cands.push(q);
      cands.sort((a, b) => this.war(b) - this.war(a));
      const pros = mine.filter(q => !q.foreign && q.age <= 24 && q.peak !== undefined && !lu.has(q.id) && !this.isInj(q)).sort((a, b) => this.tradeValue(a, t) - this.tradeValue(b, t));
      for (const q of cands.slice(0, 6)) { for (const g of pros) { const e = this.evaluateTrade(q.team, [g.id], [q.id]); if (e.ok) { buy = { ai: q.team, get: q.id, give: g.id }; break; } } if (buy) break; }
    }
    if (!contend || me.rank >= 6) {   // 팔기: 내 30세 이상 주전급 ↔ 상위권 구단 유망주
      const buyers = st.filter(x => x.rank <= 4 && x.team !== t).map(x => x.team), vets = mine.filter(q => !q.foreign && q.age >= 30 && this.war(q) >= 1.2 && !this.isInj(q)).sort((a, b) => this.war(b) - this.war(a));
      for (const v of vets.slice(0, 4)) { for (const a of buyers) { const pr = this.players(a).filter(q => !q.foreign && q.age <= 23 && q.peak !== undefined && !this.isInj(q)).sort((x, y) => y.peak - x.peak); for (const g of pr.slice(0, 4)) { const e = this.evaluateTrade(a, [v.id], [g.id]); if (e.ok) { sell = { ai: a, get: g.id, give: v.id }; break; } } if (sell) break; } if (sell) break; }
    }
    if (!buy && !sell) return null; const P = id => S.players[id], ch = [];
    if (buy) ch.push({ k: 'buy', label: `사들이기: ${P(buy.give).ko} → ${KO0[buy.ai]} ${P(buy.get).ko}`, hint: `즉시 전력(WAR ${this.war(P(buy.get)).toFixed(1)}) · 유망주를 내줌 · 새 팀 적응은 확률` });
    if (sell) ch.push({ k: 'sell', label: `팔기: ${P(sell.give).ko} → ${KO0[sell.ai]} 유망주 ${P(sell.get).ko}`, hint: '올해 전력 약화 · 미래 자원 확보 · 선수단 동요 가능' });
    ch.push({ k: 'hold', label: '현 전력 유지', hint: contend ? '선수단이 신뢰를 느낌' : '변화 없음' });
    return ev(this, 'deadline', `트레이드 마감 D-6 — ${contend ? '승부를 걸까?' : '미래를 준비할까?'}`, `${me.rank}위${gb5 > 0 ? `(5위와 ${gb5}경기 차)` : ''}. 마감(${LIM_DL}일차) 전에 방향을 정합니다. 거래안은 상대 구단이 받아들일 수준으로 맞췄습니다.`, ch, { buy, sell, contend, rec: buy && contend && me.rank <= 3 ? 'buy' : sell && !contend ? 'sell' : 'hold' }, 'hold');
  };
  /* ① 총력전 */
  proto._decAllin = function (opp, gb, rank) {
    const S = this.S, bp = this.players(S.userTeam).filter(p => p.type === 'P' && p.role !== 'SP' && p.active), fat = bp.length ? bp.reduce((a, p) => a + (p.fat || 0), 0) / bp.length : 0, over = clamp(0.08 + fat / 200 + (this.policy().pitch === 'push' ? 0.08 : 0) - (this._dec().tac === S.year ? 0.05 : 0) + ((this._dec().lastAllin || -99) > S.day - 15 ? 0.2 : 0), 0.04, 0.6);   // 15일 안에 다시 쓰면 덜 회복된 불펜(과부하 +20%p)
    return ev(this, 'allin', `${KO0[opp]}전 — 불펜 총력전?`, `${KO0[opp]}(${rank}위${gb <= 3 ? `, ${gb}경기 차` : ''})와의 시리즈가 시작됩니다. 필승조를 아끼지 않으면 이번 시리즈는 강해지지만 다음 며칠 불펜이 지칩니다. 현재 불펜 피로 ${Math.round(fat)}.`,
      [{ k: 'allin', label: '총력전 — 선발 짧게·필승조 총동원', hint: `이번 시리즈 마운드 강화 · 이후 4일 불펜 약화 · 과부하 가능성 ${blur(this, over)}` }, { k: 'save', label: '불펜 아끼기', hint: '이번 시리즈 약간 약화 · 이후 5일 강화' }, { k: 'normal', label: '평소대로' }], { opp, over, rec: gb <= 1 || rank === 1 ? 'allin' : 'normal' });
  };
  /* ② 전력분석 */
  proto._decScout = function (opp) {
    const S = this.S, lv = this.investLv ? this.investLv('scout') : 0, cr = this.coachRating(S.userTeam, 'eye'), good = clamp(0.25 + lv * 0.08 + (cr - 55) / 200 + (this._dec().tac === S.year ? 0.08 : 0), 0.15, 0.65), bad = clamp(0.2 - lv * 0.04, 0.05, 0.25);
    return ev(this, 'scout', `${KO0[opp]} 시리즈 전력분석`, `전력분석팀이 ${KO0[opp]} 시리즈를 집중 분석할지 묻습니다(전력분석 투자 ${lv}단계, 타격코치 눈 ${Math.round(cr)}). 결과는 분석이 끝나 봐야 압니다.`,
      [{ k: 'deep', label: '집중 분석(0.1억)', hint: `약점 발견 ${blur(this, good)} · 참고 수준 · 헛다리 ${blur(this, bad)}` }, { k: 'pit', label: '상대 투수만 분석', hint: '효과 작지만 헛다리 없음' }, { k: 'skip', label: '평소대로' }], { opp, good, bad, rec: 'deep' });
  };
  /* ③ 주전 휴식 */
  proto._decRest = function (p) {
    const ok = clamp(0.5 + (p.age - 30) * 0.03, 0.45, 0.75);
    return ev(this, 'rest', `${p.ko} 휴식을 줄까?`, `${p.ko}(${p.age}세)가 쉬지 않고 출전 중입니다. 하루 쉬게 하면 회복되지만 대신 나서는 선수가 오늘 경기를 맡습니다.`,
      [{ k: 'rest', label: '오늘 하루 휴식', hint: `회복 ${blur(this, ok)} · 백업이 기회를 잡을 수도` }, { k: 'play', label: '계속 기용', hint: '버티거나, 체력이 떨어지거나, 잔부상' }], { pid: p.id, ok, rec: p.age >= 33 ? 'rest' : 'play' });
  };
  /* ④ 유망주 기회 */
  proto._decYouth = function (p) {
    const S = this.S, tr = traitK(this, p), boom = clamp(0.2 + (tr === 'clutch' ? 0.08 : tr === 'shy' ? -0.08 : 0) + (p.peak - this.ovr(p) - 6) * 0.01, 0.1, 0.4), bust = clamp(0.2 + (tr === 'shy' ? 0.1 : 0), 0.1, 0.35);
    return ev(this, 'youth', `유망주 ${p.ko}에게 기회를?`, `${p.ko}(${p.age}세, OVR ${this.ovr(p)}${S.players[p.id].scout ? ` · 스카우트 평가 정점 ${Math.round(p.scout.ceil)}` : ''})를 10경기 선발로 기용할지 정합니다. 당장은 주전보다 약하지만 경험이 성장으로 이어질 수 있습니다.`,
      [{ k: 'start', label: '10경기 선발 기용', hint: `각성 ${blur(this, boom)} · 경험 축적 · 위축 ${blur(this, bust)}` }, { k: 'bench', label: '아직 이르다' }], { pid: p.id, boom, bust, rec: 'start' });
  };
  /* ⑤ 분위기 처방 */
  proto._decMood = function (why) {
    const chem = this.chemistry ? this.chemistry().v : 50, okp = clamp(0.35 + (chem - 50) / 100, 0.15, 0.7);
    const head = why === 'lose' ? '연패 — 분위기를 어떻게 바꿀까' : why === 'win' ? '연승 — 들뜬 분위기를 어떻게 다룰까' : '팀 분위기 점검';
    return ev(this, 'mood', head, `라커룸 분위기 ${Math.round(chem)}. ${why === 'lose' ? '선수들이 위축되어 있습니다.' : why === 'win' ? '자신감이 넘치지만 방심도 보입니다.' : '특별한 일은 없지만 한 번 손을 볼 때입니다.'}`,
      [{ k: 'meet', label: '감독 미팅', hint: `반등 ${blur(this, okp)} · 무반응 · 역효과(고참 반발로 이어질 수 있음)` }, { k: 'dinner', label: '회식(0.2억)', hint: '대체로 분위기 상승 · 가끔 구설' }, { k: 'drill', label: '특타·특훈', hint: '타격 반짝 상승 · 피로·불만 위험' }, { k: 'leave', label: '그대로 둔다' }], { why, okp, rec: why === 'lose' ? 'meet' : why === 'win' ? 'leave' : 'dinner' });
  };
  /* ⑥ 부상 복귀 시점 */
  proto._decReturn = function (p) {
    const left = this.injLeft(p), re = clamp(0.12 + left * 0.025 + (p.age >= 33 ? 0.08 : 0) - (this.investMult ? (1 - this.investMult('med')) : 0), 0.08, 0.5);
    return ev(this, 'ret', `${p.ko} 조기 복귀?`, `${p.ko}(${p.inj.dx})의 복귀까지 ${left}일 남았습니다. 본인은 뛰고 싶어 합니다.`,
      [{ k: 'now', label: '지금 복귀', hint: `당분간 경기력 저하 · 재부상 ${blur(this, re)}` }, { k: 'plan', label: '예정대로' }, { k: 'extra', label: '완전 회복(+5일)', hint: '복귀 후 한동안 몸 상태 좋음' }], { pid: p.id, re, rec: left <= 5 && re < 0.18 ? 'now' : 'plan' }, 'plan');
  };
  /* ---- 결과 처리(확률 분기 + 후속 사건) ---- */
  proto._decResolve = function (e, k) {
    const S = this.S, t = S.userTeam, x = e.data, f = S.fin.teams[t], p = x.pid ? S.players[x.pid] : null, d = S.day, D2 = () => this._dec(), mod = o => this._decMod(o), cost = v => { f.evCost = Math.round(((f.evCost || 0) + v) * 10) / 10; };
    const log = (cat, label, out, w) => { this._decLog({ cat, label, out, w }); return `${out}${w ? ` (예상 ${w > 0 ? '+' : ''}${w}승)` : ''}`; };
    if (x.pid && (!p || p.team !== t)) return '선수가 팀을 떠났습니다.';
    if (x.kind === 'dir') {
      const g = S.goals;
      if (k === 'win') { const o = pick(this, [{ k: 'yes', p: x.sup }, { k: 'doubt', p: 1 - x.sup }], 14); if (g) g.rank = Math.max(1, g.rank - 1); S.teamMood = { v: 1, until: d + 25 }; this._engDirty = true; D2().dir = 'win';
        if (o.k === 'yes') { f.boardExtra = (f.boardExtra || 0) + 5; return log('시즌 방향', '윈나우 선언', '이사회가 지지합니다 — 보강 예산 +5억, 순위 목표 상향, 선수단 사기 상승', this._decWins('all', 0.07 / DEC_K, 25)); }
        f.trust = clamp(Math.round((f.trust - 1) * 10) / 10, 0, 100); return log('시즌 방향', '윈나우 선언', '이사회가 회의적입니다(신뢰도 −1) — 목표만 높아졌습니다', this._decWins('all', 0.07 / DEC_K, 25)); }
      if (k === 'build') { const o = pick(this, [{ k: 'ok', p: 0.6 }, { k: 'boo', p: 0.4 }], 15); if (g) { g.rank = Math.min(10, g.rank + 2); g.youth = (g.youth || 3) + 2; } D2().dir = 'build'; f.attMult = (f.attMult || 1) * (o.k === 'ok' ? 0.99 : 0.97);
        return log('시즌 방향', '리빌딩 선언', o.k === 'ok' ? '팬들이 기다려 주기로 했습니다 — 순위 목표 완화, 유망주 목표 +2' : '팬 반발 — 관중 감소(−3%), 순위 목표 완화·유망주 목표 +2', 0); }
      D2().dir = 'bal'; return '균형 잡힌 운영을 선언했습니다.';
    }
    if (x.kind === 'camp') {
      if (k === 'skill') { const o = pick(this, [{ k: 'big', p: 0.25 }, { k: 'ok', p: 0.55 }, { k: 'hurt', p: 0.2 }], 16), m = o.k === 'big' ? 1.5 : 1;
        mod({ who: 'bat', v: 0.035 * m, d1: 40, src: 'camp' }); mod({ who: 'pit', v: 0.03 * m, d1: 40, src: 'camp' }); let txt = o.k === 'big' ? '캠프 대박 — 선수들이 확 달라졌습니다' : '기술 훈련이 순조롭게 끝났습니다', w = this._decWins('bat', 0.035 * m, 40) + this._decWins('pit', 0.03 * m, 40);
        if (o.k === 'hurt') { const v = this.hitters(t, true).sort((a, b) => this._runsB(b, true) - this._runsB(a, true))[Math.floor(roll(this, 17) * 5)]; if (v) { this._decInjure(v, 10 + Math.floor(roll(this, 18) * 12), '캠프 막판 훈련 중 부상'); txt = `기술 훈련 효과는 있었지만 ${jo(v.ko, '이', '가')} 부상으로 개막을 놓칩니다`; w -= 0.4; } }
        return log('캠프', '기술 캠프', txt, Math.round(w * 10) / 10); }
      if (k === 'tac') { const o = pick(this, [{ k: 'ok', p: 0.7 }, { k: 'mess', p: 0.3 }], 19); D2().tac = S.year; if (o.k === 'mess') { mod({ who: 'all', v: -0.04, d1: 15, src: 'camp' }); return log('캠프', '전술 캠프', '새 작전 체계에 초반 혼선 — 시즌 중 분석·총력전 결과는 좋아집니다', this._decWins('all', -0.04, 15)); } return log('캠프', '전술 캠프', '작전·분석 체계가 자리 잡았습니다 — 전력분석·총력전 결과가 좋아집니다', 0); }
      S.restUntil = Math.max(S.restUntil || 0, 40); return log('캠프', '체력 캠프', '체력을 끌어올렸습니다 — 시즌 초 부상 위험 감소', 0.3);
    }
    if (x.kind === 'deadline') {
      const deal = k === 'buy' ? x.buy : k === 'sell' ? x.sell : null;
      if (!deal) { if (x.contend) { S.teamMood = { v: 1, until: d + 12 }; this._engDirty = true; return log('트레이드 마감', '현 전력 유지', '지금 선수들로 끝까지 간다 — 선수단이 신뢰를 느낍니다', this._decWins('all', 0.07 / DEC_K, 12)); } return '현 전력을 유지합니다.'; }
      const r = this.executeTrade(deal.ai, [deal.give], [deal.get]); if (!r || !r.ok) return `거래가 성사되지 않았습니다: ${r && r.why ? r.why : '조건 변화'}`;
      const q = S.players[deal.get], gone = S.players[deal.give], left = Math.max(1, (S.schedule || []).length - d), dW = Math.round((this.war(q) - this.war(gone)) * left / 144 * 10) / 10;   // 장부: 들어온 선수와 나간 선수의 WAR 차이 × 남은 시즌 비율
      if (k === 'buy') { const o = pick(this, [{ k: 'hot', p: 0.4 }, { k: 'ok', p: 0.45 }, { k: 'hurt', p: 0.15 }], 20);
        if (o.k === 'hot') { mod({ who: 'pid', pid: q.id, v: 0.3, d1: d + left, src: 'deadline' }); return log('트레이드 마감', `${q.ko} 영입`, `${q.ko} 영입 — 새 팀에서 펄펄 납니다(${gone.ko} 이적)`, Math.round((this._decWins('pid', 0.3, left, q) + dW) * 10) / 10); }
        if (o.k === 'hurt') { this._decInjure(q, 15 + Math.floor(roll(this, 21) * 15), '이적 직후 부상'); return log('트레이드 마감', `${q.ko} 영입`, `${q.ko} 영입했지만 이적 직후 부상 — 아쉬운 거래`, Math.round((dW * 0.6 - 0.3) * 10) / 10); }
        return log('트레이드 마감', `${q.ko} 영입`, `${q.ko} 영입 — 제 몫을 해 줍니다(${gone.ko} 이적)`, dW); }
      const o = pick(this, [{ k: 'gem', p: 0.3 }, { k: 'ok', p: 0.5 }, { k: 'upset', p: 0.2 }], 22);
      if (o.k === 'gem' && q.peak !== undefined) q.peak = clamp(q.peak + 2, 25, 85);
      if (o.k === 'upset') { S.teamMood = { v: -1, until: d + 10 }; this._engDirty = true; }
      return log('트레이드 마감', `${gone.ko} 이적`, o.k === 'gem' ? `받아 온 ${jo(q.ko, '이', '가')} 기대 이상입니다(정점 +2)` : o.k === 'upset' ? `${gone.ko} 이적에 선수단이 동요합니다(분위기 −1)` : `${jo(q.ko, '을', '를')} 받아 미래를 준비합니다`, dW);
    }
    if (x.kind === 'allin') {
      if (k === 'allin') { this._dec().lastAllin = d; const end = seriesEnd(this, x.opp), n = end - d; const o = pick(this, [{ k: 'ok', p: 1 - x.over }, { k: 'over', p: x.over * 0.75 }, { k: 'hurt', p: x.over * 0.25 }], 1);
        mod({ who: 'pit', v: 1.0, d1: end, src: 'allin' }); mod({ who: 'bull', v: o.k === 'ok' ? -0.25 : -0.6, d0: end, d1: end + (o.k === 'ok' ? 4 : 6), src: 'allin' });
        let w = this._decWins('pit', 1.0, n, null) + this._decWins('bull', o.k === 'ok' ? -0.25 : -0.6, (o.k === 'ok' ? 4 : 6) * 1.6, null); let txt = o.k === 'ok' ? '필승조가 버텨 줍니다' : '불펜 과부하 — 회복이 더 오래 걸립니다';
        if (o.k === 'hurt') { const cl = this.players(t).filter(q => q.type === 'P' && q.role !== 'SP' && q.active && !this.isInj(q)).sort((a, b) => this._runsP(b) - this._runsP(a))[0]; if (cl) { this._decInjure(cl, 8 + Math.floor(roll(this, 2) * 10), '과부하에 따른 어깨 통증'); txt += ` · ${cl.ko} 어깨 통증으로 이탈`; w -= 0.4; } }
        return log('총력전', `${KO0[x.opp]}전 총력전`, `총력전: ${txt}`, Math.round(w * 10) / 10); }
      if (k === 'save') { const end = seriesEnd(this, x.opp); mod({ who: 'bull', v: -0.15, d1: end, src: 'allin' }); mod({ who: 'bull', v: 0.2, d0: end, d1: end + 5, src: 'allin' }); return log('총력전', `${KO0[x.opp]}전 불펜 관리`, '불펜을 아낍니다 — 다음 주 불펜이 싱싱합니다', Math.round((this._decWins('bull', -0.15, (end - d) * 1.6) + this._decWins('bull', 0.2, 8)) * 10) / 10); }
      return '평소대로 운영합니다.';
    }
    if (x.kind === 'scout') {
      const end = seriesEnd(this, x.opp), n = end - d;
      if (k === 'deep') { cost(0.1); const o = pick(this, [{ k: 'good', p: x.good }, { k: 'mid', p: 1 - x.good - x.bad }, { k: 'bad', p: x.bad }], 3); const v = { good: 0.5, mid: 0.15, bad: -0.12 }[o.k];
        mod({ who: 'all', v, d1: end, src: 'scout' }); return log('전력분석', `${KO0[x.opp]} 집중 분석`, { good: '약점 발견 — 상대 배터리 습관을 읽었습니다', mid: '참고할 만한 자료를 얻었습니다', bad: '헛다리 — 분석이 오히려 혼란을 줬습니다' }[o.k], this._decWins('all', v, n)); }
      if (k === 'pit') { mod({ who: 'bat', v: 0.12, d1: end, src: 'scout' }); return log('전력분석', `${KO0[x.opp]} 투수 분석`, '상대 투수 공략법을 정리했습니다', this._decWins('bat', 0.12, n)); }
      return '평소대로 준비합니다.';
    }
    if (x.kind === 'rest') {
      if (k === 'rest') { this._decAway(p, 1, '휴식'); const o = pick(this, [{ k: 'ok', p: x.ok }, { k: 'same', p: (1 - x.ok) * 0.6 }, { k: 'sub', p: (1 - x.ok) * 0.4 }], 4);
        if (o.k === 'ok') { mod({ who: 'pid', pid: p.id, v: 0.35, d0: d + 1, d1: d + 13, src: 'rest' }); return log('휴식', `${p.ko} 휴식`, `${p.ko} 휴식 — 몸이 가벼워졌습니다`, this._decWins('pid', 0.35, 12, p)); }
        if (o.k === 'sub') { const sub = this.hitters(t, true).filter(q => q.id !== p.id && q.pos === p.pos && !(S.teams[t].set.lineup || []).some(z => z.id === q.id))[0] || this.hitters(t, true).filter(q => !(S.teams[t].set.lineup || []).some(z => z.id === q.id))[0];
          if (sub) { mod({ who: 'pid', pid: sub.id, v: 0.3, d1: d + 15, src: 'rest' }); this._decFollow('compete', { pid: p.id, sub: sub.id }, 3); return log('휴식', `${p.ko} 휴식`, `${p.ko} 휴식 — 대신 나선 ${jo(sub.ko, '이', '가')} 맹활약! 주전 경쟁이 시작될 조짐입니다`, 0.2); } }
        return log('휴식', `${p.ko} 휴식`, `${p.ko} 휴식 — 큰 차이는 없었습니다`, -0.1); }
      const o = pick(this, [{ k: 'ok', p: 0.5 }, { k: 'tired', p: 0.35 }, { k: 'hurt', p: 0.15 + (p.age >= 34 ? 0.05 : 0) }], 5);
      if (o.k === 'tired') { mod({ who: 'pid', pid: p.id, v: -0.4, d1: d + 12, src: 'rest' }); return log('휴식', `${p.ko} 계속 기용`, `${p.ko} 체력이 떨어졌습니다`, this._decWins('pid', -0.4, 12, p)); }
      if (o.k === 'hurt') { this._decInjure(p, 6 + Math.floor(roll(this, 6) * 8), '누적 피로에 따른 근육 뭉침'); return log('휴식', `${p.ko} 계속 기용`, `${p.ko} 잔부상으로 이탈`, -0.5); }
      return log('휴식', `${p.ko} 계속 기용`, `${jo(p.ko, '이', '가')} 버텨 냅니다`, 0);
    }
    if (x.kind === 'youth') {
      if (k !== 'start') return `${jo(p.ko, '은', '는')} 2군에서 더 준비합니다.`;
      const o = pick(this, [{ k: 'boom', p: x.boom }, { k: 'exp', p: 1 - x.boom - x.bust }, { k: 'bust', p: x.bust }], 7);
      mod({ who: 'pid', pid: p.id, v: 0, d1: d + 12, force: true, src: 'youth' }); const fm = this._dec().mods[this._dec().mods.length - 1];
      if (!this._decForce(fm)) { this._dec().mods.splice(this._dec().mods.indexOf(fm), 1); return log('유망주', `${p.ko} 선발 기회 무산`, `1군 엔트리를 비우지 못해(포수 최소 인원·말소 잠금 등) ${jo(p.ko, '은', '는')} 2군에 남습니다`, 0); }
      if (o.k === 'boom') { p.peak = clamp(p.peak + 2.5, 25, 85); mod({ who: 'pid', pid: p.id, v: 0.4, d1: d + 25, src: 'youth' }); this._decFollow('breakout', { pid: p.id }, 11); return log('유망주', `${p.ko} 선발 기회`, `${p.ko} 각성! 자신감이 붙었습니다(정점 +2.5)`, this._decWins('pid', 0.4, 12, p)); }
      if (o.k === 'bust') { p.mood = { v: -1, until: d + 20 }; p.peak = clamp(p.peak + 0.3, 25, 85); return log('유망주', `${p.ko} 선발 기회`, `${jo(p.ko, '이', '가')} 1군 벽에 위축됐습니다`, -0.3); }
      p.peak = clamp(p.peak + 1, 25, 85); return log('유망주', `${p.ko} 선발 기회`, `${jo(p.ko, '이', '가')} 경험을 쌓았습니다(정점 +1)`, -0.1);
    }
    if (x.kind === 'mood') {
      const tm = (v, days) => { S.teamMood = { v, until: d + days }; this.invalidate(); this._engDirty = true; };
      if (k === 'meet') { const o = pick(this, [{ k: 'up', p: x.okp }, { k: 'none', p: (1 - x.okp) * 0.65 }, { k: 'back', p: (1 - x.okp) * 0.35 }], 8);
        if (o.k === 'up') { tm(3, 12); return log('분위기', '감독 미팅', '미팅이 통했습니다 — 팀 분위기 크게 상승', this._decWins('all', 0.21 / DEC_K, 12)); }
        if (o.k === 'back') { tm(-2, 8); const vet = this.players(t).filter(q => q.age >= 32 && !q.foreign).sort((a, b) => this.war(b) - this.war(a))[0]; if (vet) this._decFollow('vetpush', { pid: vet.id }, 4); return log('분위기', '감독 미팅', `역효과 — 선수들이 반발합니다${vet ? `(${vet.ko} 불만)` : ''}`, this._decWins('all', -0.14 / DEC_K, 8)); }
        return log('분위기', '감독 미팅', '선수들이 담담합니다 — 변화 없음', 0); }
      if (k === 'dinner') { cost(0.2); const o = pick(this, [{ k: 'up', p: 0.75 }, { k: 'scandal', p: 0.25 }], 9); if (o.k === 'up') { tm(2, 14); return log('분위기', '회식', '회식으로 분위기가 풀렸습니다', this._decWins('all', 0.14 / DEC_K, 14)); } tm(0, 1); f.trust = clamp(Math.round((f.trust - 1) * 10) / 10, 0, 100); return log('분위기', '회식', '회식 뒤 늦은 귀가가 구설에 올랐습니다(신뢰도 −1)', 0); }
      if (k === 'drill') { const o = pick(this, [{ k: 'up', p: 0.55 }, { k: 'tired', p: 0.3 }, { k: 'grumble', p: 0.15 }], 10);
        if (o.k === 'up') { mod({ who: 'bat', v: 0.25, d1: d + 7, src: 'mood' }); return log('분위기', '특타', '특타 효과 — 방망이가 살아났습니다', this._decWins('bat', 0.25, 7)); }
        if (o.k === 'tired') { mod({ who: 'all', v: -0.1, d1: d + 6, src: 'mood' }); return log('분위기', '특타', '무리한 특훈으로 몸이 무거워졌습니다', this._decWins('all', -0.1, 6)); }
        for (const q of this.players(t).filter(q => traitK(this, q) === 'free').slice(0, 3)) q.mood = { v: -1, until: d + 14 }; return log('분위기', '특타', '자유분방한 선수들이 불만을 터뜨렸습니다', -0.2); }
      return x.why === 'win' ? log('분위기', '그대로', '흐름을 그대로 탑니다', 0) : '지켜봅니다.';
    }
    if (x.kind === 'ret') {
      if (k === 'now') { const left = this.injLeft(p), o = pick(this, [{ k: 'ok', p: 1 - x.re }, { k: 're', p: x.re }], 11); p.inj.ret = new Date((this.todayN()) * 864e5).toISOString().slice(0, 10); p.inj.retN = this.todayN();
        if (o.k === 're') { this._decInjure(p, 14 + Math.floor(roll(this, 12) * 16), '조기 복귀 후 재부상'); this._decFollow('blame', { pid: p.id }, 1); return log('복귀', `${p.ko} 조기 복귀`, `${p.ko} 재부상 — 조기 복귀 결정이 도마에 올랐습니다`, -0.8); }
        mod({ who: 'pid', pid: p.id, v: -0.25, d1: d + 12, src: 'ret' }); return log('복귀', `${p.ko} 조기 복귀`, `${jo(p.ko, '이', '가')} 조기 복귀했습니다(당분간 감각 회복 중)`, Math.round((this._decWins('pid', 0.6, left, p) - this._decWins('pid', 0.25, 12, p)) * 10) / 10); }   // 대체 선수 대비 이득(⚠ 주전과 대체 선수 차이를 보정 0.6으로 근사) − 감각 회복 기간 손해
      if (k === 'extra') { p.inj.retN = this.injRet(p) + 5; p.inj.ret = new Date(p.inj.retN * 864e5).toISOString().slice(0, 10); const back = d + this.injLeft(p) + 3; mod({ who: 'pid', pid: p.id, v: 0.25, d0: back, d1: back + 20, src: 'ret' }); return log('복귀', `${p.ko} 완전 회복`, `${jo(p.ko, '은', '는')} 완전히 회복한 뒤 돌아옵니다`, Math.round((this._decWins('pid', 0.25, 20, p) - this._decWins('pid', 1, 3, p)) * 10) / 10); }
      return '예정대로 복귀시킵니다.';
    }
    if (x.kind === 'compete') {   // 후속: 주전 경쟁
      const sub = S.players[x.sub]; if (!sub || sub.team !== t) return '경쟁 구도가 사라졌습니다.';
      if (k === 'sub') { if (!this._decSwapLineup(p, sub)) return log('주전 경쟁', `${sub.ko} 주전 기용 무산`, `${jo(sub.ko, '을', '를')} 라인업에 넣지 못해(부상·1군 등록 규칙) ${jo(p.ko, '이', '가')} 주전을 지킵니다`, 0); const o = pick(this, [{ k: 'ok', p: 0.6 }, { k: 'sulk', p: 0.4 }], 12); mod({ who: 'pid', pid: sub.id, v: 0.25, d1: d + 15, src: 'compete' }); if (o.k === 'sulk') { p.mood = { v: -2, until: d + 20 }; p.loyAdj = clamp((p.loyAdj || 0) - 3, -15, 15); } return log('주전 경쟁', `${sub.ko} 주전 기용`, o.k === 'ok' ? `${sub.ko}에게 주전을 맡깁니다 — ${p.ko}도 받아들입니다` : `${sub.ko} 주전 · ${jo(p.ko, '이', '가')} 서운해합니다(충성도 −3)`, 0.3); }
      p.mood = { v: 1, until: d + 14 }; return log('주전 경쟁', `${p.ko} 주전 유지`, `${jo(p.ko, '이', '가')} 주전 신뢰에 보답하려 합니다`, 0.2);
    }
    if (x.kind === 'blame') {   // 후속: 재부상 논란 기자회견
      if (k === 'own') { f.trust = clamp(Math.round((f.trust + 1) * 10) / 10, 0, 100); return log('기자회견', '재부상 책임', '감독이 책임을 인정했습니다 — 이사회가 솔직함을 높이 샀습니다(신뢰도 +1)', 0); }
      if (k === 'med') { f.trust = clamp(Math.round((f.trust - 1) * 10) / 10, 0, 100); if (p) p.loyAdj = clamp((p.loyAdj || 0) - 2, -15, 15); return log('기자회견', '재부상 책임', '의료진 판단이었다고 해명 — 선수와 이사회가 불편해합니다(신뢰도 −1)', 0); }
      return '말을 아꼈습니다.';
    }
    if (x.kind === 'vetpush') {   // 후속: 고참 반발
      if (k === 'talk') { const o = pick(this, [{ k: 'ok', p: 0.6 }, { k: 'no', p: 0.4 }], 13); if (o.k === 'ok') { S.teamMood = { v: 1, until: d + 10 }; this._engDirty = true; return log('분위기', `${p.ko} 면담`, `${jo(p.ko, '과', '와')} 오해를 풀었습니다 — 고참이 분위기를 잡아 줍니다`, this._decWins('all', 0.07 / DEC_K, 10)); } p.loyAdj = clamp((p.loyAdj || 0) - 2, -15, 15); return log('분위기', `${p.ko} 면담`, '면담이 겉돌았습니다', 0); }
      if (k === 'bench') { p.mood = { v: -2, until: d + 20 }; S.teamMood = { v: 1, until: d + 7 }; this._engDirty = true; return log('분위기', `${p.ko} 기강`, `${jo(p.ko, '을', '를')} 벤치로 — 기강은 섰지만 본인은 크게 서운해합니다`, 0); }
      return '시간이 해결하길 기다립니다.';
    }
    if (x.kind === 'breakout') {   // 후속: 각성한 유망주 주전 도약
      if (k === 'keep') { if (!this._decForce({ pid: p.id })) return log('유망주', `${p.ko} 주전 도약 무산`, `${jo(p.ko, '을', '를')} 1군 라인업에 넣지 못했습니다(부상·1군 등록 규칙)`, 0); mod({ who: 'pid', pid: p.id, v: 0.2, d1: d + 30, force: true, src: 'youth' }); p.peak = clamp(p.peak + 1, 25, 85); return log('유망주', `${p.ko} 주전 도약`, `${jo(p.ko, '을', '를')} 주전으로 고정합니다(정점 +1)`, this._decWins('pid', 0.2, 30, p)); }
      return `${jo(p.ko, '은', '는')} 다시 백업으로 돌아갑니다.`;
    }
    return '';
  };
  /* 후속 사건 예약 → n일 뒤 결정 이벤트로 */
  proto._decFollow = function (kind, data, n) { const D = this._dec(); (D.follow = D.follow || []).push({ kind, data, at: this.S.day + n }); };
  proto._decFollowDay = function (d) {
    const S = this.S, D = this._dec(); if (!D.follow || !D.follow.length) return; const due = D.follow.filter(x => x.at <= d); D.follow = D.follow.filter(x => x.at > d);
    for (const x of due) { const p = x.data.pid ? S.players[x.data.pid] : null; if (x.data.pid && (!p || p.team !== S.userTeam)) continue;
      if (x.kind === 'compete') { const sub = S.players[x.data.sub]; if (!sub) continue; ev(this, 'compete', `주전 경쟁: ${p.ko} vs ${sub.ko}`, `휴식 동안 ${jo(sub.ko, '이', '가')} 맹활약했습니다. ${p.ko}의 자리를 어떻게 할까요?`, [{ k: 'sub', label: `${sub.ko}에게 주전을`, hint: '기세를 살림 · 기존 주전이 서운해할 수 있음' }, { k: 'keep', label: `${p.ko} 주전 유지`, hint: '신뢰 유지 · 기존 주전 컨디션 상승' }], Object.assign({ rec: 'keep' }, x.data)); }
      if (x.kind === 'blame') ev(this, 'blame', `기자회견: ${p.ko} 재부상 책임`, `${p.ko}의 재부상을 두고 "조기 복귀가 무리였다"는 질문이 쏟아집니다.`, [{ k: 'own', label: '내 판단이었다 — 책임 인정', hint: '이사회 신뢰도 소폭 상승' }, { k: 'med', label: '의료진과 상의한 결정', hint: '선수·이사회가 불편해할 수 있음' }, { k: 'none', label: '노코멘트' }], Object.assign({ rec: 'own' }, x.data));
      if (x.kind === 'vetpush') ev(this, 'vetpush', `고참 ${p.ko}의 반발`, `미팅 뒤 ${jo(p.ko, '이', '가')} "감독님 방식이 맞지 않는다"고 말했다는 이야기가 들립니다.`, [{ k: 'talk', label: '직접 면담', hint: '풀리면 고참이 분위기를 잡아 줌 · 겉돌 수도' }, { k: 'bench', label: '벤치로 기강 잡기', hint: '팀 분위기 소폭 상승 · 본인 크게 서운' }, { k: 'wait', label: '시간에 맡긴다' }], Object.assign({ rec: 'talk' }, x.data));
      if (x.kind === 'breakout') ev(this, 'breakout', `${p.ko}, 주전으로 키울까?`, `각성한 ${jo(p.ko, '이', '가')} 계속 기회를 원합니다. 한 달 더 주전으로 고정하면 성장이 이어질 수 있습니다.`, [{ k: 'keep', label: '한 달 주전 고정', hint: '성장 계속 · 주전 1명은 벤치로' }, { k: 'back', label: '백업으로' }], Object.assign({ rec: 'keep' }, x.data));
    }
  };
  /* ---- 보조: 결장·부상·라인업 고정 ---- */
  proto._decAway = function (p, days, why) { const S = this.S, retN = this.todayN() + days; if (p.inj) p.injPrev = p.inj; p.inj = { dx: why, since: `${S.year} ${why}`, ret: new Date(retN * 864e5).toISOString().slice(0, 10), retN, basis: '감독 결정', apply: true, generated: false, natl: true }; p.active = false; this.ensureActive(S.userTeam); this.repairSettings(S.userTeam); this._engDirty = true; this.invalidate(); };
  proto._decInjure = function (p, days, dx) { const S = this.S, retN = this.todayN() + days; p.inj = { dx, since: `${S.year} 발생`, ret: new Date(retN * 864e5).toISOString().slice(0, 10), retN, basis: '감독 결정의 결과', apply: true, generated: true }; p.active = false; this.ensureActive(S.userTeam); this.repairSettings(S.userTeam); this._engDirty = true; this.invalidate(); };
  proto._decForce = function (m) {   // 유망주 선발 고정: 1군 등록(벤치 타자와 교체, 포수 최소 인원 등 규칙에 걸리면 다음 후보) → 같은 포지션(없으면 지명타자) 최저 가치 타자 자리. 성공 여부를 돌려준다
    const S = this.S, t = S.userTeam, p = S.players[m.pid]; if (!p || p.team !== t || this.isInj(p)) return false; const set = S.teams[t].set; if ((set.lineup || []).some(x => x.id === p.id)) return true;
    if (!p.active) { const ws = this.players(t).filter(q => q.active && q.type === 'B' && !(set.lineup || []).some(x => x.id === q.id) && q.id !== p.id).sort((a, b) => this._runsB(a, true) - this._runsB(b, true));
      if (this.players(t).filter(q => q.active).length < this.activeMax()) this.moveActive(p.id, true);
      for (const w of ws) { if (p.active) break; this.swapActive(p.id, w.id); } }
    if (!p.active) return false; const slots = (set.lineup || []).map((x, i) => ({ i, x, q: S.players[x.id] })).filter(o => o.q && (o.x.pos === p.pos || (o.x.pos === 'DH'))).sort((a, b) => this._runsB(a.q, true) - this._runsB(b.q, true)); const s = slots[0]; if (!s) return false; set.lineup[s.i] = { id: p.id, pos: s.x.pos }; this._engDirty = true; return true;
  };
  proto._decSwapLineup = function (out, inn) { const S = this.S, set = S.teams[S.userTeam].set, i = (set.lineup || []).findIndex(x => x.id === out.id); if ((set.lineup || []).some(x => x.id === inn.id)) return true; if (i < 0 || this.isInj(inn)) return false; if (!inn.active) this.swapActive(inn.id, out.id); if (!inn.active) return false; set.lineup[i] = { id: inn.id, pos: set.lineup[i].pos }; this._engDirty = true; return true; };
  proto._decDayAll = function (d) { this._decFollowDay(d); this._decDay(d); };
});
