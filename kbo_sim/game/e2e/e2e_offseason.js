/* 브라우저 오프시즌 점검: 시즌 종료 → 재계약 협상 → 드래프트 연출 → FA(속보·협상) → 새 시즌, 2회 반복 */
const {chromium}=require('playwright');const path=require('path');
const FILE='file://'+(process.argv[2]||path.join(__dirname,'..','index.html'));let fails=0,checks=0;const ok=(c,m)=>{checks++;if(!c){fails++;console.log('  ✗',m)}};
const BAD=/undefined|NaN|\[object|\{[a-z]+\}|Infinity/;
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const pg=await ctx.newPage();pg.setDefaultTimeout(15000);
const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
const click=async s=>pg.evaluate(s=>{const e=document.querySelector(s);if(e&&!e.disabled){e.click();return true}return false},s);
const sweep=async tag=>{const t=await pg.evaluate(()=>document.body.innerText);const m=t.match(BAD);ok(!m,`${tag}: 오류 문자열 ${m?m[0]:''}`);const w=await pg.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);ok(w<=2,`${tag}: 가로 넘침 ${w}`)};
const nav=async(g,s)=>{await pg.evaluate(()=>{const b=document.querySelector('.sheet-bg[data-act="compClose"] button[data-act="compClose"]');if(b)b.click()});await pg.evaluate(n=>{const b=[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes(n));if(b)b.click()},g);await pg.waitForTimeout(100);if(s){await pg.evaluate(n=>{const b=[...document.querySelectorAll('.tabs.sub button')].find(b=>b.innerText.trim()===n);if(b)b.click()},s);await pg.waitForTimeout(120)}};
await pg.goto(FILE);await pg.waitForTimeout(400);await pg.click('text=KIA');await pg.click('text=감독 시작');await pg.waitForTimeout(1200);
await nav('운영','이적시장');await click('button[data-act="mtab"][data-a="fa"]');await click('button[data-act="faClose"]');
await nav('운영','스카우팅');await click('button[data-act="scoutHireA"]');await click('button[data-act="scoutHireA"]');await click('button[data-act="scoutAuto"]');await click('button[data-act="scoutStarA"]');
const year0=await pg.evaluate(()=>document.body.innerText.match(/20\d\d/)[0]);
for(let season=0;season<2;season++){
  // 시즌 끝까지 자동
  await nav('대시보드');await pg.evaluate(()=>{const e=document.querySelector('#playMode');if(e){e.value='auto';e.dispatchEvent(new Event('change',{bubbles:true}))}});
  let g=0;while(!(await pg.$('button[data-act="toOff"]'))&&g++<60){for(let k=0;k<4;k++)await click('button[data-act="evChoice"]');await click('button[data-act="advAuto"][data-a="30"]');await pg.waitForTimeout(150);await pg.evaluate(()=>{for(const b of document.querySelectorAll('.sheet button'))if(['확인','닫기'].includes(b.innerText.trim()))b.click()});
    if(await pg.$('button[data-act="postAuto"]'))await click('button[data-act="postAuto"]');if(await pg.$('button[data-act="postSim"]'))await click('button[data-act="postSim"]');
    for(const a of ['postLive','startPost','toPost'])if(await pg.$(`button[data-act="${a}"]`)&&a!=='postLive')await click(`button[data-act="${a}"]`)}
  // 포스트시즌 전개: 'toOff'가 나올 때까지
  let h=0;while(!(await pg.$('button[data-act="toOff"]'))&&h++<80){const acts=await pg.evaluate(()=>[...document.querySelectorAll('button[data-act]')].map(b=>b.dataset.act).filter(a=>/^(post|adv|start|to)/.test(a)));for(const a of ['postSim','postAuto','postAll','advPost','startPost','advAuto'])if(acts.includes(a)){await click(`button[data-act="${a}"]${a==='advAuto'?'[data-a="30"]':''}`);break}await pg.waitForTimeout(100);await pg.evaluate(()=>{for(const b of document.querySelectorAll('.sheet button'))if(['확인','닫기'].includes(b.innerText.trim()))b.click()});
    if(await pg.$('button[data-act="postLive"]')){await pg.evaluate(()=>{const e=document.querySelector('#playMode');if(e){e.value='auto';e.dispatchEvent(new Event('change',{bubbles:true}))}});await click('button[data-act="postAuto"]')||await click('button[data-act="postSim"]')}}
  ok(!!(await pg.$('button[data-act="toOff"]')),`시즌${season}: 시즌 종료 도달`);
  if(!(await pg.$('button[data-act="toOff"]')))break;
  await click('button[data-act="toOff"]');await pg.waitForTimeout(300);await sweep(`오프시즌${season}`);
  // 비시즌 캠프 설정
  await nav('선수단','훈련');await sweep(`훈련 센터(오프시즌${season})`);ok(await pg.evaluate(()=>/유망주 노트/.test(document.body.innerText)),`훈련 센터 유망주 노트${season}`);ok(await pg.evaluate(()=>[...document.querySelectorAll('button[data-act="campSet"]')].some(b=>!b.disabled)),`오프시즌 캠프 활성${season}`);
  await pg.evaluate(()=>document.querySelectorAll('details[data-fold]:not([open])').forEach(d=>{d.open=true}));await pg.waitForTimeout(60);await click('button[data-act="campSet"][data-a^="B:power:"]:not([data-a$=":0"])');await click('button[data-act="campSet"][data-a^="B:"][data-a$=":2"]');await click('button[data-act="campSet"][data-a^="P:"][data-a$=":1"]');await sweep('캠프 설정');ok(await pg.evaluate(()=>/예약 비용/.test(document.body.innerText)),`캠프 예약 비용 표시${season}`);
  await nav('선수단','로스터');await click('button[data-act="go"][data-a="offseason"]');await pg.evaluate(()=>{const b=[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes('오프시즌'));if(b)b.click()});await pg.waitForTimeout(200);
  // 연말 성장 공개
  ok(await pg.evaluate(()=>/성장 공개/.test(document.body.innerText)),`성장 공개 배너${season}`);await sweep('성장 배너');
  if(await click('button[data-act="grOpen"]')){await pg.waitForTimeout(100);ok(!!(await pg.$('.sheet.growth')),`성장 공개 시트${season}`);ok(await pg.evaluate(()=>/\?\?/.test(document.querySelector('.gnum').innerText)),`공개 전에는 결과 숨김${season}`);await sweep('성장 공개(전)');
    await click('button[data-act="grShow"]');await pg.waitForTimeout(150);ok(await pg.evaluate(()=>!/\?\?/.test(document.querySelector('.gnum').innerText)&&/[▲▼]|급성장|성장|유지|하락|급락/.test(document.querySelector('.gcard').innerText)),`공개 후 결과 표시${season}`);await sweep('성장 공개(후)');
    let st=0;while(await pg.$('.sheet.growth')&&st++<40){await click('button[data-act="grShow"]');await click('button[data-act="grNext"]')}
    ok(await pg.evaluate(()=>/성장 요약/.test(document.body.innerText)),`성장 요약${season}`);await sweep('성장 요약');await click('button[data-act="grClose"]');ok(await pg.evaluate(()=>/다시 보기/.test(document.body.innerText)),`공개 후 다시 보기${season}`)}
  // 재계약 비교 표(전년 연봉 → 요구, 사유)·연봉조정 시트
  if(await pg.$('button[data-act="negOpen"]'))ok(await pg.evaluate(()=>/전년 연봉/.test(document.body.textContent)&&/요구 연봉/.test(document.body.textContent)&&/\d+%/.test(document.body.textContent)),`재계약 표: 전년 연봉·요구·증감률${season}`);
  if(await pg.evaluate(()=>{const b=document.querySelector('button[data-act="arbOpen"]');if(b){b.click();return true}return false})){await pg.waitForTimeout(250);ok(await pg.evaluate(()=>/연봉조정/.test(document.body.innerText)&&/위원회 평가 예상/.test(document.body.innerText)),`연봉조정 시트${season}`);await sweep('연봉조정');await click('button[data-act="arbFile"]');await pg.waitForTimeout(200);ok(await pg.evaluate(()=>/수용하고 계약/.test(document.body.innerText)),`연봉조정 결과${season}`);await click('button[data-act="arbAccept"]');await pg.waitForTimeout(200);}
  // 재계약 협상
  if(await pg.evaluate(()=>{const b=[...document.querySelectorAll('button[data-act="negOpen"]')].find(b=>/\|resign$/.test(b.dataset.a));if(b){b.click();return true}return false})){await pg.waitForTimeout(250);ok(!!(await pg.$('.negwin')),`재계약 협상창${season}`);await sweep('재계약협상');await click('button[data-act="negFill"]');await click('button[data-act="negSend"]');await sweep('재계약제안');await click('button[data-act="negDone"]')||await click('button[data-act="negExit"]');await pg.waitForTimeout(150)}
  await click('button[data-act="negExit"]');await click('button[data-act="resignAll"]');await sweep('재계약후');
  // 드래프트 연출
  await click('button[data-act="toDraft"]');await pg.waitForTimeout(700);ok(!!(await pg.$('.draftstage'))||!!(await pg.$('button[data-act="draftPick"]')),`드래프트 연출${season}`);await sweep('드래프트');
  let w=0;while(!(await pg.$('button[data-act="draftPick"]'))&&w++<80)await pg.waitForTimeout(300);ok(await pg.evaluate(()=>/스카우트 추천/.test(document.body.innerText)&&/확신도|낮음|보통|높음/.test(document.body.innerText)),`드래프트 화면 스카우트 추천·확신도${season}`);ok(!!(await pg.$('button[data-act="draftPick"]')),`내 차례 도달${season}`);
  await pg.evaluate(()=>window.scrollTo(0,0));await sweep('내 차례');
  for(let k=0;k<2;k++){if(await click('button[data-act="draftPick"]')){await pg.waitForTimeout(900);let q=0;while(!(await pg.$('button[data-act="draftPick"]'))&&!(await pg.$('button[data-act="toFA"]'))&&q++<60)await pg.waitForTimeout(250)}}
  ok(await pg.evaluate(()=>/드래프트 데이/.test(document.body.innerText)&&/내 다음 지명|지금 내 차례/.test(document.body.innerText)&&document.querySelectorAll('table.dboard td.dc').length===110),`드래프트 데이 카드·지명 보드${season}`);
  await click('button[data-act="draftAuto"]');await pg.waitForTimeout(300);await sweep('드래프트 종료');
  ok(await pg.evaluate(()=>/드래프트 결과 리포트/.test(document.body.innerText)&&/평균 보드 순위/.test(document.body.innerText)&&/드래프트 종료/.test(document.body.innerText)),`드래프트 결과 리포트${season}`);await sweep('드래프트 리포트');
  ok(!!(await pg.$('button[data-act="toFA"]')),`FA로 이동 가능${season}`);await click('button[data-act="toFA"]');await pg.waitForTimeout(300);await sweep('FA 시작');
  for(let d=0;d<6;d++){await click('button[data-act="faDay"][data-a="7"]');await pg.waitForTimeout(150)}
  ok(await pg.evaluate(()=>/스프링캠프/.test(document.body.innerText)),`스프링캠프 소식 표시${season}`);await sweep('캠프 소식');if(await click('button[data-act="evChoice"][data-a$="|bat"]')||await click('button[data-act="evChoice"][data-a$="|pit"]')){await pg.waitForTimeout(150);await sweep('캠프 소식 선택')}
  await sweep('FA 진행');ok(await pg.evaluate(()=>/시장 속보/.test(document.body.innerText)),`시장 속보 표시${season}`);
  if(await pg.evaluate(()=>{const b=[...document.querySelectorAll('button[data-act="negOpen"]')].find(b=>/\|fa$/.test(b.dataset.a));if(b){b.click();return true}return false})){await pg.waitForTimeout(250);await click('button[data-act="negFill"]');await click('button[data-act="negSend"]');await sweep('FA협상');await click('button[data-act="negExit"]')}
  await click('button[data-act="toSeason"]');await pg.waitForTimeout(600);ok((await pg.evaluate(()=>scrollY))===0,`새 시즌 시작 시 스크롤 0 (${season})`);await sweep('새 시즌');
  // 새 시즌에서 스토리·구단 역사·커리어
  await nav('리그','스토리');await click('button[data-act="storyTab"][data-a="hist"]');await sweep('구단역사');ok(await pg.evaluate(()=>/구단 소개/.test(document.body.innerText)&&/한국시리즈 우승/.test(document.body.innerText)&&/영구결번/.test(document.body.innerText)&&/구단 이야기/.test(document.body.innerText)),'구단 소개 카드(창단·우승·영구결번·구단 이야기)');ok(await pg.evaluate(()=>/완료된 시즌이 아직 없습니다/.test(document.body.innerText))===false,`구단 역사에 시즌 기록 (${season})`);
  await click('button[data-act="storyTab"][data-a="chal"]');await sweep('도전과제');await click('button[data-act="storyTab"][data-a="top"]');await sweep('올해의 이야기');
  await nav('선수단','로스터');await pg.evaluate(()=>{const r=document.querySelector('tr[data-act="player"]');if(r)r.click()});await click('button[data-act="mtab2"][data-a="car"]');await sweep('커리어');ok(await pg.evaluate(()=>/시즌 기록/.test(document.body.innerText)),`커리어 탭 (${season})`);await click('button[data-act="closeModal"]');
  await nav('선수단','분위기');await sweep('분위기');
  await nav('운영','이적시장');await click('button[data-act="faClose"]');
}
ok(errs.length===0,`콘솔·페이지 오류: ${errs.slice(0,3).join(' | ')}`);
console.log(fails?`✗ 실패 ${fails}건 / 검사 ${checks}건`:`✓ 오프시즌 점검 통과 (검사 ${checks}건)`);await b.close();process.exit(fails?1:0)})();
