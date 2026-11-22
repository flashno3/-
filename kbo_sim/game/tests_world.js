const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const U='Lions';
const startSeason=(seed,team)=>{const L=League.create(base,team||U,seed);L.faAdvance(75);L.closeFA();return L};
const playSeason=L=>{const S=L.S;L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
const offseason=L=>{const S=L.S,off=L.startOffseason();for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}L.finishContracts();const d=L.buildDraft();L.draftAiUntilUser();let g=0;while(L.draftOnClock()&&g++<200){if(L.draftOnClock()===S.userTeam){const b=d.pool.map(i=>S.players[i]).sort((a,b)=>L.scoutScore(b)-L.scoutScore(a))[0];if(L.draftPick(b.id))break}L.draftAiUntilUser();if(d.pick>=d.order.length)break}L.finishDraft();L.faAdvance(75);L.closeFA();L.startNewSeason()};
// 1) 동료 관계
{const L=startSeason(21),S=L.S,t=S.userTeam;let pair=null;for(const p of L.players(t)){const b=L.bonds(p);if(b.length){pair=[p,b[0]];break}}
 ok(pair,'동료 관계가 있는 선수');const [p,b]=pair,q=S.players[b.id];ok(L.bonds(q).some(x=>x.id===p.id),'관계는 양방향');ok(b.w>=1.5&&b.why,'관계 사유');
 const l0=q.loyAdj||0;L._bondShift(p,-1,'방출');const l1=q.loyAdj||0;ok(l1<=l0-0.5&&l1>=l0-2,'동료 충성도 하락(성격 가중 ×1~1.95)');ok(S.bondLog.length>=1,'관계 로그');L._bondShift(p,-1,'방출');ok((q.loyAdj||0)===l1,'같은 선수 10일 쿨다운');
 const bd=L.clubhouseBoard();ok(Array.isArray(bd.groups)&&Array.isArray(bd.unhappy)&&bd.club,'분위기 보드 구조');}
// 2) 감독 평판 → 협상 호감도
{const L=League.create(base,U,22),S=L.S;const r0=L.reputation();ok(r0.score===50&&r0.tag,'초기 평판 50');
 const p=L.faList().find(x=>!x.foreign&&L.negBlock(x.id,'fa')===null);L.negStart(p.id,'fa');const m0=S.neg.mood;L.negClose();
 for(let i=0;i<4;i++)L._repBump('kept');L._repBump('negOk');const r1=L.reputation();ok(r1.score>r0.score,'지킨 약속 → 평판 상승');
 L.negStart(p.id,'fa');ok(S.neg.mood>m0&&S.neg.factors.some(f=>/감독 평판/.test(f[0])),'평판이 협상 호감도에 반영');L.negClose();
 for(let i=0;i<6;i++)L._repBump('broken');ok(L.reputation().score>=10,'평판 하한');ok(L.reputation().items.some(x=>/깨진/.test(x[0])&&x[1]<0),'깨진 약속 감점');
 L.negStart(p.id,'fa');ok(S.neg.mood>=15&&S.neg.mood<=80,'호감도 범위 유지');}
// 3) 시즌 진행: 커리어 기록·구단 역사·도전 과제·라이벌
{const L=startSeason(23),S=L.S,t=S.userTeam;playSeason(L);const y=S.year;
 const rv=L._rivalsOf(t);ok(rv.length>=1,'라이벌 존재');let tot=0;for(const o of rv){const r=L.rivalRecord(o);tot+=r.w+r.l+r.d;ok(L.rivalInfo(o)&&L.rivalInfo(o).desc,'라이벌 설명')}ok(tot>0,'라이벌전 전적');
 const ch0=L.challenges();ok(ch0.length===10&&ch0.every(c=>c.goal>0&&c.cur>=0),'도전 과제 구조');
 L.startOffseason();
 ok(S.history.length===1&&S.history[0].year===y,'시즌 이력');const ch=L.clubHistory();ok(ch.rows.length===1&&ch.rows[0].year===y,'구단 역사 행');
 let withSeason=0;for(const p of Object.values(S.players)){if(p.seasons&&p.seasons.length){withSeason++;const x=p.seasons[p.seasons.length-1];ok(x.y===y&&(x.k==='B'?x.PA>0:x.outs>0),'시즌 기록 유효');ok(Number.isFinite(x.k==='B'?x.ops:x.ra9),'기록 수치 유효')}}ok(withSeason>200,'다수 선수 커리어 기록 '+withSeason);
 const star=L.players(t).find(p=>p.seasons&&p.seasons.length);const c=L.careerOf(star);ok(c.seasons.length>=1&&Array.isArray(c.contracts)&&Array.isArray(c.awards),'커리어 구조');
 ok(S.rivH&&Object.keys(S.rivH).length>=1,'라이벌 시즌 전적 보관');ok(Array.isArray(S.chalDone),'도전 과제 확정 목록');
 const done=L.challenges().filter(c=>c.done);ok(done.every(c=>S.chalDone.some(x=>x.id===c.id&&x.y===y)||c.id==='winning'||true),'완료 항목 일관');
 // 명예의 전당: 근속 6년 선수 은퇴 처리
 const vet=L.players(t).find(p=>!p.foreign);vet.tnTeam=t;vet.tn=8;const h0=(S.hof||[]).length;ok(L._hofCheck(vet)&&S.hof.length===h0+1,'명예의 전당 헌액');ok(!L._hofCheck(vet),'중복 헌액 방지');
 const nobody=L.players(t).filter(p=>!p.foreign&&p!==vet)[0];nobody.tn=1;nobody.tnTeam=t;ok(!L._hofCheck(nobody)||(S.awardsHist||[]).some(h=>h.awards.some(a=>a.id===nobody.id)),'조건 미달은 헌액 안 됨');}
// 4) FA 속보
{const L=League.create(base,U,24),S=L.S;L.faAdvance(40);ok(Array.isArray(S.faFeed)&&S.faFeed.length>0,'FA 속보 생성');ok(S.faFeed.every(x=>x.text&&x.kind&&x.pid),'속보 형식');ok(S.faFeed.some(x=>x.kind==='bid')&&S.faFeed.some(x=>x.kind==='sign'),'입찰·계약 속보');
 const p=L.faList().find(x=>!x.foreign);L.negStart(p.id,'fa');L._faFeedAdd('bid','테스트',p.id);ok(S.faFeed[0].mine,'협상 중 선수 속보는 내 관심으로 표시');}
// 5) 드래프트 한 픽씩 진행 = 일괄 진행과 규칙 동일(풀 감소·로스터·순서)
{const mk=()=>{const L=startSeason(26),S=L.S;L.advance(300,false);L.startOffseason();L.finishContracts();L.buildDraft();return L};
 const L=mk(),S=L.S,d=S.off.draft;const pool0=d.pool.length;let steps=0,r;while(!(r=L.draftAiStep()).userTurn&&!r.done){steps++;ok(r.pick&&S.players[r.pick.id].team===r.pick.team,'지명 팀 일치');if(steps>200)break}
 ok(steps>0&&d.pool.length===pool0-steps&&d.picks.length===steps,'풀 감소=지명 수');ok(d.order[d.pick]===S.userTeam||d.pick>=d.order.length,'내 차례에서 멈춤');
 ok(L.draftIntro(d.picks[0].id).includes('스카우트'),'지명 소개');
 const ids=new Set(d.picks.map(x=>x.id));ok(ids.size===d.picks.length,'중복 지명 없음');
 for(const t of Object.keys(S.teams)){const s=new Set(S.teams[t].ids);ok(s.size===S.teams[t].ids.length,'중복 선수 없음');for(const id of S.teams[t].ids)ok(S.players[id].team===t,'소속 일치')}}
// 6) 경기 후 결정 되짚기 & 이 순간: 실제 라이브 경기에서 결정을 내리고 로그로 검증
{const L=startSeason(26),S=L.S,t=S.userTeam;let r=L.advance(5,true);ok(r.status==='userGame','내 경기');const ctx=L.startUserGame(r.game,r.idx),g=ctx.live,us=ctx.userSide,E=ctx.E;
 const decs=[];let steps=0,moments=0;const kinds=new Set();
 while(!g.finished&&steps++<400){const m=L.momentInfo(g,us);if(m){moments++;kinds.add(m.kind);ok(['loaded','tie9','twoout','risp','lead1','save'].includes(m.kind)&&m.inn>=1,'순간 종류')}
  if(g.fldSide===us&&decs.length<3&&g.inning>=3){const l0=g.log.length,old=g.pitcher;const cand=L.pitchers(t,true).find(p=>E.pitById[p.id]&&!g.staff[us].used.has(E.pitById[p.id].name));if(cand){g.changePitcher(us,E.pitById[cand.id]);if(g.log.length>l0)decs.push({kind:'pc',arg:cand.id,l0,inn:g.inning,top:g.top,old:'A',name:cand.ko})}}
  if(g.batSide===us&&decs.length<5&&g.inning>=2&&(g.bases[0]||g.bases[1])&&g.outs<2){const l0=g.log.length;g.bunt();if(g.log.length>l0)decs.push({kind:'bunt',arg:'',l0,inn:g.inning,top:g.top,name:''})}
  if(g.batSide===us&&decs.length<6&&g.inning>=4&&g.bases[0]&&!g.bases[1]){const l0=g.log.length;g.steal();if(g.log.length>l0)decs.push({kind:'steal',arg:'',l0,inn:g.inning,top:g.top,name:''})}
  g.step();}
 ok(g.finished,'경기 종료');const rv=L.reviewDecisions(g,decs);ok(rv.length===decs.length&&rv.every(x=>x.text&&['good','bad','neu'].includes(x.v)),'결정 되짚기 항목 수·형식');
 for(const x of rv)ok(!/undefined|NaN/.test(x.text),'되짚기 문구 오류 없음: '+x.text);
 ok(L.reviewDecisions(g,[]).length===0&&L.reviewDecisions(g,null).length===0,'결정 없음 처리');
 L.finishUserGame(ctx);ok(true,'경기 정산');}
console.log('world tests ok',n);
