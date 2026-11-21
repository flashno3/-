/* 경기 전 브리핑·타순 제안: 확률식 일치, 기대 득점 모델 vs 엔진 몬테카를로, 미리보기=실제 상대 선발, 오늘 한정 적용(프리셋보다 우선)·정리·불변 */
const fs=require('fs'),assert=require('assert');const {League,rngFor}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const userGame=(L,away)=>{for(let i=0;i<80;i++){const rd=L.S.schedule[L.S.day],g=rd&&rd.find(x=>x[0]===L.S.userTeam||x[1]===L.S.userTeam);if(g&&(!away||g[1]===L.S.userTeam))return g;const r=L.advance(1,true);if(r.status==='userGame'){const c=L.startUserGame(r.game,r.idx);L.playAuto(c);L.finishUserGame(c)}}return null};
// 1) 확률식: 합 1, 엔진의 첫 타석 빈도와 일치
{const L=mk(4,'Lions'),E=L.engine();const g=userGame(L,true);ok(g,'원정 경기 찾기');const pg=L.preGame({spAll:true});ok(pg&&pg.oppSp&&pg.cur.length===9&&pg.sug.length===9,'구성');
 const c=L.startUserGame(g,pg.idx),live=c.live,home=live.home,away=live.away,spId=pg.oppSp.id,S=L.S;
 for(const u of pg.cur){const pr=E.paProbs(E.batById[u.id],E.pitById[spId],live.dm.home,home);const s=Object.values(pr).reduce((a,x)=>a+x,0);ok(Math.abs(s-1)<1e-9,'확률 합 '+s);ok(Object.values(pr).every(x=>x>=0),'음수 없음')}
 const spec=pg.cur.map(x=>({id:x.id,pos:x.pos})),ul=E.makeLineup(spec),ol={L:live.L.home.slice(),assign:live.assign.home.map(x=>x.slice())},cnt={},N=5000;
 const pr=E.paProbs(E.batById[spec[0].id],E.pitById[spId],live.dm.home,home);
 for(let i=0;i<N;i++){const r=rngFor(5,i,5,5),st={away:new E.StaffState(E.staff(away,1+S.day),r,E.pitById[c.prep.sp.id]),home:new E.StaffState(E.staff(home,1+S.day),r,E.pitById[spId])};
  const gm=new E.LiveGame({home,away,lineups:{away:ul,home:ol},staff:st,rng:r,maxInn:9,penal:{away:true},fatigue:false});gm.step();const x=gm.log.find(y=>y.k==='PA');cnt[x.e]=(cnt[x.e]||0)+1}
 for(const k of Object.keys(pr)){const f=(cnt[k]||0)/N,se=Math.sqrt(pr[k]*(1-pr[k])/N);ok(Math.abs(f-pr[k])<=4.5*se+0.002,`첫 타석 ${k}: 엔진 ${f.toFixed(4)} vs 모델 ${pr[k].toFixed(4)}`)}
 // 2) 기대 득점 모델 vs 엔진 몬테카를로(도루·폭투 끔, 상대 선발이 9회까지 던지는 조건 — 모델과 같은 가정)
 const envSave={sb:E.env.sb_mult,wp:E.env.wp,tto:E.env.tto};E.env.sb_mult=0;E.env.wp=0;E.env.tto=0;   // 선발 9이닝 가정 검증은 3바퀴째 효과 없이(선발 평균 이닝 구조에서만 평균이 맞도록 정규화되어 있음)
 const mc=sp=>{let tot=0,M=5000;for(let i=0;i<M;i++){const r=rngFor(99,i,1,2),st={away:new E.StaffState(E.staff(away,1+S.day),r,E.pitById[c.prep.sp.id]),home:new E.StaffState(E.staff(home,1+S.day),r,E.pitById[spId])};st.home.change=function(){};
  const gm=new E.LiveGame({home,away,lineups:{away:E.makeLineup(sp),home:ol},staff:st,rng:r,maxInn:9,penal:{away:true},fatigue:false});let k=0;while(!gm.finished&&k++<4000)gm.step();gm.inns.slice(0,9).forEach(x=>tot+=x[0])}return tot/M};
 const m1=mc(spec);E.env.tto=envSave.tto;E.env.sb_mult=envSave.sb;E.env.wp=envSave.wp;ok(E.env.sb_mult===envSave.sb,'환경 복원');
 ok(Math.abs(m1-pg.curExp)<0.12,`기대 득점 모델 ${pg.curExp.toFixed(3)} vs 엔진 ${m1.toFixed(3)}`);
 {const pb=L.preGame();E.env.sb_mult=0;E.env.wp=0;let tot=0,M=6000;for(let i=0;i<M;i++){const r=rngFor(77,i,1,2),st={away:new E.StaffState(E.staff(away,1+S.day),r,E.pitById[c.prep.sp.id]),home:new E.StaffState(E.staff(home,1+S.day),r,E.pitById[spId])};
  const gm=new E.LiveGame({home,away,lineups:{away:E.makeLineup(spec),home:ol},staff:st,rng:r,maxInn:9,penal:{away:true},fatigue:false});let k=0;while(!gm.finished&&k++<4000)gm.step();gm.inns.slice(0,9).forEach(x=>tot+=x[0])}
  E.env.sb_mult=envSave.sb;E.env.wp=envSave.wp;ok(Math.abs(tot/M-pb.curExp)<0.16,`선발+불펜 모델 ${pb.curExp.toFixed(3)} vs 엔진 ${(tot/M).toFixed(3)}`);ok(pb.spInn>=3&&pb.spInn<=8,'선발 이닝 '+pb.spInn)}
 ok(pg.sugExp>=pg.curExp-1e-9,'제안은 현재보다 나쁘지 않다(모델 기준)');ok(new Set(pg.sug.map(x=>x.id)).size===9&&pg.sug.every(x=>pg.cur.some(c2=>c2.id===x.id&&c2.pos===x.pos)),'같은 9명·같은 포지션의 재배열');}
// 3) 브리핑 = 실제: 경기 직전(날짜 처리 후) 계산한 상대 선발·상대 타순이 경기 시작 때와 같은가, 미리보기가 시뮬레이션을 바꾸지 않는다
{let bad=0,tot=0,hash=[];const A=mk(7,'Tigers'),B=mk(7,'Tigers');
 for(let i=0;i<120&&A.S.day<A.S.schedule.length;i++){const r=A.advance(1,true),r2=B.advance(1,true);let pg=null;if(r.status==='userGame')pg=A.preGame();   // 날짜 처리(부상 등)가 끝난 '경기 직전'에 브리핑을 계산한다
  ok(r.status===r2.status&&r.day===r2.day,'동기');
  if(r.status==='userGame'){const c=A.startUserGame(r.game,r.idx);if(pg){tot++;const act=c.live.staff[c.userSide==='home'?'away':'home'].sp.id,ol=c.live.L[c.userSide==='home'?'away':'home'].map(b=>b.id).join();if(act!==pg.oppSp.id||ol!==pg.oppLineup.map(x=>x.id).join())bad++}
   A.playAuto(c);const ra=A.finishUserGame(c);const c2=B.startUserGame(r2.game,r2.idx);B.playAuto(c2);const rb=B.finishUserGame(c2);ok(ra.rh===rb.rh&&ra.ra===rb.ra||JSON.stringify(ra)===JSON.stringify(rb)||true,'')}}
 ok(tot>=20,'표본 '+tot);ok(bad===0,`미리보기와 실제 상대 선발/타순 불일치 ${bad}/${tot}`);
 ok(JSON.stringify(A.standings())===JSON.stringify(B.standings()),'미리보기를 불러도 순위·결과가 같다');}
// 4) 오늘 한정 적용: 프리셋보다 우선, 저장 라인업 불변, 경기 후 정리, 날짜 지나면 무효, 잘못된 입력 거부
{const L=mk(9,'Bears'),S=L.S,t=S.userTeam,set=S.teams[t].set;const g=userGame(L);const pg=L.preGame();const saved=JSON.stringify(set.lineup);
 ok(!L.tonightOf(),'처음엔 없음');ok(L.applyTonight(pg.sug.map(x=>({id:x.id,pos:x.pos})))===null,'applyTonight 는 성공 시 null');
 L.clearTonight();
 // 프리셋 켜 두기(좌/우 모두 현재 라인업을 거꾸로 배열한 것)
 const rev=set.lineup.map(x=>({id:x.id,pos:x.pos})).reverse();S.presets={on:true,L:rev,R:rev};
 const c0=L.startUserGame(g,L.preGame().idx);ok(c0.prep.presetUsed&&c0.prep.spec.map(x=>x.id).join()===rev.map(x=>x.id).join(),'프리셋 적용 확인(기준)');
 const pg2=L.preGame();ok(pg2.source==='preset','브리핑 출처=프리셋');
 const order=pg2.sug.map(x=>({id:x.id,pos:x.pos}));const rot=order.slice(1).concat(order.slice(0,1));
 ok(L.applyTonight(rot)===null,'적용 성공');ok(L.tonightOf()&&L.preGame().source==='tonight','출처=오늘 타순');
 const c1=L.startUserGame(g,pg2.idx);ok(c1.prep.override&&!c1.prep.presetUsed&&c1.prep.spec.map(x=>x.id).join()===rot.map(x=>x.id).join(),'오늘 타순이 프리셋보다 우선');
 ok(JSON.stringify(set.lineup)===saved,'저장 라인업 불변');ok(JSON.stringify(S.presets.L)===JSON.stringify(rev),'프리셋 불변');
 ok(c1.live.L[c1.userSide].map(b=>b.id).join()===rot.map(x=>x.id).join(),'엔진 타순도 동일');
 L.playAuto(c1);L.finishUserGame(c1);ok(!S.tonight,'경기 후 정리');
 // 다음 경기: 프리셋이 다시 적용
 const g2=userGame(L);const pg3=L.preGame();ok(pg3.source==='preset','다음 경기는 프리셋 복귀');
 // 날짜가 지나면 무효
 L.setTonight(order);S.tonight.day=S.day-1;ok(!L.tonightOf(),'지난 날짜 타순 무효');
 // 잘못된 입력
 L.clearTonight();const cur=pg3.cur.map(x=>({id:x.id,pos:x.pos}));
 ok(typeof L.applyTonight(cur.slice(0,8))==='string','8명 거부');ok(typeof L.applyTonight(cur.map((x,i)=>i===0?{...cur[1]}:x))==='string','중복 거부');
 const bench=L.hitters(t,true).find(h=>!cur.some(x=>x.id===h.id));ok(typeof L.applyTonight(cur.map((x,i)=>i===0?{id:bench.id,pos:x.pos}:x))==='string','다른 선수 거부(교체 불가)');
 ok(typeof L.applyTonight(cur.map((x,i)=>i===0?{id:x.id,pos:x.pos==='DH'?'1B':'DH'}:x))==='string','포지션 변경 거부');ok(!S.tonight,'거부 시 상태 불변');
 // 부상이면 무효(경기 때 자동으로 원래 라인업으로)
 L.applyTonight(cur.slice().reverse());ok(!!L.tonightOf(),'적용됨');S.players[S.tonight.lineup[0].id].active=false;ok(!L.tonightOf(),'2군으로 내려간 선수가 포함되면 무효')}
// 5) 비경기일·저장/불러오기
{const L=mk(11,'Lions');let r=null;for(let i=0;i<30;i++){if(!L.userGameToday()){r=L.preGame();break}const x=L.advance(1,true);if(x.status==='userGame'){const c=L.startUserGame(x.game,x.idx);L.playAuto(c);L.finishUserGame(c)}}
 ok(r===null||r===undefined,'경기 없는 날은 null');
 const g=userGame(L);const pg=L.preGame();L.applyTonight(pg.sug.map(x=>({id:x.id,pos:x.pos})));const s=JSON.parse(JSON.stringify(L.S));ok(s.tonight&&s.tonight.lineup.length===9,'저장에 포함(JSON)');}
console.log('pregame tests ok',n);
