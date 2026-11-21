/* 단년 계약은 계약금 없음 · 샐러리캡(경쟁균형세 상한) 초과 영입 차단/허용 · 상한을 넘는 외국인 후보 구분 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=()=>League.create(base,'Lions',5);
// 1) 단년 계약에는 계약금이 없다
{const L=mk(),S=L.S,t=S.userTeam;const gr=S.fa.map(id=>S.players[id]).filter(p=>!p.foreign&&p.faInfo&&p.faInfo.grade);ok(gr.length>=10,'등급 FA');
 for(const p of gr){const o=L.faDefaultOffer(p,t,1);ok(o.years===1&&o.bonus===0,`${p.ko} 단년 기본 제시 계약금 ${o.bonus}`);const b=L.faBeat(p,t,1);ok(b.bonus===0,'단년 경쟁 제시 계약금 0');
  const e=L.faEvaluate(p,{years:1,salary:o.salary+5,bonus:2},t);ok(!e.ok&&/2년 이상/.test(e.msg),'단년 계약금 거부 '+e.msg);
  const m=L.faDefaultOffer(p,t,3);ok(m.bonus>0,'다년은 계약금 허용')}
 const p=gr[0];S.fin.teams[t].lastRev+=500;S.faMkt.bids={};const o=L.faDefaultOffer(p,t,1);ok(L.signFA(p.id,Object.assign({},o,{bonus:1}))!==null,'단년 계약금 제시 실패');ok(L.signFA(p.id,o)===null&&p.contract.bonus===undefined||!p.contract.bonus,'단년 계약금 없이 체결')}
// 2) 샐러리캡 초과 영입 차단·허용
{const L=mk(),S=L.S,t=S.userTeam;S.fin.teams[t].lastRev+=900;const p=S.fa.map(id=>S.players[id]).find(q=>!q.foreign&&q.faInfo&&q.faInfo.grade==='A'&&q.faInfo.from!==t);S.faMkt.bids={};
 const o=L.faDefaultOffer(p,t),per=(o.bonus+o.salary*o.years)/o.years;ok(L.capBlock(t,per)===null,'여유가 있으면 통과(현재 '+L.cbtPay(t,false)+')');
 const cap=L.cbtCap(S.year),k0=S.calib.cbtK||1;S.calib.cbtK=k0*(cap-per*0.5)/L.cbtPay(t,false);L.invalidate();   // 상한 직전까지 올림
 const msg=L.capBlock(t,per);ok(typeof msg==='string'&&/상한/.test(msg),'초과 영입 차단 '+msg);
 const r=L.signFA(p.id,o);ok(typeof r==='string'&&/경쟁균형세 상한/.test(r)&&p.team==='FA','signFA 차단: '+r);
 L.setAllowOver(true);ok(L.capBlock(t,per)===null,'허용 시 통과');ok(L.signFA(p.id,o)===null&&p.team===t,'허용하면 영입');
 L.setAllowOver(false);ok(S.cbt.allowOver===false,'다시 끔');
 // 상한 안에 들어오는 영입은 막지 않는다
 S.calib.cbtK=k0;ok(L.capBlock(t,0.5)===null,'소액 영입 통과')}
// 3) 외국인: 상한을 넘는 후보는 영입 불가로 구분, 영입 가능한 후보는 호감도를 높이면 계약 가능
{const L=mk(),S=L.S,t=S.userTeam;const fr=Object.values(S.players).filter(p=>p.foreign&&p.team==='FA');let sig=0,over=0;
 for(const p of fr){const s=L.foreignSignable(p,t);if(s)sig++;else over++;const cap=L.foreignCap(p,t),ask=L.askSalary(p);ok(s===(ask*0.93<=cap+1e-9),'판정식');if(!s)ok(ask*0.93>cap,'상한 초과')}
 ok(sig>0,'영입 가능 후보 존재 '+sig+'/'+over)}
console.log('cap tests ok',n);
