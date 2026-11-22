/* 트레이드: 다대일 묶음 가치·부상 대체 외국인 양도 금지·외국인 한도 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9);L.faAdvance(75);L.closeFA();L.advance(20,false);const S=L.S,U=S.userTeam,AI='Bears';
// 1) 묶음 가치: 한 명이면 거의 그대로, 여러 명은 합보다 낮다
{const ps=L.players(U).filter(p=>!p.foreign).sort((a,b)=>L.marketValue(b)-L.marketValue(a)).slice(0,4);
 const one=L.tradeLot([ps[0]],AI),v0=L.tradeValue(ps[0],AI);ok(Math.abs(one-(v0-0.5))<1e-9,'1명 묶음 = 가치−대체수준');
 const sum=ps.reduce((a,p)=>a+L.tradeValue(p,AI),0),lot=L.tradeLot(ps,AI);ok(lot<sum-0.5&&lot>0,'4명 묶음은 합보다 낮음 '+lot.toFixed(1)+' < '+sum.toFixed(1));
 ok(L.tradeLot([],AI)===0,'빈 묶음 0');}
// 2) 다대일: 가치 합만 맞춘 3대1은 거절, 같은 가치의 1대1은 수락
{const star=L.players(AI).filter(p=>!p.foreign&&p.rookie!==S.year).sort((a,b)=>L.marketValue(b)-L.marketValue(a))[0],vs=L.tradeValue(star,AI);
 const need1=(L.tradeLot([star],AI))*1.12*(L.ovr(star)>=65?1.25:1)+0.1+0.5;   // 1명으로 낼 때 필요한 선수 1명의 가치
 const mine=L.players(U).filter(p=>!p.foreign&&p.rookie!==S.year&&L.marketValue(p)<need1).sort((a,b)=>L.marketValue(b)-L.marketValue(a));
 // 합이 need를 넘도록 3명 선택
 let pick=[],sumv=0;for(const p of mine){if(pick.length<3){pick.push(p);sumv+=L.tradeValue(p,AI)}}
 if(pick.length===3&&sumv>=(vs*1.12*(L.ovr(star)>=65?1.25:1)+0.1)){const ev=L.evaluateTrade(AI,pick.map(p=>p.id),[star.id]);ok(!ev.ok,'합만 맞춘 3대1은 거절 (합 '+sumv.toFixed(1)+' ≥ 단순 기준 '+(vs*1.12+0.1).toFixed(1)+', 묶음 '+ev.vGive+' < '+ev.need+')')}
 else console.log('(3대1 후보 구성 불가 — 생략)');}
// 3) 1대1은 기존과 거의 같은 기준: 가치가 충분히 높은 1명이면 수락
{const star=L.players(AI).filter(p=>!p.foreign&&p.rookie!==S.year&&L.ovr(p)<65).sort((a,b)=>L.marketValue(a)-L.marketValue(b))[3];const give=L.players(U).filter(p=>!p.foreign&&p.rookie!==S.year).sort((a,b)=>L.marketValue(b)-L.marketValue(a))[0];
 const ev=L.evaluateTrade(AI,[give.id],[star.id]);ok(typeof ev.ok==='boolean'&&ev.vGive!==undefined,'1대1 평가 결과 구조');
 const old=L.tradeValue(give,AI)>=L.tradeValue(star,AI)*1.12+0.1;ok(ev.ok===old||Math.abs(L.tradeValue(give,AI)-(L.tradeValue(star,AI)*1.12+0.1))<0.3,'1대1 판정은 기존 기준과 거의 같음')}
// 4) 대체 외국인·재활 외국인 양도 금지
{const f=L.foreignOf(U).find(p=>!p.aq);f.rehab={sub:'X',day:0};const t=L.players(AI).find(p=>!p.foreign);const ev=L.evaluateTrade(AI,[f.id],[t.id]);ok(!ev.ok&&/대체/.test(ev.why),'재활 외국인 양도 불가: '+ev.why);delete f.rehab;
 const sub=L.players(AI).find(p=>p.foreign);sub.sub={for:'Y'};const g=L.players(U).find(p=>!p.foreign);const ev2=L.evaluateTrade(AI,[g.id],[sub.id]);ok(!ev2.ok&&/대체/.test(ev2.why),'대체 외국인 영입 불가: '+ev2.why);delete sub.sub}
// 5) 외국인 한도: 일반 외국인 3명인 팀에 내 일반 외국인을 일방 이전하면 한도 초과
{const mineF=L.foreignOf(U).filter(p=>!p.aq&&!p.sub);const aiGen=L.foreignOf(AI).filter(p=>!p.aq&&!p.sub);if(mineF.length&&aiGen.length===3){const other=L.players(AI).find(p=>!p.foreign&&p.rookie!==S.year);const ev=L.evaluateTrade(AI,[mineF[0].id],[other.id]);ok(!ev.ok&&/외국인/.test(ev.why),'일반 외국인 한도 초과: '+ev.why)}}
console.log('trade2 tests ok',n);
