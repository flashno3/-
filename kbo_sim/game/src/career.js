/* 다년 커리어(49단계): ① 장기 계획(3~5년 미션) — 시즌 초 하나를 골라 기한 안에 달성하면 이사회 신뢰도·평판 상승, 실패하면 하락.
 *  ② 커리어 업적 — 감독 경력 전체에 걸친 영구 기록(첫 가을야구·언더독·내가 키운 MVP·통산 승수·두 구단 우승 등).
 *  시즌 도전 과제(world.js, 한 시즌짜리)와 달리 여러 시즌에 걸쳐 '다음 시즌을 할 이유'를 만든다. ⚠ 보상·벌점 크기는 게임 설정. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, clamp, KO0 } = LG.OFFC;
  const homeGrown = p => !!(p && p.myFrom && /^드래프트|육성/.test(p.myFrom.how || ''));
  /* ---------------- 장기 계획 ---------------- */
  const MIS = {
    title5: { label: '5년 안에 한국시리즈 우승', yrs: 5, ok: 10, ng: -6 },
    title3: { label: '3년 안에 한국시리즈 우승', yrs: 3, ok: 12, ng: -8 },
    dyn3: { label: '3년 연속 가을야구', yrs: 3, ok: 9, ng: -5 },
    post3: { label: '3년 안에 가을야구 2회', yrs: 3, ok: 7, ng: -4 },
    rise2: { label: '2년 안에 가을야구', yrs: 2, ok: 7, ng: -4 },
    grow4: { label: '4년 안에 우리가 뽑은 주전 4명(같은 시즌 타자 400타석·투수 100이닝)', yrs: 4, ok: 6, ng: -3 }
  };
  proto.missionDefs = function () { return MIS; };
  proto.mission = function () { return this.S.mission || null; };
  /* 같은 시즌, 우리 구단 드래프트·육성 출신으로 1군 주전급(타자 400타석·투수 100이닝)인 선수 수 */
  proto._homeCore = function () { const S = this.S; return this.players(S.userTeam).filter(p => homeGrown(p) && (p.type === 'B' ? ((S.stats.bat[p.id] || {}).PA || 0) >= 400 : ((S.stats.pit[p.id] || {}).outs || 0) >= 300)).length; };
  /* 진행: 지금까지 맡은 해 기록(S.history, 같은 구단)과 올해 */
  proto.missionProgress = function () {
    const S = this.S, m = S.mission; if (!m) return null; const d = MIS[m.id], H = (S.history || []).filter(h => h.year >= m.y0 && h.year < m.y0 + d.yrs && h.userTeam === m.team);
    const post = H.filter(h => h.userRank <= 5).length, title = H.some(h => h.champion === m.team); let streak = 0, best = 0; for (const h of H) { if (h.userRank <= 5) { streak++; best = Math.max(best, streak); } else streak = 0; }
    const core = Math.max(m.core || 0, S.userTeam === m.team && (S.phase === 'regular' || S.phase === 'regular_done' || S.phase === 'post' || S.phase === 'post_done') ? this._homeCore() : 0);
    const cur = { title5: [title ? 1 : 0, 1], title3: [title ? 1 : 0, 1], dyn3: [best, 3], post3: [post, 2], rise2: [post, 1], grow4: [core, 4] }[m.id];
    return { id: m.id, label: d.label, y0: m.y0, until: m.y0 + d.yrs - 1, left: m.y0 + d.yrs - 1 - S.year, cur: cur[0], goal: cur[1], done: cur[0] >= cur[1], seasons: H.length, ok: d.ok, ng: d.ng };
  };
  /* 제의: 시즌 초(진행 중인 계획이 없을 때) 구단 상황에 맞는 3개 + 정하지 않음 */
  proto._missionOffer = function () {
    const S = this.S, t = S.userTeam, last = (S.history || []).filter(h => h.userTeam === t).slice(-1)[0], rank = last ? last.userRank : (this.preseasonRank ? this.preseasonRank(t) : 6);
    const ids = rank <= 3 ? ['title3', 'dyn3', 'grow4'] : rank <= 6 ? ['title5', 'post3', 'grow4'] : ['rise2', 'post3', 'grow4'];
    const ch = ids.map(id => ({ k: id, label: MIS[id].label, hint: `${MIS[id].yrs}시즌 · 달성 시 이사회 신뢰도 +${MIS[id].ok}·평판 상승 / 실패 시 ${MIS[id].ng}` })).concat([{ k: 'none', label: '장기 계획 없이 간다', hint: '보상·벌점 없음(다음 시즌에 다시 제안)' }]);
    S.misOffered = S.year;
    return this._evAdd({ type: 'mission', ttl: 9999, def: 'none', rec: ids[1], data: { rank }, title: '장기 계획 — 구단과 다년 목표를 정합니다', text: `${last ? `지난 시즌 ${rank}위.` : '새 시즌을 앞두고'} 이사회가 몇 년에 걸친 목표를 함께 정하자고 합니다. 달성하면 신뢰가 크게 오르고, 못 지키면 그만큼 잃습니다.`, choices: ch });
  };
  proto._missionResolve = function (e, k) {
    const S = this.S; if (k === 'none' || !MIS[k]) return '장기 계획 없이 시즌을 치릅니다.';
    S.mission = { id: k, y0: S.year, team: S.userTeam, core: 0 }; this.story && this.story('mission', `장기 계획: ${MIS[k].label}`, 2); return `장기 계획: ${MIS[k].label}(${S.year}~${S.year + MIS[k].yrs - 1})`;
  };
  /* 시즌 끝 평가: 달성 → 보상, 기한 만료 → 벌점, 구단을 옮기면 계획은 무효 */
  proto._missionEval = function () {
    const S = this.S, m = S.mission; if (!m) return; const f = S.fin.teams[S.userTeam];
    if (m.team !== S.userTeam) { (S.misHist = S.misHist || []).push({ id: m.id, y0: m.y0, y: S.year, res: 'void' }); S.mission = null; return; }
    m.core = Math.max(m.core || 0, this._homeCore()); const pr = this.missionProgress();
    if (pr.done || pr.left <= 0) { const ok = pr.done, d = ok ? pr.ok : pr.ng; f.trust = clamp(Math.round((f.trust + d) * 10) / 10, 0, 100);
      (S.misHist = S.misHist || []).push({ id: m.id, y0: m.y0, y: S.year, res: ok ? 'ok' : 'fail', label: pr.label }); S.mission = null;
      const msg = ok ? `장기 계획 달성: ${pr.label} — 이사회 신뢰도 +${d}` : `장기 계획 실패: ${pr.label} — 이사회 신뢰도 ${d}`; if (this._lnews) this._lnews(msg); if (this.story) this.story('mission', msg, ok ? 3 : 2); }
  };
  /* ---------------- 커리어 업적 ---------------- */
  const ACH = [
    ['post1', '첫 가을야구', '감독으로 처음 포스트시즌 진출'], ['title1', '첫 우승', '처음으로 한국시리즈 우승'], ['title3', '우승 3회', '한국시리즈 통산 3회 우승'],
    ['dyn3', '왕조의 시작', '같은 구단에서 3년 연속 가을야구'], ['under', '언더독', '지난 시즌 8위 이하였던 구단으로 가을야구'], ['phoenix', '꼴찌에서 정상으로', '10위로 마친 구단을 맡아 우승'],
    ['mvpHome', '내가 키운 MVP', '우리 구단이 뽑은 선수가 MVP'], ['rkHome', '내가 키운 신인왕', '우리 구단이 뽑은 선수가 신인왕'],
    ['w100', '통산 100승', '감독 통산 100승'], ['w300', '통산 300승', '감독 통산 300승'], ['w500', '통산 500승', '감독 통산 500승'],
    ['s10', '10년 감독', '감독 10시즌'], ['twoClubs', '두 구단의 우승', '서로 다른 두 구단에서 우승'], ['legend', '전설을 만든 감독', '내가 맡은 구단 선수의 영구결번'], ['plan', '약속을 지킨 감독', '장기 계획 달성']
  ];
  proto.achDefs = function () { return ACH.map(([id, label, desc]) => ({ id, label, desc })); };
  proto._achvEval = function () {
    const S = this.S, have = new Set((S.achv || []).map(a => a.id)), C = this.mgrCareer ? this.mgrCareer() : { seasons: [], w: 0, n: 0 }, sz = C.seasons, got = [];
    const add = id => { if (have.has(id)) return; have.add(id); const d = ACH.find(a => a[0] === id); (S.achv = S.achv || []).push({ id, y: S.year, label: d[1] }); got.push(d[1]); };
    if (sz.some(x => x.rank <= 5)) add('post1'); const titles = sz.filter(x => x.champ); if (titles.length) add('title1'); if (titles.length >= 3) add('title3');
    if (new Set(titles.map(x => x.t).filter(Boolean)).size >= 2) add('twoClubs');
    for (let i = 2; i < sz.length; i++) if ([sz[i - 2], sz[i - 1], sz[i]].every(x => x.rank <= 5 && x.t && x.t === sz[i].t) && sz[i - 1].y === sz[i].y - 1 && sz[i - 2].y === sz[i].y - 2) add('dyn3');
    const H = S.history || []; for (const x of sz) { if (!x.t) continue; const prev = H.find(h => h.year === x.y - 1), pRank = prev ? (prev.ranks ? prev.ranks[x.t] : prev.userTeam === x.t ? prev.userRank : null) : null; if (x.rank <= 5 && pRank && pRank >= 8) add('under'); }
    for (const x of titles) { if (!x.t) continue; const tenth = H.some(h => h.year < x.y && h.userTeam === x.t && h.userRank === 10) || (S.takeRank && S.takeRank[x.t] === 10); if (tenth) add('phoenix'); }
    for (const a of S.awardsHist || []) for (const w of a.awards) { const p = S.players[w.id]; if (!p || !homeGrown(p) || !(p.myFrom.y <= a.year)) continue; if (w.label === 'MVP') add('mvpHome'); if (w.label === '신인왕') add('rkHome'); }
    if (C.w >= 100) add('w100'); if (C.w >= 300) add('w300'); if (C.w >= 500) add('w500'); if (C.n >= 10) add('s10');
    { const teams = S.mgrTeams || [S.userTeam], y0 = sz.length ? sz[0].y : S.year; if (this.legends && this.legends().list.some(x => teams.includes(x.team) && x.y > y0)) add('legend'); }
    if ((S.misHist || []).some(x => x.res === 'ok')) add('plan');
    for (const g of got) { if (this._lnews) this._lnews(`커리어 업적: ${g}`); if (this.story) this.story('achv', `커리어 업적 — ${g}`, 3); }
    return got;
  };
  proto.achvList = function () { const S = this.S, have = new Map((S.achv || []).map(a => [a.id, a])); return this.achDefs().map(d => Object.assign(d, { done: have.has(d.id), y: have.has(d.id) ? have.get(d.id).y : null })); };
  /* 평판에 반영: 업적·계획 달성 +, 계획 실패 − */
  const _rep = proto.reputation;
  proto.reputation = function () {
    const r = _rep.call(this), S = this.S, ok = (S.misHist || []).filter(x => x.res === 'ok').length, ng = (S.misHist || []).filter(x => x.res === 'fail').length, ac = (S.achv || []).length;
    const adds = [[`장기 계획 달성 ${ok}건`, Math.min(10, 5 * ok)], [`장기 계획 실패 ${ng}건`, -Math.min(9, 3 * ng)], [`커리어 업적 ${ac}개`, Math.min(6, Math.floor(ac / 2))]].filter(x => x[1]);
    if (!adds.length) return r; let v = r.score; for (const [l, x] of adds) { r.items.push([l, x]); v += x; } r.score = clamp(Math.round(v), 10, 95);
    r.tag = r.score >= 70 ? '신뢰받는 감독' : r.score >= 55 ? '믿을 만한 감독' : r.score >= 40 ? '평범한 감독' : '신뢰가 떨어진 감독'; return r;
  };
  /* 연결: 시즌 끝(도전 과제 평가 시점) · 새 시즌 시작 · 시즌 초 제의 · 구단 이동 기록 */
  const _ce = proto._challengeEval;
  proto._challengeEval = function () { const S = this.S, h = (S.history || []).slice(-1)[0]; if (h && h.year === S.year && !h.ranks) { h.ranks = {}; for (const x of this.standings()) h.ranks[x.team] = x.rank; }   // 시즌 순위 전체 기록(언더독 판정)
    const n = _ce.call(this); this._missionEval(); this._achvEval(); return n; };
  const _ns = proto.startNewSeason;
  proto.startNewSeason = function () { const r = _ns.apply(this, arguments); this._achvEval(); return r; };
  const _dd = proto._decDay;
  proto._decDay = function (d) { const r = _dd.call(this, d), S = this.S; if (S.phase === 'regular' && d <= 3 && !S.mission && S.misOffered !== S.year && !(this.eventsOpen() || []).some(e => e.type === 'mission')) this._missionOffer(); return r; };
  const _take = proto.takeOverTeam;
  proto.takeOverTeam = function (t) { const S = this.S, old = S.userTeam, st = this.standings ? this.standings() : [], x = st.find(y => y.team === t); const ok = _take.call(this, t); if (ok) { (S.mgrTeams = S.mgrTeams || [old]).includes(t) || S.mgrTeams.push(t); if (x) (S.takeRank = S.takeRank || {})[t] = x.rank; } return ok; };
});
