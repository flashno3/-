const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Eagles',seed);L.faAdvance(75);L.closeFA();return L};
// 1) 선발 육성: 보직 즉시 전환, 2군 로테이션 우선 편성
{const L=mk(3),S=L.S,t=S.userTeam;const q=L.players(t).filter(p=>p.type==='P'&&!p.active&&p.role!=='SP'&&!L.isInj(p)&&p.age<=28)[0];
 ok(L.setDevPlan(q.id,'SP')===null&&q.role==='SP','선발 육성 지정 시 보직(표기) 즉시 선발');
 L.assignUsage(t,true);ok(q.f&&q.f.GS>0&&q.f.IP>=80,'2군 선발 로테이션에 편성(GS '+(q.f&&q.f.GS)+' IP '+(q.f&&q.f.IP)+')');
 ok(L.setDevPlan(q.id,'MID')===null&&q.role==='RP','구원 육성으로 바꾸면 보직 구원');}
// 2) 컨디션: 내 팀 선수 엔진 입력만 변경, 만료 후 복귀
{const L=mk(4,'Lions'),S=L.S,t=S.userTeam;const b=L.players(t).filter(p=>p.type==='B'&&p.active)[0];const r0=L._modRates(b);ok(r0===b.p,'컨디션 0이면 원본');
 b.mood={v:3,until:S.day+20};const r1=L._modRates(b);ok(r1.k<b.p.k&&r1.babip>b.p.babip&&r1.hr>=b.p.hr,'컨디션 + → 삼진↓·안타↑');
 b.mood={v:-3,until:S.day+20};const r2=L._modRates(b);ok(r2.k>b.p.k&&r2.babip<b.p.babip,'컨디션 − → 삼진↑·안타↓');
 S.day+=21;ok(L.moodOf(b)===0&&L._modRates(b)===b.p,'기한 후 원복');
 const ai=Object.keys(S.teams).filter(x=>x!==t)[0],o=L.players(ai).filter(p=>p.type==='B')[0];o.mood={v:3,until:99};ok(L._modRates(o)===o.p,'AI 팀 선수는 영향 없음');}
// 3) 운영 방침: 이닝·주루·부상 위험
{const L=mk(5,'Lions'),S=L.S,t=S.userTeam;ok(L.setPolicy('pitch','push')&&L.setPolicy('run','high')&&!L.setPolicy('pitch','x'),'방침 설정');
 const d1=L._engData(false).modes.g,sp=L.players(t).filter(p=>p.active&&p.type==='P'&&p.GS>0)[0],pe=d1.pitchers.find(x=>x.id===sp.id);ok(Math.abs(pe.ip_per_start-sp.ipgs*1.1)<1e-9,'혹사: 선발 이닝 +10%');
 const bt=L.players(t).filter(p=>p.active&&p.type==='B')[0],be=d1.batters.find(x=>x.id===bt.id);ok(Math.abs(be.p.sba-bt.p.sba*1.5)<1e-9,'적극 주루: 도루 시도 ×1.5');
 L.setPolicy('pitch','save');const d2=L._engData(false).modes.g,pe2=d2.pitchers.find(x=>x.id===sp.id);ok(Math.abs(pe2.ip_per_start-sp.ipgs*0.9)<1e-9,'아낌: 선발 이닝 −10%');
 let ij={save:0,push:0};for(const pol of ['save','push']){L.setPolicy('pitch',pol);for(let s=0;s<6;s++){const L2=mk(20+s,'Lions');L2.setPolicy('pitch',pol);let c=0;const o=L2.S.userTeam;let g=0;while(L2.S.day<L2.S.schedule.length&&g++<30){L2.advance(6,false)}ij[pol]+=(L2.S.news.filter(x=>/^부상: /.test(x.text)).length)}}
 ok(ij.push>ij.save,'혹사 방침이 부상 소식을 더 많이 만든다 '+JSON.stringify(ij));}
// 4) 이벤트: 슬럼프·연승/연패 처리와 효과
{const L=mk(6,'Lions'),S=L.S,t=S.userTeam,f=S.fin.teams[t];
 const b=L.players(t).filter(p=>p.type==='B'&&p.active)[0];S.day=30;
 const ev=L._evAdd({type:'slump',title:'t',data:{pid:b.id},text:'',choices:[{k:'coach'},{k:'trust'},{k:'farm'}],def:'trust'});const c0=f.evCost||0;L.resolveEvent(ev.id,'coach');ok(Math.abs((f.evCost||0)-c0-0.3)<1e-9&&b.mood&&Math.abs(b.mood.v)>=1,'집중 지도: 비용 0.3억·컨디션 변화');
 const st=L._evAdd({type:'streak',title:'t',data:{kind:'win',n:7},text:'',choices:[{k:'bonus'}],def:'none'});L.resolveEvent(st.id,'bonus');ok(S.teamMood&&S.teamMood.v===1&&L.moodOf(L.players(t)[1])>=1,'연승 격려금: 팀 컨디션 +1');
 const g2=L._evAdd({type:'grievance',title:'t',data:{pid:b.id},text:'',choices:[{k:'ignore'}],def:'ignore'});b.mood=null;L.resolveEvent(g2.id,'ignore');ok(b.mood&&b.mood.v===-2,'불만 방치: 컨디션 −2');
 // 시즌 중 슬럼프·연승 이벤트가 실제로 발생
 let seen=new Set();for(const seed of [1,2,3,4,5,6,7,8]){const L2=mk(seed,'Lions');let g=0;while(L2.S.day<L2.S.schedule.length&&g++<60){L2.advance(5,false);for(const e of L2.eventsOpen())L2.resolveEvent(e.id,e.def||e.choices[0].k)}for(const e of L2.S.events.list)seen.add(e.type)}
 ok(seen.has('slump')||seen.has('streak'),'슬럼프·연승연패 이벤트 발생 '+[...seen]);}
// 5) 노화: 완화된 하락폭
{const L=League.create(base,'Lions',9),S=L.S;const {rngFor}=require(__dirname+'/src/league.js');let sum=0,m=0;
 for(const p of Object.values(S.players)){if(p.foreign||!(p.team in S.teams)||p.age<33||p.age>35)continue;for(let k=0;k<6;k++){const q=JSON.parse(JSON.stringify(p)),o=L.ovr(q);L.progress(q,rngFor(S.seed,3,m++),1);sum+=L.ovr(q)-o}}
 ok(sum/m>-2.6&&sum/m<-1.0,'33~35세 평균 하락 '+(sum/m).toFixed(2)+' (이전 약 −3.0)');}
console.log('levers tests ok',n);
