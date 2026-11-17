const ROOT=require('path').resolve(__dirname,'../..');
const fs=require('fs');const {createEngine}=require(ROOT+'/web/src/engine.js');
const DATA=JSON.parse(fs.readFileSync(ROOT+'/web/src/data.json','utf8'));
const mode=process.argv[2];const N=+process.argv[3];const E=createEngine(DATA,mode);
const KO={Bears:'두산',Twins:'LG',Heroes:'키움',Landers:'SSG',Wiz:'KT',Eagles:'한화',Tigers:'KIA',Giants:'롯데',Dinos:'NC',Lions:'삼성'};
let bad=[];const champ={},ksApp={},seedChamp=[0,0,0,0,0],len={},wcHi=[0,0],draws=[0,0];let t0=Date.now(),tPost=0,games=0;
const ksLen={4:0,5:0,6:0,7:0};const hiWin={wc:[0,0],sf:[0,0],po:[0,0],ks:[0,0]};
for(let i=0;i<N;i++){
  const s=new E.Season(5000+i);s.playAll();const st=s.standings();
  const t1=Date.now();const P=E.playPostseason(s);tPost+=Date.now()-t1;
  const [wc,sf,po,ks]=P.rounds;
  // 대진 불변식
  const T=k=>st[k].team;
  if(wc.hi!==T(3)||wc.lo!==T(4))bad.push(['WC대진',i]);
  if(sf.hi!==T(2)||sf.lo!==wc.winner)bad.push(['준PO대진',i]);
  if(po.hi!==T(1)||po.lo!==sf.winner)bad.push(['PO대진',i]);
  if(ks.hi!==T(0)||ks.lo!==po.winner)bad.push(['KS대진',i]);
  for(const r of [sf,po,ks]){
    const w=r.wins;if(!(w[r.winner]===r.need&&w[r.winner===r.hi?r.lo:r.hi]<r.need))bad.push(['종료조건',r.name,i,w]);
    const real=r.games.filter(g=>!g.draw);const total=real.length;
    if(total!==w[r.hi]+w[r.lo])bad.push(['경기수',r.name,i]);
    // 홈 패턴
    const pat=r.need===4?['H','H','L','L','L','H','H']:['H','H','L','L','H'];let slot=0;
    for(const g of r.games){const exp=pat[slot%pat.length]==='H'?r.hi:r.lo;if(g.home!==exp)bad.push(['홈패턴',r.name,i,slot]);if(!g.draw)slot++;}
    if(!r.games.every(g=>g.draw||g.rh!==g.ra))bad.push(['동점승부',i]);
  }
  if(wc.games.length<1||wc.games.length>2)bad.push(['WC경기수',i]);
  const hiAdv=wc.winner===wc.hi; wcHi[hiAdv?0:1]++;
  hiWin.wc[wc.winner===wc.hi?0:1]++;hiWin.sf[sf.winner===sf.hi?0:1]++;hiWin.po[po.winner===po.hi?0:1]++;hiWin.ks[ks.winner===ks.hi?0:1]++;
  champ[P.champion]=(champ[P.champion]||0)+1;seedChamp[P.seeds.indexOf(P.champion)]++;
  ksLen[ks.games.filter(g=>!g.draw).length]++;
  for(const r of P.rounds)for(const g of r.games){games++;if(g.draw)draws[0]++;draws[1]++;}
}
console.log(mode,N,'시즌 | 총',((Date.now()-t0)/N).toFixed(0),'ms/시즌 (포스트시즌',(tPost/N).toFixed(1),'ms) | 포스트시즌 총',games,'경기, 무승부',draws[0]);
console.log('불변식 위반:',bad.length,bad.slice(0,5));
console.log('상위 시드 시리즈 승리율  WC(4위)',(hiWin.wc[0]/N*100).toFixed(0)+'%','준PO(3위)',(hiWin.sf[0]/N*100).toFixed(0)+'%','PO(2위)',(hiWin.po[0]/N*100).toFixed(0)+'%','KS(1위)',(hiWin.ks[0]/N*100).toFixed(0)+'%');
console.log('우승 시드 분포(1~5위)',seedChamp.map(x=>(x/N*100).toFixed(0)+'%').join(' / '));
console.log('KS 시리즈 길이',Object.entries(ksLen).map(([k,v])=>k+'경기 '+(v/N*100).toFixed(0)+'%').join(', '));
console.log('우승팀',Object.entries(champ).sort((a,b)=>b[1]-a[1]).map(([t,v])=>KO[t]+' '+(v/N*100).toFixed(0)+'%').join(' | '));
