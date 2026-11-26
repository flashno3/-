(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 다음 순간까지 진행·훈련 방침·기록 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, KO0, LIM_DEADLINE, news, rngFor } = LG.OFFC;
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
  /* 시즌 타임라인(화면용, 읽기 전용): 올스타 휴식기·트레이드 마감·9월 확대 엔트리·정규시즌 종료(일차) */
  proto.seasonMarks = function () {
    const S = this.S, len = (S.schedule && S.schedule.length) || 144, out = [], sep = Date.UTC(S.year, 8, 1) / 864e5;
    if (this.allStarBreakDay) out.push({ d: this.allStarBreakDay(), k: 'as', t: '올스타 휴식기' });
    out.push({ d: LIM_DEADLINE, k: 'dl', t: '트레이드 마감' });
    for (let d = 0; d < len; d++) if (this.dateOf(d).getTime() / 864e5 >= sep) { out.push({ d, k: 'sep', t: '9월 확대 엔트리(34명)' }); break; }
    out.push({ d: len - 1, k: 'end', t: '정규시즌 종료' });
    return { len, marks: out.sort((a, b) => a.d - b.d) };
  };
  /* 가을야구(5위 이내) 확정·탈락 판정 — 승률 기준의 보수적 판정(무승부는 승률에서 빠진다). 남은 경기를 모두 이겨도 5개 팀의 '최저 가능 승률'에 못 미치면 탈락 확정,
   *  다른 팀 중 내 '최저 가능 승률' 이상에 도달할 수 있는 팀이 4개 이하면 진출 확정. 동률 결정전 가능성은 확정에서 제외(≥로 비교) */
  proto.postClinch = function (t) {
    const S = this.S, st = this.standings(), len = (S.schedule && S.schedule.length) || 144, rem = x => Math.max(0, len - (x.w + x.l + x.d)), pmax = x => (x.w + rem(x)) / Math.max(1, x.w + x.l + rem(x)), pmin = x => x.w / Math.max(1, x.w + x.l + rem(x));
    const me = st.find(x => x.team === t), others = st.filter(x => x.team !== t); if (!me) return null;
    if (others.filter(x => pmin(x) > pmax(me)).length >= 5) return 'out';
    if (others.filter(x => pmax(x) >= pmin(me)).length <= 4) return 'in';
    return null;
  };
  /* 매직넘버·트래직넘버(가을야구 5위·정규시즌 1위): 언론식 공식 G + 1 − 내 승 − 상대 패(무승부 제외 근사, ⚠ 승률 동률·무승부 때문에 실제 확정 시점과 1경기 안팎 다를 수 있다).
   *  확정·탈락이 이미 정해졌으면 null(그때는 postClinch를 쓴다). 9월(남은 경기 30 이하)부터만 낸다 */
  proto.magicNumber = function (t) {
    const S = this.S, st = this.standings(), len = (S.schedule && S.schedule.length) || 144, me = st.find(x => x.team === t); if (!me || S.phase !== 'regular') return null;
    const rem = len - (me.w + me.l + me.d); if (rem > 30 || rem <= 0 || (this.postClinch && this.postClinch(t))) return null;
    const i = st.indexOf(me), out = [];
    if (i < 5) { const opp = st[5]; out.push({ k: 'post', n: Math.max(1, len + 1 - me.w - opp.l), vs: opp.team, t: '가을야구 매직넘버' }); }
    else { const fifth = st[4]; out.push({ k: 'tragic', n: Math.max(1, len + 1 - fifth.w - me.l), vs: fifth.team, t: '가을야구 트래직넘버' }); }
    if (i === 0 && st[1]) { const n = len + 1 - me.w - st[1].l; if (n > 0) out.push({ k: 'first', n, vs: st[1].team, t: '정규시즌 1위 매직넘버' }); }
    return out;
  };
  /* 순위 싸움 맞대결: 시즌 막바지(남은 30경기 이하)에 5위 선 근처(두 팀 모두 3~8위 사이, 경기 차 3 이하)의 맞대결 */
  proto.raceGame = function (a, b) {
    const S = this.S, st = this.standings(), len = (S.schedule && S.schedule.length) || 144, A = st.find(x => x.team === a), B = st.find(x => x.team === b); if (!A || !B || S.phase !== 'regular') return null;
    if (len - (A.w + A.l + A.d) > 30) return null; const gb = Math.abs((A.w - B.w) - (A.l - B.l)) / 2, ra = st.indexOf(A) + 1, rb = st.indexOf(B) + 1;
    const near = r => r >= 3 && r <= 8, across = (ra <= 5) !== (rb <= 5); if (!(near(ra) && near(rb) && gb <= 3 && (across || gb <= 1.5))) return null;   // 5위 선을 사이에 둔 3경기 차 이내, 또는 같은 쪽이라도 1.5경기 차 이내
    return { gb, ra, rb };
  };
  /* 매일: 가을야구 확정·탈락 순간과 내 팀 연승·연패(5·8·10) — 소식·스토리·팬 반응(실제 결과에서 고른 문장) */
  const FANR = {
    in: ['커뮤니티: "올해는 가을에 야구 본다!" 축하 글이 쏟아집니다.', '팬 반응: 확정 순간 응원석이 떠나갈 듯했습니다.'],
    out: ['커뮤니티: "내년엔 달라야 한다"는 글이 이어집니다.', '팬 반응: 아쉬움 속에서도 남은 경기 응원은 계속하자는 분위기입니다.'],
    w: ['커뮤니티: "분위기 탔다, 이대로만 가자"는 반응입니다.', '팬 반응: 연승에 예매 문의가 늘었다는 소식입니다.'],
    l: ['커뮤니티: "감독 뭐 하냐"는 날 선 글이 늘었습니다.', '팬 반응: 연패가 길어지자 라인업·불펜 운영에 대한 불만이 커집니다.', '커뮤니티: "그래도 버티자"는 목소리와 쓴소리가 섞여 있습니다.']
  };
  proto._clinchDay = function (d) {
    const S = this.S; if (S.phase !== 'regular' || !this.postClinch) return; const t = S.userTeam, KOt = KO0[t] || t, pick = (arr, salt) => arr[Math.floor(rngFor(S.seed, S.year, d, salt).random() * arr.length)];
    const c = this.postClinch(t), C = S.clinch = S.clinch && S.clinch.y === S.year ? S.clinch : { y: S.year, k: null, d: null, st: 0 };
    if (c && C.k !== c) { C.k = c; C.d = d; const txt = c === 'in' ? `${KOt}, 가을야구 진출 확정` : `${KOt}, 가을야구 탈락 확정`; if (c === 'in' && this._front) { const me = this.standings().find(x => x.team === t); this._front('clinch', { head: `${KOt}, 가을야구 간다!`, sub: `${me.w}승 ${me.l}패 · ${me.rank}위 · 남은 경기와 관계없이 5위 이내 확정`, pid: null, facts: [`${this.dateStr(d)} 확정`] }); } this._lnews(txt); if (this.story) this.story('race', txt, 3); if (this._press) this._press('race', { text: txt, fan: pick(FANR[c], 7501) }); }
    const games = S.results.filter(x => x.home === t || x.away === t), wl = x => { const h = x.home === t, a = h ? x.rh : x.ra, b = h ? x.ra : x.rh; return a === b ? 'D' : a > b ? 'W' : 'L'; };
    let n = 0, k = null; for (const x of games.slice().reverse()) { const r = wl(x); if (k === null) k = r; if (r !== k) break; n++; }
    const sig = k === 'D' ? 0 : (k === 'W' ? 1 : -1) * n; if ([5, 8, 10].includes(n) && k !== 'D' && C.st !== sig) { C.st = sig; const txt = `${KOt} ${n}${k === 'W' ? '연승' : '연패'}`; if (this._press) this._press('race', { text: k === 'W' ? `${txt} — 상승세` : `${txt} — 위기`, fan: pick(FANR[k === 'W' ? 'w' : 'l'], 7502) }); }
  };
});
