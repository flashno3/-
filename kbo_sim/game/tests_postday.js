/* 포스트시즌 시간 흐름: 경기마다 날짜가 흐르고 부상 회복·투수 피로 회복이 진행된다 */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',12);L.faAdvance(75);L.closeFA();L.advance(300,false);const S=L.S,U=S.userTeam;
const d0=L.todayN();const P=L.startPostseason();ok(S.phase==='post'&&P.day===0,'포스트시즌 시작 day 0');
ok(L.todayN()===d0||L.todayN()===d0,'시작일 '+L.postDateStr());
// 내 팀 투수 피로 100·부상자 3일 뒤 복귀
const sp=L.players(U).find(p=>p.type==='P'&&p.role==='SP');sp.fat=100;const hurt=L.players(U).find(p=>p.type==='B'&&!p.foreign);hurt.inj={dx:'테스트',since:'x',ret:'x',retN:L.todayN()+3,apply:true,generated:true};
ok(L.isInj(hurt),'부상 중');
let g=0,last=L.todayN(),days=[];while(!P.done&&g++<60){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame();const t=L.todayN();ok(t>=last,'날짜 역행 없음');if(t>last)days.push(t-last);last=t;if(g===5){ok(sp.fat<100,'피로 회복 '+sp.fat)}if(g===6)ok(!L.isInj(hurt),'부상 3일 후 회복 g='+g)}
ok(P.done&&P.day>=g,'포스트시즌 종료 day '+P.day+' 경기 '+g);ok(L.todayN()-d0===P.day,'달력 = 경기일 수');ok(/\d+월 \d+일/.test(L.postDateStr()),'날짜 문자열 '+L.postDateStr());
ok(S.phase==='post_done','post_done');
console.log('postday tests ok',n,'경기',g,'일수',P.day,L.postDateStr());
