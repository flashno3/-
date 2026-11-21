/* 2단계 엔진 보정: 홈 어드밴티지(홈 승률 51.5~52.1%) · 선발 3바퀴째 효과(리그 평균 불변) · 볼넷 보정 · 트레이드 캡 일관성 */
const fs=require('fs'),assert=require('assert');const {League,rngFor}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',4);L.faAdvance(75);L.closeFA();const E=L.engine();const T=['Lions','Tigers','Bears','Twins','Giants','Wiz','Landers','Dinos','Heroes','Eagles'];
const sim=(N,seed)=>{let hw=0,aw=0,R=0,G=0;const s={K:0,BB:0,HR:0,PA:0,'1B':0,'2B':0,'3B':0,HBP:0,SF:0};for(let i=0;i<N;i++){const h=T[i%10],a=T[(i*7+3)%10];if(h===a)continue;const r=rngFor(seed,i,1,1),st=E.newStats();const [rh,ra]=E.game(h,a,1+i%140,1+i%140,r,st,null);G++;R+=rh+ra;for(const k in s)s[k]+=st[k]||0;if(rh>ra)hw++;else if(ra>rh)aw++}
 const H=s['1B']+s['2B']+s['3B']+s.HR,ab=s.PA-s.BB-s.HBP-s.SF;return {home:hw/(hw+aw),rpg:R/G/2,avg:H/ab,k:s.K/s.PA,bb:s.BB/s.PA,hr:s.HR/s.PA}};
// 상수·정규화: 3바퀴째 배율의 선발 타석 가중 평균이 1(리그 평균 불변)
{const w=[0.377,0.350,0.273],t=E.env.tto;ok(t.length===3,'3구간');for(let j=0;j<4;j++){const m=w.reduce((a,x,i)=>a+x*t[i][j],0);ok(Math.abs(m-1)<0.004,`배율 ${j} 가중 평균 ${m}`)}
 ok(t[0][0]>t[1][0]&&t[1][0]>t[2][0],'삼진 배율 감소');ok(t[0][2]<t[1][2],'홈런 배율 1바퀴째 낮음');ok(t[0][3]<t[1][3]&&t[1][3]<t[2][3],'BABIP 배율 증가');ok(E.env.hfa>0&&E.env.bbs>=1,'홈·볼넷 설정')}
// 홈 승률 51.5~52.1% 부근, 리그 평균 지표는 홈 어드밴티지를 껐을 때와 같다
{const a=sim(14000,21);ok(a.home>0.505&&a.home<0.532,`홈 승률(무승부 제외) ${(a.home*100).toFixed(1)}%`);
 const save=E.env.hfa;E.env.hfa=0;const b=sim(14000,21);E.env.hfa=save;ok(Math.abs(a.avg-b.avg)<0.003&&Math.abs(a.rpg-b.rpg)<0.12,`리그 평균 불변 AVG ${a.avg.toFixed(3)}/${b.avg.toFixed(3)} R/G ${a.rpg.toFixed(2)}/${b.rpg.toFixed(2)}`);ok(b.home<a.home-0.012,`끄면 홈 승률 낮음 ${(b.home*100).toFixed(1)}`);
 ok(a.avg>0.262&&a.avg<0.274&&a.bb>0.088&&a.bb<0.099&&a.hr>0.022&&a.hr<0.027&&a.rpg>4.6&&a.rpg<5.3,`리그 지표 범위 AVG ${a.avg.toFixed(3)} BB ${(a.bb*100).toFixed(1)} HR ${(a.hr*100).toFixed(2)} R/G ${a.rpg.toFixed(2)}`)}
// 3바퀴째 효과: 선발 상대 타석을 구간별로 나눠 삼진율·홈런율이 방향대로, 켜고 끈 리그 평균은 같음
{const tot=[{pa:0,k:0,hr:0},{pa:0,k:0,hr:0},{pa:0,k:0,hr:0}];const bk=(on)=>{const save=E.env.tto;if(!on)E.env.tto=0;for(const t of tot){t.pa=t.k=t.hr=0}
  for(let i=0;i<5000;i++){const h=T[i%10],a=T[(i*7+3)%10];if(h===a)continue;const r=rngFor(31,i,1,1);const [LH,AH]=E.lineup(h,1+i%140,r,false),[LA,AA]=E.lineup(a,1+i%140,r,false);const SH=new E.StaffState(E.staff(h,1+i%140),r,null),SA=new E.StaffState(E.staff(a,1+i%140),r,null);
   const gm=new E.LiveGame({home:h,away:a,lineups:{home:{L:LH,assign:AH},away:{L:LA,assign:AA}},staff:{home:SH,away:SA},rng:r,maxInn:9,fatigue:false});const cnt=new Map();let seen=0;
   while(!gm.finished){const b0=gm.log.length;gm.step();for(let j=b0;j<gm.log.length;j++){const x=gm.log[j];if(x.k!=='PA')continue;const ss=gm.staff.home.sp===x.p?gm.staff.home:gm.staff.away.sp===x.p?gm.staff.away:null;if(!ss)continue;const c=(cnt.get(x.p.id)||0);cnt.set(x.p.id,c+1);const t=tot[Math.min(2,Math.floor(c/9))];t.pa++;if(x.e==='K')t.k++;if(x.e==='HR')t.hr++}}}
  E.env.tto=save;return tot.map(t=>({k:t.k/t.pa,hr:t.hr/t.pa,pa:t.pa}))};
 const on=bk(true),off=bk(false);ok(on[0].pa>8000&&on[2].pa>3000,'표본 '+on.map(x=>x.pa));ok(on[2].hr>on[0].hr*1.02,`홈런율 3바퀴>1바퀴 ${(on[0].hr*100).toFixed(2)}→${(on[2].hr*100).toFixed(2)}`);
 {const ron=on[2].k/on[0].k,roff=off[2].k/off[0].k,rel=ron/roff;ok(rel>0.76&&rel<0.95,`3바퀴째 삼진율 하락 효과(켠/끈 비율) ${rel.toFixed(2)} (기대 0.85, 켠 ${ron.toFixed(2)} 끈 ${roff.toFixed(2)})`)}}
// 브리핑 확률에 홈 어드밴티지 반영(홈 타자 > 원정 타자)
{const L2=League.create(base,'Lions',4);L2.faAdvance(75);L2.closeFA();const E2=L2.engine(),b=Object.values(E2.batById)[40],p=Object.values(E2.pitById)[40],dm=[0,1,0.2];const ph=E2.paProbs(b,p,dm,'Lions',E2.homeMod(1)),pa=E2.paProbs(b,p,dm,'Lions',E2.homeMod(-1));ok(ph.HR>pa.HR&&ph['1B']>pa['1B'],'홈 타자 확률이 더 높음')}
// 트레이드 캡 일관성
{const L3=League.create(base,'Lions',5);L3.faAdvance(75);L3.closeFA();const S=L3.S,t=S.userTeam;const AI='Tigers';const mine=L3.players(t).filter(p=>!p.foreign&&p.rookie!==S.year).sort((a,b)=>L3.cbtVal(a)-L3.cbtVal(b));const big=L3.players(AI).filter(p=>!p.foreign&&p.rookie!==S.year).sort((a,b)=>L3.cbtVal(b)-L3.cbtVal(a))[0];
 const cheap=mine[0];const k0=S.calib.cbtK||1;ok(L3.capBlockTrade(t,[big],[cheap])===null,'여유가 있으면 통과');
 S.calib.cbtK=k0*(L3.cbtCap(S.year)-L3.cbtVal(big)*0.4)/L3.cbtPay(t,false);L3.invalidate();const m=L3.capBlockTrade(t,[big],[cheap]);ok(typeof m==='string'&&/트레이드할 수 없습니다/.test(m),'상한 초과 트레이드 차단 '+m);
 const ev=L3.evaluateTrade(AI,[cheap.id],[big.id]);ok(!ev.ok&&/경쟁균형세 상한/.test(ev.why||''),'evaluateTrade가 사유를 돌려줌 '+ev.why);ok(L3.capBlockTrade(t,[cheap],[big])===null,'보수를 줄이는 트레이드는 허용');
 L3.setAllowOver(true);ok(L3.capBlockTrade(t,[big],[cheap])===null,'허용 토글');L3.setAllowOver(false)}
console.log('env2 tests ok',n);
