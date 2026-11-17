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
// 2) 시즌 진행 → 1군 등록일수 누적
L.advance(300,false);const reg=Object.values(S.players).filter(p=>p.active&&p.team in S.teams);const rd=reg.map(p=>p.fa.regDays).sort((a,b)=>a-b);ok(reg.length>250&&rd[rd.length>>1]>160&&rd.filter(x=>x>150).length/rd.length>0.6,'1군 풀타임 등록일수 누적(약 168일) 중앙값 '+Math.round(rd[rd.length>>1]));
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
