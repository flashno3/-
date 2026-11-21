/* 훈련 효과 분석 · 기술 습득 프로젝트 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
const mk=seed=>{const L=League.create(base,'Lions',seed||5);L.faAdvance(75);L.closeFA();L.S.fin.teams[L.S.userTeam].lastRev+=100;return L};
// B5 훈련 효과 분석: 연말 성장에서 기록, 변화·기여 합산, 캠프·부상 반영
{const L=mk(),S=L.S,t=S.userTeam;ok(L.trainReport()===null,'첫 연말 전에는 없음');L.setTrainSide('B','focus','all');L.setTrainSide('P','focus','all');L.setTrainSide('B','inten','heavy');L.setTrainGroup('SP','focus','stuff');
 const y=L.players(t).filter(p=>p.age<=24&&!p.foreign).slice(0,2);for(const p of y)L.slotAddWeak?L.slotAddWeak(p.id):0;
 season(L);L.startOffseason();const r=L.trainReport();ok(r&&r.y===S.year&&r.n>=10,'리포트 '+(r&&r.n));
 ok(r.groups.length>=3&&r.groups.every(g=>g.n>0&&g.attr>=0),'그룹별 집계');ok(Math.abs(r.total-r.groups.reduce((a,g)=>a+g.attr,0))<0.06,'총합 = 그룹 합');
 ok(r.top.every((x,i)=>i===0||r.top[i-1].attr>=x.attr)&&r.top.length<=5,'상위 정렬');ok(r.slots.every(x=>x.src==='slot')&&r.slots.length>=1,'개별 훈련 성과');
 const rows=S.trainRep.rows;ok(rows.every(x=>x.mult>=1&&(x.d<=0||x.attr<=x.d)),'기여는 실제 성장 이하(양의 성장분의 일부)');ok(rows.every(x=>x.d>0||x.attr===0),'성장 없으면 기여 0');
 ok(r.inj===(S.injHist[S.year]||0)&&r.camp.cost===0,'부상·캠프(없음)');ok(r.eff===null,'캠프가 없으면 효율 표시 없음');ok(r.hist.length===1&&r.hist[0].y===S.year,'연도별 이력');
 // 두 번째 해: 캠프 비용 대비 효율
 for(const id of S.off.rep.expiring.slice())L.resign(id);L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();L.faAdvance(75);L.closeFA();
 ok(L.setCamp('B','all',2)===null&&L.setCamp('P','all',1)===null,'캠프 설정');const cost=L.campTotalCost();L.startNewSeason();ok(S.campHist[S.year].cost===cost&&cost>0,'캠프 이력 '+JSON.stringify(S.campHist));
 season(L);L.startOffseason();const r2=L.trainReport();ok(r2.camp.cost===cost&&(r2.total===0||r2.eff===Math.round(r2.total/cost*100)/100),'효율 = 기여/캠프 비용');ok(r2.hist.length===2,'2년 이력')}
// B4 기술 프로젝트
{const L=mk(7),S=L.S,t=S.userTeam;const bat=L.players(t).find(p=>p.type==='B'&&!p.foreign&&p.age<30),pit=L.players(t).find(p=>p.type==='P'&&!p.foreign&&p.age<30);
 ok(L.skillKinds('B').length===3&&L.skillKinds('P').length===3,'종류');ok(typeof L.skillStart(bat.id,'pitch_new')==='string','타자에게 투수 프로젝트 거부');ok(typeof L.skillStart('X1','form_power')==='string','없는 선수');
 const e0=S.fin.teams[t].evCost||0,ch=L.skillChance(bat,'form_power');ok(ch>=0.15&&ch<=0.8,'확률 범위 '+ch);ok(L.skillStart(bat.id,'form_power')===null&&Math.abs((S.fin.teams[t].evCost||0)-e0-0.4)<1e-9,'시작·비용 0.4억');ok(typeof L.skillStart(bat.id,'form_eye')==='string','중복 거부');
 const lim=L.skillLimit();ok(lim>=1&&lim<=3,'한도 '+lim);let started=1;for(const p of L.players(t).filter(q=>!q.foreign&&q.age<34&&q.id!==bat.id)){if(L.skillStart(p.id,p.type==='B'?'form_contact':'pitch_cmd')===null)started++;if(started>lim)break}ok(L.skillProjects().length===lim&&started===lim,'동시 한도 '+L.skillProjects().length);
 ok(L.skillCancel(bat.id)===null&&typeof L.skillCancel(bat.id)==='string','중단');
 // 진행: 부상 중에는 멈춘다, 80일 후 결과
 if(!L.skillProjects().length){const c=L.players(t).find(x=>x.type==='B'&&!x.foreign&&x.age<30);ok(L.skillStart(c.id,'form_contact')===null,'재시작')}
 const q=L.skillProjects()[0];const qp=S.players[q.id];S.phase='regular';S.day=10;for(let i=0;i<30;i++)L._skillDay();ok(L.skillProjects().find(x=>x.id===q.id).prog===30,'일일 진행');
 qp.inj={dx:'테스트',ret:new Date((L.todayN()+20)*864e5).toISOString().slice(0,10),retN:L.todayN()+20,apply:true};for(let i=0;i<5;i++)L._skillDay();ok(L.skillProjects().find(x=>x.id===q.id).prog===30,'부상 중에는 진행 안 됨');delete qp.inj;
 for(let i=0;i<60;i++)L._skillDay();ok(L.skillProjects().length===0&&S.skillLog.length>=1,'완료 후 정리·기록 '+S.skillLog.length);ok(S.skillLog.every(x=>['success','partial','fail'].includes(x.res)),'결과 종류')}
// 결과 효과: 성공은 연말 성장에 일회성 보너스(영구), 실패는 컨디션 저하, 엔진 능력치는 즉시 바뀌지 않는다
{const L=mk(9),S=L.S,t=S.userTeam;const bat=L.players(t).find(p=>p.type==='B'&&!p.foreign&&p.age<30);const before=JSON.stringify(bat.p);
 S.skillDone={};S.skillDone[bat.id]={y:S.year,kind:'form_power',scale:1};ok(JSON.stringify(bat.p)===before,'즉시 변하지 않음');const sb=L._skillApply(bat);ok(sb&&sb.hr===0.30&&sb.xbh===0.25&&!S.skillDone[bat.id],'보너스 소모');ok(L._skillApply(bat)===null,'한 번만');
 // progress 적용: 같은 난수로 보너스 유무 비교(홈런·장타 상승)
 const mkp=()=>{const L2=mk(9);return L2};const A=mkp(),B=mkp(),pa=A.players(A.S.userTeam).find(p=>p.id===bat.id),pb=B.players(B.S.userTeam).find(p=>p.id===bat.id);B.S.skillDone={};B.S.skillDone[bat.id]={y:B.S.year,kind:'form_power',scale:1};
 const rngFor=require(__dirname+'/src/league.js').rngFor;A.progress(pa,rngFor(1,2,3,4),1);B.progress(pb,rngFor(1,2,3,4),1);ok(pb.p.hr>pa.p.hr&&pb.p.xbh>pa.p.xbh,`성공 보너스 반영 hr ${pa.p.hr}→${pb.p.hr}`);ok(pb.p.k===pa.p.k,'관계없는 능력치는 그대로')
 const C=mk(9),pc=C.players(C.S.userTeam).find(p=>p.id===bat.id);C.S.skillDone={};C.S.skillDone[bat.id]={y:C.S.year,kind:'form_power',scale:0.5};C.progress(pc,rngFor(1,2,3,4),1);ok(pc.p.hr>pa.p.hr&&pc.p.hr<pb.p.hr,'부분 성공은 절반')}
// 저장/불러오기
{const L=mk(11),S=L.S,t=S.userTeam;const p=L.players(t).find(q=>q.type==='P'&&!q.foreign&&q.age<30);L.skillStart(p.id,'pitch_new');const L2=League.load(L.save());ok(L2.skillProjects().length===1&&L2.skillProjects()[0].kind==='pitch_new','저장·불러오기')}
console.log('train4 tests ok',n);
