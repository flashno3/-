/* 1군 빈 자리 자동 콜업: 필요 포지션 → OVR 순, 2군만 올림 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9);L.faAdvance(75);L.closeFA();L.advance(3,false);const S=L.S,U=S.userTeam;
const act=()=>L.players(U).filter(p=>p.active);
ok(L.openSlots()===Math.max(0,29-act().length),'빈 자리 계산');
// 1군에서 포수 1명·투수 3명을 비워 둔다(락 없이 직접 해제)
for(const p of act().filter(p=>p.pos==='C').slice(0,1))p.active=false;for(const p of act().filter(p=>p.type==='P').slice(0,3))p.active=false;
L.repairSettings(U);L.invalidate();for(const p of L.players(U))p.lockUntil=0;
const before=act().length,open=L.openSlots();ok(open>=4,'빈 자리 '+open);
const plan=L.callupPlan();ok(plan.length===open,'계획 인원 '+plan.length+'/'+open);
ok(plan.every(x=>{const p=S.players[x.id];return !p.active&&!L.isInj(p)}),'2군 건강 선수만');
// 부족 그룹(포수·선발) 먼저
const grpCount={};for(const p of act())grpCount[L.callupGroup(p)]=(grpCount[L.callupGroup(p)]||0)+1;
if((grpCount.C||0)<2)ok(plan[0].group==='C','포수 부족 시 포수 우선 '+plan[0].group);
// 같은 그룹 안에서는 OVR 높은 순
for(const g of ['C','SP','IF','OF','RP']){const o=plan.filter(x=>x.group===g).map(x=>L.ovr(S.players[x.id]));ok(o.every((v,i)=>i===0||o[i-1]>=v),g+' OVR 내림차순')}
const r=L.autoCallup();ok(r.done.length===plan.length&&act().length===before+r.done.length,'콜업 실행 '+r.done.length);ok(act().length<=L.activeMax(),'한도 이내');
ok(L.openSlots()===0||!L.callupPlan().length,'빈 자리 해소');
// 부상·재등록 잠금 선수는 제외
const farm=L.players(U).filter(p=>!p.active&&!L.isInj(p));if(farm.length>2){const a=farm[0];a.lockUntil=S.day+5;const b=L.players(U).find(p=>p.active&&p.type===a.type);b.active=false;L.invalidate();ok(!L.callupPlan().some(x=>x.id===a.id),'재등록 잠금 선수 제외');}
// 빈 자리 없으면 빈 계획
while(L.openSlots()>0){const x=L.callupPlan()[0];if(!x)break;L.moveActive(x.id,true)}ok(L.openSlots()===0?L.callupPlan().length===0:true,'꽉 찼으면 계획 없음');
console.log('callup tests ok',n);
