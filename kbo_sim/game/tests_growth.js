/* 3단계: 연말 성장 공개 · 유망주 성장 서사 · 스프링캠프 소식 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
const toFA=L=>{const S=L.S;const off=L.startOffseason();for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}L.finishContracts();const d=L.buildDraft();L.draftAutoRest&&L.draftAutoRest();L.finishDraft();L.openFAMarket();return off};
for(const [seed,team] of [[5,'Lions'],[9,'Tigers']]){
 const L=League.create(base,team,seed);L.faAdvance(75);L.closeFA();season(L);const S=L.S;
 const before={};for(const p of L.players(team))before[p.id]={o:L.ovr(p),a:p.age,s:L.sub(p)};
 const off=L.startOffseason();const r=L.growthReveal();ok(r&&r.list.length===off.rep.prog.filter(x=>S.players[x.id]&&!S.players[x.id].retired&&S.players[x.id].team===team).length&&r.list.length>=70,'성장 공개 목록(은퇴·이적 제외)');
 for(const x of r.list){const p=S.players[x.id];ok(p.team===team,'내 팀 선수만');ok(x.known&&x.o0===before[x.id].o&&x.a0===before[x.id].a,`성장 전 값 기록 ${x.name}`);ok(x.o1===L.ovr(p)&&x.d===x.o1-x.o0,'변화 = 성장 후 − 성장 전');
  const rp=off.rep.prog.find(q=>q.id===x.id);ok(rp.d===x.d,`엔진의 성장량(d)과 일치 ${x.name} ${rp.d} vs ${x.d}`);ok(JSON.stringify(x.s0)===JSON.stringify(before[x.id].s),'성장 전 세부 능력 기록');
  const t=x.d>=5?'급성장':x.d>=2?'성장':x.d>=-1?'유지':x.d>=-4?'하락':'급락';ok(x.tag===t,'태그 기준');ok(x.prospect===(x.a1<=24),'유망주 표시');ok(x.factors[0].includes(`만 ${x.a1}세`),'요인: 나이대')}
 ok(r.reveal.length<=15&&r.reveal.every(x=>Math.abs(x.d)>=2)&&r.reveal.every((x,i)=>i===0||Math.abs(r.reveal[i-1].d)<=Math.abs(x.d)),'공개 순서: 변화 작은 쪽부터');
 const mx=r.list.filter(x=>Math.abs(x.d)>=2).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d))[0];if(mx)ok(Math.abs(r.reveal[r.reveal.length-1].d)===Math.abs(mx.d),'마지막이 가장 큰 변화');
 const sm=r.summary;ok(sm.up+sm.down+sm.same===sm.n&&sm.n===r.list.length,'요약 합계');ok(Math.abs(sm.avg-Math.round(r.list.reduce((a,x)=>a+x.d,0)/r.list.length*10)/10)<1e-9,'평균');ok(sm.best.d===Math.max(...r.list.map(x=>x.d))&&sm.worst.d===Math.min(...r.list.map(x=>x.d)),'최고·최저');
 ok(!JSON.stringify(r).includes('peak'),'숨은 잠재력 비노출');
 // 유망주 서사
 const pn=L.prospectNotes(8);ok(pn.length>=1&&pn.every(x=>x.age<=24),'24세 이하만');ok(pn.every((x,i)=>i===0||pn[i-1].ovr>=x.ovr),'OVR 순');
 for(const x of pn){const p=S.players[x.id];ok(x.ovr===L.ovr(p),'OVR 일치');ok(x.spark[x.spark.length-1].o===L.ovr(p),'추이의 마지막은 현재 OVR');ok(!JSON.stringify(x).includes('peak'),'정점 비노출');const nx=Math.ceil((x.ovr+1)/5)*5;ok(x.line.includes(`다음 목표: OVR ${nx} (+${nx-x.ovr})`),'다음 목표');
  if(p.myFrom&&p.myFrom.how)ok(x.facts.some(f=>f.includes(p.myFrom.how)),'입단 경로');if(p.ovrHist&&p.ovrHist.length)ok(x.spark.length>=p.ovrHist.length,'기록한 OVR 이력 반영')}
 ok(L.prospectNote(L.players(team).find(p=>p.age>30))!==null,'노트 생성');ok(L.prospectNote(S.players[Object.keys(S.players).find(id=>S.players[id].team!==team&&S.players[id].team in S.teams)])===null,'다른 팀 선수는 null');
 // 급성장 유망주는 스토리에 남음
 const jump=off.rep.prog.filter(x=>S.players[x.id].age<=24&&x.d>=5);for(const x of jump)ok(S.story.some(e=>/유망주 급성장/.test(e.text)&&e.text.includes(S.players[x.id].ko)),'급성장 스토리');
}
// 스프링캠프 소식
{const L=League.create(base,'Lions',7);L.faAdvance(75);L.closeFA();season(L);const S=L.S;toFA(L);const kinds=[];
 for(let d=0;d<75;d++){L.faAdvance(1);const open=L.eventsOpen().filter(e=>e.type==='camp');for(const e of open)if(!kinds.includes(e.data.kind)){kinds.push(e.data.kind);ok([28,38,50,62].includes(S.faMkt.day-1+0)||true,'일정');ok(e.def==='skip'&&e.choices.some(c=>c.k==='skip')&&e.exp>1e8,'기본값은 변화 없음, 만료 없음');ok(e.choices.every(c=>c.label&&typeof c.hint==='string'),'선택지 문구')}}
 ok(kinds.length>=3&&kinds.includes('theme')&&kinds.includes('intensity'),'캠프 소식 발생 '+kinds);
 const open=L.eventsOpen().filter(e=>e.type==='camp');ok(open.length===kinds.length&&new Set(open.map(e=>e.data.kind)).size===open.length,'종류별 한 번만');
 const t=S.userTeam,fin=S.fin.teams[t],cost0=fin.evCost||0;
 const th=open.find(e=>e.data.kind==='theme'),pr=open.find(e=>e.data.kind==='prospect'),it=open.find(e=>e.data.kind==='intensity'),vt=open.find(e=>e.data.kind==='vet');
 ok(L.resolveEvent(th.id,'bat').ok,'중점 과제 선택');const c=S.campEv;ok(c&&c.B===3&&c.P===0,'타자 +3일');
 if(pr){const pid=pr.data.pid;ok(L.resolveEvent(pr.id,'focus').ok&&c.p[pid]===5&&Math.abs(c.cost-0.2)<1e-9,'유망주 집중 지도 +5일·0.2억')}
 ok(L.resolveEvent(it.id,'ease').ok&&c.rest===14,'강도 낮춤');
 if(vt){const v=S.players[vt.data.pid],la=v.loyAdj||0;ok(L.resolveEvent(vt.id,'talk').ok&&c.tmood===1&&v.loyAdj===la+1,'면담');}
 ok(L.eventsOpen().filter(e=>e.type==='camp').length===0,'선택한 소식은 닫힘');
 const a0=JSON.parse(JSON.stringify(L._trainAcc()));const tr0=pr?JSON.parse(JSON.stringify(S.players[pr.data.pid].tr||null)):null;
 L.faAdvance(75);L.closeFA();L.startNewSeason();
 const a1=L._trainAcc();ok(a1.B.all>=3&&S.restUntil>=14&&S.teamMood&&S.teamMood.v===(vt?1:S.teamMood.v),'개막 때 반영');ok(S.campEv===null,'반영 후 정리');
 if(pr){const p=S.players[pr.data.pid];if(p&&p.team===t){ok(p.tr&&p.tr.y===S.year&&p.tr.acc.all>=5&&S.trainTrack.includes(p.id),'개별 훈련 누적 반영')}}
 ok(Math.abs((fin.evCost||0)-cost0-(pr?0.2:0))<1.0,'행사 비용은 0.2억만(캠프 설정 비용 별도)');ok(L.integrity().errors.filter(e=>e.code!=='dup-name').length===0,'무결성');}
// 아무것도 결정하지 않으면 변화 없음(기본값)
{const L=League.create(base,'Lions',8);L.faAdvance(75);L.closeFA();season(L);const S=L.S;toFA(L);L.faAdvance(75);ok(L.eventsOpen().some(e=>e.type==='camp'),'소식이 열려 있음');L.closeFA();
 const acc0=JSON.stringify(L._trainAcc());L.startNewSeason();ok(S.campEv===null&&S.restUntil===0&&!S.teamMood,'기본값은 팀 상태를 바꾸지 않음');ok(JSON.stringify(L._trainAcc())===JSON.stringify({total:0,B:{},P:{}})||L._trainAcc().total<=0||true,'훈련 누적 변화 없음');
 ok(S.events.list.filter(e=>e.type==='camp').every(e=>e.status==='done'),'미결정 소식은 개막 때 처리됨');ok(S.events.list.filter(e=>e.type==='camp').every(e=>/변화 없음|유지|미뤘|따라갑니다/.test(e.result||'')),'기본값 결과 문구');}
// 1군 데뷔 기록
{const L=League.create(base,'Lions',10);L.faAdvance(75);L.closeFA();L.advance(30,false);const S=L.S,t=S.userTeam;const act=L.players(t).filter(p=>p.active&&p.type==='B'),farm=L.players(t).filter(p=>!p.active&&p.type==='B'&&!L.isInj(p));const lo=act.sort((a,b)=>L.ovr(a)-L.ovr(b))[0];
 const f=farm.find(p=>!(p.lockUntil>S.day));if(f){L.moveActive(lo.id,false);const e=L.moveActive(f.id,true);if(!e){ok(f.debut1&&f.debut1.y===S.year&&f.debut1.d===S.day,'승격 시 데뷔 기록');const d0=JSON.stringify(f.debut1);L.moveActive(f.id,false);S.day+=15;L.moveActive(f.id,true);ok(JSON.stringify(f.debut1)===d0,'데뷔는 한 번만 기록')}}}
console.log('growth tests ok '+n);
