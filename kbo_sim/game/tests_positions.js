const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
const pn={C:'포','1B':'1','2B':'2','3B':'3',SS:'유',LF:'좌',CF:'중',RF:'우',DH:'지'};
let bad=0,tot=0,worst=0;const L=League.create(base,'Lions',2027);
function report(tag){for(const t of Object.keys(L.S.teams)){const lu=L.bestLineup(L.hitters(t,t===L.S.userTeam));let b=0;
 const row=lu.map(x=>{const p=L.S.players[x.id],lv=L.fitLevel(p,x.pos);tot++;if(lv===0){bad++;b++}return p.ko+'/'+pn[x.pos]+(lv===2?'':lv===1?'△':'✖')}).join(' ');worst=Math.max(worst,b);if(tag)console.log(t.padEnd(8),row)}}
const t0=Date.now();report(true);console.log('라인업 계산 10팀',Date.now()-t0,'ms | 부적합 배치',bad,'/',tot,'| 한 팀 최대',worst);
// 중복 선수·중복 포지션 검사
for(const t of Object.keys(L.S.teams)){const lu=L.bestLineup(L.hitters(t,t===L.S.userTeam));if(new Set(lu.map(x=>x.id)).size!==9||new Set(lu.map(x=>x.pos)).size!==9)console.log('중복!',t)}
// 시즌/오프시즌 후에도 유지되는지
for(let y=0;y<3;y++){L.advance(300,false);L.startOffseason();L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.finishFA();L.startNewSeason();}
bad=0;tot=0;worst=0;report(false);console.log('3시즌 후 부적합',bad,'/',tot,'| 한 팀 최대',worst);
// 엔진에 전달되는 수비 기록이 숙련 포지션만인지
const E=L.engine();let leak=0;for(const b of E.bats()){for(const pos in b.fr){const p=L.S.players[b.id];if(!((p.gs[pos]||0)>0||p.pos===pos))leak++}}console.log('엔진 수비 기록 중 미숙련 포지션',leak);
// 낯선 포지션 페널티가 실제 경기에 영향을 주는지: 같은 라인업에서 수비 위치만 일부러 어긋나게 배치해 득실 비교
const me='Lions',spec=L.bestLineup(L.hitters(me,true));const goodDM=E.defMods(me,E.makeLineup(spec).assign,true);
const rot=spec.map(x=>({id:x.id,pos:x.pos}));const ps=rot.filter(x=>x.pos!=='DH');const bad2=rot.map(x=>x);for(let i=0;i<ps.length;i++){const a=bad2.findIndex(y=>y.id===ps[i].id);const nxt=ps[(i+1)%ps.length];bad2[a]={id:ps[i].id,pos:nxt.pos}}
const badDM=E.defMods(me,E.makeLineup(bad2).assign,true);console.log('수비 보정(BABIP 이동, 클수록 수비가 나쁨→) 정상배치',goodDM[0].toFixed(4),'엉터리배치',badDM[0].toFixed(4),'| 실책 배수',goodDM[1].toFixed(2),'→',badDM[1].toFixed(2));
