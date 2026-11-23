/* 포스트시즌 대진 자가 복구: 앞 시리즈 승자가 없는데 다음 시리즈가 만들어진(상대 미정) 손상 상태에서도 진행이 막히지 않는다 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L0=League.create(base,'Lions',1);L0.faAdvance(75);L0.closeFA();L0.advance(300,false);const snap=JSON.stringify(L0.S);
const finish=L=>{const P=L.S.post;let g=0;while(!P.done&&g++<200){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else ok(L.simPostGame(),'진행 가능')}return P.done};
const upTo=(L,stage)=>{const P=L.startPostseason();let g=0;while(P.stage<stage&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}return P};
// 1) 화면 속 상태: 플레이오프가 0:0인데 한국시리즈가 상대 미정으로 만들어져 있음
{const L=League.load(snap);L.S.seed=3;const P=upTo(L,2);ok(P.cur.name==='플레이오프'&&P.cur.games.length===0,'플레이오프 시작');
 L._mkSeries(3);ok(!P.cur.lo,'손상 상태 재현(상대 미정)');ok(L._postHeal()===true,'복구');ok(P.stage===2&&P.cur.name==='플레이오프'&&P.rounds.length===3,'플레이오프로 되돌림');ok(P.cur.hi&&P.cur.lo,'팀 확정');ok(L.postNextGame(),'다음 경기');ok(finish(L)&&P.champion,'끝까지 진행')}
// 2) 플레이오프 경기 기록으로 승자가 확정되는 경우(승자만 비어 있음)
{const L=League.load(snap);L.S.seed=5;const P=upTo(L,2);let g=0;while(P.cur.name==='플레이오프'&&!P.cur.winner&&g++<10){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame();if(P.cur.winner||P.stage>2)break}
 const po=P.rounds[2];const w=po.winner;ok(w,'플레이오프 종료');po.winner=null;   // 승자만 지워 손상
 ok(L._postHeal()===true,'복구');ok(P.rounds[2].winner===w&&P.stage===3&&P.cur.lo===w||P.cur.hi===w,'기록으로 승자 재확정 → 한국시리즈 상대 확정');ok(finish(L),'끝까지 진행')}
// 3) 정상 상태는 건드리지 않는다
{const L=League.load(snap);L.S.seed=7;const P=upTo(L,1);const before=JSON.stringify(P);ok(L._postHeal()===false&&JSON.stringify(P)===before,'정상 상태 불변')}
console.log('postheal tests ok',n);

// 저장→불러오기 뒤에도 시리즈 승자가 이어지는지(현재 시리즈와 rounds가 같은 객체여야 함): 와일드카드 중간 저장 후 5위가 2연승 → 준플레이오프 상대가 정해진다
{ const fs2 = require('fs'), { League: LG } = require(__dirname + '/src/league.js'); require(__dirname + '/src/offseason.js'); const base2 = JSON.parse(fs2.readFileSync(__dirname + '/src/gamedata.json'));
  const L = LG.create(base2, 'Lions', 3); L.faAdvance(75); L.closeFA(); for (let g = 0; g < 200 && L.S.phase !== 'regular_done'; g++) L.advance(30, false);
  L.startPostseason(); const P = L.S.post, u = L.S.userTeam, seeds = P.seeds.filter(x => x !== u); seeds.splice(4, 0, u); P.seeds = seeds.slice(0, 5); P.rounds = []; L._mkSeries(0);
  let g = L.postNextGame(); L.postRecord(g.home, g.away, 2, 5, { inns: 9 });
  const L2 = LG.fromJSON(JSON.parse(JSON.stringify(L.S))); const P2 = L2.S.post; if (P2.cur !== P2.rounds[P2.stage]) throw new Error('불러온 뒤 cur와 rounds가 다른 객체');
  g = L2.postNextGame(); const ended = L2.postRecord(g.home, g.away, 1, 4, { inns: 9 });
  if (!ended || P2.stage !== 1 || P2.rounds[0].winner !== u || P2.cur.lo !== u || L2.postNextGame().away !== u) throw new Error('와일드카드 승자가 준플레이오프로 이어지지 않음 ' + JSON.stringify([ended, P2.stage, P2.rounds[0].winner, P2.cur.lo]));
  // 이미 손상된 저장(승자 없이 다음 시리즈가 만들어진 상태)도 이어서 복구
  const L3 = LG.fromJSON(JSON.parse(JSON.stringify(L2.S))); const P3 = L3.S.post; P3.rounds[0].winner = null; P3.rounds[0].games.pop(); P3.cur.lo = null; L3._postHeal(); if (P3.stage !== 0 || !L3.postNextGame()) throw new Error('손상 복구 실패');
  console.log('postheal save/load ok');
}
