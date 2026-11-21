/* 스카우트 관찰 방식: 출장 관찰·영상 분석·비교 평가 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=()=>{const L=League.create(base,'Lions',5);L.faAdvance(75);L.closeFA();L.ensureProspects();L._scoutMarket();const S=L.S;S.scouts=[{id:'A',name:'가',age:50,high:60,univ:60,abroad:50,salary:1,y:S.year,focus:'auto',tool:50,proj:50,char:50,spec:'-'},{id:'B',name:'나',age:50,high:60,univ:60,abroad:50,salary:1,y:S.year,focus:'auto',tool:50,proj:50,char:50,spec:'-'}];S.fin.teams[S.userTeam].lastRev+=30;return L};
const ev=L=>L.S.fin.teams[L.S.userTeam].evCost||0;
// 출장 관찰
{const L=mk(),S=L.S,ps=L.prospectList();const p=ps[0];const e0=ev(L),sd0=L.scoutEst(p).ceilSd;ok(L.scoutVisit(p.id,'A')===null,'출장');ok(Math.abs(ev(L)-e0-0.5)<1e-9,'조사비 0.5억 계상');ok(p.sc.by.A.n===3,'3회 관찰 분량 '+p.sc.by.A.n);ok(L.scoutEst(p).ceilSd<sd0,'불확실성 감소');
 ok(typeof L.scoutVisit(p.id,'A')==='string'&&/이미/.test(L.scoutVisit(p.id,'A')),'같은 스카우트·후보 1회');ok(L.scoutVisit(p.id,'B')===null,'다른 스카우트는 가능');
 ok(L.scoutVisit(ps[1].id,'A')===null&&L.scoutVisitLeft('A')===0,'시즌 2회');ok(/시즌당 2회/.test(L.scoutVisit(ps[2].id,'A')),'3번째 거부');ok(L.scoutVisitLeft('B')===1,'다른 스카우트 남은 횟수');
 ok(typeof L.scoutVisit('X1','A')==='string'&&typeof L.scoutVisit(ps[3].id,'ZZ')==='string','잘못된 입력 거부');
 // 출장 관찰 잡음은 정기 관찰의 75%
 const q=ps[4];L._scoutObserve(q.id,S.scouts[1],1,0);const se1=q.sc.by.B.se;const r=ps[5];L._scoutObserve(r.id,S.scouts[1],1,0,0.75);ok(Math.abs(r.sc.by.B.se-se1*0.75)<0.2,`출장 잡음 ×0.75 ${r.sc.by.B.se} vs ${se1}`);
 // 새 시즌에는 횟수 복구
 S.year+=1;ok(L.scoutVisitLeft('A')===2,'다음 해 복구')}
// 영상 분석
{const L=mk(),ps=L.prospectList(),p=ps[0],e0=ev(L);ok(L.scoutVideo(p.id,'A')===null&&Math.abs(ev(L)-e0-0.1)<1e-9&&p.sc.by.A.n===1,'영상 1회·0.1억');ok(L.scoutVideo(p.id,'A')===null&&L.scoutVideo(p.id,'A')===null&&p.sc.by.A.n===3,'3회까지');ok(/3회까지/.test(L.scoutVideo(p.id,'A')),'4번째 거부');
 ok(L.scoutVideo(p.id,'B')===null,'다른 스카우트');const q=ps[1];L._scoutObserve(q.id,L.S.scouts[0],1,0);const base=q.sc.by.A.se;L.scoutVideo(ps[2].id,'A');ok(ps[2].sc.by.A.se>base*1.2,'영상 잡음 ×1.3')}
// 예산 부족
{const L=mk(),S=L.S,p=L.prospectList()[0];S.fin.teams[S.userTeam].lastRev-=L.faRoom(S.userTeam)+5;ok(/예산 부족/.test(L.scoutVisit(p.id,'A')),'예산 부족 거부');ok(!p.sc||!p.sc.by||!p.sc.by.A,'거부 시 관찰 없음')}
// 비교 평가
{const L=mk(),ps=L.prospectList(),a=ps[0],b=ps[1];const r=L.scoutCompare(a.id,b.id),r2=L.scoutCompare(b.id,a.id);ok(r&&Math.abs(r.pCeil+r2.pCeil-1)<0.011&&r.winner===(r.pCeil>=0.5?a.id:b.id),'대칭·승자');ok(L.scoutCompare(a.id,a.id)===null&&L.scoutCompare(a.id,'X9')===null,'잘못된 입력');
 const c0=Math.abs(r.pCeil-0.5);for(const x of [a,b]){L.scoutVisit(x.id,'A');L.scoutVisit(x.id,'B')}const r3=L.scoutCompare(a.id,b.id);ok(r3.a.e.ceilSd<r.a.e.ceilSd&&r3.b.e.ceilSd<r.b.e.ceilSd,'관찰 후 오차 감소');ok(['낮음','보통','높음'].includes(r3.conf),'판단 확신도')}
console.log('scout5 tests ok',n);
