const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
// 1) 체력 표시
{const L=mk(3),S=L.S,t=S.userTeam;const sp=L.players(t).find(p=>p.type==='P'&&p.active&&S.teams[t].set.rotation.includes(p.id)),rp=L.players(t).find(p=>p.type==='P'&&p.active&&!S.teams[t].set.rotation.includes(p.id));
 rp.fat=0;let r=L.restInfo(rp);ok(r.left===100&&r.days===0&&r.label==='오늘 가능'&&r.level==='good','체력 가득');rp.fat=40;r=L.restInfo(rp);ok(r.left===60&&r.days===1&&r.label==='1일 뒤 가능'&&r.level==='low','피로 40 → 1일 뒤');rp.fat=60;r=L.restInfo(rp);ok(r.days===4,'피로 60 → 4일 뒤 '+r.days);rp.fat=130;ok(L.restInfo(rp).left===0,'범위 제한');
 S.day=10;sp.lastStart=9;r=L.restInfo(sp);ok(r.inRot&&r.days===3&&r.label==='3일 뒤 가능','선발 4일 휴식 규칙');sp.lastStart=5;ok(L.restInfo(sp).days===0,'휴식 완료');
 const b=L.players(t).find(p=>p.type==='B'&&p.pos==='SS');ok(L.fitTag(b,'SS')==='main'&&L.fitTag(b,'DH')==='ok','적합도');}
// 2) 교체형 콜업
{const L=mk(4),S=L.S,t=S.userTeam;const up=L.players(t).filter(p=>!p.active&&p.type==='B'&&!L.isInj(p)&&!p.foreign)[0];const cands=L.downCandidates(up.id);ok(cands.length>=10&&cands.every(c=>c.p.active&&c.p.type==='B'&&c.p.id!==up.id),'교체 후보는 같은 유형 1군');ok(cands.every((c,i)=>i===0||c.score>=cands[i-1].score),'추천 순(약한 선수부터)');
 ok(cands.some(c=>c.role==='주전 라인업'),'주전 표시');const dn=cands.find(c=>!c.block&&!c.role).p;const act0=L.players(t).filter(p=>p.active).length;
 ok(L.swapActive(up.id,dn.id)===null&&up.active&&!dn.active&&L.players(t).filter(p=>p.active).length===act0,'교체 성공·인원 유지');ok((dn.lockUntil||0)>S.day||S.phase==='preseason','내린 선수 10일 등록 제한');
 ok(L.undo()==='콜업 교체'&&!up.active&&dn.active,'한 번에 되돌림');
 const p2=L.players(t).find(p=>!p.active&&p.type==='P'&&!L.isInj(p));ok(typeof L.swapActive(p2.id,dn.id)==='string','유형이 다르면 거부');
 const inj=L.players(t).find(p=>!p.active&&p.type==='B'&&L.isInj(p));if(inj)ok(/부상/.test(L.swapActive(inj.id,dn.id)),'부상 선수 콜업 거부');
 const cs=L.players(t).filter(p=>p.active&&p.pos==='C');if(cs.length===2){const nc=L.players(t).find(p=>!p.active&&p.type==='B'&&p.pos!=='C'&&!L.isInj(p));ok(/포수/.test(L.swapActive(nc.id,cs[0].id)),'포수 2명 미만 방지')}}
// 3) 부상 복귀 이벤트
{const L=mk(5),S=L.S,t=S.userTeam;const p=L.players(t).find(q=>!q.active&&q.type==='B'&&!L.isInj(q)&&!q.foreign);
 p.inj={dx:'테스트 부상',since:'',ret:'2000-01-01',retN:0,apply:true,generated:false};ok(!L.isInj(p),'복귀 조건');S.phase='regular';L._injuryDay(S.day);
 const ev=L.eventsOpen().find(e=>e.type==='return'&&e.data.pid===p.id);ok(ev&&ev.choices.map(c=>c.k).join()==='callup,stay'&&['callup','stay'].includes(ev.rec),'복귀 결정 카드 '+(ev&&ev.rec));
 // 가득 찬 엔트리: 교체 필요 신호
 const full=L.players(t).filter(q=>q.active).length;ok(full===29,'엔트리 가득');const r1=L.resolveEvent(ev.id,'callup');ok(!r1.ok&&r1.need==='swap'&&ev.status==='open','가득 차면 교체 선택 필요');
 const dn=L.downCandidates(p.id).find(c=>!c.block).p;ok(L.swapActive(p.id,dn.id)===null,'교체 콜업');L.resolveEvent(ev.id,'stay');
 // 자리 있으면 바로 콜업
 const q=L.players(t).find(x=>!x.active&&x.type==='B'&&!L.isInj(x)&&!x.foreign&&x.id!==p.id);q.inj={dx:'t',since:'',ret:'2000-01-01',retN:0,apply:true,generated:false};const d2=L.players(t).filter(x=>x.active&&x.type==='B')[5];L.moveActive(d2.id,false);L._injuryDay(S.day);const ev2=L.eventsOpen().find(e=>e.type==='return'&&e.data.pid===q.id);const r2=L.resolveEvent(ev2.id,'callup');ok(r2.ok&&q.active,'자리가 있으면 바로 콜업');}
// 4) 변경 요약·확정·취소·점검
{const L=mk(6),S=L.S,t=S.userTeam;S.base=null;S.undo=[];ok(L.diffSinceBase()===null,'기준 없음');const up=L.players(t).find(p=>!p.active&&p.type==='B'&&!L.isInj(p)&&!p.foreign),dn=L.downCandidates(up.id).find(c=>!c.block&&!c.role).p;
 L.swapActive(up.id,dn.id);L.swapLineup(0,1);const d=L.diffSinceBase();ok(d&&d.up.includes(up)&&d.down.includes(dn)&&d.ch.length>=2&&d.n>=4,'변경 요약 '+d.n);
 const lu=JSON.stringify(S.teams[t].set.lineup);ok(L.revertToBase()&&up.active===false&&dn.active===true&&JSON.stringify(S.teams[t].set.lineup)!==lu&&L.diffSinceBase()===null,'전체 취소');
 L.swapActive(up.id,dn.id);ok(L.diffSinceBase().n>=2,'다시 변경');L.confirmChanges();ok(L.diffSinceBase()===null,'확정 후 요약 비움');L.swapLineup(2,3);ok(L.diffSinceBase().n>=1,'확정 이후 새 변경 추적');L.advance(1,false);ok(L.diffSinceBase()===null,'하루가 지나면 자동 확정');
 ok(Array.isArray(L.validateEntry()),'점검 목록');const cs=L.players(t).filter(p=>p.active&&p.pos==='C');for(const c of cs.slice(1))c.active=false;ok(L.validateEntry().some(w=>/포수/.test(w)),'포수 부족 경고');}
// 5) 탭으로 맞바꾸기(타순·위치·교체·투수진)
{const L=mk(7),S=L.S,t=S.userTeam,set=()=>S.teams[t].set;const l0=set().lineup.map(x=>x.id+x.pos);ok(L.swapLineup(0,4)&&set().lineup[0].id+set().lineup[0].pos===l0[4]&&set().lineup[4].id+set().lineup[4].pos===l0[0],'타순 맞바꿈');
 const bench=L.hitters(t,true).find(p=>!set().lineup.some(x=>x.id===p.id)&&!L.isInj(p));const pos3=set().lineup[3].pos;ok(L.replaceLineup(3,bench.id)===null&&set().lineup[3].id===bench.id&&set().lineup[3].pos===pos3,'벤치 선수로 교체(위치 유지)');
 const other=set().lineup[5].id;L.replaceLineup(3,other);ok(set().lineup[5].id===bench.id&&set().lineup[3].id===other&&new Set(set().lineup.map(x=>x.id)).size===9,'라인업 안의 선수끼리 교체');
 const pa=set().lineup[1].pos,pb=set().lineup[2].pos;L.setLineupPos(1,pb);ok(set().lineup[1].pos===pb&&set().lineup[2].pos===pa,'수비 위치 맞바꿈');
 const rot0=set().rotation.slice(),sp=L.pitchers(t,true).find(p=>!rot0.includes(p.id)&&!L.isInj(p));ok(L.assignPitcher('rot',2,sp.id)===null&&set().rotation[2]===sp.id,'로테이션 교체');
 const cl=set().bullpen.closer;ok(L.assignPitcher('rot',0,cl)===null&&set().rotation[0]===cl&&set().bullpen.closer===rot0[0],'로테이션↔마무리 맞바꿈');
 const all=[...set().rotation,set().bullpen.closer,...set().bullpen.setup,...set().bullpen.middle,...set().bullpen.long];ok(new Set(all).size===all.length,'투수진 중복 없음');
 const farm=L.players(t).find(p=>!p.active&&p.type==='P');ok(typeof L.assignPitcher('rot',0,farm.id)==='string'&&typeof L.replaceLineup(0,farm.id)==='string','2군 선수는 거부');}
// 6) 할 일 함: 추천대로 모두 처리
{const L=mk(8),S=L.S,t=S.userTeam;S.phase='regular';const a=L._evAdd({type:'sponsor',title:'t',data:{amt:3},text:'',choices:[{k:'accept'},{k:'decline'}],def:'decline'}),b=L._evAdd({type:'promo',title:'t',data:{cost:1},text:'',choices:[{k:'go'},{k:'skip'}],def:'skip',rec:'go'});
 const p=L.players(t).find(q=>!q.active&&q.type==='B'&&!L.isInj(q)&&!q.foreign);L._returnEvent(p);const n0=L.eventsOpen().length;ok(n0>=3,'열린 소식 '+n0);const out=L.resolveAllRecommended();ok(out.length===n0&&L.eventsOpen().length===0&&out.some(x=>x.k==='go'),'모두 처리 '+out.map(x=>x.k).join());
 ok(S.fin.teams[t].evCost>=1,'추천 선택(팬 이벤트) 효과 반영');}
console.log('entry tests ok',n);
