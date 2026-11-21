/* 자동 스카우팅(전체 풀·목표 도달 시 자동 전환) · 정기 보고서(스카우트·훈련) */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,sc)=>{const L=League.create(base,'Lions',seed||5);L.faAdvance(75);L.closeFA();const S=L.S;L.ensureProspects();L._scoutMarket();S.fin.teams[S.userTeam].lastRev+=200;
 S.scouts=(sc||[{},{},{}]).map((x,i)=>Object.assign({id:'T'+i,name:'스카우트'+i,age:50,high:60,univ:60,abroad:60,salary:1,y:S.year,focus:'auto',tool:50,proj:50,char:50,spec:'-'},x));return L};
const week=(L,w)=>{L.S.phase='regular';L.S.day=7*w;L._scoutDay()};
// 설정
{const L=mk();const a=L.scoutAuto();ok(!a.on&&a.target==='mid'&&a.next&&Object.values(a.cats).every(Boolean),'기본값');ok(L.setScoutAuto('on',true)===null&&L.scoutAuto().on,'켜기');ok(L.setScoutAuto('target','high')===null&&L.scoutAuto().target==='high'&&typeof L.setScoutAuto('target','x')==='string','목표');
 ok(L.setScoutAuto('cat:univ',false)===null&&!L.scoutAuto().cats.univ&&L.scoutAuto().cats.high&&typeof L.setScoutAuto('cat:zzz',true)==='string'&&typeof L.setScoutAuto('zzz',1)==='string','분류')}
// 대상 풀: 고교·대학·외국인·아쿼 모두
{const L=mk(),st=L.scoutAutoStatus();for(const c of ['high','univ','foreign','aq'])ok(st.cats[c].n>0,'분류 '+c+' '+st.cats[c].n);ok(st.total===Object.values(st.cats).reduce((a,x)=>a+x.n,0),'합계');
 L.setScoutAuto('cat:foreign',false);L.setScoutAuto('cat:aq',false);ok(L.scoutAutoStatus().cats.foreign.n===0&&L.scoutAutoStatus().total<st.total,'분류 끄면 제외');L.setScoutAuto('next',false);ok(L.scoutAutoStatus().total<st.total-L.prospectList2().length+1,'내년 후보 제외')}
// 켜지 않으면 기존 방식, 켜면 전체 풀 관찰·완료 후보 건너뜀
{const L=mk(7);for(const p of L.prospectList().slice(0,5))L.scoutWatch(p.id);week(L,1);const watched=new Set(L.scoutWatchList().map(w=>w.id));const seenOff=Object.values(L.S.players).filter(p=>p.team==='DRAFT'&&p.sc&&p.sc.by&&Object.keys(p.sc.by).length&&!p.fpool);ok(seenOff.every(p=>watched.has(p.id)),'끈 상태: 관심 목록만 관찰');
 const L2=mk(7);L2.setScoutAuto('on',true);week(L2,1);const seen=Object.values(L2.S.players).filter(p=>p.team==='DRAFT'&&!p.fpool&&p.sc&&p.sc.by&&Object.keys(p.sc.by).length);ok(seen.length>=6,'켠 상태: 관심 목록 밖 후보도 관찰 '+seen.length);const fo=Object.values(L2.S.players).filter(p=>p.fpool&&p.fsc&&Object.keys(p.fsc.by).length);ok(fo.length>=1&&L2.S.scStat.f>=1,'해외 후보 관찰');
 ok(L2.S.scStat.p>=6&&L2.S.scoutObs>=L2.S.scStat.p,'관찰 집계');
 // 같은 주에 겹치지 않게 분산(3명이 서로 다른 후보)
 const per={};for(const p of seen){for(const sid of Object.keys(p.sc.by))per[p.id]=(per[p.id]||0)+p.sc.by[sid].n}ok(Math.max(...Object.values(per))<=2,'한 주에 후보당 최대 2회(분산) '+Math.max(...Object.values(per)));
 // 여러 주 진행: 완료 후보가 생기고 완료된 후보는 더 이상 관찰하지 않는다
 for(let w=2;w<=40;w++)week(L2,w);const st=L2.S.scStat;ok(st.done.length>=3,'목표 도달 후보 '+st.done.length);
 const doneIds=st.done.map(d=>d.id);const snap=doneIds.map(id=>{const p=L2.S.players[id];return p.fpool?JSON.stringify(p.fsc.by):JSON.stringify(p.sc.by)});for(let w=41;w<=44;w++)week(L2,w);ok(doneIds.every((id,i)=>{const p=L2.S.players[id];return (p.fpool?JSON.stringify(p.fsc.by):JSON.stringify(p.sc.by))===snap[i]}),'완료 후보는 관찰 대상에서 제외')}
// 목표 수준: 높음이 보통보다 더 많은 관찰 필요
{const cnt=t=>{const L=mk(9);L.setScoutAuto('on',true);L.setScoutAuto('target',t);for(let w=1;w<=20;w++)week(L,w);return L.S.scStat.done.length};const m=cnt('mid'),h=cnt('high');ok(m>h,`보통 도달 ${m} > 높음 도달 ${h}`)}
// 담당 배치와 함께: 투수 담당은 투수만, 해외 전담은 해외만
{const L=mk(11,[{focus:'P'},{focus:'foreign'},{focus:'B'}]);L.setScoutAuto('on',true);for(let w=1;w<=6;w++)week(L,w);const P=Object.values(L.S.players).filter(p=>p.team==='DRAFT'&&!p.fpool&&p.sc&&p.sc.by);
 ok(P.some(p=>p.sc.by.T0)&&P.filter(p=>p.sc.by.T0).every(p=>p.type==='P'),'투수 담당');ok(P.filter(p=>p.sc.by.T2).every(p=>p.type==='B')&&P.some(p=>p.sc.by.T2),'타자 담당');ok(!P.some(p=>p.sc.by.T1),'해외 전담은 국내 후보를 보지 않음');
 const F=Object.values(L.S.players).filter(p=>p.fpool&&p.fsc&&p.fsc.by.T1);ok(F.length>=1&&!Object.values(L.S.players).some(p=>p.fpool&&p.fsc&&(p.fsc.by.T0||p.fsc.by.T2)),'해외는 전담 스카우트만')}
// 보고서
{const L=mk(13),S=L.S;ok(L.reportCfg().scout===0&&L.reports().length===0,'기본: 보고 없음');ok(typeof L.setReportEvery('x',7)==='string'&&typeof L.setReportEvery('scout',5)==='string'&&L.setReportEvery('scout',7)===null&&L.setReportEvery('train',14)===null,'주기 설정·검증');
 L.setScoutAuto('on',true);S.phase='regular';let rs=0;for(let d=1;d<=60;d++){S.day=d;L._trainDay();L._scoutDay();rs=L.reports().length}
 const list=L.reports();const sc=list.filter(r=>r.kind==='scout'),tr=list.filter(r=>r.kind==='train');ok(sc.length===Math.floor(60/7)&&tr.length===Math.floor(60/14),`주기 보고 scout ${sc.length} train ${tr.length}`);
 ok(sc.every(r=>r.lines.length>=3&&r.unread&&r.title)&&sc[0].lines[0].includes('관찰'),'스카우트 보고 내용');ok(tr.every(r=>r.lines.some(l=>/팀 방침/.test(l))&&r.lines.some(l=>/부상/.test(l))),'훈련 보고 내용');
 ok(L.reportsUnread()===list.length&&L.reportRead(list[0].id)===null&&L.reportsUnread()===list.length-1&&typeof L.reportRead('X')==='string','읽음 처리');L.reportReadAll();ok(L.reportsUnread()===0,'모두 읽음');
 ok(S.scStat.p===0||S.day-S.rptCfg.last_scout<7,'보고 뒤 기간 통계 초기화');ok(S.news.slice(0,40).some(x=>/스카우트 보고서/.test(x.text)),'소식');
 const r=L.reportMake('train');ok(r&&L.reports()[0].id===r.id&&r.unread,'지금 받기');L.setReportEvery('scout',0);const n0=L.reports().length;for(let d=61;d<=90;d++){S.day=d;L._scoutDay()}ok(L.reports().filter(x=>x.kind==='scout').length===sc.length,'끄면 보고 중단');
 // 새 시즌: 날짜가 0으로 돌아가도 다시 주기대로
 L.setReportEvery('scout',7);S.day=0;S.phase='preseason';L._scoutDay();const c0=L.reports().length;for(let d=1;d<=16;d++){S.phase='regular';S.day=d;L._scoutDay()}ok(L.reports().length>=c0+2,'새 시즌 재개 '+(L.reports().length-c0))}
// 훈련 보고: 부상·프로젝트 결과 반영, 보관 30건
{const L=mk(15),S=L.S,t=S.userTeam;const p=L.players(t).find(q=>q.type==='B'&&!q.foreign&&q.age<30);L.skillStart(p.id,'form_contact');S.phase='regular';S.day=5;(S.tnStat=S.tnStat||{inj:[],skill:[]}).inj.push({name:'테스트',dx:'어깨',days:20,pos:'1B'});const r=L.reportMake('train');
 ok(r.lines.some(l=>/기술 프로젝트 1개/.test(l))&&r.lines.some(l=>/부상 1건.*테스트/.test(l)),'훈련 보고에 프로젝트·부상 반영');ok(S.tnStat.inj.length===0,'보고 뒤 초기화');
 for(let i=0;i<40;i++){S.day=6+i;L.reportMake(i%2?'scout':'train')}ok(L.reports().length===30,'최대 30건 보관')}
// 저장/불러오기
{const L=mk(17);L.setScoutAuto('on',true);L.setReportEvery('scout',14);L.reportMake('scout');const L2=League.load(L.save());ok(L2.scoutAuto().on&&L2.reportCfg().scout===14&&L2.reports().length===1,'저장·불러오기')}
console.log('auto tests ok',n);
