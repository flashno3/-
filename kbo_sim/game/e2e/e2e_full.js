/* 브라우저 종합 점검: 모바일(390)·데스크톱(1280)에서 전 화면 순회 + 협상·면담·라이브·드래프트·저장 흐름. 사용법: node game/e2e/e2e_full.js [index.html 경로] */
const {chromium}=require('playwright');const path=require('path');
const FILE='file://'+(process.argv[2]||path.join(__dirname,'..','index.html'));
let fails=0,checks=0;const ok=(c,m)=>{checks++;if(!c){fails++;console.log('  ✗',m)}};
const BAD=/undefined|NaN|\[object|\{[a-z]+\}|Infinity/;
async function run(vp,label,team){
  const b=await chromium.launch();const ctx=await b.newContext({viewport:vp,hasTouch:vp.width<600,isMobile:vp.width<600});const pg=await ctx.newPage();pg.setDefaultTimeout(15000);
  const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  const click=async s=>pg.evaluate(s=>{const e=document.querySelector(s);if(e&&!e.disabled){e.click();return true}return false},s);
  const text=async()=>pg.evaluate(()=>document.body.innerText);
  const sweep=async(tag)=>{const t=await text();const m=t.match(BAD);ok(!m,`${label} ${tag}: 화면에 오류 문자열 ${m?m[0]:''}`);const w=await pg.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);ok(w<=2,`${label} ${tag}: 가로 넘침 ${w}px`)};
  const nav=async(g,s)=>{await pg.evaluate(n=>{const b=[...document.querySelectorAll('nav button, .side button')].find(b=>b.innerText.includes(n));if(b)b.click()},g);await pg.waitForTimeout(120);if(s){await pg.evaluate(n=>{const b=[...document.querySelectorAll('.tabs.sub button')].find(b=>b.innerText.trim()===n);if(b)b.click()},s);await pg.waitForTimeout(150)}};
  const confirm=async()=>{await pg.evaluate(()=>{for(const b of document.querySelectorAll('button'))if(['확인','닫기'].includes(b.innerText.trim())&&b.closest('.sheet'))b.click()})};
  await pg.goto(FILE);await pg.waitForTimeout(400);
  await pg.evaluate(()=>window.scrollTo(0,800));await pg.click(`text=${team}`);await pg.click('text=감독 시작');await pg.waitForTimeout(1200);
  ok((await pg.evaluate(()=>scrollY))===0,`${label}: 시작 시 스크롤 위치 0`);
  await sweep('시작');
  // 1) FA 시장 전 화면
  await nav('운영','이적시장');await click('button[data-act="mtab"][data-a="fa"]');await pg.waitForTimeout(200);await sweep('FA국내');
  for(const tab of ['for','aq','dom']){await click(`button[data-act="fatab"][data-a="${tab}"]`);await pg.waitForTimeout(150);await sweep('FA탭'+tab)}
  // 보호선수 체크 시 화면 유지(안쪽 스크롤·페이지 스크롤·펼침 상태)
  if(await click('button[data-act="protToggle"]')){await pg.waitForTimeout(150);await pg.evaluate(()=>{const w=document.querySelector('.tablewrap[style*="max-height"]');if(w){w.scrollTop=300;w.scrollIntoView()}});const before=await pg.evaluate(()=>({y:Math.round(scrollY),i:document.querySelector('.tablewrap[style*="max-height"]').scrollTop}));
    await pg.evaluate(()=>{const bs=document.querySelectorAll('.tablewrap[style*="max-height"] input[type=checkbox]');bs[Math.min(bs.length-1,12)].click()});await pg.waitForTimeout(200);
    const after=await pg.evaluate(()=>({y:Math.round(scrollY),i:document.querySelector('.tablewrap[style*="max-height"]')?document.querySelector('.tablewrap[style*="max-height"]').scrollTop:-1}));
    ok(Math.abs(after.y-before.y)<=2&&Math.abs(after.i-before.i)<=2,`${label}: 보호선수 체크 후 스크롤 유지 (${JSON.stringify(before)} → ${JSON.stringify(after)})`);await click('button[data-act="protToggle"]');await pg.evaluate(()=>window.scrollTo(0,0))}
  // 2) 협상: 열기→카드→제시→돌아가기→복귀 확인
  await pg.evaluate(()=>window.scrollTo(0,600));const y0=await pg.evaluate(()=>scrollY);
  const opened=await pg.evaluate(()=>{const b=[...document.querySelectorAll('button[data-act="negOpen"]')].find(b=>/\|fa$/.test(b.dataset.a));if(b){b.click();return true}return false});ok(opened,`${label}: FA 협상 버튼`);await pg.waitForTimeout(250);
  ok(!!(await pg.$('.negwin')),`${label}: 협상 창`);await sweep('협상창');
  await click('button[data-act="negTab"][data-a="cards"]');await click('button[data-act="negCard"][data-a="ask"]');await click('button[data-act="negCard"][data-a="respect"]');await click('button[data-act="negCard"][data-a="vision"]');await sweep('협상카드');
  await click('button[data-act="negTab"][data-a="offer"]');await click('button[data-act="negFill"]');await click('button[data-act="negSend"]');await sweep('협상제안');
  await pg.evaluate(()=>{const e=document.querySelector('input[data-sel="negsal"]');if(e){e.value='0.4';e.dispatchEvent(new Event('change',{bubbles:true}))}});await click('button[data-act="negSend"]');await sweep('낮은제시');
  await click('button[data-act="negExit"]');await pg.waitForTimeout(250);ok(!(await pg.$('.negwin')),`${label}: 돌아가기 후 협상창 닫힘`);ok((await pg.evaluate(()=>!document.body.classList.contains('modal-open'))),`${label}: 본문 스크롤 잠금 해제`);
  ok(await pg.evaluate(()=>document.querySelectorAll('input[data-sel="fasal"]').length>0),`${label}: 돌아가기 후 FA 제시 화면`);
  // 재진입 후 종료
  await pg.evaluate(()=>{const b=[...document.querySelectorAll('button[data-act="negOpen"]')].find(b=>/\|fa$/.test(b.dataset.a));if(b)b.click()});await pg.waitForTimeout(200);await click('button[data-act="negLeave"]');await sweep('협상종료');await click('button[data-act="negDone"]');
  // 3) 외국인 교체 영입
  await click('button[data-act="fatab"][data-a="for"]');await pg.waitForTimeout(150);
  if(await click('button[data-act="foreignSlot"]')){await pg.waitForTimeout(200);ok(!!(await pg.$('[aria-label="외국인 교체"]')),`${label}: 외국인 교체 시트`);await sweep('외국인교체시트');
    if(await click('button[data-act="fslotPick"]:not([disabled])')){await pg.waitForTimeout(250);ok(!!(await pg.$('.negwin')),`${label}: 교체 협상 창`);await click('button[data-act="negFill"]');await click('button[data-act="negSend"]');await sweep('외국인협상');await click('button[data-act="negExit"]')}else await click('button[data-act="fslotClose"]')}
  // 4) 시장 속보 · 4개 탭 선수 모달
  await click('button[data-act="faClose"]');await nav('선수단','로스터');await pg.waitForTimeout(200);
  for(let i=0;i<3;i++){await pg.evaluate(k=>{const rows=document.querySelectorAll('tr[data-act="player"]');if(rows[k])rows[k].click()},i*7);await pg.waitForTimeout(150);
    for(const tab of ['sum','grow','info','car']){await click(`button[data-act="mtab2"][data-a="${tab}"]`);await pg.waitForTimeout(80);await sweep(`선수모달${i}-${tab}`)}
    if(i===1){await click('button[data-act="mtab2"][data-a="info"]');if(await click('button[data-act="negOpen"][data-a$="|extend"]')){await pg.waitForTimeout(200);await sweep('연장협상');await click('button[data-act="negFill"]');await click('button[data-act="negSend"]');await sweep('연장제안');await click('button[data-act="negExit"]')}}
    if(i===2){await click('button[data-act="mtab2"][data-a="info"]');if(await click('button[data-act="negOpen"][data-a$="|meeting|checkin"]')){await pg.waitForTimeout(200);await sweep('면담');for(const k of ['listen','praise','honest','rest']){await click(`button[data-act="meetCard"][data-a="${k}"]`)}await click('button[data-act="meetEnd"]');await sweep('면담종료');await click('button[data-act="negDone"]')}}
    await click('button[data-act="closeModal"]');await pg.waitForTimeout(80)}
  // 4-2) 훈련 센터: 타자/투수 분리 설정·프리셋·개별 훈련·되돌리기
  await nav('선수단','훈련');await sweep('훈련 센터');ok(await pg.evaluate(()=>/타자 훈련/.test(document.body.innerText)&&/투수 훈련/.test(document.body.innerText)&&/개별 훈련/.test(document.body.innerText)&&/비시즌 캠프/.test(document.body.innerText)),`${label}: 훈련 센터 구성`);
  for(const a of ['B:focus:power','B:inten:heavy','P:focus:control','P:inten:light','B:focus:cond','P:focus:stamina'])await click(`button[data-act="trainSide"][data-a="${a}"]`);await sweep('훈련 설정');
  await click('button[data-act="trainPreset"][data-a="b_bat"]');await sweep('프리셋');await pg.evaluate(()=>{const e=document.querySelector('#presetName');if(e)e.value='점검용'});await click('button[data-act="trainPresetSave"]');await sweep('프리셋 저장');
  ok(await click('button[data-act="slotAddDo"]'),`${label}: 추천 후보로 개별 훈련 추가`);await click('button[data-act="slotAddDo"]');await sweep('개별 훈련');await click('button[data-act="slotSetA"][data-a$=":focus:eye"]')||await click('button[data-act="slotSetA"][data-a$=":focus:contact"]');await click('button[data-act="slotSetA"][data-a$=":inten:heavy"]');await sweep('개별 훈련 변경');
  ok(await pg.evaluate(()=>[...document.querySelectorAll('button[data-act="campSet"]')].every(b=>b.disabled)),`${label}: 시즌 중 캠프 비활성`);
  await click('button[data-act="slotRemoveA"]');await click('button[data-act="trainPresetDel"]');await click('button[data-act="undo"]');await sweep('훈련 되돌리기');
  await nav('선수단','2군');ok(await pg.evaluate(()=>/훈련 센터 열기/.test(document.body.innerText)),`${label}: 2군 화면 훈련 요약 카드`);
  // 4-3) 스카우팅: 스카우트 고용·관심 목록·리포트·필터
  await nav('운영','스카우팅');await sweep('스카우팅');ok(await pg.evaluate(()=>/스카우트 조직/.test(document.body.innerText)&&/관심 목록/.test(document.body.innerText)&&/후보 풀/.test(document.body.innerText)),`${label}: 스카우팅 구성`);
  ok(await click('button[data-act="scoutHireA"]'),`${label}: 스카우트 영입`);await click('button[data-act="scoutHireA"]');await click('button[data-act="scoutAuto"]');await sweep('관심 추가');
  for(const f of ['B','SP','RP','hs','univ','watch','all'])await click(`button[data-act="scoutFilter"][data-a="${f}"]`);for(const k of ['unc','age','score'])await click(`button[data-act="scoutSort"][data-a="${k}"]`);await sweep('후보 필터');
  await pg.evaluate(()=>{const r=document.querySelector('.pli[data-act="scoutOpen"]');if(r)r.click()});await pg.waitForTimeout(150);ok(!!(await pg.$('[aria-label="스카우팅 리포트"]')),`${label}: 리포트 시트`);ok(await pg.evaluate(()=>!/peak/.test(document.body.innerText)),`${label}: 리포트에 숨은 값 노출 없음`);await sweep('리포트');await click('button[data-act="scoutStarA"]');await click('button[data-act="scoutClose"]');await click('button[data-act="scoutFireA"]');
  // 5) 전 화면 순회
  const groups=[['대시보드',[]],['선수단',['로스터','2군','라인업','투수진','훈련','분위기']],['리그',['일정·결과','순위·기록','팀 정보','스토리']],['운영',['재정','코치진','스카우팅','이적시장']],['설정',[]]];
  for(const [g,subs] of groups){await nav(g);await sweep(g);for(const s of subs){await nav(g,s);await sweep(g+'/'+s)}}
  // 스토리 탭
  await nav('리그','스토리');for(const t of ['top','line','press','chal','hist']){await click(`button[data-act="storyTab"][data-a="${t}"]`);await sweep('스토리'+t)}
  // 6) 2군 필터·정렬, 콜업 시트
  await nav('선수단','2군');for(const f of ['B','SP','RP','young','all']){await click(`button[data-act="farmF"][data-a="${f}"]`);await sweep('2군필터'+f)}for(const s of ['form','age','ovr'])await click(`button[data-act="farmS"][data-a="${s}"]`);
  if(await click('.plist button[data-act="toggleActive"]')){await pg.waitForTimeout(200);await sweep('콜업시트');await click('button[data-act="swapClose"]')}
  // 7) 시즌 진행(자동) + 이벤트 처리 + 라이브 경기
  await nav('대시보드');await pg.evaluate(()=>{const e=document.querySelector('#playMode');if(e){e.value='highlight';e.dispatchEvent(new Event('change',{bubbles:true}))}});
  let liveDone=0,reviewSeen=false,momentSeen=false;
  for(let i=0;i<70&&liveDone<2;i++){
    for(let k=0;k<4;k++)await click('button[data-act="evChoice"]');
    const act=await pg.evaluate(()=>{const b=document.querySelector('button.primary[data-act="adv"],button[data-act="adv"],button[data-act="advMoment"]');return b?b.dataset.act:null});
    await click('button[data-act="advMoment"]')||await click('button[data-act="adv"]');await pg.waitForTimeout(250);
    if(await pg.$('.livecols')){
      let st=0;while(await pg.$('.livecols')&&st++<400){
        if(await pg.$('.momentcard'))momentSeen=true;
        if(await pg.$('button[data-act="liveFinish"]')){await sweep('라이브종료');await click('button[data-act="liveFinish"]');await pg.waitForTimeout(250);if(await pg.evaluate(()=>/내 결정 되짚기/.test(document.body.innerText)))reviewSeen=true;await sweep('결과시트');await confirm();liveDone++;break}
        if(st===3){await click('button[data-act="liveAdv"][data-a="pcOpen"]');await click('button[data-act="liveDo"][data-a="pc"]')}
        if(st===6&&!(await click('button[data-act="liveAdv"][data-a="bunt"]'))){}
        await click('button[data-act="liveRun"][data-a="pa"]');if(st%25===0)await sweep('라이브'+st)}
    }
    await confirm();
  }
  ok(liveDone>=1,`${label}: 라이브 경기 진행`);
  console.log(`  [${label}] 라이브 ${liveDone}경기 · 이 순간 카드 ${momentSeen?'확인':'미발생'} · 결정 되짚기 ${reviewSeen?'확인':'미발생(결정 없음)'}`);
  // 8) 저장 → 새로고침 → 이어하기
  await nav('설정');await click('button[data-act="saveNow"]');await pg.reload();await pg.waitForTimeout(500);ok(!!(await click('button[data-act="continue"]')),`${label}: 이어하기 버튼`);await pg.waitForTimeout(500);await sweep('이어하기 후');
  ok(errs.length===0,`${label}: 콘솔·페이지 오류 ${errs.slice(0,3).join(' | ')}`);
  await b.close();
}
(async()=>{
  await run({width:390,height:844},'모바일','삼성');
  await run({width:1280,height:800},'데스크톱','두산');
  console.log(fails?`✗ 실패 ${fails}건 / 검사 ${checks}건`:`✓ 모두 통과 (검사 ${checks}건)`);process.exit(fails?1:0);
})();
