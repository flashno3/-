/* KBO 공식 등록 현황·선수 조회 데이터(50단계): 등번호·투타·생년월일·체격 정합 — 같은 구단 등번호 중복 없음, '00'·'02' 보존, 나이 = 2027−출생연도, 값 범위, 표본 대조 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const P = base.players;
const dup = {}; for (const p of P) { if (!p.no || p.team === 'MIL') continue; const k = p.team + ':' + p.no; (dup[k] = dup[k] || []).push(p.ko); }
ok(Object.values(dup).every(v => v.length === 1), '같은 구단 등번호 중복 없음 ' + JSON.stringify(Object.entries(dup).filter(x => x[1].length > 1)));
ok(P.filter(p => p.no !== undefined).every(p => typeof p.no === 'string' && /^\d{1,3}$/.test(p.no)), '등번호는 문자열(앞자리 0 보존)');
ok(P.filter(p => p.no).length >= 850, '등번호 보유 ' + P.filter(p => p.no).length);
ok(P.filter(p => p.birth).every(p => p.age === 2027 - +p.birth.slice(0, 4)), '나이 = 2027 − 출생연도');
ok(P.every(p => (p.bats === undefined || ['L', 'R', 'S'].includes(p.bats)) && (p.throws === undefined || ['L', 'R'].includes(p.throws))), '투타 값(있는 값은 L·R·S)'); ok(P.filter(p => p.bats && p.throws).length >= 1000, '투타 보유 ' + P.filter(p => p.bats && p.throws).length);
ok(P.filter(p => p.ht).every(p => p.ht >= 160 && p.ht <= 205 && p.wt >= 60 && p.wt <= 135), '키·몸무게 범위(삼성 김지찬·김성윤 163cm 실제)');
const one = nm => P.filter(p => p.ko === nm);
for (const [nm, team, no, b, t, birth] of [['김광현', 'Landers', '29', 'L', 'L', '1988-07-22'], ['박성한', 'Landers', '2', 'L', 'R', '1998-03-30'], ['강민균', 'Twins', '00', 'R', 'R', '2000-07-17'], ['이도우', 'Landers', '02', 'R', 'R', '2006-05-13'], ['최정', 'Landers', '14', 'R', 'R', '1987-02-28']]) {
  const p = one(nm).find(q => q.team === team); ok(p && p.no === no && p.bats === b && p.throws === t && p.birth === birth, `${nm}: ${p && [p.no, p.bats, p.throws, p.birth].join(' ')}`); }
{ const a = one('박준영').filter(p => p.team === 'Eagles'); ok(a.length === 2 && a.find(p => p.age === 24).birth === '2003-03-02' && a.find(p => p.age === 25).birth === '2002-06-03', '한화 동명이인 박준영 생년월일 구분'); }
// 2026-11-28 보충(사용자 요청 17명): 나이 추정 선수의 투타·KBO ID·생년월일(KBO 선수 상세·퓨처스 기록 ID 대조) · 나종덕 → 현재 등록명 나균안
for (const [nm, team, kid, t, b, birth, und] of [['나균안', 'Giants', '67539', 'R', 'R', '1998-03-16'], ['우정안', 'Twins', '55111', 'R', 'L', '2006-01-03'], ['현원회', 'Landers', '50840', 'R', 'R', '2001-07-08'], ['양가온솔', 'Dinos', '55920', 'R', 'R', '2006-02-24'], ['이승현', 'Wiz', '54011', 'R', 'L', '2005-01-26'], ['이도훈', 'Tigers', '56635', 'R', 'R', '2007-01-06'],
  ['김겸재', 'Eagles', '52703', 'R', 'R', '1998-12-10'], ['배민서', 'Eagles', '69974', 'R', 'R', '1999-11-18', 1], ['성준서', 'Twins', '55118', 'R', 'R', '2006-04-09'], ['최용하', 'Heroes', '52163', 'R', 'R', '2002-11-29', 1], ['이승호', 'Heroes', '67603', 'L', 'L', '1999-02-08'], ['한현희', 'Giants', '62363', 'R', 'R', '1993-06-25', 1],
  ['박준혁', 'Wiz', '55002', 'R', 'R', '2006-03-10'], ['이현민', 'Wiz', '54014', 'R', 'R', '2001-10-13'], ['김현수', 'Tigers', '56664', 'R', 'R', '2007-11-08'], ['천겸', 'Lions', '55414', 'R', 'R', '2006-01-25'], ['정민성', 'Lions', '54467', 'R', 'R', '2005-05-09']]) {
  const p = P.find(q => q.kid === kid); ok(p && p.ko === nm && p.team === team && p.throws === t && p.bats === b && p.birth === birth && !p.ageEst && !!p.under === !!und, `${nm}(${kid}): ${p && [p.ko, p.team, p.throws, p.bats, p.birth, p.under].join(' ')}`); }
ok(!P.some(p => p.ko === '나종덕'), '개명 전 이름(나종덕) 남지 않음'); ok(!(P.find(q => q.kid === '55002').dh || {}).y, '박준혁(2006년생)에 2018 육성 외야수 이력이 잘못 붙지 않음');
ok(new Set(P.filter(p => p.kid).map(p => p.kid)).size === P.filter(p => p.kid).length, 'KBO ID 중복 연결 없음');
// 게임 안에서도 유지: 저장·불러오기
{ const L = League.create(base, 'Landers', 3), L2 = League.load(L.save()); const p = Object.values(L2.S.players).find(q => q.ko === '김광현' && q.team === 'Landers'); ok(p.no === '29' && p.ht === 188, '저장·불러오기 뒤 유지'); }
// KBO 1군 정규시즌 실제 기록(~2026): 표본 대조 · 연도별 합 = KBO 통산 행 · 2026 이후 없음
{ const R = P.filter(p => p.real); ok(R.length >= 700, '실제 기록 보유 ' + R.length);
  const cj = P.find(p => p.ko === '최정' && p.team === 'Landers').real, kk = P.find(p => p.ko === '김광현' && p.team === 'Landers').real;
  ok(cj.k === 'B' && cj.t[0] === 2459 && cj.t[7] === 538 && cj.y.some(y => y[0] === 2005) && cj.y.some(y => y[0] === 2026), '최정 통산 2459경기 538홈런 ' + (cj.t && [cj.t[0], cj.t[7]]));
  ok(kk.k === 'P' && kk.t[1] === 180 && kk.t[5] === 2321 * 3 + 2 && !kk.y.some(y => y[0] === 2026), '김광현 통산 180승 2321⅔이닝, 2026 기록 없음(시즌 전체 결장)');
  ok(R.every(p => !p.real.t || p.real.t.slice(0, p.real.k === 'B' ? 13 : 12).every((v, i) => v === p.real.y.reduce((a, y) => a + y[2 + i], 0))), '연도별 합 = KBO 통산 행');
  ok(R.every(p => p.real.y.every(y => y[0] >= 1982 && y[0] <= 2026)), '기록 연도 1982~2026'); }
console.log('register tests ok', n);
