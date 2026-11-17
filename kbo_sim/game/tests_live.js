const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
const assert=(c,m)=>{if(!c){console.log('실패:',m);process.exitCode=1}};
const L=League.create(base,'Lions',2027);const T='Lions';
// 1) 라이브 모드: 내 경기 직전 정지
let r=L.advance(5,true);console.log('정지:',r.status,'day',L.S.day,'내 경기 전 순위표 경기 수',L.standings().reduce((a,x)=>a+x.w+x.l+x.d,0));
assert(r.status==='userGame','내 경기에서 멈춤');
const ctx=L.startUserGame(r.game,r.idx);const g=ctx.live;
console.log('선발',ctx.prep.sp.ko,'| 결장',ctx.prep.absent.map(a=>a.out.ko+'→'+a.in.ko).join(',')||'없음','| 홈/원정',g.home,g.away);
// 2) 개입 테스트: 타석 진행 + 도루·번트·고의사구·투수교체·대타
let acts={SB:0,bunt:0,ibb:0,pc:0,ph:0,pa:0};const E=ctx.E;
while(!g.finished){
  const my=g.batSide===ctx.userSide, myField=g.fldSide===ctx.userSide;
  if(my&&g.outs===0&&g.bases[0]&&!g.bases[1]&&acts.bunt<2){g.bunt();acts.bunt++;continue}
  if(my&&g.bases[0]&&!g.bases[1]&&g.outs<2&&acts.SB<2){g.steal();acts.SB++;continue}
  if(myField&&g.bases[1]&&g.bases[2]&&!g.bases[0]&&g.outs<2&&acts.ibb<1){g.ibb();acts.ibb++;continue}
  if(my&&g.inning===7&&acts.ph<1&&g.outs<2){const bench=L.hitters(T,true).map(p=>E.batById[p.id]).filter(b=>!g.L[ctx.userSide].includes(b));g.pinchHit(ctx.userSide,g.idx[ctx.userSide]%9,bench[0]);acts.ph++;continue}
  if(myField&&g.inning===6&&acts.pc<1&&g.pitcher===g.staff[ctx.userSide].sp){const rp=L.pitchers(T,true).filter(p=>!L.S.teams[T].set.rotation.includes(p.id));g.changePitcher(ctx.userSide,E.pitById[rp[0].id]);acts.pc++;continue}
  g.step();acts.pa++;
}
console.log('경기 종료',g.away,g.score.away,':',g.score.home,g.home,'| 이닝',g.inns.length,'| 개입',JSON.stringify(acts),'| 교체',g.subs[ctx.userSide].length);
const done=L.finishUserGame(ctx);console.log('결과 반영: day',L.S.day,'| 승',done.win,'| 투수 피로',L.pitchers(T,true).filter(p=>p.fat>0).map(p=>p.ko+p.fat).join(' '));
const tot=L.standings().reduce((a,x)=>a+x.w+x.l+x.d,0);assert(tot===2*5*(L.S.day)||true,'경기수');console.log('총 소화 경기(양 팀 합)',tot,'= 일수',L.S.day,'x 10');
assert(tot===L.S.day*10,'하루 5경기 x 2팀');
// 3) 시즌 끝까지 자동 → 포스트시즌
L.advance(300,false);console.log('정규시즌 종료 phase',L.S.phase,L.standings().slice(0,5).map(x=>x.team).join('>'));
const P=L.startPostseason();let guard=0,lastStage=-1,userGames=0;
while(!P.done&&guard++<80){
  if(P.stage!==lastStage){lastStage=P.stage;console.log('  ',P.cur.name,P.cur.hi,'vs',P.cur.lo)}
  if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c);userGames++}else L.simPostGame();
}
console.log('우승',P.champion,'준우승',P.runnerUp,'| 내 팀 포스트 경기',userGames,'| 시리즈',P.rounds.map(s=>s.name+':'+s.winner+' '+(s.wc?'':s.w[s.hi]+'-'+s.w[s.lo])).join(' / '));
assert(P.done&&P.champion,'포스트시즌 종료');
// 4) 저장/불러오기 왕복
const s1=L.save();const L2=League.load(s1);console.log('저장 크기',Math.round(s1.length/1024),'KB | 로드 후 순위 동일',JSON.stringify(L2.standings())===JSON.stringify(L.standings()));
// 로드 후 이어 진행이 결정적인지: 같은 시드로 다음 시즌 첫날 결과 비교
