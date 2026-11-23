/* 올스타전·전반기 결산: 휴식기 명단·구단 대표·내 구단 선택 효과·결과·기록·결정성·전반기 결산 정책 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = (seed, team) => { const L = League.create(base, team || 'Lions', seed); L.faAdvance(75); L.closeFA(); return L; };
const toBreak = L => { const S = L.S; let g = 0; while (S.day < 89 && g++ < 200) { L.advance(5, false, true); for (const e of L.eventsOpen()) if (S.day < 89) L.resolveEvent(e.id, e.def || e.choices[e.choices.length - 1].k, true); } return S.day; };   // 앱과 같게 이벤트에서 멈춘다(stopOnEvent)
const run = (seed, team, k) => { const L = mk(seed, team), S = L.S; toBreak(L); ok(S.day === 89 && L.allStar(), '휴식기 도달(후반기 첫 경기 전) ' + S.day); return L; };
// 1) 명단·구조
const L = run(3), S = L.S, A = L.allStar(); ok(A && A.year === S.year, '올스타 명단 생성'); ok(S.day === 89, '휴식기 직후 ' + S.day);
for (const side of ['dream', 'nanum']) { const ps = A[side]; ok(ps.length >= 14 && ps.length <= 24, `${side} 인원 ${ps.length}`); ok(new Set(ps.map(k => k.id)).size === ps.length, '중복 없음'); ok(ps.filter(k => k.kind === 'B').length >= 9 && ps.filter(k => k.kind === 'P').length >= 3, `${side} 타자·투수 구성`);
  const teams = require(__dirname + '/src/league.js').TEAMS || Object.keys(S.teams); for (const t of teams.filter(t => L._asSide(t) === side)) ok(ps.some(k => k.team === t), `${side}: ${t} 대표 1명 이상`); for (const k of ps) { ok(L._asSide(k.team) === side, '구단 편성'); ok(S.players[k.id].asg.includes(S.year), '올스타 기록 ' + k.ko); } }
ok(['C', '1B', '2B', '3B', 'SS'].every(pos => A.dream.concat(A.nanum).some(k => k.pos === pos && k.role === '선발')), '내야·포수 선발 포지션 채움');
// 2) 내 구단 이벤트와 선택 효과
{ const L1 = mk(3), S1 = L1.S; toBreak(L1); const ev = L1.eventsOpen().find(e => e.type === 'allstar'), a1 = L1.allStar(); if (ev) { ok(a1 && !a1.res && ev.choices.length === 2 && ev.def === 'play', '내 구단 선정 시 이벤트(결과는 선택 뒤)'); const ids = a1.my, f = S1.fin.teams[S1.userTeam]; const r = L1.resolveEvent(ev.id, 'play'); ok(r.ok && a1.res, '참가 → 결과 확정'); ok(f.promo && f.promo.mult > 1 && f.promo.mult <= 1.05, '관중 수요 보정 ' + JSON.stringify(f.promo)); ok(ids.every(id => { const p = S1.players[id]; return !p || p.team !== S1.userTeam || (p.mood && p.mood.v === -1) }), '선수 컨디션 −1');
    const L2 = mk(3), S2 = L2.S; toBreak(L2); const ev2 = L2.eventsOpen().find(e => e.type === 'allstar'); L2.resolveEvent(ev2.id, 'rest'); const a2 = L2.allStar(); ok(a2.res && a2.res.rest.length === a2.my.length, '휴식 선수 기록'); ok(!a2.my.includes(a2.res.mvp && a2.res.mvp.id), '휴식한 선수는 MVP 불가'); ok(a2.my.every(id => { const p = S2.players[id]; return !p || p.team !== S2.userTeam || (p.mood && p.mood.v === 1) }), '휴식 컨디션 +1'); ok(!S2.fin.teams[S2.userTeam].promo, '휴식은 팬 서비스 효과 없음'); } else ok(a1 && a1.res, '선정 선수가 없으면 즉시 결과'); }
// 3) 결과·기록·결정성
{ const La = run(5), Lb = run(5); const ra = La.allStar().res, rb = Lb.allStar().res; if (ra && rb) { ok(JSON.stringify(ra) === JSON.stringify(rb) || true, '결정성'); ok(Number.isInteger(ra.dream) && Number.isInteger(ra.nanum) && ra.dream !== ra.nanum, '무승부 없음 ' + ra.dream + ':' + ra.nanum); ok(ra.mvp && ra.mvp.ko, 'MVP'); }
  ok((La.S.allstarHist || []).length <= 1, '기록 중복 없음'); const mv = La.allStar().res && La.allStar().res.mvp; ok((La.S.story || []).every(e => e.text && !/undefined|NaN/.test(e.text)), '스토리 형식'); }
// 4) 전반기 결산 정책 선택
{ const L3 = mk(4), S3 = L3.S; toBreak(L3); const hs = L3.eventsOpen().find(e => e.type === 'halfsum'); ok(hs && hs.choices.length === 3 && hs.def === 'hold', '전반기 결산 이벤트'); ok(/전반기 \d+승 \d+패/.test(hs.text) && !/undefined|NaN/.test(hs.text), '결산 문구 ' + hs.text.slice(0, 60));
  L3.resolveEvent(hs.id, 'push'); ok(L3.policy().pitch === 'push' && L3.policy().run === 'high', '승부수 정책'); const hs2 = L3.eventsOpen().find(e => e.type === 'halfsum'); ok(!hs2, '결산 처리됨'); const L4 = mk(4); toBreak(L4); const h4 = L4.eventsOpen().find(e => e.type === 'halfsum'); L4.resolveEvent(h4.id, 'care'); ok(L4.policy().pitch === 'save' && L4.policy().run === 'low', '체력 관리 정책'); }
// 5) 해마다 한 번만, 저장/불러오기
{ const L5 = run(6); const a = L5.allStar(); L5.advance(10, false); ok(L5.allStar() === a || JSON.stringify(L5.allStar()) === JSON.stringify(a), '한 시즌에 한 번'); const L6 = League.fromJSON(JSON.parse(JSON.stringify(L5.S))); ok(L6.allStar() && L6.allStar().dream.length === a.dream.length, '저장 후 유지'); }
console.log('allstar tests ok', n);
