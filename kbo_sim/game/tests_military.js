/* 병역: 사용자 제공 목록(2026년 11월 말) 반영·12월 입대자 복무 명단·2027 상무 합격자 6월 입대·오프시즌 입대 결정·전역·군보류수당·신인 미필 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const byKo = (S, ko, t) => Object.values(S.players).filter(p => p.ko === ko && (!t || p.team === t || p.milTeam === t));
// 1) 시작 상태
{ const L = League.create(base, 'Eagles', 3), S = L.S;
  const jh = byKo(S, '정해영', 'Tigers')[0]; ok(jh && jh.team === 'MIL' && jh.milTeam === 'Tigers' && jh.milFrom === '2026.12' && jh.milReturn === 2028 * 12 + 5 && !S.teams.Tigers.ids.includes(jh.id), '정해영 12월 상무 입대 → 2028년 6월 전역 예정');
  ok(byKo(S, '노시환', 'Eagles')[0].mil.st === 'ag' && byKo(S, '김서현', 'Eagles')[0].mil.st === 'pending' && byKo(S, '권민규', 'Eagles')[0].mil.st === 'sangmu27', '목록 상태');
  ok(byKo(S, '황동재', 'Lions')[0].team === 'MIL', '게임 데이터 상무 복무자 유지(목록 상충)');
  ok((S.mil || []).every(id => S.players[id].team === 'MIL' && S.players[id].milTeam in S.teams && S.players[id].milReturn > 2026 * 12), '복무 명단 정합');
  ok(Object.values(S.players).filter(p => !p.foreign).every(p => p.mil && ['done', 'ag', 'serving', 'pending', 'sangmu27', 'unknown'].includes(p.mil.st)), '모든 국내 선수 상태 값');
  ok(Object.values(S.players).filter(p => p.foreign).every(p => !L.milStatus(p)), '외국인 제외');
  const ig = L.integrity(); ok(!ig.errors.length, '정합성 ' + JSON.stringify(ig.errors.slice(0, 2)));
  ok(S.milInit.moved.length >= 10, '12월·11월 입대자 이동 ' + S.milInit.moved.length);
  ok(Math.abs(L.milAllowance('Tigers') - (S.mil || []).map(id => S.players[id]).filter(p => p.milTeam === 'Tigers').reduce((a, p) => a + Math.min(0.12, 0.25 * p.contract.salary), 0)) < 0.011, '군보류수당 = 연봉 25%·최대 0.12억'); }
// 2) 2027 상무 1차 합격자 6월 입대, 전역 처리
{ const L = League.create(base, 'Eagles', 4), S = L.S; L.faAdvance(75); L.closeFA(); const km = byKo(S, '권민규', 'Eagles')[0];
  while (S.day < S.schedule.length && L.dateOf(S.day).getUTCMonth() < 5) L.advance(1, false); L.advance(2, false);
  ok(km.team === 'MIL' && km.milReturn === 2027 * 12 + 5 + 18 && km.mil.st === 'serving', '권민규 2027년 6월 상무 입대 → 2028년 12월 전역');
  const back = L.returnMilitary(2030 * 12); ok(back.length > 0 && back.every(p => p.mil.st === 'done' && p.team in S.teams && !p.milKind), '전역하면 병역 필'); }
// 3) 내 구단 입대 결정: 상한 나이 넘은 미필은 상무 잠금·현역만
{ const L = League.create(base, 'Eagles', 5), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(1, false); const U = S.userTeam;
  const p = L.players(U).find(q => !q.foreign && q.mil.st === 'pending'); p.age = 28; const q = L.players(U).find(x => !x.foreign && x.mil.st === 'pending' && x !== p) || L.players(U).find(x => !x.foreign && x.mil.st === 'done'); q.mil = { st: 'pending', src: 'test' }; q.age = 25;
  L._milOffseason(); const evs = L.eventsOpen().filter(e => e.type === 'military'); const e1 = evs.find(e => e.data.pid === p.id), e2 = evs.find(e => e.data.pid === q.id);
  ok(e1 && e1.def === 'army' && e1.choices.find(c => c.k === 'sangmu').req && e1.choices.find(c => c.k === 'wait').req, '만 27세 초과: 상무·미루기 잠금');
  const r0 = L.resolveEvent(e1.id, 'sangmu'); ok(!r0.ok && p.team === U, '잠긴 선택은 거부'); L.resolveEvent(e1.id, 'army'); ok(p.team === 'MIL' && p.milKind === 'army' && L.playShare(p) === 0.1, '현역: 출전 비중 0.1');
  ok(e2 && e2.def === 'wait', '25세: 기본은 미루기'); L.resolveEvent(e2.id, 'wait'); ok(q.team === U && q.mil.st === 'pending', '미루기');
  const f0 = L.finPay(U); ok(L.milAllowance(U) > 0 && f0 >= L.milAllowance(U), '군보류수당이 선수단 보수에 포함'); }
// 4) AI 구단: 오프시즌 입대 — 나이 상한 넘은 미필은 반드시, 기록 정합
{ const L = League.create(base, 'Eagles', 6), S = L.S; L.faAdvance(75); L.closeFA(); const ai = Object.keys(S.teams).find(t => t !== S.userTeam); const old = L.players(ai).find(x => !x.foreign && !L.isInj(x)); old.mil = { st: 'pending', src: 'test' }; old.age = 29;
  L._milOffseason(); ok(old.team === 'MIL' && old.milKind === 'army', 'AI: 나이 상한 넘은 미필은 현역 입대'); ok(!L.integrity().errors.length, '정합성 유지'); }
// 5) 신인은 미필로 시작
{ const L = League.create(base, 'Eagles', 7); const LG = require(__dirname + '/src/league.js'); const r = LG.OFFC.rngFor(1, 2, 3); const rk = L.makeRookie(r, 'B'); ok(rk.mil && rk.mil.st === 'pending', '신인 미필'); }
// 6) 현역 복귀 감각 저하 · AI 27세 100% 입대 · 목록 확인분(상충 해소)
{ const L = League.create(base, 'Eagles', 8), S = L.S; L.faAdvance(75); L.closeFA();
  for (const [ko, t, fr] of [['박명근', 'Twins', '2026.04'], ['여동건', 'Bears', '2025.12'], ['황동재', 'Lions', '2025.12']]) { const q = byKo(S, ko, t)[0]; ok(q.team === 'MIL' && q.milFrom === fr && q.mil.st === 'serving', `${ko} 상무 복무(${fr})`); }
  ok(byKo(S, '김휘집', 'Dinos')[0].mil.st === 'pending', '김휘집 미필');
  const U = S.userTeam, p = L.players(U).find(q => !q.foreign && q.mil.st === 'pending'); p.age = 28; L._milEnlist(p, S.year * 12 + 11, 'army'); const o0 = L.ovr(p); L.returnMilitary(2040 * 12); ok(p.team === U && p.mil.st === 'done' && L.ovr(p) < o0, '현역 복귀: 능력 감소 ' + o0 + '→' + L.ovr(p));
  const ai = Object.keys(S.teams).find(t => t !== U), cs = L.players(ai).filter(x => !x.foreign && !L.isInj(x)).slice(0, 3); for (const c of cs) { c.mil = { st: 'pending', src: 'test' }; c.age = 27; } L._milOffseason(); ok(cs.every(c => c.team === 'MIL'), 'AI: 27세 미필은 반드시 입대');
}
console.log('military tests ok', n);
