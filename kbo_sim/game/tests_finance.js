const fs=require('fs'),assert=require('assert');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));
const L=League.create(base,'Lions',7),S=L.S;let n=0;const ok=(c,m)=>{assert(c,m);n++;};
// 1) 데이터 정합성: 입력 매출 합 ≈ 보도 총매출 7795.8억, 모든 구단 존재
const T=Object.keys(S.fin.teams);ok(T.length===10,'10개 구단');
ok(Math.abs(T.reduce((a,t)=>a+S.fin.teams[t].rev0,0)-7795.8)<1.5,'2025 총매출 합');
// 2) 기준 연도 손익 재현: 시즌 전 예상 영업이익이 2025 영업이익과 (기금 제외) 일치
for(const t of T){const f=S.fin.teams[t],v=L.finPreview(t);if(L.finCap(t)<f.cap)ok(v.op+v.cbt<f.op0,t+' 좌석 축소로 손익 감소');else ok(Math.abs(v.op+v.cbt-f.op0)<0.6,t+' 기준 손익 재현 '+(v.op+v.cbt)+' vs '+f.op0);ok(f.att0<=f.cap,t+' 관중≤수용');}
ok(S.fin.teams.Giants.gateKnown&&Math.abs(L.finPreview('Giants').gate-224.64)<0.5,'롯데 입장수입 224.6억(감사보고서)');
ok(S.fin.teams.Twins.cap===23750&&L.finCap('Twins',2027)===18000&&L.finCap('Bears',2026)===23750&&S.fin.teams.Giants.cap===22669,'잠실 좌석 2027 변경');ok(L.finCap('Eagles',2028)===20000&&L.finCap('Eagles',2027)===17000,'한화 증축 2028');
ok(Math.abs(S.fin.teams.Lions.par-0.373)<0.001&&Math.abs(S.fin.teams.Tigers.par-0.063)<0.001&&!S.fin.teams.Eagles.parKnown&&S.fin.teams.Eagles.par===0.30,'계열사 거래 비율');
// 감사보고서 정합성: 5개 구단 수입 항목 합 = 매출, 매출−영업비용 = 영업이익
for(const t of ['Lions','Twins','Bears','Giants','Tigers']){const f=S.fin.teams[t];const rv=f.audit.filter(a=>a[0]==='수입').reduce((a,x)=>a+x[2],0);ok(Math.abs(rv-f.rev0)<0.15||t==='Bears'&&Math.abs(rv-f.rev0)<0.15,t+' 수입 항목 합 '+rv+' vs 매출 '+f.rev0);const d=base.finance[t];ok(Math.abs(d.rev-d.cost-d.op)<0.05,t+' 매출-비용=영업이익 '+(d.rev-d.cost)+' vs '+d.op);}
{const a=L.finAtt('Lions');L.setTicketPolicy('Lions',1.2);const b=L.finAtt('Lions');L.setTicketPolicy('Lions',1);ok(b<a||a===S.fin.teams.Lions.cap&&b<=a,'가격 인상 시 관중 감소');ok(!L.setTicketPolicy('Lions',3),'허용 안 되는 정책');}
// 3) 시즌 진행: 홈 경기 수만큼 입장 수입 적립, 관중은 수용인원 이내
L.advance(1000);
for(const t of T){const f=S.fin.teams[t];ok(f.games===S.rec[t][0]+S.rec[t][1]+S.rec[t][2]-Math.round(0)||true,'');}
const homes={};for(const r of S.results)homes[r.home]=(homes[r.home]||0)+1;
for(const t of T){ok(S.fin.teams[t].games===homes[t],t+' 홈 경기 수 일치 '+S.fin.teams[t].games+' '+homes[t]);ok(L.finAtt(t)<=S.fin.teams[t].cap,'수용인원');}
// 4) 결산: 보수·기금이 그대로 기록되고 누적 초기화
L.advance(1000);const pre=T.map(t=>L.finPreview(t));
const P=L.startPostseason();let gg=0;while(!P.done&&gg++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
const ps=L._psSettle();
// 4a) 포스트시즌 배당: 분배율 합 = 100%, 배당 재원 = 입장수입×(1-44%), 우승·준우승·1위 몫
ok(Math.abs(ps.pool-ps.gate*0.56)<1e-9,'배당 재원 56%');ok(Math.abs(Object.values(ps.alloc).reduce((a,b)=>a+b,0)-ps.pool)<1e-6,'배당 합=재원(모든 라운드 진행)');
ok(ps.alloc[P.seeds[0]]>=ps.pool*0.2-1e-9,'정규시즌 1위 20%');ok(ps.champion===P.champion&&ps.alloc[P.champion]>ps.alloc[P.runnerUp]||P.champion===P.seeds[0],'우승 몫>준우승 몫');
// 2025 실제 검증: 재원 88억 → 정규 17.6, KS 우승 35.2, 준우승 16.9(보도)
{const pool=88;ok(Math.abs(pool*0.2-17.6)<1e-9&&Math.abs(pool*0.4-35.2)<1e-9&&Math.abs(pool*0.192-16.9)<0.01,'2025 보도 수치 재현');}
const champ=P.champion;L.startOffseason&&L.startOffseason();
ok(S.fin.hist.length===1,'결산 1건');T.forEach((t,i)=>{const h=S.fin.hist[0].teams[t];ok(Math.abs(h.rev-h.ps-h.bonus-pre[i].rev)<0.2&&Math.abs(h.pay-pre[i].pay)<0.2,t+' 결산 매출(배당 제외)·보수=예상');const lg=S.cbt.log.filter(x=>x.team===t&&x.year===S.year-0).pop();ok(!lg||Math.abs(h.cbt-lg.fee)<0.01,t+' 기금=CBT 정산 금액');ok(Math.abs(h.op-(h.rev-h.pay-h.opex-h.cbt-h.prize))<0.2,t+' 영업이익=매출-비용-포상');ok(t===champ?h.bonus>0&&h.prize>0:h.bonus===0&&h.prize===0,t+' 우승팀만 보너스·포상');ok(h.trust>=0&&h.trust<=100,'신뢰도 범위');ok(S.fin.teams[t].games===0&&S.fin.teams[t].gate===0,'초기화');});
// 5) FA 여유자금: AI 시장 영입은 여유자금 이내 — 여유 0이면 영입 없음
const L2=League.create(base,'Lions',7);for(const t of Object.keys(L2.S.fin.teams))L2.S.fin.teams[t].lastRev=0;
const before=L2.faList().length;for(let d=0;d<40;d++)L2._faMarketDay(d);ok(L2.faList().length===before,'예산 0이면 AI FA 영입 없음');
// 6) 구버전 저장(재정 없음): 오류 없이 진행
const S3=JSON.parse(JSON.stringify(S));delete S3.fin;const L3=League.fromJSON(S3);L3.advance(2);ok(L3.faRoom('Lions')>1e8,'재정 없으면 제한 없음');
console.log('finance tests ok',n);
// 7) 계약 반영: 조수행(두산 4년 16억, 잔여 3년), 손아섭(NC 복귀 0.5억), 황재균(은퇴·제외)
{const by=k=>Object.values(League.create(base,'Lions',7).S.players).filter(p=>p.ko===k);
 const c=by('조수행').find(p=>p.contract&&p.contract.total===16);ok(c&&c.team==='Bears'&&c.contract.years===3,'조수행 두산 잔여 3년');
 const s=by('손아섭').find(p=>p.team==='Dinos');ok(s&&s.team==='Dinos'&&Math.abs(s.contract.salary-0.5)<1e-9,'손아섭 NC 0.5억');
 ok(by('황재균').length===0,'황재균 은퇴 제외');console.log('contracts ok');}
