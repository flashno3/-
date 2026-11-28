/* 구단 행사(49단계): 달력 창·우리 홈경기 날에만, 시즌 각 1회, 선택별 재정 효과(비용·수입·관중·팬 지수)·피로도, 정합성 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const WIN = { kids: [501, 507], legend: [610, 625], uniform: [701, 715], thanks: [910, 1031] };
for (const [seed, team] of [[3, 'Bears'], [6, 'Giants']]) {
  const L = League.create(base, team, seed), S = L.S, f = () => S.fin.teams[team]; L.faAdvance(75); L.closeFA(); const seen = {};
  while (S.phase === 'regular' || S.phase === 'preseason') { L.advance(1, false);
    for (const e of L.eventsOpen()) { if (e.type !== 'gday') { L.resolveEvent(e.id, e.rec || e.def); continue; }
      const id = e.data.id, dt = L.dateOf(e.day), v = (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(); seen[id] = (seen[id] || 0) + 1;
      ok(v >= WIN[id][0] && v <= WIN[id][1], `${id} 날짜 창 ${v}`); ok(S.schedule[e.day].some(g => g[0] === team), `${id}: 우리 홈경기 날`);
      const c0 = f().evCost || 0, r0 = f().evRev || 0, fl0 = f().fl === undefined ? 100 : f().fl, w0 = L.wear ? L.wear() : 0, r = L.resolveEvent(e.id, 'go'); ok(r.ok && r.msg && !/undefined|NaN/.test(r.msg), `${id}: ${r.msg}`);
      if (id === 'kids') ok(Math.abs(f().evCost - c0 - 0.3) < 1e-9 && f().promo.mult >= 1.08 && f().fl === Math.min(105, fl0 + 1), '어린이날: 비용 0.3·관중 +8%·팬 +1');
      if (id === 'legend') ok(Math.abs(f().evCost - c0 - 0.2) < 1e-9 && f().promo.mult >= 1.05, '레전드 데이: 비용 0.2·관중');
      if (id === 'uniform') ok(Math.abs(f().evCost - c0 - 0.4) < 1e-9 && f().evRev > r0, '유니폼: 제작 0.4·판매 수입 ' + (f().evRev - r0).toFixed(1));
      if (id === 'thanks') ok(f().fl === Math.min(105, fl0 + 2) && (!L.wear || L.wear() >= Math.min(100, w0 + 2) - 0.6), '팬 감사의 날: 팬 +2·피로도 +2'); } }
  ok(Object.values(seen).every(x => x === 1) && Object.keys(seen).length >= 3, '시즌 각 1회 ' + JSON.stringify(seen)); ok(!L.integrity().errors.length, '정합성'); }
console.log('gameday tests ok', n);
