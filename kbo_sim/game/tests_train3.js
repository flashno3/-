/* 신체 단계별 훈련: 근력·지구력·부상 예방·회복 — 나이별 효과, 부상 위험, 투수 피로 회복 */
const fs=require('fs'),assert=require('assert');const {League}=require(__dirname+'/src/league.js');require(__dirname+'/src/offseason.js');
const base=JSON.parse(fs.readFileSync(__dirname+'/src/gamedata.json'));let n=0;const ok=(c,m)=>{n++;if(!c)throw new assert.AssertionError({message:m})};
const mk=()=>{const L=League.create(base,'Lions',5);L.faAdvance(75);L.closeFA();return L};
{const L=mk();for(const side of ['B','P']){const k=L.trainFocusKeys(side);for(const f of ['strength','endur','prevent','recover','cond'])ok(k.includes(f),side+' '+f)}
 ok(L.setTrainSide('B','focus','prevent')&&L.setTrainSide('P','focus','recover')&&!L.setTrainSide('B','focus','zzz'),'설정·검증')}
// 부상 위험: 부상 예방은 고령일수록 크게 낮춘다, 근력은 소폭 올린다, 기본 컨디션 관리는 그대로 0.88
{const L=mk(),t=L.S.userTeam,y=L.players(t).find(p=>p.type==='B'),o=L.players(t).filter(p=>p.type==='B')[1];y.age=22;o.age=36;L.setTrainSide('B','focus','prevent');
 const ry=L._trainInjFor(y),ro=L._trainInjFor(o);ok(ry<1&&ro<ry&&Math.abs(ro-(1-0.2*1.4))<1e-9&&Math.abs(ry-(1-0.2*0.8))<1e-9,`예방 위험 젊음 ${ry} 고령 ${ro}`);
 L.setTrainSide('B','focus','strength');ok(L._trainInjFor(y)>1&&Math.abs(L._trainInjFor(y)-1.04)<1e-9,'근력 +4%');L.setTrainSide('B','focus','cond');ok(Math.abs(L._trainInjFor(o)-0.88)<1e-9,'컨디션 관리 0.88 유지');L.setTrainSide('B','focus','none');ok(L._trainInjFor(o)===1,'없음 1');
 L.setTrainSide('B','focus','prevent');L.setTrainSide('B','inten','heavy');ok(L.trainRisk(o).pct<L.trainRisk(y).pct+1&&L.trainRisk(o).pct!==undefined,'위험 표시')}
// 성장 효과: 어린 선수일수록 신체 훈련 성장 보정이 크다(근력→장타 가중)
{const L=mk(),S=L.S,t=S.userTeam;L.setTrainSide('B','focus','strength');S.phase='regular';S.day=5;for(let i=0;i<50;i++)L._trainDay();const bs=L.players(t).filter(p=>p.type==='B');const a=bs[0],b=bs[1];a.age=22;b.age=35;const ea=L._trainEff(a),eb=L._trainEff(b);
 ok(ea.mult>eb.mult&&eb.mult>1,`젊음 ${ea.mult} > 고령 ${eb.mult} > 1`);ok(ea.w.hr>eb.w.hr&&eb.w.hr>1&&ea.w.xbh>1,'장타 가중도 나이별');
 L.setTrainSide('P','focus','endur');for(let i=0;i<50;i++)L._trainDay();const pp=L.players(t).find(p=>p.type==='P');pp.age=23;ok(L._trainEff(pp).stamina>0,'지구력 → 체력 성장')}
// 회복: 내 투수 피로 회복 배율(고령일수록 큼), 타 팀·미설정은 그대로
{const L=mk(),S=L.S,t=S.userTeam;const ps=L.players(t).filter(p=>p.type==='P'&&p.role==='SP'),y=ps[0],o=ps[1];y.age=24;o.age=36;
 ok(L._trainRec(y)===1,'미설정 1');L.setTrainSide('P','focus','recover');ok(Math.abs(L._trainRec(y)-(1+0.25*0.8))<1e-9&&Math.abs(L._trainRec(o)-(1+0.25*1.4))<1e-9,'회복 배율');
 y.fat=80;o.fat=80;L._decayFatigue();ok(o.fat<y.fat,`고령이 더 많이 회복 ${o.fat} < ${y.fat}`);ok(y.fat<60,'기본(−20)보다 더 회복 '+y.fat);
 const other=L.players('Tigers').find(p=>p.type==='P');other.fat=80;L._decayFatigue();ok(other.fat===80,'다른 팀 투수는 이 함수 대상 아님');
 L.setTrainSide('P','focus','none');y.fat=80;L._decayFatigue();ok(y.fat===60,'설정 해제 시 기본 회복 20')}
// 그룹·슬롯과 함께 쓰기: 마무리에게만 회복, 선발은 팀 설정
{const L=mk(),t=L.S.userTeam;L.setTrainGroup('CL','focus','recover');const cl=L.players(t).find(p=>L.trainGroupOf(p)==='CL'),sp=L.players(t).find(p=>L.trainGroupOf(p)==='SP');cl.age=30;ok(L._trainRec(cl)>1&&L._trainRec(sp)===1,'마무리만 회복 훈련')}
console.log('train3 tests ok',n);
