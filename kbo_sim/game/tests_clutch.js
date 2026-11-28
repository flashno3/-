/* 승부처 개입(49단계): UI 진행에서만 멈춤 · 멈춤 조건(8회 이후·득점권·동점/1점 차·선택지 2개 이상) · 모든 선택지 실행 · 경기 1회 기록 · 설정(끄기·7회) · 이틀 연속 없음 · 정합성 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const BAD = /undefined|NaN|\[object|null/;
const mk = seed => { const L = League.create(base, 'Bears', seed); L.faAdvance(75); L.closeFA(); return L; };
const userGames = S => S.results.filter(r => r.home === S.userTeam || r.away === S.userTeam);
// 1) UI 플래그가 없으면 멈추지 않음(시뮬·테스트 진행은 그대로)
{ const L = mk(3); const r = L.advance(40, false); ok(r.status !== 'clutch', 'clutchUI 없으면 멈추지 않음'); }
// 2) 시즌 진행: 선택지를 돌아가며 고르고, 각 멈춤 상황·선택지·결과 문장 점검
{ const L = mk(3), S = L.S; L.clutchUI = true; const seen = {}, days = []; let stops = 0, guard = 0;
  while ((S.phase === 'regular' || S.phase === 'preseason') && guard++ < 3000) { const r = L.advance(30, false); for (const e of L.eventsOpen()) L.resolveEvent(e.id, e.rec || e.def);
    if (r.status !== 'clutch') continue; stops++; const g = r.ctx.live, us = r.ctx.userSide, info = L.clutchInfo(r.ctx), ls = L.liveScore(g), diff = ls[us] - ls[us === 'home' ? 'away' : 'home'];
    ok(g.inning >= 8 && (g.bases[1] || g.bases[2]) && Math.abs(diff) <= 1 && (info.bat ? diff <= 0 : diff >= 0), `멈춤 조건 ${info.head}`);
    ok(info.choices.length >= 2 && info.choices.every(c => c.label && c.hint && !BAD.test(c.label + c.hint)), '선택지 2개 이상·문장 ' + info.choices.map(c => c.label).join('/'));
    ok(S.day === r.day && S.pendingDay === r.day, '멈춘 날은 아직 끝나지 않음');
    const ks = info.choices.map(c => c.k), k = ks.find(x => !seen[x]) || ks[stops % ks.length]; seen[k] = (seen[k] || 0) + 1; const g0 = userGames(S).length;
    const x = L.clutchResolve(r.ctx, k); ok(x.ok && x.msg && !BAD.test(x.msg), `선택 ${k}: ${x.msg}`); ok(userGames(S).length === g0 + 1 && S.day === r.day + 1 && S.pendingDay === null, '경기 1회 기록·날짜 진행');
    days.push(r.day); }
  ok(stops >= 20 && stops <= 60, '한 시즌 멈춤 횟수 ' + stops); ok(['swing', 'keep', 'pc', 'ph'].every(k => seen[k]) && Object.keys(seen).length >= 6, '선택지 종류 ' + JSON.stringify(seen));
  ok(days.every((d, i) => !i || d - days[i - 1] >= 2), '기본 설정: 이틀 연속 멈추지 않음');
  ok(userGames(S).length === 144 && new Set(userGames(S).map(r => r.day)).size === 144, '우리 경기 144번, 중복 없음');
  const sm = L.clutchSummary(); ok(sm.n === stops && sm.good <= sm.n, '요약 ' + JSON.stringify({ n: sm.n, good: sm.good }));
  ok(!L.integrity().errors.length, '시즌 뒤 정합성'); }
// 3) 설정: 끄기 → 멈춤 없음, 7회 이후 → 7회 멈춤 가능·더 잦음
{ const L = mk(5), S = L.S; L.clutchUI = true; L.setClutch('off'); const r = L.advance(60, false); ok(r.status !== 'clutch' && S.clutch === 'off', '끄기: 멈춤 없음');
  const A = mk(5), B = mk(5); A.clutchUI = B.clutchUI = true; A.setClutch('all'); let na = 0, nb = 0, inn7 = 0;
  for (const [M, inc] of [[A, () => na++], [B, () => nb++]]) for (let i = 0; i < 200 && M.S.day < 70; i++) { const r = M.advance(70 - M.S.day, false); for (const e of M.eventsOpen()) M.resolveEvent(e.id, e.def); if (r.status === 'clutch') { inc(); if (M === A && r.ctx.live.inning === 7) inn7++; M.clutchResolve(r.ctx, M.clutchInfo(r.ctx).def); } }
  ok(na > nb && inn7 > 0, `7회 이후 설정이 더 잦음 ${na} > ${nb}, 7회 멈춤 ${inn7}`); }
console.log('clutch tests ok', n);
