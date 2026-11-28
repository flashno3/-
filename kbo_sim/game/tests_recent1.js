/* 1군 최근 흐름(S.recent1, 49단계 버그 수정): 1군 경기가 '최근 흐름'에 기록되지 않아 부진 이벤트(1군 대상)가 사실상 발생하지 않던 문제.
 *  기록 정합(최근 10경기 타석 합 = 시즌 타석), 2군 기록(S.recent)과 분리, 부진 이벤트 발생, 새 시즌 초기화 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
{ const L = League.create(base, 'Bears', 3), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(8, false);
  const bats = L.hitters('Bears', true).filter(p => (S.stats.bat[p.id] || {}).PA); ok(bats.length >= 9, '1군 타자 기록');
  for (const p of bats) { const r = S.recent1[p.id] || [], pa = r.reduce((a, e) => a + e[6], 0); ok(r.length <= 10 && pa === S.stats.bat[p.id].PA, `${p.ko}: 최근 기록 타석 합 ${pa} = 시즌 ${S.stats.bat[p.id].PA}`); }
  const pits = L.pitchers('Bears', true).filter(p => (S.stats.pit[p.id] || {}).outs); for (const p of pits) { const r = S.recent1[p.id] || [], o = r.reduce((a, e) => a + e[1], 0); ok(o === S.stats.pit[p.id].outs, `${p.ko}: 아웃 합 ${o} = 시즌 ${S.stats.pit[p.id].outs}`); }
  ok(Object.keys(S.recent1).every(id => S.players[id].team === 'Bears'), '우리 구단만 기록');
  ok(bats.filter(p => !(S.stats2.bat[p.id] || {}).PA).every(p => !(S.recent[p.id] || []).length), '2군 기록(S.recent)과 섞이지 않음');
  const f = L._arcForm(bats[0]); ok(f === null || typeof f === 'number', '이야기 흐름 계산'); }
// 한 시즌: 최근 10경기 유지, 부진 이벤트 발생, 새 시즌 초기화
{ const L = League.create(base, 'Lions', 5), S = L.S; L.faAdvance(75); L.closeFA(); let slump = 0;
  while (S.phase === 'regular' || S.phase === 'preseason') { L.advance(1, false); for (const e of L.eventsOpen()) { if (e.type === 'slump') slump++; L.resolveEvent(e.id, e.rec || e.def); } }
  ok(slump >= 1, '부진 이벤트 발생 ' + slump); ok(Object.values(S.recent1).every(r => r.length <= 10 && r.every((e, i) => !i || e[0] >= r[i - 1][0])), '최근 10경기·날짜순');
  const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); }
  L.startOffseason(); L.resignAll(); L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); L.startNewSeason(); ok(Object.keys(S.recent1).length === 0, '새 시즌 초기화'); }
console.log('recent1 tests ok', n);
