/* 외국인 연봉 상한(52단계): 400만$ + 재계약 1회당 10만$(장수 외국인), 신규 100만$, 재계약 개인 상한 없음, 아시아쿼터 +10만$, 모든 구단 적용, 연차 갱신, 시즌 중 대체 후보군 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const fin = L => { const S = L.S; while (S.phase === 'regular' || S.phase === 'preseason') { L.advance(10, false); for (const e of L.eventsOpen()) L.resolveEvent(e.id, e.rec || e.def); }
  const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); } };
const allOk = (L, tag) => { for (const t of Object.keys(L.S.teams)) { const c = L.foreignCapInfo(t); ok(c.pay <= c.total + 0.05, `${tag} ${t}: 외국인 합산 ${c.pay} ≤ 상한 ${c.total}`); } };
{ const L = League.create(base, 'Giants', 3), S = L.S, P = nm => Object.values(S.players).find(p => p.ko === nm);
  ok(P('레이예스').ften === 4 && P('오스틴').ften === 5 && L.fTenure(P('레이예스'), 'Giants', 2027) === 4, '시작 연차: 레이예스 4년째·오스틴 5년째');
  const c = L.foreignCapInfo('Giants'); ok(Math.abs(c.base - 56) < 1e-9 && c.bonus >= 0.4 && Math.abs(c.total - (56 + 1.4 * c.list.reduce((a, x) => a + x.ten - 1, 0))) < 0.05, '롯데 합산 상한 = 56억 + 1.4억 × 재계약 횟수 ' + JSON.stringify(c));
  const tw = L.foreignCapInfo('Twins'); ok(tw.list.some(x => x.name === '오스틴' && x.ten === 5) && tw.bonus >= 0.56 - 1e-9, 'LG: 오스틴 5년째 → +40만$(0.56억) 이상');
  // 개인 상한: 신규 14억(합산 여유 이내), 재계약은 개인 상한 없음(=합산 여유)
  const fa = (S.fa || []).map(id => S.players[id]).find(p => p && p.foreign && !p.aq && p.team === 'FA'); ok(L.foreignCap(fa, 'Twins') <= 14 + 1e-9, '신규 개인 상한 14억');
  const r = P('레이예스'); ok(L.foreignCap(r, 'Giants') === L.foreignRoom('Giants', r.id, r) && L.foreignRoom('Giants', r.id, r) > 14, '재계약은 개인 상한 없이 합산 여유까지 ' + L.foreignCap(r, 'Giants'));
  L.faAdvance(75); L.closeFA(); allOk(L, '2027 개막');
  // 시즌 중 대체 후보군
  const mid0 = (S.fa || []).filter(id => S.players[id] && S.players[id].mid).length; ok(mid0 === 0, '개막 때는 대체 후보 없음');
  let k = 0; while (L.dateOf(S.day).getUTCMonth() + 1 < 5 && k++ < 80) L.advance(1, false); L.advance(1, false);
  const may = (S.fa || []).map(id => S.players[id]).filter(p => p && p.mid === 'may'); ok(may.length === 40 && may.filter(p => p.aq).length === 15, '5월 대체 후보 40명(아시아쿼터 15) ' + may.length);
  ok(may.every(p => L.ovr(p) <= 68.5), '대체 후보 최고 수준 약 68 이하 ' + Math.max(...may.map(p => L.ovr(p))).toFixed(1));
  k = 0; while (L.dateOf(S.day).getUTCMonth() + 1 < 7 && k++ < 80) L.advance(1, false); L.advance(1, false);
  const left = (S.fa || []).map(id => S.players[id]).filter(p => p && p.mid === 'may' && p.team === 'FA').length, jul = (S.fa || []).map(id => S.players[id]).filter(p => p && p.mid === 'jul').length;
  ok(left < may.length && left > 0 && jul === 40, `7월: 5월 후보 일부가 빠지고(${left}/${may.length}) 새 후보 ${jul}명`);
  ok(!L.integrity().errors.length, '시즌 중 정합성');
  // 시즌 끝 → 재계약·FA → 새 시즌: 연차 +1, 모든 구단 합산 상한 준수
  fin(L); const before = Object.values(S.players).filter(p => p.foreign && p.team in S.teams).map(p => [p.id, p.team, L.fTenure(p, p.team, S.year)]);
  L.startOffseason(); L.resignAll(); L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); allOk(L, '2028 계약 뒤(오프시즌)'); L.startNewSeason();
  const stay = before.filter(([id, t]) => S.players[id] && S.players[id].team === t), moved = Object.values(S.players).filter(p => p.foreign && p.team in S.teams && !before.some(b => b[0] === p.id && b[1] === p.team));
  ok(stay.length > 10 && stay.every(([id, , f]) => S.players[id].ften === f + 1), '남은 외국인 연차 +1 (' + stay.length + '명) ' + stay.filter(([id, , f]) => S.players[id].ften !== f + 1).map(([id, t, f]) => S.players[id].ko + ':' + f + '→' + S.players[id].ften + ' T' + S.players[id].ftenT + ' Y' + S.players[id].ftenY).join(' '));
  ok(moved.every(p => p.ftenT === p.team && p.ftenY === S.year && (p.ften === 1 || before.every(b => b[0] !== p.id))), '새로 온 외국인 연차 기록(다른 구단에서 오면 1년째, 같은 구단에 방출 뒤 복귀는 이어짐 ⚠) ' + moved.map(p => p.ko + ':' + p.ften).join(' '));
  ok(moved.filter(p => p.faInfo && p.faInfo.from && p.faInfo.from !== p.team).every(p => p.ften === 1), '다른 구단에서 온 외국인은 1년째');
  ok(!Object.values(S.players).some(p => p.mid && p.team === 'FA' && p.midY < S.year), '지난해 대체 후보 미계약자 정리');
  L.faAdvance && L.faAdvance(75); L.closeFA && L.closeFA(); allOk(L, '2028 개막'); ok(!L.integrity().errors.length, '새 시즌 정합성'); }
console.log('foreigncap tests ok', n);
