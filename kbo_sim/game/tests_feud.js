/* 악연 라이벌(49단계): 열기 누적 → 라이벌 판정(우리 구단이 낀 쌍만)·이름·설명·기사 1회, 빈볼 시비 선택, 라이벌전 컨디션, 새 시즌 감소, 구단 이동 초기화, 정합성 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const BAD = /undefined|NaN|\[object|null/;
{ const L = League.create(base, 'Bears', 3), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(10, false);
  ok(!L.isRival('Bears', 'Dinos') && !L.isRival('Bears', 'Wiz'), '처음엔 악연 없음'); ok(L.isRival('Bears', 'Twins'), '지역 라이벌은 그대로(잠실)');
  L._feudAdd('Wiz', 8, '끝내기 패배'); ok(!L.isRival('Bears', 'Wiz'), '기준(15) 미만은 라이벌 아님');
  L._feudAdd('Wiz', 8, '3연전 싹쓸이 패'); ok(L.isRival('Bears', 'Wiz') && L.isRival('Wiz', 'Bears') && !L.isRival('Wiz', 'Dinos'), '악연 라이벌: 우리 구단이 낀 쌍만');
  ok(L.rivalName('Bears', 'Wiz') === 'KT와의 악연', '이름 ' + L.rivalName('Bears', 'Wiz')); const ri = L.rivalInfo('Wiz'); ok(ri && ri.feud && /끝내기 패배/.test(ri.desc), '설명 ' + (ri && ri.desc));
  const news = S.lgnews.filter(x => x.cat === '라이벌'); ok(news.length === 1 && /새로운 악연/.test(news[0].head) && !BAD.test(news[0].head + news[0].body), '기사 1건');
  L._feudAdd('Wiz', -2, '선수단 진정'); L._feudAdd('Wiz', 3, '끝내기 패배'); ok(S.lgnews.filter(x => x.cat === '라이벌').length === 1, '같은 시즌 다시 넘어도 기사 중복 없음');
  // 빈볼 시비 선택
  for (const x of L.eventsOpen().filter(x => x.type === 'feud')) L.resolveEvent(x.id, 'calm'); const e = L._feudHbpEvent('Dinos', 2); ok(e && e.choices.length === 2, '빈볼 시비 이벤트'); const h0 = L.feudHeat('Dinos'), r = L.resolveEvent(e.id, 'protest'); ok(r.ok && L.feudHeat('Dinos') === h0 + 2 && S.teamMood.v === 1, '항의: 열기 +2·컨디션 +1 ' + r.msg);
  const e2 = L._feudHbpEvent('Dinos', 3); const r2 = L.resolveEvent(e2.id, 'calm'); ok(r2.ok && L.feudHeat('Dinos') === h0 + 1, '진정: 열기 −1');
  // 라이벌전 뒤 컨디션: 60일 진행하며 KT전 결과에 따라 ±1
  let seen = 0; for (let i = 0; i < 100 && seen < 2 && S.phase === 'regular'; i++) { for (const ev of L.eventsOpen()) L.resolveEvent(ev.id, ev.def); S.teamMood = null; const r0 = S.results.length; L.advance(1, false);
    const g = S.results.slice(r0).find(x => (x.home === 'Bears' && x.away === 'Wiz') || (x.away === 'Bears' && x.home === 'Wiz')); if (!g || g.rh === g.ra) continue; const win = g.home === 'Bears' ? g.rh > g.ra : g.ra > g.rh;
    ok(S.teamMood && S.teamMood.v === (win ? 1 : -1) && S.teamMood.until === S.day + 3, '라이벌전 컨디션 ' + (win ? '+1' : '−1') + ' ' + JSON.stringify(S.teamMood)); seen++; }
  ok(seen >= 1, '라이벌전 컨디션 확인 ' + seen); ok(!L.integrity().errors.length, '정합성');
  // 새 시즌 ×0.6, 구단 이동 초기화
  const v0 = L.feudHeat('Wiz'); while (S.phase === 'regular' || S.phase === 'preseason') L.advance(30, false);
  const P = L.startPostseason(); let gg = 0; while (!P.done && gg++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); }
  L.startOffseason(); L.resignAll(); L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); const v1 = L.feudHeat('Wiz'); L.startNewSeason(); ok(Math.abs(L.feudHeat('Wiz') - Math.round(v1 * 0.6 * 10) / 10) < 1e-9 && v1 >= v0, `새 시즌 열기 ×0.6 (${v1} → ${L.feudHeat('Wiz')})`);
  ok(L.takeOverTeam('Tigers') && L.feudList().length === 0, '구단 이동 시 악연 초기화'); }
console.log('feud tests ok', n);
