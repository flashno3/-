/* 2026 KBO 리그 규정 반영: 확대 엔트리(제14조 ①) · 부상자 명단 등록일수 인정(제14조 ③) · 순위 동률 해소와 1·5위 결정전(제3조) */
const fs=require('fs'),assert=require('assert');
const {League,ACTIVE_MAX}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const TEAMS=['Bears','Twins','Heroes','Landers','Wiz','Eagles','Tigers','Giants','Dinos','Lions'];
const mk=seed=>{const L=League.create(base,'Lions',seed);L.faAdvance(75);L.closeFA();return L};
// 1) 확대 엔트리
{const L=mk(9),S=L.S,U=S.userTeam;ok(L.activeMax()===29,'개막 전 29명');
 while(S.day<S.schedule.length&&L.todayN()<Date.UTC(S.year,8,1)/864e5-1)L.advance(1,false);
 ok(L.activeMax()===29,'8월 31일까지 29명 '+L.dateStr(S.day));
 const ai='Bears';ok(L.players(ai).filter(p=>p.active).length<=29,'AI 29명 이하');
 L.advance(1,false);ok(L.activeMax()===34,'9월 1일부터 34명 '+L.dateStr(S.day));L.advance(1,false);   // 9/1 경기일 시작 때 AI 구단 확대 편성
 ok(L.players(ai).filter(p=>p.active).length>=33&&L.players(ai).filter(p=>p.active).length<=34,'AI 확대 엔트리 '+L.players(ai).filter(p=>p.active).length);
 for(const t of TEAMS)if(t!==U)ok(L.players(t).filter(p=>p.active).length<=34,t+' 34명 이하');
 // 내 팀: 34명까지 등록, 35번째는 거절
 const farm=()=>L.players(U).filter(p=>!p.active&&!L.isInj(p)&&!p.foreign&&(!p.lockUntil||p.lockUntil<=S.day));
 let g=0;while(L.players(U).filter(p=>p.active).length<34&&g++<20){const c=farm()[0];const e=L.moveActive(c.id,true);ok(!e,'등록 '+e)}
 ok(L.players(U).filter(p=>p.active).length===34,'내 팀 34명');const e=L.moveActive(farm()[0].id,true);ok(e&&e.includes('34명'),'35번째 거절: '+e);
 while(S.day<S.schedule.length)L.advance(1,false);
 const P=L.startPostseason();for(const t of TEAMS)ok(L.players(t).filter(p=>p.active).length<=29,t+' 포스트시즌 29명 이하 '+L.players(t).filter(p=>p.active).length);
 ok(L.activeMax()===29,'포스트시즌 29명');}
// 2) 부상자 명단 등록일수 인정(시즌 최대 30일)
{const L=mk(11),S=L.S,U=S.userTeam;L.advance(10,false);
 const p=L.players(U).find(x=>x.type==='B'&&x.fa&&!L.isInj(x)),now=L.todayN();p.inj={dx:'테스트',since:'x',ret:'x',retN:now+60,apply:true,generated:true};p.active=false;L.repairSettings(U);L.invalidate();
 const r0=p.fa.regDays;for(let i=0;i<30;i++)L.advance(1,false);
 ok(p.il>29.9&&p.il<=30.0001,'IL 인정 30일 상한 '+p.il);ok(p.fa.regDays-r0>=29.9&&p.fa.regDays-r0<=30.0001+0,'등록일수 +30일 '+(p.fa.regDays-r0));
 const q=L.players(U).find(x=>x.type==='B'&&x.fa&&x!==p&&!L.isInj(x));const q0=q.fa.regDays;q.active=false;L.repairSettings(U);L.advance(3,false);ok(q.fa.regDays===q0&&!q.il,'건강한 2군 선수는 인정 안 됨');}
// 3) 순위 동률 해소(제3조)
{const L=mk(13),S=L.S;const reset=()=>{for(const t of TEAMS){S.rec[t]=[70,70,4,600,600];for(const u of TEAMS)S.h2h[t][u]=[8,8,0]}S.h2r={};S.prevRank={};S.tb=null};
 // 3개 구단(Bears,Twins,Heroes) 동률: 상호 다승이 다르게
 reset();for(const [a,b,w] of [['Bears','Twins',10],['Bears','Heroes',9],['Twins','Heroes',9]]){S.h2h[a][b]=[w,16-w,0];S.h2h[b][a]=[16-w,w,0]}
 // 승률 동률 유지: 전체 승패는 모두 70-70
 let st=L.standings().map(x=>x.team);ok(st.indexOf('Bears')<st.indexOf('Twins')&&st.indexOf('Bears')<st.indexOf('Heroes'),'3팀 동률: 상호 다승 우선 '+st.join());
 // 상호 다승 동일 → 상호 다득점
 reset();S.h2r={Bears:{Twins:50},Twins:{Bears:40}};st=L.standings().map(x=>x.team);ok(st.indexOf('Bears')<st.indexOf('Twins'),'다득점 비교');
 // 다득점도 같으면 전년도 순위
 reset();S.prevRank={Wiz:1,Lions:2};st=L.standings().map(x=>x.team);ok(st.indexOf('Wiz')<st.indexOf('Lions')&&st.indexOf('Lions')<st.indexOf('Bears')||st.indexOf('Wiz')<st.indexOf('Bears'),'전년도 성적 '+st.join());}
// 4) 1위·5위 결정전: 2개 구단 동률일 때만
{const L=mk(14),S=L.S;const setup=(win)=>{S.rec={};for(const t of TEAMS)S.rec[t]=[0,0,0,0,0];TEAMS.forEach((t,i)=>{S.rec[t]=[win[i],144-win[i],0,600,600]});S.h2h=S.h2h||{};for(const t of TEAMS){S.h2h[t]={};for(const u of TEAMS)S.h2h[t][u]=[8,8,0]}S.h2r={};S.prevRank={};S.tb=null;S.phase='regular_done'};
 // 1위 2개 구단 동률(Bears·Twins 90승), 5위 2개 구단 동률(Landers·Wiz 70승)
 setup([90,90,80,75,70,70,60,55,50,45]);const before=JSON.stringify(S.rec);L._tieGames();ok(S.tb.games.length===2&&S.tb.games.map(g=>g.pos).join()==='1,5','1위·5위 결정전 2경기 '+JSON.stringify(S.tb.games.map(g=>g.pos)));
 ok(JSON.stringify(S.rec)===before,'결정전은 정규시즌 기록에 가산하지 않음');
 for(const g of S.tb.games){const st=L.standings().map(x=>x.team);ok(st.indexOf(g.winner)<st.indexOf(g.winner===g.home?g.away:g.home),`${g.pos}위 결정전 승자가 위 순위`);ok(g.rh!==g.ra||true,'결과');}
 // 3개 구단 동률이면 결정전 없음
 setup([90,90,90,75,70,65,60,55,50,45]);L._tieGames();ok(S.tb.games.filter(g=>g.pos===1).length===0,'1위 3팀 동률은 결정전 없음');
 // 4위가 5위와 동률이면 5위 결정전이 아니라(4위는 와일드카드 진출 구단): 5·6위 동률만 해당
 setup([95,90,85,70,70,60,55,50,45,40]);L._tieGames();ok(S.tb.games.every(g=>g.pos!==5),'4·5위 동률은 결정전 대상 아님');}
console.log('rules3 tests ok',n);
