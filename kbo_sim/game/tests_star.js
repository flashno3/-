/* 프랜차이즈 스타: 충성도 70+ 자기 구단 출신 스타가 FA로 나오면 내 팀은 이사회 설득 확률↑·신뢰도 하락↓, AI 구단은 예산이 모자라도 특별 승인으로 우선 입찰·계약 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=()=>{const L=League.create(base,'Lions',5);L.faAdvance(3);for(const t of Object.keys(L.S.teams)){const ids=L.S.teams[t].ids.slice().sort((a,b)=>L.marketValue(L.S.players[a])-L.marketValue(L.S.players[b]));let k=0;while(L.S.teams[t].ids.length>90&&t!==L.S.userTeam&&k<ids.length){const q=L.S.players[ids[k++]];if(!q.foreign&&!q.active)L._retireOrRelease(t,q.id)}}return L};
const setRoom=(L,t,target)=>{const f=L.S.fin.teams[t];for(let i=0;i<12;i++)f.lastRev-=(L.faRoom(t)-target)};
const toFA=(L,t,id,tn)=>{const S=L.S,p=S.players[id];p.tnTeam=t;p.tn=tn;p.dh=Object.assign({},p.dh,{dt:t});L.release(t,id,true);p.faInfo=Object.assign({},p.faInfo,{from:t,grade:p.faInfo&&p.faInfo.grade||'A'});return p};
const best=(L,t)=>L.players(t).filter(p=>!p.foreign&&p.type==='B').sort((a,b)=>L.war(b)-L.war(a))[0];
// 1) 판정: 충성도·가치·출신 구단
{const L=mk(),S=L.S,t=S.userTeam,id=best(L,t).id;const p=toFA(L,t,id,8);const l=L.loyalty(p,t);ok(l&&l.v>=70,'충성도 '+(l&&l.v));ok(L.war(p)>=1,'WAR '+L.war(p));ok(!!L.faStar(p,t),'프랜차이즈 스타');ok(!L.faStar(p,'Tigers'),'다른 구단은 아님');
 p.tn=0;ok(!L.faStar(p,t),'충성도가 낮으면 아님');p.tn=8;}
// 2) 내 팀: 이사회 설득 확률↑, 신뢰도 하락↓
{const L=mk(),S=L.S,t=S.userTeam,f=S.fin.teams[t];const p=toFA(L,t,best(L,t).id,8);const o=L.faDefaultOffer(p,t);f.boardExtra=-1e4*0+(f.boardExtra||0);
 const room0=L.faRoom(t);setRoom(L,t,-30);   // 여유자금을 바닥내 설득이 필요하게
 const a=L.boardOdds(p.id,o);ok(a.ok&&a.need>0&&a.star,'설득 필요·스타 표시 '+JSON.stringify({need:a.need,star:!!a.star}));
 p.tn=0;const b=L.boardOdds(p.id,L.faDefaultOffer(p,t));ok(!b.star&&a.prob>b.prob,`스타 확률 ${a.prob} > 일반 ${b.prob}`);ok(a.max===4&&b.max===3,'시도 횟수');p.tn=8;
 let tries=0,done=null;const t0=f.trust;for(let i=0;i<4&&!done;i++){f.pers=null;const r=L.persuadeBoard(p.id,o);if(r.ok&&r.success)done=r;tries++}
 if(done){ok(done.drop<=Math.max(1,(2+a.need*0.4)*0.5)+1e-9,'스타 신뢰도 하락 절반 '+done.drop)}}
// 3) AI 구단: 여유자금이 모자라도 특별 승인으로 우선 입찰·계약(부족분 45% 이내)
{const L=mk(),S=L.S,A='Tigers';const p=toFA(L,A,best(L,A).id,8);const f=S.fin.teams[A];f.lastRev+=400;
 const deal0=L._aiDeal(A,p);ok(deal0,'기본 상태에서 입찰 가능');const o0=L.faDefaultOffer(p,A,L.faTerms(p,A).pref),cost=o0.salary+o0.bonus/o0.years+L.faCompCost(p,A);setRoom(L,A,cost*0.8);   // 여유 = 비용의 80% → 부족분 20%
 const d1=L._aiDeal(A,p);ok(d1&&d1.special>0,'특별 승인 입찰 '+JSON.stringify(d1&&d1.special));
 p.tn=0;ok(!L._aiDeal(A,p),'스타가 아니면 예산 부족으로 입찰 불가');p.tn=8;
 let signed=false,flag=false;for(let d=0;d<40&&!signed;d++){setRoom(L,A,cost*0.8);L._postBids(d);const bs=S.faMkt.bids[p.id]||[];if(bs.some(b=>b.team===A))flag=true;if(S.faMkt.bids[p.id])S.faMkt.bids[p.id]=bs.filter(b=>b.team===A);L._resolveBids(d,false);if(p.team!=='FA')signed=true}
 ok(flag,'우선 입찰 발생');if(!signed){L._resolveBids(45,true)}
 ok(p.team===A,'원소속팀이 계약('+p.team+')');if(p.team===A)ok((f.boardExtra||0)>0,'이사회 추가 예산 '+f.boardExtra);
 ok(/프랜차이즈 스타.*초과 승인/.test(JSON.stringify((S.news||[]).slice(0,30))+JSON.stringify(S.faFeed||[])),'초과 승인 소식')}
// 4) 일반 선수·부족분이 너무 큰 경우는 그대로 불가
{const L=mk(),S=L.S,A='Tigers';const p=toFA(L,A,best(L,A).id,8);const f=S.fin.teams[A];f.lastRev+=400;const o0=L.faDefaultOffer(p,A,L.faTerms(p,A).pref),c=o0.salary+o0.bonus/o0.years+L.faCompCost(p,A);setRoom(L,A,c*0.3);ok(!L._aiDeal(A,p),'부족분 70%는 특별 승인으로도 불가')}
console.log('star tests ok',n);
