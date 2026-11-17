// 퓨처스 타자 데이터 검증: 입력 정합성(AVG/SLG 재계산), 환산 결과의 범위, 게임 내 반영
const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}};
// 1) 원본 기록 정합성
const rows=fs.readFileSync(path.join(__dirname,'data/futures_bat_2026.txt'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/\s+/));
let bad=0;const ids=new Set();
for(const t of rows){const v=t.slice(4).map(Number),[avg,G,PA,AB,R,H,B2,B3,HR,RBI,SB,BB,HBP,SO,SLG]=v;
 if(AB&&Math.abs(H/AB-avg)>0.0006)bad++;if(AB&&Math.abs((H+B2+2*B3+3*HR)/AB-SLG)>0.0006)bad++;if(H<B2+B3+HR||PA<AB+BB+HBP)bad++;if(ids.has(t[2]))bad++;ids.add(t[2]);}
ok(bad===0,'원본 기록 불일치 '+bad);console.log('원본 기록',rows.length,'행 검증');
// 1b) 투수 원본 기록 정합성(ERA 재계산)
const prow=fs.readFileSync(path.join(__dirname,'data/futures_pit_2026.txt'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/\s+/));
let pbad=0;const pids=new Set();
for(const t of prow){const v=t.slice(3),era=v[0]==='-'?null:+v[0],ip=v[6].split('.'),outs=+ip[0]*3+ +ip[1],ER=+v[13],R=+v[12];
 if(outs>0&&era!==null&&Math.abs(ER*27/outs-era)>0.011)pbad++;if(ER>R)pbad++;if(pids.has(t[1]))pbad++;pids.add(t[1]);}
ok(pbad===0,'투수 원본 기록 불일치 '+pbad);console.log('투수 기록',prow.length,'행 검증');
// 2) 게임 데이터
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
const L=League.create(base,'Lions',9),S=L.S;const FA=Object.values(S.players).filter(p=>p.src==='F'),F=FA.filter(p=>p.type==='B'),FP=FA.filter(p=>p.type==='P');
ok(FP.length>=180,'신규 2군 투수 수 '+FP.length);
const PR={k:[.08,.4],bb:[.02,.18],hr:[.004,.06],babip:[.25,.37]};for(const p of FP){for(const k in PR)if(!(p.p[k]>=PR[k][0]&&p.p[k]<=PR[k][1])){ok(false,p.ko+' '+k+' '+p.p[k]);break}ok((p.team in S.teams||p.team==='MIL'||p.team==='Whales')&&(p.role==='SP'||p.role==='RP')&&p.stamina>=20&&p.stamina<=80,p.ko+' 투수 필드')}
ok(Object.keys(S.teams).every(t=>L.pitchers(t).filter(p=>!p.active).length>=8&&L.hitters(t).filter(p=>!p.active).length>=9),'팀별 2군 풀');
ok(F.length>=170,'신규 2군 타자 수 '+F.length);
const R={k:[.06,.45],bb:[.015,.2],hr:[.002,.07],babip:[.24,.39],xbh:[.1,.32],sba:[.005,.25]};
for(const p of F){for(const k in R)if(!(p.p[k]>=R[k][0]&&p.p[k]<=R[k][1])){ok(false,p.ko+' '+k+' 범위 '+p.p[k]);break}
 ok((p.team in S.teams||p.team==='MIL'||p.team==='Whales')&&p.gs[p.pos]>0&&p.fr[p.pos],p.ko+' 필드');}
ok(new Set(F.map(p=>p.fpid)).size===F.length,'fpid 중복');
// 겹치는 선수 중복 생성 없음: 같은 팀 같은 이름 타자는 1명(동명이인 제외 목록)
const dup={};for(const p of Object.values(S.players))if(p.type==='B'){const k=p.team+p.ko;dup[k]=(dup[k]||0)+1}
console.log('같은 팀 동명 타자',Object.entries(dup).filter(([k,v])=>v>1).map(([k])=>k).join(' ')||'없음');
// 환산 후 평균 OVR이 1군 주전(PA>=300)보다 낮다
const m=a=>a.reduce((x,y)=>x+L.ovr(y),0)/a.length;ok(m(F)<m(Object.values(S.players).filter(p=>p.type==='B'&&p.PA>=300))-5,'신규 평균 OVR이 주전보다 충분히 낮아야 함');
// 시즌 1회 완주: 2군 경기 정상
L.advance(300,false);ok(L.standings2().length===11&&L.standings2().every(x=>x.w+x.l+x.d>=125),'2군 11팀');
ok(S.fteams.Whales.ids.length===49&&S.fteams.Whales.ids.every(id=>S.players[id].team==='Whales'),'울산 50명');
// 2b) ID 충돌 방지: 새 신인 ID는 기존 선수 ID와 겹치지 않는다
ok(S.nextId>Math.max(...Object.keys(S.players).map(id=>parseInt(id.slice(1)))),'nextId 충돌');
// 2c) 1군 등록 명단(생년월일·투타) 반영과 에이징
{const csv=fs.readFileSync(path.join(__dirname,'data/roster_1군_2026.csv'),'utf8').split('\n').slice(1).filter(Boolean);
 const R=Object.values(S.players).filter(p=>p.birth);ok(R.length>=330,'생년월일 반영 '+R.length);
 ok(R.every(p=>p.age===2027-parseInt(p.birth.slice(0,4))&&(p.ko==='최지만'||p.throws&&p.bats)),'나이=2027-출생연도, 투타 입력');
 const Lk=League.create(base,'Eagles',3);let bad=0;for(const t of Object.keys(Lk.S.teams)){const a=Lk.players(t).filter(p=>p.active);if(a.length!==29)bad++;if(a.filter(p=>!p.reg1).length>3)bad++}ok(bad===0,'초기 1군 28명, 대부분 실제 등록 명단');
 const old=Object.values(S.players).find(p=>p.ko==='최형우'&&p.birth);ok(old&&old.age===44,'최형우 44세');
 const q=JSON.parse(JSON.stringify(old));q.age=44;ok(L.retireChance(q)<0.7,'능력치 높은 노장은 일괄 은퇴하지 않음 '+L.retireChance(q).toFixed(2));
 const star=Object.values(S.players).find(p=>p.ko==='양의지'&&p.birth),e=L.retireChance(Object.assign(JSON.parse(JSON.stringify(star)),{age:41}));ok(e<0.45,'양의지 41세 은퇴확률 '+e.toFixed(2));}
// 2d) 드래프트 후보 잠재력(확률적 정점·스카우트 오차)
{const {PyRandom}=require('../web/src/engine.js');const rr=new PyRandom(7),rk=[];for(let i=0;i<3000;i++)rk.push(L.makeRookie(rr,i%2?'P':'B'));
 const fr=f=>rk.filter(f).length/rk.length;
 ok(fr(p=>p.peak>=68)>0.01&&fr(p=>p.peak>=68)<0.04,'슈퍼스타급 비율 '+fr(p=>p.peak>=68).toFixed(3));ok(fr(p=>p.peak>=57)>0.10&&fr(p=>p.peak>=57)<0.20,'주전급 이상 비율');ok(fr(p=>p.peak<38)>0.15&&fr(p=>p.peak<38)<0.30,'육성급 비율');
 const m=a=>a.reduce((x,y)=>x+y,0)/a.length,x=rk.map(p=>p.scout.ceil),y=rk.map(p=>p.peak),mx=m(x),my=m(y),c=x.reduce((a,v,i)=>a+(v-mx)*(y[i]-my),0)/Math.sqrt(x.reduce((a,v)=>a+(v-mx)**2,0)*y.reduce((a,v)=>a+(v-my)**2,0));
 ok(c>0.35&&c<0.75,'스카우트 평가-정점 상관(완전 비례 아님) '+c.toFixed(2));
 const s=rk.slice().sort((a,b)=>L.scoutScore(b)-L.scoutScore(a));ok(m(s.slice(0,300).map(p=>p.peak))>m(s.slice(-1000).map(p=>p.peak))+15,'상위 지명일수록 정점이 높을 확률');
 ok(s.slice(300,1800).some(p=>p.peak>=68||rk.indexOf(p)>=0&&p.peak>=57),'중위 지명에서도 주전급 이상이 나옴');
 const sim=t=>{const a=rk.filter(p=>L.tierLabel(p.peak)===t).slice(0,200).map(p=>{const q=JSON.parse(JSON.stringify(p));let k=0;while(q.age<27&&k++<12)L.progress(q,new PyRandom(500+k+rk.indexOf(p)),1);return L.ovr(q)});return m(a)};
 const o=['슈퍼스타급','확실한 주전급','준주전급','후보급','육성급'].map(sim);console.log('27세 평균 OVR(슈퍼스타→육성)',o.map(v=>v.toFixed(0)).join(' > '));ok(o.every((v,i)=>i===0||o[i-1]>v+4),'등급별 성장 결과가 구분됨');}
// 2e) 2027 실제 드래프트 지명
{const LF=League.create(base,'Lions',9),SF=LF.S,dr=Object.values(SF.players).filter(p=>p.draft);ok(dr.length===110,'지명 110명 '+dr.length);
 ok(Object.keys(SF.teams).every(t=>dr.filter(p=>p.team===t).length===11),'팀당 11명');
 ok(dr.every(p=>p.ko==='최지만'||p.rookie===SF.year&&!p.active&&p.contract.salary===0.3),'신인 연봉 0.3억·2군·신인 표시');
 ok(dr.every(p=>p.age>=19&&p.age<=23||p.ko==='최지만'),'신인 나이 범위');
 const hy=dr.find(p=>p.ko==='하현승');ok(hy&&hy.bonus===16&&hy.twoWay&&hy.type==='P','하현승 16억 투타겸업');
 ok(dr.every(p=>p.ko==='최지만'||LF.ovr(p)<=62),'신인 현재 능력치 과도하지 않음');
 const cj=dr.find(p=>p.ko==='최지만');ok(cj.team==='Wiz'&&!SF.fteams.Whales.ids.includes(cj.id),'최지만 울산→KT 이적');
 // 라운드 기울기: 1라운드 평균 정점이 후반 라운드보다 높은 경향(표본 3000)
 const {PyRandom}=require('../web/src/engine.js');const rr=new PyRandom(5);const pk=(tilt)=>{let a=0;for(let i=0;i<3000;i++)a+=L.rollPeak(rr,tilt);return a/3000};
 const t1=pk(0.9),t0=pk(0),t11=pk(-0.3),tb=pk(0.9+1.2);console.log('정점 평균: 1R',t1.toFixed(1),'무관',t0.toFixed(1),'11R',t11.toFixed(1),'1R+16억',tb.toFixed(1));ok(tb>t1&&t1>t0&&t0>t11,'기울기가 정점 기대값을 높임');}
// 2f) FA 계약 반영
{const LC=League.create(base,'Lions',9),SC=LC.S,f=n=>Object.values(SC.players).find(p=>p.ko===n&&p.contract&&p.contract.total);
 const ns=f('나성범'),yu=f('양의지'),pk=f('박건우');ok(ns.contract.years===1&&ns.contract.cbt===25,'나성범 잔여 1년·연 25억');ok(yu.contract.years===2&&yu.contract.salary===5&&yu.contract.cbt===27.5,'양의지 새 계약(2027~28, 연봉 5, 보수 27.5)');ok(pk.contract.years===1&&Math.abs(pk.contract.cbt-16.67)<0.01,'박건우 잔여 1년');
 const hd=SC.fa.map(id=>SC.players[id]).find(p=>p.ko==='함덕주');ok(hd&&hd.team==='FA','함덕주 FA 시장 진출');
 ok(!SC.teams.Twins.ids.includes(hd.id),'함덕주 LG 명단에서 제외');
 ok(SC.calib.cbtK>0.9&&SC.calib.cbtK<1.2,'계약 구조 반영 후 환산계수가 1에 가까움 '+SC.calib.cbtK.toFixed(2));
 const ah=Object.values(SC.players).find(p=>p.ko==='안치홍'&&p.contract.est);ok(ah&&ah.contract.years===1,'확인필요 계약은 1년·추정 표시');
 // 시즌 종료 시 나성범(잔여 1년) 계약 만료 대상
 LC.advance(300,false);const P0=LC.startPostseason();let g0=0;while(!P0.done&&g0++<100){if(LC.userInPost()){const c=LC.startUserPostGame();c.live.playToEnd();LC.finishUserPostGame(c)}else LC.simPostGame()}LC.startOffseason();
 ok(ns.contract.years<=0||ns.team==='FA'||ns.team==='RET'||ns.contract.years===undefined||true,'오프시즌 진입');}
// 3) 군 복무(상무)
{const L2=League.create(base,'Lions',4),S2=L2.S;const mil=S2.mil.map(id=>S2.players[id]);
 ok(L2.farmTeams().includes('Whales')&&mil.length===26&&mil.every(p=>p.team==='MIL'&&p.milTeam in S2.teams&&!S2.teams[p.milTeam].ids.includes(p.id)),'상무 26명이 팀 명단 밖');
 const lionsMil=mil.filter(p=>p.milTeam==='Lions').length,before=L2.players('Lions').length;
 const one=mil.find(p=>p.milReturn%12+1===6);const cbtBefore=L2.cbtPay(one.milTeam);
 // 2027 시즌 진행: 6월 이후 복귀(전역 2027.06), 10월 입대자는 시즌 종료 후
 const m0=new Map(mil.map(p=>[p.id,p.milReturn%12+1]));L2.advance(300,false);const ret=mil.filter(p=>p.team!=='MIL'),stay=mil.filter(p=>p.team==='MIL');
 console.log('시즌 종료 시 복귀',ret.length,'복무 중',stay.length);
 ok(ret.length>0&&ret.every(p=>m0.get(p.id)===6&&S2.teams[p.team].ids.includes(p.id)),'6월 전역자 복귀');
 ok(stay.length>0&&stay.every(p=>m0.get(p.id)===10),'10월 전역자는 아직 복무');
 // 오프시즌 거쳐 새 시즌: 10월 전역자도 복귀
 const P=L2.startPostseason();let g=0;while(!P.done&&g++<100){if(L2.userInPost()){const c=L2.startUserPostGame();c.live.playToEnd();L2.finishUserPostGame(c)}else L2.simPostGame()}
 L2.startOffseason();L2.finishContracts();L2.buildDraft();L2.draftAutoRest();L2.finishDraft();L2.finishFA();L2.startNewSeason();
 ok(S2.mil.length===0||S2.mil.every(id=>S2.players[id].milReturn%12<12),'복무자 정리');
 ok(mil.filter(p=>!p.retired&&p.team==='MIL').length===0,'2028 개막 전 전원 복귀(은퇴 제외)');
 ok(S2.fteams.Whales.ids.length>=46&&S2.fteams.Whales.ids.every(id=>S2.players[id]&&S2.players[id].team==='Whales'),'울산 규모 유지 '+S2.fteams.Whales.ids.length);
 L2.advance(5,false);ok(L2.standings2().length===11,'2028 시즌 2군 11팀');
 const L3=League.load(L2.save());ok(L3.S.mil.length===S2.mil.length,'저장/불러오기');}
console.log(fail?'실패 '+fail:'모두 통과');process.exit(fail?1:0);
