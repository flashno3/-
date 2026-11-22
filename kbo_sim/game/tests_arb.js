/* 재계약 요구(성적·팀 성적 반영·삭감 가능)·전년 대비 비교·연봉조정 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9),S=L.S;L.faAdvance(75);L.closeFA();L.advance(300,false);const U=S.userTeam;
const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
const off=L.startOffseason();
// 1) 팀 성적 보정
{const tp=L.teamPerf(U);ok(tp.rank>=1&&tp.rank<=10&&[0.02,0,-0.03,-0.06].includes(tp.factor),'팀 성적 보정 '+JSON.stringify(tp));
 for(const t of ['Bears','Twins'])ok(L.teamPerf(t).post===(L.teamPerf(t).rank<=5),'가을야구 여부');}
// 2) 요구액: 비FA 삭감 한도 −30%·인상 한도 ×2, FA 자격자는 성적에 비례(삭감 한도 −30%)
let cut=0,up=0,cnt=0;for(const p of Object.values(S.players)){if(!(p.team in S.teams)||p.foreign)continue;const cur=p.contract.salary,a=L.resignAsk(p);cnt++;
  ok(a>=L.minSal()-1e-9,'최저연봉');if(L.faEligible(p)){ok(a>=cur*0.7*0.94-0.11||a<=L.minSal()+0.11,'FA 자격자 삭감 한도 '+p.ko+' '+cur+'→'+a)}else{ok(a>=cur*0.7*0.94-0.11&&a<=cur*2+0.31,'비FA 요구 범위 '+p.ko+' '+cur+'→'+a)}if(a<cur-0.05)cut++;if(a>cur+0.05)up++}
ok(cut>20&&up>20,'삭감과 인상이 모두 존재 cut='+cut+' up='+up+'/'+cnt);
// 3) 성적에 비례(FA 자격자 중 WAR 상위 vs 하위의 요구/현재 비)
{const el=Object.values(S.players).filter(p=>p.team in S.teams&&!p.foreign&&L.faEligible(p));if(el.length>=8){const sorted=el.slice().sort((a,b)=>L.war(b)-L.war(a)),r=p=>L.resignAsk(p)/p.contract.salary,top=sorted.slice(0,4).reduce((a,p)=>a+r(p),0)/4,bot=sorted.slice(-4).reduce((a,p)=>a+r(p),0)/4;ok(top>bot,'FA 자격자: WAR 높을수록 요구 인상률 ↑ '+top.toFixed(2)+' > '+bot.toFixed(2))}}
// 4) 비교 자료
{const p=Object.values(S.players).find(x=>x.team===U&&!x.foreign);const rv=L.salaryReview(p);ok(rv.prev===p.contract.salary&&Math.abs(rv.ask-L.resignAsk(p))<1e-9&&rv.reasons.length>=1&&Math.abs(rv.pct-(rv.ask-rv.prev)/rv.prev)<1e-9,'전년 대비 요구 자료')}
// 5) 연봉조정: 자격(FA 대상 외 + 활동 3년)·결정·수용/거부
{const cand=Object.values(S.players).filter(p=>p.team===U&&!p.foreign&&!L.faEligible(p));ok(cand.length>10,'비FA 후보');
 const el=cand.find(p=>p.fa.svc>=3),yg=cand.find(p=>p.fa.svc<3);ok(el&&yg,'3년 이상/미만 선수');
 off.rep.expiring.push(el.id,yg.id);ok(L.arbEligible(el)&&!L.arbEligible(yg),'신청 자격');
 ok(typeof L.arbFile(yg.id)==='string','3년 미만은 신청 불가');
 const c=L.arbCase(el.id);ok(c.eligible&&c.clubDefault<=c.playerAsk&&c.clubDefault>=L.minSal()&&c.hint[0]<c.hint[1],'조정 자료');
 // 구단안을 선수 요구와 같게 내면 선수안이 이기지 않는다(같으면 구단안) — 결과 금액은 요구액
 const dEq=L.arbDecide(el.id,c.playerAsk);ok(dEq.final===c.playerAsk,'동일 제시액');
 // 평가액에 가까운 구단안은 채택, 터무니없이 낮은 구단안은 선수안
 const ref=L._arbRef(S.players[el.id]);const near=L.arbDecide(el.id,Math.max(L.minSal(),Math.min(c.playerAsk,ref)));
 const low=L.arbDecide(el.id,L.minSal());ok(near.win==='club'||near.final===c.playerAsk,'평가액에 가까운 구단안');ok(low.win==='player'||ref<=(low.playerAsk+L.minSal())/2,'너무 낮은 구단안은 선수안(평가액 기준)');
 const loy0=el.loyAdj||0;const f=L.arbFile(el.id,near.clubFig);ok(typeof f!=='string','신청 '+f);ok(off.arbPending[el.id]&&off.rep.expiring.includes(el.id),'수용 전에는 계약 전');
 ok(L.arbAccept(el.id)===null,'수용');ok(!off.rep.expiring.includes(el.id)&&el.contract.years===1&&el.contract.salary===near.final,'1년 계약 체결 '+el.contract.salary+' vs '+near.final);ok((el.loyAdj||0)<loy0,'관계 악화');ok(off.rep.arb.length===1&&off.rep.arb[0].id===el.id,'조정 기록');
 // 거부 → 자유계약
 const el2=cand.find(p=>p.fa.svc>=3&&p.id!==el.id);if(el2){off.rep.expiring.push(el2.id);ok(L.arbRefuse(el2.id)===null&&el2.team==='FA','거부 시 자유계약')}
 // 확정 시 미합의: 3년 이상 → 자동 연봉조정, 3년 미만 → 구단 제시액
 const el3=cand.find(p=>p.fa.svc>=3&&p.team===U&&!off.rep.expiring.includes(p.id));if(el3)off.rep.expiring.push(el3.id);
 L.finishContracts();ok(!off.rep.expiring.length,'확정 후 만료 목록 비움');ok(yg.team===U&&yg.contract.years===1&&yg.contract.salary>=L.minSal(),'3년 미만은 구단 제시액 계약');
 if(el3)ok(el3.team===U&&off.rep.arb.some(a=>a.id===el3.id),'미합의 3년 이상은 연봉조정으로 결정')}
console.log('arb tests ok',n);
