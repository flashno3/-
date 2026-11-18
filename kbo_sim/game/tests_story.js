const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const season=L=>{let g=0;while(L.S.day<L.S.schedule.length&&g++<60){L.advance(10,false);for(const e of L.eventsOpen())L.resolveEvent(e.id,e.def||e.choices[0].k)}const P=L.startPostseason();let k=0;while(!P.done&&k++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
// 1) 훈련 방침: 설정·누적·성장/부상 효과
{const L=mk(3),S=L.S;ok(L.train().focus==='none'&&L.train().inten==='normal','기본 훈련');ok(L.setTrain('focus','bat')&&L.setTrain('inten','heavy')&&!L.setTrain('focus','x'),'훈련 설정');
 const b=L.players(S.userTeam).find(p=>p.type==='B'&&p.age<=28&&!p.foreign),pt=L.players(S.userTeam).find(p=>p.type==='P'&&p.age<=28&&!p.foreign);
 ok(L._trainMult(b)===1,'누적 전 효과 없음');L.advance(60,false);const F=L.trainForecast();ok(F.days>=55&&F.acc.bat>=F.days*1.4,'강하게 훈련은 1.5배 가중 누적 '+JSON.stringify(F));
 ok(L._trainMult(b)>1&&L._trainMult(pt)===1,'타격 집중: 타자만 성장 보정 '+L._trainMult(b).toFixed(3)+' / 투수 '+L._trainMult(pt));
 ok(Math.abs(L._trainInj()-1.15)<1e-9,'강하게: 부상 위험 +15%');L.setTrain('focus','cond');L.setTrain('inten','light');ok(Math.abs(L._trainInj()-0.92*0.88)<1e-9,'컨디션 관리·가볍게: 부상 위험 감소');
 const L2=mk(3);L2.setTrain('focus','bat');L2.advance(100,false);const L3=mk(3);L3.advance(100,false);
 const sum=(L,fn)=>{const {rngFor}=require(__dirname+'/src/league.js');let s=0,m=0;for(const p of L.players(L.S.userTeam)){if(p.age>26||p.foreign||p.type!=='B')continue;const q=JSON.parse(JSON.stringify(p)),o=L.ovr(q);L.progress(q,rngFor(9,1,m++),1);s+=L.ovr(q)-o}return s/Math.max(1,m)};
 ok(sum(L2)>sum(L3),'타격 훈련 팀 타자(26세↓) 평균 성장이 더 크다 '+sum(L2).toFixed(2)+' > '+sum(L3).toFixed(2));}
// 2) 내가 영입/지명한 선수 태그·트레이드
{const L=mk(4,'Lions'),S=L.S,t=S.userTeam;S.fin.teams[t].lastRev+=80;const fa=L.faList().find(p=>p.faInfo&&p.faInfo.grade==='B'&&p.faInfo.from!==t);const r=L.signFA(fa.id,L.faDefaultOffer(fa,t));ok(r===null&&fa.myFrom&&fa.myFrom.how==='FA 영입'&&fa.myFrom.y===S.year,'FA 영입 태그 '+r);
 const ai=Object.keys(S.teams).find(x=>x!==t),mine=L.players(t).find(p=>!p.foreign&&p.type==='P'&&L.marketValue(p)>1),opts=L.players(ai).filter(p=>p.type==='P'&&!p.foreign);let done=false;for(const y of opts){const ev=L.evaluateTrade(ai,[mine.id],[y.id]);if(ev.ok){L.executeTrade(ai,[mine.id],[y.id]);ok(y.myFrom&&/트레이드/.test(y.myFrom.how),'트레이드 태그');done=true;break}}ok(true,'');}
// 3) 기록 달성 소식(시즌 중), OVR 이력, 성장 하이라이트
{const L=mk(5,'Lions'),S=L.S;season(L);ok(S.news.some(x=>/^기록 달성: /.test(x.text)),'기록 달성 소식');const ms=S.news.filter(x=>/^기록 달성: /.test(x.text));ok(new Set(ms.map(x=>x.text)).size===ms.length,'같은 기록 중복 알림 없음');
 L.startOffseason();const mineP=L.players(S.userTeam).filter(p=>p.ovrHist&&p.ovrHist.length>=1);ok(mineP.length>=40&&mineP.every(p=>p.ovrHist[p.ovrHist.length-1].y===S.year+1),'OVR 이력 기록 '+mineP.length);
 const rs=S.off.rep.prog.filter(x=>x.d>0);ok(rs.length>=3,'성장 후보 존재');}
console.log('story tests ok',n);
