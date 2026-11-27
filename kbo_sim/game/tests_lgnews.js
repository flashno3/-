/* 감독 자리·리그 뉴스(47단계) */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const BAD = /undefined|NaN|\[object|null/;
// 1) 감독 자리: 시작 시 사용자, 원래 감독은 퇴임·후보 명단, 이름 변경이 기사에도 반영
{ const L = League.create(base, 'Giants', 3), S = L.S, C = S.coach;
  ok(C.mgr.Giants.user && C.mgr.Giants.name === '나', '우리 구단 감독 = 사용자(기본 이름 나)');
  const old = C.pool.find(m => m.from === 'Giants'); ok(old && old.why === '퇴임' && old.name, '원래 감독은 후보 명단 ' + (old && old.name));
  ok(Object.keys(C.mgr).filter(t => C.mgr[t].user).length === 1, '사용자 감독은 한 구단뿐');
  const it = S.lgnews.find(x => x.cat === '감독'); ok(it && it.head.includes(old.name) && it.body.includes('나 신임'), '감독 교체 기사');
  L.setMgrName('홍<길>동'); ok(C.mgr.Giants.name === '홍길동' && it.body.includes('홍길동 신임'), '이름 변경 반영(태그 문자 제거) ' + it.body);
  // 예전 저장: 실존 감독이 우리 구단에 남아 있으면 불러올 때 퇴임 처리
  const raw = JSON.parse(L.save()); raw.coach.mgr.Giants = { name: old.name, src: '' }; raw.coach.pool = []; delete raw.lgnews;
  const L2 = League.load(JSON.stringify(raw)); ok(L2.S.coach.mgr.Giants.user && L2.S.coach.pool.some(m => m.name === old.name), '예전 저장 불러오기: 퇴임 처리');
  // 구단 이동
  const prev = C.mgr.Tigers.name; ok(L.takeOverTeam('Tigers'), '구단 이동'); ok(C.mgr.Tigers.user && C.mgr.Tigers.name === '홍길동' && !C.mgr.Giants.user && C.mgr.Giants.name, '이동 뒤 감독 자리');
  ok(C.pool.some(m => m.name === prev && m.from === 'Tigers'), '새 구단 전임 감독은 후보로'); ok(S.lgnews[0].cat === '감독' && /지휘봉/.test(S.lgnews[0].head), '이동 기사'); }
// 2) 한 시즌 리그 뉴스: 분류·문장 정합성, 포스트시즌·감독 교체
{ const L = League.create(base, 'Bears', 5), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(300, false);
  const cats = {}; for (const x of S.lgnews) cats[x.cat] = (cats[x.cat] || 0) + 1;
  ok(['순위', '기록', '파워랭킹', '연승·연패'].every(c => cats[c] > 0), '정규시즌 기사 분류 ' + JSON.stringify(cats));
  ok(S.lgnews.length >= 30 && S.lgnews.length <= 300, '기사 수 ' + S.lgnews.length);
  ok(S.lgnews.every(x => x.head && !BAD.test(x.head) && !BAD.test(x.body)), '기사 문장에 오류 문자열 없음 ' + (S.lgnews.find(x => BAD.test(x.head) || BAD.test(x.body)) || {}).head);
  ok(S.lgnews.every(x => (x.teams || []).every(t => t in S.teams)), '기사 구단 코드 정합');
  const mine = L.lgNewsList({ mine: true }); ok(mine.every(x => x.teams.includes('Bears')), '우리 구단 관련 필터');
  const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); }
  ok(S.lgnews.some(x => x.cat === '포스트시즌' && /우승/.test(x.head)) && S.lgnews.filter(x => x.cat === '포스트시즌').length >= 4, '포스트시즌 기사');
  let changed = 0; for (let k = 0; k < 1; k++) { const before = JSON.stringify(S.coach.mgr); L.startOffseason(); const after = S.coach.mgr; changed = Object.keys(after).filter(t => after[t].name !== JSON.parse(before)[t].name).length; }
  ok(S.coach.mgr.Bears.user, '오프시즌에도 우리 감독 유지'); ok(changed <= 2, 'AI 감독 교체는 하위권 일부 ' + changed);
  if (changed) ok(S.lgnews.some(x => x.cat === '감독' && /경질|교체/.test(x.head)), 'AI 감독 교체 기사'); }
console.log('lgnews tests ok', n);
