const fs=require('fs');const assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',1),S=L.S,g=k=>Object.values(S.players).find(p=>p.ko===k&&!p.foreign);
// 산정: 근속·입단 구단·연고 1차 지명·원클럽·베테랑
const cj=g('최정'),l=L.loyalty(cj);ok(l.team==='Landers'&&l.v===95&&l.items.length===5,'최정 충성도 95 '+JSON.stringify(l));
ok(Math.abs(L.loyDiscount(cj)-0.108)<0.002,'할인율 = (충성도−55)×0.27%, 최대 12% '+L.loyDiscount(cj));
const vs=Object.values(S.players).filter(p=>!p.foreign&&p.team in S.teams).map(p=>L.loyalty(p)).filter(Boolean).map(x=>x.v);
ok(vs.every(v=>v>=40&&v<=100)&&vs.length>900,'충성도 범위 40~100');
// 외국인은 대상 아님, 다른 구단 기준 충성도는 근속 0
ok(L.loyalty(Object.values(S.players).find(p=>p.foreign&&p.team in S.teams))===null,'외국인 제외');
ok(L.loyalty(cj,'Lions').v===40&&L.loyDiscount(cj,'Lions')===0,'타 구단 기준은 근속·입단 가산 없음');
// FA: 원소속 요구액 할인, 타 구단은 +4%
const fa=L.faList().find(p=>p.ko==='원태인'),home=L.faTerms(fa,'Lions'),ext=L.faTerms(fa,'Twins');
ok(home.disc>0.05&&home.req(3)<ext.req(3)*0.92,'원소속 충성 할인 '+home.req(3).toFixed(1)+' vs '+ext.req(3).toFixed(1));
// 입찰 점수: 원소속 충성 가산
ok(L._offerScore(fa,'Lions',3,8,5)>L._offerScore(fa,'Twins',3,8,5),'원소속 충성 점수 가산');
// 재계약 요구액: 충성도 높을수록 낮다(할인 절반 적용)
const lo=Object.values(S.players).filter(p=>!p.foreign&&p.team==='Lions');const hi=lo.filter(p=>L.loyDiscount(p)>0.06)[0];
if(hi){const full=Math.max(0.3,Math.round(L._blendAsk(hi)*10)/10);ok(L.resignAsk(hi)<=full,'재계약 요구액 할인');}
console.log('loyalty tests ok',n);
