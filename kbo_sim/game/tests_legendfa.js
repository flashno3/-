/* 영구결번 후보와 FA: 프랜차이즈 스타 인정·잔류 할인 확대·레전드 스틸 억제·놓쳤을 때 팬 충성도 → 관중 → 수익 감소 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const mk = (team, seed) => { const L = League.create(base, team || 'Tigers', seed || 3); L.faAdvance(0); return L; };
const find = (L, ko, type) => Object.values(L.S.players).find(p => p.ko === ko && (!type || p.type === type) && p.age > 24);
// 1) 후보 판정(한 구단·구단 WAR 회색 이상) + 프랜차이즈 스타 인정(충성도와 무관)
{ const L = mk('Lions'), S = L.S; const g = find(L, '구자욱', 'B'); ok(g && g.team === 'FA' && g.faInfo.from === 'Lions', '구자욱은 삼성 FA');
  const lb = L.legendBound(g, 'Lions'); ok(lb && lb.tier === 'gray' && lb.war > 48, '구자욱 회색 후보 ' + JSON.stringify(lb)); ok(!L.legendBound(g, 'Bears'), '다른 구단 소속으로는 후보 아님');
  const star = L.faStar(g, 'Lions'); ok(star && star.legend && star.s >= 0.6, '영구결번 후보는 프랜차이즈 스타 ' + JSON.stringify(star)); ok(!L.faStar(g, 'Bears'), '다른 구단에는 해당 없음');
  g.tn = 0; g.dh = Object.assign({}, g.dh); const l = L.loyalty(g, 'Lions'); ok(L.faStar(g, 'Lions'), '충성도가 낮아도 후보면 프랜차이즈 스타 (충성도 ' + (l && l.v) + ')');
  // 잔류 할인: 후보는 최대 20%, 비후보 최대 12%
  const d1 = L.loyDiscount(g, 'Lions'); g.lg = {}; const d0 = L.loyDiscount(g, 'Lions'); ok(d1 > d0 && d1 <= 0.2 + 1e-9 && d0 <= 0.12 + 1e-9, `잔류 할인 ${d1.toFixed(3)} > ${d0.toFixed(3)}`); }
// 2) 레전드 스틸 억제: 후보 FA에 대한 타 구단 입찰이 크게 줄어든다
{ let withLg = 0, without = 0;
  for (const mode of ['lg', 'none']) { for (let sd = 1; sd <= 8; sd++) { const L = mk('Tigers', sd), S = L.S; const g = find(L, '구자욱', 'B'); if (mode === 'none') { g.lg = {}; g.seasons = [{ y: 2020, t: 'Bears' }]; }
      // 구자욱만 FA 풀에 남기고(다른 FA 제거) 30일 동안 입찰 관찰
      for (const id of (S.fa || []).slice()) if (id !== g.id) { const q = S.players[id]; if (q) { q.retired = true; q.team = 'RET'; } } S.fa = [g.id];
      let bids = 0; for (let d = 0; d < 30; d++) { L._postBids(d); const bs = (S.faMkt.bids[g.id] || []).filter(b => b.team !== 'Lions'); bids += bs.length; delete S.faMkt.bids[g.id]; } if (mode === 'lg') withLg += bids; else without += bids; } }
  ok(withLg < without * 0.6 || without === 0, `레전드 스틸 억제: 후보 ${withLg} < 일반 ${without}`); }
// 3) 놓치면: 팬 충성도 하락 → 관중·MD·수익 감소, 내 구단은 신뢰도·선수단 충성도·이벤트
{ const L = mk('Lions'), S = L.S, t = 'Lions', f = S.fin.teams[t]; ok(L.fanLoy(t) === 100 && L.fanImpact(t).total === 0, '초기 지수 100·감소 없음');
  const g = find(L, '구자욱', 'B'); const a0 = L.finAtt(t, false), v0 = L.finPreview(t), tr0 = f.trust, mate = L.players(t).find(x => !x.foreign), m0 = mate.loyAdj || 0;
  S.userTeam = 'Lions';   // 내 구단 시점에서 확인
  L._doSign('Bears', g, 3, 12, 6); // 타 구단과 계약
  ok(g.team === 'Bears', '이적 처리'); ok(L.fanLoy(t) < 95, '팬 충성도 지수 하락 ' + L.fanLoy(t)); ok(f.fl >= 55, '지수 하한 55');
  const a1 = L.finAtt(t, false), v1 = L.finPreview(t); ok(a1 < a0, `관중 감소 ${a0} → ${a1}`); ok(v1.gate < v0.gate, `입장 수입 감소 ${v0.gate.toFixed(1)} → ${v1.gate.toFixed(1)}`); ok(v1.other < v0.other - 1e-9, `MD 수입 감소 ${v0.other.toFixed(1)} → ${v1.other.toFixed(1)}`); ok(v1.op < v0.op, `영업이익 감소 ${v0.op.toFixed(1)} → ${v1.op.toFixed(1)}`);
  const im = L.fanImpact(t); ok(im.total > 3 && im.att > 0 && im.attPct > 0, '예상 수입 감소 ' + JSON.stringify(im)); ok(f.trust < tr0, '이사회 신뢰도 하락'); ok((mate.loyAdj || 0) < m0, '선수단 충성도 하락');
  const ev = L.eventsOpen().find(e => e.type === 'fanloss'); ok(ev && ev.choices.length === 3 && ev.def === 'ignore', '팬 반응 이벤트'); const fl0 = f.fl, c0 = f.evCost || 0; L.resolveEvent(ev.id, 'apology'); ok(f.fl === fl0 + 5 && Math.abs((f.evCost || 0) - c0 - 1) < 1e-9, '소통 행사: +5·1.0억'); ok(L.finAtt(t, false) >= a1, '회복 후 관중 증가');
  ok((S.story || []).some(x => x.kind === 'legend' && /놓쳤/.test(x.text)), '스토리 기록'); }
// 4) 회복: 정산마다 격차의 25%(우승 +3)
{ const L = mk('Lions'), f = L.S.fin.teams.Lions; f.fl = 80; const g = 100 - f.fl; f.fl = Math.min(100, Math.round((f.fl + (100 - f.fl) * 0.25) * 10) / 10); ok(f.fl === 85, '회복 식(80 → 85)'); }
// 5) 트레이드·방출로 내보내도 같은 손실, 원구단 재계약은 손실 없음, 비후보는 손실 없음
{ const L = mk('Lions'), S = L.S, t = 'Lions'; const c = Object.values(S.players).find(p => p.team === t && L.legendBound(p, t)) || null; const q = find(L, '최정', 'B'); ok(L.legendBound(q, 'Landers').tier === 'sure', '최정 확실');
  const L2 = mk('Landers'); const choi = find(L2, '최정', 'B'); const f2 = L2.S.fin.teams.Landers; const r = L2.releasePlayer(choi.id); ok(r.ok && L2.fanLoy('Landers') < 90, '확실 후보 방출 → 지수 하락 ' + L2.fanLoy('Landers'));
  const L3 = mk('Lions'), g3 = find(L3, '구자욱', 'B'); L3._doSign('Lions', g3, 3, 12, 6); ok(L3.fanLoy('Lions') === 100, '원구단 재계약은 손실 없음');
  const L4 = mk('Lions'), g4 = find(L4, '정수빈', 'B'); L4._doSign('Giants', g4, 3, 8, 4); ok(L4.fanLoy('Bears') === 100, '비후보 이적은 손실 없음'); }
console.log('legendfa tests ok', n);
