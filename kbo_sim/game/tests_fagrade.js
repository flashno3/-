/* FA 등급 산정 모집단(규약 제172조): 이 게임에서 FA로 계약한 선수는 계약이 끝날 때까지 순위 모집단에서 제외 → 해마다 쌓이는 고액 FA 계약자가 상위 순위를 채워 신규 FA가 C로만 나오는 현상 방지 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9),S=L.S;L.faAdvance(75);L.closeFA();
// 모집단 정의
{const rk=L._salRanks();for(const t of ['Bears','Lions'])for(const p of L.players(t)){const out=p.contract&&(p.contract.fa||p.contract.years>1);ok((rk.team[p.id]===undefined)===!!out,`${p.ko} 모집단 ${out}`)}
 const L0=League.create(base,'Lions',11);ok(!Object.values(L0.S.players).some(p=>p.contract&&p.contract.fa),'시작 시점의 실제 FA 계약은 표시하지 않음(실제 공시와 일치하는 기존 모집단 유지)');
 const g=n=>Object.values(L0.S.players).find(p=>p.ko===n&&p.fah);ok(L0.faGrade(g('김호령'))==='C','김호령 C(연봉 61위, 실제 공시)');}
let ab=0,tot=0;
for(let y=0;y<3;y++){L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 const off=L.startOffseason();for(const id of off.rep.expiring.slice()){if(L.ovr(S.players[id])>=48)L.resign(id)}L.finishContracts();
 const fa=L.faList().filter(p=>p.faInfo&&p.faInfo.grade);const gr=fa.map(p=>p.faInfo.grade);ok(gr.every(x=>'ABC'.includes(x)),'등급 값');
 if(S.year>=2028||y>=1){ab+=gr.filter(x=>x!=='C').length;tot+=gr.length}
 // 신규 FA 계약은 FA 계약 표시가 붙는다
 const cand=fa.find(p=>!p.foreign&&p.faInfo.from!=='Lions');if(cand){const e=L.signFA(cand.id,2);if(!e)ok(cand.contract.fa===true,'FA 계약 표시')}
 L.buildDraft();L.draftAutoRest();L.finishDraft();L.faAdvance(75);L.closeFA&&L.closeFA();L.startNewSeason();}
ok(tot>=10&&ab/tot>=0.3,'2년차 이후 신규 FA 중 A·B 비율 '+ab+'/'+tot);
console.log('fagrade tests ok',n,'A·B',ab+'/'+tot);
