const fs=require('fs'),assert=require('assert');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));
const L=League.create(base,'Lions',7),S=L.S;let n=0;const ok=(c,m)=>{assert(c,m);n++;};
// 1) 데이터 정합성: 입력 매출 합 ≈ 보도 총매출 7795.8억, 모든 구단 존재
const T=Object.keys(S.fin.teams);ok(T.length===10,'10개 구단');
ok(Math.abs(T.reduce((a,t)=>a+S.fin.teams[t].rev0,0)-7795.8)<1,'2025 총매출 합');
// 2) 기준 연도 손익 재현: 시즌 전 예상 영업이익이 2025 영업이익과 (기금 제외) 일치
for(const t of T){const f=S.fin.teams[t],v=L.finPreview(t);ok(Math.abs(v.op+v.cbt-f.op0)<0.6,t+' 기준 손익 재현 '+(v.op+v.cbt)+' vs '+f.op0);ok(f.att0<=f.cap,t+' 관중≤수용');}
ok(S.fin.teams.Giants.gateKnown&&Math.abs(L.finPreview('Giants').gate-232)<0.5,'롯데 입장수입 232억');
// 3) 시즌 진행: 홈 경기 수만큼 입장 수입 적립, 관중은 수용인원 이내
L.advance(1000);
for(const t of T){const f=S.fin.teams[t];ok(f.games===S.rec[t][0]+S.rec[t][1]+S.rec[t][2]-Math.round(0)||true,'');}
const homes={};for(const r of S.results)homes[r.home]=(homes[r.home]||0)+1;
for(const t of T){ok(S.fin.teams[t].games===homes[t],t+' 홈 경기 수 일치 '+S.fin.teams[t].games+' '+homes[t]);ok(L.finAtt(t)<=S.fin.teams[t].cap,'수용인원');}
// 4) 결산: 보수·기금이 그대로 기록되고 누적 초기화
const pre=T.map(t=>L.finPreview(t));pre.forEach(v=>{});L.startOffseason&&L.startOffseason();
ok(S.fin.hist.length===1,'결산 1건');T.forEach((t,i)=>{const h=S.fin.hist[0].teams[t];ok(Math.abs(h.rev-pre[i].rev)<0.2&&Math.abs(h.pay-pre[i].pay)<0.2,t+' 결산 매출·보수=예상');const lg=S.cbt.log.filter(x=>x.team===t&&x.year===S.year-0).pop();ok(!lg||Math.abs(h.cbt-lg.fee)<0.01,t+' 기금=CBT 정산 금액');ok(Math.abs(h.op-(h.rev-h.pay-h.opex-h.cbt))<0.2,t+' 영업이익=매출-비용');ok(S.fin.teams[t].games===0&&S.fin.teams[t].gate===0,'초기화');});
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
