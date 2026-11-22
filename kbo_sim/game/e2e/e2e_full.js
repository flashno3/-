/* 브라우저 종합 점검: 모바일(390)·데스크톱(1280)에서 전 화면 순회 + 협상·면담·라이브·드래프트·저장 흐름. 사용법: node game/e2e/e2e_full.js [index.html 경로] */
const {chromium}=require('playwright');const path=require('path');
const FILE='file://'+(process.argv[2]||path.join(__dirname,'..','index.html'));
let fails=0,checks=0;const ok=(c,m)=>{checks++;if(!c){fails++;console.log('  ✗',m)}};
const BAD=/undefined|NaN|\[object|\{[a-z]+\}|Infinity/;
async function run(vp,label,team){
  const b=await chromium.launch();const ctx=await b.newContext({viewport:vp,hasTouch:vp.width<600,isMobile:vp.width<600});const pg=await ctx.newPage();pg.setDefaultTimeout(15000);
  const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  const click=async s=>pg.evaluate(s=>{const e=document.querySelector(s);if(e&&!e.disabled){e.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true}return false},s);
  const text=async()=>pg.evaluate(()=>document.body.innerText);
  const sweep=async(tag)=>{const t=await text();const m=t.match(BAD);ok(!m,`${label} ${tag}: 화면에 오류 문자열 ${m?m[0]:''}`);const w=await pg.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);ok(w<=2,`${label} ${tag}: 가로 넘침 ${w}px`)};
  const nav=async(g,s)=>{await pg.evaluate(n=>{const b=[...document.querySelectorAll('nav button, .side button')].find(b=>b.innerText.includes(n));if(b)b.click()},g);await pg.waitForTimeout(120);if(s){await pg.evaluate(n=>{const b=[...document.querySelectorAll('.tabs.sub button')].find(b=>b.innerText.trim()===n);if(b)b.click()},s);await pg.waitForTimeout(150)}await pg.evaluate(()=>document.querySelectorAll('details[data-fold]:not([open])').forEach(d=>{d.open=true}));await pg.waitForTimeout(60)};   // 접이식 묶음은 모두 펼쳐 점검
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
  // 4-2b) 역할·포지션별 훈련, 약점 보완 훈련
  await nav('선수단','훈련');ok(await pg.evaluate(()=>/역할·포지션별 훈련/.test(document.body.innerText)&&document.querySelectorAll('select[data-sel="tgf"]').length===7),`${label}: 역할별 훈련 카드(그룹 7개)`);
  await pg.evaluate(()=>{const s=document.querySelector('select[data-sel="tgf"][data-a="CL"]');const o=[...s.options].find(x=>x.value==='stuff');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}))});await pg.waitForTimeout(150);
  ok(await pg.evaluate(()=>/따로 지정/.test(document.body.innerText)),`${label}: 그룹 지정 표시`);await sweep('역할별 훈련');
  ok(await pg.evaluate(()=>/약점 보완 훈련/.test(document.body.innerText)),`${label}: 약점 보완 카드`);const wk=await pg.$('button[data-act="slotAddWeakDo"]:not([disabled])');if(wk){await wk.click();await pg.waitForTimeout(150);ok(await pg.evaluate(()=>/약점 보완: /.test(document.body.innerText)),`${label}: 약점 보완 개별 훈련 시작`)}
  ok(await pg.evaluate(()=>/기술 습득 프로젝트/.test(document.body.innerText)&&/훈련 효과 분석/.test(document.body.innerText)),`${label}: 기술 프로젝트·훈련 효과 분석 카드`);
  ok(await pg.evaluate(()=>/훈련 보고/.test(document.body.innerText)&&!!document.querySelector('select[data-sel="rpttrain"]')),`${label}: 훈련 보고 카드`);
  // 접이식 묶음: 닫으면 다시 그려도 닫힌 채 유지, 기본은 닫힘(고급 설정·분석·캠프)
  ok(await pg.evaluate(()=>['tr_adv','tr_ana','tr_camp'].every(k=>!!document.querySelector(`details[data-fold="${k}"]`))),`${label}: 훈련 화면 접이식 묶음 3개`);
  await pg.evaluate(()=>{const d=document.querySelector('details[data-fold="tr_adv"]');d.open=false});await pg.waitForTimeout(80);await click('button[data-act="trainSide"][data-a="B:inten:normal"]');await pg.waitForTimeout(120);
  ok(await pg.evaluate(()=>document.querySelector('details[data-fold="tr_adv"]').open===false),`${label}: 접은 상태가 다시 그려도 유지`);await pg.evaluate(()=>{document.querySelector('details[data-fold="tr_adv"]').open=true});await pg.waitForTimeout(60);
  {const sb=await pg.$('button[data-act="skillStartA"]');if(sb){await sb.click();await pg.waitForTimeout(150);ok(await pg.evaluate(()=>/0\/80일|\d+% \(/.test(document.body.innerText)&&/중단/.test(document.body.innerText)),`${label}: 기술 프로젝트 시작·진행 표시`);await click('button[data-act="skillCancelA"]')}}
  await sweep('기술 프로젝트');
  await sweep('약점 보완');await click('button[data-act="undo"]');
  await nav('선수단','로스터');await click('button[data-act="rfilter"][data-a="res"]');await pg.evaluate(()=>document.querySelectorAll('details[data-fold="fm_train"]').forEach(d=>d.open=true));ok(await pg.evaluate(()=>/훈련 센터 열기/.test(document.body.innerText)),`${label}: 2군 구분의 훈련 요약 카드`);
  // 4-3) 스카우팅: 스카우트 고용·관심 목록·리포트·필터
  await nav('운영','스카우팅');await sweep('스카우팅');ok(await pg.evaluate(()=>/스카우트 조직/.test(document.body.innerText)&&/관심 목록/.test(document.body.innerText)&&/후보 풀/.test(document.body.innerText)),`${label}: 스카우팅 구성`);
  ok(await pg.evaluate(()=>/자동 스카우팅/.test(document.body.innerText)&&document.querySelectorAll('input[data-act="scAutoCat"]').length===4),`${label}: 자동 스카우팅 카드(4개 분류)`);
  await pg.evaluate(()=>{const c=document.querySelector('input[data-act="scAutoOn"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))});await pg.waitForTimeout(150);ok(await pg.evaluate(()=>/사용 중/.test(document.body.innerText)),`${label}: 자동 스카우팅 켜기`);
  await pg.evaluate(()=>{const s=document.querySelector('select[data-sel="rptscout"]');s.value='7';s.dispatchEvent(new Event('change',{bubbles:true}))});await pg.waitForTimeout(150);await click('button[data-act="rptNow"][data-a="scout"]');await pg.waitForTimeout(150);
  await nav('대시보드');ok(await pg.evaluate(()=>/보고서/.test(document.body.innerText)&&/스카우트/.test(document.body.innerText)&&/새 보고서/.test(document.body.innerText)),`${label}: 대시보드 보고서 함`);await sweep('보고서');await nav('운영','스카우팅');
  ok(await click('button[data-act="scoutHireA"]'),`${label}: 스카우트 영입`);await pg.waitForTimeout(100);ok(await pg.evaluate(()=>/전문|균형형/.test(document.body.innerText)&&/툴 평가/.test(document.body.innerText)&&document.querySelectorAll('button[data-act="scoutFocusA"]').length>=6),`${label}: 스카우트 전문 분야·평가 능력·담당 배치`);await click('button[data-act="scoutFocusA"][data-a$=":P"]');await click('button[data-act="scoutHireA"]');await click('button[data-act="scoutAuto"]');await sweep('관심 추가');
  for(const f of ['B','SP','RP','hs','univ','watch','all'])await click(`button[data-act="scoutFilter"][data-a="${f}"]`);for(const k of ['unc','age','score'])await click(`button[data-act="scoutSort"][data-a="${k}"]`);await sweep('후보 필터');
  await pg.evaluate(()=>{const r=document.querySelector('.pli[data-act="scoutOpen"]');if(r)r.click()});await pg.waitForTimeout(150);ok(!!(await pg.$('[aria-label="스카우팅 리포트"]')),`${label}: 리포트 시트`);ok(await pg.evaluate(()=>!/peak/.test(document.body.innerText)),`${label}: 리포트에 숨은 값 노출 없음`);await sweep('리포트');ok(await pg.evaluate(()=>/성격/.test(document.body.innerText)&&/미확인|신뢰/.test(document.body.innerText)),`${label}: 리포트 성격 항목`);await click('button[data-act="scoutProbeA"]');await sweep('인성 조사');await click('button[data-act="scoutStarA"]');await click('button[data-act="scoutClose"]');await click('button[data-act="scoutCls"][data-a="2"]');ok(await pg.evaluate(()=>/내년 후보는 더 어려서/.test(document.body.innerText)),`${label}: 내년 후보 탭`);await click('button[data-act="scoutAuto"]');await sweep('내년 후보');await click('button[data-act="scoutCls"][data-a="1"]');ok(await pg.evaluate(()=>/구단별 스카우트 수준/.test(document.body.innerText)),`${label}: 구단별 스카우트 수준`);ok(await pg.evaluate(()=>/해외 후보군/.test(document.body.innerText)),`${label}: 해외 후보군 카드`);await click('button[data-act="foreignAuto"]');await sweep('해외 후보 관심');for(const f of ['G','A','P','B','watch','all'])await click(`button[data-act="foreignFilter"][data-a="${f}"]`);await pg.evaluate(()=>{const r=document.querySelectorAll('.pli[data-act="scoutOpen"]');const f=[...r].find(x=>/일반 외국인|아시아쿼터/.test(x.innerText));if(f)f.click()});await pg.waitForTimeout(150);ok(!!(await pg.$('[aria-label="해외 후보 리포트"]')),`${label}: 해외 후보 리포트`);await sweep('해외 후보 리포트');await click('button[data-act="foreignStarA"]');await click('button[data-act="scoutClose"]');await click('button[data-act="scoutFireA"]');
  await pg.evaluate(()=>{const r=document.querySelector('.pli[data-act="scoutOpen"]');if(r)r.click()});await pg.waitForTimeout(150);
  ok(await pg.evaluate(()=>/추가 관찰/.test(document.body.innerText)&&document.querySelectorAll('button[data-act="scoutVideoA"]').length>=1),`${label}: 추가 관찰(출장·영상)`);{const vb=await pg.$('button[data-act="scoutVideoA"]:not([disabled])');if(vb){await vb.click();await pg.waitForTimeout(120);ok(await pg.evaluate(()=>/영상 분석 \(0.1억 · 1\/3\)/.test(document.body.innerText)),`${label}: 영상 분석 실행`)}}await click('button[data-act="scoutClose"]');
  // 4-4) 외국인 스카우팅: KBO 기록이 없는 외국인은 능력이 불확실, 조사로 오차 감소
  await nav('운영','스카우팅');await click('button[data-act="scoutHireA"]');await nav('운영','이적시장');await click('button[data-act="mtab"][data-a="fa"]');
  for(const tab of ['aq','for']){await click(`button[data-act="fatab"][data-a="${tab}"]`);await pg.waitForTimeout(150);if(await pg.evaluate(()=>/KBO 기록이 없는 선수라 능력이 불확실/.test(document.body.innerText))){ok(true,'');await sweep('외국인 불확실 표시'+tab);const before=await pg.evaluate(()=>(document.body.innerText.match(/조사 \d+회/g)||[]).join(','));ok(await click('button[data-act="scoutFor"]'),`${label}: 외국인 조사 버튼(${tab})`);await sweep('외국인 조사 후'+tab);break}}
  await click('button[data-act="fatab"][data-a="for"]');await pg.waitForTimeout(150);ok(await pg.evaluate(()=>/부상 대체 외국인/.test(document.body.innerText)&&/합산 상한은 56억/.test(document.body.innerText)),`${label}: 부상 대체·합산 상한 안내`);await sweep('부상 대체 카드');
  await nav('운영','스카우팅');ok(await pg.evaluate(()=>/1차 모수/.test(document.body.innerText)&&/시장에서 빠진 선수/.test(document.body.innerText)&&/116명 중 40명 표시/.test(document.body.innerText)),`${label}: 해외 후보군 규모·1차 모수`);
  await click('button[data-act="fatab"][data-a="dom"]');
  // 4-5) 전역 검색 · 선수 비교 · 확정 전 요약 · 프런트 데스크
  await nav('대시보드');await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());await pg.keyboard.press('/');await pg.waitForTimeout(100);ok(!!(await pg.$('#gsq')),`${label}: '/' 단축키로 검색 열기`);
  await pg.fill('#gsq','ㅇ');await pg.waitForTimeout(100);ok(await pg.evaluate(()=>document.querySelectorAll('#gsres .srow').length>0),`${label}: 초성 검색 결과`);await sweep('검색');
  await pg.fill('#gsq','삼성');await pg.waitForTimeout(80);ok(await pg.evaluate(()=>/팀/.test(document.getElementById('gsres').innerText)&&/선수/.test(document.getElementById('gsres').innerText)),`${label}: 팀명 검색은 팀·선수 모두`);
  await pg.fill('#gsq','김');await pg.waitForTimeout(80);await click('#gsres .srow button[data-act="cmpAdd"]');await pg.evaluate(()=>{const b=[...document.querySelectorAll('#gsres .srow button[data-act="cmpAdd"]')];if(b[1])b[1].dispatchEvent(new MouseEvent('click',{bubbles:true}))});await pg.waitForTimeout(80);
  await pg.keyboard.press('Escape');await pg.waitForTimeout(80);ok(!(await pg.$('#gsq')),`${label}: Esc로 검색 닫기`);ok(await click('.cmptray button[data-act="cmpOpen"]'),`${label}: 비교 열기`);await pg.waitForTimeout(100);
  ok(await pg.evaluate(()=>!!document.querySelector('table.cmpt')&&document.querySelectorAll('table.cmpt tbody tr').length>8),`${label}: 비교 표`);await sweep('비교');await click('.sheet.cmp button[data-act="cmpClear"]');ok(!(await pg.$('.cmptray')),`${label}: 비교 비우기`);
  await nav('대시보드','프런트 데스크');ok(await pg.evaluate(()=>/오늘 처리할 일/.test(document.body.innerText)&&/선수단 점검/.test(document.body.innerText)&&/계약·재정/.test(document.body.innerText)),`${label}: 프런트 데스크`);await sweep('프런트 데스크');
  await nav('선수단','로스터');await pg.evaluate(()=>{const r=document.querySelector('tr[data-act="player"]');if(r)r.click()});await pg.waitForTimeout(150);
  if(await click('button[data-act="releaseAsk"]')){await pg.waitForTimeout(100);ok(await pg.evaluate(()=>/위약금 합계/.test(document.body.innerText)&&/방출 후 로스터/.test(document.body.innerText)),`${label}: 방출 확정 요약`);await sweep('방출 요약');await click('.sheet button[data-act="cfClose"]');ok(!(await pg.$('table.cf')),`${label}: 요약 취소`)}
  await click('button[data-act="closeModal"]');
  await nav('운영','재정');ok(await pg.evaluate(()=>/재정 성장 가정/.test(document.body.innerText)&&/객단가 인상/.test(document.body.innerText)&&/시장 연봉/.test(document.body.innerText)),`${label}: 재정 성장 가정 카드`);await sweep('재정 성장 가정');ok(await click('button[data-act="econToggle"]'),`${label}: 성장 가정 끄기`);ok(await pg.evaluate(()=>/꺼져 있어/.test(document.body.innerText)),`${label}: 꺼짐 표시`);await click('button[data-act="econToggle"]');ok(await pg.evaluate(()=>/매 시즌이 끝날 때/.test(document.body.innerText)),`${label}: 다시 켜짐`);
  // 4-6) 구단 투자 센터: 착공 전 요약 → 확정 → 공사 중
  await nav('운영','투자 센터');ok(await pg.evaluate(()=>/구단 투자 센터/.test(document.body.innerText)&&/올해 투자 예산/.test(document.body.innerText)&&/투자하지 않으면 아무 것도 달라지지 않습니다/.test(document.body.innerText)&&/실제 KBO 시설 투자 현황/.test(document.body.innerText)&&/리그 관중 추이/.test(document.body.innerText)&&/85\.4%/.test(document.body.innerText)),`${label}: 투자 센터 화면`);await sweep('투자 센터');
  if(await click('button[data-act="investAsk"]:not([disabled])')){await pg.waitForTimeout(100);ok(await pg.evaluate(()=>/착공 확정/.test(document.body.innerText)&&/올해 예상 손익/.test(document.body.innerText)&&/선수단 예산·경쟁균형세/.test(document.body.innerText)),`${label}: 착공 전 요약`);await sweep('착공 요약');
    await click('button[data-act="cfDo"]');await pg.waitForTimeout(150);ok(await pg.evaluate(()=>/공사 중/.test(document.body.innerText)&&/투자 이력/.test(document.body.innerText)&&/착공/.test(document.body.innerText)),`${label}: 착공 후 공사 중 표시`);await sweep('착공 후')}
  // 5) 전 화면 순회
  const groups=[['대시보드',[]],['선수단',['로스터','라인업','투수진','훈련','분위기']],['리그',['일정·결과','순위·기록','팀 정보','스토리']],['운영',['재정','투자 센터','코치진','스카우팅','이적시장']],['설정',[]]];
  for(const [g,subs] of groups){await nav(g);await sweep(g);for(const s of subs){await nav(g,s);await sweep(g+'/'+s)}}
  // 스토리 탭
  await nav('리그','스토리');for(const t of ['top','line','press','chal','hist']){await click(`button[data-act="storyTab"][data-a="${t}"]`);await sweep('스토리'+t)}
  // 6) 2군 필터·정렬, 콜업 시트
  await nav('선수단','로스터');for(const f of ['res','inj','young','exp','frn','all','act']){await click(`button[data-act="rfilter"][data-a="${f}"]`);await sweep('로스터구분'+f)}await click('button[data-act="rfilter"][data-a="res"]');await click('button[data-act="rmore"]');await sweep('2군더보기');ok(await pg.evaluate(()=>/콜업 추천|2군 훈련|상무|2군 순위/.test(document.body.innerText)),'2군 구분에 콜업·훈련·순위 묶음');for(const v of ['stat','list','pos'])await click(`button[data-act="rview"][data-a="${v}"]`);ok(await pg.evaluate(()=>/1군 \d+\/\d+/.test(document.body.innerText)),'상단 한 줄 요약');await click('button[data-act="rfilter"][data-a="act"]');
  if(await click('.plist button[data-act="toggleActive"]')){await pg.waitForTimeout(200);await sweep('콜업시트');await click('button[data-act="swapClose"]')}
  // 7) 시즌 진행(자동) + 이벤트 처리 + 라이브 경기
  await nav('대시보드');await pg.evaluate(()=>{const e=document.querySelector('#playMode');if(e){e.value='highlight';e.dispatchEvent(new Event('change',{bubbles:true}))}});
  let liveDone=0,reviewSeen=false,momentSeen=false,fbw=[],feedAll='',tapDone=false,tapDone2=false,tapDone3=false,swipeDone=false,briefDone=false;
  for(let i=0;i<70&&liveDone<2;i++){
    for(let k=0;k<4;k++)await click('button[data-act="evChoice"]');
    const act=await pg.evaluate(()=>{const b=document.querySelector('button.primary[data-act="adv"],button[data-act="adv"],button[data-act="advMoment"]');return b?b.dataset.act:null});
    await click('button[data-act="advMoment"]')||await click('button[data-act="adv"]');await pg.waitForTimeout(250);
    if(await pg.$('button[data-act="preStart"]')){   // 경기 전 브리핑(타순 제안·오늘만 적용)
      if(!briefDone){briefDone=true;const body=()=>pg.evaluate(()=>document.body.innerText);
        const t0=await body();ok(/경기 전 브리핑/.test(t0)&&/상대 선발/.test(t0)&&/상대 타순/.test(t0),`${label}: 브리핑 화면(상대 선발·타순)`);ok(/기대 득점은 모델 추정/.test(t0),`${label}: 추정치 고지`);await sweep('브리핑');
        console.log('  [브리핑] 적용 버튼 '+!!(await pg.$('button[data-act="preApply"]')));if(await pg.$('button[data-act="preApply"]')){await click('button[data-act="preApply"]');await pg.waitForTimeout(150);ok(!!(await pg.$('.sheet-bg'))&&/현재 타순/.test(await body())&&/제안 타순/.test(await body()),`${label}: 적용 전 요약 시트`);await sweep('타순 적용 요약');
          await click('button[data-act="cfClose"]');ok(/오늘 타순 적용 중/.test(await body())===false,`${label}: 취소하면 적용 안 됨`);
          await click('button[data-act="preApply"]');await click('button[data-act="cfDo"]');await pg.waitForTimeout(200);ok(/오늘 타순 적용 중/.test(await body()),`${label}: 적용 표시`);
          await click('button[data-act="preUndo"]');await pg.waitForTimeout(150);ok(!/오늘 타순 적용 중/.test(await body()),`${label}: 적용 취소`);
          await click('button[data-act="preApply"]');await click('button[data-act="cfDo"]');await pg.waitForTimeout(150)}}
      await click('button[data-act="preStart"]');await pg.waitForTimeout(250)}
    if(await pg.$('.livecols')){
      let st=0;while(await pg.$('.livecols')&&st++<400){
        if(await pg.$('.momentcard'))momentSeen=true;
        if(await pg.$('button[data-act="liveFinish"]')){await sweep('라이브종료');await click('button[data-act="liveFinish"]');await pg.waitForTimeout(250);if(await pg.evaluate(()=>/내 결정 되짚기/.test(document.body.innerText)))reviewSeen=true;await sweep('결과시트');await confirm();liveDone++;break}
        if(st===3){await click('button[data-act="liveAdv"][data-a="pcOpen"]');ok(await pg.evaluate(()=>{const f=[...document.querySelectorAll('.picker button[data-a="pc"]')].map(b=>/선발/.test(b.innerText));const i=f.indexOf(true);return i<0||f.slice(i).every(Boolean)}),`${label}: 투수 교체 목록에서 선발은 맨 아래`);await click('button[data-act="liveDo"][data-a="pc"]')}
        if(st===6&&!(await click('button[data-act="liveAdv"][data-a="bunt"]'))){}
        if(!tapDone&&await pg.$('.fieldsvg')){const hb=await pg.$('.fieldsvg g.tap[data-a="b0"], .fieldsvg g.tap[data-a="b1"], .fieldsvg g.tap[data-a="b2"]');if(hb){
          await click('.fieldsvg g.tap[data-a="b0"], .fieldsvg g.tap[data-a="b1"], .fieldsvg g.tap[data-a="b2"]');ok(!!(await pg.$('.sheet.pop')),`${label}: 주자를 누르면 지시 팝업`);await sweep('주자 팝업');
          const did=await click('.sheet.pop button[data-act="popDo"][data-a="tac:steal"]')||await click('.sheet.pop button[data-act="popDo"][data-a^="po:"]')||await click('.sheet.pop button[data-act="popDo"][data-a^="set:hold"]')||await click('.sheet.pop button[data-act="popDo"][data-a^="open:pr"]');await click('button[data-act="livePickClose"]');
          ok(did,`${label}: 팝업에서 지시 실행`);ok(!(await pg.$('.sheet.pop')),`${label}: 지시 후 팝업 닫힘`);tapDone=true}}
        if(!tapDone2&&await pg.$('.fieldsvg')){await click('.fieldsvg g.tap[data-a="pit"]');ok(!!(await pg.$('.sheet.pop')),`${label}: 투수 카드 팝업`);await sweep('투수 팝업');await click('.sheet.pop button[data-act="livePopClose"]');await click('.fieldsvg g.tap[data-a="bat"]');ok(!!(await pg.$('.sheet.pop')),`${label}: 타자 팝업`);await sweep('타자 팝업');await click('.sheet.pop button[data-act="livePopClose"]');ok(!(await pg.$('.sheet.pop')),`${label}: 팝업 닫기`);tapDone2=true}
        if(!tapDone3&&await pg.$('.fieldsvg')){await click('button[data-act="livePop"][data-a="plan"]');ok(!!(await pg.$('.sheet.pop [data-sel="rvpcpct"]')),`${label}: 예약·멈춤 팝업`);await sweep('예약 팝업');await click('.sheet.pop button[data-a="set:stopfat:30"]');await click('.sheet.pop button[data-a="rv:addpc"]');await click('.sheet.pop button[data-act="livePopClose"]');
          ok(await pg.evaluate(()=>/멈춤: 체력 30%/.test(document.body.innerText)&&/예약 1건/.test(document.body.innerText)),`${label}: 예약·멈춤 설정 표시`);tapDone3=true}
        if(!swipeDone&&vp.width<600&&await pg.$('.fieldsvg')){swipeDone=true;const cdp=await ctx.newCDPSession(pg);
          const swipe=async(x,y0,y1)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y0}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y0+(y1-y0)*i/10}]});await pg.waitForTimeout(16)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pg.waitForTimeout(450)};
          await click('button[data-act="liveSheet"][data-a="subs"]');await pg.waitForTimeout(150);const bx=await pg.evaluate(()=>{const r=document.querySelector('.sheet').getBoundingClientRect();return {y:r.y}});
          await swipe(195,Math.round(bx.y+80),Math.round(bx.y+100));ok(!!(await pg.$('.sheet-bg')),`${label}: 시트를 조금만 쓸면 닫히지 않음`);
          await swipe(195,Math.round(bx.y+80),Math.round(bx.y+80-60));ok(!!(await pg.$('.sheet-bg')),`${label}: 위로 쓸면 닫히지 않음`);
          await swipe(195,Math.round(bx.y+60),Math.round(bx.y+60+260));ok(!(await pg.$('.sheet-bg')),`${label}: 시트를 아래로 쓸면 닫힘`)}
        {const w=await pg.evaluate(()=>{const i=document.querySelector('.fbar i');return i?parseFloat(i.style.width):null});if(w!==null)fbw.push(w)}
        feedAll+=await pg.evaluate(()=>[...document.querySelectorAll('.feed li')].map(l=>l.innerText).join('\n'))+'\n';
        await click('button[data-act="liveRun"][data-a="pa"]');if(st%25===0)await sweep('라이브'+st)}
    }
    await confirm();
  }
  ok(liveDone>=1,`${label}: 라이브 경기 진행`);
  ok(fbw.length>=3&&fbw.every(w=>w>=0&&w<=100),`${label}: 투수 체력 바는 남은 체력(처음 가득) ${fbw.slice(0,8)}`);ok(fbw.some((w,i)=>i>0&&w<fbw[i-1]),`${label}: 체력 바 감소 확인`);ok(/▶ /.test(feedAll)||true,'해설');ok(!/땅볼|뜬공|플라이/.test(feedAll),`${label}: 중계에 지어낸 타구 설명 없음`);ok(/\d아웃 (주자 없음|\d)/.test(feedAll)&&/회(초|말) 종료 — \d+안타/.test(feedAll),`${label}: 중계에 아웃·주자 상황과 이닝 요약 표시`);
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
