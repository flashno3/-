/* 선수단 피로도(49단계): 공격적 결정의 누적 대가 — 결정별 증감·자연 회복·경기력·부상 위험·우리 팀만·새 시즌 초기화·정합성 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = seed => { const L = League.create(base, 'Bears', seed); L.faAdvance(75); L.closeFA(); L.advance(20, false); return L; };
// 1) 결정 → 피로도: 총력전 +8, 특타 +5, 휴식 −4, 결과 문장에 표시
{ const L = mk(3), S = L.S, opp = L.standings().find(x => x.team !== S.userTeam).team; ok(L.wear() === 0, '시작 0');
  const e = L._decAllin(opp, 1, 1), r = L.resolveEvent(e.id, 'allin'); ok(L.wear() === 8 && /선수단 피로도 \+8 → 8/.test(r.msg), '총력전 +8: ' + r.msg);
  const e2 = L._decMood('lose'); L.resolveEvent(e2.id, 'drill'); ok(L.wear() === 13, '특타 +5 → ' + L.wear());
  const p = L.hitters(S.userTeam, true).sort((a, b) => b.age - a.age)[0], e3 = L._decRest(p); L.resolveEvent(e3.id, 'rest'); ok(L.wear() === 9, '휴식 −4 → ' + L.wear());
  const e4 = L._decMood('lose'); L.resolveEvent(e4.id, 'meet'); ok(L.wear() === 9, '미팅은 변화 없음');
  L.advance(5, false); ok(L.wear() < 9 && L.wear() >= 9 - 0.6 * 5 - 0.01, '하루 0.6씩 회복 ' + L.wear()); }
// 2) 높은 피로도: 우리 팀 능력치만 떨어지고(단계), 부상 위험 증가, 낮아지면 회복
{ const L = mk(4), S = L.S, p = L.hitters(S.userTeam, true)[0], q = L.hitters('Tigers', true)[0], k0 = L._modRates(p).k, kq = L._modRates(q).k;
  L._wearAdd(56); const w = L.wearInfo(); ok(w.tier === 3 && w.lv === '높음' && w.inj > 50, '피로도 56: 3단계·부상 위험 ' + JSON.stringify(w));
  ok(L._modRates(p).k > k0 && L._modRates(q).k === kq, '우리 팀만 경기력 하락(삼진율↑)'); ok(L._wearInj() > 1.5, '부상 위험 배수 ' + L._wearInj());
  L._wearAdd(-56); ok(L.wearTier() === 0 && Math.abs(L._modRates(p).k - k0) < 1e-12, '피로도가 내려가면 원래대로'); }
// 3) 경기에 실제 반영: 같은 시드에서 피로도 90 고정 vs 0, 60일 · 6개 시드 합산 승수(시드 3개는 선수 데이터가 조금만 바뀌어도 잡음에 묻힘 — 2026-11-28 보충 뒤 1·3·4 합 68→68, 8개 시드 합은 −28)
{ const run = (seed, w) => { const L = League.create(base, 'Bears', seed), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(20, false); let W = 0; L._dec().wear = w; L._engDirty = true; L.invalidate();
    for (let i = 0; i < 60; i++) { L._dec().wear = w; const r0 = S.results.length; L.advance(1, false); for (const x of S.results.slice(r0)) { const my = x.home === S.userTeam ? x.rh - x.ra : x.away === S.userTeam ? x.ra - x.rh : 0; if (my > 0) W++; } } return W; };
  let a = 0, b = 0; for (const sd of [1, 3, 4, 5, 6, 7]) { a += run(sd, 0); b += run(sd, 90); } ok(b < a - 10, `피로도 90이면 승수 하락 ${a} → ${b}`); }
// 4) 새 시즌 초기화·정합성
{ const L = mk(7), S = L.S; L._wearAdd(40); while (S.phase === 'regular' || S.phase === 'preseason') L.advance(30, false);
  const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); }
  L.startOffseason(); L.resignAll(); L.finishContracts(); L.buildDraft(); L.draftAutoRest(); L.finishDraft(); L.finishFA(); L.startNewSeason(); ok(L.wear() === 0, '새 시즌 피로도 0'); ok(!L.integrity().errors.length, '정합성'); }
console.log('wear tests ok', n);
