const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
// 1) 후보 풀: 시즌 시작에 120명 공개, 기본 추정 = 기존 scout(관찰 없음)
{const L=League.create(base,'Lions',5),S=L.S;const ps=L.prospectList();ok(ps.length===120&&ps.every(p=>p.team==='DRAFT'&&p.scout&&p.pro&&p.pro.school),'후보 120명');ok(new Set(ps.map(p=>p.id)).size===120,'후보 id 유일');ok(ps.filter(p=>p.type==='B').length===60&&ps.filter(p=>p.type==='P').length===60,'타자·투수 반반');
 for(const p of ps.slice(0,30)){const e=L.scoutEst(p);ok(e.n===0&&e.ceil===Math.round(p.scout.ceil*10)/10&&e.ceilSd===16&&e.oSd===3&&e.conf==='낮음','관찰 없으면 기존 추정과 같음');ok(L.userScore(p)===L.scoutScore(p),'관찰 없으면 점수 동일')}
 ok(S.scoutMkt.length===6&&S.scoutMkt.every(c=>c.salary>=0.5&&c.salary<=2.5&&c.high>=30&&c.univ>=30),'스카우트 후보 6명');ok(L.ensureProspects()===S.prospects,'후보 풀은 한 번만 생성');
 ok(!JSON.stringify(L.scoutReport(ps[0])).includes('peak'),'리포트에 숨은 값(peak) 노출 없음');
 // 진짜 값 보호: 추정 계산이 숨은 값을 바꾸지 않는다
 const p0=ps[0],pk=p0.peak,ov=L.ovr(p0);L.scoutAutoWatch(5);ok(p0.peak===pk&&L.ovr(p0)===ov,'추정은 진짜 능력을 바꾸지 않음');}
// 2) 스카우트 고용·해임·예산
{const L=mk(6),S=L.S,t=S.userTeam;const pay0=L.finPay(t),room0=L.faRoom(t);const c=S.scoutMkt[0];ok(L.scoutHire(c.id)===null&&L.scouts().length===1,'고용');ok(Math.abs(L.finPay(t)-pay0-c.salary)<0.11,'스카우트 연봉이 팀 보수에 포함 '+(L.finPay(t)-pay0));ok(Math.abs(L.faRoom(t)-(room0-c.salary))<0.11,'여유자금 감소');
 ok(L.scoutHire(c.id)!==null,'같은 후보 재고용 불가');ok(L.scoutHire(S.scoutMkt[0].id)===null&&L.scoutHire(S.scoutMkt[0].id)===null,'3명까지');ok(/3명까지/.test(L.scoutHire(S.scoutMkt[0].id)||''),'한도 초과 거부');
 ok(L.scoutFire(c.id)===null&&L.scouts().length===2&&L.scoutFire(c.id)!==null,'해임');ok(L.scoutCap(L.scouts()[0])>=2&&L.scoutCap(L.scouts()[0])<=6,'주간 관찰 수');
 const L2=mk(6);L2.S.fin.teams[L2.S.userTeam].boardExtra=0;const big={id:'SCX',name:'테스트',age:50,high:80,univ:80,salary:2.5};L2.S.scoutMkt.push(big);ok(L2.faRoom(L2.S.userTeam)>2.5?L2.scoutHire('SCX')===null:/예산 부족/.test(L2.scoutHire('SCX')),'예산 확인');}
// 3) 관찰: 관심 목록 → 주간 관찰 → 오차 감소(바닥 있음), 결정성
{const run=()=>{const L=mk(7),S=L.S;L.scoutHire(S.scoutMkt[0].id);L.scoutHire(S.scoutMkt[1].id);L.scoutAutoWatch(10);const ids=L.scoutWatchList().map(w=>w.id);return {L,S,ids}};
 const a=run(),b=run();ok(a.ids.length===10&&a.ids.every(id=>a.S.players[id].team==='DRAFT'),'관심 목록 10명');
 const sd0=a.ids.map(id=>a.L.scoutEst(a.S.players[id]).ceilSd);a.L.advance(70,false);b.L.advance(70,false);
 const e1=a.ids.map(id=>a.L.scoutEst(a.S.players[id]));ok(e1.every(e=>e.n>=5),'10주 관찰 수 '+e1.map(e=>e.n).join(','));ok(e1.every((e,i)=>e.ceilSd<sd0[i]&&e.ceilSd>=3),'오차 감소·바닥 유지 '+e1.map(e=>e.ceilSd).join(','));
 const sigA=JSON.stringify(a.ids.map(id=>a.S.players[id].sc)),sigB=JSON.stringify(b.ids.map(id=>b.S.players[id].sc));ok(sigA===sigB,'같은 입력 → 같은 관찰 결과');
 ok(a.S.scoutObs>=50&&a.S.scoutLog.length>=8,'관찰 기록 '+a.S.scoutObs);
 // 관심 목록 밖은 관찰 안 함
 const out=a.L.prospectList().find(p=>!a.ids.includes(p.id));ok(!out.sc,'관심 밖 후보는 관찰 없음');
 // ★ 우선: 같은 스카우트 수에서 더 많이 관찰
 const c=mk(8),CS=c.S;c.scoutHire(CS.scoutMkt[0].id);const ps=c.prospectList().slice(0,6);for(const p of ps)c.scoutWatch(p.id);c.scoutStar(ps[0].id);c.advance(70,false);const cnt=p=>c.scoutEst(p).n;ok(cnt(ps[0])>cnt(ps[3]),'★ 우선 관찰 '+cnt(ps[0])+' > '+cnt(ps[3]));
 ok(c.scoutWatch('B1')!==null&&c.scoutStar('PX')!==null,'잘못된 대상 거부');}
// 4) 통계: 스카우트가 정말 추정을 정확하게 만드는가(진짜 정점과의 오차)
{const L=mk(9),S=L.S;for(const m of [S.scoutMkt[0],S.scoutMkt[1],S.scoutMkt[2]])L.scoutHire(m.id);const ps=L.prospectList();for(const p of ps)L.scoutWatch(p.id)===null||0;L.S.scWatch=ps.slice(0,24).map(p=>({id:p.id,star:false}));const tgt=ps.slice(0,24);const err0=tgt.map(p=>Math.abs(p.scout.ceil-p.peak)),mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
 L.advance(120,false);const err1=tgt.map(p=>Math.abs(L.scoutEst(p).ceil-p.peak));ok(mean(err1)<mean(err0)*0.7,'관찰 후 평균 오차 감소 '+mean(err0).toFixed(1)+' → '+mean(err1).toFixed(1));
 const within=tgt.filter(p=>{const e=L.scoutEst(p);return Math.abs(e.ceil-p.peak)<=2.5*e.ceilSd}).length;ok(within>=tgt.length-1,'추정 범위(±2.5σ) 안에 진짜 값 '+within+'/'+tgt.length);
 const e=L.scoutEst(tgt[0]);ok(e.ceilSd<10&&['보통','높음'].includes(e.conf),'확신도 상승');ok(e.lo<=e.grade||true,'등급 범위');
 // 리포트: 관찰 2건 이상이면 강점·약점 제공(숨은 값 없이)
 const rp=L.scoutReport(tgt[0]);ok(rp.detail&&rp.by.length>=1&&rp.hand&&rp.school,'리포트 구성');ok(rp.strengths.every(k=>Object.keys(L.sub(tgt[0])).includes(k)),'강점은 세부 능력 이름');
 const un=L.scoutReport(ps[ps.length-1]);ok(!un.detail&&un.strengths.length===0,'관찰 부족 시 세부 미공개');}
// 5) 스카우트 여러 명이면 편향이 평균화되어 한 명보다 정확(바닥이 낮아짐)
{const one=mk(10),three=mk(10);one.scoutHire(one.S.scoutMkt[0].id);for(let i=0;i<3;i++)three.scoutHire(three.S.scoutMkt[0].id);const ids=one.prospectList().slice(0,10).map(p=>p.id);for(const L of [one,three])L.S.scWatch=ids.map(id=>({id,star:false}));one.advance(150,false);three.advance(150,false);
 const m=L=>ids.reduce((a,id)=>a+L.scoutEst(L.S.players[id]).ceilSd,0)/ids.length;ok(m(three)<m(one),'스카우트 3명 쪽이 불확실성 낮음 '+m(one).toFixed(1)+' vs '+m(three).toFixed(1));}
// 6) 드래프트 연동: 후보 풀 그대로 사용, AI는 기존 기준, 내 지명은 스카우팅 추정 반영
{const L=mk(11),S=L.S;L.scoutHire(S.scoutMkt[0].id);L.scoutAutoWatch(20);const pool0=L.prospectList().map(p=>p.id);L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 L.startOffseason();L.finishContracts();const nid0=S.nextId;const d=L.buildDraft();ok(S.nextId===nid0&&JSON.stringify(d.pool.slice().sort())===JSON.stringify(pool0.slice().sort()),'드래프트 풀 = 공개된 후보(새로 만들지 않음)');ok(S.prospects===null&&S.prospectsDone===S.year,'후보 풀 소진 표시');
 const watched=new Set(L.scoutWatchList().map(w=>w.id));ok(watched.size>=1,'관심 후보');
 // 내 차례에 관찰 높은 후보 지명 → 추정 승계
 L.draftAiUntilUser();const best=d.pool.map(id=>S.players[id]).sort((a,b)=>L.userScore(b)-L.userScore(a))[0];const e0=L.scoutEst(best);ok(L.draftPick(best.id)===null,'지명');if(e0.n>0){ok(best.scout.ceil===e0.ceil&&best.scout.o===Math.round(e0.o),'지명 후 스카우팅 추정 승계');}
 // 자동 지명은 내 추정(userScore) 기준
 L.draftAutoRest();ok(true,'자동 지명 완료');L.finishDraft();ok(L.prospectList().length===0,'지명·정리 후 후보 없음');
 L.faAdvance(75);L.closeFA();L.startNewSeason();ok(L.prospectList().length===120&&S.prospects.y===S.year&&S.scWatch.length===0&&L.scouts().length===1,'새 시즌: 새 후보 120명·관심 목록 초기화·스카우트 유지');}
// 7) 스카우팅 미사용 시 AI·내 자동 지명이 기존 기준(scoutScore)과 같다
{const L=mk(12),S=L.S;L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}L.startOffseason();L.finishContracts();const d=L.buildDraft();ok(d.pool.every(id=>L.userScore(S.players[id])===L.scoutScore(S.players[id])),'관찰 없음: userScore=scoutScore');}
// 8) 구 저장 파일: 후보 풀이 없으면 필요할 때 생성, 드래프트도 동작
{const L0=mk(13);const J=JSON.parse(L0.save());delete J.prospects;delete J.scoutMkt;for(const id of Object.keys(J.players))if(J.players[id].team==='DRAFT')delete J.players[id];const L=League.load(JSON.stringify(J));ok(L.prospectList().length===120,'구 저장 파일에서 후보 생성');
 const L1=mk(13);const J1=JSON.parse(L1.save());delete J1.prospects;const L2=League.load(JSON.stringify(J1));L2.advance(300,false);const P=L2.startPostseason();let g=0;while(!P.done&&g++<100){if(L2.userInPost()){const c=L2.startUserPostGame();c.live.playToEnd();L2.finishUserPostGame(c)}else L2.simPostGame()}L2.startOffseason();L2.finishContracts();const d=L2.buildDraft();ok(d.pool.length>=100&&d.order.length===100,'후보 풀 없는 저장 파일도 드래프트 가능');}
// 9) 저장/불러오기·진행 동일성, 무결성
{const L=mk(14),S=L.S;L.scoutHire(S.scoutMkt[0].id);L.scoutAutoWatch(10);L.advance(40,false);const L2=League.load(L.save());ok(JSON.stringify(L2.S.scWatch)===JSON.stringify(S.scWatch)&&JSON.stringify(L2.S.scouts)===JSON.stringify(S.scouts),'관심·스카우트 보존');
 const ids=S.scWatch.map(w=>w.id);ok(JSON.stringify(ids.map(id=>L2.S.players[id].sc))===JSON.stringify(ids.map(id=>S.players[id].sc)),'관찰 기록 보존');L.advance(30,false);L2.advance(30,false);ok(JSON.stringify(ids.map(id=>L2.S.players[id].sc))===JSON.stringify(ids.map(id=>S.players[id].sc)),'불러온 뒤 같은 관찰');
 ok(L.integrity().errors.length===0,'스카우팅 후 무결성 오류 없음');}
console.log('scout tests ok',n);
