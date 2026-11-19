/* 투수 피로 회복: 선발은 한 경기 후 5일 안에 완전히 회복, 구원은 며칠 안에, 피로는 0~100 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
{const L=League.create(base,'Lions',5);L.faAdvance(75);L.closeFA();const S=L.S,t=S.userTeam;const sp=L.players(t).find(p=>p.type==='P'&&p.role==='SP'),rp=L.players(t).find(p=>p.type==='P'&&p.role!=='SP');
 sp.fat=95;rp.fat=20;const seq=[];for(let d=1;d<=6;d++){L._decayFatigue();seq.push(sp.fat)}ok(JSON.stringify(seq)==='[75,55,35,15,0,0]','선발 회복 '+seq);
 rp.fat=20;L._decayFatigue();L._decayFatigue();ok(rp.fat===4,'구원 1이닝 피로는 약 2.5일 '+rp.fat);L._decayFatigue();ok(rp.fat===0,'구원 3일 뒤 0');
 sp.fat=500;L._decayFatigue();ok(sp.fat===80,'기존 저장의 과도한 누적 값은 100으로 보정 후 회복 '+sp.fat);sp.fat=0;L._decayFatigue();ok(sp.fat===0,'0 미만 없음');}
// 시즌 중: 선발 로테이션이 돌아도 피로가 누적되지 않고, 다음 등판 전 회복
{const L=League.create(base,'Lions',7);L.faAdvance(75);L.closeFA();const S=L.S,t=S.userTeam;let maxFat=0,starts=0,sumBefore=0;const prev={},last={};
 for(let d=0;d<130;d++){L.advance(1,false);for(const p of L.players(t).filter(x=>x.type==='P')){ok(p.fat>=0&&p.fat<=100,`피로 0~100 ${p.ko} ${p.fat}`);maxFat=Math.max(maxFat,p.fat);
   if(p.role==='SP'&&p.lastStart>=0&&last[p.id]!==undefined&&p.lastStart!==last[p.id]){starts++;sumBefore+=prev[p.id]||0;ok((prev[p.id]||0)<=45,`선발 ${p.ko}의 등판 직전 피로 ${prev[p.id]} (회복되지 않음)`)}
   last[p.id]=p.lastStart;prev[p.id]=p.fat}}
 ok(starts>=40&&sumBefore/starts<=25,`등판 직전 평균 피로 ${Math.round(sumBefore/starts)} (${starts}회)`);ok(maxFat<=100,'최대 피로 '+maxFat);
 const tired=L.deskInfo().tired.filter(x=>x.p.role==='SP');ok(tired.length<=2,'선발이 상시 피로 목록에 있지 않음 '+tired.length);}
console.log('fatigue tests ok '+n);
