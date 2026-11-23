/* 연도별·통산 커리어: 시즌 행의 전체 카운터·2군 기록·구단 WAR·리그 시즌 기록 보존 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const L = League.create(base, 'Lions', 4); L.faAdvance(75); L.closeFA(); const S = L.S, U = S.userTeam, cols = L.careerCols();
ok(cols.B.length === 12 && cols.P.length === 8 && cols.B[0] === 'PA' && cols.P[6] === 'outs', '카운터 순서');
const play = () => { L.advance(300, false); const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c) } else L.simPostGame() } };
const offseason = () => { L.startOffseason(); const o = S.off; for (const id of o.rep.expiring.slice()) if (L.ovr(S.players[id]) >= 48) L.resign(id, 2); for (const e of L.eventsOpen()) L.resolveEvent(e.id, e.def || e.choices[e.choices.length - 1].k); L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); L.startNewSeason(); };
const y1 = S.year; play(); const bat1 = Object.entries(S.stats.bat).filter(([id, c]) => c.PA > 300 && S.players[id].team === U)[0]; ok(bat1, '규정급 타자'); const id1 = bat1[0], c1 = JSON.parse(JSON.stringify(S.stats.bat[id1]));
offseason();   // 시즌 종료 시 스냅샷
const p = S.players[id1], row = p.seasons.find(x => x.y === y1); ok(row && row.k === 'B' && Array.isArray(row.c) && row.c.length === 12, '시즌 행에 카운터 저장'); cols.B.forEach((k, i) => ok(row.c[i] === (c1[k] || 0), `카운터 일치 ${k}`)); ok(row.PA === c1.PA, '기존 필드 유지');
const cr = L.careerOf(p); ok(cr.war && typeof cr.war.y === 'object', '경력에 WAR 필드'); ok(cr.war.y[y1] > 0, '연도별 WAR 대용치 ' + JSON.stringify(cr.war.y));
ok(S.leagueRows && S.leagueRows[y1] && S.leagueRows[y1].B.length > 0 && S.leagueRows[y1].B.length <= 70 && S.leagueRows[y1].P.length <= 70, '리그 시즌 기록 보존 ' + (S.leagueRows[y1] && S.leagueRows[y1].B.length));
const lr = S.leagueRows[y1].B.find(r => r[0] === id1); ok(lr && lr[1] === p.ko && lr[5] === c1.PA, '리그 기록 행(PA)');
ok(S.leagueRows[y1].B.every((r, i, a) => i === 0 || a[i - 1][5] >= r[5]), '타석 순 정렬');
// 2군 기록이 있는 선수: f 저장
const farmP = Object.values(S.players).filter(q => (q.seasons || []).some(x => x.y === y1 && x.f)); ok(farmP.length > 0, '2군 기록 보존 ' + farmP.length);
// 두 번째 시즌 후 통산 합계 = 연도별 합
play(); offseason(); const y2 = y1 + 1, q = S.players[id1]; if (q && !q.retired) { const rs = q.seasons.filter(x => x.c && x.k === 'B'); ok(rs.length >= 2, '두 시즌 기록'); const tot = cols.B.map((k, i) => rs.reduce((a, x) => a + x.c[i], 0)); ok(tot[0] === rs.reduce((a, x) => a + x.PA, 0), '통산 타석 = 연도별 합'); }
ok(Object.keys(S.leagueRows).length === 2, '두 해 리그 기록 ' + Object.keys(S.leagueRows)); const sizes = JSON.stringify(S.leagueRows).length; ok(sizes < 120000, '리그 기록 용량 ' + sizes);
// 저장/불러오기
const L2 = League.fromJSON(JSON.parse(JSON.stringify(S))); ok(L2.S.leagueRows[y1].B.length === S.leagueRows[y1].B.length, '저장 후 유지');
console.log('career tests ok', n);
