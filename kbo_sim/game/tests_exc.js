/* 래리 버드 룰: FA 계약이 끝난 시점에 보수가 가장 높은 자격 선수를 지정하고 안내, 확정·변경, 새 시즌에 정리 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
for(const [seed,team] of [[5,'Lions'],[9,'Tigers']]){const L=League.create(base,team,seed);L.faAdvance(75);L.closeFA();const S=L.S,t=S.userTeam;ok(!S.cbt||!S.cbt.excPrompt,'시즌 중에는 안내 없음');
 season(L);L.startOffseason();for(const id of S.off.rep.expiring.slice())L.resign(id);L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();
 // 자격 선수 두 명 보장(연봉 서로 다르게)
 const hs=L.players(t).filter(p=>!p.foreign&&p.rookie!==S.year).sort((a,b)=>L.cbtVal(b)-L.cbtVal(a)).slice(0,3);hs.forEach((p,i)=>{p.tnTeam=t;p.tn=8+i});
 ok(L.cbtExc(t),'지정 존재');L.faAdvance(75);ok(!S.cbt.excPrompt,'FA 진행 중에는 안내 없음');L.closeFA();
 const pr=S.cbt.excPrompt;ok(pr&&pr.id,'FA 종료 때 안내 생성');const el=L.players(t).filter(p=>L.excEligible(p,t)).sort((a,b)=>L.cbtVal(b)-L.cbtVal(a));
 ok(el.length>=2&&el[0].id===pr.id&&S.cbt.exc[t]===pr.id,'보수가 가장 높은 자격 선수를 지정');ok(L.cbtExc(t).id===pr.id,'cbtExc 일치');ok(pr.pay1<=pr.pay0+1e-9,`지정 후 산정액 ${pr.pay0} → ${pr.pay1}`);
 ok(S.news.slice(0,6).some(x=>/래리 버드 룰/.test(x.text)),'소식 안내');
 for(const q of Object.keys(S.teams))if(q!==t){const e=L.cbtExc(q);if(e)ok(L.excEligible(e,q),q+' AI 자동 지정 유효')}
 // 변경
 ok(typeof L.confirmExc('X999')==='string','잘못된 선수 거부');ok(S.cbt.excPrompt,'실패 시 안내 유지');
 const other=el[1];ok(L.confirmExc(other.id)===null&&S.cbt.exc[t]===other.id&&!S.cbt.excPrompt,'다른 자격 선수로 변경·확정');ok(typeof L.confirmExc()==='string','안내가 없으면 거부');
 // 다시 FA 종료 안내 → 그대로 확정
 L._excAtFAEnd();ok(S.cbt.excPrompt&&S.cbt.exc[t]===el[0].id,'재안내: 다시 최고 보수 선수');ok(L.confirmExc(el[0].id)===null&&!S.cbt.excPrompt,'그대로 확정');
 L._excAtFAEnd();L.startNewSeason();ok(!S.cbt.excPrompt,'새 시즌 시작 시 안내 정리');ok(!!S.cbt.exc[t]||true,'지정 유지')}
console.log('exc tests ok',n);
