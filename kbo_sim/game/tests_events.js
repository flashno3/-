const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Eagles',seed);L.faAdvance(75);L.closeFA();return L};
// 1) 방출 위약금: 잔여 계약이 재정에 남고 신뢰도 하락
{const L=mk(3),S=L.S,t=S.userTeam,f=S.fin.teams[t];const p=L.players(t).filter(x=>x.contract.years>=2&&x.contract.salary>=5&&!x.foreign)[0];
 const pay0=L.finPay(t),tr0=f.trust,c=L.releaseCost(p.id),sal0=p.contract.salary,am0=p.contract.amort||0;ok(c.total>=p.contract.salary&&c.rec.length===p.contract.years,'위약금 = 잔여 계약 '+JSON.stringify(c));
 const r=L.releasePlayer(p.id);ok(r.ok&&p.team==='FA','방출 처리');ok(L.deadNow(t)>=c.thisYear-0.2,'이번 시즌 위약금이 보수에 반영 '+L.deadNow(t));ok(L.finPay(t)>=pay0-sal0-am0+c.thisYear-0.3&&L.finPay(t)>pay0-sal0-am0+0.1,'방출해도 보수 부담이 남음');ok(f.trust<tr0,'고액 방출은 이사회 신뢰도 하락 '+tr0+'→'+f.trust);
 const lo=L.players(t).filter(x=>x.contract.years===1&&x.contract.salary<=0.5&&!x.foreign&&(x.tn||0)<5)[0];const c2=L.releaseCost(lo.id);ok(c2.total<=0.5&&c2.trust===0,'저연봉 1년 계약 방출은 부담 미미');}
// 2) FA 요구액: 미계약 기간이 길수록 가속 하락
{const L=League.create(base,'Lions',5),m=L.S.faMkt,p=L.faList().find(x=>x.faInfo&&x.faInfo.grade),r0=L.faTerms(p,'Twins').req(3);const at=d=>{m.day=d;return L.faTerms(p,'Twins').req(3)/r0};
 const a=[at(30),at(60),at(75)];ok(a[0]<0.95&&a[0]>0.88&&a[1]<0.82&&a[2]<0.78&&a[2]>0.64&&a[0]>a[1]&&a[1]>a[2],'요구액 하락 곡선 '+a.map(x=>x.toFixed(3)));}
// 3) 이사회 설득: 예산 초과 영입, 성공 시 예산 확대·신뢰도 하락, 실패 시 신뢰도 하락, 횟수·간격 제한
{let succ=0,fail=0,seen=false;
 for(const seed of [2,3,4,5,6,7,8,9]){const L=League.create(base,'Lions',seed),S=L.S,t=S.userTeam,f=S.fin.teams[t];const p=L.faList().filter(x=>x.faInfo&&x.faInfo.grade&&x.faInfo.from!==t).sort((a,b)=>L.faMV(b)-L.faMV(a))[0];const off=L.faDefaultOffer(p,t);
  const sg=L.signFA(p.id,off);if(typeof sg==='string'&&sg.startsWith('예산 부족')){seen=true;const o=L.boardOdds(p.id,off);ok(o.need>0&&o.prob>=0.05&&o.prob<=0.9,'설득 확률 '+JSON.stringify(o));
   const tr=f.trust,room0=L.finBudget(t);const r=L.persuadeBoard(p.id,off);ok(r.ok,'설득 처리 '+r.msg);
   if(r.success){succ++;ok(p.team===t&&f.trust<tr&&L.finBudget(t)>room0,'성공: 영입·신뢰도 하락·예산 확대');}else{fail++;ok(p.team==='FA'&&f.trust<tr,'실패: 신뢰도 하락');const r2=L.persuadeBoard(p.id,off);ok(!r2.ok&&/뒤에/.test(r2.msg),'7일 간격 제한')}}}
 ok(seen&&succ>0&&fail>0,'설득 성공/실패 모두 발생 '+succ+'/'+fail);}
// 4) 시즌 중 이벤트: 생성·정지·처리·효과
{const L=mk(11,'Lions'),S=L.S,t=S.userTeam,f=S.fin.teams[t];let ev=null,stops=0,g=0;
 while(S.day<S.schedule.length&&g++<200){const r=L.advance(10,false,true);if(r.status==='event'){stops++;}if(S.day>=S.schedule.length)break;
  for(const e of L.eventsOpen()){ev=ev||e;const k=e.type==='grievance'?'talk':e.type==='board'?(e.choices[0].k):e.choices[0].k;const res=L.resolveEvent(e.id,k);ok(res.ok||res.msg,'이벤트 처리 '+e.type)}}
 const types=new Set(S.events.list.map(e=>e.type));ok(stops>0&&S.events.list.length>=3,'시즌 중 이벤트 발생 '+S.events.list.length+' '+[...types]);ok(types.has('board'),'이사회 중간 점검 발생');
 ok(S.events.list.every(e=>e.status==='done'),'모든 이벤트 종결');ok((f.snap||[]).length>=5,'월별 재정 스냅샷 '+(f.snap||[]).length);
 ok(f.snap.every(x=>x.rank>=1&&x.rank<=10&&isFinite(x.op)),'스냅샷 값');}
// 5) 이벤트 효과: 스폰서·팬 이벤트·불만
{const L=mk(12,'Lions'),S=L.S,t=S.userTeam,f=S.fin.teams[t];S.day=40;
 const sp=L._evAdd({type:'sponsor',title:'t',data:{amt:5},text:'',choices:[{k:'accept'},{k:'decline'}],def:'decline'});const a0=L.finAtt(t),op0=L.finPreview(t).op;L.resolveEvent(sp.id,'accept');ok(f.evRev===5&&L.finAtt(t)<a0&&Math.abs(L.finPreview(t).rev-L.finPreview(t).gate-f.parAds-L.finPreview(t).other-L.finBC()-5)<0.01,'스폰서 수락: 매출 +5, 관중 −1.5%');
 const pr=L._evAdd({type:'promo',title:'t',data:{cost:2},text:'',choices:[{k:'go'},{k:'skip'}],def:'skip'});const a1=L.finAtt(t);L.resolveEvent(pr.id,'go');ok(L.finAtt(t)>a1&&f.evCost===2,'팬 이벤트: 비용·관중 증가');S.day=70;ok(L.finAtt(t)<=a1*1.001,'효과 20일 후 종료');
 const q=L.players(t).filter(p=>!p.active&&!L.isInj(p)&&!p.foreign)[0];const gv=L._evAdd({type:'grievance',title:'t',data:{pid:q.id},text:'',choices:[{k:'ignore'}],def:'ignore'});const l0=L.loyalty(q,t).v;L.resolveEvent(gv.id,'ignore');ok(L.loyalty(q,t).v<l0,'불만 방치: 충성도 하락');}
console.log('events tests ok',n);
