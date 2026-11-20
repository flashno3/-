/* 구장 계획(사용자 제공 자료): 잠실 임시 이전 이원화·청라돔 객단가·한화 증축·수용량 갱신 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',5),S=L.S;
// 수용량(공식 판매 좌석)
const CAP={Lions:24000,Giants:23200,Tigers:20500,Wiz:18700,Dinos:17891,Heroes:16000,Landers:23000,Eagles:17000,Twins:23750,Bears:23750};
for(const t of Object.keys(CAP))ok(S.fin.teams[t].cap===CAP[t],`수용량 ${t} ${S.fin.teams[t].cap}`);
ok(JSON.stringify(S.fin.teams.Eagles.capchg)==='[[2028,20000]]','한화 2028 증축 20,000');ok(JSON.stringify(S.fin.teams.Twins.capchg)==='[[2027,18000],[2032,30673]]'&&JSON.stringify(S.fin.teams.Bears.capchg)==='[[2027,18000],[2032,30673]]','잠실 18,000 → 2032 잠실돔 30,673');
// 연도별 수용량·이원화 범위
for(const [y,cap,tier] of [[2027,18000,true],[2031,18000,true],[2032,30673,false],[2040,30673,false]]){S.year=y;for(const t of ['Twins','Bears']){ok(L.finCap(t)===cap,`${t} ${y} 정규 수용량 ${L.finCap(t)}`);ok(!!L.finTier(t)===tier,`${t} ${y} 이원화 ${tier}`)}}
S.year=2030;ok(L.finCapPS('Twins')===30000&&L.finCapPS('Bears')===30000,'잠실 포스트시즌 3층 개방 30,000');ok(L.finCapPS('Lions')===24000&&L.finCapPS('Eagles')===20000,'다른 구단 포스트시즌은 일반 수용량(한화 2028 증축 반영)');S.year=2032;ok(L.finCapPS('Twins')===30673,'2032 이후는 잠실돔 수용량');
S.year=2027;ok(L.finCapPS('Twins')===30000,'2027 포스트시즌');
// 객단가 배율
for(const [t,y,m] of [['Twins',2027,1.12],['Twins',2031,1.12],['Twins',2032,1],['Bears',2029,1.12],['Landers',2027,1],['Landers',2028,1.15],['Landers',2035,1.15],['Lions',2030,1],['Eagles',2028,1]]){S.year=y;ok(Math.abs(L.finPriceMult(t)-m)<1e-12,`객단가 ${t} ${y}`)}
// 빅매치: 잠실 라이벌전 + 홈 개막전 + 어린이날 홈경기, 일반 경기는 아님
S.year=2027;const day5=(()=>{for(let d=0;d<S.schedule.length;d++){const dt=L.dateOf(d);if(dt.getUTCMonth()===4&&dt.getUTCDate()===5)return d}return -1})();
ok(L.isBigMatch('Twins','Bears')&&L.isBigMatch('Bears','Twins'),'라이벌전은 빅매치');{const f=S.fin.teams.Twins,g0=f.games;f.games=5;ok(!L.isBigMatch('Twins','Lions')&&!L.isBigMatch('Lions','Twins'),'일반 경기·다른 구단 홈은 빅매치 아님');f.games=0;ok(L.isBigMatch('Twins','Lions'),'홈 개막전(그 팀의 첫 홈경기)은 빅매치');ok(!L.isBigMatch('Lions','Twins'),'다른 구단의 개막전은 아님');f.games=g0}
if(day5>=0){const f=S.fin.teams.Twins,g0=f.games;f.games=7;S.day=day5;ok(L.isBigMatch('Twins','Lions')&&!L.isBigMatch('Lions','Twins'),'어린이날 잠실 홈경기는 빅매치(다른 구단은 아님)');S.day=0;f.games=g0}
S.year=2032;ok(!L.isBigMatch('Twins','Bears'),'2032 이후에는 이원화 없음');S.year=2027;
// 관중 상한: 일반 13,000, 빅매치는 24,000까지(수요가 충분할 때)
{const f=S.fin.teams.Twins;ok(L.finAtt('Twins',false)===18000,'일반 경기 18,000 상한');const big=L.finAtt('Twins',true);ok(big>18000&&big<=30000,'빅매치는 더 많이(3층 개방) '+big);ok(L.finAtt('Lions',true)===L.finAtt('Lions',false),'이원화 구장이 아니면 빅매치 구분 없음');
 const g=L.finGateAvg('Twins');ok(Math.abs(g-((1-10/72)*18000+10/72*big)*f.price*f.pm*1.12)<1e-9,'예상 평균 입장 수입(이원화 가중)');ok(Math.abs(L.finGateAvg('Lions')-L.finAtt('Lions')*S.fin.teams.Lions.price*S.fin.teams.Lions.pm)<1e-12,'다른 구단은 기존 식 그대로');}
// 시즌 시뮬레이션: 잠실 구단 입장 수입이 정규 18,000 상한·객단가 1.12 배율로 누적, 다른 구단은 그대로
{const A=League.create(base,'Lions',5);A.faAdvance(75);A.closeFA();A.advance(300,false);const fa=A.S.fin.teams;
 for(const t of ['Twins','Bears']){const f=fa[t];ok(f.games>=60,'홈경기 수 '+f.games);const per=f.gate/f.games/(f.price*f.pm*1.12);ok(per<=30000&&per>=15000,`${t} 홈경기 평균 관중 ${Math.round(per)} (18,000 상한 + 빅매치 소수)`);ok(per>17000&&per<20500,`${t} 대부분 18,000 근처 ${Math.round(per)}`)}
 const perL=fa.Lions.gate/fa.Lions.games/(fa.Lions.price*fa.Lions.pm);ok(perL>20000&&perL<=24000,'삼성은 24,000 이내 '+Math.round(perL));
 const P=A.startPostseason();ok(Array.isArray(P.seeds),'포스트시즌');}
// 이전 버전 대비: 같은 시드 1시즌 순위는 재정 데이터와 무관하게 동일(재정은 시즌 중 경기 결과에 영향이 없다)
console.log('stadium tests ok '+n);
