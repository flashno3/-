/* 몰입 2단계: 상대 감독 성향·라커룸 분위기·기자회견 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = (seed, team) => { const L = League.create(base, team || 'Lions', seed); L.faAdvance(75); L.closeFA(); L.advance(1, false); return L; };
// 1) 상대 감독 성향: 내 구단 없음·결정적·내 경기에서 상대 기본 작전
{ const L = mk(3), S = L.S, ks = new Set(); ok(L.mgrStyle(S.userTeam) === null, '내 구단 성향 없음');
  for (const t of Object.keys(S.teams)) if (t !== S.userTeam) { const a = L.mgrStyle(t); ks.add(a.k); ok(a.n && a.tip && (a.bat || a.pit), '성향 형식'); }
  const L2 = mk(3); ok(Object.keys(S.teams).every(t => t === S.userTeam || L2.mgrStyle(t).k === L.mgrStyle(t).k), '결정적'); ok(ks.size >= 2, '성향 다양 ' + [...ks]);
  const g = L.userGameToday && L.userGameToday(); if (g) { const sch = S.schedule[S.day], idx = sch.findIndex(x => x[0] === S.userTeam || x[1] === S.userTeam), ctx = L.startUserGame(sch[idx], idx), opp = ctx.userSide === 'home' ? ctx.g[1] : ctx.g[0], os = ctx.userSide === 'home' ? 'away' : 'home', st = L.mgrStyle(opp);
    ok((st.bat ? ctx.live.tact[os].bat === st.bat : true) && (st.pit ? ctx.live.tact[os].pit === st.pit : true) && ctx.live.tact[ctx.userSide].bat === 'normal', '상대 기본 작전 적용·내 팀은 그대로'); } }
// 2) 라커룸 분위기: 구성 요소와 경기 반영 임계값
{ const L = mk(3), S = L.S, U = S.userTeam; const c0 = L.chemistry(); ok(c0.v >= 0 && c0.v <= 100 && c0.tag, '범위');
  L._chemAdd(10, 14, '테스트'); ok(L.chemistry().v === Math.min(100, c0.v + 10) || L.chemistry().v === 100, '기자회견 보정 반영 ' + c0.v + '→' + L.chemistry().v);
  const p = L.players(U).find(q => q.active && !q.foreign); S.chemAdj = []; L._chem = null; const base0 = L.chemMood(), m0 = L.moodOf(p) - base0;   // 분위기 보정을 뺀 기준 컨디션 L._chemAdd(60, 14, '테스트'); ok(L.chemistry().v >= 62 && L.chemMood() === 1 && L.moodOf(p) === Math.min(4, m0 + 1), '62 이상 → 컨디션 +1');
  S.chemAdj = []; L._chem = null; L._chemAdd(-90, 14, '테스트'); ok(L.chemistry().v <= 35 && L.chemMood() === -1, '35 이하 → −1');
  const ai = L.players(Object.keys(S.teams).find(t => t !== U))[0]; ok(L.moodOf(ai) === 0 || !(ai.mood), 'AI 구단에는 적용 안 됨');
  S.chemAdj = []; L._chem = null; const q = L.players(U).filter(x => !x.foreign)[3]; const v1 = L.chemistry().v; q.grv = 80; q.unrest = { stage: 'slack', since: S.day, y: S.year, t: U }; L._chem = null; ok(L.chemistry().v === Math.max(0, v1 - 8), '불만 선수(태업) −8'); }
// 3) 기자회견: 확정 순간에 열리고, 선택 효과가 힌트와 일치
{ const L = mk(4), S = L.S, U = S.userTeam, f = S.fin.teams[U]; S.clinch = { y: S.year, k: 'in', d: S.day, st: 0 }; L._pressConDay(S.day); let ev = L.eventsOpen().find(e => e.type === 'presscon');
  ok(ev && ev.data.topic === 'in' && ev.def === 'quiet' && ev.choices.length === 4, '기자회견 이벤트'); L._pressConDay(S.day + 1); ok(L.eventsOpen().filter(e => e.type === 'presscon').length === 1, '12일에 한 번');
  const c0 = L.chemistry().v; L.resolveEvent(ev.id, 'credit'); ok(L.chemistry().v === Math.min(100, c0 + 6), '공 돌리기 +6'); ok((S.press || [])[0] && /기자회견/.test(S.press[0].head), '언론 반응');
  S.pcon.last = -99; S.clinch = { y: S.year, k: 'out', d: S.day, st: 0 }; L._pressConDay(S.day); ev = L.eventsOpen().find(e => e.type === 'presscon'); const fl0 = f.fl === undefined ? 100 : f.fl; L.resolveEvent(ev.id, 'fans'); ok(f.fl === Math.min(100, fl0 + 2), '팬 지수 +2');
  S.pcon.last = -99; delete S.pcon.done.cout; S.pcon.done = {}; S.clinch = { y: S.year, k: 'out', d: S.day, st: 0 }; L._pressConDay(S.day); ev = L.eventsOpen().find(e => e.type === 'presscon'); const c1 = L.chemistry().v, tm0 = S.teamMood; L.resolveEvent(ev.id, 'push');
  ok((S.teamMood && S.teamMood.v === 1 && S.teamMood !== tm0) || L.chemistry().v === Math.max(0, c1 - 6), '쓴소리: 컨디션 +1 또는 분위기 −6'); }
// 4) 한 시즌: 기자회견 빈도·형식, 저장/불러오기
{ const L = mk(5), S = L.S; let pc = 0; while (S.day < S.schedule.length) { L.advance(1, false, true); for (const e of L.eventsOpen()) { if (e.type === 'presscon') { pc++; ok(!/undefined|NaN/.test(e.text + e.title), '문구'); } L.resolveEvent(e.id, e.rec || e.def, true); } }
  ok(pc <= 10, '시즌 기자회견 ' + pc); const L2 = League.fromJSON(JSON.parse(JSON.stringify(S))); ok(L2.chemistry().v === L.chemistry().v && JSON.stringify(L2.S.mgrStyle) === JSON.stringify(S.mgrStyle), '저장 후 유지'); console.log(`  시즌 기자회견 ${pc}회`); }
// 5) 감독 커리어·감독 제의
{ const L = mk(6), S = L.S, U = S.userTeam; S.history = [{ year: 2027, userTeam: U, userRank: 1, userRec: { w: 90, l: 50, d: 4 }, champion: U, runnerUp: 'Bears' }, { year: 2028, userRank: 6, userRec: { w: 70, l: 72, d: 2 }, champion: 'Twins' }];
  const c = L.mgrCareer(); ok(c.n === 2 && c.w === 160 && c.l === 122 && c.d === 6 && c.titles === 1 && c.post === 1 && c.teams.length === 1 && c.seasons[1].t === null, '커리어 합계(구단 정보 없는 옛 시즌은 기록 없음)');
  for (let i = 0; i < 40; i++) L.advance(1, false); S.post = { champion: U }; L._mgrOffers(); const offs = L.eventsOpen().filter(e => e.type === 'mgroffer'); const st = L.standings();
  ok(offs.length >= 1 && offs.length <= 2 && offs.every(e => st.find(x => x.team === e.data.t).rank >= 7 && e.data.t !== U && e.def === 'decline'), '우승 감독에게 7위 이하 구단 제의 ' + offs.length);
  const f = S.fin.teams[U], t0 = f.trust; if (offs[1]) { L.resolveEvent(offs[1].id, 'decline'); ok(Math.abs(f.trust - Math.min(100, t0 + 3)) < 1e-9, '거절: 신뢰도 +3'); }
  const to = offs[0].data.t; L.resolveEvent(offs[0].id, 'accept'); ok(S.userTeam === to && S.fin.teams[to].trust === 62 && !L.eventsOpen().some(e => e.type === 'mgroffer'), '수락: 새 구단 취임·신뢰도 62');
  ok(L.mgrStyle(to) === null && L.mgrStyle(U) && L.mgrStyle(U).k, '옮긴 뒤 감독 성향: 새 구단은 내 팀, 옛 구단은 AI'); ok(L.mgrCareer().offers.some(x => x.t === to && x.res === 'accept'), '제의 기록');
  const L3 = mk(7); L3.S.post = { champion: 'Twins' }; for (let i = 0; i < 5; i++) L3.advance(1, false); const me = L3.standings().find(x => x.team === L3.S.userTeam); if (me.rank > 3 && L3.reputation().score < 65) { L3._mgrOffers(); ok(!L3.eventsOpen().some(e => e.type === 'mgroffer'), '성과 없으면 제의 없음'); } }
console.log('drama tests ok', n);
