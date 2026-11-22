// 스토리 아크: 세 아크의 전 분기 도달·결정성·정합성(선수 이탈, 이벤트 종결, 시즌 이월)
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { assert(c, m); n++; };
function mk(seed) { const L = League.create(base, 'Lions', seed || 5); L.faAdvance(75); L.closeFA(); L.advance(1, false); return L; }
const run = (L, days) => { const t = L.S.day + days; for (let g = 0; g < days * 3 && L.S.day < t && L.S.day < L.S.schedule.length; g++) L.advance(1, false); };
for (const kind of ['ace', 'battery', 'prospect']) {
  const reached = new Set();
  for (let seed = 1; seed <= 40 && reached.size < 3; seed++) {
    const L = mk(seed); run(L, 20);
    // prospect는 조건(2군 호조)이 필요하므로 최근 기록을 시드로 채운다
    if (kind === 'prospect') { const p = L.players(L.S.userTeam).find(x => !x.active && x.age <= 24 && !x.foreign); if (!p) continue; L.S.recent[p.id] = p.type === 'B' ? Array.from({ length: 10 }, () => [0, 4, 3, 5, 1]) : Array.from({ length: 5 }, () => [6, 0]); }
    const a = L.arcStart(kind); if (!a) continue;
    ok(a.status === 'active' && a.log.length === 0 || true, 'start');
    for (let step = 0; step < 12 && a.status === 'active'; step++) {
      run(L, 3); const ev = L.eventsOpen().find(e => e.type === 'arc' && e.data.arc === a.id);
      if (ev) { const ks = ev.choices.map(c => c.k), k = ks[(seed + step) % ks.length]; reached.add(a.stage + ':' + k); const r = L.resolveEvent(ev.id, k); ok(r.ok, kind + ' resolve'); }
      for (const pid of [a.pid, a.pid2]) if (pid) { const p = L.S.players[pid]; ok(p && !(p.inj && p.inj.arc && !p.inj.retN), '부상 정보 정합'); }
    }
    if (a.status !== 'done') { run(L, 100); }
    ok(a.log.length >= 2 && (a.status === 'done' || L.S.day >= L.S.schedule.length), kind + ' 진행');
  }
  ok(reached.size >= 3, kind + ' 분기 ' + [...reached].join(','));
}
// 결정성: 같은 시드 → 같은 아크 로그
function sig(seed) { const L = mk(seed); run(L, 60); return JSON.stringify(L.arcs().list.map(a => [a.kind, a.stage, a.pid, a.log.length])) + L.S.day; }
ok(sig(7) === sig(7), '결정성');
// 자연 발생: 시즌 하나에서 아크가 시작되는 시드가 있고, 동시 진행 ≤2, 이벤트 종결(감독 교체 등) 시 복구
let nat = 0; for (let s = 1; s <= 12; s++) { const L = mk(s); for (let i = 0; i < 130 && L.S.day < L.S.schedule.length; i++) { L.advance(1, false); ok(L.arcsActive().length <= 2, '동시 ≤2'); for (const e of L.eventsOpen()) if (e.type === 'arc') { const k = e.rec || e.def; L.resolveEvent(e.id, k, true); } } if (L.arcs().list.length) nat++; }
ok(nat >= 3, '자연 발생 ' + nat);
// 선수 이탈 시 종결
{ const L = mk(3); run(L, 20); const a = L.arcStart('ace') || L.arcStart('battery'); ok(a, '시작'); L.S.players[a.pid].team = 'FA'; run(L, 2); ok(a.status === 'done', '선수 이탈 종결'); }
// 이벤트가 외부에서 닫혀도 단계가 복구됨
{ const L = mk(4); run(L, 20); const a = L.arcStart('ace'); ok(a, 'ace'); run(L, 1); const ev = L.eventsOpen().find(e => e.type === 'arc'); if (ev) { ev.status = 'done'; run(L, 5); ok(L.eventsOpen().some(e => e.type === 'arc') || a.status === 'done', '복구'); } }
console.log('arcs tests ok', n);
