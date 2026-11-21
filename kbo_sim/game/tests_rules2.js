/* 2026 KBO 규약 원문 대조 반영: 최저연봉 3,300만원(제71조) · 11라운드·대졸 1명 의무(제110조) · FA 영입 한도(제173조) · 아시아쿼터 부상 대체(외국인선수 고용규정 제8·10조) */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const TEAMS=['Bears','Twins','Heroes','Landers','Wiz','Eagles','Tigers','Giants','Dinos','Lions'];
// 1) 최저연봉
{const L=League.create(base,'Lions',9),S=L.S;ok(L.minSal()===0.33&&L.minSal(2026)===0.3,'최저연봉 연도별');
 for(const t of TEAMS)for(const p of L.players(t))if(p.contract.salary>0)ok(p.contract.salary>=0.33-1e-9,`${t} ${p.ko} 연봉 ${p.contract.salary} < 0.33`);
 ok(S.minLift&&TEAMS.every(t=>S.minLift[t]>=0)&&TEAMS.some(t=>S.minLift[t]>0),'최저연봉 인상분 기록');
}
// 2) 드래프트 11라운드 + 대졸 예정자 1명 이상
{const L=League.create(base,'Lions',9),S=L.S;L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
 L.startOffseason();L.finishContracts();const d=L.buildDraft();ok(d.rounds===11&&d.order.length===110&&d.pool.length>=110,'11라운드 110명 '+d.order.length+'/'+d.pool.length);
 const U=S.userTeam;let guard=0,err=null;
 while(L.draftOnClock()&&guard++<400){ if(L.draftOnClock()===U){
   // 내 마지막 지명: 대졸 아닌 선수는 거절돼야 한다(아직 대졸 미지명일 때)
   const last=!d.order.slice(d.pick+1).includes(U),has=d.picks.some(x=>x.team===U&&S.players[x.id].pro&&S.players[x.id].pro.univ);
   const non=d.pool.find(id=>!(S.players[id].pro&&S.players[id].pro.univ)),un=d.pool.find(id=>S.players[id].pro&&S.players[id].pro.univ);
   if(last&&!has&&non){const e=L.draftPick(non);ok(e&&e.includes('대졸'),'마지막 지명에서 비대졸 거절: '+e);}
   const pick=(last&&!has&&un)?un:(d.pool.find(id=>!(S.players[id].pro&&S.players[id].pro.univ))||d.pool[0]);   // 일부러 비대졸 위주로 뽑아 의무 규칙을 시험
   err=L.draftPick(pick);ok(!err,'지명 '+err);
 } else L.draftAiUntilUser(); }
 ok(d.pick===110,'드래프트 종료 '+d.pick);
 for(const t of TEAMS){const mine=d.picks.filter(x=>x.team===t);ok(mine.length===11,t+' 11명');ok(mine.some(x=>S.players[x.id].pro&&S.players[x.id].pro.univ),t+' 대졸 예정자 1명 이상');}
 for(const x of d.picks)ok(S.players[x.id].contract.salary>=0.33-1e-9,'신인 연봉 하한');
 L.finishDraft();}
// 3) FA 영입 한도(제173조)
{const L=League.create(base,'Lions',9),S=L.S;ok(L.faExtLimit()===3,'2027 시작: 승인 22명 → 3명 '+L.faExtLimit()+' n='+S.faSign.n);
 const lim=n=>{S.faSign={k:S.faSign.k,c:{},n};return L.faExtLimit()};ok(lim(5)===1&&lim(10)===1&&lim(11)===2&&lim(20)===2&&lim(21)===3&&lim(30)===3&&lim(31)===4&&lim(40)===4&&lim(null)===3,'신청자 수 구간별 한도');}
// 4) 아시아쿼터 부상 대체는 tests_foreign.js 에서 검증
console.log('rules2 tests ok',n);
