// 경쟁균형세(샐러리캡) 검증
const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}};
const L=League.create(base,'Lions',5),S=L.S,T=Object.keys(S.teams),U='Lions';
const pays=T.map(t=>L.cbtPay(t));const avg=pays.reduce((a,b)=>a+b,0)/10;
console.log('초기 상위40 합계',T.map((t,i)=>t+' '+pays[i]).join(' '),'| 평균',avg.toFixed(1),'| 상한',L.cbtCap(),'하한',L.cbtFloor());
ok(Math.abs(avg-111.05)<0.8,'평균 111.05 근처 '+avg);ok(pays.every(p=>p<L.cbtCap()),'초기 상한 이내');console.log('하한 미달 구단',T.filter((t,i)=>pays[i]<L.cbtFloor()).join(',')||'없음');
ok(L.cbtCap(2027)===151.1709&&L.cbtCap(2028)===158.7294&&L.cbtFloor(2026)===null&&L.cbtFloor(2027)===60.6538,'상한·하한 수치');
ok(L.cbtRate(1)===.3&&L.cbtRate(2)===.5&&L.cbtRate(3)===1&&L.cbtRate(5)===1,'세율');
// 신인·외국인 제외, 41번째 이후 제외
const K=S.calib.cbtK||1,t0=U,pl=L.players(t0).filter(p=>!p.foreign).sort((a,b)=>b.contract.salary-a.contract.salary),before=L.cbtPay(t0);pl[0].foreign=true;ok(Math.abs(L.cbtPay(t0)-(before-(pl[0].contract.salary-pl[40].contract.salary)*K))<0.05,'외국인 제외 후 41번째가 편입');pl[0].foreign=false;
pl[1].rookie=S.year;ok(L.cbtPay(t0)<before,'신인 제외');pl[1].rookie=undefined;
// 시즌 진행 + 정산(사용자가 상한을 일부러 초과)
function season(inflate){L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 if(inflate)for(const p of L.players(U).slice(0,45))p.contract.salary=6;   // 상위 40명 합계 240억
 L.startOffseason();}
const yrs=[];
for(let y=0;y<4;y++){
 const infl=y<3;const yr=S.year;L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 if(infl)for(const p of L.players(U).slice(0,45))p.contract.salary=6;
 const pv=L.cbtPreview(U);L.startOffseason();const lg=S.cbt.log.filter(x=>x.year===yr),me=lg.find(x=>x.team===U);
 console.log(yr,'내 팀',me.pay,'상한',me.cap,me.kind,'n',me.n,'기금',me.fee,'drop',me.drop,'| AI 초과팀',lg.filter(x=>x.team!==U&&x.kind==='over').length,'미달팀',lg.filter(x=>x.kind==='under').length,'| 최대 AI',Math.max(...lg.filter(x=>x.team!==U).map(x=>x.pay)).toFixed(1));
 yrs.push({me,pv});
 if(infl){ok(me.kind==='over'&&me.n===y+1,'연속 초과 횟수 '+me.n);ok(Math.abs(me.fee-(me.pay-me.cap)*[.3,.5,1][y])<0.02,'기금액 '+me.fee);ok(me.drop===(y>=2),'3회 연속 지명권 하락 '+me.drop);ok(Math.abs(pv.fee-me.fee)<0.02,'미리보기=정산')}
 else ok(me.kind===null&&S.cbt.over[U]===0,'이후 정상 → 연속 초기화');
 ok(lg.filter(x=>x.team!==U&&x.kind==='over').length===0,'AI 구단은 상한 초과 없음');ok(lg.filter(x=>x.team!==U&&x.kind==='under').length<=2,'하한 미달 AI는 소수(실제 키움처럼 연봉이 낮은 팀)');
 if(S.off.step!=='review'){}
 L.finishContracts();L.buildDraft();
 if(y===2){const o=S.off.draft.order.slice(0,10);ok(o.indexOf(U)>=Math.min(S.off.draft.order.slice(0,10).length-1,0)&&o[9]===U||o.indexOf(U)===9,'1라운드 지명 하락: '+o.indexOf(U));}
 L.draftAutoRest&&L.draftAutoRest();L.finishDraft&&L.finishDraft();L.finishFA();L.startNewSeason();
 for(const p of L.players(U))p.contract.salary=Math.min(p.contract.salary,3);   // 다음 해 원복
}
// 저장 호환: 구버전(연봉 환산 없음)
const old=JSON.parse(L.save());delete old.calib.salK;delete old.calib.cbtK;delete old.cbt;for(const id in old.players){delete old.players[id].sal;old.players[id].foreign=false}for(const id in old.players){const c=old.players[id].contract;if(c)c.salary=Math.round((0.3+(c.salary-0.3)/2.2)*10)/10;}
const L2=League.load(JSON.stringify(old));ok(L2.S.calib.salK>1&&L2.S.cbt,'구버전 환산');const a2=T.map(t=>L2.cbtPay(t)).reduce((a,b)=>a+b,0)/10;ok(Math.abs(a2-111.05)<1.2,'환산 후 평균 '+a2.toFixed(1));
console.log(fail?'실패 '+fail:'모두 통과');process.exit(fail?1:0);
