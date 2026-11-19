/* 전역 검색 · 선수 비교 · 프런트 데스크(읽기 전용 기능): 결과의 정확성, 숨은 정보 비노출, 상태 불변 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team,days)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();if(days)L.advance(days,false);return L};
const KO={Lions:'삼성',Tigers:'KIA'};
{const L=mk(5,'Lions',40),S=L.S;const snap=JSON.stringify(S);
 ok(L.searchPlayers('').length===0&&L.searchPlayers('   ').length===0,'빈 검색어');
 const some=L.players('Lions')[3];const r=L.searchPlayers(some.ko);ok(r.length>=1&&r.some(x=>x.p.id===some.id),'이름 검색');ok(r.every(x=>x.p.ko.includes(some.ko)||x.p.name.toLowerCase().includes(some.ko.toLowerCase())),'이름이 포함된 선수만');
 const exact=L.searchPlayers(some.ko).filter(x=>x.p.ko===some.ko);ok(exact.length>=1&&L.searchPlayers(some.ko)[0].p.ko===some.ko,'정확히 일치하는 이름이 먼저');
 const cho=L.chosung(some.ko);const rc=L.searchPlayers(cho,60);ok(rc.length>=1&&rc.some(x=>x.p.id===some.id)&&rc.every(x=>L.chosung(x.p.ko).includes(cho)||x.p.name.toLowerCase().includes(cho)),'초성 검색 '+cho);
 ok(L.chosung('이서준')==='ㅇㅅㅈ'&&L.chosung('ABC가')==='ABCㄱ','초성 변환');
 const rt=L.searchPlayers('삼성 투수',200);ok(rt.length>=20&&rt.every(x=>x.p.team==='Lions'&&x.p.type==='P'),'삼성 투수만');
 const rf=L.searchPlayers('외국인',200);ok(rf.length>=1&&rf.every(x=>x.p.foreign),'외국인 태그');
 const rfa=L.searchPlayers('fa',200);ok(rfa.length>=1&&rfa.every(x=>x.p.team==='FA'),'FA 태그');
 const r2=L.searchPlayers('삼성 2군',200);ok(r2.length>=1&&r2.every(x=>x.p.team==='Lions'&&!x.p.active),'2군 태그');
 const rinj=L.searchPlayers('부상',200);ok(rinj.every(x=>L.isInj(x.p)),'부상 태그');
 for(const q of ['김','이','ㄱ','외국인','투수','타자','fa','2군','삼성','KIA','선발']){const rr=L.searchPlayers(q,500);ok(rr.length<=500&&rr.every(x=>x.p&&!x.p.retired&&x.p.team!=='RET'&&x.p.team!=='DRAFT'),'은퇴·후보 제외 '+q);ok(rr.every((x,i)=>i===0||rr[i-1].score>=x.score),'점수 정렬 '+q)}
 ok(L.searchPlayers('김',7).length<=7,'개수 제한');
 ok(L.searchPlayers('zzzzqq').length===0,'없는 검색어');
 ok(JSON.stringify(S)===snap,'검색은 상태를 바꾸지 않음');}
{const L=mk(6,'Lions',40),S=L.S;const ids=L.players('Lions').filter(p=>p.type==='B').slice(0,3).map(p=>p.id);const snap=JSON.stringify(S);
 const c=L.compareRows(ids);ok(c&&c.cols.length===3&&!c.mixed,'타자 3명 비교');ok(c.rows.every(r=>r.vals.length===3),'행마다 3칸');
 for(const r of c.rows){if(r.best>=0){const nums=r.vals.map(v=>v.v),m=nums.filter(v=>v!==null);const want=['RA9','부상'].includes(r.label)?Math.min(...m):Math.max(...m);ok(nums[r.best]===want&&m.filter(v=>v===want).length===1,`최고값 표시 ${r.label}`)}}
 ok(c.rows.find(r=>r.label==='OVR').vals.every((v,i)=>v.v===L.ovr(S.players[ids[i]])),'OVR 일치');ok(c.rows.some(r=>r.label==='컨택')&&c.rows.some(r=>r.label==='타율'),'타자 항목');
 const pid=L.players('Lions').find(p=>p.type==='P').id;const m=L.compareRows([ids[0],pid]);ok(m.mixed&&!m.rows.some(r=>r.label==='컨택'||r.label==='구위'),'투수·타자 혼합은 공통 항목만');
 const pp=L.players('Lions').filter(p=>p.type==='P').slice(0,2).map(p=>p.id);const cp=L.compareRows(pp);ok(cp.rows.some(r=>r.label==='구위')&&cp.rows.some(r=>r.label==='RA9'),'투수 항목');const ra=cp.rows.find(r=>r.label==='RA9');if(ra.best>=0){const v=ra.vals.map(x=>x.v);ok(v[ra.best]===Math.min(...v.filter(x=>x!==null)),'RA9는 낮을수록 좋음')}
 ok(L.compareRows([ids[0]])===null&&L.compareRows([])===null&&L.compareRows(['X999999','Y1'])===null,'2명 미만은 null');
 const same=L.compareRows([ids[0],ids[0]]);ok(same.rows.every(r=>r.best===-1),'같은 선수는 우열 없음');
 // 숨은 능력(스카우트 전 외국인)은 세부 능력·가치를 노출하지 않음
 const hid=L.faList().filter(p=>p.foreign&&L.hiddenForeign(p)&&p.type==='B').slice(0,1).concat([S.players[ids[0]]]);if(hid.length===2){const h=L.compareRows(hid.map(p=>p.id));ok(h.cols[0].hidden,'숨은 외국인 표시');ok(h.rows.filter(r=>r.group==='능력').every(r=>r.vals[0].v===null),'숨은 외국인의 세부 능력은 비공개');ok(h.rows.find(r=>r.label==='가치(억)').vals[0].v===null,'가치 비공개');const e=L.fEst(hid[0]);ok(h.rows[0].vals[0].v===Math.round(e.o),'OVR은 추정치')}
 const snap2=JSON.stringify(S);L.compareRows(ids);L.compareRows(pp);if(hid.length===2)L.compareRows(hid.map(p=>p.id));ok(JSON.stringify(S)===snap2,'비교는 상태를 바꾸지 않음(추정 캐시는 첫 조회 때 한 번 초기화)');}
{const L=mk(7,'Lions',60),S=L.S,t=S.userTeam;const snap=JSON.stringify(S);const d=L.deskInfo();
 ok(Array.isArray(d.todo)&&d.todo.every((x,i)=>i===0||d.todo[i-1].sev>=x.sev),'할 일은 중요도 순');ok(d.deadlines.some(x=>x.label==='트레이드 마감'&&x.days===L.tradeDeadlineDay()-S.day),'트레이드 마감 D-n');
 ok(d.deadlines.some(x=>/8\/15/.test(x.label)&&x.days===L.postDeadline().n-L.todayN()),'8/15 마감 D-n');
 ok(d.inj.every(x=>L.isInj(x.p)&&x.left===L.injLeft(x.p))&&d.inj.every((x,i)=>i===0||d.inj[i-1].left>=x.left),'부상자 목록');
 ok(d.faElig.every(x=>L.faEligible(x.p)&&x.p.team===t),'FA 자격 선수');ok(d.farm.every(x=>!x.p.active&&x.gap>0&&!L.isInj(x.p)),'콜업 후보는 2군·건강·1군 최약체보다 강함');
 ok(d.fin&&Math.abs(d.fin.room-L.faRoom(t))<1e-9&&Math.abs(d.fin.pay-L.finPay(t))<1e-9,'재정 수치 일치');
 ok(d.foreign.gen===L.foreignOf(t).filter(p=>!p.aq).length&&d.foreign.aq===L.foreignOf(t).filter(p=>p.aq).length,'외국인 현황');ok(d.scouts===(S.scouts||[]).length,'스카우트 수');
 ok(JSON.stringify(S)===snap,'프런트 데스크는 상태를 바꾸지 않음');
 // 대체 외국인 연동: 부상·대체 계약·복귀 결정 대기가 할 일에 나타남
 const g=L.foreignOf(t).filter(p=>!p.aq)[0],now=L.todayN();g.inj={dx:'테스트',since:new Date((now-1)*864e5).toISOString().slice(0,10)+' 발생',ret:new Date((now+60)*864e5).toISOString().slice(0,10),retN:now+60,apply:true,generated:true};g.active=false;L.invalidate();
 ok(L.deskInfo().todo.some(x=>/대체 외국인 영입 가능/.test(x.text)),'대체 영입 가능 안내');
 const c=L.subCands()[0];ok(L.subSign(g.id,c.id,1)===null,'대체 계약');ok(!L.deskInfo().todo.some(x=>/영입 가능/.test(x.text)),'계약 후 안내 사라짐');
 g.inj.ret=new Date((now-1)*864e5).toISOString().slice(0,10);g.inj.retN=now-1;L._subDay();ok(c.sub&&c.sub.back,'복귀 감지');ok(L.deskInfo().todo.some(x=>/대체 외국인 .*결정/.test(x.text)&&x.sev===3),'복귀 후 결정 대기가 긴급으로');}
console.log('desk tests ok '+n);
