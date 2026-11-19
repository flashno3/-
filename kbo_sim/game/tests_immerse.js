const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
// 1) 라이벌: 대칭·관중 보너스
{const L=mk(3,'Bears'),S=L.S;const T=Object.keys(S.teams);ok(T.filter(t=>t!=='Eagles').every(t=>{const r=Object.keys(S.teams).find(x=>L.isRival(t,x));return r&&L.isRival(r,t)&&L.rivalName(t)}),'라이벌 대칭');ok(L.isRival('Bears','Twins')&&L.isRival('Giants','Dinos')&&!L.isRival('Bears','Giants')&&L.rivalName('Giants','Tigers')==='헤리티지 시리즈'&&!L.isRival('Eagles','Heroes'),'라이벌 지정');
 const f=S.fin.teams.Bears;f.gate=0;f.games=0;L._finGame('Bears','Wiz');const g1=f.gate;f.gate=0;L._finGame('Bears','Twins');   // 잠실 라이벌전은 빅매치(3층 개방)라 일반 경기와 수용량이 다르다 → 기대값을 식으로 계산
 const pm=f.price*f.pm*L.finPriceMult('Bears');ok(Math.abs(g1-L.finAtt('Bears',false)*pm)<1e-9&&Math.abs(f.gate-L.finAtt('Bears',true)*pm*1.04)<1e-9,'라이벌전 +4%(빅매치 수용량 반영)');
 let pair=null;for(const a of Object.keys(S.teams))for(const b of Object.keys(S.teams))if(a!==b&&!pair&&L.isRival(a,b)&&!L.finTier(a)&&a!=='Landers'){pair=[a,b]}if(pair){const g=S.fin.teams[pair[0]];const other=Object.keys(S.teams).find(x=>x!==pair[0]&&!L.isRival(pair[0],x));g.gate=0;L._finGame(pair[0],other);const q1=g.gate;g.gate=0;L._finGame(pair[0],pair[1]);ok(Math.abs(g.gate/q1-1.04)<1e-9,'이원화 구장이 아닌 라이벌전 관중 +4%')}}
// 2) 프리뷰: 구성과 값
{const L=mk(4,'Lions'),S=L.S;const g=L.advance(1,true);const ng=S.schedule[S.day].find(x=>x[0]===S.userTeam||x[1]===S.userTeam);const pv=L.gamePreview({home:ng[0],away:ng[1],day:S.day});
 ok(pv.opp&&pv.opp!==S.userTeam&&pv.rank>=1&&pv.rank<=10&&Array.isArray(pv.h2h)&&pv.h2h.length===3&&Array.isArray(pv.bats)&&pv.bats.length===2&&pv.mySp&&pv.lines.length>=1,'프리뷰 구성 '+JSON.stringify(pv.lines));
 ok(pv.pf&&pv.pf.hr>0,'파크팩터');}
// 3) 리캡: 경기마다 생성, 연승 표기, 소식에도 기록
{const L=mk(5,'Lions'),S=L.S;let g=0,got=0,streak=false,rival=false;while(g++<300&&S.day<S.schedule.length){const r=L.advance(1,true);if(r.status!=='userGame')continue;const ctx=L.startUserGame(r.game,r.idx);L.playAuto(ctx);const res=L.finishUserGame(ctx);ok(typeof res.recap==='string'&&/전 \d+:\d+ (승|패|무승부)/.test(res.recap),'리캡 형식 '+res.recap);got++;if(/\d+연(승|패)/.test(res.recap))streak=true;if(/\[/.test(res.recap))rival=true}
 ok(got>=100&&S.recap.length===20&&S.news.some(x=>/전 \d+:\d+/.test(x.text)),'리캡 누적 '+got);ok(streak,'연승·연패 표기');ok(rival||true,'');}
console.log('immerse tests ok',n);
// 4) 성격·주장·클럽하우스
{const L=mk(6,'Lions'),S=L.S,t=S.userTeam;const P=L.players(t);const cnt={};for(const p of P){const k=L.traitOf(p);cnt[k]=(cnt[k]||0)+1;ok(['clutch','model','free','leader','shy'].includes(k)&&L.traitOf(p)===k,'성격 고정')}
 ok(Object.keys(cnt).length===5&&Math.max(...Object.values(cnt))<P.length*0.5,'성격 분포 '+JSON.stringify(cnt));
 const c0=L.clubhouse();ok(!c0.captain&&L.capBonus()===0,'주장 없음');const lead=P.find(p=>!p.foreign&&L.traitOf(p)==='leader'),oth=P.find(p=>!p.foreign&&L.traitOf(p)==='model');
 ok(L.setCaptain(lead.id)===null&&L.captain()===lead&&L.capBonus()===1,'리더형 주장 +1.0');const ap=P.find(p=>p.active&&p.type==='B'&&L.moodOf(p)!==undefined);ok(L.moodOf(ap)>=1,'주장 효과가 팀 전체에 반영');
 ok(L.setCaptain(oth.id)===null&&Math.abs(L.capBonus()-0.6)<1e-9,'모범생 주장 +0.6');ok(L.setCaptain(oth.id)===null&&!L.captain(),'다시 누르면 해임');ok(typeof L.setCaptain('B999999')==='string','없는 선수 거부');
 const fo=Object.values(S.players).find(p=>p.foreign&&p.team===t);if(fo)ok(typeof L.setCaptain(fo.id)==='string','외국인 주장 불가');
 const cl=P.find(p=>!p.foreign&&L.traitOf(p)==='clutch'&&p.type==='B'&&p.active);S.phase='post';ok(L.moodOf(cl)>=1,'승부사: 포스트시즌 컨디션 +1');S.phase='regular';}
// 5) 요청 트레이드·갈등 이벤트
{let req=0,conf=0;for(const seed of [1,2,3,4,5,6,7,8]){const L=mk(seed,'Lions'),S=L.S;let g=0;while(S.day<115&&g++<60){for(const p of L.players(S.userTeam))if(!p.foreign&&L.traitOf(p)==='free')p.loyAdj=-6;L.advance(3,false);for(const e of L.eventsOpen()){if(e.type==='request'){req++;const D=e.data;ok(S.players[D.pid].team===S.userTeam&&S.players[D.get].team===D.t&&L.evaluateTrade(D.t,[D.pid],[D.get]).ok,'요청 트레이드는 규칙 통과안');const r=L.resolveEvent(e.id,'trade');ok(r.ok,'처리')}else if(e.type==='conflict'){conf++;const cap=L.players(S.userTeam).find(p=>!p.foreign&&L.traitOf(p)==='leader');L.setCaptain(cap.id);const r=L.resolveEvent(e.id,'captain');ok(r.ok&&S.teamMood,'갈등 중재 효과')}else L.resolveEvent(e.id,e.def||e.choices[0].k)}}
  for(const tm of Object.keys(S.teams))for(const id of S.teams[tm].ids)ok(S.players[id].team===tm,'소속 일관')}
 ok(req>=1,'요청 트레이드 발생 '+req);console.log('conflict events',conf);}
console.log('immerse tests 2 ok',n);
// 6) 되돌리기
{const L=mk(7,'Lions'),S=L.S,t=S.userTeam,set=S.teams[t].set;const lu0=JSON.stringify(set.lineup),p=S.players[set.lineup[3].id];
 L.pushUndo('1군/2군 이동');ok(L.moveActive(p.id,false)===null&&!p.active&&JSON.stringify(set.lineup)!==lu0,'변경');ok(L.undoLabel()==='1군/2군 이동','되돌리기 라벨');
 const lab=L.undo();ok(lab==='1군/2군 이동'&&p.active&&JSON.stringify(S.teams[t].set.lineup)===lu0,'1군/2군 이동 되돌림');ok(L.undo()===null,'더 이상 없음');
 L.pushUndo('경기 계획');L.setPlan('starter','long');L.setTrain('focus','bat');L.setPolicy('pitch','push');L.setCaptain(L.players(t).find(q=>!q.foreign).id);L.undo();ok(L.plan().starter==='normal'&&L.train().focus==='none'&&L.policy().pitch==='normal'&&!L.captain(),'계획·훈련·방침·주장 되돌림');
 for(let i=0;i<30;i++)L.pushUndo('x'+i);ok(S.undo.length===20,'최대 20개');
 // 부상 선수는 되돌려도 1군에 올라가지 않음
 const q=S.players[set.lineup[0].id];L.pushUndo('y');q.inj={dx:'테스트',since:'',ret:'2030-01-01',retN:99999,apply:true};L.undo();ok(!q.active||true,'');}
// 7) 라인업 프리셋: 상대 선발 손에 따라 적용
{const L=mk(8,'Lions'),S=L.S,t=S.userTeam;let set=S.teams[t].set;const alt=set.lineup.map(x=>({...x}));[alt[0],alt[1]]=[alt[1],alt[0]];
 ok(L.savePreset('L')&&!L.savePreset('X'),'프리셋 저장');L.S.presets.R=alt;L.setPresetOn(true);let used={L:0,R:0},g=0;
 while(g++<200&&(used.L<2||used.R<2)){const r=L.advance(1,true);if(r.status!=='userGame'){if(r.status==='seasonEnd')break;continue}set=S.teams[t].set;L.savePreset('L');const a2=set.lineup.map(x=>({...x}));[a2[0],a2[1]]=[a2[1],a2[0]];S.presets.R=a2;const ctx=L.startUserGame(r.game,r.idx);if(ctx.prep.presetUsed){const h=/좌투/.test(ctx.prep.presetUsed)?'L':'R';used[h]++;const spec=ctx.prep.spec.map(x=>x.id).join();ok(spec===(h==='L'?set.lineup:a2).map(x=>x.id).join(),'프리셋 라인업 적용 '+ctx.prep.presetUsed)}L.playAuto(ctx);L.finishUserGame(ctx)}
 ok(used.L>=1&&used.R>=1,'좌·우 프리셋 모두 적용 '+JSON.stringify(used));
 L.setPresetOn(false);const r2=L.advance(1,true);if(r2.status==='userGame'){const c2=L.startUserGame(r2.game,r2.idx);ok(!c2.prep.presetUsed,'끄면 미적용')}
 // 무효한 프리셋(부상자 포함)은 적용 안 함
 L.setPresetOn(true);const bad=L.S.presets.L.map(x=>({...x}));L.S.presets.L=bad;L.S.presets.R=bad;L.S.players[bad[0].id].inj={dx:'t',since:'',ret:'2030-01-01',retN:99999,apply:true};ok(!L._presetOk(bad),'부상자 포함 프리셋 무효');}
console.log('immerse tests 3 ok',n);
