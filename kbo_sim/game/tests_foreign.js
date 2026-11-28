const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const reg=(seed,days)=>{const L=mk(seed);L.advance(days||40,false);return L};
const hurt=(L,p,days)=>{const S=L.S,now=L.todayN(),since=new Date((now-1)*864e5),ret=new Date((now+days)*864e5);p.inj={dx:'테스트 부상',since:since.toISOString().slice(0,10)+' 발생',ret:ret.toISOString().slice(0,10),retN:now+days,apply:true,generated:true};p.active=false;L.invalidate()};
const gen=(L)=>L.foreignOf(L.S.userTeam).filter(p=>!p.aq);
// 1) 후보군 구조: core는 기존과 같은 ID·능력, deep은 별도 ID 구간, AI는 core만
{const L=League.create(base,'Lions',3),S=L.S;const fp=L.foreignPoolList();ok(fp.length===116,'116명');const core=fp.filter(p=>!p.deep);ok(core.length===28,'core 28');
 const L2=League.create(base,'Lions',3);const ids2=L2.foreignPoolList().filter(p=>!p.deep).map(p=>p.id+':'+L2.ovr(p));ok(JSON.stringify(core.map(p=>p.id+':'+L.ovr(p)))===JSON.stringify(ids2),'같은 시드면 같은 후보(결정적)');
 const nx=S.nextId;L.foreignPoolList();ok(S.nextId===nx,'풀 재조회는 ID를 만들지 않음');ok(S.nextId>Math.max(...Object.keys(S.players).map(id=>parseInt(id.slice(1)))),'nextId 일관');
 const out=L.foreignOut();ok(out.rows.length===220&&out.total===336,'1차 모수 336');ok(Object.keys(out.by).length>=6,'제외 사유 분류');
 ok(out.rows.filter(x=>x.aq).every(x=>x.lg&&x.why),'아시아쿼터 제외 사유');}
// 2) 시즌 종료 후 FA 시장 합류, AI는 deep을 고르지 않음(리그 외국인 수준 유지)
{const L=mk(4),S=L.S;const deep=new Set(L.foreignPoolList().filter(p=>p.deep).map(p=>p.id));L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 L.startOffseason();L.finishContracts();ok(L.faList().filter(p=>p.foreign&&p.deep).length===88,'deep 88명도 FA 시장에');
 L.buildDraft();L.draftAutoRest();L.finishDraft();L.startFAMarket&&0;
 L.faAdvance(75);L.closeFA();let aiDeep=0;for(const t of Object.keys(S.teams)){if(t===S.userTeam)continue;for(const p of L.foreignOf(t))if(deep.has(p.id))aiDeep++}ok(aiDeep===0,'AI 구단은 deep 후보를 영입하지 않음 '+aiDeep);}
// 3) 합산 상한 400만$(56억): 일반 외국인 3명 합산
{const L=mk(5),S=L.S,t=S.userTeam;const g=gen(L);ok(g.length===3,'일반 3명');for(const p of g)p.contract.salary=17;ok(L.foreignGenPay(t)===51,'합산 51');
 const cand=L.faList().find(x=>x.foreign&&!x.aq);const T=L.foreignTotalCap(t);ok(T>=56&&Math.abs(T-(56+1.4*g.reduce((a,x)=>a+L.fTenure(x,t)-1,0)))<0.05,'합산 상한 = 56억 + 장수 증액 '+T);const room=L.foreignRoom(t,g[0].id);ok(Math.abs(room-Math.round((T-34)*10)/10)<1e-9,'한 명 제외 시 여유 = 상한 − 34 '+room);
 g[0].contract.salary=14;g[1].contract.salary=20;g[2].contract.salary=18;ok(Math.abs(L.foreignRoom(t,g[0].id)-Math.round((T-38)*10)/10)<1e-9&&L.foreignCap(g[0],t)<=T-38+1e-9,'재계약 시 나머지 합산을 뺀 만큼만');
 g[1].contract.salary=Math.ceil(T/2);g[2].contract.salary=Math.ceil(T/2);ok(L.foreignCap(g[0],t)===0,'여유 없으면 0(나머지 둘이 합산 상한을 다 씀)');
 const ai=Object.keys(S.teams).find(x=>x!==t);const q=L.foreignOf(ai).find(x=>!x.aq);q.contract.salary=70;ok(L.foreignCap(q,ai)>0,'AI 구단에는 합산 상한을 적용하지 않음');
 const aq=L.foreignOf(t).find(x=>x.aq);if(aq)ok(L.foreignCap(aq,t)>=1.4,'아시아쿼터는 합산 대상 아님');}
// 4) 교체 횟수 연 2회(정규시즌), 시즌 밖에는 제한 없음
{const L=reg(6),S=L.S,t=S.userTeam;ok(S.phase==='regular','정규시즌');ok(L.fSwapInfo().n===0&&L.fSwapBlock()===null,'초기 0회');
 for(let i=0;i<2;i++){const c=L.faList().find(x=>x.foreign&&!x.aq&&x.type==='P'&&x.team==='FA')||null;if(!c)break;const old=gen(L).find(x=>x.type==='P');if(!old)break;L.releasePlayer(old.id);const e=L.signFA(c.id);ok(e===null,'교체 영입 '+e)}
 ok(L.fSwapInfo().n===2,'2회 사용');ok(/2회/.test(L.fSwapBlock()),'3회째 차단');L.releasePlayer(gen(L)[0].id);const c3=L.faList().find(x=>x.foreign&&!x.aq&&x.team==='FA'&&L.foreignOK(S.userTeam,x));ok(/모두 사용/.test(L.signFA(c3.id)||''),'signFA 차단');ok(/모두 사용/.test(L.negBlock(c3.id,'foreign')||''),'협상 차단');
 const L2=mk(6);ok(L2.S.phase!=='regular'&&L2.fSwapBlock()===null,'시즌 밖 제한 없음');}
// 5) 부상 대체: 자격·계약·비용·한도 밖 슬롯
{const L=reg(21,60),S=L.S,t=S.userTeam;const f=S.fin.teams[t];const g=gen(L)[0];ok(L.subEligible().length===0,'부상 없으면 대상 없음');
 hurt(L,g,30);ok(L.subEligible().length===0,'30일 부상은 대상 아님');hurt(L,g,50);const el=L.subEligible();ok(el.length===1&&el[0].p.id===g.id&&el[0].days>=50,'50일 부상은 대상');
 const aq=L.foreignOf(t).find(x=>x.aq);if(aq){hurt(L,aq,60);ok(L.subEligible().some(x=>x.p.id===aq.id),'아시아쿼터도 대상(규약 확인)');
  const ac=L.subCands(true);ok(ac.length>=1&&ac.every(c=>c.aq),'아시아쿼터 후보만');ok(L.subCost(2,true)===0.6,'월 0.28억');const e=L.subSign(aq.id,ac[0].id,2);ok(!e,'AQ 대체 계약 '+e);const cc=S.players[ac[0].id];ok(cc.sub&&Math.abs(cc.sub.monthly-0.28)<1e-9&&cc.aq,'대체 월 0.28억');ok(L.subSign(aq.id,L.subCands(false)[0].id,2),'이미 대체 중');L._subDrop(cc,'테스트');delete aq.inj;aq.active=true}
 const cands=L.subCands();ok(cands.length>=60&&cands.every(c=>!c.aq),'일반 외국인 후보만');
 const c=cands[0],pay0=L.finPay(t),dead0=L.deadNow(t),sal0=L.payroll(t);ok(L.subMaxMonths()>=1&&L.subMaxMonths()<=6,'기간 한도');
 ok(/기간/.test(L.subSign(g.id,c.id,0)||''),'0개월 불가');ok(/기간/.test(L.subSign(g.id,c.id,9)||''),'9개월 불가');
 const err=L.subSign(g.id,c.id,2);ok(err===null,'대체 계약 '+err);ok(c.team===t&&c.sub&&c.sub.for===g.id&&g.rehab,'재활 명단·대체 표시');
 ok(c.contract.salary===0&&L.payroll(t)===sal0,'연봉 합계 불변(이중 계상 없음)');ok(Math.abs(L.deadNow(t)-dead0-2.8)<1e-9&&Math.abs(L.finPay(t)-pay0-2.8)<1e-9,'월 1.4억×2개월 = 2.8억이 올해 비용으로');
 ok(L.subList().length===1,'목록');ok(L.subEligible().length===0,'이미 대체 선수가 있으면 중복 불가');ok(gen(L).filter(x=>!x.sub).length===3,'대체 선수는 3명 한도 밖');
 const c2=L.subCands()[0];ok(/대체 선수가 있으면|42일/.test(L.subSign(g.id,c2.id,1)||''),'중복 계약 차단');
 const ex=L.subExtend(c.id,1);ok(ex===null&&c.sub.mo===3&&Math.abs(L.deadNow(t)-dead0-4.2)<1e-9,'연장 +1.4억');
 ok(L.integrity().errors.length===0,'무결성 '+JSON.stringify(L.integrity().errors).slice(0,200));}
// 6) 복귀 시 선택: 해지 / 정식 전환
{const L=reg(8,60),S=L.S,t=S.userTeam;const g=gen(L)[0],c=L.subCands()[0];hurt(L,g,50);ok(L.subSign(g.id,c.id,3)===null,'계약');
 const day0=S.day;while(S.day<day0+80&&!c.sub.back)L.advance(1,false);ok(c.sub.back&&!L.isInj(g),'원래 선수 복귀 → 결정 대기');ok(c.team===t,'결정 전에는 유지');
 const sw0=L.fSwapInfo().n,pay0=L.finPay(t);const e=L.subDecide(c.id,'convert');ok(e===null,'전환 '+e);ok(g.team==='FA'&&!c.sub&&c.contract.salary>0&&c.contract.salary<=1.4*7,'기존 선수 웨이버·잔여 한도 계약 '+c.contract.salary);ok(L.fSwapInfo().n===sw0+1,'전환은 교체 1회 차감');
 ok(g.rehab===undefined,'재활 명단 해제');ok(L.foreignOf(t).filter(x=>!x.aq).length===3,'일반 외국인 3명');ok(L.integrity().errors.length===0,'무결성');}
{const L=reg(9,60),S=L.S,t=S.userTeam;const g=gen(L)[0],c=L.subCands()[0];hurt(L,g,50);L.subSign(g.id,c.id,1);const sw0=L.fSwapInfo().n;ok(L.subDecide(c.id,'release')===null,'해지');ok(c.team==='FA'&&!c.sub&&L.faList().includes(c),'즉시 FA 공시');ok(L.fSwapInfo().n===sw0,'해지는 교체 횟수 차감 없음');ok(c.faInfo&&c.faInfo.sub,'공시 표시');ok(g.rehab===undefined,'재활 해제');}
// 7) 결정 기한·계약 종료 자동 처리, 시즌 종료 정리
{const L=reg(10,60),S=L.S,t=S.userTeam;const g=gen(L)[0],c=L.subCands()[0];hurt(L,g,200);L.subSign(g.id,c.id,1);const d0=S.day;L.advance(40,false);ok(c.team==='FA'&&!c.sub&&g.rehab===undefined,'계약 종료 시 FA 공시 '+c.team);ok(S.news.some(x=>/대체 외국인 .*공시/.test(x.text)),'뉴스');}
{const L=reg(11,60),S=L.S,t=S.userTeam;const g=gen(L)[0],c=L.subCands()[0];hurt(L,g,300);L.subSign(g.id,c.id,6);L.advance(300,false);const P=L.startPostseason();let k=0;while(!P.done&&k++<100){if(L.userInPost()){const x=L.startUserPostGame();x.live.playToEnd();L.finishUserPostGame(x)}else L.simPostGame()}
 const sub0=S.players[c.id].sub;L.startOffseason();ok(!S.players[c.id].sub&&S.players[c.id].team==='FA'&&!S.off.rep.expiring.includes(c.id),'시즌 종료: 대체 계약 정리, 재계약 목록에 없음 '+!!sub0);ok(L.integrity().errors.length===0,'무결성');}
// 8) 8/15 이후 영입한 외국인은 포스트시즌 출전 불가
{const L=reg(12,60),S=L.S,t=S.userTeam;while(!L.postDeadline().passed&&S.phase==='regular')L.advance(5,false);ok(L.postDeadline().passed,'8/15 경과');const g=gen(L).find(x=>x.type==='P');const c=L.faList().find(x=>x.foreign&&!x.aq&&x.type==='P');L.releasePlayer(g.id);ok(L.signFA(c.id)===null,'영입');ok(c.noPost===S.year,'포스트시즌 불가 표시');
 L.advance(300,false);if(S.phase==='regular')L.advance(300,false);const P=L.startPostseason();ok(!c.active&&/포스트시즌/.test(L.setActive(t,c.id,true)||''),'포스트시즌 엔트리 제외·등록 불가');let k=0;while(!P.done&&k++<100){if(L.userInPost()){const x=L.startUserPostGame();x.live.playToEnd();L.finishUserPostGame(x)}else L.simPostGame()}}
{const L=reg(13,30),S=L.S;const g=gen(L).find(x=>x.type==='P');const c=L.faList().find(x=>x.foreign&&!x.aq&&x.type==='P');L.releasePlayer(g.id);L.signFA(c.id);ok(c.noPost!==S.year,'8/15 이전 영입은 출전 가능');}
// 9) 저장/불러오기 후에도 대체 상태 유지
{const L=reg(14,60),S=L.S,t=S.userTeam;const g=gen(L)[0],c=L.subCands()[0];hurt(L,g,60);L.subSign(g.id,c.id,2);const L2=League.load?League.load(L.save()):null;if(L2){ok(L2.subList().length===1&&L2.S.players[g.id].rehab&&L2.subList()[0].sub.mo===2,'저장·복원')}else{const J=JSON.parse(L.save());ok(J.players[c.id].sub.mo===2&&J.players[g.id].rehab,'직렬화')}}
console.log('foreign tests ok '+n);
