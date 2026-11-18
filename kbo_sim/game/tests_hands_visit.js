const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
const fail=m=>{console.log('실패:',m);process.exitCode=1};
const L=League.create(base,'Lions',2027);const S=L.S;
// 1) 투타 불러오기: KBO 등록 현황 표 형식 + 간단한 형식 + 동명이인
const text=[
 '번호\t선수명\t투타\t생년월일','27\t김지찬\t우투우타\t2000-04-06','51\t디아즈\t우투좌타\t1996-01-01','강민호,삼성,우투좌타','김도영 KIA 우투우타','2\t이승현\t좌투좌타\t2002-01-01','이름없는선수,좌투좌타'].join('\n');
const r=L.importHands(text);console.log('적용',r.applied,'| 동명이인',r.ambiguous,'| 못 찾음',r.missing.length);
const pick=n=>Object.values(S.players).find(p=>p.ko===n&&p.team in S.teams);
if(r.applied<3)fail('적용 수');if(!r.ambiguous.includes('이승현'))fail('동명이인 보고');
console.log('김지찬',L.handLabel(pick('김지찬')),'디아즈',L.handLabel(pick('디아즈')),'강민호',L.handLabel(pick('강민호')),'김도영',L.handLabel(pick('김도영')));
if(L.handLabel(pick('디아즈'))!=='좌타')fail('좌타 인식');
console.log('양식 줄 수(입력 안 된 선수):',L.handTemplate().split('\n').length);
// 2) 전 선수에 임의 투타를 부여하고 엔진에서 좌우 상성이 작동하는지
let i=7;const rnd=()=>{i=(i*1103515245+12345)&0x7fffffff;return i/0x7fffffff};
for(const p of Object.values(S.players)){if(p.type==='B')p.bats=rnd()<0.32?'L':rnd()<0.1?'S':'R';else p.throws=rnd()<0.27?'L':'R'}L.invalidate();
let a=[],b=[];for(const hands of [false,true]){const L2=League.create(base,'Lions',99);if(hands){for(const p of Object.values(L2.S.players)){if(p.type==='B')p.bats=rnd()<0.32?'L':rnd()<0.1?'S':'R';else p.throws=rnd()<0.27?'L':'R'}L2.invalidate()}
 L2.advance(300,false);const st=L2.standings();let tr=0,tg=0;for(const x of st){tr+=x.rs;tg+=x.w+x.l+x.d}(hands?b:a).push(tr/tg)}
console.log('득점/경기 (투타 없음 / 임의 투타 적용):',a[0].toFixed(2),b[0].toFixed(2));
// 3) 마운드 방문 규칙
const L3=League.create(base,'Lions',2027);const r3=L3.advance(5,true);const ctx=L3.startUserGame(r3.game,r3.idx);const g=ctx.live,us=ctx.userSide;
// 우리 수비 하프까지 진행
let guard=0;while(!g.finished&&g.fldSide!==us&&guard++<200)g.step();
console.log('내 수비 시작:',g.inning+(g.top?'초':'말'),'방문 가능',g.canVisit(us));
g.step();g.step();const f0=g.pitchFatigue(us).bf;const e1=g.moundVisit(us);console.log('1차 방문:',e1.length?'성공':'실패','| 안정 타자 수',g.calm[us],'| 체력(상대타자 수)',f0,'→',g.pitchFatigue(us).bf);
console.log('같은 이닝 2차 방문 차단:',!g.canVisit(us)&&g.moundVisit(us).length===0);
// 다음 내 수비 이닝에서 방문 가능, 3회 후 4번째 차단
let visits=1;while(!g.finished&&visits<3&&guard++<2000){g.step();if(g.fldSide===us&&g.canVisit(us)&&(g.h.log.length>=0)){const e=g.moundVisit(us);if(e.length)visits++}}
guard=0;while(!g.finished&&g.visits[us]>=3&&guard++<2000){g.step();if(g.fldSide===us)break}
console.log('방문 횟수',g.visits[us],'| 4번째 가능?',g.canVisit(us)?'가능(실패)':'차단');if(g.canVisit(us))fail('경기당 3회 제한');
// 안정 효과: 우리 투수가 3타자를 상대하면 해제
const L4=League.create(base,'Lions',2027);const r4=L4.advance(5,true);const c4=L4.startUserGame(r4.game,r4.idx);const g4=c4.live,u4=c4.userSide;let gu=0;while(!g4.finished&&g4.fldSide!==u4&&gu++<200)g4.step();
g4.moundVisit(u4);const pit=g4.staff[u4].cur,bf0=g4.bf[pit.id]||0;let seen=[];gu=0;while(!g4.finished&&g4.calm[u4]>0&&gu++<400){g4.step();seen.push(g4.calm[u4])}
const faced=(g4.bf[pit.id]||0)-bf0;console.log('안정 해제까지 우리 투수가 상대한 타자',faced,'명 (기대 3, 중간에 투수 교체 시 즉시 해제)');if(g4.calm[u4]!==0)fail('안정 해제');
