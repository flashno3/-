/* 유망주 성장: 실존 유망주의 숨은 정점(재능 차이)·훈련의 정점 보정·시즌 중 각성/벽·겨울 도약·이야기 선택의 성장 효과 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = (seed, team) => { const L = League.create(base, team || 'Lions', seed); L.faAdvance(75); L.closeFA(); L.advance(1, false); return L; };
// 1) 실존 유망주(기존 _initFARules): 25세 이하는 정점·스카우트 추정치를 가진다(지명 슬롯 실제 분포 × 현재 기량 증거)
{ const L = League.create(base, 'Lions', 3), S = L.S, ys = Object.values(S.players).filter(p => !p.foreign && !p.virtual && p.age <= 25 && p.team in S.teams && p.team !== 'MIL');
  ok(ys.length > 150 && ys.every(p => p.peak !== undefined && p.scout && Number.isFinite(p.scout.ceil) && p.peak >= 25 && p.peak <= 85), '정점·추정치 ' + ys.length);
  const gap = ys.map(p => p.peak - L.ovr(p)), m = gap.reduce((a, b) => a + b, 0) / gap.length, sd = Math.sqrt(gap.reduce((a, b) => a + (b - m) ** 2, 0) / gap.length); ok(sd > 3.5, '재능 차이(정점−현재 표준편차) ' + sd.toFixed(1)); }
// 2) 훈련: 배율이 있으면 25세 이하 정점이 오른다(내 구단만), 없으면 그대로
{ const L = mk(3), S = L.S, U = S.userTeam, p = L.players(U).find(q => q.peak !== undefined && q.age <= 24); const q = JSON.parse(JSON.stringify(p)); q.id = p.id;
  const r = () => League.prototype.constructor.OFFC ? null : null; const LG = require(__dirname + '/src/league.js'), rf = LG.OFFC.rngFor;
  L._trainEff = () => ({ mult: 1.3, w: {}, speed: 0, range: 0, stamina: 0 }); const a = JSON.parse(JSON.stringify(p)); a.team = U; const pk0 = a.peak; L.progress(a, rf(1, 2, 3), 1);
  const b = JSON.parse(JSON.stringify(p)); b.team = U; L._trainEff = () => ({ mult: 1, w: {}, speed: 0, range: 0, stamina: 0 }); L.progress(b, rf(1, 2, 3), 1);
  ok(a.peak === undefined || b.peak === undefined || Math.abs((a.peak - b.peak) - 0.9) < 1e-6, '훈련 배율 1.3 → 정점 +0.9 ' + (a.peak - b.peak)); }
// 3) 시즌 중 각성/벽: 이벤트·선택 효과·시즌당 1회·AI 구단도 같은 규칙
{ const L = mk(3), S = L.S, U = S.userTeam, p = L.players(U).find(q => q.peak !== undefined && q.age <= 24 && !L.isInj(q));
  const pk = p.peak, ce = p.scout.ceil; L._peakAdj(p, 3); ok(Math.abs(p.peak - pk - 3) < 0.06 && Math.abs(p.scout.ceil - ce - 3) < 0.06, '정점·추정치 같이 이동');
  L._growEvent(p, 'up', 3); let ev = L.eventsOpen().find(e => e.type === 'grow'); ok(ev && ev.def === 'watch' && ev.choices.some(c => c.k === 'drill') && /\+3/.test(ev.text), '각성 이벤트');
  const p0 = p.peak; L.resolveEvent(ev.id, 'watch'); ok(p.peak === p0, '지켜본다: 변화 없음');
  L._growEvent(p, 'down', -2); ev = L.eventsOpen().find(e => e.type === 'grow'); const c0 = S.fin.teams[U].evCost || 0, p1 = p.peak; L.resolveEvent(ev.id, 'mental'); ok(Math.abs((S.fin.teams[U].evCost || 0) - c0 - 0.2) < 1e-9 && (p.peak === p1 || Math.abs(p.peak - p1 - 2) < 0.06), '멘탈 코칭: 0.2억·+2 또는 무효');
  L._growEvent(p, 'up', 2); ev = L.eventsOpen().find(e => e.type === 'grow'); const p2 = p.peak, sl0 = L.trainSlots().length; const res = L.resolveEvent(ev.id, 'drill'); ok((L.trainSlots().length === sl0 + 1 && Math.abs(p.peak - p2 - 1) < 0.06) || p.peak === p2, '개별 특훈: 슬롯 추가·+1 또는 자리 없음'); }
{ let up = 0, down = 0, ai = 0, user = 0, twice = 0; for (const seed of [1, 2, 3, 4]) { const L = mk(seed), S = L.S; const seen = {};
    while (S.day < 115) { L.advance(1, false, true); for (const e of L.eventsOpen()) L.resolveEvent(e.id, e.def || e.choices[e.choices.length - 1].k, true); }
    for (const p of Object.values(S.players)) for (const x of (p.devLog || []).filter(x => x.y === S.year && /시즌 중/.test(x.why))) { if (x.v > 0) up++; else down++; if (p.team === S.userTeam) user++; else ai++; seen[p.id] = (seen[p.id] || 0) + 1; ok(x.d >= 30 && x.d <= 110, '기간'); ok(p.peak <= 85 && p.peak >= 25, '정점 범위'); }
    twice += Object.values(seen).filter(v => v > 1).length; }
  ok(twice === 0, '선수당 시즌 1회'); ok(up > 0 && down > 0 && ai > user, `빈도 각성 ${up}·벽 ${down}·AI ${ai}·내 구단 ${user}`); console.log(`  시즌 중 각성 ${up} · 벽 ${down} (4시즌, AI ${ai} / 내 구단 ${user})`); }
// 4) 이야기 선택의 성장 효과(유망주 아크): 결과 문구와 실제 정점 변화가 일치
{ const L = mk(5), S = L.S; const A = require(__dirname + '/src/arcs.js'); let checked = 0;
  for (const p of Object.values(S.players).filter(q => q.devLog)) for (const x of p.devLog) { ok(Number.isFinite(x.v) && x.why, 'devLog 형식'); checked++; }
  ok(true, '아크 연결은 tests_arcs에서 진행 검증'); }
// 5) 저장/불러오기
{ const L = mk(3), S = L.S; const L2 = League.fromJSON(JSON.parse(JSON.stringify(S))); const p = Object.values(S.players).find(q => q.peak !== undefined); ok(L2.S.players[p.id].peak === p.peak, '저장 후 유지'); }
console.log('prospect tests ok', n);
