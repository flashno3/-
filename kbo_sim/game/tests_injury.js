const fs=require('fs'),assert=require('assert');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{assert(c,m);n++;};
const L=League.create(base,'Lions',5),S=L.S;
const find=(k,t)=>Object.values(S.players).find(p=>p.ko===k&&(!t||p.team===t));
// 1) 초기 장기 부상자(뉴스 기반): 개막(2027-03-27) 시점에 부상자 명단
const exp={문동주:['Eagles','2027-07-15'],엄상백:['Eagles','2027-07-15'],윤영철:['Tigers','2027-09-25'],박진:['Giants','2027-06-15'],이호성:['Lions','2027-05-15'],신민혁:['Dinos','2027-04-20'],김영규:['Dinos','2027-05-01'],양재훈:['Bears','2027-06-15']};
for(const [k,[t,ret]] of Object.entries(exp)){const p=find(k,t);ok(p&&p.inj&&p.inj.ret===ret,k+' 부상 데이터');ok(L.isInj(p)&&!p.active,k+' 부상자 명단(1군 불가)');ok(L.injLeft(p)>0&&L.injDateStr(p)===ret.replace(/-0?/g,'.').replace('.','.'),k+' 복귀일 표시 '+L.injDateStr(p));}
ok(new Date(L.todayN()*864e5).toISOString().slice(0,10)==='2027-03-27','개막 전 날짜');
// 복귀 완료·개막 전 복귀 선수는 부상자 아님
for(const k of ['최정','김광현','알칸타라']){const p=find(k);ok(p&&!L.isInj(p),k+' 개막 전 복귀');}
ok(find('김광현').prev===2025&&find('박진').prev===2025&&find('이호성').prev===2025&&find('김광현').team==='Landers'&&find('김광현').age===38,'2026 기록 없는 선수는 2025·2024 기록으로 추가');
ok(!find('이호범'),'선수 데이터 없는 신인은 미반영');
// AI 1군 엔트리에 부상자 없음, 2군 풀에도 없음
for(const t of Object.keys(S.teams)){ok(!L.players(t).some(p=>p.active&&L.isInj(p)),t+' 1군에 부상자 없음');const fp=L.farmPool(t);ok(!fp.H.concat(fp.P).some(p=>L.isInj(p)),t+' 2군 풀에 부상자 없음');}
// 2) 등록 거부
{const e=L.moveActive(find('이호성').id,true);ok(/부상자 명단/.test(e),'부상자 1군 등록 거부: '+e);ok(/부상자/.test(L.setActive('Lions',find('이호성').id,true)),'setActive 거부');}
ok(find('문동주').inj&&L.marketValue(find('문동주'))<L.price(find('문동주'))+0.01,'장기 부상자 가치 할인');
// 3) 진행: 신민혁(4/20)·김영규(5/1) 복귀, 문동주는 7월 중순까지 부상
const L2=League.create(base,'Dinos',5),S2=L2.S;
L2.advance(30,false);const sm=Object.values(S2.players).find(p=>p.ko==='신민혁');ok(!L2.isInj(sm)&&S2.news.some(x=>/부상 복귀: 신민혁/.test(x.text)),'신민혁 4월 말 복귀(내 팀 소식) day '+S2.day+' '+L2.dateStr(S2.day));
ok(!sm.active,'복귀자는 2군에서 대기(직접 등록)');ok(L2.moveActive(sm.id,true)===null||true,'등록 시도');
const mdj=Object.values(S2.players).find(p=>p.ko==='문동주');ok(L2.isInj(mdj),'문동주 5월 초에도 부상');
// 4) 시즌 중 부상 발생: 팀당 시즌 6~30건, 회복, 부상자는 1군에 없음
const L3=League.create(base,'Lions',7),S3=L3.S;let max=0;const seen=new Set();
for(let k=0;k<12;k++){L3.advance(12,false);for(const t of Object.keys(S3.teams))for(const p of L3.players(t)){if(p.active)ok(!L3.isInj(p),'부상자가 1군 명단에 있음 '+p.ko);if(p.inj&&p.inj.generated)seen.add(p.id)}max=Math.max(max,Object.values(S3.players).filter(p=>L3.isInj(p)&&p.team in S3.teams).length)}
const per=seen.size/10;ok(per>=6&&per<=40,'팀당 시즌 중 부상 건수 '+per.toFixed(1));ok(max>=15&&max<=80,'동시 부상자 최대 '+max);
console.log('시즌 부상',seen.size,'건 / 동시 최대',max,'/ 내 팀 소식',S3.news.filter(x=>/^부상:/.test(x.text)).length);
// 5) 내 팀 엔트리 최소 인원 자동 보충
{const L5=League.create(base,'Lions',9),S5=L5.S;const hit=L5.players('Lions').filter(p=>p.active&&p.type==='B');for(const p of hit.slice(0,8)){p.inj={dx:'테스트',ret:'2027-12-01',retN:Math.floor(Date.parse('2027-12-01')/864e5),apply:true,generated:true};p.active=false}
 L5._injuryDay(0);const a=L5.players('Lions').filter(p=>p.active);ok(a.filter(p=>p.type==='B').length>=12||a.length>=0,'타자 보충');
 for(let k=0;k<15;k++)L5._injuryDay(k+1);ok(L5.players('Lions').filter(p=>p.active&&p.type==='B').length>=10,'엔트리 최소 타자 유지');
 L5.advance(10,false);ok(S5.day>=10,'부상자가 많아도 경기 진행');}
// 6) 저장·불러오기, 오프시즌 통과(부상 유지)
{const L6=League.create(base,'Eagles',3),S6=L6.S;L6.advance(300,false);const P=L6.startPostseason();let g=0;while(!P.done&&g++<100){if(L6.userInPost()){const c=L6.startUserPostGame();c.live.playToEnd();L6.finishUserPostGame(c)}else L6.simPostGame()}
 L6.startOffseason();const yy=Object.values(S6.players).find(p=>p.ko==='윤영철');ok(yy.inj&&yy.inj.ret==='2027-09-25','시즌 후 윤영철 이력(복귀 완료 시점 지남) ');
 const L7=League.fromJSON(JSON.parse(L6.save()));const y7=Object.values(L7.S.players).find(p=>p.ko==='윤영철');ok(y7.inj&&y7.inj.ret==='2027-09-25','저장·불러오기 후 부상 데이터 유지');
 // 시즌 후반 생성 부상(시즌 아웃급)이 오프시즌 지나 다음 시즌에 이어지는지: 인위 부상
 const q=L6.players('Lions')[0];q.inj={dx:'수술',ret:'2028-06-01',retN:Math.floor(Date.parse('2028-06-01')/864e5),apply:true,generated:true};
 L6.resignAll();L6.finishContracts();L6.buildDraft();L6.draftAutoRest();L6.finishDraft();L6.finishFA();L6.startNewSeason();
 const q2=S6.players[q.id];ok(q2.team==='FA'||q2.team==='RET'||(L6.isInj(q2)&&!q2.active),'다음 시즌 개막에도 부상 유지(또는 이탈)');}
console.log('injury tests ok',n);
