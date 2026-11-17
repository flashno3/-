const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
const N=+process.argv[2]||12;const SEED=+process.argv[3]||5;const L=League.create(base,'Wiz',SEED);const S=L.S,U='Wiz';
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;const champs={};const rows=[];
for(let y=0;y<N;y++){
  L.advance(300,false);const st=L.standings();let tr=0,tg=0;for(const x of st){if(x.team===U)continue;tr+=x.rs;tg+=x.w+x.l+x.d}
  const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}
  champs[P.champion]=(champs[P.champion]||0)+1;
  const lv=L.talentLevel();const live=Object.values(S.players).filter(p=>p.team in S.teams);const B=live.filter(p=>p.type==='B'),Pp=live.filter(p=>p.type==='P');
  rows.push([S.year,tr/tg,lv.B,lv.P,mean(B.map(p=>p.age)),S.teams[U].ids.length,L.payroll(U),(S.fa||[]).length,st[0].pct-st[9].pct]);
  L.startOffseason();const o=S.off;for(const id of o.rep.expiring.slice())if(L.ovr(S.players[id])>=48)L.resign(id,2);L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();
  for(const p of L.faList().sort((a,b)=>L.war(b)-L.war(a)).slice(0,3))L.signFA(p.id,2);L.finishFA();L.startNewSeason();
}
console.log('연도  AI득점/G  타자수준(런)  투수수준  평균나이(전체)  내팀인원  연봉   FA풀  1-10위 승률차');
for(const r of rows)console.log(r[0],r[1].toFixed(2),'   ',r[2].toFixed(1),'      ',r[3].toFixed(1),'     ',r[4].toFixed(1),'      ',r[5],'     ',r[6].toFixed(1),' ',r[7],'  ',r[8].toFixed(3));
console.log('기준선',JSON.stringify(Object.fromEntries(Object.entries(S.calib.base).map(([k,v])=>[k,+v.toFixed(1)]))),'| 보정 폭(마지막)',JSON.stringify(S.lastAdj));
console.log('우승 분포',Object.entries(champs).sort((a,b)=>b[1]-a[1]).map(([t,v])=>t+' '+v).join(', '));
