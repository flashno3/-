/* 구단 투자 센터: 기본 무변화, 예산·비용·착공·완공·효과·유지비·무결성 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team,days)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();if(days)L.advance(days,false);return L};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
const toNewSeason=L=>{const S=L.S;const off=L.startOffseason();for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();L.faAdvance(75);L.closeFA();L.startNewSeason()};
// 1) 기본 상태: 아무 것도 바뀌지 않음
{const L=mk(5,'Lions',30),S=L.S,t=S.userTeam;ok(!S.invest,'투자 상태 없음');ok(L.investMult('train')===1&&L.investMult('med')===1&&L.investFarm()===0&&L.investSlots()===0&&L.investObs()===0&&L.investFan()===0,'기본 보정은 모두 중립');
 ok(L.scoutLimit()===3,'스카우트 한도 3');const rows=L.investRows();ok(rows.length===5&&rows.every(r=>r.lv===0&&!r.pend&&r.canBuy&&r.cost>=8),'프로젝트 5개');ok(L.investUpkeep()===0&&L.investSpent()===0,'유지비·지출 0');
 ok(Math.abs(L.investBudget()-Math.round(0.8*L.finAllowed(t)*10)/10)<1e-9&&L.investBudget()>=10,'예산 = 손실 허용 한도의 80% '+L.investBudget());
 ok(L.integrity().errors.filter(e=>e.code!=='dup-name').length===0,'무결성');}
// 2) 착공: 비용 계상·예산 차감·중복 불가·효과는 아직 없음
{const L=mk(5,'Lions',30),S=L.S,t=S.userTeam,f=S.fin.teams[t];const op0=L.finPreview(t).op,ev0=f.evCost||0,bud=L.investBudget();
 const bl=L.investCheck('train');ok(bl===null,'착공 가능');ok(L.investBuy('train')===null,'착공');ok(Math.abs((f.evCost||0)-ev0-8)<1e-9,'올해 행사 비용 +8억');ok(Math.abs(L.finPreview(t).op-(op0-8))<1e-6,'손익 −8억');
 ok(L.investSpent()===8&&Math.abs(L.investBudget()-bud)<1e-9,'지출·예산');ok(S.invest.queue.train===1&&S.invest.paid.train===8&&L.investLv('train')===0,'공사 중, 효과는 아직 없음');ok(L.investMult('train')===1,'아직 보정 없음');
 ok(/공사 중/.test(L.investBuy('train')),'공사 중 중복 불가');ok(L.investRows().find(r=>r.key==='train').pend===1&&L.investRows().find(r=>r.key==='train').cost===null,'행 상태');
 ok(S.news.some(x=>/구단 투자: 훈련 시설 1단계 착공/.test(x.text)),'뉴스');ok(L.integrity().errors.filter(e=>e.code!=='dup-name').length===0,'무결성');
 // 예산 소진
 let last=null,cnt=0;for(const k of ['med','scout','farm','fan']){const e=L.investBuy(k);if(e){last=e;break}cnt++}
 ok(cnt>=0&&(last===null||/예산이 부족/.test(last)),'예산 부족 메시지 '+last);ok(L.investSpent()<=L.investBudget()+1e-9,'예산 초과 불가');
 const S2=mk(6,'Lions',30);S2.S.phase='post';ok(/포스트시즌/.test(S2.investBuy('train')),'포스트시즌 중에는 착공 불가');ok(/알 수 없는/.test(L.investBuy('zzz')),'잘못된 항목');}
// 3) 완공: 다음 시즌 개막 때 효과, 유지비, 관중 보정
{const L=mk(7,'Lions',30),S=L.S,t=S.userTeam,f=S.fin.teams[t];f.trust=100;f.lastRev=3000;f.lastRev=3000;ok(L.investBudget()>100,'예산 확대(테스트)');
 for(const k of ['train','med','scout','farm','fan'])ok(L.investBuy(k)===null,'착공 '+k);const paid=8*4+10;ok(Math.abs(Object.values(S.invest.paid).reduce((a,b)=>a+b,0)-paid)<1e-9,'누적 납입 '+paid);
 season(L);toNewSeason(L);const f2=S.fin.teams[S.userTeam];
 ok(['train','med','scout','farm','fan'].every(k=>L.investLv(k)===1)&&Object.keys(S.invest.queue).length===0,'새 시즌에 1단계 완공');
 ok(L.investMult('train')===1.05&&L.investMult('med')===0.96&&L.investDur()===0.95&&Math.abs(L.investFarm()-0.04*0.3)<1e-12&&L.investSlots()===1&&L.investObs()===0&&Math.abs(L.investFan()-0.007)<1e-12,'효과 값(육성 시설은 완공 첫 시즌 30%) '+L.investFarm());
 ok(L.scoutLimit()===4,'스카우트 한도 4');ok(Math.abs(L.investUpkeep()-paid*0.05)<1e-9,'연 유지비 5%');ok(Math.abs((f2.evCost||0)-paid*0.05)<1e-6,'개막 때 유지비 계상 '+f2.evCost);
 ok(Math.abs((f2.attMult||1)-1.007)<1e-9,'관중 보정 ×1.007 '+f2.attMult);
 ok(L.integrity().errors.filter(e=>e.code!=='dup-name').length===0,'무결성');
 // 2단계 비용
 f2.trust=100;f2.lastRev=3000;const bef=f2.evCost;ok(L.investBuy('train')===null&&Math.abs(f2.evCost-bef-16)<1e-9,'2단계 16억');ok(L.investRows().find(r=>r.key==='train').lv===1&&L.investRows().find(r=>r.key==='train').pend===2,'2단계 공사');
 // 스카우트 채용 한도 반영
 let hired=0;for(const m of (S.scoutMkt||[]).slice(0,5)){if(L.scoutHire(m.id)===null)hired++}ok(hired===4||L.scouts().length===4,'4명까지 고용 '+L.scouts().length);}
// 4) 효과의 크기: 훈련 보정 ×1.05~1.15, 팬 경험은 구장 한도까지만
{const mkLv=(lv)=>{const L=mk(8,'Lions',20),S=L.S;S.invest={eff:{train:lv},queue:{},paid:{train:lv?8:0},spent:{},log:[]};const p=L.players(S.userTeam).find(x=>x.type==='B'&&x.age<=30);S.trainAcc={total:60,B:{all:60},P:{}};return {L,p}};
 const a=mkLv(0),b=mkLv(1),c=mkLv(3);const m0=a.L._trainEff(a.p).mult-1,m1=b.L._trainEff(b.p).mult-1,m3=c.L._trainEff(c.p).mult-1;ok(m0>0&&Math.abs(m1/m0-1.05)<1e-9&&Math.abs(m3/m0-1.15)<1e-9,`훈련 보정 배율 ${m1/m0} ${m3/m0}`);
 const L=mk(8,'Lions',20),S=L.S,t=S.userTeam,f=S.fin.teams[t];f.cap=100000;const att0=L.finAtt(t);f.attMult=1.022;ok(L.finAtt(t)>att0,'관중 증가');f.attMult=1.5;f.cap=Math.round(att0*1.01);ok(L.finAtt(t)===f.cap,'구장 수용 한계까지만');
 const e=L.investEstimate('fan',1);ok(/수용/.test(e)&&/입장 수입/.test(e),'추정 문구');}
// 5) 의무·육성 효과의 방향: 부상 확률 곱, 성장 출전 비중 보정
{const L=mk(9,'Lions',20),S=L.S;S.invest={eff:{med:3,farm:3},queue:{},paid:{med:52,farm:52},spent:{},log:[]};ok(L.investMult('med')===0.88&&L.investDur()===0.85&&Math.abs(L.investFarm()-0.12)<1e-12,'3단계 값(since 없음 = 도달률 100%)');
 // 같은 시드에서 투자한 리그의 성장은 투자하지 않은 리그보다 항상 같거나 크다(출전 비중 보정은 양의 성장만 키움)
 const A=mk(10,'Lions',0),B=mk(10,'Lions',0);B.S.invest={eff:{farm:3},queue:{},paid:{farm:52},spent:{},log:[]};season(A);season(B);
 ok(JSON.stringify(A.standings().map(x=>[x.team,x.w,x.l]))===JSON.stringify(B.standings().map(x=>[x.team,x.w,x.l])),'육성 시설은 시즌 경기에 영향 없음');
 const ra=A.startOffseason(),rb=B.startOffseason();const pa=Object.fromEntries(ra.rep.prog.map(x=>[x.id,x.d])),pb=Object.fromEntries(rb.rep.prog.map(x=>[x.id,x.d]));let more=0,less=0;for(const id of Object.keys(pa)){if(pb[id]>pa[id])more++;if(pb[id]<pa[id])less++}
 ok(less===0&&more>=1,`육성 시설: 성장이 줄어드는 선수 없음(${more}명 증가, ${less}명 감소)`);const oth=Object.keys(A.S.players).filter(id=>A.S.players[id].team!==A.S.userTeam&&A.S.players[id].team in A.S.teams);ok(oth.every(id=>A.ovr(A.S.players[id])===B.ovr(B.S.players[id])),'다른 구단 선수는 영향 없음');}
// 6) 감독 교체 시 초기화
{const L=mk(11,'Lions',30),S=L.S;S.invest={eff:{train:2},queue:{},paid:{train:24},spent:{},log:[]};const t2=Object.keys(S.teams).find(x=>x!==S.userTeam);L.takeOverTeam(t2);ok(!S.invest,'다른 구단 취임 시 투자 기록 초기화');ok(L.investMult('train')===1,'중립');}
// 7) 무결성 검사가 잘못된 상태를 잡음
{const L=mk(12,'Lions',10),S=L.S;S.invest={eff:{train:5},queue:{med:3},paid:{farm:-1},spent:{},log:[]};const e=L.integrity().errors.map(x=>x.code);ok(e.includes('invest-lv')&&e.includes('invest-queue')&&e.includes('invest-paid'),'잘못된 투자 상태 감지');}
// 8) 육성 시설 도달률: 완공 후 1·2·3년차 30·50·75%, 4년차부터 100%
{const L=mk(13,'Lions',5),S=L.S;S.invest={eff:{farm:2},queue:{},paid:{farm:24},spent:{},log:[],since:{farm:S.year}};const want=[0.3,0.5,0.75,1,1,1];for(let k=0;k<6;k++){S.year=2027+k;S.invest.since.farm=2027;ok(Math.abs(L.investRamp('farm')-want[k])<1e-12&&Math.abs(L.investFarm()-0.08*want[k])<1e-12,`도달률 ${k+1}년차`)}ok(L.investRamp('train')===0,'미완공 프로젝트는 0');}
// 9) 의무·재활 센터: 복귀 기간만 따로 줄임(부상 확률은 같게 두고 같은 부상의 기간 비교)
{const A=mk(14,'Lions',0),B=mk(14,'Lions',0);B.S.invest={eff:{med:3},queue:{},paid:{med:52},spent:{},log:[]};B.investMult=function(k){return k==='med'?1:1};   // 확률 보정만 끄고 기간 보정만 남김
 A.advance(150,false);B.advance(150,false);const st=p=>{const m=/(\d{4})-(\d{2})-(\d{2})/.exec(p.inj.since);return Math.floor(Date.UTC(+m[1],+m[2]-1,+m[3])/864e5)};let cmp=0;for(const p of A.players(A.S.userTeam)){const q=B.S.players[p.id];if(p.inj&&p.inj.generated&&q.inj&&q.inj.generated&&p.inj.since===q.inj.since){const da=p.inj.retN-st(p),db=q.inj.retN-st(q);ok(db===Math.max(1,Math.round(da*0.85)),`복귀 기간 ${da} → ${db}`);cmp++}}ok(cmp>=3,'비교한 부상 '+cmp);
 for(const t of Object.keys(A.S.teams)){if(t===A.S.userTeam)continue;for(const p of A.players(t)){const q=B.S.players[p.id];ok(!!p.inj===!!q.inj&&(!p.inj||p.inj.retN===q.inj.retN),'다른 구단 부상은 그대로')}}}
console.log('invest tests ok '+n);
