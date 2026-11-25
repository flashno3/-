/* 엔진 안전장치: 타석·선발·구원 기록이 모두 0인 선수단(신인·가상 선수 위주)으로도 경기가 진행된다(가중치 합 0 → 균등). 기록이 있으면 기존과 같은 결과 */
const fs = require('fs'), assert = require('assert'); const LG = require(__dirname + '/src/league.js'), { League } = LG; require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = () => { const L = League.create(base, 'Lions', 3); L.faAdvance(75); L.closeFA(); L.advance(1, false); return L; };
{ const L = mk(), E = L.engine(), a = E.game('Bears', 'Twins', 2, 2, LG.rngFor(1, 2, 3), E.newStats(), { maxInn: 15 }); const L2 = mk(), E2 = L2.engine(), b = E2.game('Bears', 'Twins', 2, 2, LG.rngFor(1, 2, 3), E2.newStats(), { maxInn: 15 }); ok(a[0] === b[0] && a[1] === b[1], '결정성(기록이 있는 일반 경우)'); }
{ const L = mk(); for (const p of L.players('Bears')) { if (p.type === 'B') { p.PA = 0; p.G = 0; } else { p.GS = 0; p.IP = 0; } } L._engDirty = true; L.invalidate(); const E = L.engine();
  let r = null, err = null; try { r = E.game('Bears', 'Twins', 2, 2, LG.rngFor(1, 2, 3), E.newStats(), { maxInn: 15 }); } catch (e) { err = e.message; } ok(!err && Number.isFinite(r[0]) && Number.isFinite(r[1]), '기록 0 선수단으로 경기 진행 ' + err);
  for (const p of L.players('Bears')) if (p.type === 'B') p.PA = undefined; L._engDirty = true; L.invalidate(); try { const E3 = L.engine(); E3.game('Twins', 'Bears', 3, 3, LG.rngFor(1, 2, 4), E3.newStats(), {}); } catch (e) { err = e.message + e.stack.split('\n')[2]; } ok(!err, '타석 기록 없음(undefined)도 진행 ' + err); }
console.log('enginesafe tests ok', n);
