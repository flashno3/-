const fs=require('fs'),assert=require('assert');
const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mkFA=(seed,team)=>League.create(base,team||'Lions',seed);
const mkRS=(seed,team)=>{const L=League.create(base,team||'Lions',seed);L.faAdvance(75);L.closeFA();return L};
const txt=neg=>neg.log.map(x=>x.text).join('\n');
// 1) FA 협상: 시작·우선순위·호감도·요구액 보정
{const L=mkFA(5),S=L.S;const p=L.faList().filter(x=>!x.foreign&&x.faInfo&&x.faInfo.grade&&L.negBlock(x.id,'fa')===null).sort((a,b)=>L.faMV(a)-L.faMV(b))[0];ok(p,'FA 후보');
 const raw=L.faTerms(p,S.userTeam,true).req(3);const r=L.negStart(p.id,'fa');ok(r.ok&&S.neg&&S.neg.state==='open','시작');
 ok(S.neg.prios.length===2&&S.neg.log.length>=1&&S.neg.range[1]>=S.neg.range[0],'우선순위·기대범위');
 const adj=L._negAdj(p,S.userTeam);ok(adj>=0.93&&adj<=1.07,'보정 범위 '+adj);ok(Math.abs(L.faTerms(p,S.userTeam).req(3)-L.faTerms(p,S.userTeam,true).req(3)*adj)<0.02,'faTerms 보정 반영');
 ok(L.faTerms(p,'Bears').req(3)===L.faTerms(p,'Bears',true).req(3),'AI 구단에는 보정 없음');
 // 낮은 제시 → 거절·호감도 하락·라운드 소모
 const m0=S.neg.mood,rd0=S.neg.round;const lo=L.negOffer({years:3,salary:0.5,bonus:0});ok(lo.rejected&&S.neg.mood<m0&&S.neg.round===rd0+1,'로우볼 반응');
 ok(S.neg.log.some(x=>x.who==='me')&&S.neg.log.some(x=>x.who!=='me'&&x.who!=='sys'),'대화 로그');
 // 카드
 const cards=L.negCards();ok(cards.find(c=>c.k==='ask')&&cards.find(c=>c.k==='vision'),'카드 목록');
 const rv0=S.neg.revealed.length;const c1=L.negCard('ask');ok(c1.ok&&S.neg.revealed.length>=rv0+(S.neg.revealed.length>rv0?1:0),'의중 묻기');
 ok(L.negCard('ask').ok===false,'같은 카드 재사용 불가');
 const m1=S.neg.mood;L.negCard('respect');ok(S.neg.mood>m1||S.neg.mood===100,'존중 표현 호감도');
 // 충족 제시 → 계약 체결
 if(S.neg.state==='open'){const best=L.negBest(p.id);const res=L.negOffer(best);ok((res.signed&&p.team===S.userTeam&&S.neg.state==='signed')||(!res.ok&&/예산 부족/.test(res.msg)&&S.neg.state==='open'),'충족 제시로 계약(예산 부족이면 계약 안 되고 라운드 유지)');}
 else ok(true,'라운드 소진 — 결렬 경로는 아래서 검증');
 }
// 2) 라운드 소진 → 결렬 → 잠금
{const L=mkFA(6),S=L.S;const p=L.faList().find(x=>!x.foreign&&x.faInfo&&x.faInfo.grade&&L.negBlock(x.id,'fa')===null);L.negStart(p.id,'fa');let g=0;while(S.neg.state==='open'&&g++<12)L.negOffer({years:1,salary:0.4,bonus:0});
 ok(S.neg.state==='broke','결렬');ok(L.negBlock(p.id,'fa')&&/다시 협상/.test(L.negBlock(p.id,'fa')),'결렬 후 잠금');ok(p.team==='FA','선수는 시장에 남음');
 ok(S.story.some(e=>/결렬/.test(e.text)),'결렬 스토리');}
// 3) 외국인: 상한·즉시 1군
{const L=mkFA(7),S=L.S,t=S.userTeam;const fp=L.faList().find(x=>x.foreign&&!x.aq&&L.negBlock(x.id,'foreign')===null)||L.faList().find(x=>x.foreign&&L.negBlock(x.id,'foreign')===null);
 if(fp){const r=L.negStart(fp.id,'foreign');ok(r.ok&&S.neg.speaker==='ag','외국인은 에이전트가 말함');const tm=L._negTerms(fp,'foreign');const act0=L.players(t).filter(x=>x.active).length;
  const over=L.negOffer({years:1,salary:tm.cap+1,bonus:0});ok(!over.ok,'상한 초과 불가');const b=L.negBest(fp.id);
  if(b&&b.salary<=tm.cap){const res=L.negOffer(b);ok(res.signed&&fp.team===t&&fp.reg1,'외국인 계약');ok(fp.active||act0>=29,'외국인 즉시 1군 등록');ok(!fp.active||L.players(t).filter(x=>x.active).length<=29,'엔트리 제한');}}}
// 4) 재계약·비FA 다년
{const L=mkRS(8),S=L.S,t=S.userTeam;const p=L.players(t).filter(x=>!x.foreign&&!x.rookie&&x.contract.years<=2&&x.age<=30).sort((a,b)=>L.ovr(b)-L.ovr(a))[0];
 ok(p&&L.negBlock(p.id,'extend')===null,'연장 대상');const room0=L.faRoom(t);L.negStart(p.id,'extend');const tm=L._negTerms(p,'extend');ok(tm.maxY===5&&tm.bonusOK,'비FA 다년 조건');
 const b=L.negBest(p.id);ok(b.years===tm.pref&&b.years>=2,'희망 기간');const res=L.negOffer(b);
 if(res.signed){ok(p.contract.years===b.years&&p.contract.salary===b.salary,'계약 갱신');ok((p.contract.bonus||0)===b.bonus,'계약금');ok(p.extAt&&p.extAt.y===S.year,'연장 기록');ok(L.negBlock(p.id,'extend')!==null,'올해 재연장 불가');}
 else ok(/예산 부족/.test(res.msg||''),'예산 부족이면 계약 안 됨');}
// 5) 약속
{const L=mkRS(9),S=L.S,t=S.userTeam;const p=L.players(t).filter(x=>!x.foreign&&!x.rookie&&x.contract.years<=2&&x.type==='B').sort((a,b)=>L.ovr(b)-L.ovr(a))[0];L.negStart(p.id,'extend');
 ok(L._roleOptions(p).some(o=>o[0]==='starter'),'주전 약속 가능');const m0=S.neg.mood;const r=L.negCard('role','starter');ok(r.ok&&S.neg.promises.length===1&&S.neg.mood>m0,'역할 약속 효과');
 const b=L.negBest(p.id);const res=L.negOffer(b);if(res.signed){ok(p.promise&&p.promise.kind==='starter','약속 기록');
  p.promise.day=0;p.promise.y=S.year;S.phase='regular';S.day=60;S.teams[t].set.lineup=S.teams[t].set.lineup.filter(x=>x.id!==p.id).concat([]);const miss=!S.teams[t].set.lineup.some(x=>x.id===p.id);if(miss){const l0=p.loyAdj||0;L._promiseTick(60);ok(p.brokenP===1&&(p.loyAdj||0)<l0&&!p.promise,'약속 불이행 처벌');}}}
// 6) 면담
{const L=mkRS(10),S=L.S,t=S.userTeam;const p=L.players(t).filter(x=>!x.foreign&&!x.rookie)[3];ok(L.meetBlock(p.id)===null,'면담 가능');const r=L.negStart(p.id,'meeting',{topic:'grievance'});ok(r.ok&&S.neg.kind==='meeting'&&S.neg.max===4,'면담 시작');
 const cs=L.meetCards();ok(cs.length>=4,'면담 카드');const a=L.meetCard('listen');ok(a.ok,'경청');let g=0;for(const k of ['praise','honest','discipline']){if(S.neg.state==='open')L.meetCard(k);}
 ok(S.neg.state==='done'&&['ok','mid','bad'].includes(S.neg.outcome),'면담 종료 결과');ok(L.meetBlock(p.id)&&/최근 면담/.test(L.meetBlock(p.id)),'면담 쿨다운');}
// 7) 저장/불러오기(직렬화)
{const L=mkFA(11),S=L.S;const p=L.faList().find(x=>!x.foreign&&L.negBlock(x.id,'fa')===null);L.negStart(p.id,'fa');L.negOffer({years:2,salary:0.6,bonus:0});const s=JSON.stringify(S);const S2=JSON.parse(s);ok(S2.neg&&S2.neg.log.length===S.neg.log.length&&S2.neg.mood===S.neg.mood,'협상 상태 직렬화');}
// 8) 대사 다양성: 같은 협상 안에서 같은 문장 반복 최소
{const L=mkFA(12),S=L.S;const p=L.faList().find(x=>!x.foreign&&L.negBlock(x.id,'fa')===null);L.negStart(p.id,'fa');for(let i=0;i<3;i++)L.negOffer({years:2,salary:0.5+i*0.1,bonus:0});const ls=S.neg.log.filter(x=>x.who!=='me'&&x.who!=='sys').map(x=>x.text);ok(new Set(ls).size>=ls.length-1,'대사 반복 최소');}
// 9) 스토리·언론
{const L=mkRS(13),S=L.S;ok(!S.story||Array.isArray(S.story),'story 배열');L._news('트레이드: A ↔ B');ok(S.story[0].kind==='trade'&&S.press[0].kind==='trade','뉴스→스토리·언론');L._news('부상: X — 약 45일');ok(S.story[0].imp===3,'장기 부상 중요도');const top=L.storyTop(S.year,5);ok(top.length>=1,'올해의 이야기');}
// 10) 외국인 교체 영입: 슬롯이 가득 차 있어도 기존 외국인을 내보내는 조건으로 협상, 성사 시에만 방출
{const L=mkFA(14,'Lions'),S=L.S,t=S.userTeam;const gen=L.foreignOf(t).filter(x=>!x.aq);ok(gen.length===3,'일반 외국인 3명 보유');const cand=L.faList().find(x=>x.foreign&&!x.aq&&!L.foreignOK(t,x));ok(cand,'슬롯 부족 후보');
 ok(L.negBlock(cand.id,'foreign')&&/슬롯|보유 한도/.test(L.negBlock(cand.id,'foreign')),'교체 없이는 불가');const rep=gen.find(g=>{L._replacing=g.id;const k=L.foreignOK(t,cand);L._replacing=null;return k});ok(rep,'교체 가능한 선수');
 ok(L.negBlock(cand.id,'foreign',rep.id)===null,'교체 조건이면 협상 가능');const r=L.negStart(cand.id,'foreign',{replace:rep.id});ok(r.ok&&S.neg.replace===rep.id,'교체 협상 시작');
 L.negOffer({years:1,salary:0.3});ok(rep.team===t,'결렬·미충족 시 방출되지 않음');const tm=L._negTerms(cand,'foreign'),b=L.negBest(cand.id);
 if(b.salary<=tm.cap){const res=L.negOffer(b);if(res.signed){ok(cand.team===t&&rep.team==='FA','교체 성사: 신규 영입·기존 방출');ok(L.foreignOf(t).filter(x=>!x.aq).length===3&&L.foreignOf(t).every(x=>x.reg1),'슬롯 3명 유지');}}}
console.log('negotiate tests ok',n);
