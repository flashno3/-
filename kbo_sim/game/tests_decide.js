/* 감독 결정 분기점(43단계): 보정 적용·만료, 6종 결정과 후속 사건의 모든 선택지, 같은 선택의 결과 분기, 장부, 새 시즌 초기화, 정합성 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = (seed, team) => { const L = League.create(base, team || 'Bears', seed); L.faAdvance(75); L.closeFA(); L.advance(15, false); return L; };
// 1) 보정: 기간 안에서만 경기 능력치에 반영, 만료 시 제거
{ const L = mk(3), S = L.S, t = S.userTeam, p = L.hitters(t, true)[0], k0 = L._modRates(p).k;
  L._decMod({ who: 'pid', pid: p.id, v: 0.3, d1: S.day + 2, src: 'test' }); ok(L._modRates(p).k < k0, '보정이 경기 능력치(삼진율↓)에 반영');
  const q = L.players('Tigers')[0]; ok(L._decShift(q) === 0, '상대 팀에는 적용 안 됨');
  L.advance(3, false); ok(L._decShift(p) === 0 && !S.dec.mods.some(m => m.src === 'test'), '기간이 지나면 해제'); }
// 2) 6종 결정 × 모든 선택지가 오류 없이 처리되고 장부에 남음
{ const kinds = { allin: L => { const o = L.standings().find(x => x.team !== L.S.userTeam).team; return L._decAllin(o, 1, 1); }, scout: L => L._decScout(L.standings().find(x => x.team !== L.S.userTeam).team),
    rest: L => L._decRest(L.hitters(L.S.userTeam, true).sort((a, b) => b.age - a.age)[0]), youth: L => { const p = L.players(L.S.userTeam).find(q => q.type === 'B' && q.peak !== undefined && !L.isInj(q)); return p ? L._decYouth(p) : null; },
    mood: L => L._decMood('lose'), ret: L => { const p = L.hitters(L.S.userTeam, true)[0]; L._decInjure(p, 7, '시험 부상'); p.inj.generated = true; return L._decReturn(p); } };
  let seed = 20;
  for (const [kind, make] of Object.entries(kinds)) {
    const L0 = mk(seed), e0 = make(L0); if (!e0) continue;
    for (const c of e0.choices) { const L = mk(seed++), e = make(L); const r = L.resolveEvent(e.id, c.k); ok(r.ok && typeof r.msg === 'string' && r.msg.length > 0 && !/undefined|NaN/.test(r.msg), `${kind}/${c.k}: ${r.msg}`);
      ok(!L.integrity().errors.length, `${kind}/${c.k} 뒤 정합성`); } } }
// 3) 같은 선택, 다른 결과(확률 분기): 미팅·집중 분석을 여러 시드로
{ const outs = { meet: new Set(), deep: new Set(), allin: new Set() };
  for (let s = 40; s < 64; s++) { const L = mk(s); const opp = L.standings().find(x => x.team !== L.S.userTeam).team;
    const e1 = L._decMood('lose'); L.resolveEvent(e1.id, 'meet'); outs.meet.add(L._dec().log[0].out.slice(0, 8));
    const e2 = L._decScout(opp); L.resolveEvent(e2.id, 'deep'); outs.deep.add(L._dec().log[0].out.slice(0, 6));
    const e3 = L._decAllin(opp, 1, 1); L.resolveEvent(e3.id, 'allin'); outs.allin.add(L._dec().log[0].out.slice(0, 12)); }
  ok(outs.meet.size >= 3 && outs.deep.size >= 3 && outs.allin.size >= 2, '같은 선택도 결과가 여러 갈래 ' + JSON.stringify({ m: [...outs.meet], d: [...outs.deep], a: [...outs.allin] })); }
// 4) 후속 사건: 조기 복귀 재부상 → 기자회견, 미팅 역효과 → 고참 반발, 휴식 중 백업 맹활약 → 주전 경쟁, 각성 → 주전 도약
{ const L = mk(5), S = L.S, D = L._dec(), p = L.hitters(S.userTeam, true)[0], sub = L.hitters(S.userTeam, true)[9] || L.hitters(S.userTeam, true)[1];
  L._decFollow('blame', { pid: p.id }, 0); L._decFollow('vetpush', { pid: p.id }, 0); L._decFollow('compete', { pid: p.id, sub: sub.id }, 0); L._decFollow('breakout', { pid: sub.id }, 0); L._decFollowDay(S.day);
  const fe = L.eventsOpen().filter(e => e.type === 'dec').map(e => e.data.kind); ok(['blame', 'vetpush', 'compete', 'breakout'].every(k => fe.includes(k)), '후속 사건 생성 ' + fe);
  for (const e of L.eventsOpen().filter(e => e.type === 'dec')) { const r = L.resolveEvent(e.id, e.choices[0].k); ok(r.ok && r.msg && !/undefined/.test(r.msg), `후속 ${e.data.kind}: ${r.msg}`); } }
// 5) 한 시즌: 결정이 고르게 나오고(종류·빈도), 장부 합계가 계산되고, 새 시즌에 초기화
{ const L = League.create(base, 'Bears', 9), S = L.S; L.faAdvance(75); L.closeFA(); const kinds = {}; let guard = 0;
  while (S.phase === 'regular' || S.phase === 'preseason') { L.advance(1, false); for (const e of L.eventsOpen()) if (e.type === 'dec') { kinds[e.data.kind] = (kinds[e.data.kind] || 0) + 1; L.resolveEvent(e.id, e.rec || e.def); } if (guard++ > 400) break; }
  const tot = Object.values(kinds).reduce((a, b) => a + b, 0); ok(tot >= 20 && tot <= 70 && Object.keys(kinds).length >= 5, '한 시즌 결정 ' + JSON.stringify(kinds));
  const led = L.decLedger(); ok(led.list.length > 0 && typeof led.total === 'number' && !isNaN(led.total), '장부 ' + led.total);
  ok(!L.integrity().errors.length, '시즌 뒤 정합성');
  const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); }
  L.startOffseason(); L.resignAll(); L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); L.startNewSeason();
  ok(S.dec.mods.length === 0 && (S.dec.follow || []).length === 0, '새 시즌에 결정 보정·후속 초기화'); }
console.log('decide tests ok', n);
