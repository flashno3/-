const fs=require('fs'),assert=require('assert');let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const G=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json')),R=JSON.parse(fs.readFileSync(__dirname+'/../ratings_game_pk.json'));
// 퓨처스 보강: 24~26 합계 표본이 큰 선수는 1군 레이팅 그대로, 작은 선수 일부만 달라진다
const rb=Object.fromEntries(R.batters.map(b=>[b.name+'|'+b.team,b.p]));let same=0,diff=0,bigDiff=0;
for(const p of G.players){if(p.type!=='B'||p.src==='F')continue;const r=rb[p.name+'|'+p.team];if(!r)continue;const d=Math.max(...['k','bb','hr','babip','xbh','sba'].map(k=>Math.abs(p.p[k]-r[k])));if(d<1e-9)same++;else{diff++;if(p.PA>=150)bigDiff++}}
ok(same>150&&diff>40&&diff<130,'타자 보강 대상 수 '+diff+' / 변경 없음 '+same);ok(bigDiff===0,'2026 150타석 이상 타자는 변경 없음 '+bigDiff);
const g=k=>G.players.find(p=>p.ko===k&&p.team==='Eagles'&&p.type==='B');
ok(g('허인서').p.k===rb[g('허인서').name+'|Eagles'].k,'허인서(합계 490타석)는 레이팅 그대로');
ok(g('장규현').p.k>rb[g('장규현').name+'|Eagles'].k&&g('장규현').p.k<0.19,'장규현(합계 59타석): 퓨처스 반영으로 삼진율 소폭 이동 '+g('장규현').p.k);
// 투수는 삼진·볼넷만
const rp=Object.fromEntries(R.pitchers.map(b=>[b.name+'|'+b.team,b.p]));let hrChg=0,kChg=0;
for(const p of G.players){if(p.type!=='P'||p.src==='F')continue;const r=rp[p.name+'|'+p.team];if(!r)continue;if(Math.abs(p.p.hr-r.hr)>1e-9||Math.abs(p.p.babip-r.babip)>1e-9)hrChg++;if(Math.abs(p.p.k-r.k)>1e-9)kChg++}
ok(hrChg===0&&kChg>40,'투수는 삼진·볼넷만 반영(피홈런·인플레이 타율 변경 없음) '+kChg);
console.log('blend tests ok',n);
