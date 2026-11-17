// KBO 일정 형식 검증: 개막 2연전, 3연전 기본, 올스타 휴식기 후 4연전(개막 상대), 마지막 9경기일 단일 경기, 잠실 동시 홈 금지
const fs=require('fs'),path=require('path');const {League}=require('./src/league.js');require('./src/offseason.js');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src/gamedata.json'),'utf8'));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}};
let minH=999,maxH=0;
for(const seed of [1,7,11,2027]){const L=League.create(base,'Lions',seed),S=L.S,sc=S.schedule,T=Object.keys(S.teams);
 ok(sc.length===144,'144경기일');const g={},h={},pair={};T.forEach(t=>{g[t]=0;h[t]=0});let dup=0,jam=0;
 sc.forEach(rd=>{const seen=new Set();for(const [x,y] of rd){if(seen.has(x)||seen.has(y))dup++;seen.add(x);seen.add(y);g[x]++;g[y]++;h[x]++;const k=[x,y].sort().join('|');pair[k]=(pair[k]||0)+1}if(seen.size!==10)dup++;if(rd.filter(([x])=>x==='Bears'||x==='Twins').length>1)jam++});
 ok(dup===0,'하루에 팀당 1경기 '+dup);ok(jam===0,'잠실 동시 홈 없음');ok(T.every(t=>g[t]===144),'팀당 144경기');ok(Object.keys(pair).length===45&&Object.values(pair).every(v=>v===16),'상대별 16경기');
 for(const t of T){minH=Math.min(minH,h[t]);maxH=Math.max(maxH,h[t])}
 // 시리즈 구조
 for(const t of T){const ser=[];let cur=null;sc.forEach(rd=>{const m=rd.find(([x,y])=>x===t||y===t),o=m[0]===t?m[1]:m[0],hm=m[0]===t;if(cur&&cur.o===o&&cur.h===hm)cur.n++;else{cur={o,h:hm,n:1};ser.push(cur)}});
  const lens=ser.map(s=>s.n);ok(lens[0]===2&&lens.filter(n=>n===4).length===1&&lens.filter(n=>n===2).length===1,t+' 개막 2연전·4연전 1회');
  ok(lens.slice(1,30).every(n=>n===3)&&lens[30]===4&&lens.slice(31,45).every(n=>n===3)&&lens.slice(45).every(n=>n===1)&&lens.length===54,t+' 시리즈 구성 '+lens.join(''));
  ok(ser[0].o===ser[30].o,t+' 후반기 4연전 상대 = 개막 2연전 상대');
  ok(ser.slice(0,45).filter(s=>s.o===ser[0].o).length===5,t+' 개막 상대와는 2+4+3연전 3회');
  const cnt={};ser.slice(1,30).concat(ser.slice(31,45)).forEach(s=>cnt[s.o]=(cnt[s.o]||0)+1);}
 ok(L.dateOf(0).getUTCDay()===6&&L.dateOf(1).getUTCDay()===0,'개막은 토·일');ok(L.dateOf(88).getUTCDay()===4&&L.dateOf(89).getUTCDay()===4,'휴식기 직전·직후 목요일');
 const d88=L.dateOf(88),d89=L.dateOf(89);ok((d89-d88)/864e5===7,'올스타 휴식기(6일) 포함 7일 간격');
}
console.log('팀당 홈 경기 범위',minH,'~',maxH);ok(minH>=66&&maxH<=78,'홈/원정 균형');
// 시즌 진행: 같은 상대 연속 3연전이라 순위 계산 정상
const L=League.create(base,'Lions',3);L.advance(300,false);ok(L.standings().every(x=>x.w+x.l+x.d===144),'시즌 144경기 완료');
console.log(fail?'실패 '+fail:'모두 통과');process.exit(fail?1:0);
