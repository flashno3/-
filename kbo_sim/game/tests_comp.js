const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
// 1) 내가 영입: 보호선수 지정 반영, 보상금 정산, 로스터 일관성
{const L=League.create(base,'Lions',2),S=L.S,t=S.userTeam;S.fin.teams[t].lastRev+=120;
 const star=L.faList().filter(p=>p.faInfo&&p.faInfo.grade==='A'&&p.faInfo.from!==t).sort((a,b)=>L.faMV(b)-L.faMV(a))[0],g='A';
 const auto=L.compProtected(t,g);ok(auto.length===20&&new Set(auto).size===20,'자동 보호선수 20명');
 const el=L._compEligible(t,star),topVal=el.slice().sort((a,b)=>L.marketValue(b)-L.marketValue(a));
 // 최고 가치 선수 대신 낮은 선수를 지정해도 가치 상위 20명으로 정렬·보충
 L.setProtect(topVal.slice(0,25).map(x=>x.id));ok(L.compProtected(t,g).length===20&&L.compProtected(t,'B').length===25,'A 20명·B 25명');
 const free=topVal[24]; // 보호 25번째 선수: A등급에서는 비보호
 L.setProtect(topVal.slice(0,25).map(x=>x.id));const aProt=new Set(L.compProtected(t,'A'));ok(!aProt.has(free.id)&&aProt.has(topVal[0].id),'A등급은 지정 25명 중 상위 20명만 보호');
 const f=S.fin.teams[t],old=star.faInfo.from,fo=S.fin.teams[old],dead0=L.deadNow(t),rev0=fo.evRev||0,prev=star.faInfo.prev,r=L.signFA(star.id,L.faDefaultOffer(star,t));ok(r===null,'영입 '+r);
 const lg=S.compLog.filter(c=>c.id===star.id)[0];ok(lg&&lg.from===old&&lg.to===t,'보상 기록');
 ok(Math.abs((L.deadNow(t)-dead0)-(prev*(lg.pid?2:3)))<0.2,'영입 구단 보수에 보상금 계상 '+(L.deadNow(t)-dead0).toFixed(1)+' vs '+prev*(lg.pid?2:3));ok(Math.abs((fo.evRev||0)-rev0-(prev*(lg.pid?2:3)))<0.2,'원소속 구단 수입에 보상금 계상');
 if(lg.pid){const pl=S.players[lg.pid];ok(pl.team===old&&!aProt.has(pl.id)&&S.teams[old].ids.includes(pl.id)&&!S.teams[t].ids.includes(pl.id),'보상선수는 비보호 선수 → 원소속 이동');}
 for(const tm of Object.keys(S.teams))for(const id of S.teams[tm].ids)ok(S.players[id].team===tm,'소속 일관 '+id);}
// 2) 내 선수가 떠남: 결정 카드(선수 또는 보상금), 선택 즉시 반영
{let seen=0;for(const seed of [1,2,3,4,5,6]){const L=League.create(base,'Lions',seed),S=L.S;L.faAdvance(75);L.closeFA();
  const ev=L.eventsOpen().filter(e=>e.type==='comp');for(const e of ev){seen++;ok(e.choices.length>=2&&e.choices[e.choices.length-1].k==='money','선택지 후보+보상금');
   const D=e.data,fa=S.players[D.fa],signer=S.teams[D.signer];const pick=e.choices[0].k.startsWith('p:')?e.choices[0].k:'money';const before=S.compLog.filter(c=>c.pending&&c.id===D.fa).length;ok(before===1,'대기 기록');
   const r=L.resolveEvent(e.id,pick);ok(r.ok,'처리');ok(!S.compLog.some(c=>c.pending&&c.id===D.fa),'대기 기록 정리');
   if(pick!=='money'){const pl=S.players[pick.slice(2)];ok(pl.team===S.userTeam&&!signer.ids.includes(pl.id),'보상선수 수령 '+pl.ko);}
   for(const tm of Object.keys(S.teams))for(const id of S.teams[tm].ids)ok(S.players[id].team===tm,'소속 일관')}}
 ok(seen>=1,'내 FA 이탈 보상 결정 발생 '+seen);}
// 3) AI 간 보상: 일관성·최소 인원·중복 없음
{for(const seed of [3,4,5]){const L=League.create(base,'Lions',seed),S=L.S;L.faAdvance(75);L.closeFA();const seen=new Set();
  for(const tm of Object.keys(S.teams)){ok(S.teams[tm].ids.length>=44,tm+' 최소 인원');for(const id of S.teams[tm].ids){ok(!seen.has(id)&&S.players[id].team===tm,'중복·소속 '+id);seen.add(id)}}
  ok((S.compLog||[]).length>0,'보상 기록 존재')}}
console.log('comp tests ok',n);
// 4) AI 원소속 구단의 보상 선택: 실제 2020~2026 사례(A·B 25건 전부 보상선수)에 맞춰 후보가 있으면 항상 선수 지명, 보상금은 전년 연봉 200%/100%
{let a=[0,0],b=[0,0],badMoney=0;for(const seed of [1,2,3,4,5,6]){const L=League.create(base,'Lions',seed);L.faAdvance(75);L.closeFA();for(const c of (L.S.compLog||[])){const t=c.grade==='A'?a:c.grade==='B'?b:null;if(!t||c.pending)continue;t[1]++;if(/보상선수/.test(c.text))t[0]++;const m=/보상금 ([\d.]+)억/.exec(c.text);const p=L.S.players[c.id];}}
 const ra=a[0]/Math.max(1,a[1]),rb=b[0]/Math.max(1,b[1]);if(!(ra>=0.95&&rb>=0.95))throw new assert.AssertionError({message:'보상선수 선택 비율 A '+a+' B '+b});n++;
 // 실제 사례 데이터 일관성: 보상금 = 전년 연봉 × (A 200% / B 100%)
 const rows=fs.readFileSync(__dirname+'/data/fa_compensation_2020_2026.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));ok(rows.length===25&&rows.every(r=>Math.abs(+r[7]-(+r[8])*(+r[9]))<0.01),'실제 보상 사례 25건: 보상금 = 전년 연봉 × 배수');ok(rows.filter(r=>r[4]==='A'||r[4]==='B'||r[4]==='구제도').length===25,'등급 표기');}
console.log('comp tests 2 ok',n);
