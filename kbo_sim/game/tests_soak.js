/* 협상·면담·스토리·평판 포함 장기 소크 테스트: 무작위 행동을 여러 시즌 수행하며 불변식·결정성·저장/불러오기를 검증한다 */
const fs=require('fs'),assert=require('assert');
const {League,ROSTER_MAX,ACTIVE_MAX}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let checks=0;const ok=(c,m)=>{checks++;if(!c)throw new assert.AssertionError({message:m})};
const rng=seed=>{let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
const finite=(v,m)=>ok(Number.isFinite(v),m+' 유한값 아님: '+v);
function invariants(L,tag){
  const S=L.S;
  for(const t of Object.keys(S.teams)){const ids=S.teams[t].ids;ok(ids.length<=ROSTER_MAX+6,`${tag} ${t} 로스터 ${ids.length}`);ok(new Set(ids).size===ids.length,`${tag} 중복 선수`);for(const id of ids){const p=S.players[id];ok(p&&p.team===t,`${tag} 소속 불일치 ${id}`)}}
  const t=S.userTeam,mine=L.players(t);const act=mine.filter(p=>p.active);ok(act.length<=ACTIVE_MAX,`${tag} 1군 초과 ${act.length}`);
  const fo=L.foreignOf(t),gen=fo.filter(p=>!p.aq),aq=fo.filter(p=>p.aq);ok(gen.length<=3&&aq.length<=1,`${tag} 외국인 슬롯 ${gen.length}/${aq.length}`);ok(!(gen.length===3&&gen.every(p=>p.type===gen[0].type)),`${tag} 같은 포지션 3명`);
  for(const p of mine){finite(p.contract.salary,tag+' 연봉');ok(p.contract.salary>=0.3&&p.contract.years>=0&&p.contract.years<=6,`${tag} 계약 범위 ${p.ko} ${JSON.stringify(p.contract)}`);if(p.contract.bonus)ok(p.contract.bonus>=0&&p.contract.amort>=0,`${tag} 계약금`);if(p.loyAdj!==undefined)ok(p.loyAdj>=-15&&p.loyAdj<=15,`${tag} loyAdj ${p.loyAdj}`);if(p.promise)ok(p.promise.kind&&p.promise.label,`${tag} 약속 형식`)}
  const n=S.neg;if(n){ok(n.mood>=0&&n.mood<=100,`${tag} 호감도 범위 ${n.mood}`);ok(n.round<=n.max,`${tag} 라운드 ${n.round}/${n.max}`);ok(['open','paused','signed','broke','done'].includes(n.state),`${tag} 상태 ${n.state}`);ok(n.log.every(x=>typeof x.text==='string'&&x.text.length>0&&!/undefined|NaN|\{[a-z]+\}/.test(x.text)),`${tag} 대사 오류: `+n.log.filter(x=>/undefined|NaN|\{[a-z]+\}/.test(x.text)).map(x=>x.text).join('|'))}
  if(L.finReady&&L.finReady()){finite(L.faRoom(t),tag+' faRoom');finite(L.payroll(t),tag+' payroll')}
  if(L.integrity){const ir=L.integrity();ok(ir.errors.length===0,`${tag} 데이터 무결성 오류: ${ir.errors.map(e=>e.text).join(' | ')}`)}
  const rp=L.reputation();ok(rp.score>=10&&rp.score<=95,`${tag} 평판 ${rp.score}`);
  ok((S.story||[]).every(e=>e.text&&!/undefined|NaN/.test(e.text)&&e.imp>=0),`${tag} 스토리 형식`);ok((S.press||[]).every(e=>e.head&&!/undefined|NaN|\{[a-z]+\}/.test(e.head+(e.fan||''))),`${tag} 언론 형식`);
  const v=L.validateEntry?L.validateEntry():[];ok(Array.isArray(v),`${tag} validateEntry`);
}
function randomNeg(L,R,tag,kind){
  const S=L.S,t=S.userTeam;let pool;
  if(kind==='fa')pool=L.faList().filter(p=>!p.foreign&&L.negBlock(p.id,'fa')===null);
  else if(kind==='foreign'){pool=L.faList().filter(p=>p.foreign&&L.negBlock(p.id,'foreign')===null);if(!pool.length){const cand=L.faList().filter(p=>p.foreign);const mine=L.foreignOf(t);for(const c of cand){const rep=mine.find(m=>{L._replacing=m.id;const k=L.foreignOK(t,c);L._replacing=null;return k&&!!m.aq===!!c.aq});if(rep&&L.negBlock(c.id,'foreign',rep.id)===null){L.negStart(c.id,'foreign',{replace:rep.id});return drive(L,R,tag,'foreign')}}return 0}}
  else if(kind==='extend')pool=L.players(t).filter(p=>L.negBlock(p.id,'extend')===null);
  else if(kind==='resign'){const off=S.off;pool=off?off.rep.expiring.map(id=>S.players[id]).filter(p=>L.negBlock(p.id,'resign')===null):[]}
  else pool=L.players(t).filter(p=>!p.foreign&&L.meetBlock(p.id)===null);
  if(!pool.length)return 0;const p=pool[Math.floor(R()*pool.length)];
  if(kind==='meeting'){const topics=['grievance','request','slump','checkin'];const r=L.negStart(p.id,'meeting',{topic:topics[Math.floor(R()*4)]});ok(r.ok,tag+' 면담 시작 '+(r.msg||''));return drive(L,R,tag,'meeting')}
  const r=L.negStart(p.id,kind);ok(r.ok,tag+' 협상 시작 '+(r.msg||''));return drive(L,R,tag,kind);
}
function drive(L,R,tag,kind){
  const S=L.S;let acts=0,g=0;
  while(S.neg&&S.neg.state==='open'&&g++<30){
    invariants(L,tag+'#'+acts);const n=S.neg,x=R();acts++;
    if(kind==='meeting'){const cs=L.meetCards().filter(c=>!c.disabled);if(x<0.15||!cs.length){L._meetFinish(n);break}const c=cs[Math.floor(R()*cs.length)];const res=L.meetCard(c.k);ok(res.ok,tag+' 면담 카드 '+c.k+' '+(res.msg||''));continue}
    const p=S.players[n.id];
    if(x<0.30){const cs=L.negCards().filter(c=>!c.disabled);if(cs.length){const c=cs[Math.floor(R()*cs.length)];const res=L.negCard(c.k);ok(res.ok||res.msg,tag+' 카드 '+c.k)}}
    else if(x<0.50){const best=L.negBest(n.id)||{years:1,salary:1,bonus:0};const res=L.negOffer(best);ok(res.ok||res.msg||res.rejected,tag+' 충족 제시')}
    else if(x<0.75){const tm=L._negTerms(p,n.kind),y=tm.minY+Math.floor(R()*(tm.maxY-tm.minY+1)),b=L._negMin(p,n.kind,y);const f=0.6+R()*0.6;const res=L.negOffer({years:y,salary:Math.max(0.3,Math.round(b.salary*f*10)/10),bonus:(b.bonus||0)*(R()<0.5?1:0.5)});ok(res.ok||res.msg||res.rejected,tag+' 무작위 제시')}
    else if(x<0.82&&n.counter){const res=L.negCounter();ok(res.ok||res.msg,tag+' 역제안')}
    else if(x<0.86&&n.budgetOffer){const res=L.negBoard();ok(res.ok||res.msg,tag+' 이사회')}
    else if(x<0.90){L.negLeave()}
    else {const res=L.negOffer({years:Math.floor(R()*8)-1,salary:(R()-0.2)*30,bonus:(R()-0.3)*40});ok(res.ok||res.msg||res.rejected,tag+' 엉뚱한 제시 처리')}
  }
  invariants(L,tag+'#end');
  if(S.neg){L.negClose();ok(S.neg===null||S.neg===undefined,tag+' negClose')}
  return acts;
}
function run(seed,team,seasons,actSeed,detail){
  const L=League.create(base,team,seed),S=L.S,R=rng(actSeed);const log=[];let negs=0,deals=0;
  for(let y=0;y<seasons;y++){
    // FA 기간
    for(let d=0;d<75&&S.faMkt&&!S.faMkt.closed;d+=Math.floor(R()*10)+3){const kinds=['fa','fa','foreign','meeting'];const k=kinds[Math.floor(R()*kinds.length)];negs+=randomNeg(L,R,`Y${y}FA${d}${k}`,k)?1:0;L.faAdvance(Math.floor(R()*8)+1);invariants(L,`Y${y}FA-adv`)}
    L.faAdvance(75);L.closeFA();invariants(L,`Y${y}closeFA`);
    // 시즌: 20일 단위 진행하며 면담·연장
    let guard=0;while(S.phase!=='offseason'&&S.day<260&&guard++<30){const r=L.advance(10,false);invariants(L,`Y${y}d${S.day}`);if(R()<0.6)negs+=randomNeg(L,R,`Y${y}d${S.day}ext`,R()<0.5?'extend':'meeting')?1:0;
      // 이벤트 무작위 처리
      for(const e of L.eventsOpen().slice(0,2)){const ch=e.choices[Math.floor(R()*e.choices.length)];L.resolveEvent(e.id,ch.k)}
      if(r&&r.status==='userGame'){const ctx=L.startUserGame(r.game,r.idx);L.playAuto(ctx);L.finishUserGame(ctx)}}
    L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
    const off=L.startOffseason();invariants(L,`Y${y}offseason`);
    for(const id of off.rep.expiring.slice()){const p=S.players[id];if(L.negBlock(id,'resign')===null&&R()<0.7){negs+=randomNeg(L,R,`Y${y}resign`,'resign')?1:0}}
    for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}
    L.finishContracts();const d=L.buildDraft();let steps=0;for(;;){const r=L.draftAiStep();if(r.done||r.userTurn)break;if(steps++>400)break}
    let gg=0;while(L.draftOnClock()&&gg++<200){if(L.draftOnClock()===S.userTeam){const b=d.pool.map(i=>S.players[i]).sort((a,b)=>L.scoutScore(b)-L.scoutScore(a))[0];if(!b||L.draftPick(b.id))break}for(;;){const r=L.draftAiStep();if(r.done||r.userTurn)break}if(d.pick>=d.order.length)break}
    L.finishDraft();invariants(L,`Y${y}draft`);
    L.startNewSeason();invariants(L,`Y${y}newSeason`);
    // 중간 저장/불러오기 동일성
    const L2=League.load(L.save());ok(Object.keys(L2.S.players).length===Object.keys(S.players).length,'저장/불러오기 선수 수');ok(JSON.stringify(L2.S.rep||{})===JSON.stringify(S.rep||{}),'평판 보존');ok((L2.S.story||[]).length===(S.story||[]).length,'스토리 보존');ok(JSON.stringify(L2.S.teams[S.userTeam].ids)===JSON.stringify(S.teams[S.userTeam].ids),'로스터 보존');
  }
  const sig=JSON.stringify({rep:S.rep,story:(S.story||[]).length,press:(S.press||[]).length,chal:S.chalDone,hof:(S.hof||[]).length,faFeed:(S.faFeed||[]).length,pay:L.players(S.userTeam).map(p=>[p.id,p.contract.salary,p.contract.years,p.contract.bonus||0,p.loyAdj||0]),year:S.year});
  return {sig,negs,story:(S.story||[]).length,press:(S.press||[]).length,notes:Object.values(S.players).reduce((a,p)=>a+(p.notes?p.notes.length:0),0),hof:(S.hof||[]).length,chal:(S.chalDone||[]).length};
}
const t0=Date.now();const cfgs=[[31,'Lions',3,1001],[32,'Tigers',3,1002],[33,'Bears',3,1003]];let tot=0;
for(const [seed,team,ss,as] of cfgs){const a=run(seed,team,ss,as);tot+=a.negs;console.log(`soak ${team} seed${seed}: 협상/면담 ${a.negs}회 · 스토리 ${a.story} · 기사 ${a.press} · 노트 ${a.notes} · 헌액 ${a.hof} · 업적 ${a.chal}`)}
ok(tot>=20,'충분한 협상 시도 '+tot);
// 결정성: 같은 시드·같은 행동 → 같은 결과
{const a=run(41,'Wiz',2,2001),b=run(41,'Wiz',2,2001);ok(a.sig===b.sig,'결정성(같은 입력 → 같은 상태)');}
console.log(`soak ok · 검사 ${checks}회 · ${((Date.now()-t0)/1000).toFixed(0)}초`);
