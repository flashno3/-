/* 포스트시즌 선발: 같은 투수 연속 선발 없음 · 4일 이상 휴식(가능할 때) · AI도 1군 선발만 (이전: 2군 투수가 후보에 섞여 엔진이 1선발로 대신 세워 연속 선발 8%) */
const fs = require('fs'), assert = require('assert'); const { League } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js');
const base = JSON.parse(fs.readFileSync(__dirname + '/src/gamedata.json')); let n = 0; const ok = (c, m) => { n++; if (!c) throw new assert.AssertionError({ message: m }); };
let starts = 0, short = 0;
for (const [seed, team] of [[3, 'Bears'], [9, 'Twins'], [11, 'Wiz'], [13, 'Eagles']]) {
  const L = League.create(base, team, seed), S = L.S; L.faAdvance(75); L.closeFA(); L.advance(300, false); const P = L.startPostseason(); let g = 0;
  const pick = []; const orig = L._postStarter.bind(L); L._postStarter = function (t, s) { const p = orig(t, s); pick.push({ t, p, day: S.post.day || 0, act: p.active, inj: this.isInj(p) }); return p; };
  while (!P.done && g++ < 100) { if (L.userInPost()) { const c = L.startUserPostGame(); c.live.playToEnd(); L.finishUserPostGame(c); } else L.simPostGame(); }
  ok(pick.every(x => x.act && !x.inj && x.p.team === x.t), `시드 ${seed}: 고른 선발은 모두 1군·건강`);
  const games = []; for (const s of P.rounds.filter(Boolean)) for (const x of s.games) games.push(x);
  const last = {}; for (const x of games) for (const [t, sp] of [[x.home, x.spH], [x.away, x.spA]]) { starts++; ok(!(last[t] && last[t] === sp), `시드 ${seed}: ${t} ${sp} 연속 선발`); last[t] = sp; }
  const lastDay = {}; for (const x of pick) { const d0 = lastDay[x.p.id]; if (d0 !== undefined && x.day - d0 < 4) short++; lastDay[x.p.id] = x.day; }
  ok(games.every(x => x.spH && x.spA), `시드 ${seed}: 모든 경기에 선발 기록`);
}
ok(short <= starts * 0.05, `휴식 4일 미만 선발은 드묾 ${short}/${starts}`);
console.log('poststart tests ok', n, `(선발 ${starts}, 4일 미만 ${short})`);
