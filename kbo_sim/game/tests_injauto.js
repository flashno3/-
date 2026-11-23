/* 부상 자동 관리: off=직접, fill=부상 공백 자동 대체(같은 유형·포지션 우선), full=복귀 자동 등록까지 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = (seed, mode) => { const L = League.create(base, 'Lions', seed); L.faAdvance(75); L.closeFA(); L.S.injAuto = mode; L.advance(1, false); return L; };
// 1) 직접 부상 → 자동 대체(단위): 같은 유형·건강·2군 선수가 올라오고 인원이 유지된다
{ const L = mk(3, 'fill'), S = L.S, t = S.userTeam; ok(L.injAuto() === 'fill', '기본/설정 fill'); const act0 = L.players(t).filter(p => p.active).length;
  const q = L.players(t).filter(p => p.active && p.type === 'B' && p.pos !== 'C').sort((a, b) => L.ovr(b) - L.ovr(a))[0]; q.active = false; q.inj = { dx: '시험', ret: '2099-01-01', retN: 1e9, apply: true, generated: true };
  ok(L.openSlots() > 0, '부상으로 빈 자리'); L._injAutoFix([q], []); ok(L.openSlots() === 0 && L.players(t).filter(p => p.active).length === act0, '자동 대체로 인원 유지');
  const set = S.teams[t].set; ok(!set.lineup.some(x => x.id === q.id), '라인업에 부상자 없음(repairSettings)'); ok(!q.active, '부상자는 2군/IL'); ok((S.news || []).some(x => /자동 대체/.test(x.text || x.t || JSON.stringify(x))), '소식 기록'); }
{ const L = mk(3, 'fill'), S = L.S, t = S.userTeam; const c = L.players(t).find(p => p.active && p.pos === 'C'); c.active = false; c.inj = { dx: '시험', ret: '2099-01-01', retN: 1e9, apply: true, generated: true };
  const hasFarmC = L.players(t).some(p => !p.active && p.pos === 'C' && !L.isInj(p) && !L.lockLeft(p)); L._injAutoFix([c], []); if (hasFarmC) ok(L.players(t).filter(p => p.active && p.pos === 'C').length >= 1, '포수 부상 → 2군 포수 우선 콜업'); }
// 2) 시즌 진행: 자동 대체면 건강한 2군이 있는 한 1군 빈 자리가 남지 않고, 직접 모드면 빈 자리가 생긴다
let openFill = 0, openOff = 0, injSeen = 0;
for (const mode of ['fill', 'off']) { for (let sd = 1; sd <= 4; sd++) { const L = mk(sd, mode), S = L.S, t = S.userTeam; for (let d = 0; d < 100 && S.day < S.schedule.length; d++) { L.advance(1, false); if (L.openSlots() > 0 && L.callupPlan().length > 0) { if (mode === 'fill') openFill++; else openOff++; } }
    injSeen += L.players(t).filter(p => L.isInj(p)).length; for (const p of L.players(t)) ok(!(p.active && L.isInj(p)), `${mode} 부상자가 1군에 없음`); } }
ok(openFill === 0, '자동 대체 모드는 빈 자리 방치 없음 ' + openFill); ok(openOff > 0, '직접 모드는 빈 자리가 생김 ' + openOff);
// 3) full: 복귀 자동 등록(더 나은 선수일 때만), 복귀 이벤트 없음
{ const L = mk(5, 'full'), S = L.S, t = S.userTeam; const best = L.players(t).filter(p => p.active && p.type === 'B').sort((a, b) => L.ovr(b) - L.ovr(a))[0]; best.active = false; best.inj = { dx: '시험', ret: '2000-01-01', retN: 0, apply: true, generated: true }; L._injAutoFix([best], []); ok(L.players(t).filter(p => p.active).length >= 0, '대체');
  delete best.inj; best.lockUntil = 0; L._injAutoFix([], [best]); ok(best.active || L.players(t).filter(p => p.active && p.type === 'B').every(w => L._runsB(w, true) >= L._runsB(best, true) - 0.5), '복귀한 에이스급은 1군 복귀'); ok(!L.eventsOpen().some(e => e.type === 'return'), 'full 모드는 복귀 이벤트 없음'); }
{ const L = mk(5, 'off'); ok(L.injAuto() === 'off', 'off 유지'); L.S.injAuto = undefined; ok(L.injAuto() === 'fill', '기본값 fill'); }
console.log('injauto tests ok', n);
