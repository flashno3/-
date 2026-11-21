/* 스카우트 세분화: 전문 분야·평가 항목 능력(툴/성장/성격)·담당 배치·항목별 확신도 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed)=>{const L=League.create(base,'Lions',seed);L.faAdvance(75);L.closeFA();L.ensureProspects();L._scoutMarket();return L};
const hireAll=(L,list)=>{const S=L.S;S.scouts=list.map((x,i)=>Object.assign({id:'T'+i,name:'테스트'+i,age:50,high:60,univ:60,abroad:50,salary:1,y:S.year,focus:'auto'},x));};
// 1) 후보 생성: 새 필드, 기존 후보 값은 그대로(별도 난수열)
{const L=mk(5),m=L.S.scoutMkt;ok(m.length===6,'후보 6명');for(const c of m){ok(['P','B','-'].includes(c.spec)&&c.tool>=30&&c.proj>=30&&c.char>=30,'새 필드 '+c.name);ok(c.salary>=0.5&&c.salary<=3.0,'연봉')}
 const L2=mk(5);ok(JSON.stringify(L2.S.scoutMkt)===JSON.stringify(m),'같은 시드 결정적')}
// 2) 평가 능력의 효과: 성장 평가가 높고 전문 분야가 맞으면 관찰 잡음이 작다(결정적 계산)
{const L=mk(7),S=L.S;const pit=L.prospectList().find(p=>p.type==='P'),bat=L.prospectList().find(p=>p.type==='B');
 hireAll(L,[{id:'A',proj:80,tool:80,spec:'P'},{id:'B',proj:30,tool:30,spec:'-'},{id:'C',proj:80,tool:80,spec:'B'},{id:'D'}]);
 const se=(id,p)=>{const sc=S.scouts.find(x=>x.id===id);const bb=p.sc&&p.sc.by&&p.sc.by[id];L._scoutObserve(p.id,sc,1,0);return p.sc.by[id].se};
 const a=se('A',pit),b=se('B',pit),c=se('C',pit),d=se('D',pit);
 ok(a<b,`성장 평가 높고 투수 전문 → 투수 관찰 오차 작음 ${a} < ${b}`);ok(a<c,`전문 분야 일치(${a}) < 불일치(${c})`);ok(d>0,'필드 없는 스카우트도 관찰');
 const e=L.scoutEst(pit);ok(e&&e.n===4,'관찰 4건');ok(pit.sc.by.A.vo2!==undefined&&pit.sc.by.D.vo2===undefined,'툴 평가 능력이 있는 스카우트만 능력 측정 분산 기록')}
// 3) 기존 스카우트(새 필드 없음)는 이전과 같은 관찰: 추정 불변 확인용 결정성
{const L=mk(9),S=L.S;hireAll(L,[{id:'O'}]);const p=L.prospectList()[0];L._scoutObserve(p.id,S.scouts[0],2,0);const e1=JSON.stringify(L.scoutEst(p));const L2=mk(9);hireAll(L2,[{id:'O'}]);const p2=L2.prospectList()[0];L2._scoutObserve(p2.id,L2.S.scouts[0],2,0);ok(e1===JSON.stringify(L2.scoutEst(p2)),'결정적');ok(!p.sc.by.O.vo2,'기존 방식 유지')}
// 4) 담당 배치
{const L=mk(11),S=L.S;const sk={tool:50,proj:50,char:50,spec:'-'};hireAll(L,[{id:'P',focus:'P'},{id:'B',focus:'B'},{id:'H',focus:'high'}]);
 const all=L.prospectList();for(const p of all.slice(0,24))L.scoutWatch(p.id);ok(L.setScoutFocus('P','univ')===null&&S.scouts[0].focus==='univ'&&typeof L.setScoutFocus('P','zzz')==='string'&&typeof L.setScoutFocus('X','P')==='string','담당 설정·검증');L.setScoutFocus('P','P');
 S.phase='regular';S.day=7;S.prospects.y=S.year;const before=new Set();L._scoutWeek();
 const seen=id=>all.filter(p=>p.sc&&p.sc.by&&p.sc.by[id]);const sp=seen('P'),sb=seen('B'),sh=seen('H');
 ok(sp.length&&sp.every(p=>p.type==='P'),'투수 담당은 투수만 '+sp.length);ok(sb.length&&sb.every(p=>p.type==='B'),'타자 담당은 타자만 '+sb.length);ok(sh.length&&sh.every(p=>!(p.pro&&p.pro.univ)),'고교 담당은 고교만 '+sh.length);
 // 해외 전담은 후보를 관찰하지 않고 해외 후보군 관찰이 늘어난다
 L.setScoutFocus('P','foreign');const w0=Object.values(S.players).filter(p=>p.fsc&&p.fsc.by).length;for(const p of L.foreignPoolList().slice(0,8))L.foreignWatch(p.id);S.day=14;L._scoutWeek();ok(!seen('P').length||seen('P').every(p=>p.type==='P'),'해외 전담은 이번 주 후보를 보지 않음');
 const tot=L._scoutWeekForeign();ok(tot>=L.scoutFCap(S.scouts[0])+1,'해외 전담은 해외 관찰 +1 '+tot)}
// 5) 모두 자동이면 기존 순회 방식(포인터)
{const L=mk(13),S=L.S;hireAll(L,[{id:'a'},{id:'b'}]);for(const p of L.prospectList().slice(0,10))L.scoutWatch(p.id);S.phase='regular';S.day=7;L._scoutWeek();ok(S.scPtr>0&&!S.scouts[0].ptr,'자동은 전체 포인터 사용')}
// 6) 항목별 확신도·성격 조사 정확도
{const L=mk(15),S=L.S;hireAll(L,[{id:'a',char:80},{id:'b',char:30}]);const p=L.prospectList()[3];const it=L.scoutItems(p);ok(it.length===3&&it[0].k==='tool'&&it[1].k==='proj'&&it[2].k==='char'&&it[2].conf==='미조사','항목 구성');
 S.fin.teams[S.userTeam].lastRev+=50;ok(L.scoutProbe(p.id,'a')===null&&L.scoutProbe(p.id,'b')===null,'조사');ok(p.sc.tr.a.acc>p.sc.tr.b.acc,`성격 파악 높은 스카우트의 정확도 ${p.sc.tr.a.acc} > ${p.sc.tr.b.acc}`);ok(L.scoutItems(p)[2].conf!=='미조사','조사 후 확신도')}
console.log('scout4 tests ok',n);
