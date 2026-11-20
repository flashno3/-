/* 계약 만료: FA 자격(등록일수)이 없는 국내 선수는 재계약하지 않아도 FA 시장에 나가지 않는다(구단 보유권, 시장가로 1년 자동 재계약) */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
for(const [seed,team] of [[5,'Lions'],[9,'Tigers']]){const L=League.create(base,team,seed);L.faAdvance(75);L.closeFA();const S=L.S;
 for(let y=0;y<3;y++){season(L);const before=new Set(S.players?Object.values(S.fa||[]).map(p=>p.id||p):[]);const fa0=new Set((S.fa||[]).map(x=>x.id||x));
  L.startOffseason();const off=S.off,exp=off.rep.expiring.slice();   // 내 팀: 직접 협상 대상(자격 없는 연봉 2억 이상·35세 이상 포함)을 일부러 재계약하지 않는다
  L.finishContracts();
  const added=(S.fa||[]).map(x=>S.players[x.id||x]).filter(p=>p&&!fa0.has(p.id));
  const bad=added.filter(p=>!p.foreign&&!L.faEligible(p)&&p.faInfo&&p.faInfo.from);
  ok(bad.length===0,`${S.year} 자격 없는 선수가 FA 시장으로: ${bad.map(p=>p.ko+'('+(p.fa&&p.fa.svc)+'/'+L.faReq(p)+')').join(',')}`);
  for(const id of exp){const p=S.players[id];if(p&&!p.foreign&&!L.faEligible(p))ok(p.team===S.userTeam&&p.contract.years>=1,`${p.ko} 자동 재계약`)}
  L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();L.faAdvance(75);L.closeFA();L.startNewSeason()}}
console.log('fares tests ok',n);
