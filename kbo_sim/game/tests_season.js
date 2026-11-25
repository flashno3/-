/* 시즌 타임라인·가을야구 확정/탈락 판정: 표시용 계산이 실제 결과와 어긋나지 않는다(확정·탈락이라고 한 팀은 실제로 그렇게 끝난다) */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
let calls = 0;
for (const seed of [1, 2, 3]) { const L = League.create(base, 'Lions', seed); L.faAdvance(75); L.closeFA(); const S = L.S;
  const sm = L.seasonMarks(); ok(sm.len === S.schedule.length && sm.marks.length === 4 && sm.marks.every((m, i) => i === 0 || m.d >= sm.marks[i - 1].d), '표시 순서');
  const sep = sm.marks.find(m => m.k === 'sep'); ok(sep && L.dateOf(sep.d).getUTCMonth() === 8 && (sep.d === 0 || L.dateOf(sep.d - 1).getUTCMonth() < 8), '9월 첫 경기일 ' + (sep && L.dateStr(sep.d)));
  ok(sm.marks.find(m => m.k === 'dl').d === 110 && sm.marks.find(m => m.k === 'as').d === L.allStarBreakDay(), '트레이드 마감·올스타 일차');
  const said = {}; const teams = Object.keys(S.teams);
  let mags = 0, races = 0;
  while (S.day < S.schedule.length) { L.advance(1, false); for (const t of teams) { const c = L.postClinch(t); if (c) { said[t] = said[t] || c; ok(said[t] === c, `${t} 판정이 뒤집힘`); calls++; }
      const mg = L.magicNumber(t), st = L.standings(), me = st.find(x => x.team === t), rem = S.schedule.length - (me.w + me.l + me.d);
      if (mg) { mags++; ok(rem <= 30 && !c, '매직넘버는 막바지·미확정일 때만'); for (const m of mg) { ok(Number.isInteger(m.n) && m.n >= 1 && teams.includes(m.vs) && m.vs !== t, '매직넘버 형식'); ok((m.k === 'tragic') === (st.indexOf(me) >= 5) || m.k === 'first', '종류와 순위'); } }
      for (const u of teams) if (u !== t && L.raceGame(t, u)) { races++; ok(rem <= 30, '맞대결 표시는 막바지만'); } } }
  ok(mags > 0 && races > 0, `막바지 매직넘버 ${mags}·맞대결 ${races}`);
  const C = S.clinch; const fin = L.postClinch(S.userTeam); if (C && C.k) ok(C.k === said[S.userTeam], '내 팀 확정 기록 = 판정'); ok((S.press || []).filter(x => x.kind === 'race' && /확정/.test(x.head)).length <= 1, '확정 소식은 한 번');
  for (const x of (S.press || []).filter(x => x.kind === 'race')) ok(x.head && x.fan && !/undefined|NaN/.test(x.head + x.fan), '팬 반응 형식');
  { const games = S.results.filter(x => x.home === S.userTeam || x.away === S.userTeam); let best = 0, n = 0, k = null; for (const x of games) { const h = x.home === S.userTeam, r = (h ? x.rh : x.ra) > (h ? x.ra : x.rh) ? 'W' : (h ? x.rh : x.ra) < (h ? x.ra : x.rh) ? 'L' : 'D'; if (r === k && r !== 'D') n++; else { k = r; n = r === 'D' ? 0 : 1; } best = Math.max(best, n); }
    const sp = (S.press || []).filter(x => x.kind === 'race' && /연승|연패/.test(x.head)).length; ok(best >= 5 ? sp >= 1 : sp === 0, `연승·연패 반응(최장 ${best}, 소식 ${sp})`); }
  const st = L.standings();
  for (const t of teams) { const r = st.find(x => x.team === t).rank; if (said[t] === 'in') ok(r <= 5 || st.filter(x => x.pct === st.find(y => y.team === t).pct).length > 1, `${t} 진출 확정이었는데 ${r}위`); if (said[t] === 'out') ok(r > 5, `${t} 탈락 확정이었는데 ${r}위`); }
  ok(Object.values(said).filter(x => x === 'out').length >= 1, '시즌 막바지에는 탈락 확정 팀이 나온다'); }
console.log('season tests ok', n, `(판정 ${calls}회)`);
