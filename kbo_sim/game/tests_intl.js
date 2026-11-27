/* 국제대회: 2027 프리미어12(오프시즌) → 올림픽 출전권 → 2028 최종예선(필요 시) → 2028 LA 올림픽(시즌 중 소집·결장·복귀) → 메달 병역 특례, 아시안게임 선발 규정 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const post = L => { const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); } };
const offseason = L => { const S = L.S; L.startOffseason(); for (const id of S.off.rep.expiring.slice()) if (L.ovr(S.players[id]) >= 48) L.resign(id, 2); L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); L.startNewSeason(); };
const grp = p => p.type === 'P' ? 'P' : p.pos === 'C' ? 'C' : ['LF', 'CF', 'RF'].includes(p.pos) ? 'OF' : 'IF';
// 1) 선발 규정
{ const L = League.create(base, 'Wiz', 5), S = L.S;
  const p12 = L.intlPick({ kind: 'P12', y: 2027, size: 28 }), ps = p12.ids.map(id => S.players[id]);
  ok(ps.length === 28 && new Set(p12.ids).size === 28 && ps.every(p => !p.foreign), '프리미어12 28명·국내 선수만');
  ok(ps.filter(p => grp(p) === 'P').length === 13 && ps.filter(p => grp(p) === 'C').length === 2, '투수 13·포수 2');
  const ag = L.intlPick({ kind: 'AG', y: 2030, size: 24 }), as = ag.ids.map(id => S.players[id]);
  ok(as.length === 24 && ag.wc.length <= 3, 'AG 24명·와일드카드 3명 이하 ' + ag.wc.length);
  ok(as.every(p => ag.wc.includes(p.id) ? p.age <= 29 : (p.age <= 25 || (p.dh && 2030 - p.dh.y + 1 <= 4) || (p.rookie !== undefined && 2030 - p.rookie + 1 <= 4))), 'AG 나이·연차 규정(와일드카드는 만 29세 이하)');
  ok(L.intlEvents().find(e => e.id === 'p12_2027').ok && !L.intlEvents().find(e => e.id === 'ag_2030').ok, '일정: 확인된 대회와 가정 대회 구분'); }
// 2) 두 시즌 흐름
{ const L = League.create(base, 'Wiz', 5), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(300, false); post(L);
  offseason(L); const I = S.intl, h = I.hist.find(x => x.id === 'p12_2027');
  ok(h && h.ids.length === 28 && h.games.length >= 3 && h.place >= 1 && h.place <= 16, '2027 프리미어12 진행 ' + JSON.stringify(h && { p: h.place, g: h.games.length }));
  ok(I.olyField && I.olyField.length === (I.olyQ ? 5 : 6) && I.olyField.includes('USA') && I.olyQ === (h.oly === 'KOR'), 'LA 올림픽 출전권 배분(아시아 최상위·유럽/오세아니아)');
  ok(h.exempt.length === 0, '프리미어12는 병역 특례 없음');
  ok(I.olyQ || I.hist.some(x => x.id === 'oqt_2028'), '직행 실패 시 2028년 3월 최종예선');
  // 올림픽 소집·결장·복귀(한국 본선이 아니면 강제로 출전시켜 확인)
  if (!I.olyQ) { I.olyQ = true; I.olyField = ['USA', 'DOM', 'VEN', 'KOR', 'NED', 'JPN']; }
  const dn = (m, d) => Math.floor(Date.UTC(2028, m, d) / 864e5); let k = 0; while (L.todayN() < dn(6, 8) && k++ < 200) L.advance(1, false);
  ok(I.cur && I.cur.camp, '7월 소집');
  const away = I.cur.sel.ids.map(id => S.players[id]).filter(p => p.team in S.teams);
  ok(away.length > 10 && away.every(p => p.inj && p.inj.natl && !p.active && L.isInj(p)), '소집 기간 소속팀 결장 ' + away.length);
  ok(Object.keys(S.teams).every(t => L.players(t).filter(p => p.active).length >= 18), '결장 뒤에도 1군 인원 유지');
  k = 0; while (L.todayN() < dn(6, 23) && k++ < 200) L.advance(1, false);
  const oh = I.hist.find(x => x.id === 'oly_2028'); ok(oh && oh.games.length >= 3 && oh.place >= 1 && oh.place <= 6, '2028 LA 올림픽 결과 ' + (oh && oh.place));
  ok(away.every(p => !(p.inj && p.inj.natl)), '복귀(대표 결장 표시 해제)');
  if (oh.medal) ok(oh.exempt.every(id => S.players[id].mil.st === 'ag' && /올림픽/.test(S.players[id].mil.how)), '메달 → 미필 선수 특례');
  else ok(oh.exempt.length === 0, '메달 없으면 특례 없음');
  const ig = L.integrity(); ok(!ig.errors.length, '정합성 ' + JSON.stringify(ig.errors.slice(0, 2))); }
// 3) 메달 특례 직접 확인(전력을 크게 올리거나 낮춰 결과를 고정) — 올림픽 대표는 대부분 군필이라 아시안게임(미필 다수)으로 확인하고, 올림픽은 미필 1명을 넣어 확인
{ const L = League.create(base, 'Wiz', 7), S = L.S, I = L._intl(), ev = L.intlEvents(), ag = ev.find(e => e.id === 'ag_2030'), oly = ev.find(e => e.id === 'oly_2028');
  const isPend = id => ['pending', 'apply', 'sangmu27'].includes(S.players[id].mil && S.players[id].mil.st);
  const sel = L.intlPick(ag), pend = sel.ids.filter(isPend), before = Object.fromEntries(sel.ids.map(id => [id, S.players[id].mil && S.players[id].mil.st]));
  ok(pend.length >= 3, 'AG 대표에 미필 선수 포함 ' + pend.length);
  I.baseAG = 1; const h = L._intlRun(ag, sel); ok(h.place === 1 && h.medal === '금메달', '강한 전력이면 금메달');
  ok(h.exempt.length === pend.length && pend.every(id => S.players[id].mil.st === 'ag' && /아시안게임 금메달 특례/.test(L.milStatus(S.players[id]).label)), `AG 금메달 → 미필 ${pend.length}명 특례·표시`);
  ok(sel.ids.filter(id => !pend.includes(id)).every(id => (S.players[id].mil && S.players[id].mil.st) === before[id]), '이미 군필·복무 중·정보 없음 선수는 그대로');
  I.olyQ = true; I.olyField = ['USA', 'DOM', 'VEN', 'KOR', 'NED', 'JPN']; I.base = 1; const so = L.intlPick(oly), x = S.players[so.ids.find(id => S.players[id].team in S.teams)]; x.mil = { st: 'pending', src: 'test' };
  const ho = L._intlRun(oly, so); ok(ho.place <= 3 && ho.exempt.includes(x.id) && /올림픽/.test(L.milStatus(x).label), '올림픽 메달 → 미필 특례'); }
{ const L = League.create(base, 'Wiz', 7), S = L.S, I = L._intl(), ag = L.intlEvents().find(e => e.id === 'ag_2030'), sel = L.intlPick(ag), pend = sel.ids.filter(id => S.players[id].mil && S.players[id].mil.st === 'pending');
  I.baseAG = 1e9; const h = L._intlRun(ag, sel); ok(h.place > 1 && h.exempt.length === 0 && pend.every(id => S.players[id].mil.st === 'pending'), '금메달이 아니면 특례 없음 ' + h.place); }
// 4) WBC(2030년 3월 가정): 30명(투수 15) · 새 시즌 직전 진행 · 병역 특례 없음 · 결과 표기
{ const L = League.create(base, 'Wiz', 9), S = L.S, ev = L.intlEvents().find(e => e.id === 'wbc_2030');
  ok(ev && ev.phase === 'pre' && !ev.ok && ev.size === 30, 'WBC 2030 일정(가정 표시)'); const sel = L.intlPick(ev); ok(sel.ids.length === 30 && sel.ids.filter(id => S.players[id].type === 'P').length === 15, 'WBC 30명·투수 15');
  S.year = 2030; L._intlPreseason(); const h = S.intl.hist.find(x => x.id === 'wbc_2030');
  ok(h && h.games.length >= 4 && ['우승', '준우승', '4강', '8강', '1라운드 탈락'].includes(h.res) && h.exempt.length === 0, 'WBC 진행·특례 없음 ' + (h && h.res));
  ok(h.games.slice(0, 4).every(g => ['JPN', 'TPE', 'AUS', 'CZE'].includes(g.opp)), '1라운드 도쿄 조(일본·대만·호주·체코)');
  ok(!S.intl.hist.some(x => x.id === 'oqt_2028'), '최종예선은 해당 연도·조건일 때만'); }
// 시즌 중 차출(42단계·복귀 처리 보완): 소집 기간 1군·2군 출전 없음 → 복귀하면 원래 1군·라인업 자리로(자동 관리 기본값), '끄기'면 2군 대기
for (const mode of ['fill', 'off']) { const L = League.create(base, 'Tigers', 6), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(30, false); if (mode === 'off') S.injAuto = 'off';
  const set = S.teams.Tigers.set, a = S.players[set.lineup[0].id], b = S.players[set.lineup[3].id], posA = set.lineup[0].pos, posB = set.lineup[3].pos, key = id => [S.stats, S.stats2].map(T => ((T.bat[id] || {}).PA || 0)).join('/');
  L._intlAway([a.id, b.id], L.todayN() + 6, '시험 대회'); const k0 = [key(a.id), key(b.id)];
  ok(!a.active && !b.active && !set.lineup.some(x => x.id === a.id || x.id === b.id), `${mode}: 소집되면 1군·라인업에서 빠짐`);
  L.advance(4, false); ok(key(a.id) === k0[0] && key(b.id) === k0[1], `${mode}: 소집 기간 1군·2군 출전 없음`);
  L.advance(5, false);
  if (mode === 'fill') ok(a.active && b.active && set.lineup.some(x => x.id === a.id && x.pos === posA) && set.lineup.some(x => x.id === b.id && x.pos === posB), '복귀 → 원래 1군·라인업 포지션');
  else ok(!a.active && !b.active, '자동 관리 끄기: 2군 대기');
  ok(!a.natlPrev && !b.natlPrev && !(a.inj && a.inj.natl), `${mode}: 복귀 표시 정리`); ok(!L.integrity().errors.length, `${mode}: 정합성`); }
console.log('intl tests ok', n);
