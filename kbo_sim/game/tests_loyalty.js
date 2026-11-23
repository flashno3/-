const fs=require('fs');const assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',1),S=L.S,g=k=>Object.values(S.players).find(p=>p.ko===k&&!p.foreign);
// 산정: 근속·입단 구단·연고 1차 지명·원클럽·베테랑
const cj=g('최정'),l=L.loyalty(cj);ok(l.team==='Landers'&&l.v===87&&l.items.length===4,'최정 충성도 87(유신고=수원 KT 연고, 연고 가산 없음) '+JSON.stringify(l));
const oj=g('오지환'),lo2=L.loyalty(oj);ok(lo2.v===95&&lo2.items.some(x=>x[0].startsWith('연고 출신(경기고)')),'오지환: 경기고=서울 연고 가산 '+JSON.stringify(lo2));
{const lb=L.legendBound&&L.legendBound(cj,cj.team);const exp=lb?Math.min(0.2,0.0864+0.06):0.0864;ok(Math.abs(L.loyDiscount(cj)-exp)<0.002,'할인율 = (충성도−55)×0.27%(+영구결번 후보 6%p), 최대 12%(후보 20%) '+L.loyDiscount(cj)+' '+exp)}
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
// 연고 학교 표: 서울 3구단 공유, 약칭 매칭, 타 구단 연고 학교는 가산 없음
ok(S.schoolHome['경기고'].length===3&&S.schoolHome['유신고'][0]==='Wiz'&&S.schoolHome['선린인고'].length===3&&S.schoolHome['동산고'][0]==='Landers','학교 약칭·서울 공유');
const wt=L.faList().find(p=>p.ko==='원태인');ok(L._hometown(wt,'Lions')&&!L._hometown(wt,'Twins'),'원태인(경북고) 연고=삼성');
ok(L._offerScore(wt,'Twins',3,8,5)<L._offerScore(wt,'Lions',3,8,5),'연고·원소속 점수');
console.log('loyalty tests ok',n);
