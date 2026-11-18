const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',4);L.faAdvance(75);L.closeFA();const S=L.S,t=S.userTeam,set=S.teams[t].set;
// 라인업: 한 명이 빠져도 나머지 타순·포지션은 유지
const before=set.lineup.map(x=>x.id+':'+x.pos);const out=set.lineup[4];const pl=S.players[out.id];
const r=L.moveActive(pl.id,false);ok(r===null,'2군으로 내림 '+r);
const after=set.lineup.map(x=>x.id+':'+x.pos);ok(after.filter((x,i)=>x!==before[i]).length===1&&after[4]!==before[4]&&after[4].split(':')[1]===out.pos,'라인업은 해당 칸만 교체 '+before.join()+' → '+after.join());
ok(new Set(set.lineup.map(x=>x.id)).size===9&&set.lineup.every(x=>S.players[x.id].active),'라인업 유효');
ok(S.news.some(x=>/라인업 자동 보정/.test(x.text)),'보정 내역이 소식에 기록');
// 로테이션: 한 명이 빠져도 순서 유지, 빈 칸만 보충
const rot0=set.rotation.slice();const rp=S.players[rot0[2]];L.moveActive(rp.id,false);
ok(set.rotation.length===5&&set.rotation.filter((id,i)=>i!==2&&id===rot0[i]).length===4&&set.rotation[2]!==rot0[2]||set.rotation.filter(id=>rot0.includes(id)).length===4,'로테이션은 빠진 선수만 교체 '+rot0.map(id=>S.players[id].ko)+' → '+set.rotation.map(id=>S.players[id].ko));
ok(set.rotation.every(id=>S.players[id].active&&!L.isInj(S.players[id]))&&new Set(set.rotation).size===5,'로테이션 유효');
// 불펜: 마무리가 빠져도 나머지 구성 유지
const cl=set.bullpen.closer,su=set.bullpen.setup.slice();L.moveActive(cl,false);ok(set.bullpen.closer!==cl&&su.every(id=>id===set.bullpen.closer||set.bullpen.setup.includes(id)||id===cl),'불펜: 마무리만 교체');
// 부상 발생 시: 시즌을 돌려도 내 라인업이 항상 유효(경기 진행 가능)
let g=0;while(S.day<S.schedule.length&&g++<30){L.advance(8,false);ok(set.lineup.length===9&&set.lineup.every(x=>S.players[x.id]&&S.players[x.id].team===t&&S.players[x.id].active&&!L.isInj(S.players[x.id])),'시즌 중 라인업 유효 day '+S.day);ok(set.rotation.length===5&&set.rotation.every(id=>S.players[id].active&&!L.isInj(S.players[id])),'시즌 중 로테이션 유효')}
console.log('repair tests ok',n);
