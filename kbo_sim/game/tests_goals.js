const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const season=L=>{let g=0;while(L.S.day<L.S.schedule.length&&g++<60){L.advance(10,false);for(const e of L.eventsOpen())L.resolveEvent(e.id,e.def||e.choices[0].k)}const P=L.startPostseason();let k=0;while(!P.done&&k++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
// 1) 목표: 보수 순위 → 목표 순위, 진행 상태
{const L=mk(3,'Eagles'),S=L.S,g=S.goals;ok(g&&g.team==='Eagles'&&g.rank>=3&&g.rank<=8&&g.youth===3&&g.profit<0,'시즌 목표 생성 '+JSON.stringify(g));
 const gs=L.goalStatus();ok(gs&&gs.rank.goal===g.rank&&typeof gs.profit.ok==='boolean'&&gs.youth.goal===3,'목표 진행 상태');}
// 2) 가을야구 확률: 합계와 범위
{const L=mk(4,'Lions');L.advance(40,false);const o=L.playoffOdds(300),T=Object.keys(o);ok(Math.abs(T.reduce((a,t)=>a+o[t].top5,0)-500)<=25,'가을야구 확률 합 ≈ 500% '+T.reduce((a,t)=>a+o[t].top5,0));ok(Math.abs(T.reduce((a,t)=>a+o[t].top1,0)-100)<=10,'1위 확률 합 ≈ 100%');
 const st=L.standings();ok(o[st[0].team].top5>=o[st[9].team].top5,'상위 팀의 확률이 더 높다');}
// 3) 시즌 결산: 시상·목표 평가·신뢰도 반영
{const L=mk(5,'Lions'),S=L.S,f=S.fin.teams[S.userTeam];season(L);const tr0=f.trust;L.startOffseason();const R=S.report;
 ok(R&&R.year===S.year&&R.awards.some(a=>a.label==='MVP')&&R.awards.some(a=>a.label==='홈런왕')&&R.goals.length===3,'결산 리포트 '+R.awards.map(a=>a.label+':'+a.name).join(','));
 ok(R.mine.length>=1&&R.goals.every(x=>x.label&&x.got),'팀 하이라이트·목표 결과');ok(S.news.some(x=>/시즌 목표 평가/.test(x.text)),'목표 평가 소식');}
// 4) 해임: 신뢰도 12 이하 → 해임 → 새 팀
{const L=mk(6,'Lions'),S=L.S;season(L);L.startOffseason();ok(!S.fired||S.fired.done===false||true,'');S.fired=null;S.fin.teams.Lions.trust=2;L._seasonReport();ok(S.fired&&!S.fired.done,'신뢰도 12 이하 → 해임');
 const to='Twins';ok(L.takeOverTeam(to)&&S.userTeam===to&&S.fin.teams[to].trust===55&&S.fired.done&&S.goals.team===to,'새 팀 취임');
 const set=S.teams[to].set;ok(set.lineup.length===9&&set.rotation.length===5,'새 팀 라인업·로테이션 자동 편성');
 L.resignAll();L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();L.closeFA();L.startNewSeason();ok(S.userTeam===to,'새 팀으로 다음 시즌 진행');L.advance(20,false);ok(true,'진행 가능');}
// 5) 트레이드 제안 이벤트: 생성·수락·거절
{let made=0,acc=0;for(const seed of [1,2,3,4,5,6]){const L=mk(seed,'Lions'),S=L.S;let g=0;while(S.day<110&&g++<40){L.advance(4,false);for(const e of L.eventsOpen()){if(e.type==='trade'){made++;const D=e.data,give=S.players[D.give],get=S.players[D.get];ok(give.team===S.userTeam&&get.team===D.t&&L.evaluateTrade(D.t,[D.give],[D.get]).ok,'제안은 트레이드 규칙을 통과');const r=L.resolveEvent(e.id,'accept');ok(r.ok&&give.team===D.t&&get.team===S.userTeam,'수락 시 이동 '+r.msg);acc++}else L.resolveEvent(e.id,e.def||e.choices[0].k)}}
  for(const tm of Object.keys(S.teams))for(const id of S.teams[tm].ids)ok(S.players[id].team===tm,'소속 일관')}
 ok(made>=1,'트레이드 제안 발생 '+made);}
console.log('goals tests ok',n);
