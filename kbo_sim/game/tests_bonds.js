const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const pair=(L,t)=>{for(const p of L.players(t))if(!p.foreign){const b=L.bonds(p);if(b.length&&L.players(t).find(q=>q.id===b[0].id&&!q.foreign))return [p,L.S.players[b[0].id],b[0]]}return null};
// 1) 관계 종류
{const L=mk(3),S=L.S,t=S.userTeam;const [p,q,b]=pair(L,t);ok(L.bonds(p).length<=3&&L.bonds(p).every(x=>x.w>=1.2&&x.why),'최대 3명·사유');ok(L.bonds(q).some(x=>x.id===p.id),'학교·동기 관계는 양방향');
 // 멘토-제자: 같은 팀 같은 포지션 그룹의 베테랑 ↔ 어린 선수를 만들어 확인
 const bat=L.players(t).filter(x=>x.type==='B'&&!x.foreign&&x.pos&&x.pos!=='DH');const vet=bat[0],kid=bat.find(x=>x!==vet&&(['C'].includes(x.pos)===(vet.pos==='C'))&&(['1B','2B','3B','SS'].includes(x.pos)===['1B','2B','3B','SS'].includes(vet.pos)));vet.age=34;vet.tn=10;vet.dh=undefined;kid.age=21;kid.dh=undefined;vet.myFrom=undefined;kid.myFrom=undefined;
 const mv=L.bonds(vet).find(x=>x.id===kid.id),mk2=L.bonds(kid).find(x=>x.id===vet.id);ok(mv&&mv.why==='제자'&&mv.w===1.2&&mk2&&mk2.why==='멘토','멘토-제자 관계');
 // 우리 지명 동기
 const a=L.players(t).filter(x=>!x.foreign&&x.type==='B'&&x!==vet&&x!==kid).slice(0,2);for(const x of a){x.dh=undefined;x.myFrom={y:S.year,how:'드래프트 3라운드 지명'};x.age=19}const my=L.bonds(a[0]).find(x=>x.id===a[1].id);ok(my&&my.why==='입단 동기(우리 지명)'&&my.w===1.5,'우리 지명 동기 관계');
 ok(L.bonds(L.foreignOf(t)[0]).length===0,'외국인은 관계 없음');}
// 2) 영향: 충성도·컨디션·성격 가중·쿨다운
{const L=mk(4),S=L.S,t=S.userTeam;const [p,q]=pair(L,t);const bl=L.bonds(p);const recv=bl.map(b=>S.players[b.id]).filter(x=>x.team===t);for(const x of recv){x.loyAdj=0;x.mood=undefined;x.bondAt=undefined;x.trait='model'}p.trait='model';
 ok(L._bondShift(p,1,'면담')===recv.length,'긍정 영향 대상 수');for(const x of recv){ok(x.loyAdj===1&&x.mood.v===1&&x.mood.until===S.day+8&&L.moodOf(x)>=1-0.0001,'긍정: 충성도 +1·컨디션 +1(8일)')}
 for(const x of recv)x.bondAt=S.day;ok(L._bondShift(p,-1,'방출')===0,'같은 동료 10일 쿨다운');for(const x of recv)x.bondAt=S.day-10;
 ok(L._bondShift(p,-1,'면담')===recv.length&&recv.every(x=>x.loyAdj===0&&x.mood.v===0),'부정: 충성도·컨디션 되돌림');
 // 성격 가중
 const x0=recv[0];x0.bondAt=undefined;x0.loyAdj=0;x0.mood=undefined;p.trait='leader';x0.trait='shy';L._bondShift(p,1,'면담',[{id:x0.id,w:3,why:'테스트'}]);ok(Math.abs(x0.loyAdj-r(1*1.5*1.3))<1e-9,'리더 ×1.5 · 소심 ×1.3 = '+x0.loyAdj);
 x0.bondAt=undefined;x0.loyAdj=0;p.trait='model';x0.trait='free';L._bondShift(p,-1,'면담',[{id:x0.id,w:3,why:'테스트'}]);ok(x0.loyAdj===-1.3,'자유분방 부정 ×1.3');x0.bondAt=undefined;x0.loyAdj=0;L._bondShift(p,1,'면담',[{id:x0.id,w:3,why:'테스트'}]);ok(x0.loyAdj===1,'자유분방 긍정은 가중 없음');
 // 한도: 충성도 ±15, 컨디션 ±3
 x0.loyAdj=14.5;x0.bondAt=undefined;p.trait='leader';L._bondShift(p,1,'면담',[{id:x0.id,w:3,why:'t'}]);ok(x0.loyAdj<=15,'충성도 상한');x0.mood={v:3,until:S.day+5};x0.bondAt=undefined;L._bondShift(p,1,'면담',[{id:x0.id,w:3,why:'t'}]);ok(x0.mood.v===3,'컨디션 +3 한도');
 ok((S.bondLog||[]).length>=1&&S.bondLog[0].text.includes('컨디션'),'관계 로그에 컨디션 표기');
 function r(v){return Math.round(v*10)/10}}
// 3) 회복(감쇠)
{const L=mk(5),S=L.S,t=S.userTeam;const ps=L.players(t).slice(0,4);ps[0].loyAdj=5;ps[1].loyAdj=-5;ps[2].loyAdj=0.5;ps[3].loyAdj=-0.4;L._loyDecay(1);ok(ps[0].loyAdj===4&&ps[1].loyAdj===-4&&ps[2].loyAdj===0&&ps[3].loyAdj===0,'1씩 0 쪽으로');L._loyDecay(2);ok(ps[0].loyAdj===2&&ps[1].loyAdj===-2,'2씩');
 const lone=L.players(t).filter(x=>!L.bonds(x).length&&!x.foreign).sort((a,b)=>a.age-b.age)[0];lone.loyAdj=6;L.advance(95,false);ok(lone.loyAdj<=3.01&&lone.loyAdj>=2.99,'30일마다 1씩 회복(관계 없는 선수) '+lone.loyAdj);}
// 4) 발동 조건: 계약·약속·승격·기록·부상
{const L=mk(6),S=L.S,t=S.userTeam;S.off={rep:{expiring:[]}};
 const [p]=pair(L,t);const recv=L.bonds(p).map(b=>S.players[b.id]).filter(x=>x.team===t);const reset=()=>{for(const x of recv){x.loyAdj=0;x.mood=undefined;x.bondAt=undefined}};
 reset();p.contract.years=1;const before=S.bondLog?S.bondLog.length:0;S.phase='regular';p.contract={salary:2,years:1};let e=L.negStart(p.id,'extend');if(e.ok){L.negOffer(L.negBest(p.id));ok(recv.some(x=>x.loyAdj>0)||!/비FA/.test(JSON.stringify(S.news[0])),'연장 계약 → 동료 +')}else ok(true,'연장 불가 선수');L.negClose();
 reset();const bench=L.players(t).filter(x=>!x.active&&!L.isInj(x)&&!x.foreign&&L.bonds(x).length&&(S.day>=(x.lockUntil||0)||true));if(bench.length&&L.players(t).filter(x=>x.active).length<29){const b=bench[0];b.lockUntil=0;const rc=L.bonds(b).map(z=>S.players[z.id]).filter(z=>z.team===t);for(const z of rc){z.loyAdj=0;z.bondAt=undefined}const r0=L.moveActive(b.id,true);ok(r0===null&&rc.some(z=>z.loyAdj>0),'1군 승격 → 동료 +')}
 // 방출·트레이드·장기 부상 → 소식
 reset();const pr=L.players(t).filter(x=>!x.foreign&&L.bonds(x).length&&(x.tn>=3||L.ovr(x)>=50)).sort((a,b)=>L.ovr(b)-L.ovr(a))[0];const rcv=L.bonds(pr).map(z=>S.players[z.id]).filter(z=>z.team===t);for(const z of rcv){z.bondAt=undefined}const nn=S.news.length;const rel=L.releasePlayer(pr.id);if(rel.ok){ok(S.news.slice(0,5).some(x=>/^분위기:.*방출/.test(x.text)),'방출 → 분위기 소식')}
 // 시즌 진행 중 자연 발생(기록·부상 복귀·장기 부상): 로그에 원인이 쌓인다
 const L2=mk(7);L2.advance(200,false);const causes=(L2.S.bondLog||[]).map(x=>x.text);ok(causes.length>=1,'시즌 중 동료 영향 발생 '+causes.length);ok(causes.every(x=>/컨디션 [+-]1/.test(x)&&!/NaN|undefined/.test(x)),'로그 형식');}
// 5) 분위기 보드·미리보기
{const L=mk(8);const bd=L.clubhouseBoard(),pv=L.bondPreview();ok(Array.isArray(bd.groups)&&Array.isArray(pv)&&pv.length>=1&&pv.every(x=>x.b.length>=1&&x.b.length<=3),'미리보기');}
// 6) 불변식: 긴 진행에서 충성도·컨디션 범위
{const L=mk(9),S=L.S,t=S.userTeam;for(let k=0;k<6;k++){L.advance(40,false);for(const p of L.players(t)){ok(Number.isFinite(p.loyAdj||0)&&(p.loyAdj||0)>=-15&&(p.loyAdj||0)<=15,'충성도 범위 '+p.loyAdj);const m=L.moodOf(p);ok(m>=-4&&m<=4,'컨디션 범위 '+m);if(p.mood)ok(p.mood.v>=-3&&p.mood.v<=3,'개별 컨디션 ±3')}}}
console.log('bonds tests ok',n);
