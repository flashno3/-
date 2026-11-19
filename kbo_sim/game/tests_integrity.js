/* 데이터 무결성 검증: 같은 사람이 두 번 들어 있거나(개명·동명이인 오매칭) 소속·계약이 어긋나는 오류를 잡는다 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
// 1) 원자료: id·fpid 유일, 드래프트 지명 이력은 한 사람만, 개명 쌍이 같은 팀·같은 유형에 둘 다 있으면 안 됨
{const ps=base.players,ids=new Set(ps.map(p=>p.id));ok(ids.size===ps.length,'선수 id 중복');const fp=ps.filter(p=>p.fpid).map(p=>p.fpid);ok(new Set(fp).size===fp.length,'퓨처스 선수번호(fpid) 중복');
 const dh={};for(const p of ps){const d=p.dh;if(d&&d.y&&d.school){const k=[d.y,d.dt,d.round,d.pick,d.school,d.kind].join('/');(dh[k]=dh[k]||[]).push(p)}}
 for(const [k,v] of Object.entries(dh))ok(v.length===1,`같은 지명 이력을 가진 선수 ${v.length}명: ${k} ${v.map(p=>p.ko).join(',')}`);
 // 드래프트 CSV의 '현재이름 (이전이름)' 개명 쌍
 const csv=fs.readFileSync(__dirname+'/data/draft_2002_2027.csv','utf8').split('\n').slice(1);const pairs=[];
 for(const l of csv){const m=l.match(/^(\d{4}),[^,]*,[^,]*,[^,]*,([가-힣]{2,4}) \(([가-힣]{2,4})\),/);if(m&&m[2]!==m[3])pairs.push([m[2],m[3],+m[1]])}
 ok(pairs.length>50,'개명 쌍 로드 '+pairs.length);let merged=0;
 for(const [nw,old,y] of pairs){const A=ps.filter(p=>p.ko===nw),B=ps.filter(p=>p.ko===old);for(const a of A)for(const b of B){if(a.team===b.team&&a.type===b.type&&Math.abs(a.age-b.age)<=3&&a.dh&&b.dh&&a.dh.y===b.dh.y)ok(false,`개명 중복: ${old}→${nw} (${a.team}) 두 명 존재`)}}
 for(const p of ps)if(p.aka)merged++;ok(merged>=5,'개명 병합 선수 '+merged);
 // 사용자가 지적한 사례
 for(const [nw,old] of [['유로결','유장혁'],['장유호','장지수'],['최이준','최건'],['김무신','김윤수'],['신윤후','신용수'],['최지명','최채흥']]){ok(ps.filter(p=>p.ko===nw).length===1,`${nw} 한 명`);ok(ps.filter(p=>p.ko===old).length===0,`${old} 중복 제거`);const p=ps.find(x=>x.ko===nw);ok(p.aka&&p.aka.includes(old),`${nw} 이전 이름 기록`)}}
// 2) 런타임 점검기: 여러 팀으로 시작했을 때 오류 0, 일부러 중복을 만들면 잡아내는지
for(const [seed,team] of [[5,'Lions'],[6,'Eagles'],[7,'Tigers'],[8,'Heroes']]){const L=League.create(base,team,seed);const r=L.integrity();ok(r.checked>1000,'점검 대상 수');ok(r.errors.length===0,`${team} 시작 데이터 오류: ${r.errors.map(e=>e.text).join(' | ')}`)}
{const L=League.create(base,'Lions',9),S=L.S;const t='Eagles';const src=L.players(t).find(p=>p.type==='B'&&!p.foreign);
 // (a) 같은 팀 같은 이름·나이 중복
 const dup=JSON.parse(JSON.stringify(src));dup.id='BX1';dup.dh=undefined;dup.birth=undefined;S.players[dup.id]=dup;S.teams[t].ids.push(dup.id);let r=L.integrity();ok(r.errors.some(e=>e.code==='dup-name'),'같은 팀 중복 이름 감지');
 S.teams[t].ids.pop();delete S.players[dup.id];
 // (b) 같은 지명 이력
 const a=L.players('Bears').find(p=>p.dh&&p.dh.school&&p.type==='B'),b=L.players('Wiz').find(p=>p.type==='B'&&!p.dh);b.dh=JSON.parse(JSON.stringify(a.dh));r=L.integrity();ok(r.errors.some(e=>e.code==='dup-draft'),'같은 지명 이력 감지');b.dh=undefined;
 // (c) 두 팀 소속
 const x=L.players('Giants')[0];S.teams['Dinos'].ids.push(x.id);r=L.integrity();ok(r.errors.some(e=>e.code==='two-teams'||e.code==='team-mismatch'),'두 팀 소속 감지');S.teams['Dinos'].ids.pop();
 // (d) 같은 생년월일 + 같은 이름
 const c1=L.players('Twins').find(p=>p.type==='P'&&!p.foreign);const c2=JSON.parse(JSON.stringify(c1));c2.id='PX2';c2.team='Bears';c2.birth=c1.birth='2000-01-01';S.players[c2.id]=c2;S.teams['Bears'].ids.push(c2.id);r=L.integrity();ok(r.errors.some(e=>e.code==='dup-person'),'같은 생년월일·이름 감지');S.teams['Bears'].ids.pop();delete S.players[c2.id];
 // (e) 계약 이상값
 const q=L.players('Lions')[3];const old=q.contract;q.contract={salary:NaN,years:1};r=L.integrity();ok(r.errors.some(e=>e.code==='contract'),'계약 이상값 감지');q.contract=old;ok(L.integrity().errors.length===0,'복구 후 오류 0');}
// 3) 시즌을 지나도 오류가 생기지 않는지(드래프트·FA·은퇴·트레이드 포함)
{const L=League.create(base,'Tigers',11),S=L.S;L.faAdvance(75);L.closeFA();for(let y=0;y<3;y++){L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 const off=L.startOffseason();let r=L.integrity();ok(r.errors.length===0,`${S.year} 오프시즌 오류: ${r.errors.map(e=>e.text).join(' | ')}`);
 for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}L.finishContracts();const d=L.buildDraft();L.draftAiUntilUser();let gg=0;while(L.draftOnClock()&&gg++<200){if(L.draftOnClock()===S.userTeam){const b=d.pool.map(i=>S.players[i]).sort((a,b)=>L.scoutScore(b)-L.scoutScore(a))[0];if(L.draftPick(b.id))break}L.draftAiUntilUser();if(d.pick>=d.order.length)break}L.finishDraft();
 L.faAdvance(75);L.closeFA();L.startNewSeason();r=L.integrity();ok(r.errors.length===0,`${S.year} 새 시즌 오류: ${r.errors.map(e=>e.text).join(' | ')}`)}}
console.log('integrity tests ok',n);
