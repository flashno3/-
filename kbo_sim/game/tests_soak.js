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
  for(const p of mine){finite(p.contract.salary,tag+' 연봉');ok(p.contract.salary>=0.3&&p.contract.years>=0&&p.contract.years<=6,`${tag} 계약 범위 ${p.ko} ${JSON.stringify(p.contract)} cHist=${JSON.stringify(p.cHist)} ext=${JSON.stringify(p.extAt)} myExt=${JSON.stringify(p.myExt)} age=${p.age} notes=${JSON.stringify((p.notes||[]).slice(-3))} myFrom=${JSON.stringify(p.myFrom)} mil=${p.milReturn} rookie=${p.rookie} src=${p.src} act=${p.active} tn=${p.tn} sal=${p.sal} fa=${JSON.stringify(p.faInfo)} inTeams=${Object.keys(S.teams).filter(t=>S.teams[t].ids.includes(p.id)).join(',')} dupInUser=${S.teams[S.userTeam].ids.filter(x=>x===p.id).length} id=${p.id} off=${JSON.stringify(S.off&&S.off.rep&&S.off.rep.expiring.includes(p.id))}`);if(p.contract.bonus)ok(p.contract.bonus>=0&&p.contract.amort>=0,`${tag} 계약금`);if(p.loyAdj!==undefined)ok(p.loyAdj>=-15&&p.loyAdj<=15,`${tag} loyAdj ${p.loyAdj}`);if(p.promise)ok(p.promise.kind&&p.promise.label,`${tag} 약속 형식`)}
  const n=S.neg;if(n){ok(n.mood>=0&&n.mood<=100,`${tag} 호감도 범위 ${n.mood}`);ok(n.round<=n.max,`${tag} 라운드 ${n.round}/${n.max}`);ok(['open','paused','signed','broke','done'].includes(n.state),`${tag} 상태 ${n.state}`);ok(n.log.every(x=>typeof x.text==='string'&&x.text.length>0&&!/undefined|NaN|\{[a-z]+\}/.test(x.text)),`${tag} 대사 오류: `+n.log.filter(x=>/undefined|NaN|\{[a-z]+\}/.test(x.text)).map(x=>x.text).join('|'))}
  if(L.finReady&&L.finReady()){finite(L.faRoom(t),tag+' faRoom');finite(L.payroll(t),tag+' payroll')}
  if(L.trainCfg){const c=L.trainCfg(),lim=L.slotLimit();ok(['B','P'].every(k=>c[k]&&L.trainFocusInfo(k)[c[k].focus]&&['light','normal','heavy'].includes(c[k].inten)),`${tag} 훈련 설정 형식`);const sl=L.trainSlots();ok(sl.length<=lim,`${tag} 개별 훈련 한도 ${sl.length}/${lim}`);ok(new Set(sl.map(x=>x.id)).size===sl.length,`${tag} 개별 훈련 중복`);for(const x of sl){const p=S.players[x.id];ok(p&&p.team===S.userTeam&&L.trainFocusInfo(p.type==='P'?'P':'B')[x.focus],`${tag} 슬롯 선수·분야 유효 ${x.id}`)}
    const a=L._trainAcc();ok(Number.isFinite(a.total)&&a.total>=0,`${tag} 훈련 누적`);for(const sd of ['B','P'])for(const v of Object.values(a[sd]))ok(Number.isFinite(v)&&v>=0,`${tag} 누적값`);
    for(const p of L.players(S.userTeam).slice(0,40)){const e=L._trainEff(p);ok(Number.isFinite(e.mult)&&e.mult>=1&&e.mult<=1.6&&Object.values(e.w).every(v=>Number.isFinite(v)&&v>=1&&v<=2.2),`${tag} 훈련 효과 범위 ${p.ko} ${e.mult}`);const inj=L._trainInjFor(p);ok(inj>=0.8&&inj<=1.2,`${tag} 훈련 부상 위험 범위 ${inj}`)}
    const pv=L.trainPreview();ok(Number.isFinite(pv.B.bonus)&&Number.isFinite(pv.P.bonus),`${tag} 예상 성장`);}
  if(L.scoutEst){const sc=L.scouts();ok(sc.length<=L.scoutLimit(),`${tag} 스카우트 한도`);ok(Number.isFinite(L.scoutPay(S.userTeam))&&Math.abs(L.scoutPay(S.userTeam)-sc.reduce((a,x)=>a+x.salary,0))<0.11,`${tag} 스카우트 연봉`);const w=L.scoutWatchList();ok(w.length<=24&&new Set(w.map(x=>x.id)).size===w.length,`${tag} 관심 목록`);
    const pl=L.prospectList();ok(pl.length===0||pl.length>=60&&pl.length<=120,`${tag} 후보 풀 ${pl.length}`);const p2=L.prospectList2();ok(p2.length>=60&&p2.length<=120&&p2.every(q=>q.pro&&q.pro.cls===2&&q.rookie===S.year+2),`${tag} 내년 후보 ${p2.length}`);ok(pl.every(q=>q.pro&&q.pro.cls===1),`${tag} 올해 후보 학년`);for(const f of L.faList().filter(q=>L.hiddenForeign(q)).slice(0,6)){const e=L.fEst(f);ok(Number.isFinite(e.o)&&e.sd>=2&&e.sd<=6.01,`${tag} 외국인 추정 ${JSON.stringify(e)}`)}{const fpl=L.foreignPoolList();ok(fpl.length===0||fpl.length===28,`${tag} 해외 후보군 ${fpl.length}`);for(const f of fpl.slice(0,10)){const e=L.fEst(f);ok(Number.isFinite(e.o)&&e.sd>=1.5&&e.sd<=6.01&&f.team==='DRAFT'&&f.fpool,`${tag} 후보 추정 ${JSON.stringify(e)}`)}const fw=L.foreignWatchList();ok(fw.length<=8&&new Set(fw.map(w=>w.id)).size===fw.length,`${tag} 해외 관심 목록`)}for(const t of Object.keys(S.teams)){const q=L.aiScoutQ(t);ok(q>=0.05&&q<=0.35,`${tag} AI 스카우트 수준 ${q}`)}for(const p of pl.slice(0,40)){const e=L.scoutEst(p);ok(e&&Number.isFinite(e.ceil)&&Number.isFinite(e.o)&&e.ceilSd>=3&&e.ceilSd<=16.01&&e.ceil>=25&&e.ceil<=85,`${tag} 추정 범위 ${p.id} ${JSON.stringify(e)}`);ok(!(p.sc&&Object.values(p.sc.by).some(b=>!(b.n>0)||!Number.isFinite(b.mc))),`${tag} 관찰 기록 형식`)}}
  if(L.integrity){const ir=L.integrity();ok(ir.errors.length===0,`${tag} 데이터 무결성 오류: ${ir.errors.map(e=>e.text+' '+JSON.stringify((e.ids||[]).map(id=>{const p=S.players[id];return p?{id,age:p.age,type:p.type,pos:p.pos||p.role,rookie:p.rookie,draft:p.draft,pro:p.pro,from:p.myFrom,src:p.src,fpid:p.fpid,dh:p.dh&&p.dh.y,team:p.team,faInfo:p.faInfo&&p.faInfo.from}:id}))).join(' | ')}`)}
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
function randTrain(L,R,tag){
  const S=L.S,t=S.userTeam,x=R();const side=R()<0.5?'B':'P';const keys=L.trainFocusKeys(side),ints=['light','normal','heavy'];
  if(x<0.25)L.setTrainSide(side,'focus',keys[Math.floor(R()*keys.length)]);else if(x<0.4)L.setTrainSide(side,'inten',ints[Math.floor(R()*3)]);
  else if(x<0.55){const ps=L.trainPresets();L.applyTrainPreset(ps[Math.floor(R()*ps.length)].id)}
  else if(x<0.75){const pl=L.players(t).filter(p=>!p.foreign);const p=pl[Math.floor(R()*pl.length)];const s2=p.type==='P'?'P':'B';const ks=L.trainFocusKeys(s2).filter(k=>k!=='none');L.slotAdd(p.id,ks[Math.floor(R()*ks.length)],ints[Math.floor(R()*3)])}
  else if(x<0.85){const sl=L.trainSlots();if(sl.length)L.slotRemove(sl[Math.floor(R()*sl.length)].id)}
  else if(x<0.92){const sl=L.trainSlots();if(sl.length){const q=sl[Math.floor(R()*sl.length)],p=S.players[q.id],ks=L.trainFocusKeys(p.type==='P'?'P':'B').filter(k=>k!=='none');L.slotSet(q.id,'focus',ks[Math.floor(R()*ks.length)])}}
  else if(x<0.96){L.saveTrainPreset('p'+Math.floor(R()*5))}else{const ps=L.trainPresets().filter(p=>!p.builtin);if(ps.length)L.deleteTrainPreset(ps[0].id)}
  if(S.phase==='offseason'&&R()<0.5){const sd=R()<0.5?'B':'P',ks=L.trainFocusKeys(sd).filter(k=>k!=='none');L.setCamp(sd,ks[Math.floor(R()*ks.length)],Math.floor(R()*4))}
  invariants(L,tag+'train');
}
function randScout(L,R,tag){
  const S=L.S,x=R();
  if(x<0.2&&S.scoutMkt&&S.scoutMkt.length)L.scoutHire(S.scoutMkt[Math.floor(R()*S.scoutMkt.length)].id);else if(x<0.3){const sc=L.scouts();if(sc.length)L.scoutFire(sc[Math.floor(R()*sc.length)].id)}
  else if(x<0.6){L.scoutAutoWatch(1+Math.floor(R()*10))}else if(x<0.8){const ps=L.prospectList();if(ps.length)L.scoutWatch(ps[Math.floor(R()*ps.length)].id)}else if(x<0.9){const w=L.scoutWatchList();if(w.length)L.scoutStar(w[Math.floor(R()*w.length)].id)}
  const y=R();if(y<0.3){const ps=L.prospectAll(),sc=L.scouts();if(ps.length&&sc.length)L.scoutProbe(ps[Math.floor(R()*ps.length)].id,sc[Math.floor(R()*sc.length)].id)}else if(y<0.6){const hf=L.faList().filter(q=>L.hiddenForeign(q)),sc=L.scouts();if(hf.length&&sc.length)L.scoutForeign(hf[Math.floor(R()*hf.length)].id,sc[Math.floor(R()*sc.length)].id)}else if(y<0.7)L.scoutAutoWatch(1+Math.floor(R()*6),R()<0.5?1:2);else if(y<0.8){const fl=L.foreignPoolList();if(fl.length)L.foreignWatch(fl[Math.floor(R()*fl.length)].id)}else if(y<0.88)L.foreignAutoWatch(1+Math.floor(R()*4));else if(y<0.94){const w=L.foreignWatchList();if(w.length)L.foreignStar(w[Math.floor(R()*w.length)].id)}
  invariants(L,tag+'scout');
}
function run(seed,team,seasons,actSeed,detail){
  const L=League.create(base,team,seed),S=L.S,R=rng(actSeed);const log=[];let negs=0,deals=0;
  for(let y=0;y<seasons;y++){
    // FA 기간
    for(let d=0;d<75&&S.faMkt&&!S.faMkt.closed;d+=Math.floor(R()*10)+3){const kinds=['fa','fa','foreign','meeting'];const k=kinds[Math.floor(R()*kinds.length)];negs+=randomNeg(L,R,`Y${y}FA${d}${k}`,k)?1:0;L.faAdvance(Math.floor(R()*8)+1);invariants(L,`Y${y}FA-adv`)}
    L.faAdvance(75);L.closeFA();invariants(L,`Y${y}closeFA`);
    // 시즌: 20일 단위 진행하며 면담·연장
    let guard=0;while(S.phase!=='offseason'&&S.day<260&&guard++<30){const r=L.advance(10,false);invariants(L,`Y${y}d${S.day}`);if(R()<0.6)negs+=randomNeg(L,R,`Y${y}d${S.day}ext`,R()<0.5?'extend':'meeting')?1:0;
      randTrain(L,R,`Y${y}d${S.day}`);randScout(L,R,`Y${y}d${S.day}`);
      // 이벤트 무작위 처리
      for(const e of L.eventsOpen().slice(0,2)){const ch=e.choices[Math.floor(R()*e.choices.length)];L.resolveEvent(e.id,ch.k)}
      if(r&&r.status==='userGame'){const ctx=L.startUserGame(r.game,r.idx);L.playAuto(ctx);L.finishUserGame(ctx)}}
    L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
    const off=L.startOffseason();invariants(L,`Y${y}offseason`);for(let k=0;k<4;k++)randTrain(L,R,`Y${y}off${k}`);
    for(const id of off.rep.expiring.slice()){const p=S.players[id];if(L.negBlock(id,'resign')===null&&R()<0.7){negs+=randomNeg(L,R,`Y${y}resign`,'resign')?1:0}}
    for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}
    L.finishContracts();const d=L.buildDraft();let steps=0;for(;;){const r=L.draftAiStep();if(r.done||r.userTurn)break;if(steps++>400)break}
    let gg=0;while(L.draftOnClock()&&gg++<200){if(L.draftOnClock()===S.userTeam){const b=d.pool.map(i=>S.players[i]).sort((a,b)=>L.userScore(b)-L.userScore(a))[0];if(!b||L.draftPick(b.id))break}for(;;){const r=L.draftAiStep();if(r.done||r.userTurn)break}if(d.pick>=d.order.length)break}
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
