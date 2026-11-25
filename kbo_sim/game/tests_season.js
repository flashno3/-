/* 시즌 타임라인·가을야구 확정/탈락 판정: 표시용 계산이 실제 결과와 어긋나지 않는다(확정·탈락이라고 한 팀은 실제로 그렇게 끝난다) */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
let calls = 0;
for (const seed of [1, 2, 3]) { const L = League.create(base, 'Lions', seed); L.faAdvance(75); L.closeFA(); const S = L.S;
  const sm = L.seasonMarks(); ok(sm.len === S.schedule.length && sm.marks.length === 4 && sm.marks.every((m, i) => i === 0 || m.d >= sm.marks[i - 1].d), '표시 순서');
  const sep = sm.marks.find(m => m.k === 'sep'); ok(sep && L.dateOf(sep.d).getUTCMonth() === 8 && (sep.d === 0 || L.dateOf(sep.d - 1).getUTCMonth() < 8), '9월 첫 경기일 ' + (sep && L.dateStr(sep.d)));
  ok(sm.marks.find(m => m.k === 'dl').d === 110 && sm.marks.find(m => m.k === 'as').d === L.allStarBreakDay(), '트레이드 마감·올스타 일차');
  const said = {}; const teams = Object.keys(S.teams);
  while (S.day < S.schedule.length) { L.advance(1, false); for (const t of teams) { const c = L.postClinch(t); if (c) { said[t] = said[t] || c; ok(said[t] === c, `${t} 판정이 뒤집힘`); calls++; } } }
  const st = L.standings();
  for (const t of teams) { const r = st.find(x => x.team === t).rank; if (said[t] === 'in') ok(r <= 5 || st.filter(x => x.pct === st.find(y => y.team === t).pct).length > 1, `${t} 진출 확정이었는데 ${r}위`); if (said[t] === 'out') ok(r > 5, `${t} 탈락 확정이었는데 ${r}위`); }
  ok(Object.values(said).filter(x => x === 'out').length >= 1, '시즌 막바지에는 탈락 확정 팀이 나온다'); }
console.log('season tests ok', n, `(판정 ${calls}회)`);
