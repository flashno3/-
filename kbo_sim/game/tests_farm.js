// 2군 시스템 1단계 검증: 엔트리 규칙, 2군 경기 진행, 환경 유지, 저장/불러오기
const fs=require('fs'),path=require('path');
const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}};
const L=League.create(base,'Lions',2027),S=L.S,T='Lions',TEAMS=Object.keys(S.teams);
// 1) 초기 상태
for(const t of TEAMS){const a=L.players(t).filter(p=>p.active);ok(a.length<=29&&a.length>=27,t+' 1군 인원 '+a.length);
 ok(L.farmPool(t).H.length>=9&&L.farmPool(t).P.length>=8,t+' 2군 풀 부족');}
console.log('1군/2군 인원',TEAMS.map(t=>L.players(t).filter(p=>p.active).length+'/'+L.players(t).filter(p=>!p.active).length).join(' '));
// 2) 규칙
const farmB=L.hitters(T).filter(p=>!p.active),act=L.players(T).filter(p=>p.active);
let err=L.moveActive(farmB[0].id,true);ok(err&&err.includes('29'),'29명 초과 차단: '+err);
const down=L.hitters(T,true).sort((a,b)=>L._runsB(a,true)-L._runsB(b,true)).find(p=>!S.teams[T].set.lineup.some(x=>x.id===p.id));
ok(L.moveActive(down.id,false)===null,'말소 성공');ok(!down.active,'말소됨');
ok(L.moveActive(down.id,true)===null&&down.active,'프리시즌 재등록은 자유');
// 시즌 중 말소 → 10경기일 잠금
L.advance(5,false);ok(L.moveActive(down.id,false)===null,'시즌 중 말소');
err=L.moveActive(down.id,true);ok(err&&err.includes('10경기일'),'잠금 메시지: '+err);ok(L.lockLeft(down)===10,'잠금 10일 '+L.lockLeft(down));
L.advance(9,false);ok(L.moveActive(down.id,true)&&true,'9일 후에도 잠금');
L.advance(1,false);ok(L.moveActive(down.id,true)===null&&down.active,'10일 후 재등록');
// 최소 인원
const hs=L.hitters(T,true);let n=0;for(const p of hs.slice().reverse()){if(L.moveActive(p.id,false))break;n++;}ok(L.hitters(T,true).length===10,'타자 최소 10명: '+L.hitters(T,true).length);
L.hitters(T).filter(p=>!p.active&&S.day>=(p.lockUntil||0)).forEach(p=>L.moveActive(p.id,true));
// 3) 시즌 완주 + 2군 기록
L.advance(300,false);
const st2=L.standings2();console.log(st2.map(x=>`${x.rank} ${x.team} ${x.w}-${x.l}-${x.d} ${x.rs}/${x.ra}`).join(' | '));
let g2=0,r2=0;for(const x of st2){g2+=x.w+x.l+x.d;r2+=x.rs}console.log('2군 팀경기',(g2/11).toFixed(1),'경기당 득점',(r2/g2).toFixed(2));
ok(st2.length===11&&st2.every(x=>x.w+x.l+x.d>=125&&x.w+x.l+x.d<=144),'2군 11팀 부전 포함 125~144경기');
const st1=L.standings();let g1=0,r1=0;for(const x of st1){g1+=x.w+x.l+x.d;r1+=x.rs}console.log('1군 경기당 득점',(r1/g1).toFixed(2));
ok(Math.abs(r1/g1-5.1)<0.45,'1군 득점환경 '+(r1/g1).toFixed(2));
for(const t of TEAMS){const hs2=L.hitters(t).filter(p=>S.stats2.bat[p.id]&&S.stats2.bat[p.id].PA>0);ok(hs2.length>=9,t+' 2군 타자 기록 '+hs2.length);
 const ps2=L.pitchers(t).filter(p=>S.stats2.pit[p.id]&&S.stats2.pit[p.id].BF>0);ok(ps2.length>=5,t+' 2군 투수 기록 '+ps2.length);}
// 1군/2군 기록 분리: 선수 합 PA = 팀 PA 대략
let pa1=0,pa2=0;for(const id in S.stats.bat)pa1+=S.stats.bat[id].PA;for(const id in S.stats2.bat)pa2+=S.stats2.bat[id].PA;console.log('PA 1군',pa1,'2군',pa2);ok(pa2>pa1*0.85&&pa2<pa1*1.15,'2군 PA 규모');
const rid=Object.keys(S.recent)[0];ok(S.recent[rid].length<=10,'recent 10개 이하');
// 4) 저장/불러오기
const L2=League.load(L.save());ok(L2.standings2()[0].team===st2[0].team,'저장 후 2군 순위 보존');
// 구버전 저장(2군 필드 없음)
const old=JSON.parse(L.save());delete old.stats2;delete old.rec2;delete old.recent;const L3=League.load(JSON.stringify(old));L3.S.day=0;L3.S.phase='regular';L3.S.day=10;L3.playFutures(10);ok(L3.standings2().reduce((a,x)=>a+x.w+x.l+x.d,0)===10,'구버전 저장 호환');
console.log(fail?'실패 '+fail:'모두 통과');process.exit(fail?1:0);
