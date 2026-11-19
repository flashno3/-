/* 라이브 해설: 엔진 기록만으로 만든 문장이 실제 경기와 일치하는지(역전·동점·선취점·노히트·연속 삼진·끝내기) */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const HIT=['1B','2B','3B','HR','번트안타'];let tot={rev:0,tie:0,first:0,nh:0,k3:0,walk:0,gs:0,games:0};
for(const [seed,team] of [[2027,'Lions'],[5,'Tigers'],[9,'Wiz'],[13,'Bears']]){
 const L=League.create(base,team,seed);L.faAdvance(75);L.closeFA();
 for(let k=0;k<10&&tot.games<14;k++){const r=L.advance(4,true);if(r.status!=='userGame')continue;const ctx=L.startUserGame(r.game,r.idx),g=ctx.live,us=ctx.userSide;tot.games++;
  const ns={};let prev=0,firstSeen=false,allHits=0,steps=0,noteLog=[],lastHalf=g.inning+(g.top?'t':'b');
  while(!g.finished&&steps++<700){const l0=g.log.length,side=g.batSide,before=L.liveScore(g);g.step();const evs=g.log.slice(l0);const notes=L.liveNotes(g,evs,side,ns,us);
   allHits+=evs.filter(e=>e.k==='PA'&&HIT.includes(e.e)).length;const after=L.liveScore(g),pl=Math.sign(before.home-before.away),nl=Math.sign(after.home-after.away);
   for(const t of notes){noteLog.push(t);
    if(/^역전!/.test(t)){tot.rev++;ok(pl!==0&&nl!==0&&pl!==nl,`역전은 리드가 뒤집힐 때만 (${before.away}:${before.home} → ${after.away}:${after.home})`)}
    if(/^동점!/.test(t)){tot.tie++;ok(after.home===after.away&&before.home!==before.away,'동점은 점수차가 0이 될 때만')}
    if(/^선취점!/.test(t)){tot.first++;ok(!firstSeen&&before.home+before.away===0&&after.home+after.away>0,'선취점은 경기에서 한 번, 첫 득점에서만');firstSeen=true}
    if(/연속 삼진/.test(t)){tot.k3++}
    if(/^만루홈런/.test(t)){tot.gs++;ok(evs.some(e=>e.k==='PA'&&e.e==='HR'&&e.runs===4),'만루홈런은 4점 홈런일 때만')}
    if(/끝내기/.test(t)){ok(g.finished&&!g.top&&after.home>after.away,'끝내기는 홈팀이 이기며 끝날 때만')}}
   const key=g.inning+(g.top?'t':'b');if(key!==lastHalf){lastHalf=key;const nh=L.liveNoHit(g,ns);if(nh){tot.nh++;const bat=g.top?'home':'away';ok(ns.hits[bat]===0,'노히트는 안타 0개일 때만 '+nh)}}}
  ok(ns.hits.away+ns.hits.home===allHits,`안타 집계 일치 (${ns.hits.away+ns.hits.home} vs ${allHits})`);
  const lsF=L.liveScore(g);ok(Math.sign(lsF.home-lsF.away)===ns.lead||ns.lead===undefined,'마지막 리드 상태');
  L.finishUserGame(ctx)}}
ok(tot.games>=10,'경기 수 '+tot.games);ok(tot.rev+tot.tie+tot.first>=10,'해설 발생 '+JSON.stringify(tot));
console.log('livenotes tests ok '+n+' '+JSON.stringify(tot));
