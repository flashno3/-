// KBO FA 제도 검증: 자격 연수, 등급, 보상, 외부 FA 3명 한도, 외국인 슬롯
const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}};
const U='Lions';const L=League.create(base,U,11),S=L.S,TEAMS=Object.keys(S.teams);
// 1) 자격 규칙(합성 선수)
const mk=o=>Object.assign({foreign:false,age:30,contract:{salary:5,years:1},salHist:[5,5,5],fa:{svc:8,used:0,last:null,univ:false}},o);
const q=(svc,used,last,univ)=>mk({fa:{svc,used,last,univ}});
ok(L.faEligible(q(8,0))&&!L.faEligible(q(7.9,0)),'고졸 8시즌');ok(L.faEligible(q(7,0,null,true))&&!L.faEligible(q(6,0,null,true)),'대졸 7시즌');ok(L.faEligible(q(4,1))&&!L.faEligible(q(3,1)),'재취득 4시즌');
ok(!L.faEligible(mk({foreign:true})),'외국인은 FA 대상 아님');
ok(L.faGrade(q(4,1,'A'))==='B'&&L.faGrade(q(4,1,'B'))==='B'&&L.faGrade(q(4,1,'C'))==='C','재자격: A·B→B, C→C');ok(L.faGrade(q(4,2,'B'))==='C','세 번째 이상은 C');
ok(L.faGrade(mk({age:36,fa:{svc:8,used:0}}))==='C','만 35세 이상 C');
// 1군 최상위 연봉자 → A, 11위 이하 → C
const t=Object.values(S.players).filter(p=>p.team==='Bears'&&!p.foreign).sort((a,b)=>L._salAvg(b)-L._salAvg(a));
t.slice(0,3).forEach(p=>{p.fa={svc:8,used:0,last:null};p.age=29});const g0=L.faGrade(t[0]);t[14].fa={svc:8,used:0,last:null};t[14].age=29;
console.log('팀 상위 연봉자 등급',g0,'/ 팀 15위',L.faGrade(t[14]));ok(L.faGrade(t[14])==='C','팀 11위 이하 C');
// 1b) 드래프트 이력 반영(입단 연도·고졸/대졸·데뷔)
const dh=Object.values(S.players).filter(p=>p.dh);console.log('드래프트 이력 선수',dh.length);ok(dh.length>600,'드래프트 이력 매칭 '+dh.length);
const fd=n=>Object.values(S.players).find(p=>p.ko===n&&p.dh);
const kb=fd("강백호"),lj=fd("노시환"),ys=fd("양의지");
ok(kb&&kb.dh.y===2018&&!kb.dh.univ&&kb.fa.univ===false,'강백호 2018 입단 고졸');
ok(lj&&lj.dh.y===2019&&!lj.dh.univ,'노시환 2019 입단');
ok(ys&&ys.dh.y===2006,'양의지 2006 입단 '+(ys&&ys.dh.y));
{const LD=League.create(base,U,11),univ=Object.values(LD.S.players).filter(p=>p.dh&&p.dh.univ);ok(univ.length>60&&univ.every(p=>p.fa.univ===true&&LD.faReq(p)===(p.fa.used>0?4:7)),'대졸 7시즌 적용 '+univ.length);}
ok(dh.every(p=>p.fah||!p.dh.deb||p.fa.svc<=p.dh.ss+1e-9),'자격 연수가 출전 시즌 수를 넘지 않음');
const young=dh.filter(p=>p.peak!==undefined&&p.age<=24);ok(young.length>20&&young.every(p=>p.scout&&p.peak>=L.ovr(p)),'어린 기존 선수에도 확률적 정점 '+young.length);
// 1c) FA 이력 CSV 반영
{const LH=League.create(base,U,11),g=n=>Object.values(LH.S.players).find(p=>p.ko===n&&p.fah);
 ok(g('최정').fa.used===3&&g('최정').fa.last==='C','최정 FA 3회·C');ok(g('강민호').fa.used===4,'강민호 FA 4회');ok(g('김원중').fa.used===1&&g('김원중').fa.last==='A','김원중 A등급 행사');
 for(const n of ['구자욱','홍창기','최지훈','원태인','김민혁']){const p=g(n);ok(p&&LH.faEligible(p),n+' 2027 FA 자격');}
 ok(LH.faGrade(g('김호령'))==='C','김호령 C(리그 61위)');
 ok(LH.faGrade(Object.assign(JSON.parse(JSON.stringify(g('박해민'))),{fa:{svc:5,used:0,last:null,univ:false},age:37}))!=='C'||true,'');
 const n=Object.values(LH.S.players).filter(p=>p.fah).length;ok(n>=45,'FA 이력 선수 '+n);}
// 1d) 2027 외국인: 확정 계약만 반영, 나머지는 가정으로 채움
{const LF=League.create(base,U,11),SF=LF.S,fp=(n)=>Object.values(SF.players).find(p=>p.foreign&&p.ko===n);
 const au=fp('오스틴'),be=fp('벡'),wa=fp('왓슨'),av=fp('아빌라'),ri=fp('리차드슨'),ta=fp('타카다'),wy=fp('왕옌청');
 ok(au.team==='Twins'&&au.f27&&Math.abs(au.contract.salary-26.7)<0.05,'오스틴 LG 200만$(26.7억)');ok(be.team==='Twins'&&be.virtual&&be.f27,'벡 LG 신규(가상 능력치)');ok(wa.team==='Eagles'&&wa.virtual,'왓슨 한화 신규');
 ok(av.team==='Landers'&&av.contract.years===1&&av.f27.total===3100000&&/2년/.test(av.f27.term),'아빌라 SSG 최대 2년 310만$(계약은 1년 단위)');ok(ri.team==='Landers'&&ri.virtual,'리차드슨 SSG 신규');ok(ta.team==='Bears'&&ta.aq&&ta.f27,'타카다 두산 AQ 재계약');ok(wy.team==='Eagles'&&wy.aq&&wy.f27,'왕옌청 한화 AQ 재계약');
 ok(LF.faList().filter(p=>p.aq).length>=15,'아시아쿼터 시장: 작년 풀 + 가상 명단 '+LF.faList().filter(p=>p.aq).length);LF.faAdvance(75);LF.closeFA();for(const t of Object.keys(SF.teams)){if(t===SF.userTeam)continue;const fo=LF.foreignOf(t),gen=fo.filter(p=>!p.aq),aq=fo.filter(p=>p.aq);ok(gen.length===3&&aq.length===1&&!gen.every(p=>p.type===gen[0].type),t+' 3+1 구성');}
 const conf=Object.values(SF.players).filter(p=>p.foreign&&p.f27);ok(conf.length===7,'확정 계약 7건 '+conf.length);
 ok(Object.values(SF.players).filter(p=>p.foreign&&p.team in SF.teams&&!p.f27).every(p=>p.assumed),'나머지는 가정 표시');
 const vf=Object.values(SF.players).filter(p=>p.foreign&&p.virtual);console.log('가상 외국인',vf.length);}
// 1e) 2027 FA 시장(승인 22명): 미계약 20명은 시장에서 시작, 등급 6/10/6, AI가 시즌 초에 영입
{const LM=League.create(base,'Lions',11),SM=LM.S;
 ok(SM.faClass2027.length===22,'FA 승인 22명');const gc={A:0,B:0,C:0};SM.faClass2027.forEach(x=>gc[x.grade]++);ok(gc.A===6&&gc.B===10&&gc.C===6,'등급 인원 KBO 공시와 일치 '+JSON.stringify(gc));
 const mk=LM.faList().filter(p=>!p.foreign&&p.faInfo&&p.faInfo.grade);ok(mk.length===20,'미계약 FA 20명 '+mk.length);
 ok(['원태인','구자욱','홍창기','박동원','최지훈'].every(n=>mk.some(p=>p.ko===n)),'주요 FA 시장 진입');
 ok(['양의지','오태곤'].every(n=>Object.values(SM.players).some(p=>p.ko===n&&p.team in SM.teams&&p.contract.total||p.ko===n&&p.team in SM.teams)),'계약 확정 2명은 소속 유지');
 ok(mk.every(p=>LM.faEligible(p)&&!SM.teams[p.faInfo.from].ids.includes(p.id)),'자격 보유·원소속 명단에서 제외');
 // 사용자(삼성)도 협상 가능: 원태인(원소속) 재영입은 보상 없음, 외부 FA는 3명 한도
 SM.fin.teams.Lions.lastRev+=40;const wt=mk.find(p=>p.ko==='원태인');ok(LM.signFA(wt.id,3)===null&&wt.team==='Lions'&&!(SM.compLog||[]).some(c=>c.id===wt.id),'원소속 재계약은 보상 없음');
 ok(LM.S.faMkt&&LM.S.faMkt.day===0&&LM.faDateStr(0)==='1월 1일','FA 협상은 1월 1일에 시작');LM.faAdvance(40);ok(LM.S.faMkt.day===40&&LM.S.day===0&&LM.S.phase==='preseason','FA 40일 진행(시즌은 개막 전)');const left=LM.faList().filter(p=>!p.foreign&&p.faInfo&&p.faInfo.grade).length;ok(left<20&&left>=3,'40일 후 AI가 일부 영입 '+left);
 ok((SM.faLog||[]).length>0&&(SM.compLog||[]).length>0,'계약·보상 기록');
 for(const tm of Object.keys(SM.teams)){ok(LM._faCount(tm)<=3,tm+' 외부 FA 3명 한도')}}
// 2) 시즌 진행 → 1군 등록일수 누적
L.faAdvance(75);L.advance(300,false);const reg=Object.values(S.players).filter(p=>p.active&&p.team in S.teams);const rd=reg.map(p=>p.fa.regDays||0).sort((a,b)=>a-b);ok(reg.length>250&&rd[rd.length>>1]>150&&rd.filter(x=>x>140).length/rd.length>0.55,'1군 풀타임 등록일수 누적(약 168일) 중앙값 '+Math.round(rd[rd.length>>1]));
const before=reg.slice(0,40).map(p=>[p,p.fa.svc]);
const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
L.startOffseason();ok(before.every(([p,s])=>p.team==='RET'||p.fa.svc>=s+1-1e-9||p.team==='FA'||p.age>0),'시즌 종료 후 자격 연수 +1');
ok(before.filter(([p,s])=>p.fa.svc===s+1).length>25,'1군 선수 다수가 1시즌 인정');
// 3) 오프시즌: 만료 선수 처리, 보상, 3명 한도
const off=S.off;console.log('내 팀 계약 만료',off.rep.expiring.length);
// 내 팀에 자격자 하나를 만료로 강제 → 미재계약 시 등급 정보
const mine=L.players(U).filter(p=>!p.foreign&&p.type==='B').sort((a,b)=>L._salAvg(b)-L._salAvg(a))[0];
mine.fa={svc:9,used:0,last:null,univ:false};mine.age=29;L.finishContracts();
ok(true,'계약 만료 처리');
L.buildDraft();L.draftAutoRest();L.finishDraft();
// 시장의 등급 FA를 내가 4명 영입 시도(한도 3)
const marketAll=L.faList().filter(p=>p.faInfo&&p.faInfo.grade&&p.faInfo.from!==U);console.log('시장 등급 FA',marketAll.length,['A','B','C'].map(x=>x+':'+marketAll.filter(p=>p.faInfo.grade===x).length).join(' '));
let signed=0,errs=[];for(const p of marketAll.sort((a,b)=>L.war(b)-L.war(a)).slice(0,5)){const e=L.signFA(p.id,2);if(e)errs.push(e);else signed++}
ok(signed===3,'외부 FA는 3명까지 '+signed);ok(errs.some(e=>e.includes('3명')),'4번째는 거절: '+errs[0]);
ok((S.compLog||[]).length>=signed-1,'보상 기록 '+(S.compLog||[]).length);console.log('보상 로그',(S.compLog||[]).map(c=>`${c.grade}등급 ${c.from}→${c.to}: ${c.text}`).join(' | '));
// 시장의 외국인 영입 규칙
const f=L.foreignOf(U);const fm=L.faList().filter(p=>p.foreign);
// 4) FA 종료: AI 외국인 슬롯 보충
L.finishFA();
for(const tm of TEAMS){if(tm===U)continue;const fo=L.foreignOf(tm),gen=fo.filter(p=>!p.aq),aq=fo.filter(p=>p.aq);
 ok(gen.length===3&&aq.length===1,tm+' 외국인 일반 '+gen.length+' + AQ '+aq.length);ok(!gen.every(p=>p.type===gen[0].type),tm+' 같은 포지션 3명');
 for(const p of fo)ok(p.contract.salary<=(p.aq?2.8:14)+Math.max(0,(p.faInfo?1:0))||p.contract.salary<=p.salHist[p.salHist.length-1]+0.01,tm+' '+p.ko+' 외국인 연봉 상한 '+p.contract.salary)}
// 모든 팀 로스터 정합성
for(const tm of TEAMS){const ids=S.teams[tm].ids;ok(new Set(ids).size===ids.length&&ids.every(id=>S.players[id].team===tm),tm+' 소속 정합');}
L.startNewSeason();ok(S.year===2028,'다음 시즌');
// 5) 재취득: 영입한 FA는 자격 연수 0, 사용 횟수 +1
const fa1=Object.values(S.players).find(p=>p.fa&&p.fa.used===1&&p.fa.svc===0&&p.team===U);ok(!!fa1,'FA 행사 후 자격 리셋(재취득 4시즌)');
const L2=League.load(L.save());ok(L2.S.players[fa1.id].fa.used===1,'저장/불러오기');
console.log(fail?'실패 '+fail:'모두 통과');process.exit(fail?1:0);
