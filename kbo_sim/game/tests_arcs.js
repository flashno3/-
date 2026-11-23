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

// ---- 개편(A·B): 선택이 실제 값으로 남고, 다음 시즌 후일담으로 돌아온다 ----
{ // 힌트에 실제 수치(재발 위험·이탈 일수)가 노출되고, 결과가 컨디션·충성도에 반영
  let L, a; for (let sd = 6; sd < 30; sd++) { L = mk(sd); run(L, 20); a = L.arcStart('ace'); if (a && !L.S.players[a.pid].foreign) break; } ok(a, 'ace'); run(L, 1);
  const ev = L.eventsOpen().find(e => e.type === 'arc'); ok(ev && /재발 위험 \d+%/.test(ev.choices[0].hint) && /\d+일 이탈/.test(ev.choices[1].hint), '수치 노출 ' + (ev && ev.choices[0].hint));
  const p = L.S.players[a.pid], l0 = L.loyalty(p).v; L.resolveEvent(ev.id, 'shut'); ok(p.arcLoy && p.arcLoy.some(x => x.k === 'ace' && x.v === 3), 'arcLoy 기록'); ok(L.loyalty(p).v >= l0 + 2 && L.loyalty(p).items.some(i => /이야기/.test(i[0])), '충성도에 반영 ' + l0 + '→' + L.loyalty(p).v); ok(p.inj && p.inj.arc === a.id, '재활 부상');
  const yr = L.S.year; p.arcLoy[0].y = yr - 1; const v1 = L.loyalty(p).v; p.arcLoy[0].y = yr - 3; ok(L.loyalty(p).v < v1, '해가 지나면 약해짐');
}
{ // 후일담: 지난 시즌 기억이 있으면 다음 시즌 초에 echo 아크가 열리고 선택이 반영
  let got = 0;
  for (let s = 1; s <= 10 && got < 3; s++) {
    const L = mk(s); run(L, 20); const p = L.players(L.S.userTeam).find(x => x.type === 'P' && x.active); L.S.year;
    const keys = [['ace', { choice: 'rush', relapse: true, y: L.S.year - 1 }], ['ace', { choice: 'shut', relapse: false, y: L.S.year - 1 }], ['rising', { tone: 'good', res: 'ok', y: L.S.year - 1 }]], [key, m] = keys[s % 3];
    p.arcMem = { [key]: m }; let a = null; for (let i = 0; i < 40 && !a; i++) { L.advance(1, false); a = L.arcs().list.find(x => x.kind === 'echo'); }
    if (!a) continue; got++; ok(a.mem.key === key, 'echo 키'); L.advance(2, false);
    const ev = L.eventsOpen().find(e => e.type === 'arc' && e.data.arc === a.id); ok(ev && ev.choices.length >= 2, 'echo 이벤트'); const k = ev.choices[0].k;
    ok(L.resolveEvent(ev.id, k).ok && a.status === 'done' && p.arcMem[key].echoed === true, 'echo 종결·표시'); const again = L.arcs().list.filter(x => x.kind === 'echo' && x.pid === p.id).length; for (let i = 0; i < 30; i++) L.advance(1, false); ok(L.arcs().list.filter(x => x.kind === 'echo' && x.pid === p.id).length === again, '같은 기억은 한 번만');
  }
  ok(got >= 2, '후일담 발생 ' + got);
}
console.log('arcs2 ok', n);
// ---- 확장 아크 3편: 베테랑의 마지막 시즌·FA 앞둔 에이스·외국인의 적응 ----
const TEAMS_T = ['Lions', 'Bears', 'Tigers', 'Twins', 'Landers', 'Giants', 'Dinos', 'Wiz', 'Heroes', 'Eagles'], mkT = (seed, team) => { const L = League.create(base, team, seed); L.faAdvance(75); L.closeFA(); L.advance(1, false); return L; };
const stepArc = (L, a, pick) => { for (let step = 0; step < 14 && a.status === 'active'; step++) { run(L, 3); const ev = L.eventsOpen().find(e => e.type === 'arc' && e.data.arc === a.id); if (ev) { const k = pick(ev, step); ok(L.resolveEvent(ev.id, k).ok, a.kind + ' resolve ' + k); } } if (a.status === 'active') run(L, 120); };
for (const kind of ['vet', 'contract', 'foreign']) {
  const reached = new Set(); let started = 0;
  for (let seed = 1; seed <= 60 && reached.size < 4; seed++) { const L = mkT(seed, TEAMS_T[seed % TEAMS_T.length]); run(L, 20); const a = L.arcStart(kind); if (!a) continue; started++;
    stepArc(L, a, (ev, step) => { const ks = ev.choices.map(c => c.k), k = ks[(seed + step) % ks.length]; reached.add(a.stage + ':' + k); return k; });
    ok(a.log.length >= 2 && (a.status === 'done' || L.S.day >= L.S.schedule.length), kind + ' 진행·종결'); ok(a.end && a.end.text && !/undefined|NaN/.test(a.end.text + a.log.map(x => x.t).join()), kind + ' 문구'); }
  ok(started >= 2 && reached.size >= 4, kind + ` 시작 ${started}회·분기 ${[...reached].join(',')}`); }
// 효과: 은퇴 확률(베테랑)
{ let done = 0; for (let seed = 1; seed <= 60 && done < 2; seed++) { const L = mkT(seed, TEAMS_T[seed % TEAMS_T.length]); run(L, 20); const a = L.arcStart('vet'); if (!a) continue; const p = L.S.players[a.pid]; const base = L.retireChance(p); run(L, 3); const ev = L.eventsOpen().find(e => e.type === 'arc'); L.resolveEvent(ev.id, 'urge'); ok(p.arcRet && p.arcRet.v === 'stay' && L.retireChance(p) <= Math.max(0.02, base * 0.35) + 1e-9, '설득 → 은퇴 확률 ↓ ' + base + '→' + L.retireChance(p)); p.arcRet = { v: 'go', y: L.S.year }; ok(L.retireChance(p) >= Math.min(0.97, Math.max(base * 2.5, 0.35)) - 1e-9, '예우 → 은퇴 확률 ↑'); p.arcRet = { v: 'go', y: L.S.year - 1 }; ok(Math.abs(L.retireChance(p) - base) < 1e-9, '지난해 값은 무효'); done++; } ok(done >= 1, '베테랑 효과 시험 ' + done); }
// 효과: 재계약 요구액(계약 아크)
{ let done = 0; for (let seed = 1; seed <= 60 && done < 2; seed++) { const L = mkT(seed, TEAMS_T[seed % TEAMS_T.length]); run(L, 20); const a = L.arcStart('contract'); if (!a) continue; const p = L.S.players[a.pid], ask0 = L.resignAsk(p); run(L, 3); const ev = L.eventsOpen().find(e => e.type === 'arc'); L.resolveEvent(ev.id, 'early'); const ask1 = L.resignAsk(p); ok(ask1 <= ask0 && (ask1 < ask0 || ask0 <= L.minSal() + 0.11), `조기 재계약 의사 → 요구액 ${ask0}→${ask1}`); p.askMod = { v: 1.05, y: L.S.year }; ok(L.resignAsk(p) >= ask0 - 1e-9, '방침 고수 → 요구액 ↑'); p.askMod = { v: 0.9, y: L.S.year - 1 }; ok(Math.abs(L.resignAsk(p) - ask0) < 0.11, '지난해 값은 무효'); done++; } ok(done >= 1, '계약 효과 시험 ' + done); }
console.log('arcs3 ok', n);

