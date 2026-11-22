/* 관중 수요 모델: 매진으로 잘린 관측치에서 잠재 수요를 복원하고, 좌석 확장·성적·가격에 반응한다 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9),S=L.S,T=Object.keys(S.fin.teams);
// 1) 시작 시점 기대 관중 = 2026 실제 평균(좌석 변경이 없는 구단)
for(const t of T){const f=S.fin.teams[t];if(L.finCap(t)===f.cap)ok(Math.abs(L.finAtt(t)-f.att0)<=1,t+' 기대 관중 = 실제 평균 '+L.finAtt(t)+' vs '+f.att0);ok(L._dem(f)>=f.att0,t+' 잠재 수요 ≥ 관측')}
// 2) 점유율이 높은 구단은 잠재 수요가 좌석보다 크다
ok(L._dem(S.fin.teams.Lions)>L.finCap('Lions')*1.2,'삼성 잠재 수요 > 좌석 120%');ok(L._dem(S.fin.teams.Dinos)<S.fin.teams.Dinos.att0*1.1,'점유율 낮은 구단은 관측과 거의 같음');
// 3) 좌석 확장: 한화 2028(17,000 → 20,000)은 관중이 늘고 점유율이 80%를 크게 밑돌지 않는다
{const f=S.fin.teams.Eagles,a0=L.finAtt('Eagles');S.year=2028;const a1=L.finAtt('Eagles'),cap=L.finCap('Eagles');ok(cap===20000&&a1>a0*1.08,'확장 후 관중 증가 '+a0+'→'+a1);ok(a1/cap>=0.85,'확장 후 점유율 '+Math.round(a1/cap*100)+'%');S.year=2027}
// 4) 성적: 승률이 높을수록 관중↑이지만 매진 구단은 덜 민감
{const g=t=>{const o={};for(const w of [0.4,0.6]){S.rec[t]=[w*100,(1-w)*100,0,0,0];o[w]=L.finAtt(t)}return o[0.6]/o[0.4]-1};const rG=g('Giants'),rL=g('Lions');ok(rG>0.05,'승률 40→60%: 중간 점유 구단 관중 +'+(rG*100).toFixed(1)+'%');ok(rL<rG*0.5,'매진 구단은 덜 민감 '+(rL*100).toFixed(1)+'% < '+(rG*100).toFixed(1)+'%')}
// 5) 가격: 매진 구단은 가격을 올려도 관중이 거의 줄지 않는다
{for(const t of T)S.rec[t]=[0,0,0,0,0];const f=S.fin.teams.Lions,a0=L.finAtt('Lions');f.pm=1.2;const a1=L.finAtt('Lions');f.pm=1;const g=S.fin.teams.Dinos,d0=L.finAtt('Dinos');g.pm=1.2;const d1=L.finAtt('Dinos');g.pm=1;ok(a1/a0>0.97,'매진 구단: 가격 +20%에도 관중 유지 '+a1+'/'+a0);ok(d1/d0<0.93,'여유 구단: 가격 +20%에 관중 감소 '+d1+'/'+d0)}
// 6) 구버전 저장 파일(잠재 수요 없음)도 처음 쓸 때 복원
{const f=S.fin.teams.Wiz;delete f.dem;ok(L.finAtt('Wiz')>0&&f.dem>0,'dem 복원')}
console.log('demand tests ok',n);
