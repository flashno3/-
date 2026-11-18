const fs=require('fs');const assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
// 1) 달력: 1월 1일 개시, 75일 한도, 개막 전 마감
{const L=League.create(base,'Lions',11),S=L.S,m=S.faMkt;
 ok(m&&m.day===0&&L.faDateStr(0)==='1월 1일'&&L.faDateStr(31)==='2월 1일'&&L.faDateStr(75)==='3월 17일','FA 달력');
 ok(L.faAdvance(1)===1&&m.day===1&&S.day===0,'1일 진행');ok(L.faAdvance(500)===74&&m.day===75&&L.faDaysLeft()===0,'75일에서 정지');}
// 2) 경쟁 입찰: 낮은 제시는 보류, 이기는 제시는 즉시 계약, 개막 시 마감
{let tested=0,lose=0,win=0;
 for(const seed of [3,4,5,6,7,8]){const L=League.create(base,'Lions',seed),S=L.S;S.fin.teams.Lions.lastRev+=200;
  for(let d=0;d<30&&!tested;d++){L.faAdvance(1);
   for(const id of Object.keys(S.faMkt.bids)){const p=S.players[id];if(!p||p.team!=='FA'||!p.faInfo||!p.faInfo.grade)continue;const bi=L.faBidInfo(id);if(!bi.best)continue;
    const req=L.faTerms(p,'Lions').req(bi.best.y),low=L.faDefaultOffer(p,'Lions',bi.best.y);
    // 요구액을 겨우 넘기는 제시(원소속 아님·계약금 0) → 경쟁 점수 열세면 보류
    const weak={years:bi.best.y,salary:Math.ceil(req*10)/10,bonus:0};
    const r=L.signFA(id,weak);
    if(typeof r==='string'&&r.startsWith('보류')){lose++;ok(S.faMkt.pend[id]&&p.team==='FA','보류 제시는 선수를 묶지 않음');
      const b=L.faBeat(p,'Lions',bi.best.y);ok(L._offerScore(p,'Lions',b.years,b.salary,b.bonus)>bi.bestScore,'faBeat는 최고 입찰 점수를 넘는다');
      const r2=L.signFA(id,{years:b.years,salary:b.salary,bonus:b.bonus});ok(r2===null&&p.team==='Lions'&&!S.faMkt.bids[id]&&!S.faMkt.pend[id],'이기는 제시는 즉시 계약 '+r2);win++;tested=1;break}
    else if(r===null){/* 입찰보다 높아 곧바로 계약 */tested=0;}
   }}}
 ok(lose>0&&win>0,'경쟁 입찰 보류/역전 시나리오 발생 '+lose+'/'+win);}
// 3) 보류 제시 만료·AI 수락, 마감 후 FA 풀 정리
{const L=League.create(base,'Lions',9),S=L.S;L.faAdvance(20);const before=L.faList().filter(p=>p.faInfo&&p.faInfo.grade).length;
 L.closeFA();ok(S.faMkt===null&&S.phase==='preseason','개막 시 FA 마감');
 ok(L.faList().length<=70,'FA 풀 정리');ok(Object.values(S.teams).every(t=>t.ids.length<=130),'로스터 한도');
 for(const t of Object.keys(S.teams))ok(L._faCount(t)<=3,t+' 외부 FA 3명 한도');}
// 4) 오프시즌에도 같은 구조
{const L=League.create(base,'Lions',12),S=L.S;L.advance(300,false);const P=L.startPostseason();let k=0;while(!P.done&&k++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 L.startOffseason();L.resignAll();L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();
 ok(S.faMkt.day===0&&S.phase==='offseason','오프시즌 FA 1월 1일');L.faAdvance(30);ok(S.faMkt.day===30,'30일 진행');L.closeFA();ok(S.faMkt.closed&&L.faAdvance(5)===0,'마감 후 진행 불가');L.startNewSeason();ok(S.faMkt===null,'새 시즌에 FA 협상 상태 정리');}
console.log('bid tests ok',n);
