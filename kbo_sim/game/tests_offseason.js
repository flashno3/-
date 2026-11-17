const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
const fail=(m)=>{console.log('실패:',m);process.exitCode=1};
const L=League.create(base,'Tigers',77);const U='Tigers',S=L.S;
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
function league(){const P=Object.values(S.players).filter(p=>['B','P'].includes(p.type)&&!p.retired&&p.team!=='RET'&&p.team!=='DRAFT'&&p.team!=='FA');return{B:P.filter(p=>p.type==='B'),P:P.filter(p=>p.type==='P')}}
for(let y=0;y<4;y++){
  L.advance(300,false);const st=L.standings();let tr=0,tg=0;for(const x of st){if(x.team===U)continue;tr+=x.rs;tg+=x.w+x.l+x.d}
  const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
  const lg=league();
  console.log(`[${S.year}] 내 팀 ${st.find(x=>x.team===U).rank}위 | 우승 ${P.champion} | AI 득점/경기 ${(tr/tg).toFixed(2)} | 타자 평균 OVR ${mean(lg.B.filter(p=>p.PA>=250).map(p=>L.ovr(p))).toFixed(1)} 투수 ${mean(lg.P.filter(p=>p.IP>=60).map(p=>L.ovr(p))).toFixed(1)} | 평균 나이 타자 ${mean(lg.B.map(p=>p.age)).toFixed(1)}`);
  // 오프시즌
  const off=L.startOffseason();
  console.log('   성장 리포트(내 팀):',off.rep.prog.slice().sort((a,b)=>b.d-a.d).slice(0,2).map(x=>S.players[x.id].ko+(x.d>0?'+':'')+x.d).join(' '),'...',off.rep.prog.slice().sort((a,b)=>a.d-b.d).slice(0,2).map(x=>S.players[x.id].ko+x.d).join(' '),'| 은퇴',off.rep.retired.length,'| 계약만료',off.rep.expiring.length);
  // 재계약: 만료자 중 OVR 50 이상은 재계약
  for(const id of off.rep.expiring.slice()){const p=S.players[id];if(L.ovr(p)>=48){const e=L.resign(id,2);if(e&&!/상한/.test(e))fail('재계약 '+e)}}
  L.finishContracts();
  // 드래프트
  const d=L.buildDraft();L.draftAiUntilUser();let mine=0;
  while(L.draftOnClock()){ if(L.draftOnClock()===U){const best=d.pool.map(i=>S.players[i]).sort((a,b)=>(b.scout.o+14*b.scout.pot)-(a.scout.o+14*a.scout.pot))[0];const e=L.draftPick(best.id);if(e){console.log('   지명 불가',e);break}mine++}L.draftAiUntilUser();if(d.pick>=d.order.length)break}
  L.finishDraft();
  // FA: 상한 안에서 가장 가치 높은 선수 한 명
  const fa=L.faList().sort((a,b)=>L.war(b)-L.war(a));let signed=null;for(const p of fa){const e=L.signFA(p.id,2);if(!e){signed=p;break}}
  console.log(`   드래프트 내 지명 ${mine}명 | FA 시장 ${fa.length}명 중 영입: ${signed?signed.ko+'(OVR'+L.ovr(signed)+') '+signed.contract.salary+'억':'없음(상한)'} | 연봉 ${L.payroll(U)}/${S.calib.cap}억`);
  L.finishFA();
  // 트레이드 시도: 내 팀 비핵심 선수 ↔ 타 팀 비슷한 가치
  const ai='Wiz';const mine2=L.players(U).filter(p=>!p.active).sort((a,b)=>L.marketValue(b)-L.marketValue(a))[0],theirs=L.players(ai).filter(p=>!p.active).sort((a,b)=>L.marketValue(a)-L.marketValue(b))[0];
  if(mine2&&theirs){const ev=L.evaluateTrade(ai,[mine2.id],[theirs.id]);console.log('   트레이드 평가',mine2.ko,mine2.marketValue?'':L.marketValue(mine2),'↔',theirs.ko,L.marketValue(theirs),'→',ev.ok?'수락':'거절('+ev.why+')');}
  // 로스터/제약 검증
  for(const t of Object.keys(S.teams)){const n=S.teams[t].ids.length;if(n>75||n<40)fail(`${t} 로스터 ${n}`);const ids=new Set(S.teams[t].ids);if(ids.size!==n)fail('중복 선수');for(const id of S.teams[t].ids)if(S.players[id].team!==t)fail('소속 불일치 '+id)}
  L.startNewSeason();
  const act=L.players(U).filter(p=>p.active);if(act.length>28)fail('1군 초과 '+act.length);if(L.S.teams[U].set.lineup.length!==9)fail('라인업');
  if(S.year!==2027+y+1)fail('연도');
}
const s1=L.save();const L2=League.load(s1);console.log('저장 크기',Math.round(s1.length/1024),'KB | 로드 후 선수 수',Object.keys(L2.S.players).length);
L2.advance(10,false);console.log('로드 후 진행 OK day',L2.S.day);
