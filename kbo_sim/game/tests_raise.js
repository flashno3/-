/* 재계약 요구액 인상 한도(+100%) */
const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const L=League.create(base,'Lions',9),S=L.S;
// 시작 상태: 모든 선수의 재계약 기준 요구액이 현재 연봉의 2배(+0.2억)를 넘지 않는다
let over=0,cnt=0;for(const p of Object.values(S.players)){if(!(p.team in S.teams)||p.foreign)continue;cnt++;const a=L._blendAsk(p);if(a>p.contract.salary*2+0.25)over++;ok(a>=L.minSal()-1e-9,'최저연봉')}ok(over===0&&cnt>300,'인상 한도 초과 '+over+'/'+cnt);
// 가치가 크게 오른 선수(저연봉·고WAR)도 한도 적용, 내려가는 방향은 기존과 같은 비율
const hi=Object.values(S.players).filter(p=>p.team in S.teams&&!p.foreign).sort((a,b)=>L.price(b)/b.contract.salary-L.price(a)/a.contract.salary)[0];
ok(L.price(hi)>hi.contract.salary*2.2,'테스트용 가치 급등 선수 '+hi.ko+' '+hi.contract.salary+'→'+L.price(hi));ok(L._blendAsk(hi)<=hi.contract.salary*2+0.25,'급등 선수도 ×2 이내 '+L._blendAsk(hi));
const lo=Object.values(S.players).filter(p=>p.team in S.teams&&!p.foreign&&p.contract.salary>=3).sort((a,b)=>L.price(a)/a.contract.salary-L.price(b)/b.contract.salary)[0];
const exp=Math.max(L.minSal(),Math.round((lo.contract.salary+0.4*(L.askSalary(lo)-lo.contract.salary))*10)/10);ok(Math.abs(L._blendAsk(lo)-exp)<0.11,'인하 방향은 기존 0.4 비율 '+L._blendAsk(lo)+' vs '+exp);
console.log('raise tests ok',n);
