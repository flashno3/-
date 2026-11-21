/* 희생번트: 어떤 결과(성공·실패·야수선택·번트안타)에서도 주자가 사라지거나 생기지 않는다 — 타자 + 기존 주자 = 남은 주자 + 아웃 + 득점 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',5);L.faAdvance(75);L.closeFA();let r;for(let i=0;i<60;i++){r=L.advance(1,true);if(r.status==='userGame')break}
const E=L.engine();
for(const [name,x] of [['성공',0.3],['실패',0.7],['야수선택',0.87],['번트안타',0.95]])for(let mask=1;mask<8;mask++)for(const outs of [0,1]){
 const ctx=L.startUserGame(r.game,r.idx),g=ctx.live;const st=ctx.userSide;   // 사용자 팀이 공격하는 반이닝까지 진행
 let k=0;while(g.batSide!==st&&!g.finished&&k++<400)g.step();ok(g.batSide===st,'공격 차례');
 const bats=g.L[st],h=g.h;h.outs=outs;h.bases=[mask&1?bats[1]:null,mask&2?bats[2]:null,mask&4?bats[3]:null];
 const before=h.bases.filter(Boolean).length,o0=h.outs,r0=h.runs;let seq=[x,0.5,0.5,0.5,0.5,0.5];g.rng={random:()=>seq.length?seq.shift():0.5,gauss:()=>0,choice:a=>a[0]};
 g.bunt();const hh=g.h;const after=(hh===h?h.bases:[]).filter(Boolean).length;
 if(hh===h){const out=h.outs-o0,run=h.runs-r0;ok(before+1===after+out+run,`${name} 주자 ${mask.toString(2)} ${outs}아웃: 전 ${before}+타자 → 후 ${after}+아웃 ${out}+득점 ${run}`);
  if(name==='야수선택'){ok(h.bases[0]===bats[0],'타자는 1루');ok(out===1,'아웃 1');}}
}
console.log('bunt tests ok',n);
