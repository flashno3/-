/* 다년 커리어(49단계): 장기 계획 제의·선택·달성/실패/무효 정산, 커리어 업적 판정, 평판 반영, 모듈 로드 순서(world.js 다음) */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const H = (L, y, rank, extra) => { const S = L.S; S.history.push(Object.assign({ year: y, champion: null, runnerUp: null, userTeam: S.userTeam, userRank: rank, userRec: { w: 75, l: 67, d: 2 }, top: [] }, extra || {})); };
// 1) 제의: 시즌 초 이벤트, 순위에 맞는 선택지, 선택하면 계획 시작
{ const L = League.create(base, 'Bears', 3), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(4, false); const e = L.eventsOpen().find(x => x.type === 'mission');
  ok(e && e.choices.length === 4 && e.choices.some(c => c.k === 'none'), '시즌 초 장기 계획 제의'); const r = L.resolveEvent(e.id, 'post3'); ok(r.ok && S.mission && S.mission.id === 'post3' && S.mission.y0 === S.year, '선택 → 계획 시작 ' + r.msg);
  L.advance(10, false); ok(!L.eventsOpen().some(x => x.type === 'mission'), '진행 중이면 다시 제의하지 않음'); }
// 2) 정산: 달성(신뢰도 +), 기한 만료 실패(신뢰도 −), 구단 이동 무효 — world.js 의 시즌 끝 평가에 연결되어 있어야 함
{ const L = League.create(base, 'Bears', 4), S = L.S, f = () => S.fin.teams[S.userTeam];
  S.mission = { id: 'rise2', y0: S.year, team: S.userTeam, core: 0 }; H(L, S.year, 4); const t0 = f().trust; L._challengeEval(); ok(!S.mission && S.misHist[0].res === 'ok' && f().trust === Math.min(100, t0 + 7), '달성: 신뢰도 +7 (시즌 끝 평가 연결)');
  ok(S.achv.some(a => a.id === 'plan') && S.achv.some(a => a.id === 'post1'), '업적: 약속을 지킨 감독·첫 가을야구');
  const rp = L.reputation(); ok(rp.items.some(x => /장기 계획 달성 1건/.test(x[0])), '평판에 장기 계획 반영 ' + JSON.stringify(rp.items));
  S.year++; S.mission = { id: 'dyn3', y0: S.year - 2, team: S.userTeam, core: 0 }; H(L, S.year, 7); const t1 = f().trust; L._missionEval(); ok(!S.mission && S.misHist.slice(-1)[0].res === 'fail' && f().trust === Math.max(0, t1 - 5), '기한 만료 실패: 신뢰도 −5');
  S.mission = { id: 'title5', y0: S.year, team: 'Tigers', core: 0 }; L._missionEval(); ok(!S.mission && S.misHist.slice(-1)[0].res === 'void', '구단을 옮기면 무효'); }
// 3) 업적: 언더독(지난해 8위 이하 구단으로 가을야구)·꼴찌에서 정상으로·두 구단 우승·통산 승수
{ const L = League.create(base, 'Lions', 5), S = L.S, y = S.year;
  H(L, y - 1, 9, { ranks: { Lions: 9 } }); H(L, y, 3, { champion: 'Lions', ranks: { Lions: 3 } }); S.takeRank = { Lions: 10 }; L._achvEval();
  const ids = new Set(S.achv.map(a => a.id)); ok(['under', 'title1', 'phoenix', 'post1'].every(i => ids.has(i)), '언더독·첫 우승·꼴찌에서 정상으로 ' + [...ids]);
  ok(!ids.has('twoClubs') && !ids.has('w300'), '조건 안 되면 미달성'); H(L, y + 1, 1, { champion: 'Tigers', userTeam: 'Tigers' }); L._achvEval(); ok(S.achv.some(a => a.id === 'twoClubs'), '두 구단 우승');
  const n0 = S.achv.length; L._achvEval(); ok(S.achv.length === n0, '같은 업적 중복 없음'); ok(L.achvList().filter(a => a.done).length === n0, '업적 목록'); }
// 4) 내가 키운 MVP: 우리 구단 드래프트 출신 수상
{ const L = League.create(base, 'Bears', 6), S = L.S, p = L.players('Bears').find(q => q.type === 'B'); p.myFrom = { y: S.year - 2, how: '드래프트 1라운드 지명' }; S.awardsHist = [{ year: S.year, awards: [{ id: p.id, label: 'MVP' }] }]; L._achvEval(); ok(S.achv.some(a => a.id === 'mvpHome'), '내가 키운 MVP'); }
console.log('career tests ok', n);
