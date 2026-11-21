/* 30세 이상 투수 보직(선발/구원) 직접 지정 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9);L.faAdvance(75);L.closeFA();L.advance(20,false);const S=L.S,U=S.userTeam;
const farmP=()=>L.players(U).filter(p=>p.type==='P'&&!p.active&&!L.isInj(p));
// 30세 이상 2군 구원 투수
let old=farmP().filter(p=>p.age>=30&&p.role!=='SP').sort((a,b)=>b.stamina-a.stamina)[0];
if(!old){old=farmP().find(p=>p.role!=='SP');old.age=33}
ok(L.setRole(old.id,'SP')===null&&old.role==='SP'&&old.roleMan==='SP','선발 지정');
L.assignUsage(U,true);ok(old.f&&old.f.GS>0,'2군 선발 로테이션에 편성 GS='+(old.f&&old.f.GS));
ok(L.setRole(old.id,'RP')===null&&old.role==='RP','구원 지정');L.assignUsage(U,true);ok(!old.f||!(old.f.GS>0),'구원 지정 시 선발 후보에서 제외');
// 30세 미만·타자·타 구단 거절
const young=farmP().find(p=>p.age<30);if(young)ok(/30세 미만/.test(L.setRole(young.id,'SP')),'30세 미만 거절');
const bat=L.players(U).find(p=>p.type==='B');ok(L.setRole(bat.id,'SP'),'타자 거절');
const ai=L.players('Bears').find(p=>p.type==='P'&&p.age>=30);if(ai)ok(L.setRole(ai.id,'SP'),'타 구단 거절');
ok(L.setRole(old.id,'XX'),'알 수 없는 보직');
// 성장 처리가 지정 보직을 덮어쓰지 않는다
old.stamina=60;L._devRole(old,'SP');ok(old.role==='RP','지정한 보직은 육성 자동 전환에 덮어쓰이지 않음');
// 지정 없는 선수는 기존 동작 그대로
const other=L.players(U).find(p=>p.type==='P'&&!p.roleMan);ok(other&&other.roleMan===undefined,'지정 없는 선수');
// 시즌 진행·저장/불러오기에서 유지
L.advance(5,false);const L2=League.load(L.save());ok(L2.S.players[old.id].roleMan==='RP'&&L2.S.players[old.id].role==='RP','저장 유지');
console.log('role tests ok',n);
