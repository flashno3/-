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
  ok(Object.values(S.players).filter(p => !p.foreign).every(p => p.mil && ['done', 'ag', 'serving', 'pending', 'apply', 'sangmu27', 'unknown'].includes(p.mil.st)), '모든 국내 선수 상태 값');
  ok(Object.values(S.players).filter(p => p.foreign).every(p => !L.milStatus(p)), '외국인 제외');
  const ig = L.integrity(); ok(!ig.errors.length, '정합성 ' + JSON.stringify(ig.errors.slice(0, 2)));
  ok(S.milInit.moved.length >= 10, '12월·11월 입대자 이동 ' + S.milInit.moved.length);
  ok(Math.abs(L.milAllowance('Tigers') - (S.mil || []).map(id => S.players[id]).filter(p => p.milTeam === 'Tigers').reduce((a, p) => a + Math.min(0.12, 0.25 * p.contract.salary), 0)) < 0.011, '군보류수당 = 연봉 25%·최대 0.12억'); }
// 2) 2027 상무 1차 합격자 3월 29일 입대(정규시즌 시작 때), 전역 처리
{ const L = League.create(base, 'Eagles', 4), S = L.S; L.faAdvance(75); L.closeFA(); const km = byKo(S, '권민규', 'Eagles')[0];
  L.advance(2, false);
  ok(km.team === 'MIL' && km.milFrom === '2027.03' && km.milReturn === 2027 * 12 + 2 + 18 && km.mil.st === 'serving', '권민규 2027년 3월 상무 입대 → 2028년 9월 전역');
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
  const ai = Object.keys(S.teams).find(t => t !== U), cs = L.players(ai).filter(x => !x.foreign && !L.isInj(x)).slice(0, 3); for (const c of cs) { c.mil = { st: 'pending', src: 'test' }; c.age = 27; } L._milOffseason(); ok(cs.every(c => c.mil.st === 'apply' && c.mil.last), 'AI: 27세 미필은 반드시 상무 지원(마지막 해)');
  const young = L.players(ai).filter(x => !x.foreign && !L.isInj(x) && !cs.includes(x)).slice(0, 2); for (const y of young) { y.mil = { st: 'apply', y: S.year, src: 'test' }; y.age = 23; }
  const apps0 = Object.values(S.players).filter(x => x.mil && x.mil.st === 'apply' && x.team in S.teams); S.year += 1; const sel = L._milSelect(); S.year -= 1;
  ok(sel && sel.win <= sel.to && sel.to <= 40 && sel.apps === apps0.length, '연간 선발 인원 안에서 선발 ' + JSON.stringify(sel));
  const winners = apps0.filter(x => x.team === 'MIL' && x.milKind === 'sangmu'), losers = apps0.filter(x => !winners.includes(x)); ok(winners.length === sel.win, '합격 인원');
  if (winners.length && losers.length) ok(Math.min(...winners.map(x => L.war(x))) >= Math.max(...losers.map(x => L.war(x))) - 1e-9, '최근 WAR 순 선발');
  ok(losers.every(x => (x.mil.last ? x.team === 'MIL' && x.milKind === 'army' : x.mil.st === 'pending')), '탈락: 마지막 해는 현역, 아니면 미필로');
  ok(winners.every(x => x.milFrom === `${S.year}.12` || x.milFrom === `${S.year + 1}.03`), '합격자 12월·3월 말 회차');
}
// 6) 검색 정정(military_fix_2026.csv): 목록에서 미필로 잘못 들어간 군필 5명, 나이 추정이 틀렸던 베테랑(드래프트 이력으로 재추정)
{ const L = League.create(base, 'Eagles', 3), S = L.S;
  for (const [ko, t] of [['허인서', 'Eagles'], ['이주헌', 'Twins'], ['김녹원', 'Dinos'], ['김진수', 'Twins'], ['김태현', 'Dinos']]) { const p = byKo(S, ko, t)[0]; ok(p && p.mil.st === 'done' && p.mil.src === 'fix' && p.mil.was === 'pending', `${ko} 군필 정정`); }
  ok(byKo(S, '황동하', 'Tigers')[0].mil.st === 'pending' && byKo(S, '김유성', 'Bears')[0].mil.st === 'pending', '검색으로 미필 확인된 선수는 그대로');
  for (const [ko, t, a] of [['박종훈', 'Landers', 36], ['한현희', 'Giants', 34], ['이준영', 'Tigers', 35]]) { const p = byKo(S, ko, t)[0]; ok(p && p.age === a && p.dh && p.peak === undefined, `${ko} 나이 ${p && p.age}(드래프트 이력 재추정)·유망주 정점 없음`); } }
console.log('military tests ok', n);
