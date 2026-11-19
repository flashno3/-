const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
// 1) 구 설정 호환·변환
{const L=mk(3),S=L.S;let c=L.trainCfg();ok(c.B.focus==='none'&&c.P.focus==='none'&&c.B.inten==='normal'&&c.slots.length===0,'기본 설정');ok(L.train().focus==='none','구 API 기본');
 S.train={focus:'bat',inten:'heavy'};c=L.trainCfg();ok(c.B.focus==='all'&&c.P.focus==='none'&&c.B.inten==='heavy'&&c.P.inten==='heavy','구 저장 파일(타격 집중) 변환');
 S.train={focus:'cond',inten:'light'};c=L.trainCfg();ok(c.B.focus==='cond'&&c.P.focus==='cond','구 컨디션 집중 변환');
 S.trainAcc={total:10,bat:12,pit:3,def:2,cond:4};const a=L._trainAcc();ok(a.B.all===12&&a.P.all===3&&a.B.def===2&&a.B.cond===4&&a.P.cond===4&&a.bat===undefined,'구 누적 변환');}
// 2) 타자·투수 분리 집중
{const L=mk(4),S=L.S,t=S.userTeam;ok(L.setTrainSide('B','focus','contact')&&L.setTrainSide('B','inten','heavy')&&L.setTrainSide('P','focus','control'),'분리 설정');ok(!L.setTrainSide('B','focus','stuff')&&!L.setTrainSide('P','focus','power')&&!L.setTrainSide('X','focus','all')&&!L.setTrainSide('B','inten','x'),'잘못된 설정 거부');
 L.advance(60,false);const a=L._trainAcc();ok(a.B.contact>=a.total*1.4&&a.P.control>=a.total*0.95&&a.P.control<=a.total*1.05,'타자 강하게(1.5배)·투수 보통 누적');
 const b=L.players(t).find(p=>p.type==='B'&&!p.foreign),pt=L.players(t).find(p=>p.type==='P'&&!p.foreign);const eb=L._trainEff(b),ep=L._trainEff(pt);
 ok(eb.mult>1&&eb.w.k>1&&eb.w.babip>1&&eb.w.hr===undefined&&eb.w.bb===undefined,'타자 컨택: 삼진·BABIP 가중만 '+JSON.stringify(eb.w));ok(ep.mult>1&&ep.w.bb>1&&ep.w.babip>1&&ep.w.k===undefined,'투수 제구: 볼넷·피안타 가중만');
 const ai=L.players('Bears')[0];ok(L._trainEff(ai).mult===1,'AI 구단에는 적용 안 됨');
 const f=L.trainForecast();ok(f.days===a.total&&f.acc.bat>0&&f.acc.pit>0&&Number.isFinite(f.avgBonus),'예상 성장 구조');}
// 3) 코치 연동: 담당 코치 능력에 따라 효과가 달라진다
{const L=mk(5),S=L.S,t=S.userTeam;L.setTrainSide('B','focus','power');const lo=L.trainCoach('B','power');const cs=L.coachesOf(t);const old=cs.map(c=>c.power);cs.forEach(c=>{c.power=85});const hi=L.trainCoach('B','power');ok(hi.cf>lo.cf&&hi.cf<=1.25&&hi.rating>=80&&hi.who,'좋은 코치일수록 효과 ↑ '+lo.cf.toFixed(3)+'→'+hi.cf.toFixed(3));
 cs.forEach(c=>{c.power=20});const bad=L.trainCoach('B','power');ok(bad.cf>=0.8&&bad.cf<hi.cf,'나쁜 코치는 효과 ↓(하한 0.8)');cs.forEach((c,i)=>{c.power=old[i]});
 L.advance(40,false);const b=L.players(t).find(p=>p.type==='B'&&!p.foreign);cs.forEach(c=>{c.power=85});const e1=L._trainEff(b).w.hr;cs.forEach(c=>{c.power=30});const e2=L._trainEff(b).w.hr;ok(e1>e2&&e2>1,'장타 가중이 코치 능력에 비례');}
// 4) 개별 훈련 슬롯
{const L=mk(6),S=L.S,t=S.userTeam;const lim=L.slotLimit();ok(lim>=2&&lim<=6,'슬롯 한도 '+lim);const bs=L.players(t).filter(p=>p.type==='B'&&!p.foreign&&p.age<=30);
 ok(L.slotAdd(bs[0].id,'power','heavy')===null&&L.trainSlots().length===1,'슬롯 추가');ok(L.slotAdd(bs[0].id,'power')!==null,'중복 추가 불가');ok(L.slotAdd(L.players('Bears')[0].id)!==null,'타 팀 선수 불가');ok(L.slotAdd(bs[1].id,'stuff')!==null,'투수 분야는 타자에게 불가');
 for(let i=1;i<lim;i++)ok(L.slotAdd(bs[i].id,'contact')===null,'슬롯 채우기');ok(L.slotAdd(bs[lim].id,'contact')!==null&&/까지/.test(L.slotAdd(bs[lim].id,'contact')),'한도 초과 거부');
 L.advance(50,false);const p0=bs[0];ok(p0.tr&&p0.tr.y===S.year&&p0.tr.acc.power>=p0.tr.total*1.4-2,'슬롯 선수는 개별 누적(강하게 1.5배) '+JSON.stringify(p0.tr));const e=L._trainEff(p0);ok(e.w.hr>1&&e.w.xbh>1,'슬롯 선수는 장타 가중');
 const other=L.players(t).find(p=>p.type==='B'&&!p.foreign&&!L.trainSlots().some(x=>x.id===p.id));ok(L._trainEff(other).mult===1,'슬롯 밖 선수는 영향 없음');
 ok(L.slotSet(p0.id,'focus','eye')===null&&L.slotSet(p0.id,'inten','light')===null&&L.slotSet(p0.id,'focus','stuff')!==null&&L.slotSet('B9999','focus','eye')!==null,'슬롯 변경 검증');
 // 부상 중에는 누적되지 않는다
 const q=bs[1];const t0=q.tr.acc.contact||0,tot0=q.tr.total;q.inj={dx:'테스트',until:S.day+200,apply:true};L.advance(10,false);ok(L.isInj(q)?((q.tr.acc.contact||0)===t0&&q.tr.total>tot0):true,'부상 중 훈련 효과 정지');delete q.inj;
 ok(L.slotRemove(bs[2].id)===null&&L.trainSlots().length===lim-1&&L.slotRemove(bs[2].id)!==null,'슬롯 제거');ok(L.slotCandidates().every(x=>!L.trainSlots().some(s=>s.id===x.p.id)),'추천 후보는 슬롯 밖 선수');}
// 5) 부상 위험
{const L=mk(7),S=L.S,t=S.userTeam;const b=L.players(t).find(p=>p.type==='B'&&p.active&&!p.foreign);ok(Math.abs(L._trainInjFor(b)-1)<1e-9,'기본 위험 1.0');L.setTrainSide('B','inten','heavy');ok(Math.abs(L._trainInjFor(b)-1.15)<1e-9,'강하게 +15%');L.setTrainSide('B','focus','cond');ok(Math.abs(L._trainInjFor(b)-1.15*0.88)<1e-9,'컨디션 관리 −12%');
 L.setTrainSide('B','focus','power');L.slotAdd(b.id,'cond','light');ok(Math.abs(L._trainInjFor(b)-0.92*0.88)<1e-9,'슬롯이 팀 설정보다 우선');L.slotRemove(b.id);
 const old=L.players(t).filter(p=>p.active&&p.type==='B').sort((a,c)=>c.age-a.age)[0];old.age=35;const r=L.trainRisk(old);ok(r.level==='high'&&r.pct===15&&r.why.some(x=>/고령/.test(x)),'고령+강하게 = 높음');ok(L.trainRiskList().some(x=>x.p.id===old.id),'위험 목록에 포함');
 L.setTrainSide('B','inten','light');L.setTrainSide('B','focus','none');ok(L.trainRisk(old).level==='low'&&L.trainRisk(old).pct<0,'가볍게 = 낮음');}
// 6) 프리셋
{const L=mk(8),S=L.S;const ps=L.trainPresets();ok(ps.length>=5&&ps.every(x=>x.builtin),'기본 프리셋');ok(L.applyTrainPreset('b_bat')===null&&L.trainCfg().B.inten==='heavy'&&L.trainCfg().P.focus==='none','프리셋 적용');ok(L.applyTrainPreset('zz')!==null,'없는 프리셋');
 L.setTrainSide('P','focus','stamina');L.setTrainSide('B','focus','eye');const b=L.players(S.userTeam).find(p=>p.type==='B'&&!p.foreign);L.slotAdd(b.id,'power','normal');
 ok(L.saveTrainPreset('내 설정')===null&&L.saveTrainPreset('내 설정')!==null&&L.saveTrainPreset('')!==null&&L.saveTrainPreset('균형 육성')!==null,'저장·중복·기본이름 검증');L.saveTrainPreset('a');L.saveTrainPreset('b');ok(L.saveTrainPreset('c')!==null,'최대 3개');
 const id=L.trainPresets().find(x=>x.name==='내 설정').id;L.applyTrainPreset('b_off');L.slotRemove(b.id);ok(L.applyTrainPreset(id)===null&&L.trainCfg().P.focus==='stamina'&&L.trainCfg().B.focus==='eye'&&L.trainSlots().length===1,'내 프리셋(슬롯 포함) 복원');ok(L.deleteTrainPreset(id)===null&&L.deleteTrainPreset(id)!==null,'프리셋 삭제');
 ok((S.trainLog||[]).length>=5&&S.trainLog.every(x=>x.text),'훈련 이력 기록');}
// 7) 미리보기: 현재 상태를 바꾸지 않고 시즌 끝까지의 예상을 계산
{const L=mk(9),S=L.S;L.setTrainSide('B','focus','power');L.setTrainSide('P','focus','stuff');L.advance(30,false);const before=JSON.stringify(S.trainAcc);const pv=L.trainPreview();ok(JSON.stringify(S.trainAcc)===before,'미리보기는 누적을 바꾸지 않음');
 ok(pv.B.bonus>0&&pv.P.bonus>0&&pv.B.fields.some(x=>x[0]==='hr')&&pv.P.fields.some(x=>x[0]==='k')&&pv.daysLeft>0,'예상 구조 '+JSON.stringify(pv));
 const cur=L.trainForecast().avgBonus;ok(pv.B.bonus>=0,'타자 예상 보정');L.setTrainSide('B','inten','heavy');const pv2=L.trainPreview();ok(pv2.B.bonus>pv.B.bonus,'강하게 하면 예상이 커짐');L.setTrainSide('B','focus','none');L.setTrainSide('P','focus','none');const pv3=L.trainPreview();ok(pv3.B.bonus<pv2.B.bonus&&(pv3.B.fields.length===0||pv3.B.fields[0][1]<pv2.B.fields[0][1]),'집중을 끄면 예상이 줄어듦(이미 쌓인 30일분은 남음)');}
// 8) 비시즌 캠프
{const L=mk(10),S=L.S;ok(L.setCamp('B','power',2)!==null,'시즌 중에는 캠프 불가');season(L);L.startOffseason();ok(L.setCamp('B','power',2)===null&&L.setCamp('P','stamina',3)===null,'오프시즌 캠프 설정');ok(L.setCamp('B','none',1)!==null&&L.setCamp('B','stuff',1)!==null,'잘못된 분야 거부');ok(Math.abs(L.campTotalCost()-(2.2+3.6))<1e-9,'캠프 비용 합계 '+L.campTotalCost());
 L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.faAdvance(75);L.closeFA();const ev0=S.fin.teams[S.userTeam].evCost||0;L.startNewSeason();
 const a=L._trainAcc();ok(a.total>=40&&a.B.power===16&&a.P.stamina===24,'캠프 일수가 새 시즌 누적에 더해짐 '+JSON.stringify(a));ok(Math.abs((S.fin.teams[S.userTeam].evCost||0)-ev0-5.8)<1e-9,'캠프 비용이 행사 비용으로 계상');ok(S.camp===null,'캠프 정리');ok(S.story.some(e=>/비시즌 캠프/.test(e.text)),'스토리 기록');
 const b=L.players(S.userTeam).find(p=>p.type==='B'&&!p.foreign);L.setTrainSide('B','focus','power');ok(L._trainEff(b).w.hr>1,'캠프 효과가 성장 가중에 반영');}
// 9) 성장 반영: 설정이 같으면 결과 동일(결정성), 집중하면 해당 능력치가 더 큼, AI는 불변
{const run=(cfg,sl)=>{const L=mk(11),S=L.S,t=S.userTeam;if(cfg)cfg(L);if(sl)sl(L);L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
  const before={};for(const id of S.teams[t].ids)before[id]={...S.players[id].p};const bef2={};for(const id of S.teams.Bears.ids)bef2[id]=JSON.stringify(S.players[id].p);L.startOffseason();return {L,S,t,before,bef2}};
 const a=run(null),b=run(null),c=run(L=>{L.setTrainSide('B','focus','power');L.setTrainSide('B','inten','heavy')});
 const sig=r=>JSON.stringify(r.S.teams[r.t].ids.map(id=>r.S.players[id].p));ok(sig(a)===sig(b),'같은 설정 → 같은 결과');
 const hrSum=r=>r.S.teams[r.t].ids.map(id=>r.S.players[id]).filter(p=>p.type==='B'&&p.age<=30).reduce((x,p)=>x+p.p.hr,0),kSum=r=>r.S.teams[r.t].ids.map(id=>r.S.players[id]).filter(p=>p.type==='B'&&p.age<=30).reduce((x,p)=>x+p.p.k,0);
 ok(hrSum(c)>hrSum(a),'장타 집중: 홈런 능력 성장 '+hrSum(a).toFixed(4)+' → '+hrSum(c).toFixed(4));ok(Math.abs(kSum(c)-kSum(a))<Math.abs(hrSum(c)-hrSum(a))*8+1e-9,'비집중 능력(삼진) 변화는 작음');
 ok(c.L.players('Bears').every(p=>c.L._trainEff(p).mult===1)&&c.L.players(c.t).filter(p=>p.type==='P').every(p=>c.L._trainEff(p).mult===1),'AI 구단·투수에는 효과 함수가 1(타자 훈련만 설정)');}
// 10) 되돌리기·저장/불러오기
{const L=mk(12),S=L.S;L.pushUndo('훈련');L.setTrainSide('B','focus','eye');L.setTrainSide('P','focus','stuff');const b=L.players(S.userTeam).find(p=>p.type==='B'&&!p.foreign);L.slotAdd(b.id,'run','heavy');ok(L.trainCfg().B.focus==='eye','설정됨');L.undo();ok(L.trainCfg().B.focus==='none'&&L.trainCfg().P.focus==='none'&&L.trainSlots().length===0,'되돌리기 복원');
 L.setTrainSide('B','focus','power');L.slotAdd(b.id,'contact','light');L.advance(30,false);const L2=League.load(L.save());ok(JSON.stringify(L2.trainCfg())===JSON.stringify(L.trainCfg()),'저장/불러오기: 설정');ok(JSON.stringify(L2.S.players[b.id].tr)===JSON.stringify(b.tr)&&JSON.stringify(L2._trainAcc())===JSON.stringify(L._trainAcc()),'저장/불러오기: 누적·개별 추적');
 L.advance(20,false);L2.advance(20,false);ok(JSON.stringify(L2._trainAcc())===JSON.stringify(L._trainAcc())&&JSON.stringify(L2.S.players[b.id].tr)===JSON.stringify(L.S.players[b.id].tr),'불러온 뒤 같은 진행');}
// 11) 새 시즌 초기화
{const L=mk(13),S=L.S;L.setTrainSide('B','focus','power');const b=L.players(S.userTeam).find(p=>p.type==='B'&&!p.foreign);L.slotAdd(b.id,'power');season(L);L.startOffseason();L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.faAdvance(75);L.closeFA();L.startNewSeason();
 ok(L._trainAcc().total<30&&!L.S.players[b.id].tr&&(S.trainTrack||[]).length===0,'새 시즌 누적·개별 추적 초기화');ok(L.trainCfg().B.focus==='power'&&L.trainSlots().length===1,'설정과 슬롯 지정은 유지');}
console.log('training tests ok',n);
