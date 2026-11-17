// 퓨처스 타자 데이터 검증: 입력 정합성(AVG/SLG 재계산), 환산 결과의 범위, 게임 내 반영
const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}};
// 1) 원본 기록 정합성
const rows=fs.readFileSync(path.join(__dirname,'data/futures_bat_2026.txt'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/\s+/));
let bad=0;const ids=new Set();
for(const t of rows){const v=t.slice(4).map(Number),[avg,G,PA,AB,R,H,B2,B3,HR,RBI,SB,BB,HBP,SO,SLG]=v;
 if(AB&&Math.abs(H/AB-avg)>0.0006)bad++;if(AB&&Math.abs((H+B2+2*B3+3*HR)/AB-SLG)>0.0006)bad++;if(H<B2+B3+HR||PA<AB+BB+HBP)bad++;if(ids.has(t[2]))bad++;ids.add(t[2]);}
ok(bad===0,'원본 기록 불일치 '+bad);console.log('원본 기록',rows.length,'행 검증');
// 1b) 투수 원본 기록 정합성(ERA 재계산)
const prow=fs.readFileSync(path.join(__dirname,'data/futures_pit_2026.txt'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/\s+/));
let pbad=0;const pids=new Set();
for(const t of prow){const v=t.slice(3),era=v[0]==='-'?null:+v[0],ip=v[6].split('.'),outs=+ip[0]*3+ +ip[1],ER=+v[13],R=+v[12];
 if(outs>0&&era!==null&&Math.abs(ER*27/outs-era)>0.011)pbad++;if(ER>R)pbad++;if(pids.has(t[1]))pbad++;pids.add(t[1]);}
ok(pbad===0,'투수 원본 기록 불일치 '+pbad);console.log('투수 기록',prow.length,'행 검증');
// 2) 게임 데이터
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
const L=League.create(base,'Lions',9),S=L.S;const FA=Object.values(S.players).filter(p=>p.src==='F'),F=FA.filter(p=>p.type==='B'),FP=FA.filter(p=>p.type==='P');
ok(FP.length>=180,'신규 2군 투수 수 '+FP.length);
const PR={k:[.08,.4],bb:[.02,.18],hr:[.004,.06],babip:[.25,.37]};for(const p of FP){for(const k in PR)if(!(p.p[k]>=PR[k][0]&&p.p[k]<=PR[k][1])){ok(false,p.ko+' '+k+' '+p.p[k]);break}ok(p.team in S.teams&&(p.role==='SP'||p.role==='RP')&&p.stamina>=20&&p.stamina<=80,p.ko+' 투수 필드')}
ok(Object.keys(S.teams).every(t=>L.pitchers(t).filter(p=>!p.active).length>=8&&L.hitters(t).filter(p=>!p.active).length>=9),'팀별 2군 풀');
ok(F.length>=170,'신규 2군 타자 수 '+F.length);
const R={k:[.06,.45],bb:[.015,.2],hr:[.002,.07],babip:[.24,.39],xbh:[.1,.32],sba:[.005,.25]};
for(const p of F){for(const k in R)if(!(p.p[k]>=R[k][0]&&p.p[k]<=R[k][1])){ok(false,p.ko+' '+k+' 범위 '+p.p[k]);break}
 ok(p.team in S.teams&&p.gs[p.pos]>0&&p.fr[p.pos],p.ko+' 필드');}
ok(new Set(F.map(p=>p.fpid)).size===F.length,'fpid 중복');
// 겹치는 선수 중복 생성 없음: 같은 팀 같은 이름 타자는 1명(동명이인 제외 목록)
const dup={};for(const p of Object.values(S.players))if(p.type==='B'){const k=p.team+p.ko;dup[k]=(dup[k]||0)+1}
console.log('같은 팀 동명 타자',Object.entries(dup).filter(([k,v])=>v>1).map(([k])=>k).join(' ')||'없음');
// 환산 후 평균 OVR이 1군 주전(PA>=300)보다 낮다
const m=a=>a.reduce((x,y)=>x+L.ovr(y),0)/a.length;ok(m(F)<m(Object.values(S.players).filter(p=>p.type==='B'&&p.PA>=300))-5,'신규 평균 OVR이 주전보다 충분히 낮아야 함');
// 시즌 1회 완주: 2군 경기 정상
L.advance(300,false);ok(L.standings2().every(x=>x.w+x.l+x.d===144),'2군 144경기');
console.log(fail?'실패 '+fail:'모두 통과');process.exit(fail?1:0);
