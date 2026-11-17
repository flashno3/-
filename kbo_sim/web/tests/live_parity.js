const ROOT=require('path').resolve(__dirname,'../..');const fs=require('fs');
const {createEngine}=require(ROOT+'/web/src/engine.js');
const DATA=JSON.parse(fs.readFileSync(ROOT+'/web/src/data.json','utf8'));
let bad=0,n=0;
for(const mode of ['forward','replay']){
  const E=createEngine(DATA,mode);const T=E.TEAMS;
  for(let seed=1;seed<=400;seed++){
    const h=T[seed%10],a=T[(seed*7+3)%10===seed%10?(seed%10+1)%10:(seed*7+3)%10];
    const gh=1+seed%144,ga=1+(seed*5)%144;const post=seed%4===0;const maxInn=post?15:11;
    const r1=new E.PyRandom(seed),r2=new E.PyRandom(seed);
    const [rh,ra,info]=E.game(h,a,gh,ga,r1,E.newStats(),{maxInn,post});
    const g=E.liveAI(h,a,gh,ga,r2,{maxInn,post});g.playToEnd();
    const same=g.score.home===rh&&g.score.away===ra&&JSON.stringify(g.inns)===JSON.stringify(info.inns)&&r1.random()===r2.random();
    n++;if(!same){bad++;if(bad<4)console.log('불일치',mode,seed,h,a,[rh,ra],[g.score.home,g.score.away]);}
  }
}
console.log('LiveGame vs game():',n,'경기 비교,','불일치',bad);process.exit(bad?1:0);
