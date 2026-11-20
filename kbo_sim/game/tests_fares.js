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
// 부상 중인 외국인은 영입해도 1군 엔트리에 오르지 않는다(부상자 명단 대기)
{const L=League.create(base,'Lions',5);L.faAdvance(5);const S=L.S,t=S.userTeam;const p=Object.values(S.players).find(q=>q.foreign&&q.team==='FA'&&q.type==='P');
 const now=L.todayN();p.inj={dx:'어깨 통증',ret:new Date((now+40)*864e5).toISOString().slice(0,10),retN:now+40,apply:true};ok(L.isInj(p),'부상 상태');
 S.fa=S.fa.filter(x=>x!==p.id);p.team=t;S.teams[t].ids.push(p.id);L._foreignJoin(p);ok(!p.active,'부상 외국인은 1군 등록 안 됨');ok(L.players(t).filter(q=>q.active&&L.isInj(q)).length===0,'1군에 부상자 없음');
 p.inj.retN=now-1;p.inj.ret='2000-01-01';ok(!L.isInj(p));L._foreignJoin(p);ok(p.active||L.players(t).filter(x=>x.active).length>=26,'건강하면 등록')}
// 협상: 호감도가 오르면 화면의 '선수 기대 연봉 범위'와 실제 요구액이 함께 내려간다
{const L=League.create(base,'Lions',5);L.faAdvance(5);const S=L.S;const mine=L.foreignOf('Lions').find(q=>!q.aq&&!q.sub);const p=Object.values(S.players).find(q=>q.foreign&&q.team==='FA'&&!q.aq&&L.askSalary(q)>2);
 ok(L.negStart(p.id,'foreign',{replace:mine.id}).ok,'협상 시작');const at=m=>{S.neg.mood=m;L._negRangeSync(S.neg);return {r:S.neg.range.slice(),req:L._negEval(p,{years:1,salary:1,bonus:0},'foreign').req}};
 const lo=at(20),hi=at(90);ok(hi.r[1]<lo.r[1]&&hi.r[0]<lo.r[0],'호감도↑ → 범위↓ '+lo.r+' → '+hi.r);ok(hi.req<lo.req,'호감도↑ → 요구액↓ '+lo.req+' → '+hi.req)}
console.log('fares tests ok',n);
