/* 수상 레이스(48단계): 레이스 계산 = 시즌 뒤 시상. 정규시즌 끝의 레이스 1위가 그대로 수상, 순위 정렬·규정·신인 자격, 4주마다 기사 */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
const BAD = /undefined|NaN|\[object|null/;
for (const [seed, team] of [[7, 'Bears'], [12, 'Heroes']]) {
  const L = League.create(base, team, seed), S = L.S; L.faAdvance(75); L.closeFA();
  ok(L.awardRace().mvp.length === 0, '개막 전: 후보 없음');
  L.advance(60, false); const R1 = L.awardRace();
  ok(R1.mvp.length > 0 && R1.mvp.every((x, i, a) => !i || a[i - 1].v >= x.v), '중간: MVP 가치 내림차순');
  ok(R1.titles.find(x => x[0] === '타율왕')[1].every(x => x.PA >= 3.1 * R1.games), '중간: 타율 후보는 규정 타석 이상');
  ok(R1.gg.length === 8 && R1.gg.every(g => g.list.every(x => (g.lab === '투수') === (x.ops === undefined))), '골든글러브 8개 부문, 투수/타자 구분');
  const ggIds = R1.gg.flatMap(g => g.list.slice(0, g.n).map(x => x.p.id)); ok(new Set(ggIds).size === ggIds.length, '골든글러브 수상권 중복 없음');
  ok(R1.rookie.every(m => !m.x.p.foreign && (m.x.ops !== undefined ? m.x.PA >= 60 : m.x.outs >= 45)), '신인왕 후보: 외국인 제외·최소 기록');
  while (S.phase === 'regular' || S.phase === 'preseason') L.advance(10, false);
  const R = L.awardRace(), win = { MVP: R.mvp[0] && R.mvp[0].x.p.id, '신인왕': R.rookie[0] && R.rookie[0].x.p.id }; for (const [lab, l] of R.titles) win[lab] = l[0] && l[0].p.id;
  const ggWin = R.gg.flatMap(g => g.list.slice(0, g.n).map(x => ['골든글러브 ' + g.lab, x.p.id]));
  const P = L.startPostseason(); let g = 0; while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); }
  L.startOffseason(); const aw = S.awardsHist.slice(-1)[0].awards;
  for (const [lab, id] of Object.entries(win)) if (id) ok((aw.find(a => a.label === lab) || {}).id === id, `정규시즌 끝 레이스 1위 = 수상(${lab})`);
  ok(ggWin.every(([lab, id]) => aw.some(a => a.label === lab && a.id === id)) && aw.filter(a => /^골든글러브/.test(a.label)).length === ggWin.length, '골든글러브 수상권 = 수상');
  const news = S.lgnews.filter(x => x.cat === '수상 레이스'); ok(news.length >= 4 && news.length <= 8, '4주마다 수상 레이스 기사 ' + news.length);
  ok(news.every(x => /^MVP 레이스 — /.test(x.head) && !BAD.test(x.head + x.body) && x.teams.every(t => t in S.teams)), '기사 문장·구단 정합 ' + (news[0] || {}).head);
}
console.log('awardrace tests ok', n);
