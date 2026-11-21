/* 드래프트 데이: 보드 스냅샷·카운트다운·해설·리포트(읽기 전용, 지명 결과는 이전과 동일) */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
for(const [seed,team] of [[5,'Lions'],[9,'Tigers']]){
 const L=League.create(base,team,seed);L.faAdvance(75);L.closeFA();season(L);const S=L.S;const off=L.startOffseason();for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}L.finishContracts();
 ok(L.draftDay()===null&&L.draftReport()===null,'드래프트 전에는 null');const d=L.buildDraft();const snap0=JSON.stringify(S);
 ok(d.board&&d.board.length===d.pool.length&&new Set(d.board).size===d.board.length&&d.board.every(id=>d.pool.includes(id)),'보드는 풀의 순열');ok(d.board.every((id,i)=>i===0||L.userScore(S.players[d.board[i-1]])>=L.userScore(S.players[id])),'보드는 내 평가 순');
 const dd0=L.draftDay();ok(dd0.total===d.order.length&&dd0.per===10&&dd0.grid.length===11&&dd0.grid.every(r=>r.length===10),'보드 격자 11라운드×10');ok(JSON.stringify(S)===snap0,'조회는 상태를 바꾸지 않음');
 const mineIdx=d.order.map((tm,i)=>tm===S.userTeam?i:-1).filter(i=>i>=0);ok(dd0.myTotal===mineIdx.length&&dd0.myTotal===11&&dd0.myLeft===11&&dd0.nextMine===mineIdx[0]+1&&dd0.untilMine===mineIdx[0],'내 순번·카운트다운');ok(dd0.last===null&&dd0.lastRx===null&&!dd0.done,'시작 상태');
 // 한 픽씩 진행하며 카운트다운·해설 검증(AI 선택은 draftAiStep 그대로)
 let steps=0,rx=[];while(L.draftOnClock()&&steps++<300){const dd=L.draftDay();const exp=mineIdx.find(i=>i>=d.pick);ok(dd.untilMine===(exp===undefined?null:exp-d.pick)&&dd.pick===d.pick,'카운트다운 일치 '+d.pick);ok(dd.round===Math.floor(d.pick/10)+1||dd.round===11,'라운드');
  if(L.draftOnClock()===S.userTeam){const best=d.pool.map(id=>S.players[id]).sort((a,b)=>L.userScore(b)-L.userScore(a))[0];const e=L.draftPick(best.id);if(e){ok(/대졸/.test(e),'대졸 의무 거절 사유 '+e);L.draftPick(d.pool.find(id=>S.players[id].pro&&S.players[id].pro.univ))}}else L.draftAiStep();
  const x=d.picks[d.picks.length-1];if(x){const r=L.draftReaction(x),i=d.board.indexOf(x.id);ok(r.rank===i+1&&r.pick===x.pick&&r.diff===x.pick-(i+1),'해설 순위·차이');ok(r.kind===(r.diff>=10&&r.rank<=40?'steal':r.diff<=-10?'reach':'fair'),'해설 분류');ok(r.mine===(x.team===S.userTeam),'내 지명 표시');rx.push(r)}}
 ok(d.pick===d.order.length&&L.draftDay().done&&L.draftDay().untilMine===null&&L.draftDay().myLeft===0,'종료 상태');
 const dd=L.draftDay();ok(dd.grid.flat().every(c=>c.id&&c.rx),'모든 칸이 채워지고 해설 있음');ok(dd.grid.flat().filter(c=>c.mine).length===11,'내 칸 11개');ok(new Set(dd.grid.flat().map(c=>c.id)).size===110,'지명 110명 중복 없음');
 const rp=L.draftReport();ok(rp&&rp.mine.length===11&&rp.first.length===10,'리포트');ok(rp.mine.every(x=>x.round===Math.floor((x.pick-1)/10)+1&&S.players[x.id].team===S.userTeam),'내 지명의 라운드·소속');ok(rp.avgRank===Math.round(rp.mine.reduce((a,x)=>a+x.rank,0)/11*10)/10,'평균 보드 순위');
 ok(rp.best&&rp.mine.every(x=>x.diff<=rp.best.diff),'최대 스틸');ok(rp.steals===rp.mine.filter(x=>x.kind==='steal').length&&rp.reaches===rp.mine.filter(x=>x.kind==='reach').length,'스틸·이른 지명 집계');ok(rp.mine.every(x=>x.est&&Number.isFinite(x.est.o)),'추정 능력');
 ok(!JSON.stringify(dd).includes('peak')&&!JSON.stringify(rp).includes('peak'),'숨은 잠재력 비노출');
 // 해설은 지명 결과를 바꾸지 않는다: 같은 시드로 해설 호출 없이 진행해도 같은 지명
 const L2=League.create(base,team,seed);L2.faAdvance(75);L2.closeFA();season(L2);const o2=L2.startOffseason();for(const id of o2.rep.expiring.slice()){const p=L2.S.players[id];if(!p.foreign&&L2.ovr(p)>=48)L2.resign(id)}L2.finishContracts();const d2=L2.buildDraft();let g2=0;while(L2.draftOnClock()&&g2++<300){if(L2.draftOnClock()===L2.S.userTeam){const best=d2.pool.map(id=>L2.S.players[id]).sort((a,b)=>L2.userScore(b)-L2.userScore(a))[0];L2.draftPick(best.id)}else L2.draftAiStep()}
 ok(JSON.stringify(d.picks)===JSON.stringify(d2.picks),'지명 결과 동일');ok(L.integrity().errors.filter(e=>e.code!=='dup-name').length===0,'무결성');}
console.log('draftday tests ok '+n);
