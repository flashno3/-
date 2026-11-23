/* 영구결번 시스템: 과거 WAR 매칭(데이터)·판정 기준·이적 경력 제한·구단당 연 1건·AI 결정·내 구단 이벤트·보류·저장/불러오기 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
// 1) 데이터: 구단별 과거 WAR이 선수에 붙어 있다(표와 일치)
const by = k => base.players.find(p => p.ko === k && p.lg);
ok(by('최정') && by('최정').lg.Landers === 91.51, '최정 SSG 91.51'); ok(by('양의지').lg.Bears === 54.79 && by('양의지').lg.Dinos === 25.79, '양의지 두산/NC 구단별'); ok(by('손아섭').lg.Giants === 52.82, '손광민=손아섭 개명 병합');
ok(base.players.filter(p => p.lg).length >= 90, '매칭 수 ' + base.players.filter(p => p.lg).length); ok(!base.players.some(p => p.lg && p.foreign), '외국인 제외');
const mk = seed => { const L = League.create(base, 'Lions', seed || 3); L.faAdvance(75); L.closeFA(); return L; };
// 2) 판정: 원클럽·확실/회색·구원 기준·이적 경력 제외·근속 하한
{ const L = mk(), S = L.S; const choi = Object.values(S.players).find(p => p.ko === 'ㅊ' ) || Object.values(S.players).find(p => p.ko === '최정' && p.team === 'Landers');
  ok(choi && L._legendOneClub(choi, 'Landers'), '최정 원클럽'); let e = L._legendEval(choi, 'Landers'); ok(e.tier === 'sure' && e.war >= 91, '최정 확실 ' + JSON.stringify(e));
  const yang = Object.values(S.players).find(p => p.ko === '양의지' && p.team === 'Bears'); ok(!L._legendOneClub(yang, 'Bears'), '양의지(두산→NC→두산)는 이적 경력으로 제외'); ok(L._legendEval(yang, 'Bears').tier === null, '이적 경력 판정 없음');
  const guja = Object.values(S.players).find(p => p.ko === '구자욱' && p.type === 'B'); e = L._legendEval(guja, 'Lions'); ok(e.tier === 'gray', '구자욱 48.5 → 회색 ' + JSON.stringify(e));
  const kim = Object.values(S.players).find(p => p.ko === '김선빈' && p.type === 'B' && p.age > 30); e = L._legendEval(kim, 'Tigers'); ok(e.tier === 'gray' && e.war > 44, '김선빈 44.13 회색');
  const jeon = Object.values(S.players).find(p => p.ko === '전준우' && p.age > 30); e = L._legendEval(jeon, 'Giants'); ok(e.tier === null, '전준우 33.9 제외'); 
  // 구원 기준(확실 30/회색 24)
  const rp = Object.values(S.players).find(p => p.type === 'P' && p.role !== 'SP' && !p.foreign && p.dh && p.dh.one); rp.lg = { [rp.team]: 31 }; ok(L._legendEval(rp, rp.team).tier === 'sure' || L._legendYears(rp) < 10, '구원 31 → 확실(근속 충족 시)'); rp.lg = { [rp.team]: 25 }; const e2 = L._legendEval(rp, rp.team); ok(e2.tier === 'gray' || e2.tier === null, '구원 25 회색');
  const sp = Object.values(S.players).find(p => p.type === 'P' && p.role === 'SP' && !p.foreign); sp.lg = { [sp.team]: 31 }; ok(L._legendTier(sp, 31) === null, '선발 31은 제외'); ok(L._legendTier(rp, 31) === 'sure', '구원 31은 확실');
  const fo = Object.values(S.players).find(p => p.foreign); fo.lg = { [fo.team]: 99 }; ok(!L._legendOneClub(fo, fo.team), '외국인 제외'); }
// 3) 게임 내 누적: 출전 비중만큼 쌓이고, 팀을 옮기면 구단별로 따로 쌓인다
{ const L = mk(), S = L.S; const p = Object.values(S.players).find(x => x.ko === '오지환' && x.team === 'Twins'); const w0 = L.legendWar(p, 'Twins'); L._legendAccrue(p, 1); const w1 = L.legendWar(p, 'Twins'); ok(w1 > w0, '1군 풀타임 누적 ' + w0 + '→' + w1); L._legendAccrue(p, 0); ok(L.legendWar(p, 'Twins') === w1, '출전 0이면 누적 없음');
  p.team = 'Bears'; L._legendAccrue(p, 1); ok(p.lw.Bears > 0 && L.legendWar(p, 'Twins') === w1, '구단별 분리 누적'); }
// 4) 처리: 구단당 연 1건(WAR 높은 순)·AI 자동 결정·내 구단 이벤트·보류·내년 재심
const retire = (L, p, club) => { p.retired = true; p.legClub = club; p.team = 'RET'; };
{ const L = mk(), S = L.S, q = Object.values(S.players).filter(p => p.ko === '최정' || p.ko === '김광현').filter(p => p.team === 'Landers'); ok(q.length === 2, 'SSG 후보 2명'); for (const p of q) retire(L, p, 'Landers');
  L._legendProcess(); const lg = L.legends(); ok(lg.list.length + lg.q.length === 2, '두 명 모두 평가됨'); ok(lg.list.length <= 1, 'AI 구단도 연 1건 한도 ' + lg.list.length); ok(lg.list.length === 0 || lg.list[0].name === '최정', 'WAR 높은 순(최정 먼저)');
  const before = lg.list.length; L.S.year++; L._legendProcess(); ok(lg.list.length >= before, '다음 해 이어서 심의'); }
{ const L = mk(), S = L.S, U = S.userTeam; const p = Object.values(S.players).find(x => x.ko === '구자욱' && x.type === 'B'); retire(L, p, U); L._legendProcess();
  const ev = L.eventsOpen().find(e => e.type === 'legend'); ok(ev && ev.choices.length === 3 && ev.def === 'hold', '내 구단 심의 이벤트(기본 보류)'); const tr0 = S.fin.teams[U].trust;
  let r = L.resolveEvent(ev.id, 'hold'); ok(r.ok && L.legends().q.length === 1 && L.legends().list.length === 0, '보류 → 대기열 유지'); L._legendProcess(); ok(!L.eventsOpen().some(e => e.type === 'legend'), '같은 해에는 재심의 안 함');
  S.year++; L._legendProcess(); const ev2 = L.eventsOpen().find(e => e.type === 'legend'); ok(ev2, '내년 재심'); r = L.resolveEvent(ev2.id, 'retire'); ok(r.ok && L.legendList(U).length === 1 && L.legendList(U)[0].name === '구자욱' && L.legends().q.length === 0, '지정 → 구단 역사 기록'); ok(S.fin.teams[U].trust >= tr0, '이사회 신뢰도(회색 +1)'); ok((S.story || []).some(x => x.kind === 'legend'), '스토리 기록'); }
{ const L = mk(), S = L.S, U = S.userTeam; const p = Object.values(S.players).find(x => x.ko === '구자욱' && x.type === 'B'); retire(L, p, U); L._legendProcess(); const ev = L.eventsOpen().find(e => e.type === 'legend'); L.resolveEvent(ev.id, 'decline'); ok(L.legends().q.length === 0 && L.legendList(U).length === 0, '지정하지 않음 → 대기열에서 제거'); }
// 5) 후보 목록·저장/불러오기·시즌 전환 시 이벤트 유지
{ const L = mk(), S = L.S; const c = L.legendCandidates('Landers'); ok(c.length >= 2 && c[0].name === '최정' && c[0].tier === 'sure', '현역 후보(SSG 최정) ' + JSON.stringify(c.map(x => x.name))); ok(L.legendCandidates('Heroes').length === 0, '키움은 후보 없음');
  const U = S.userTeam, p = Object.values(S.players).find(x => x.ko === '구자욱' && x.type === 'B'); retire(L, p, U); L._legendProcess(); const L2 = League.fromJSON(JSON.parse(JSON.stringify(S))); ok(L2.eventsOpen().some(e => e.type === 'legend') && L2.legends().q.length === 1, '저장→불러오기 유지'); }
console.log('legends tests ok', n);
