/* 재정 성장 가정(객단가·MD·모기업 광고·운영비·시장 연봉): 설정, 연도별 갱신, 끄기, 장기 안정성 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const near=(a,b,e)=>Math.abs(a-b)<=(e===undefined?1e-9:e);
const season=L=>{L.advance(300,false);const P=L.startPostseason();let g=0;while(!P.done&&g++<100){if(L.userInPost()){const c=L.startUserPostGame();c.live.playToEnd();L.finishUserPostGame(c)}else L.simPostGame()}};
const nextSeason=L=>{const S=L.S,off=L.startOffseason();for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();L.faAdvance(75);L.closeFA();L.startNewSeason();return off};
// 1) 설정과 연도별 인상률
{const L=League.create(base,'Lions',5),S=L.S;const E=L.econ();ok(E.on&&E.price===0.0575&&E.priceJam===0.0275&&E.jamJump===0.30&&E.par===0.025&&E.cost===0.05&&E.sal===0.05&&E.mdK===1.3,'기본 가정값');
 for(const y of [2028,2029,2030,2031]){ok(near(L.priceGrowth('Twins',y),0.0275)&&near(L.priceGrowth('Bears',y),0.0275),`잠실 ${y} +2.75%`);ok(near(L.priceGrowth('Lions',y),0.0575),`다른 구단 ${y} +5.75%`)}
 ok(near(L.priceGrowth('Twins',2032),1.30*1.12-1),'2032 돔 개장: 실효 +30%(임시 구장 ×1.12 해제분 보상)');ok(near((1+L.priceGrowth('Twins',2032))*L.finPriceMult('Twins',2032)/L.finPriceMult('Twins',2031),1.30),'실효 가격 점프 1.30');ok(near(L.priceGrowth('Twins',2033),0.0575),'2033부터 일반 인상률');ok(near(L.priceGrowth('Landers',2028),0.0575),'SSG는 일반 인상률(청라돔 ×1.40은 별도 배율)');
 S.econ={on:false};ok(L.salInfl()===1&&!L.econ().on,'끄기');S.econ={cost:0.02};ok(L.econ().on&&L.econ().cost===0.02&&L.econ().price===0.0575,'일부만 바꿔도 나머지는 기본');}
// 2) 시장 연봉 물가: 2027=1, 2028부터 연 5%(오프시즌에는 다음 시즌 기준), 최저연봉 0.3은 그대로
{const L=League.create(base,'Lions',5),S=L.S;const p=L.players('Lions').find(x=>L.war(x)>1.5);S.phase='regular';
 const at=y=>{S.year=y;return L.price(p)};const v0=at(2027);ok(L.salInfl()===1,'2027 물가 1');S.year=2030;ok(near(L.salInfl(),Math.pow(1.05,3)),'2030 = 1.05^3');
 const raw=(L.price(p)-0.3);ok(raw>0&&near(at(2030)-0.3,(v0-0.3)*Math.pow(1.05,3),0.15),`가치분만 인상 ${v0} → ${at(2030)}`);
 const low=L.players('Lions').find(x=>L.war(x)<0.05);if(low){S.year=2035;ok(L.price(low)>=0.3&&L.price(low)<=0.3+0.2,'최저연봉은 물가와 무관 '+L.price(low))}
 S.year=2028;S.phase='offseason';ok(near(L.salInfl(),Math.pow(1.05,2)),'오프시즌(2028 종료 후)에는 2029 시즌 기준');S.phase='regular';ok(near(L.salInfl(),1.05),'정규시즌 2028 = 1.05');
 S.econ={on:false};S.year=2035;ok(L.salInfl()===1&&L.price(p)===v0,'끄면 이전과 같은 가격');}
// 3) 시즌 정산 후 갱신: 객단가·MD·광고·운영비·예산 기준 매출
{const L=League.create(base,'Lions',5);L.faAdvance(75);L.closeFA();const S=L.S;const keep={};for(const t of Object.keys(S.teams)){const f=S.fin.teams[t];keep[t]={price:f.price,other:f.other,par:f.parAds,opex:f.opex,att0:f.att0,parts:Object.assign({},f.parts)}}
 season(L);L.startOffseason();
 for(const t of Object.keys(S.teams)){const f=S.fin.teams[t],k=keep[t],gP=L.priceGrowth(t,2028),attG=f.att0/k.att0-1,gMD=(t==='Twins'||t==='Bears')?0.0275:0.0575;
  ok(near(f.price/k.price,1+gP,1e-12),`${t} 객단가 +${(gP*100).toFixed(2)}%`);ok(near(f.other,Math.round(k.other*(1+attG)*(1+1.3*gMD)*10)/10,0.051),`${t} MD·기타 (1+관중증가)(1+1.3×객단가 인상) ${k.other} → ${f.other}`);
  ok(near(f.parAds,Math.round(k.par*1.025*10)/10,0.051),`${t} 모기업 광고 +2.5%`);ok(near(f.opex,Math.round(k.opex*1.05*10)/10,0.051),`${t} 운영비 +5%`);
  if(k.parts)for(const key of Object.keys(k.parts))if(typeof k.parts[key]==='number')ok(near(f.parts[key],Math.round(k.parts[key]*1.05*10)/10,0.051),`${t} 운영비 구성 ${key}`);
  const row=S.fin.hist[S.fin.hist.length-1].teams[t];ok(Number.isFinite(f.lastRev)&&f.lastRev>0&&f.lastRev>=row.rev-row.ps-row.bonus-200,'예산 기준 매출 유효 '+f.lastRev);}
 // 예산(FA 여유자금)이 성장 속도만큼 줄어들지 않음: 정산 직후 예산 기준 매출 ≥ 올해 실제 매출 − 소폭
 for(const t of Object.keys(S.teams)){const row=S.fin.hist[S.fin.hist.length-1].teams[t],f=S.fin.teams[t];ok(f.lastRev>=(row.rev-row.ps-row.bonus)*0.97,`${t} 예산 기준 매출이 실제 매출보다 작아지지 않음`)}}
// 4) 끄면 정산이 이전과 같음(객단가·광고·운영비 그대로)
{const L=League.create(base,'Lions',5);L.S.econ={on:false};L.faAdvance(75);L.closeFA();const S=L.S;const keep={};for(const t of Object.keys(S.teams)){const f=S.fin.teams[t];keep[t]={price:f.price,other:f.other,par:f.parAds,opex:f.opex}}
 season(L);L.startOffseason();for(const t of Object.keys(S.teams)){const f=S.fin.teams[t];ok(f.price===keep[t].price&&f.other===keep[t].other&&f.parAds===keep[t].par&&f.opex===keep[t].opex,`${t} 끄면 불변`)}}
// 5) 장기 안정성: 9시즌 동안 매출·손익·예산이 폭주하거나 붕괴하지 않음
{const L=League.create(base,'Lions',9);L.faAdvance(75);L.closeFA();const S=L.S;const hist={};
 for(let y=0;y<9;y++){season(L);L.startOffseason();const row=S.fin.hist[S.fin.hist.length-1];for(const t of Object.keys(S.teams)){const r=row.teams[t];(hist[t]=hist[t]||[]).push(r);ok(Number.isFinite(r.rev)&&Number.isFinite(r.op)&&r.rev>200&&r.rev<4000,`${t} ${S.year} 매출 ${r.rev}`);ok(Math.abs(r.op)<1500,`${t} ${S.year} 손익 ${r.op}`);const room=L.faRoom(t);ok(Number.isFinite(room)&&room>-250&&room<2000,`${t} ${S.year} FA 여유자금 ${room}`)}
  const off=S.off;for(const id of off.rep.expiring.slice()){const p=S.players[id];if(!p.foreign&&L.ovr(p)>=48)L.resign(id)}L.finishContracts();L.buildDraft();L.draftAutoRest();L.finishDraft();L.openFAMarket();L.faAdvance(75);L.closeFA();L.startNewSeason();ok(L.integrity().errors.filter(e=>e.code!=='dup-name').length===0,`${S.year} 무결성`)}
 for(const t of Object.keys(hist)){const a=hist[t];const g=Math.pow(a[8].rev/a[0].rev,1/8)-1;ok(g>-0.02&&g<0.12,`${t} 9시즌 연평균 매출 성장률 ${(g*100).toFixed(1)}%`)}
 const ts=hist.Twins;ok(ts[5].rev>ts[4].rev*1.08,'2032 잠실돔 개장 매출 점프(가격 +30%·수용량 확대) '+ts[4].rev+' → '+ts[5].rev);
 const l2=hist.Landers;ok(l2[1].rev>l2[0].rev*1.03,'2028 청라돔 객단가 상향(×1.15)이 SSG 매출에 반영 '+l2[0].rev+' → '+l2[1].rev);}
console.log('econ tests ok '+n);
