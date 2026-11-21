/* 구단 역사(1층 데이터 정합성 · 2층 문구) */
const fs=require('fs'),assert=require('assert');
const {League,}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const LG=require(__dirname+'/src/league.js');const C=LG.CLUBS,T=['Bears','Twins','Heroes','Landers','Wiz','Eagles','Tigers','Giants','Dinos','Lions'];
// 1) 우승 횟수(보도 확인)와 연도 목록 정합성
const cnt={Bears:6,Twins:4,Heroes:0,Landers:5,Wiz:1,Eagles:1,Tigers:12,Giants:2,Dinos:1,Lions:9};
for(const t of T){ok(C[t].titles.length===cnt[t],`${t} 우승 횟수 ${C[t].titles.length}`);ok(C[t].titles.every((y,i,a)=>y>=1982&&y<=2026&&(i===0||a[i-1]<y)),`${t} 연도 정렬·범위`)}
// 1982~2026 45시즌: 10개 구단 41회 + 현대 유니콘스 4회(1998·2000·2003·2004, 2008 해체 구단)로 빈틈·중복 없이 맞아야 한다
const all=T.flatMap(t=>C[t].titles).concat([1998,2000,2003,2004]).sort((a,b)=>a-b);ok(all.length===45&&all.every((y,i)=>y===1982+i),'45시즌 우승팀이 빈틈·중복 없이 일치 '+all.join());
ok(C.Lions.titles.includes(2026)&&C.Wiz.runner.includes(2026),'2026 한국시리즈: 삼성 우승·KT 준우승');
ok(T.every(t=>C[t].ret.every(r=>Number.isInteger(r[0])&&r[1])&&C[t].lineage.length&&C[t].src),'영구결번·명칭 변천·출처 기재');
ok(C.Bears.ret.some(r=>r[0]===54&&r[1]==='김영신'&&r[2]===1986),'KBO 최초 영구결번');ok(T.reduce((a,t)=>a+C[t].ret.length,0)===18,'영구결번 합계 18명(확인된 범위)');
// 2) 프로필·문구
const L=League.create(base,'Lions',5),S=L.S;
{const P=L.clubProfile('Lions');ok(P.count===9&&P.last===2026&&P.gap===0&&P.rank===2,'삼성 프로필 '+JSON.stringify([P.count,P.last,P.gap,P.rank]));
 const P2=L.clubProfile('Tigers');ok(P2.rank===1&&P2.gap===2,'KIA 최다 우승·2년');ok(L.clubProfile('Heroes').count===0&&L.clubProfile('Heroes').gap===null,'키움 무관');
 ok(L.clubNarrative('Eagles')[0].includes('27년째'),'한화 27년 갈증 '+L.clubNarrative('Eagles')[0]);ok(L.clubGoalNote('Lions').includes('디펜딩'),'목표 문구');
 ok(S.news.some(x=>x.text.startsWith('[구단 이야기]')),'개막 소식');}
// 3) 게임 안 우승이 역사에 이어 붙음
{S.history.push({year:2027,champion:'Heroes',runnerUp:'Lions',userRank:3,userRec:{w:80,l:60,d:4},top:[]});const P=L.clubProfile('Heroes');ok(P.count===1&&P.last===2027&&P.gameTitles.join()==='2027','게임 우승 합산');
 ok(L.clubNarrative('Heroes').some(x=>x.includes('이 게임에서 만든 우승')),'게임 우승 문구');ok(L.clubProfile('Lions').rank>=1,'순위 재계산');}
console.log('club tests ok',n);
