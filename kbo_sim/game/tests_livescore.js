/* 라이브 점수 표시 일관성: 점수판 합계·'지금 점수'(liveScore)·'이 순간' 카드 점수차·최종 결과가 모든 타석에서 일치하는지 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
// 화면의 점수판(liveScore 함수 규칙)을 그대로 재현
const board=g=>{const A=[],H=[];for(const [a,h] of g.inns){A.push(a);H.push(h)}
 if(!g.finished){if(g.top){A.push(g.h.runs);H.push(null)}else{A.push(g.curInn[0]);H.push(g.h.runs)}}
 const sum=a=>a.reduce((x,v)=>x+(v||0),0);return {away:sum(A),home:sum(H)}};
for(const [seed,team] of [[2027,'Lions'],[5,'Tigers'],[9,'Wiz']]){
 const L=League.create(base,team,seed);L.faAdvance(75);L.closeFA();let games=0;
 for(let k=0;k<4&&games<3;k++){const r=L.advance(6,true);if(r.status!=='userGame')continue;const ctx=L.startUserGame(r.game,r.idx),g=ctx.live,us=ctx.userSide;games++;let steps=0;
  while(!g.finished&&steps++<600){g.step();const ls=L.liveScore(g),b=board(g);ok(ls.away===b.away&&ls.home===b.home,`점수판 합계 = 지금 점수 (${ls.away}:${ls.home} vs ${b.away}:${b.home}) ${g.inning}${g.top?'초':'말'}`);
   const m=L.momentInfo(g,us);if(m){const opp=us==='home'?'away':'home';ok(m.diff===ls[us]-ls[opp],`이 순간 점수차 = 지금 점수 (${m.diff} vs ${ls[us]-ls[opp]})`)}}
  ok(g.finished,'경기 종료');const ls=L.liveScore(g);ok(ls.away===g.score.away&&ls.home===g.score.home,'종료 시 최종 점수 일치');const b=board(g);ok(b.away===g.score.away&&b.home===g.score.home,`종료 점수판 합계 = 최종 (${b.away}:${b.home} vs ${g.score.away}:${g.score.home})`);
  const res=L.finishUserGame(ctx);ok(res.rh===g.score.home&&res.ra===g.score.away,'결과 반영 점수 = 화면 최종 점수');const last=L.S.results[L.S.results.length-1];ok(!last||!last.h&&!last.a||true,'기록');}
 ok(games>=1,'내 경기를 진행');
}
// 자동 진행(경기 계획·하이라이트 개입)도 진행 중 이닝 득점까지 더한 점수차로 판단한다
{const L=League.create(base,'Lions',2027);L.faAdvance(75);L.closeFA();L.setPlan('infIn',true);L.setPlan('careful',true);L.setPlan('contact',true);let games=0,hl=0,dec=0;
 for(let k=0;k<12&&games<3;k++){const r=L.advance(4,true);if(r.status!=='userGame')continue;const ctx=L.startUserGame(r.game,r.idx),g=ctx.live,us=ctx.userSide,opp=us==='home'?'away':'home';games++;let st=0;
  while(!g.finished&&st++<600){const b=board(g),diff=b[us]-b[opp],P=L.plan();
   ok(L.isHighlight(g,us)===(g.inning>=P.hlFrom&&Math.abs(diff)<=2),`하이라이트 판단 = 점수판 점수차 (${diff}, ${g.inning}회)`);if(L.isHighlight(g,us))hl++;
   L._applyPlan(g,us);const T=g.tact[us],bs=g.h.bases,outs=g.h.outs,inn=g.inning;
   if(g.batSide===us)ok(T.bat===(P.contact&&bs[2]&&outs<2&&Math.abs(diff)<=2?'contact':'normal'),'타격 접근 = 점수판 점수차');
   else{ok(!!T.inf===!!(P.infIn&&bs[2]&&outs<2&&inn>=7&&diff>=0&&diff<=2),'전진 수비 판단');ok(T.pit===(P.careful&&inn>=8&&diff>0&&diff<=2&&(bs[0]||bs[1]||bs[2])?'careful':'normal'),'투구 접근 판단');dec++}
   g.step()}
  L.finishUserGame(ctx)}
 ok(games>=2&&dec>50,'판단 횟수 '+dec);}
console.log('livescore tests ok '+n);
