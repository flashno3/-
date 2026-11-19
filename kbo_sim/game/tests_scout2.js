const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
const nextYear=L=>{const S=L.S;season(L);L.startOffseason();L.finishContracts();const d=L.buildDraft();L.draftAiUntilUser();let g=0;while(L.draftOnClock()&&g++<200){if(L.draftOnClock()===S.userTeam){const b=d.pool.map(i=>S.players[i]).sort((a,c)=>L.userScore(c)-L.userScore(a))[0];if(L.draftPick(b.id))break}L.draftAiUntilUser();if(d.pick>=d.order.length)break}L.finishDraft();L.faAdvance(75);L.closeFA();L.startNewSeason()};
// 1) 2년치 후보
{const L=League.create(base,'Lions',5),S=L.S;const c1=L.prospectList(),c2=L.prospectList2();ok(c1.length===120&&c2.length===120&&L.prospectAll().length===240,'올해·내년 후보 각 120명');ok(S.prospects2.y===S.year+1,'내년 후보 연도');
 ok(c1.every(p=>p.pro.cls===1&&p.rookie===S.year+1)&&c2.every(p=>p.pro.cls===2&&p.rookie===S.year+2),'학년 표시·입단 연도');ok(new Set(c1.concat(c2).map(p=>p.id)).size===240,'id 유일');
 ok(L.integrity().errors.length===0,'후보 포함 무결성');
 // 관찰: 내년 후보는 잡음 ×1.25
 L.faAdvance(75);L.closeFA();L.scoutHire(S.scoutMkt[0].id);L.scoutAutoWatch(6,1);L.scoutAutoWatch(6,2);L.advance(60,false);const w1=L.scoutWatchList().filter(w=>S.players[w.id].pro.cls===1),w2=L.scoutWatchList().filter(w=>S.players[w.id].pro.cls===2);ok(w1.length>=5&&w2.length>=5,'두 학년 모두 관심');
 L.advance(40,false);const sc0=L.scouts()[0],chk=w=>{const q=S.players[w.id];if(!q.sc)return null;const b=Object.values(q.sc.by)[0],r=q.pro.univ?sc0.univ:sc0.high,exp=Math.min(16,Math.max(7,16-0.17*(r-40)))*(q.pro.cls===2?1.25:1);return Math.abs(b.se-exp)<0.11};const c1x=w1.map(chk).filter(x=>x!==null),c2x=w2.map(chk).filter(x=>x!==null);ok(c1x.length>=3&&c2x.length>=3&&c1x.every(Boolean)&&c2x.every(Boolean),'내년 후보 관찰 잡음 ×1.25 '+c1x.length+'/'+c2x.length);
 // 승계: 새 시즌에 내년 후보가 올해 후보가 된다(관찰 기록 유지)
 const ids2=c2.map(p=>p.id),obs=Object.fromEntries(w2.filter(w=>S.players[w.id].sc).map(w=>[w.id,JSON.stringify(S.players[w.id].sc.by)]));nextYear(L);
 const now=L.prospectList().map(p=>p.id);ok(JSON.stringify(now.slice().sort())===JSON.stringify(ids2.slice().sort()),'내년 후보 → 올해 후보로 승계');ok(L.prospectList().every(p=>p.pro.cls===1&&p.rookie===S.year+1),'승계 후 학년·입단 연도');
 for(const id of Object.keys(obs)){const before=JSON.parse(obs[id]),afterBy=S.players[id].sc&&S.players[id].sc.by;ok(afterBy&&Object.keys(before).every(k=>afterBy[k]&&afterBy[k].n>=before[k].n),'관찰 기록 유지(이어서 누적)')}ok(L.prospectList2().length===120&&S.prospects2.y===S.year+1,'새 내년 후보 생성');}
// 2) 결정성: 같은 시드 → 같은 후보(이름·능력 추정)
{const a=League.create(base,'Lions',21),b=League.create(base,'Lions',21),f=L=>JSON.stringify(L.prospectAll().map(p=>[p.ko,p.age,p.type,p.pro.school,p.scout.o,Math.round(p.scout.ceil*100)]));ok(f(a)===f(b),'같은 시드 → 같은 후보');
 const c=League.create(base,'Lions',22);ok(f(a)!==f(c),'다른 시드 → 다른 후보');}
// 3) 인성 조사
{const L=mk(6),S=L.S,t=S.userTeam;L.scoutHire(S.scoutMkt[0].id);L.scoutHire(S.scoutMkt[1].id);const [s1,s2]=L.scouts();const ps=L.prospectList();const p=ps[0];ok(!L.scoutTraitView(p).known,'조사 전 성격 미확인');ok(!JSON.stringify(L.scoutReport(p)).includes('"trait":"'+L.traitOf(p)+'"')||!L.scoutReport(p).trait.known,'조사 전 리포트에 성격 없음');
 const ev0=S.fin.teams[t].evCost||0;ok(L.scoutProbe(p.id,s1.id)===null,'조사');ok(Math.abs((S.fin.teams[t].evCost||0)-ev0-0.3)<1e-9,'조사비 0.3억 계상');ok(L.scoutProbe(p.id,s1.id)!==null,'같은 스카우트 재조사 불가');ok(L.scoutProbe(p.id,'X')!==null&&L.scoutProbe('B1',s1.id)!==null,'잘못된 대상 거부');
 const v1=L.scoutTraitView(p);ok(v1.known&&v1.n===1&&['낮음','보통'].includes(v1.conf)&&v1.opinions.length===1,'의견 1건');ok(L.scoutProbe(p.id,s2.id)===null,'두 번째 스카우트 조사');const v2=L.scoutTraitView(p);ok(v2.n===2&&(v2.split?v2.conf==='엇갈림'&&v2.trait===null:v2.conf==='높음'),'의견 2건: 일치면 높음·다르면 엇갈림');
 // 정확도: 많은 후보에서 적중률이 스카우트 능력(정확도)에 가깝다
 s1.high=s1.univ=70;let hit=0,tot=0;for(const q of ps.slice(0,100)){if(L.scoutProbe(q.id,s1.id))continue;tot++;if(q.sc.tr[s1.id].t===L.traitOf(q))hit++;ok(q.sc.tr[s1.id].acc===0.65,'정확도 값 '+q.sc.tr[s1.id].acc)}ok(tot>=95&&hit/tot>0.5&&hit/tot<0.8,'적중률 '+(hit/tot).toFixed(2)+'(정확도 65%)');
 // 결정성
 const A=mk(6),B=mk(6);for(const X of [A,B]){X.scoutHire(X.S.scoutMkt[0].id);X.scoutProbe(X.prospectList()[3].id,X.scouts()[0].id)}ok(JSON.stringify(A.prospectList()[3].sc.tr)===JSON.stringify(B.prospectList()[3].sc.tr),'같은 입력 → 같은 조사 결과');
 // 지명하면 실제 성격이 드러나고 일치 여부 소식
 const X=mk(7),XS=X.S;X.scoutHire(XS.scoutMkt[0].id);const target=X.prospectList().find(q=>q.type==='B');X.scoutProbe(target.id,X.scouts()[0].id);X.scoutWatch(target.id);season(X);X.startOffseason();X.finishContracts();const d=X.buildDraft();X.draftAiUntilUser();let g=0;let picked=false;while(X.draftOnClock()&&g++<200){if(X.draftOnClock()===XS.userTeam&&d.pool.includes(target.id)){ok(X.draftPick(target.id)===null,'지명');picked=true;break}if(X.draftOnClock()===XS.userTeam){X.draftPick(d.pool[0])}X.draftAiUntilUser()}
 if(picked)ok(XS.news.some(x=>/인성 조사 결과 확인/.test(x.text)&&x.text.includes(target.ko)),'지명 후 조사 결과 확인 소식');}
// 4) 외국인 스카우팅
{const L=League.create(base,'Lions',8),S=L.S;const hid=L.faList().filter(p=>L.hiddenForeign(p));ok(hid.length>=5,'가상 외국인 후보 '+hid.length);const real=L.faList().filter(p=>p.foreign&&!p.virtual);ok(real.every(p=>L.fEst(p).exact&&L.fEst(p).o===L.ovr(p)),'KBO 기록 있는 외국인은 정확');
 const e0=hid.map(p=>L.fEst(p));ok(e0.every(e=>!e.exact&&e.sd===6&&e.n===0&&e.conf==='낮음'),'조사 전 오차 ±6');const err0=hid.map((p,i)=>Math.abs(e0[i].o-L.ovr(p)));ok(err0.some(x=>x>0)&&err0.reduce((a,b)=>a+b,0)/err0.length<9,'기본 추정 오차 크기');
 ok(L.fReport(hid[0])===null,'조사 전 세부 능력 비공개');ok(L.fSortKey(hid[0])===(e0[0].o-40)/10,'정렬 키는 추정만 사용');
 L.faAdvance(1);for(const m of [S.scoutMkt[0],S.scoutMkt[1],S.scoutMkt[2]])L.scoutHire(m.id);const sc=L.scouts();const ev=S.fin.teams[S.userTeam].evCost||0;
 for(const p of hid)for(const s of sc)ok(L.scoutForeign(p.id,s.id)===null,'외국인 조사');ok(Math.abs((S.fin.teams[S.userTeam].evCost||0)-ev-0.3*3*hid.length)<1e-6,'조사비 계상');ok(L.scoutForeign(hid[0].id,sc[0].id)!==null,'같은 스카우트 재조사 불가');
 const e1=hid.map(p=>L.fEst(p));ok(e1.every(e=>e.n===3&&e.sd<e0[0].sd&&e.sd>=2),'오차 감소·바닥 '+e1[0].sd);const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;let E0=[],E1=[];for(const sd of [8,13,14,15,16,17]){const X=League.create(base,'Lions',sd),XS=X.S;X.faAdvance(1);for(const m of [XS.scoutMkt[0],XS.scoutMkt[1],XS.scoutMkt[2]])X.scoutHire(m.id);for(const p of X.faList().filter(q=>X.hiddenForeign(q))){E0.push(Math.abs(X.fEst(p).o-X.ovr(p)));for(const s of X.scouts())X.scoutForeign(p.id,s.id);E1.push(Math.abs(X.fEst(p).o-X.ovr(p)))}}ok(E0.length>=30&&mean(E1)<mean(E0)*0.9,'조사 후 평균 오차 감소('+E0.length+'명) '+mean(E0).toFixed(2)+' → '+mean(E1).toFixed(2));
 const rp=L.fReport(hid[0]);ok(rp&&!rp.exact&&Object.keys(rp.sub).length>=5,'조사 후 세부 능력 공개(잡음)');ok(L.scoutForeign(L.players('Bears').find(p=>p.foreign).id,sc[0].id)!==null,'팀 소속 외국인은 대상 아님');
 // 영입하면 진짜 능력 공개
 const tgt=hid.find(p=>L.foreignOK(S.userTeam,p));if(tgt){L.faAdvance(75);const ok2=L.signFA(tgt.id)===null||true;if(tgt.team===S.userTeam)ok(L.fEst(tgt).exact&&L.fEst(tgt).o===L.ovr(tgt),'영입 후 정확');}
 // 결정성
 const A=League.create(base,'Lions',8),B=League.create(base,'Lions',8);const h=A.faList().filter(p=>A.hiddenForeign(p))[0],h2=B.faList().filter(p=>B.hiddenForeign(p))[0];ok(A.fEst(h).o===B.fEst(h2).o,'같은 시드 → 같은 기본 추정');}
// 5) AI 스카우트 격차
{const L=mk(9),S=L.S;const T=Object.keys(S.teams);const qs=T.map(t=>L.aiScoutQ(t));ok(qs.every(q=>q>=0.05&&q<=0.35)&&new Set(qs).size===10,'10개 구단 모두 다른 수준 '+qs.join(','));const key=t=>L.finBudget(t),sorted=T.slice().sort((a,b)=>key(a)-key(b));ok(L.aiScoutQ(sorted[9])>L.aiScoutQ(sorted[0])&&L.aiScoutQ(sorted[9])===0.35&&L.aiScoutQ(sorted[0])===0.05,'재정이 큰 구단이 정확');
 const p=L.prospectList()[0];const t=sorted[9];const tr=0.35*L.ovr(p)+0.65*p.peak,base0=L.scoutScore(p);const as=L.aiScoutScore(t,p);ok(Math.abs(as-tr)<=Math.abs(base0-tr)+1e-9,'AI 추정이 진짜 값 쪽으로 이동');
 const rk=L.scoutRanking();ok(rk.length===10&&rk[0].q===null&&rk.slice(1).every((x,i,a)=>i===0||a[i-1].q>=x.q),'스카우트 수준 순위(내 구단 맨 위)');
 // AI 지명이 aiScoutScore를 쓰는지: 진짜 정점만 보는 AI로 바꾸면 그 순서대로 지명
 const orig=L.aiScoutScore;L.aiScoutScore=(tm,q)=>q.peak;L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}L.startOffseason();L.finishContracts();const d=L.buildDraft();const pool0=d.pool.map(id=>S.players[id]).sort((a,b)=>b.peak-a.peak);
 const first=d.order[0]===S.userTeam?null:d.order[0];if(first){const r=L.draftAiStep();ok(r.pick&&S.players[r.pick.id].peak>=pool0[2].peak-1e-9,'AI는 aiScoutScore 기준으로 지명(상위권 선택)');}L.aiScoutScore=orig;}
// 6) 은퇴 선수 출신 스카우트
{const L=mk(10),S=L.S;S.hof=[{id:'B1',name:'홍길동',y:S.year,age:38,tn:9,awards:[],pos:'2B',summary:''}];L._scoutMarket();const ex=S.scoutMkt.find(c=>c.ex);ok(ex&&ex.name==='홍길동'&&ex.high>=45&&ex.salary>=0.5,'은퇴 선수 스카우트 후보');ok(L.scoutHire(ex.id)===null&&L.scouts()[0].ex===true&&L.scouts()[0].abroad>=30,'은퇴 선수 고용');ok(S.news.some(x=>/은퇴 선수 출신/.test(x.text)),'영입 소식');}
// 7) 구 저장 파일 호환: abroad 없는 스카우트, v2 없는 관찰, prospects2 없음
{const L0=mk(11),S0=L0.S;L0.scoutHire(S0.scoutMkt[0].id);L0.scoutAutoWatch(6,1);L0.advance(30,false);const J=JSON.parse(L0.save());delete J.prospects2;for(const s of J.scouts)delete s.abroad;for(const id of Object.keys(J.players)){const p=J.players[id];if(p.sc)for(const b of Object.values(p.sc.by))delete b.v2;if(p.pro&&p.pro.cls===2)delete J.players[id]}
 const L=League.load(JSON.stringify(J));ok(L.scouts()[0].abroad===undefined,'구 스카우트 abroad 없음');const e=L.scoutEst(L.scoutWatchList().map(w=>L.S.players[w.id]).find(p=>p.sc));ok(Number.isFinite(e.ceil)&&e.n>0,'v2 없는 관찰도 추정');ok(L.prospectList2().length===120,'내년 후보 필요 시 생성');
 const row=L.S.scoutMkt[0];L.S.scoutMkt.push({id:'SCOLD',name:'옛',age:50,high:60,univ:60,salary:1.0});ok(L.scoutHire('SCOLD')===null&&L.scouts().find(s=>s.id==='SCOLD').abroad===45,'abroad 없는 후보는 45로 고용');
 L.scoutForeign(L.faList().find(p=>L.hiddenForeign(p)).id,L.scouts()[0].id);ok(true,'abroad 없는 스카우트도 외국인 조사');}
// 8) 저장/불러오기·진행 동일성
{const L=mk(12),S=L.S;L.scoutHire(S.scoutMkt[0].id);const h=L.faList().find(p=>L.hiddenForeign(p));L.scoutForeign(h.id,L.scouts()[0].id);const q=L.prospectList()[2];L.scoutProbe(q.id,L.scouts()[0].id);L.scoutAutoWatch(6,2);L.advance(21,false);
 const L2=League.load(L.save());ok(JSON.stringify(L2.S.players[h.id].fsc)===JSON.stringify(h.fsc)&&JSON.stringify(L2.S.players[q.id].sc)===JSON.stringify(q.sc),'외국인 조사·인성 조사 보존');ok(JSON.stringify(L2.S.prospects2)===JSON.stringify(S.prospects2),'내년 후보 보존');
 L.advance(14,false);L2.advance(14,false);const ids=L.scoutWatchList().map(w=>w.id);ok(JSON.stringify(ids.map(id=>L2.S.players[id].sc))===JSON.stringify(ids.map(id=>L.S.players[id].sc)),'불러온 뒤 같은 관찰');ok(L.integrity().errors.length===0,'무결성');}
console.log('scout2 tests ok',n);
