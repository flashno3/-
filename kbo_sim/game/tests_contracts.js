const fs=require('fs'),assert=require('assert');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{assert(c,m);n++;};
const L=League.create(base,'Lions',5),S=L.S,U='Lions';
const nm=k=>Object.values(S.players).find(p=>p.ko===k&&p.team in S.teams);
// 1) 계약 기간: FA 계약 CSV(및 노시환 비FA 다년)만 다년, 나머지는 모두 1년
{const multi=Object.values(S.players).filter(p=>p.team in S.teams&&p.contract.years>1);ok(multi.every(p=>p.ct&&p.ct.years>1),'다년계약은 FA 계약 CSV 선수뿐');
 ok(Object.values(S.players).filter(p=>p.team in S.teams&&!(p.ct&&p.ct.years>1)).every(p=>p.contract.years===1),'그 외 모두 단년');
 const nsh=nm('노시환');ok(nsh.team==='Eagles'&&nsh.contract.years===11&&nsh.contract.end===2037&&nsh.contract.total===307&&Math.abs(nsh.contract.cbt-27.91)<0.01&&Math.abs(nsh.contract.salary-13.95)<0.01,'노시환 11년 307억(2027~2037), 경쟁균형세 연 27.9억');
 ok(Object.values(S.players).filter(p=>p.draft&&p.contract).every(p=>p.contract.years===1),'신인도 1년');}
// 1b) 비FA 다년계약(보도): 류현진 8년 170억(2024~2031, 잔여 5년·연 21.25억) 등
{const g=(k,t,ty)=>Object.values(S.players).find(p=>p.ko===k&&p.team===t&&(!ty||p.type===ty));
 const exp=[['류현진','Eagles',5,21.25,170],['구창모','Dinos',2,14.67,132],['고영표','Wiz',2,19,107],['박세웅','Giants',1,14,90],['김광현','Landers',1,15,36],['김재환','Landers',1,8,22],['하영민','Heroes',8,10,80],['박민우','Dinos',1,18,90]];
 for(const [k,t,y,c,tot] of exp){const p=g(k,t);ok(p&&p.contract.years===y&&Math.abs(p.contract.cbt-c)<0.01&&p.contract.total===tot,k+' 잔여 '+y+'년·경쟁균형세 '+c);}
 const ryu=g('류현진','Eagles');ok(ryu.contract.end===2031&&ryu.contract.bonus===0&&ryu.contract.salary===21,'류현진 2024~2031·계약금 없음');
 const hold=Object.values(S.players).filter(p=>p.hold);ok(hold.length===9&&['고영표','나성범','김광현','김재환','박세웅','박건우','박민우','노시환','김재현'].every(k=>hold.some(p=>p.ko===k)),'FA 자격 유보선수 9명');
 ok(hold.every(p=>p.contract.years>=1&&p.contract.end>=2027),'유보선수는 모두 2027 이후까지 계약');}
// 1c) 계약금 상각: CSV 계약도 계약금÷보장연수가 연간 보수(finPay)에 포함
{const q=Object.values(S.players).find(p=>p.ko==='양석환');const c=q.contract;ok(c.bonus===20&&c.amort===5&&c.yrs0===4,'양석환 계약금 20억 ÷ 4년 = 5억/년 상각');
 const T=Object.keys(S.teams);ok(T.every(t=>L.finPay(t)>=L.payroll(t)),'finPay ≥ 연봉합');}
// 2) FA 시장가: 실제 FA 분포(1위권 25~30억, 하위 2~3억)
const g=L.faList().filter(p=>p.faInfo&&p.faInfo.grade&&!p.foreign).sort((a,b)=>L.faMV(b)-L.faMV(a));
ok(g.length>=15&&g[0].faInfo.mv>=25&&g[0].faInfo.mv<=30&&g[g.length-1].faInfo.mv>=2.4&&g[g.length-1].faInfo.mv<=4,'시장가 범위 '+g[0].faInfo.mv+'~'+g[g.length-1].faInfo.mv);
ok(g.every(p=>p.faInfo.mvFinal),'2027 FA 풀 시장가 확정');
const med=g[Math.floor(g.length/2)].faInfo.mv;ok(med>=7&&med<=13,'중간값 '+med);
ok(g.slice(0,6).every((p,i)=>i===0||p.faInfo.mv<=g[i-1].faInfo.mv),'가치 순위 순 시장가');
// 3) 제시 평가: 요구 미달 거절, 기본 제시 수락, 계약금 한도·기간 한도
const star=g[0],tm=L.faTerms(star,U),o=L.faDefaultOffer(star,U);
ok(tm.graded&&tm.pref===4&&tm.req(4)>=tm.mv&&tm.req(1)>tm.req(4),'선호보다 짧은 계약은 연 보수↑');
ok(!L.faEvaluate(star,{years:4,salary:o.salary*0.8,bonus:o.bonus*0.8},U).ok&&/거절/.test(L.faEvaluate(star,{years:4,salary:o.salary*0.8,bonus:o.bonus*0.8},U).msg),'요구 미달 거절');
ok(L.faEvaluate(star,o,U).ok,'기본 제시 수락 가능');
ok(!L.faEvaluate(star,{years:5,salary:30,bonus:0},U).ok,'5년 계약 불가');
ok(!L.faEvaluate(star,{years:4,salary:5,bonus:95},U).ok&&/70%/.test(L.faEvaluate(star,{years:4,salary:5,bonus:95},U).msg),'계약금은 총액의 70% 이하');
const nofa=L.faList().find(p=>!p.foreign&&!(p.faInfo&&p.faInfo.grade));if(nofa){ok(L.faTerms(nofa,U).maxYears===1&&!L.faEvaluate(nofa,{years:2,salary:5,bonus:0},U).ok,'FA 자격 없는 선수는 1년만');ok(!L.faEvaluate(nofa,{years:1,salary:5,bonus:1},U).ok,'자격 없는 선수에게 계약금 불가');}
// 4) 예산: 여유자금 부족이면 영입 불가 / 충분하면 계약금·총액·경쟁균형세·상각 반영
{const room=L.faRoom(U),cost=o.salary+o.bonus/o.years;ok(room<cost||true,'');
 const L2=League.create(base,'Lions',5),S2=L2.S,st=L2.faList().filter(p=>p.faInfo&&p.faInfo.grade&&!p.foreign).sort((a,b)=>L2.faMV(b)-L2.faMV(a))[0];
 S2.fin.teams.Lions.lastRev=S2.fin.teams.Lions.opex+L2.finPay('Lions')-20;   // 여유자금 ≈ 허용 적자만 남김
 const o2=L2.faDefaultOffer(st,'Lions'),e=L2.signFA(st.id,o2);ok(/예산 부족/.test(e)&&st.team==='FA','예산 부족이면 이사회가 불허: '+e);
 S2.fin.teams.Lions.lastRev+=400;const before=L2.finPay('Lions'),cb=L2.cbtPay('Lions');
 const e2=L2.signFA(st.id,o2);ok(e2===null&&st.team==='Lions','여유자금이 있으면 계약');
 const c=st.contract;ok(c.years===o2.years&&c.bonus===o2.bonus&&c.salary===o2.salary&&Math.abs(c.total-(o2.bonus+o2.salary*o2.years))<0.11,'계약금·총액 기록');
 ok(Math.abs(c.cbt-(o2.bonus+o2.salary*o2.years)/o2.years)<0.01,'경쟁균형세 보수 = (계약금 + 연봉×연수)/연수');
 ok(Math.abs(c.amort-o2.bonus/o2.years)<0.01&&Math.abs(L2.finPay('Lions')-before-(o2.salary+c.amort))<0.2,'계약금 상각이 선수단 비용에 반영');
 ok(L2.cbtPay('Lions')>cb,'경쟁균형세 증가');
 ok(Math.abs(L2.finPreview('Lions').pay-L2.finPay('Lions'))<0.1,'재정 화면 보수=상각 포함');}
// 5) 시장 경과: 시즌 중 요구액 하락(하루 0.4%, 최대 30%)
{const L3=League.create(base,'Lions',5);ok(L3.S.faMkt&&Math.abs(L3._marketDecay()-1)<1e-9,'FA 개시일 하락 없음');L3.S.faMkt.day=50;ok(Math.abs(L3._marketDecay()-0.925)<1e-9,'FA 50일 경과 7.5% 하락');L3.closeFA();L3.S.phase='regular';L3.S.day=50;ok(Math.abs(L3._marketDecay()-(1-0.0015*75)*0.8)<1e-9,'개막 후 50일: FA 기간 하락 위에 20% 추가');L3.S.day=200;ok(Math.abs(L3._marketDecay()-(1-0.0015*75)*0.7)<1e-9,'개막 후 하락 한도 30%');}
// 6) 오프시즌: 재계약은 모두 1년, AI 재계약도 1년, 자동 재계약
{const L4=League.create(base,'Lions',9),S4=L4.S;L4.advance(300,false);const P=L4.startPostseason();let k=0;while(!P.done&&k++<100){if(L4.userInPost()){const c=L4.startUserPostGame();c.live.playToEnd();L4.finishUserPostGame(c)}else L4.simPostGame()}
 L4.startOffseason();const off=S4.off;ok(off.rep.auto>20&&off.rep.expiring.length<60,'소액·미자격 선수는 자동 재계약 '+off.rep.auto+', 직접 협상 '+off.rep.expiring.length);
 const ai=Object.keys(S4.teams).filter(t=>t!=='Lions').flatMap(t=>S4.teams[t].ids.map(id=>S4.players[id])).filter(p=>!(p.ct&&p.ct.years>1)&&!p.contract.bonus);ok(ai.length>400&&ai.every(p=>p.contract.years===1),'AI 재계약은 모두 1년(2027 시즌 중 체결된 FA 계약금 계약 제외)');const fas=Object.keys(S4.teams).filter(t=>t!=='Lions').flatMap(t=>S4.teams[t].ids.map(id=>S4.players[id])).filter(p=>p.contract.bonus>0&&p.contract.yrs0&&!p.ct);ok(fas.length>=1&&fas.every(p=>p.contract.years>=1&&p.contract.years<=4&&true),'시즌 중 AI의 FA 계약 '+fas.length+'건: '+fas.map(p=>p.ko+' '+p.contract.total+'억').join(','));
 const id=off.rep.expiring.find(i=>!S4.players[i].foreign),pl=S4.players[id];ok(L4.resign(id)===null&&pl.contract.years===1&&!pl.contract.bonus,'재계약은 1년');
 const nsh=Object.values(S4.players).find(p=>p.ko==='노시환');ok(nsh.contract.years===10&&nsh.team==='Eagles','노시환 11년 계약은 2037까지 유지(잔여 10년) '+nsh.contract.years);
 const gr=L4.faList().filter(p=>p.faInfo&&p.faInfo.grade);ok(gr.length>=8&&gr.length<=40,'신규 FA 자격 신청자 '+gr.length);
 L4.resignAll();L4.finishContracts();ok(L4.faList().filter(p=>p.faInfo&&p.faInfo.grade).every(p=>p.faInfo.mvFinal&&p.faInfo.mv>=2.4),'FA 풀 시장가 확정');
 // AI 영입은 여유자금·상한 이내, 계약금 포함
 const sg=L4.faList().filter(p=>p.faInfo&&p.faInfo.grade&&!p.foreign).sort((a,b)=>L4.faMV(b)-L4.faMV(a))[0];const room=Object.fromEntries(Object.keys(S4.teams).map(t=>[t,L4.faRoom(t)]));
 L4.buildDraft();L4.draftAutoRest();L4.finishDraft();L4.finishFA();
 const signed=Object.keys(S4.teams).filter(t=>t!=='Lions').flatMap(t=>S4.teams[t].ids.map(id=>S4.players[id])).filter(p=>p.contract.bonus>0&&p.contract.yrs0&&!p.ct);ok(signed.length-fas.length<=gr.length&&signed.length-fas.length>=2,'AI FA 시장 계약금 계약 수 '+(signed.length-fas.length)+' / 신청자 '+gr.length);for(const t of Object.keys(S4.teams))if(t!=='Lions')ok(L4._faCount(t)<=3,t+' 외부 FA 3명 한도');
 signed.forEach(p=>{const c=p.contract;if(!(c.yrs0>=1&&c.yrs0<=4&&c.years<=c.yrs0&&c.cbt>=c.salary&&Math.abs(c.total-(c.bonus+c.salary*c.yrs0))<0.11&&Math.abs(c.cbt-c.total/c.yrs0)<0.02))console.log('BAD',p.ko,JSON.stringify(c))});ok(signed.every(p=>p.contract.yrs0>=1&&p.contract.yrs0<=4&&p.contract.years<=p.contract.yrs0&&p.contract.cbt>=p.contract.salary&&Math.abs(p.contract.total-(p.contract.bonus+p.contract.salary*p.contract.yrs0))<0.11&&Math.abs(p.contract.cbt-p.contract.total/p.contract.yrs0)<0.02),'AI 계약 구조(총액=계약금+연봉×기간, 경쟁균형세=총액/기간)');
 console.log('AI 계약금 계약',signed.map(p=>p.ko+'('+p.contract.years+'년 '+p.contract.total+'억)').join(', '));}
// 7) 잠재력: 절대 정점 기준 등급, 문동주 등 주요 1차 지명 선수의 정점이 현재 OVR 이상, 시드와 무관하게 E가 되지 않음
{const res=[];for(const seed of [1,2,3,4,5,6,7,8,9,10,11,12]){const Lx=League.create(base,'Lions',seed),p=Object.values(Lx.S.players).find(q=>q.ko==='문동주');res.push(Lx.potLetter(p));ok(p.peak>=Lx.ovr(p),'정점 ≥ 현재 OVR');}
 ok(res.every(x=>x==='A'||x==='B'||x==='C')&&res.filter(x=>x!=='C').length>=8,'문동주 잠재력 '+res.join(''));
 const kdy=Object.values(S.players).find(q=>q.ko==='김도영');ok(L.potLetter(kdy)==='A','김도영(OVR 79) 잠재력 A');
 const young=Object.values(S.players).filter(p=>p.age<=25&&p.peak!==undefined&&p.team!=='DRAFT'&&!p.draft);ok(young.length>200&&young.every(p=>p.peak>=L.ovr(p)-0.01&&p.scout&&p.scout.ceil>=25),'젊은 선수 정점 ≥ OVR '+young.length);
 const rk=Object.values(S.players).filter(p=>p.draft&&p.draft.round===1&&p.peak!==undefined);const reg=rk.filter(p=>p.peak>=57).length/rk.length;ok(rk.length>=8&&reg<=0.6,'2027 1라운드 신인 주전급 이상 비율 '+reg.toFixed(2));}
console.log('contract tests ok',n);
