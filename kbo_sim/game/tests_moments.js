/* 기념의 순간: 신문 1면·선수 카드가 실제 기록과 일치하는지(끝내기는 그날 내 홈 승리, 카드는 그 시즌 기록·수상 기준 충족) */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
let walk = 0, cards = 0;
for (const [team, seed] of [['Tigers', 3], ['Twins', 9]]) {
  const L = League.create(base, team, seed); L.faAdvance(75); L.closeFA(); const S = L.S, U = S.userTeam;
  while (S.day < S.schedule.length) { L.advance(1, false, true); for (const e of L.eventsOpen()) L.resolveEvent(e.id, e.rec || e.def, true); }
  for (const f of (S.front || []).filter(x => x.kind === 'walkoff')) { walk++; const g = S.results.filter(r => r.day === f.d && r.home === U); ok(g.length && g.some(r => r.rh > r.ra), '끝내기 1면 = 그날 내 홈 승리 ' + f.head); ok(S.players[f.pid] && S.players[f.pid].team === U && /끝내기/.test(f.head), '끝내기 주인공은 내 선수'); }
  const cl = (S.front || []).filter(x => x.kind === 'clinch'); ok(cl.length <= 1 && (!cl.length || (S.clinch && S.clinch.k === 'in')), '가을야구 확정 1면은 확정 때 한 번');
  const st = JSON.parse(JSON.stringify(S.stats)); const P0 = L.startPostseason(); let g = 0; while (!P0.done && g++ < 100) { if (L.userInPost()) { const k = L.startUserPostGame(); k.live.playToEnd(); L.finishUserPostGame(k); } else L.simPostGame(); }
  L.startOffseason();
  for (const id of Object.keys(st.bat)) ok(JSON.stringify(st.bat[id]) === JSON.stringify(S.stats.bat[id]), '포스트시즌 경기가 정규시즌 타격 기록에 섞이지 않음 ' + id);
  for (const id of Object.keys(st.pit)) ok(JSON.stringify(st.pit[id]) === JSON.stringify(S.stats.pit[id]), '정규시즌 투구 기록 불변 ' + id);
  ok(S.pstats && S.pstats.y === S.year && Object.keys(S.pstats.bat).length > 0, '포스트시즌 기록은 따로');
  for (const c of (S.cards || [])) { cards++; const p = S.players[c.pid]; ok(p && c.y === S.year && ['holo', 'gold', 'silver', 'common'].includes(c.rarity), '카드 형식');
    let m; if ((m = c.title.match(/(\d+)홈런/))) ok((st.bat[c.pid].HR || 0) === +m[1] && +m[1] >= 30, '30홈런 카드 = 기록 ' + c.title + ' 정규시즌 ' + st.bat[c.pid].HR + ' 시즌 종료 시점 ' + (S.stats.bat[c.pid] || {}).HR); if ((m = c.title.match(/(\d+)타점/))) ok((st.bat[c.pid].RBI || 0) === +m[1] && +m[1] >= 100, '100타점 카드');
    if ((m = c.title.match(/(\d+)탈삼진/))) ok(st.pit[c.pid].K === +m[1] && +m[1] >= 150, '150탈삼진 카드'); if (/3할 타자/.test(c.title)) { const b = st.bat[c.pid], H = b['1B'] + b['2B'] + b['3B'] + b.HR, AB = b.PA - b.BB - b.HBP - (b.SF || 0); ok(b.PA >= 400 && H / AB >= 0.3, '3할 카드'); } }
  ok((S.cardNew || []).length === (S.cards || []).length, '새 카드 알림 = 시즌 카드');
  if (S.post.champion === U) ok((S.front || []).some(x => x.kind === 'champ'), '우승 1면'); else ok(!(S.front || []).some(x => x.kind === 'champ'), '우승 아니면 우승 1면 없음');
  const L2 = League.fromJSON(JSON.parse(JSON.stringify(S))); ok((L2.S.cards || []).length === (S.cards || []).length && (L2.S.front || []).length === (S.front || []).length, '저장 후 유지');
  L.frontSeenUpTo(999); ok(!L.frontUnseen(), '읽음 처리'); }
console.log('moments tests ok', n, `(끝내기 1면 ${walk} · 카드 ${cards})`);
