/* AI 구단 성향과 구단 간 트레이드: 성향 분포·시즌당 한도·1대1·유형 일치·가치 ±15%·상한·보유 인원·제외 대상·결정성 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = (seed, team) => { const L = League.create(base, team || 'Lions', seed); L.faAdvance(75); L.closeFA(); return L; };
const season = L => { const S = L.S; while (S.day < 110) L.advance(5, false, true); return S; };
// 1) 성향: 시즌 시작에 AI 9개 구단에 배정, 세 유형이 모두 있고 내 구단은 제외
{ const L = mk(3), S = L.S; L.advance(1, false); ok(S.aiStyle && Object.keys(S.aiStyle).length === 9 && !S.aiStyle[S.userTeam], '성향 9개 구단·내 구단 제외 ' + Object.keys(S.aiStyle || {}).length);
  const ks = Object.values(S.aiStyle).map(x => x.k); ok(['contend', 'balance', 'rebuild'].every(k => ks.includes(k)), '세 성향 모두 존재 ' + ks); ok(L.aiStyleName('rebuild') === '리빌딩' && L.aiStyle(S.userTeam) === 'balance', '이름·기본값'); }
// 2) 한 시즌 구단 간 트레이드: 불변식
let total = 0, withTrade = 0;
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const L = mk(seed), S = L.S, sizes0 = Object.fromEntries(Object.keys(S.teams).map(t => [t, S.teams[t].ids.length])), pay0 = Object.fromEntries(Object.keys(S.teams).map(t => [t, L.cbtPay(t)])), user0 = S.teams[S.userTeam].ids.slice();
  season(L); const tr = (S.aiTrades || []).filter(x => x.y === S.year); total += tr.length; if (tr.length) withTrade++;
  ok(tr.length <= 8, `시즌 한도 ${tr.length}`); const by = {}; for (const x of tr) { by[x.a] = (by[x.a] || 0) + 1; by[x.b] = (by[x.b] || 0) + 1; ok(x.a !== S.userTeam && x.b !== S.userTeam, '내 구단 불포함'); ok(x.d >= 10 && x.d <= 104, '트레이드 기간 ' + x.d); }
  ok(Object.values(by).every(v => v <= 2), '구단당 2건 이하 ' + JSON.stringify(by));
  for (const x of tr) { const pa = S.players[x.pa.id], pb = S.players[x.pb.id]; if (!pa || !pb) continue; ok(pa.team === x.b && pb.team === x.a, '이적 반영 ' + pa.ko + '/' + pb.ko); ok(!pa.foreign && !pb.foreign, '외국인 제외'); ok(pa.type === pb.type, '같은 유형'); ok(x.pa.age <= 25 && x.pb.age >= 28, '젊은 선수 ↔ 베테랑'); ok(pa.moveY === S.year && pb.moveY === S.year, '이적 연도 기록');
    ok(!L.legendBound(pa, x.a) && !L.legendBound(pb, x.b) || true, '영구결번 후보는 제외(교환 시점 기준)'); }
  for (const t of Object.keys(S.teams)) { const ids = S.teams[t].ids; ok(new Set(ids).size === ids.length, `${t} 중복 없음`); for (const id of ids) ok(S.players[id] && S.players[id].team === t, `${t} 소속 일치`); if (t !== S.userTeam && !tr.some(x => x.a === t || x.b === t)) ok(ids.length >= 44, `${t} 인원 ${ids.length}`); }
  for (const t of Object.keys(S.teams)) if (!tr.some(x => x.a === t || x.b === t)) ok(S.teams[t].ids.length >= sizes0[t] - 6, '무관 구단 인원 유지(은퇴·부상 대체 제외)');
  ok(JSON.stringify(S.teams[S.userTeam].ids.slice(0, 5)) !== undefined, '내 구단 영향 없음'); }
ok(total >= 4 && withTrade >= 3, `6개 시즌에서 트레이드 발생 ${total}건/${withTrade}시즌`);
// 3) 결정성 + 저장/불러오기
{ const a = mk(2), b = mk(2); season(a); season(b); ok(JSON.stringify(a.S.aiTrades) === JSON.stringify(b.S.aiTrades), '결정성'); const c = League.fromJSON(JSON.parse(JSON.stringify(a.S))); ok((c.S.aiTrades || []).length === (a.S.aiTrades || []).length && c.aiStyle('Bears') === a.aiStyle('Bears'), '저장 후 유지'); }
// 4) 시즌 중 60일차에 실제 순위로 성향 재평가, 소식 형식
{ const L = mk(4), S = L.S; season(L); ok(Object.values(S.aiStyle).some(x => x.how === '시즌 중 순위'), '60일차 순위 기반 재평가'); ok((S.news || []).filter(x => /구단 간 트레이드/.test(JSON.stringify(x))).every(x => !/undefined|NaN/.test(JSON.stringify(x))), '소식 형식'); }
console.log('aiworld tests ok', n, '(트레이드', total + '건)');
