const fs=require('fs'),assert=require('assert');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{assert(c,m);n++;};
const L=League.create(base,'Lions',5),S=L.S,U='Lions',C=S.coach;
// 1) 코치진: 팀당 육성 코치(보도 기반 실명 + 가상), 정원=평균, 감독
const cnt=Object.fromEntries(Object.keys(S.teams).map(t=>[t,L.coachesOf(t).length]));
ok(Object.values(cnt).every(v=>v>=6)&&cnt.Giants===7&&L.coachLimit()===6,'팀별 코치 수 '+JSON.stringify(cnt)+' 정원 '+L.coachLimit());
ok(L.coachesOf('Giants').some(c=>c.name==='임경완'&&c.role==='투수'&&c.origin==='real')&&L.coachesOf('Heroes').some(c=>c.name==='이성열'&&c.role==='타격'),'롯데·키움 실명 코치(보도)');
ok(C.mgr.Eagles.name==='류지현'&&C.mgr.Tigers.name==='이범호'&&C.mgr.Wiz.virtual,'감독(KT·NC 미확인은 가상)');
for(const t of Object.keys(S.teams)){const cs=L.coachesOf(t);ok(['투수','타격','수비·주루','총괄'].every(r=>cs.some(c=>c.role===r)),t+' 보직 구성');for(const c of cs){ok(c.spec.length>=1&&c.spec.every(f=>c[f]>=45)&&['stuff','control','stamina','contact','power','eye','defense','speed','mgmt'].every(f=>c[f]>=25&&c[f]<=82),'능력치 범위 '+c.name);ok(c.salary>=0.5&&c.salary<=3.2,'연봉');}}
ok(L.coachMarket().length>=12&&L.coachMarket().every(c=>!c.team&&c.origin==='market'),'코치 시장');
ok(L.coachGrade(80)==='S'&&L.coachGrade(65)==='A'&&L.coachGrade(55)==='B'&&L.coachGrade(45)==='C'&&L.coachGrade(30)==='E','등급 구간');
// 2) 영입·해임: 정원, 예산, 비용 반영
{const room0=L.faRoom(U),mk=L.coachMarket().sort((a,b)=>a.salary-b.salary);
 ok(/정원/.test(L.hireCoach(mk[0].id)),'정원이 차면 영입 불가');
 const fire=L.coachesOf(U)[0];const pay0=L.finPay(U);ok(L.fireCoach(fire.id)===null&&L.coachesOf(U).length===5&&L.coachPayDelta(U)===-fire.salary,'해임');ok(Math.abs(L.finPay(U)-(pay0-fire.salary))<0.11,'해임 시 비용 감소');
 ok(S.coach.market.includes(fire.id),'해임 코치는 시장으로');
 const hire=L.coachMarket().sort((a,b)=>b.salary-a.salary)[0];
 const f=S.fin.teams[U],keep=f.lastRev;f.lastRev=f.opex+L.finPay(U)-30;ok(/예산 부족/.test(L.hireCoach(hire.id))&&!hire.team,'예산 밖이면 영입 불가');f.lastRev=keep;
 const room1=L.faRoom(U),pay1=L.finPay(U);ok(L.hireCoach(hire.id)===null&&hire.team===U&&L.coachesOf(U).length===6,'예산 안에서 영입');ok(Math.abs(L.faRoom(U)-(room1-hire.salary))<0.11&&Math.abs(L.finPay(U)-pay1-hire.salary)<0.11,'영입 비용이 예산·재정에 반영');
 ok(S.news.some(x=>/코치 영입/.test(x.text)),'영입 소식');}
// 3) 코치 효과: 같은 선수·같은 방향에서 코치 능력이 높으면 3년 후 OVR이 높다
{const pit=Object.values(S.players).filter(p=>p.team===U&&p.type==='P'&&p.age<=24).sort((a,b)=>L.ovr(b)-L.ovr(a))[0];
 const setAll=v=>{for(const c of L.coachesOf(U))for(const f of ['stuff','control','stamina','contact','power','eye','defense','speed','mgmt'])c[f]=v};
 setAll(30);const lo=L.devForecast(pit,3).SU[3].ovr;setAll(80);const hi=L.devForecast(pit,3).SU[3].ovr;ok(hi>lo+0.5,'코치 80 vs 30: 3년 후 OVR '+hi+' > '+lo);
 // 방향별 경로: 선발은 체력, 마무리는 구위가 더 늘어남
 const fc=L.devForecast(pit,3);ok(fc.SP[3].st>fc.CL[3].st+3,'선발 방향 체력↑ '+fc.SP[3].st+' vs '+fc.CL[3].st);ok(fc.CL[3].sub['구위']>=fc.SP[3].sub['구위'],'마무리 방향 구위');ok(fc.SP[3].sub['제구']>fc.CL[3].sub['제구'],'선발 방향 제구');
 ok(['SP','SU','MID','CL'].every(k=>fc[k].length===4&&fc[k].every(x=>x.ovr>0&&typeof x.fit==='number')),'예측 구조');
 const bat=Object.values(S.players).filter(p=>p.team===U&&p.type==='B'&&p.age<=24)[0],fb=L.devForecast(bat,3);ok(Object.keys(fb).join()==='balanced,contact,power,eye,defense,speed','타자 육성 방향');
 // 방향 선택: 내 팀만, 유효한 방향만
 ok(L.setDevPlan(pit.id,'CL')===null&&L.devPlan(pit)==='CL'&&!pit.dev.auto,'육성 방향 선택');ok(/선택할 수 없습니다/.test(L.setDevPlan(pit.id,'power')),'투수에 타자 방향 불가');
 const other=Object.values(S.players).find(p=>p.team==='Eagles'&&p.type==='P');ok(/우리 팀/.test(L.setDevPlan(other.id,'SP')),'타 팀 선수는 지정 불가');
 // 선발 방향: 체력 50 이상이면 선발로 전환
 const q=Object.values(S.players).find(p=>p.team===U&&p.type==='P'&&p.age<=25&&p.role==='RP'&&p.id!==pit.id);q.stamina=49;L.setDevPlan(q.id,'SP');const r=require('./src/league.js').rngFor(1,2,3);for(let k=0;k<4;k++)L.progress(q,r,1);ok(q.role==='SP'&&q.stamina>=50,'선발 방향: 체력 상승 후 선발 전환 '+q.stamina);}
// 4) 전체 흐름: 오프시즌 성장에 코치 적용, AI 구단 코치 영입은 정원·예산 이내, 시장 갱신
{const L4=League.create(base,'Lions',9),S4=L4.S;L4.advance(300,false);const P=L4.startPostseason();let g=0;while(!P.done&&g++<100){if(L4.userInPost()){const c=L4.startUserPostGame();c.live.playToEnd();L4.finishUserPostGame(c)}else L4.simPostGame()}
 const m0=L4.coachMarket().map(c=>c.id);L4.startOffseason();ok(L4.coachMarket().length>=12&&L4.coachMarket().some(c=>!m0.includes(c.id)),'오프시즌 시장 갱신');
 for(const t of Object.keys(S4.teams))if(t!=='Lions')for(const c of L4.coachesOf(t))c.salary=c.salary;
 // 일부 AI팀 정원 비우고 영입 유도
 const t0='Dinos';const fired=L4.coachesOf(t0).slice(0,2);S4.coach.teams[t0]=S4.coach.teams[t0].filter(id=>!fired.some(c=>c.id===id));fired.forEach(c=>{c.team=null;S4.coach.market.push(c.id)});
 L4.resignAll();L4.finishContracts();L4.buildDraft();L4.draftAutoRest();L4.finishDraft();L4.finishFA();
 ok(L4.coachesOf(t0).length>4&&L4.coachesOf(t0).length<=L4.coachLimit(),'AI 팀 코치 보충(정원 이내) '+L4.coachesOf(t0).length);
 for(const t of Object.keys(S4.teams))if(t!=='Lions')ok(L4.coachesOf(t).length<=Math.max(L4.coachLimit(),t==='Giants'?7:0),t+' 정원 초과 없음');
 L4.startNewSeason();ok(Object.values(S4.players).filter(p=>p.team in S4.teams&&p.age<=28&&p.dev).length>100,'육성 방향이 AI 선수에도 자동 부여');
 const L5=League.fromJSON(JSON.parse(L4.save()));ok(L5.coachesOf('Giants').length===L4.coachesOf('Giants').length&&L5.coachLimit()===L4.coachLimit()&&L5.S.coach.mgr.Eagles.name==='류지현','저장·불러오기 후 코치진 유지');}
// 5) 한화 동명이인 박준영: 어린 쪽(24세)=2022 1라운드 전체 1순위, 다른 쪽=2026 육성선수
{const a=Object.values(S.players).filter(p=>p.ko==='박준영'&&p.team==='Eagles');const y=a.find(p=>p.age===24),o=a.find(p=>p.age===25);ok(y.dh.round===1&&y.dh.pick===1&&y.dh.y===2022&&y.dh.school==='세광고','어린 박준영 = 1라운드 전체 1순위');ok(o.dh.kind==='육성선수'&&o.dh.y===2026,'다른 박준영 = 2026 육성선수');ok(y.peak!==undefined&&y.scout&&y.peak>=L.ovr(y),'정점 추정');}
console.log('dev tests ok',n);
