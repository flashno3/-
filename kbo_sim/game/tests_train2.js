/* 훈련 세분화: 역할·포지션 그룹별 방침(우선순위·누적·부상 위험·미리보기·프리셋·저장) + 약점 보완 훈련 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed)=>{const L=League.create(base,'Lions',seed||5);L.faAdvance(75);L.closeFA();return L};
const days=(L,d)=>{for(let i=0;i<d;i++)L._trainDay()};
// 1) 그룹 정의·분류
{const L=mk(),t=L.S.userTeam;const gi=L.trainGroupInfo();ok(gi.length===7&&gi.map(g=>g.key).join()==='C,IF,OF,DH,SP,RP,CL','7개 그룹');ok(gi.reduce((a,g)=>a+g.n,0)===L.players(t).length,'모든 선수가 한 그룹에 속함');
 ok(gi.find(g=>g.key==='CL').n===1,'마무리 1명');const sp=L.players(t).find(p=>p.type==='P'&&p.role==='SP');ok(L.trainGroupOf(sp)==='SP','선발');ok(gi.every(g=>!g.ownFocus&&!g.ownInten),'기본은 팀 설정 따름')}
// 2) 우선순위: 개별 슬롯 > 그룹 > 팀, 검증, 되돌림
{const L=mk(),t=L.S.userTeam;L.setTrainSide('P','focus','all');L.setTrainSide('B','focus','all');const sp=L.players(t).find(p=>p.type==='P'&&L.trainGroupOf(p)==='SP'),rp=L.players(t).find(p=>p.type==='P'&&L.trainGroupOf(p)==='RP');
 ok(L.trainEffCfg(sp).src==='team'&&L.trainEffCfg(sp).focus==='all','팀 설정');ok(L.setTrainGroup('SP','focus','stamina')===null,'그룹 지정');ok(L.trainEffCfg(sp).focus==='stamina'&&L.trainEffCfg(sp).src==='group'&&L.trainEffCfg(rp).focus==='all','그룹 우선, 다른 그룹은 팀');
 ok(typeof L.setTrainGroup('SP','focus','contact')==='string','투수 그룹에 타자 훈련 거부');ok(typeof L.setTrainGroup('XX','focus','all')==='string','알 수 없는 그룹');ok(typeof L.setTrainGroup('SP','inten','zzz')==='string','잘못된 강도');
 ok(L.setTrainGroup('SP','inten','heavy')===null&&L.trainEffCfg(sp).inten==='heavy','강도 지정');L.slotAdd(sp.id,'control','light');ok(L.trainEffCfg(sp).src==='slot'&&L.trainEffCfg(sp).focus==='control','개별 슬롯이 최우선');L.slotRemove(sp.id);
 ok(L.setTrainGroup('SP','focus','inherit')===null&&L.setTrainGroup('SP','inten','inherit')===null,'따름으로 복귀');ok(!L.trainCfg().groups.SP&&L.trainEffCfg(sp).src==='team','그룹 설정 제거')}
// 3) 누적과 효과: 그룹별로 다른 훈련이 쌓이고 성장 보정에 반영, 그룹을 정하지 않은 그룹은 팀 설정과 동일
{const L=mk(),S=L.S,t=S.userTeam;L.setTrainSide('P','focus','all');L.setTrainSide('B','focus','all');L.setTrainGroup('SP','focus','stuff');L.setTrainGroup('RP','focus','none');L.setTrainGroup('C','focus','def');
 S.phase='regular';S.day=10;days(L,60);const a=S.trainAcc;ok(a.total===60&&a.g.SP.stuff===60&&!a.g.SP.all&&a.g.RP.none===60&&a.g.C.def===60&&a.g.IF.all===60&&a.P.all===60,'그룹별 누적 '+JSON.stringify(a.g.SP));
 const sp=L.players(t).find(p=>L.trainGroupOf(p)==='SP'),rp=L.players(t).find(p=>L.trainGroupOf(p)==='RP'),cat=L.players(t).find(p=>L.trainGroupOf(p)==='C'),inf=L.players(t).find(p=>L.trainGroupOf(p)==='IF');
 const es=L._trainEff(sp),er=L._trainEff(rp),ec=L._trainEff(cat),ei=L._trainEff(inf);ok(es.w.k>1&&es.w.hr>1,'선발 구위 집중: 삼진·피홈런 가중');ok(er.mult===1&&Object.keys(er.w).length===0,'구원 훈련 없음: 보정 없음');ok(ec.range>0,'포수 수비 집중: 수비 범위');ok(ei.mult>1&&ei.range===0,'내야수는 팀 설정(종합)');
 // 위험: 그룹 강도
 L.setTrainGroup('IF','inten','heavy');ok(L.trainRisk(inf).pct>=15&&L.trainRisk(inf).why.some(x=>/내야수 훈련 강하게/.test(x)),'그룹 강도 부상 위험 '+JSON.stringify(L.trainRisk(inf)));
 // 미리보기
 const pv=L.trainPreview();ok(pv.B&&pv.P&&pv.P.bonus>=0,'미리보기 동작');
 // 저장/불러오기
 const L2=League.load(L.save());ok(JSON.stringify(L2.trainCfg().groups)===JSON.stringify(L.trainCfg().groups)&&JSON.stringify(L2.S.trainAcc.g)===JSON.stringify(L.S.trainAcc.g),'저장·불러오기');days(L2,5);ok(L2.S.trainAcc.g.SP.stuff===65,'불러온 뒤 이어서 누적')}
// 4) 그룹을 쓰지 않으면 기존과 같은 보정(팀 누적과 동일)
{const L=mk(7),S=L.S,t=S.userTeam;L.setTrainSide('B','focus','contact');L.setTrainSide('P','focus','control');S.phase='regular';S.day=5;days(L,40);const a=S.trainAcc;
 for(const side of ['B','P'])for(const k of Object.keys(a.g))if((side==='B')===!!({C:1,IF:1,OF:1,DH:1}[k]))ok(JSON.stringify(a.g[k])===JSON.stringify(a[side]),'그룹 누적 = 팀 누적 '+k);
 const p=L.players(t).find(q=>q.type==='B'),old=L._trainShares(p);ok(old.total===40&&old.acc.contact===40,'효과 계산 입력 동일')}
// 5) 프리셋에 그룹 포함
{const L=mk();L.setTrainGroup('CL','focus','stuff');ok(L.saveTrainPreset('마무리집중')===null,'저장');L.setTrainGroup('CL','focus','inherit');ok(!L.trainCfg().groups.CL,'해제');const id=L.trainPresets().find(x=>x.name==='마무리집중').id;ok(L.applyTrainPreset(id)===null&&L.trainCfg().groups.CL.focus==='stuff','프리셋 적용으로 그룹 복원');ok(L.applyTrainPreset('b_bal')===null&&!Object.keys(L.trainCfg().groups).length,'기본 프리셋은 그룹 초기화')}
// 6) 약점 보완
{const L=mk(),t=L.S.userTeam;const lst=L.trainWeakList(8);ok(lst.length>=3,'추천 '+lst.length);for(let i=1;i<lst.length;i++)ok(lst[i-1].score>=lst[i].score-1e-9,'점수순');for(const x of lst){ok(x.w.gap>=4&&x.p.age<=32&&!x.p.foreign,'기준');ok(L.trainWeakness(x.p)[0].focus===x.w.focus,'최대 약점')}
 const x=lst[0],ws=L.trainWeakness(x.p);ok(ws.every((w,i)=>i===0||ws[i-1].gap>=w.gap),'약점은 격차 순');const avg=L._leagueSubAvg(x.p.type),sub=L.sub(x.p);ok(Math.abs(ws[0].gap-(avg[ws[0].stat]-sub[ws[0].stat]))<0.06,'격차 = 리그 평균 − 선수 값');
 ok(L.slotAddWeak(x.p.id)===null,'시작');const sl=L.trainSlots().find(s=>s.id===x.p.id);ok(sl&&sl.focus===x.w.focus&&sl.weak===x.w.stat&&sl.inten==='normal','슬롯에 약점 표시');ok(typeof L.slotAddWeak(x.p.id)==='string','중복 거부');
 const y=lst.find(z=>z.p.id!==x.p.id);const alt=L.trainWeakness(y.p)[1];if(alt)ok(L.slotAddWeak(y.p.id,alt.focus)===null&&L.trainSlots().find(s=>s.id===y.p.id).focus===alt.focus,'다른 약점 선택');
 ok(typeof L.slotAddWeak('B99999')==='string','없는 선수');ok(typeof L.slotAddWeak(lst[lst.length-1].p.id,'zzz')==='string','없는 약점')}
console.log('train2 tests ok',n);
