const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
// 1) 기본 조건: 시즌이 끝날 때까지 여러 번 멈추고, 이유가 있다
{const L=mk(3),S=L.S;let stops=0,reasons=[],g=0,days=0;
 while(g++<200){const r=L.advanceMoment(false);if(r.status==='seasonEnd')break;ok(r.status==='moment'&&r.reason&&r.played>=1,'멈춤 이유');stops++;reasons.push(r.reason);days+=r.played;for(const e of L.eventsOpen())L.resolveEvent(e.id,e.def||e.choices[0].k)}
 ok(S.phase==='regular_done'&&S.day>=S.schedule.length,'시즌 끝까지 진행');ok(stops>=3&&stops<=100,'시즌 중 중요 순간(43단계 감독 결정 포함, 약 2경기에 1번 이하) '+stops+'회 — '+[...new Set(reasons.map(x=>x.split(':')[0].split(' ')[0]))].join(','));
 ok(reasons.some(x=>/마감/.test(x)),'트레이드 마감 5일 전에 멈춤');}
// 2) 조건 끄기: 아무것도 끄면 시즌 끝까지 한 번에
{const L=mk(4),S=L.S;for(const k of ['event','injury','deadline','odds','goal','month'])ok(L.setStop(k,false),'조건 끄기 '+k);ok(!L.setStop('x',true),'알 수 없는 조건 거부');
 const r=L.advanceMoment(false);ok(r.status==='seasonEnd'&&r.played>=140,'모든 조건을 끄면 시즌 끝까지 '+r.status+' '+r.played);}
// 3) 개별 조건: 월초 점검·이벤트
{const L=mk(5),S=L.S;for(const k of ['event','injury','deadline','odds','goal'])L.setStop(k,false);L.setStop('month',true);let g=0,rs=[];while(g++<20){const r=L.advanceMoment(false);if(r.status!=='moment')break;rs.push(r.reason)}
 ok(rs.length>=4&&rs.every(x=>/월 점검/.test(x)),'월초 점검만 켜면 월마다 멈춤 '+rs.join(','));}
// 4) 직접 지휘 모드: 내 경기마다 멈추지 않는다(다음 중요 순간 = 다음 경기 1회 문제)
{const L=mk(6),S=L.S;let g=0,stops={highlight:0,moment:0,userGame:0},maxPlayed=0,total=0;
 while(g++<200){const r=L.advanceMoment(true,true);if(r.status==='seasonEnd')break;ok(r.status!=='userGame','접전 모드는 경기 시작에서 멈추지 않는다');stops[r.status]=(stops[r.status]||0)+1;maxPlayed=Math.max(maxPlayed,r.played);total+=r.played;
  if(r.status==='highlight'){const gm=r.ctx.live;ok(!gm.finished&&gm.inning>=7,'하이라이트에서 멈춤');L.playAuto(r.ctx);L.finishUserGame(r.ctx)}for(const e of L.eventsOpen())L.resolveEvent(e.id,e.def||e.choices[0].k)}
 ok(maxPlayed>=3,'한 번에 여러 날 진행 '+maxPlayed);ok((stops.highlight||0)+(stops.moment||0)>=5,'멈춤 '+JSON.stringify(stops));}
{const L=mk(7),S=L.S;let g=0,kg=0,mom=0;while(g++<300){const r=L.advanceMoment(true,false);if(r.status==='seasonEnd')break;if(r.status==='userGame'){kg++;ok(/중요 경기/.test(r.reason),'전체 직접 지휘는 중요 경기에서만 멈춤 '+r.reason);const ctx=L.startUserGame(r.game,r.idx);L.playAuto(ctx);L.finishUserGame(ctx)}else mom++;for(const e of L.eventsOpen())L.resolveEvent(e.id,e.def||e.choices[0].k)}
 ok(kg>=1&&mom>=1,'중요 경기 '+kg+'회 · 기타 중요 순간 '+mom+'회');ok(S.day>=S.schedule.length,'시즌 끝까지 진행');}
console.log('moment tests ok',n);
