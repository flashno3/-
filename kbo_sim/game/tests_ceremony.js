/* 시상식·은퇴식 이벤트: 선택별 효과(충성도·비용·신뢰도), 영구결번 심의와의 연결, 시즌 전환 때 기본 처리 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = seed => { const L = League.create(base, 'Lions', seed || 3); L.faAdvance(75); L.closeFA(); return L; };
const U = L => L.S.userTeam;
// 1) 시상식: 내 구단 수상자가 없으면 이벤트 없음, 있으면 선택별 효과
{ const L = mk(), S = L.S, t = U(L), mine = L.players(t).filter(p => !p.foreign).slice(0, 2);
  ok(L._awardCeremony([{ id: Object.values(S.players).find(p => p.team !== t && p.team in S.teams).id, name: 'x', team: 'Bears', label: 'MVP', txt: '' }]) === null, '수상자 없으면 이벤트 없음');
  const aw = [{ id: mine[0].id, name: mine[0].ko, team: t, label: 'MVP', txt: 'OPS 1.000' }, { id: mine[1].id, name: mine[1].ko, team: t, label: '골든글러브 포수', txt: '' }];
  const ev = L._awardCeremony(aw); ok(ev && ev.type === 'awards' && ev.choices.length === 3 && ev.def === 'cheer' && ev.rec === 'bonus', '시상식 이벤트(MVP면 보너스 추천)'); ok(L._awardCeremony(aw) === null, '같은 해 중복 없음');
  const other = L.players(t).find(p => p.id !== mine[0].id && p.id !== mine[1].id), f = S.fin.teams[t], c0 = f.evCost || 0, l0 = mine[0].loyAdj || 0, o0 = other.loyAdj || 0;
  const r = L.resolveEvent(ev.id, 'bonus'); ok(r.ok, '보너스 처리'); ok((mine[0].loyAdj || 0) === Math.min(15, l0 + 4), 'MVP 수상자 충성도 +4'); ok((other.loyAdj || 0) === Math.min(15, o0 + 1), '선수단 +1'); ok(Math.abs((f.evCost || 0) - c0 - 0.6) < 1e-9, '보너스 비용 0.3×2=0.6 ' + ((f.evCost || 0) - c0));
  ok((S.ceremonies || []).some(x => x.kind === 'awards'), '행사 기록'); }
{ const L = mk(), S = L.S, t = U(L), p = L.players(t).find(x => !x.foreign), aw = [{ id: p.id, name: p.ko, team: t, label: '홈런왕', txt: '' }], ev = L._awardCeremony(aw), f = S.fin.teams[t], c0 = f.evCost || 0, l0 = p.loyAdj || 0;
  ok(ev.rec === 'party', '큰 상이 아니면 만찬 추천'); L.resolveEvent(ev.id, 'cheer'); ok((p.loyAdj || 0) === Math.min(15, l0 + 1) && (f.evCost || 0) === c0, '축하만: +1·비용 없음'); }
// 2) 은퇴식: 근속·후보 조건, 선택별 효과
const longServe = (L, p, t, years) => { p.seasons = Array.from({ length: years }, (_, i) => ({ y: 2010 + i, t, k: 'B', PA: 500, avg: 0.28, HR: 10, RBI: 50, ops: 0.8, SB: 0 })); };
{ const L = mk(), S = L.S, t = U(L), a = L.players(t).find(x => !x.foreign && x.type === 'B'), b = L.players(t).find(x => !x.foreign && x.type === 'B' && x.id !== a.id);
  a.dh = Object.assign({}, a.dh, { one: false }); longServe(L, a, t, 3); ok(L._retireCeremony(a) === null, '근속 3시즌은 은퇴식 없음');
  b.dh = Object.assign({}, b.dh, { one: false }); longServe(L, b, t, 9); const ev = L._retireCeremony(b); ok(ev && ev.type === 'retcer' && ev.choices.length === 3, '근속 9시즌 은퇴식'); ok(ev.def === 'simple', '기본은 간소');
  const f = S.fin.teams[t], tr0 = f.trust, c0 = f.evCost || 0, mate = L.players(t).find(x => x.id !== b.id && !x.foreign), m0 = mate.loyAdj || 0; L.resolveEvent(ev.id, 'grand');
  ok(f.trust > tr0 - 1e-9 && (f.trust - tr0) >= 1.9 || f.trust === 100, '성대: 신뢰도 +2 ' + (f.trust - tr0)); ok(Math.abs((f.evCost || 0) - c0 - 1.0) < 1e-9, '성대 비용 1.0'); ok((mate.loyAdj || 0) === Math.min(15, m0 + 2), '선수단 충성도 +2'); ok((S.story || []).some(x => x.kind === 'ceremony'), '스토리 기록'); }
// 3) 영구결번 후보: 은퇴식 → 영구결번 심의 순서
{ const L = mk(), S = L.S, t = U(L), p = Object.values(S.players).find(x => x.ko === '구자욱' && x.type === 'B'); p.team = t; p.retired = true; const ev = L._retireCeremony(p); ok(ev && ev.data.tier === 'gray' && ev.rec === 'grand', '후보는 은퇴식 이벤트(16시즌 → 성대 추천) ' + JSON.stringify(ev && ev.data));
  p.legClub = t; p.team = 'RET'; L._legendProcess(); ok(!L.eventsOpen().some(e => e.type === 'legend'), '은퇴식 전에는 영구결번 심의가 열리지 않음'); L.resolveEvent(ev.id, 'normal'); ok(L.eventsOpen().some(e => e.type === 'legend'), '은퇴식 뒤 영구결번 심의 이벤트'); }
// 4) 시즌 전환: 결정하지 않은 행사는 기본 선택으로 처리되고 남지 않는다(실제 2시즌 진행)
{ const L = mk(5), S = L.S; let seen = 0;
  for (let y = 0; y < 2; y++) { L.advance(300, false); const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c) } else L.simPostGame() }
    L.startOffseason(); const o = S.off; for (const id of o.rep.expiring.slice()) if (L.ovr(S.players[id]) >= 48) L.resign(id, 2); seen += L.eventsOpen().filter(e => e.type === 'awards' || e.type === 'retcer').length;
    L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); L.startNewSeason(); ok(!L.eventsOpen().some(e => e.type === 'awards' || e.type === 'retcer'), `Y${y} 시즌 전환 후 행사 이벤트가 남지 않음`); }
  ok(seen >= 1, '실제 시즌에서 시상식 이벤트 발생 ' + seen); ok(L.S.ceremonies && L.S.ceremonies.length >= 1, '자동 처리도 행사 기록'); }
console.log('ceremony tests ok', n);
