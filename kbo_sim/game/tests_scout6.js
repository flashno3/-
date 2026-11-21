/* 스카우트 적중률 정산 · 드래프트 보드(태그·필요 포지션·AI 예상 순위) */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
const toDraft=(seed,hire)=>{const L=League.create(base,'Lions',seed);L.faAdvance(75);L.closeFA();const S=L.S;L.ensureProspects();L._scoutMarket();if(hire){S.fin.teams[S.userTeam].lastRev+=200;for(const c of S.scoutMkt.slice(0,hire))L.scoutHire(c.id);L.scoutAutoWatch(24,1)}
 season(L);L.startOffseason();for(const id of S.off.rep.expiring.slice())L.resign(id);L.finishContracts();L.buildDraft();return L};
// A5 적중률 정산
{const L=toDraft(5,3),S=L.S;ok(L.scoutHistory().list.length===0,'정산 전 이력 없음');L.draftAutoRest();L.finishDraft();const h=L.scoutHistory();ok(h.list.length===3&&h.years.length===1&&h.years[0].y===S.year,'정산 후 이력 '+h.list.length);
 for(const x of h.list){ok(x.n>=3&&x.err>0&&x.err<25&&['우수','보통','미흡'].includes(x.grade)&&x.active,'스카우트별 '+JSON.stringify(x));ok(Math.abs(x.bias)<=x.err+1e-9,'편향 ≤ 평균 오차')}
 ok(h.years[0].err>0&&h.years[0].n>=10,'내 추정 정확도');ok(S.news.slice(0,12).some(x=>/적중률 정산/.test(x.text)),'정산 소식');ok(!JSON.stringify(h).includes('peak'),'실제 정점 비노출');
 L.finishDraft?0:0;const before=JSON.stringify(S.scoutHist);S.off.draft.pool=[];L._scoutSettle();ok(JSON.stringify(S.scoutHist)===before,'같은 해 중복 정산 없음')}
// 스카우트가 없으면 이력도 없음, 해고된 스카우트는 이전으로 표시
{const L=toDraft(7,0);L.draftAutoRest();L.finishDraft();ok(L.scoutHistory().list.length===0,'관찰 없으면 이력 없음');
 const L2=toDraft(9,2),S2=L2.S;const id=S2.scouts[0].id;L2.scoutFire(id);L2.draftAutoRest();L2.finishDraft();const h=L2.scoutHistory();const f=h.list.find(x=>x.id===id);ok(f&&!f.active&&h.list[h.list.length-1].id===id||!f.active,'해임한 스카우트도 기록 유지(이전)')}
// A4 태그·필요 포지션·AI 예상 순위
{const L=toDraft(11,2),S=L.S,d=S.off.draft;const pool=d.pool.map(id=>S.players[id]);
 const needs=L.draftNeeds();ok(Object.keys(needs).join()==='C,IF,OF,SP,RP'&&Object.values(needs).every(x=>x.need>=0&&x.need<=1&&['high','mid','low'].includes(x.level)),'필요도 구성');
 let tagged=0;for(const p of pool.slice(0,40)){const t=L.draftTags(p);ok(Array.isArray(t)&&t.every(x=>x.label&&x.k),'태그 형식');if(t.length)tagged++}ok(tagged>=20,'태그 부여 '+tagged);
 const ex=L.draftExpect(),ranks=Object.values(ex).map(x=>x.rank).sort((a,b)=>a-b);ok(ranks.length===pool.length&&ranks[0]===1&&ranks[ranks.length-1]===pool.length,'AI 순위는 1..N');ok(Object.values(ex).every(x=>['now','likely','maybe','gone',''].includes(x.avail)),'가능성 구분');
 // 필요 포지션 가중: 끄면 기존 순서, 켜면 필요한 그룹 후보 점수가 오른다
 const p0=pool[0];ok(L.draftBoardScore(p0)===L.userScore(p0),'끄면 기존 점수');L.setDraftNeedOn(true);const hi=Object.entries(needs).sort((a,b)=>b[1].need-a[1].need)[0];const pp=pool.find(p=>L.draftGroupOf(p)===hi[0]);
 ok(hi[1].need>0?L.draftBoardScore(pp)>L.userScore(pp)&&L.draftBoardScore(pp)-L.userScore(pp)<=4+1e-9:true,'필요 포지션 가중 ≤ +4');L.setDraftNeedOn(false);
 // 자동 지명도 같은 점수 기준(끄면 결과 동일)
 const L2=toDraft(11,2);L2.draftAutoRest();L.draftAutoRest();ok(JSON.stringify(L.S.off.draft.picks.map(x=>x.id))===JSON.stringify(L2.S.off.draft.picks.map(x=>x.id)),'끈 상태의 자동 지명은 기존과 동일')}
console.log('scout6 tests ok',n);
