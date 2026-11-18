const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
// 1) 기본값(이전 동작과 동일)·설정 검증
{const L=mk(3);const P=L.plan();ok(P.starter==='normal'&&P.closer==='ninth'&&!P.contact&&!P.infIn&&!P.hold&&!P.careful&&P.hlFrom===7,'기본 계획');
 ok(L.setPlan('starter','quick')&&L.setPlan('contact',true)&&L.setPlan('hlFrom',8)&&!L.setPlan('starter','x')&&!L.setPlan('zzz',1),'계획 설정 검증');}
// 2) 선발 교체 시점: 빠르게 < 기본 < 오래 (첫 투수 교체 이닝 평균)
{const avg=pl=>{const L=mk(5,'Lions'),S=L.S;L.setPlan('starter',pl);let sum=0,c=0,g=0;while(c<40&&g++<120){const r=L.advance(1,true);if(r.status!=='userGame'){if(r.status==='seasonEnd')break;continue}
   const ctx=L.startUserGame(r.game,r.idx),us=ctx.userSide,sp=ctx.live.staff[us].cur;let first=null;L.playAuto(ctx,gm=>{if(first===null&&gm.staff[us].cur!==sp)first=gm.inning+(gm.top===(us==='away')?0:0);return false});sum+=first===null?9:first;c++;L.finishUserGame(ctx)}return sum/c};
 const q=avg('quick'),nm=avg('normal'),lg=avg('long');ok(q<nm&&nm<lg,'첫 투수 교체 이닝: 빠르게 '+q.toFixed(2)+' < 기본 '+nm.toFixed(2)+' < 오래 '+lg.toFixed(2));}
// 3) 상황 작전: 켜면 컨택·전진수비·견제가 실제로 발동, 끄면 없음
{const count=on=>{const L=mk(6,'Lions');for(const k of ['contact','infIn','hold','careful'])L.setPlan(k,on);const c={contact:0,inf:0,hold:0,careful:0};let g=0,games=0;while(games<60&&g++<200){const r=L.advance(1,true);if(r.status!=='userGame'){if(r.status==='seasonEnd')break;continue}
   const ctx=L.startUserGame(r.game,r.idx),gm=ctx.live,us=ctx.userSide,orig=gm.setTactic.bind(gm);gm.setTactic=(s,k,v)=>{if(s===us){if(k==='bat'&&v==='contact')c.contact++;if(k==='inf'&&v)c.inf++;if(k==='hold'&&v)c.hold++;if(k==='pit'&&v==='careful')c.careful++}return orig(s,k,v)};L.playAuto(ctx);L.finishUserGame(ctx);games++}return c};
 const on=count(true),off=count(false);ok(on.contact>0&&on.inf>0&&on.hold>0,'작전 발동 '+JSON.stringify(on));ok(off.contact+off.inf+off.hold+off.careful===0,'끄면 작전 없음 '+JSON.stringify(off));}
// 4) 하이라이트: 접전 전까지 자동, 이후 멈춤(직접 지휘 전환), 경기 종료 가능
{const L=mk(7,'Lions');let stopped=0,finished=0,g=0;while(stopped+finished<25&&g++<150){const r=L.advance(1,true);if(r.status!=='userGame'){if(r.status==='seasonEnd')break;continue}
  const ctx=L.startUserGame(r.game,r.idx),us=ctx.userSide,done=L.playAuto(ctx,gm=>L.isHighlight(gm,us));if(done){finished++;ok(ctx.live.finished,'접전 없이 종료');L.finishUserGame(ctx)}else{stopped++;const gm=ctx.live,opp=us==='home'?'away':'home';ok(!gm.finished&&gm.inning>=7&&Math.abs(gm.score[us]-gm.score[opp])<=2,'하이라이트 멈춤 조건 '+gm.inning+' '+JSON.stringify(gm.score));
   L.playAuto(ctx);ok(ctx.live.finished,'멈춘 뒤 이어서 종료 가능');L.finishUserGame(ctx)}}
 ok(stopped>=3&&finished>=3,'하이라이트 멈춤/종료 모두 발생 '+stopped+'/'+finished);}
console.log('plan tests ok',n);
