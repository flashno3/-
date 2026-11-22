/* FA 보상 선택: 내가 고를 때까지 자동 처리하지 않는다 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9),S=L.S,U=S.userTeam;
let ev=null;for(let d=1;d<=75&&!ev;d++){L.faAdvance(1);ev=L.compOpen()[0]}
ok(ev&&ev.type==='comp'&&ev.status==='open','내 선수가 FA로 떠나면 보상 선택 이벤트가 열린다');ok(ev.exp>1e8,'만료 없음');ok(ev.choices.some(c=>c.k==='money')&&ev.choices.some(c=>c.k.startsWith('p:')),'보상선수·보상금 선택지');
ok((S.compLog||[]).some(c=>c.pending&&c.from===U),'정산 대기 기록');
const id=ev.id;L.closeFA();ok(L.compOpen().some(e=>e.id===id),'FA 마감 후에도 열려 있음');
L.advance(100,false);ok(L.compOpen().some(e=>e.id===id),'100경기 진행해도 자동 처리되지 않음(이전에는 30일 뒤 기본 선택 자동 적용)');
const r=L.resolveEvent(id,'money',false);ok(r&&r.ok!==false&&!L.compOpen().some(e=>e.id===id),'직접 고르면 정산');ok((S.compLog||[]).some(c=>c.id===ev.data.fa&&!c.pending),'정산 기록');
console.log('compask tests ok',n);
