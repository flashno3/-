(function () {
  'use strict';
  const { League, KO, POSS, ACTIVE_MAX } = KBOLeague, E0 = KBOEngine, TEAMS = E0.TEAMS, PARK = E0.PARKNAME;
  /* 홈 구장 공식 명칭(풀네임). PARK(짧은 이름)는 파크팩터 키로만 쓴다. 명칭은 구단 발표 기준이며 명명권 변경 시 갱신 필요 */
  const STAD0 = { Bears: '서울종합운동장 야구장(잠실야구장)', Twins: '서울종합운동장 야구장(잠실야구장)', Heroes: '고척스카이돔', Landers: '인천SSG랜더스필드', Wiz: '수원케이티위즈파크', Eagles: '대전한화생명볼파크', Tigers: '광주기아챔피언스필드', Giants: '사직야구장', Dinos: '창원NC파크', Lions: '대구삼성라이온즈파크' };   // 공식 명칭(사용자 제공)
  const STAD = new Proxy(STAD0, { get: (o, t) => (t === 'Bears' || t === 'Twins') && L && L.S && L.S.year >= 2027 ? '서울올림픽주경기장(임시 홈)' : o[t] });   // 2027년부터 LG·두산은 서울올림픽주경기장 사용(파크팩터는 잠실 값을 그대로 가정)
  const park = t => STAD[t] || PARK[t] || '';
  const COL = { Bears: '#1A1748', Twins: '#C30452', Heroes: '#820024', Landers: '#CE0E2D', Wiz: '#6B6B6B', Eagles: '#FF6600', Tigers: '#EA0029', Giants: '#0B2A56', Dinos: '#315288', Lions: '#0A5BC4' };
  // 팀 색(테마용). 로고는 사용자가 제공한 이미지(KBO_LOGOS)를 사용한다.
  const BADGE = { Bears: { p: '#131230' }, Twins: { p: '#C30452' }, Heroes: { p: '#820024' }, Landers: { p: '#CE0E2D' }, Wiz: { p: '#1C1C1C' }, Eagles: { p: '#F26A1B' }, Tigers: { p: '#E4002B' }, Giants: { p: '#0A2547' }, Dinos: { p: '#1E3F78' }, Lions: { p: '#0A5BC4' } };
  const logo = (t, size) => (KBO_LOGOS[t] ? `<img class="logo" src="${KBO_LOGOS[t]}" alt="${KO[t]}" style="height:${size || 22}px;width:${Math.round((size || 22) * 1.45)}px">` : '');   // 로고 원본 비율이 제각각이라 같은 크기의 상자 안에 맞춰 넣는다
  const applyTheme = () => { const r = document.documentElement.style; if (L) { r.setProperty('--tp', BADGE[L.S.userTeam].p); } else r.setProperty('--tp', '#1D7A4E'); };
  const SAVE_KEY = 'kbo.mgr.save.v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } } };
  let L = null, preview = null;
  const ui = { handsText: '', saveText: '', screen: 'home', rf: { f: 'all', s: 'ovr' }, live: null, trade: { team: null, give: new Set(), get: new Set() }, market: 'trade', faSort: 'war', toast: null, modal: null, liveMode: true, pick: null, team: 'Lions', seed: '', postPrompt: false, confirm: null };

  const P = id => L.S.players[id];
  const U = () => L.S.userTeam;
  const tier = v => (v >= 70 ? 4 : v >= 60 ? 3 : v >= 50 ? 2 : v >= 42 ? 1 : 0);
  const ovrChip = v => `<span class="ovr" data-t="${tier(v)}">${v}</span>`;
  const teamTag = t => (BADGE[t] ? `<span class="team">${logo(t, 24)}${KO[t]}</span>` : `<span class="team">${KO[t] || ''}</span>`);
  const pct3 = x => (x >= 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));
  const money = x => (Math.round(x * 10) / 10).toFixed(1) + '억';
  const sgn = n => (n > 0 ? '+' + n : String(n));
  const posName = { C: '포수', '1B': '1루', '2B': '2루', '3B': '3루', SS: '유격', LF: '좌익', CF: '중견', RF: '우익', DH: '지명', SP: '선발', RP: '구원' };
  const pos = p => (p.type === 'B' ? posName[p.pos] : (p.role === 'SP' ? '선발' : '구원'));

  /* ---------------- 저장 ---------------- */
  let saveTimer = null;
  function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (L) store.set(SAVE_KEY, L.save()); }, 300); }
  /* 터치로 스크롤하는 동안에는 화면을 다시 그리지 않는다(드래프트 발표처럼 주기적으로 다시 그리면 손가락 스크롤이 계속 끊긴다) */
  let touchAt = 0, scrollAt = 0, softT = null;
  document.addEventListener('touchstart', () => { touchAt = Date.now(); }, { passive: true });
  ['touchend', 'touchcancel'].forEach(ev => document.addEventListener(ev, () => { touchAt = 0; scrollAt = Date.now(); }, { passive: true }));
  window.addEventListener('scroll', () => { scrollAt = Date.now(); }, { passive: true });
  const busyScrolling = () => (touchAt && Date.now() - touchAt < 8000) || Date.now() - scrollAt < 350;
  function softRender() { if (busyScrolling()) { if (!softT) softT = setTimeout(() => { softT = null; softRender(); }, 250); return; } render(); }
  function toast(msg) { ui.toast = msg; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; const t = $('.toast'); if (t) t.remove(); }, 3800); }

  /* ---------------- 통계 문자열 ---------------- */
  function batLine(id, farm) { const c = (farm ? L.S.stats2 : L.S.stats).bat[id]; if (!c || !c.PA) return '<span class="muted">-</span>'; const ab = c.PA - c.BB - c.HBP - c.SF, h = c['1B'] + c['2B'] + c['3B'] + c.HR; return `${pct3(ab ? h / ab : 0)} · ${c.HR}홈런 · ${c.RBI}타점`; }
  function pitLine(id, farm) { const c = (farm ? L.S.stats2 : L.S.stats).pit[id]; if (!c || !c.outs) return '<span class="muted">-</span>'; return `${Math.floor(c.outs / 3)}${c.outs % 3 ? '.' + (c.outs % 3) : ''}이닝 · RA9 ${(c.R * 27 / c.outs).toFixed(2)} · ${c.K}K`; }
  const statLine = p => (p.type === 'B' ? batLine(p.id) : pitLine(p.id));
  const subHtml = p => { const s = L.sub(p); return '<span class="sub">' + Object.entries(s).map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('') + '</span>'; };
  const fitBadge = (p, ps) => { if (p.type !== 'B' || ps === 'DH') return ''; const l = L.fitLevel(p, ps), g = p.gs[ps] || 0; return l === 2 ? '<span class="chip in">주포지션</span>' : l === 1 ? `<span class="chip">소화 가능 (${g}경기)</span>` : g > 0 ? `<span class="chip bad">경험 적음 (${g}경기) · 수비 하락</span>` : `<span class="chip bad">부적합 · 수비 크게 하락</span>`; };

  /* ---------------- 시작 화면 ---------------- */
  function teamRating(Lg, t) {
    const lu = Lg.bestLineup(Lg.hitters(t)).map(x => Lg.ovr(Lg.S.players[x.id])), P2 = Lg.pitchers(t).slice().sort((a, b) => Lg._runsP(b) - Lg._runsP(a)), sp = P2.filter(p => p.role === 'SP').slice(0, 5), rp = P2.filter(p => !sp.includes(p)).slice(0, 6);
    const m = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 40;
    return { bat: m(lu), sp: m(sp.map(p => Lg.ovr(p))), rp: m(rp.map(p => Lg.ovr(p))) };
  }
  function renderStart() {
    if (!preview) preview = League.create(KBO_BASE, 'Bears', 1);
    const has = !!store.get(SAVE_KEY);
    const cards = TEAMS.map(t => {
      const r = teamRating(preview, t), stars = preview.players(t).sort((a, b) => preview.ovr(b) - preview.ovr(a)).slice(0, 3);
      return `<button class="teamcard" data-act="pickteam" data-a="${t}" aria-pressed="${ui.team === t}"><div class="nm">${logo(t, 44)}${KO[t]}</div>
        <div class="small muted">${park(t)} · 연봉 ${money(preview.cbtPay(t))}</div>
        <div class="row small"><span>타선 <b class="num">${r.bat.toFixed(0)}</b></span><span>선발 <b class="num">${r.sp.toFixed(0)}</b></span><span>불펜 <b class="num">${r.rp.toFixed(0)}</b></span></div>
        <div class="small">${stars.map(p => `${esc(p.ko)} ${ovrChip(preview.ovr(p))}`).join(' ')}</div></button>`;
    }).join('');
    return `<div class="start"><header><h1>KBO 감독 모드</h1><p class="muted" style="margin:6px 0 0">구단을 골라 라인업·로테이션·불펜을 짜고, 경기를 직접 지휘하고, 트레이드·FA·드래프트로 팀을 키우세요. 정규시즌 144경기 뒤 포스트시즌이 이어지고, 시즌이 끝나면 다음 시즌으로 계속됩니다.</p></header>
      <div class="teamcards">${cards}</div>
      <div class="card row"><div><h2>${KO[ui.team]}으로 시작</h2><div class="small muted">2027 시즌 · 선수 능력치는 2024~2026 기록을 합산해 평균으로 보정한 값입니다.</div></div><span class="sp"></span>
        <button class="primary big" data-act="newgame">감독 시작</button>${has ? '<button class="big" data-act="continue">이어하기</button>' : ''}</div>
      <details class="card adv" ${ui.seed ? 'open' : ''}><summary class="small">고급 설정</summary><div class="small muted" style="margin:6px 0">시드: 성장·부상·드래프트·경기 결과 등 모든 우연의 출발값입니다. 비워 두면 게임마다 무작위로 정해지고, 같은 숫자와 같은 선택이면 같은 결과가 재현됩니다.</div>
        <label class="small muted">시드(선택) <input type="text" id="seedIn" inputmode="numeric" value="${esc(ui.seed)}" style="width:110px" placeholder="무작위"></label></details></div>`;
  }

  /* ---------------- 공통 셸 ---------------- */
  const NAV = [['home', '대시보드'], ['roster', '로스터'], ['farm', '2군'], ['lineup', '라인업'], ['pitching', '투수진'], ['train', '훈련'], ['schedule', '일정·결과'], ['standings', '순위·기록'], ['teams', '팀 정보'], ['story', '스토리'], ['mood', '분위기'], ['finance', '재정'], ['coach', '코치진'], ['scout', '스카우팅'], ['market', '이적시장'], ['offseason', '오프시즌'], ['save', '저장·설정']];
  /* 메뉴를 5개 묶음으로 단순화: 대시보드 · 선수단 · 리그 · 운영 · 설정(+오프시즌). 묶음 안의 화면은 상단 탭으로 전환 */
  const SCR = { home: '대시보드', desk: '프런트 데스크', roster: '로스터', farm: '2군', lineup: '라인업', pitching: '투수진', train: '훈련', schedule: '일정·결과', standings: '순위·기록', teams: '팀 정보', story: '스토리', mood: '분위기', finance: '재정', invest: '투자 센터', coach: '코치진', scout: '스카우팅', market: '이적시장', offseason: '오프시즌', save: '저장·설정' };
  const GROUPS = [['home', '대시보드', ['home', 'desk']], ['team', '선수단', ['roster', 'farm', 'lineup', 'pitching', 'train', 'mood']], ['league', '리그', ['schedule', 'standings', 'teams', 'story']], ['ops', '운영', ['finance', 'invest', 'coach', 'scout', 'market']], ['offseason', '오프시즌', ['offseason']], ['save', '설정', ['save']]];
  function primary() {
    const S = L.S, st = L.standings(), my = st.find(x => x.team === U());
    if (S.phase === 'offseason') return { label: '오프시즌 진행', act: 'go', a: 'offseason' };
    if (S.phase === 'post_done') return { label: '오프시즌 시작', act: 'toOff' };
    if (S.phase === 'post') return L.userInPost() ? { label: '내 경기 진행', act: 'postNext' } : { label: '포스트시즌 진행', act: 'postNext' };
    if (S.phase === 'regular_done') return my.rank <= 5 ? { label: '포스트시즌 시작', act: 'startPost' } : { label: '시즌 종료 · 오프시즌', act: 'startPost' };
    return { label: L.userGameToday() ? (ui.liveMode ? '경기 시작(직접 지휘)' : '다음 경기') : '하루 진행', act: 'adv', a: 1 };
  }
  function phaseLabel() { const S = L.S; return S.phase === 'offseason' ? '오프시즌' : S.phase === 'post' || S.phase === 'post_done' ? '포스트시즌' : S.phase === 'regular_done' ? '정규시즌 종료' : L.dateStr(Math.min(S.day, 143)); }
  function shell(content) {
    const S = L.S, st = L.standings(), my = st.find(x => x.team === U()), pr = primary(), grp = GROUPS.find(g => g[2].includes(ui.screen)) || GROUPS[0], nav = GROUPS.filter(g => g[0] !== 'offseason' || S.phase === 'offseason'), evn = L.eventsOpen().length;
    return `<div class="app"><nav class="side" aria-label="메뉴"><div class="club">${logo(U(), 34)}${KO[U()]}</div>
      ${nav.map(g => `<button data-act="goG" data-a="${g[0]}" ${grp[0] === g[0] ? 'aria-current="true"' : ''}>${g[1]}${g[0] === 'offseason' ? ' ●' : ''}${g[0] === 'home' && evn ? ` <span class="chip warn">${evn}</span>` : ''}</button>`).join('')}</nav>
      <div class="main"><header class="top"><div class="info"><span class="date">${S.year} · ${phaseLabel()}</span><span class="muted">${S.phase === 'offseason' ? '오프시즌' : (my.w + my.l + my.d === 0 ? '개막 전' : `${my.rank}위 · ${my.w}승 ${my.l}패 ${my.d}무`)}</span><span class="muted">${cbtText(U())}</span></div>
      <button class="sm" data-act="searchOpen" aria-label="검색 (단축키 /)" title="검색 (/)">🔍</button><button class="primary" data-act="${pr.act}" ${pr.a !== undefined ? `data-a="${pr.a}"` : ''}>${pr.label}</button></header><main class="content">${grp[2].length > 1 ? `<div class="tabs sub" role="tablist">${grp[2].map(s => `<button role="tab" aria-selected="${ui.screen === s}" data-act="go" data-a="${s}">${SCR[s]}</button>`).join('')}</div>` : ''}${content}</main>
      <div class="dock"><button class="sm dk" data-act="undo" title="${L.undoLabel() ? '되돌리기: ' + esc(L.undoLabel()) : '되돌릴 변경 없음'}" aria-label="되돌리기" ${L.undoLabel() ? '' : 'disabled'}>↶</button>${(S.phase === 'regular' || S.phase === 'preseason') && !(S.faMkt && !S.faMkt.closed) ? '<button class="sm dk" data-act="advMoment" title="다음 중요 순간까지" aria-label="다음 중요 순간까지">⏭</button>' : ''}<div class="dinfo"><b>${phaseLabel()}</b><span class="muted">${S.phase === 'offseason' ? '오프시즌' : (my.w + my.l + my.d === 0 ? '개막 전' : `${my.rank}위 · ${my.w}승 ${my.l}패${my.d ? ' ' + my.d + '무' : ''}`)}</span></div><button class="primary" data-act="${pr.act}" ${pr.a !== undefined ? `data-a="${pr.a}"` : ''}>${pr.label}</button></div></div></div>`;
  }

  /* ---------------- 대시보드 ---------------- */
  function nextGames(n) {
    const S = L.S, out = [];
    for (let d = S.day; d < S.schedule.length && out.length < n; d++) { const g = S.schedule[d].find(x => x[0] === U() || x[1] === U()); if (g) out.push({ day: d, home: g[0], away: g[1] }); }
    return out;
  }
  function injCard() {
    const list = L.players(U()).filter(p => L.isInj(p)).sort((a, b) => L.injLeft(a) - L.injLeft(b));
    if (!list.length) return '';
    return `<div class="card"><h2>부상자 명단 (${list.length}명)</h2><div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">부상</th><th>복귀 예정</th><th>남은 일수</th></tr></thead><tbody>${list.map(p => `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b> <span class="muted small">${pos(p)} · OVR ${L.ovr(p)}</span></td><td class="l small">${esc(p.inj.dx)}</td><td class="n">${L.injDateStr(p)}</td><td class="n">${L.injLeft(p)}일</td></tr>`).join('')}</tbody></table></div><div class="small muted">부상자는 1군에 등록할 수 없습니다. 복귀 예정일이 지나면 2군에서 대기하며, 직접 1군에 등록하세요. 초기 장기 부상자는 뉴스 기반이며(복귀 시점은 추정 포함), 시즌 중 부상은 확률로 발생합니다.</div></div>`;
  }
  function screenHome() {
    const S = L.S, st = L.standings(), my = st.find(x => x.team === U()), ng = nextGames(5);
    const rot = S.teams[U()].set.rotation, nextSp = P(rot[S.teams[U()].set.rotIdx % rot.length]);
    const live = (S.phase === 'regular' || S.phase === 'preseason');
    const rows = st.map(x => `<tr class="click ${x.team === U() ? 'me' : ''} ${x.rank === 5 ? 'cut' : ''}" data-act="team" data-a="${x.team}"><td class="l n">${x.rank}</td><td class="l">${teamTag(x.team)}</td><td class="n">${x.w}-${x.l}${x.d ? '-' + x.d : ''}</td><td class="n">${pct3(x.pct)}</td><td class="n ${x.rs - x.ra >= 0 ? 'pos' : 'neg'}">${sgn(x.rs - x.ra)}</td></tr>`).join('');
    const news = S.news.slice(0, 8).map(n => `<li><span class="d">${n.year}</span><span>${esc(n.text)}</span></li>`).join('') || '<li class="muted">아직 소식이 없습니다.</li>';
    const fam = S.faMkt && !S.faMkt.closed && S.phase === 'preseason';
    const act = fam ? `<div class="card"><h2>FA 협상 기간 · ${L.faDateStr(S.faMkt.day)}</h2><div class="small muted">시즌 개막 전에 FA 계약을 마무리해야 합니다. 개막 ${L.faDaysLeft()}일 전 — 날짜를 하루씩 진행하며 경쟁 구단의 입찰을 보고 금액을 조정하세요.</div><div class="row" style="margin-top:8px"><button class="primary" data-act="openFAMarket">FA 시장 열기</button></div></div>` : live ? `<div class="card"><h2>진행</h2><div class="row"><label class="row small" style="gap:6px">내 경기 <select id="playMode"><option value="auto" ${!ui.liveMode ? 'selected' : ''}>자동 진행</option><option value="highlight" ${ui.liveMode && ui.hl ? 'selected' : ''}>접전만 직접 지휘</option><option value="full" ${ui.liveMode && !ui.hl ? 'selected' : ''}>처음부터 직접 지휘</option></select></label><span class="sp"></span>
      <button class="primary" data-act="advMoment" title="새 소식·부상·트레이드 마감·확률 변화 같은 중요한 순간까지 자동으로 진행합니다">다음 중요 순간까지</button><button data-act="adv" data-a="1">${ui.liveMode ? '경기 시작' : '하루 진행'}</button><button data-act="advAuto" data-a="7">1주 자동</button><button data-act="advAuto" data-a="30">1개월 자동</button><button data-act="advAuto" data-a="999">시즌 끝까지</button></div>
      ${ui.lastStop ? `<div class="small" style="margin-top:8px"><b>멈춘 이유</b> · ${esc(ui.lastStop)}</div>` : ''}
      <details style="margin-top:6px"><summary class="small">멈춤 조건 설정</summary><div class="row" style="margin-top:6px;gap:8px 14px">${[['event', '새 소식'], ['injury', '내 선수 부상'], ['deadline', '트레이드 마감 5일 전'], ['odds', '가을야구 확률 구간 변화'], ['goal', '시즌 목표 달성 여부 변화'], ['month', '월초 점검']].map(([k, l]) => `<label class="row small" style="gap:4px"><input type="checkbox" data-act="stopSet" data-a="${k}" ${L.stopOpts()[k] ? 'checked' : ''}>${l}</label>`).join('')}</div></details>
      <p class="small muted" style="margin:8px 0 0">직접 지휘를 켜면 내 경기 직전에 멈춰 타석 단위로 진행합니다. 자동 진행은 설정한 라인업·로테이션·불펜대로 경기를 처리합니다.</p></div>` : '';
    const pv = ng.length && S.phase !== 'offseason' ? previewCard(ng[0]) : '';
    const nxt = ng.length ? `<div class="card"><h2>다음 경기</h2><div class="tablewrap"><table><tbody>${ng.map((g, i) => { const opp = g.home === U() ? g.away : g.home; return `<tr><td class="l">${L.dateStr(g.day)}</td><td class="l">${g.home === U() ? '홈' : '원정'} ${teamTag(opp)}${L.isRival(U(), opp) ? ` <span class="chip warn">${esc(L.rivalName(U(), opp))}</span>` : ''}</td><td class="l small muted">${park(g.home)}</td>${i === 0 ? `<td class="l small">선발 <b>${esc(nextSp.ko)}</b></td>` : '<td></td>'}</tr>`; }).join('')}</tbody></table></div></div>` : '';
    return `<div class="kpis"><div class="kpi"><div class="l">순위</div><div class="v">${S.phase === 'offseason' || my.w + my.l + my.d === 0 ? '-' : my.rank + '위'}</div></div><div class="kpi"><div class="l">성적</div><div class="v">${my.w}승 ${my.l}패</div></div><div class="kpi"><div class="l">득점 / 실점</div><div class="v">${my.rs} / ${my.ra}</div></div><div class="kpi"><div class="l">연봉(상위 40) / 상한</div><div class="v">${L.cbtPay(U())} / ${L.cbtCap().toFixed(1)}</div></div><div class="kpi"><div class="l">경기 진행</div><div class="v">${Math.min(S.day, 144)} / 144</div></div></div>
      ${screenPhaseBanner()}${act}${pv}${nxt}${injCard()}<div class="grid"><div class="card"><h2>순위</h2><div class="tablewrap"><table><tbody>${rows}</tbody></table></div></div><div class="card"><h2>구단 소식</h2><ul class="news">${news}</ul></div></div>`;
  }
  function screenPhaseBanner() {
    const S = L.S, my = L.standings().find(x => x.team === U());
    if (S.phase === 'regular_done') return `<div class="card"><h2>정규시즌 종료</h2><p style="margin:0 0 10px">${my.rank <= 5 ? `${my.rank}위로 포스트시즌에 진출했습니다.` : `${my.rank}위로 포스트시즌 진출에 실패했습니다.`}</p><button class="primary" data-act="startPost">${my.rank <= 5 ? '포스트시즌 시작' : '시즌 종료 · 오프시즌'}</button></div>`;
    if (S.phase === 'post' || S.phase === 'post_done') return screenPost();
    return '';
  }

  /* ---------------- 포스트시즌 ---------------- */
  function seriesCard(s, seeds) {
    const sd = t => { const i = seeds.indexOf(t); return i >= 0 ? `${i + 1}위` : ''; };
    const side = (t, w, win) => `<div class="side2 ${win ? 'win' : ''}"><span>${teamTag(t)} <span class="small muted">${sd(t)}</span></span><span class="sc">${w === null ? '' : w}</span></div>`;
    const w = s.wc ? { [s.hi]: s.winner ? s.w[s.hi] : 1 + (s.hiAdv ? 1 : 0), [s.lo]: s.loWins } : s.w;
    const games = s.games.map((g, i) => `<li class="small">${i + 1}. ${KO[g.away]} <b>${g.ra}</b> : <b>${g.rh}</b> ${KO[g.home]}${g.draw ? ' (무승부)' : ''}</li>`).join('');
    return `<div class="series"><div class="name"><span>${s.name}</span><span>${s.wc ? '4위 1승 어드밴티지' : s.need === 4 ? '7전 4선승' : '5전 3선승'}</span></div>${side(s.hi, w[s.hi], s.winner === s.hi)}${side(s.lo, w[s.lo], s.winner === s.lo)}${games ? `<details><summary class="small muted">경기 결과</summary><ul style="margin:6px 0 0;padding-left:18px">${games}</ul></details>` : ''}</div>`;
  }
  function screenPost() {
    const S = L.S, P2 = S.post; if (!P2) return '';
    const seeds = P2.seeds, rounds = P2.rounds.filter(Boolean);
    let head = '';
    if (P2.done) head = `<div class="champ"><div><div class="small muted">한국시리즈 우승</div><div class="t">${teamTag(P2.champion)}</div></div>${P2.champion === U() ? '<span class="chip ks">우승!</span>' : ''}</div>`;
    else if (L.userInPost()) head = `<div class="card"><h2>내 경기</h2><div class="row"><span>${esc(P2.cur.name)} · ${KO[L.postNextGame().home]} 홈구장 ${park(L.postNextGame().home)}</span><span class="sp"></span><button class="primary" data-act="postLive">직접 지휘</button><button data-act="postAuto">자동 진행</button></div></div>`;
    else head = `<div class="card row"><span>${esc(P2.cur ? P2.cur.name : '')} 진행 중${S.phase === 'post' && !P2.seeds.includes(U()) ? ' · 내 팀은 탈락/미진출' : ''}</span><span class="sp"></span><button data-act="postNext">다음 경기</button><button data-act="postAll">내 경기 전까지 진행</button></div>`;
    return `<div class="card"><h2>포스트시즌</h2>${head}<div class="bracket" style="margin-top:12px">${rounds.map(s => seriesCard(s, seeds)).join('')}</div></div>`;
  }

  /* ---------------- 로스터 ---------------- */
  function entryStrip(n1) {
    const cnt = { P: n1.filter(p => p.type === 'P').length, B: n1.filter(p => p.type === 'B').length, C: n1.filter(p => p.pos === 'C').length }, chip = (l, v, min, max) => `<span class="chip ${v < min || (max && v > max) ? 'warn' : 'in'}">${l} ${v}${min ? ` (최소 ${min})` : ''}</span>`;
    return `<div class="row" style="margin-top:8px"><b class="small">1군 엔트리 ${n1.length}/${ACTIVE_MAX}</b>${chip('투수', cnt.P, 13)}${chip('타자', cnt.B, 13)}${chip('포수', cnt.C, 2)}<span class="small muted">행 오른쪽 <b>1군/2군</b> 버튼으로 바로 이동합니다(2군 말소 후 10경기일은 재등록 불가).</span></div>`;
  }
  function screenRoster() {
    const S = L.S, t = U(), all = L.players(t), f = ui.rf.f, v = ui.rf.v || 'pos', sk = ui.rf.s;
    const potv = p => (p.peak !== undefined && p.scout ? Math.max(L.ovr(p), p.scout.ceil) : L.ovr(p));
    const hasPot = p => p.peak !== undefined && p.scout && !p.foreign;
    const flt = { all: () => true, act: p => p.active, res: p => !p.active, inj: p => L.isInj(p), exp: p => p.contract.years <= 1 && !p.foreign, frn: p => p.foreign, young: p => p.age <= 25 && hasPot(p) && 'ABC'.includes(L.potLetter(p)) };
    const key = { ovr: (a, b) => L.ovr(b) - L.ovr(a), age: (a, b) => a.age - b.age, sal: (a, b) => b.contract.salary - a.contract.salary, pot: (a, b) => potv(b) - potv(a) };
    const rank = p => (p.active ? 0 : L.isInj(p) ? 2 : 1);   // 1군 → 2군(건강) → 부상자 명단
    const cmp = (a, b) => (v === 'pos' ? rank(a) - rank(b) : 0) || key[sk](a, b) || L.ovr(b) - L.ovr(a);
    const rows = all.filter(flt[f] || flt.all).sort(cmp);
    const n1 = all.filter(p => p.active), avg = (arr, fn) => arr.length ? arr.reduce((s, p) => s + fn(p), 0) / arr.length : 0;
    const rowOf = p => { const c = p.contract, lk = hasPot(p) && p.age <= 25 ? `<span class="pot" data-l="${L.potLetter(p)}" title="잠재력 ${L.potLetter(p)} · ${L.tierLabel(potv(p))}">${L.potLetter(p)}</span>` : '<span class="muted">-</span>';
      return `<tr class="click${p.active ? '' : ' dim'}" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b> ${p.active ? '' : '<span class="chip" title="2군">2군</span>'}${p.foreign ? ` <span class="chip">${p.aq ? 'AQ' : '외'}</span>` : ''}${injChip(p)}${moodChip(p)}${myChip(p)}${L.S.captain === p.id ? ' <span class="chip in" title="주장">C</span>' : ''}${L.handLabel(p) ? ` <span class="chip hm">${L.handLabel(p)}</span>` : ''}<div class="small muted vm">${pos(p)} · ${p.age}세</div></td><td class="l hm">${pos(p)}</td><td class="n hm">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td>${lk}</td><td class="n">${salCell(p)}<div class="small muted">${c.years}년${c.end ? ' <span class="hm">(~' + c.end + ')</span>' : ''}</div></td><td class="l hm">${subHtml(p)}</td><td class="l small hm">${statLine(p)}</td><td data-stop="1">${mgBtn(p)}</td></tr>`; };
    const mgBtn = p => p.active ? `<button class="sm" data-act="toggleActive" data-a="${p.id}" title="2군으로 내림">2군</button>` : L.isInj(p) ? '<span class="muted small" title="복귀 전 등록 불가">IL</span>' : `<button class="sm primary" data-act="toggleActive" data-a="${p.id}" title="1군 등록">1군</button>`;
    const head = '<thead><tr><th class="l">선수</th><th class="l hm">포지션</th><th class="hm">나이</th><th>OVR</th><th title="스카우트 추정 성장 상한(25세 이하)">잠재</th><th>연봉·계약</th><th class="l hm">세부 능력</th><th class="l hm">올 시즌</th><th title="1군↔2군 이동">이동</th></tr></thead>';
    const groups = [['선발투수', p => p.type === 'P' && p.role === 'SP'], ['구원투수', p => p.type === 'P' && p.role !== 'SP'], ['포수', p => p.pos === 'C'], ['내야수', p => ['1B', '2B', '3B', 'SS'].includes(p.pos)], ['외야수', p => ['LF', 'CF', 'RF'].includes(p.pos)], ['지명타자', p => p.type === 'B' && p.pos === 'DH']];
    const arrow = p => { const f = formOf(p); return f ? `<span class="${f.score >= 1 ? 'pos' : f.score <= -1 ? 'neg' : 'muted'}">${f.score >= 1 ? '▲' : f.score <= -1 ? '▼' : '–'}</span> <span class="small">${f.txt}</span>` : '<span class="muted small">기록 없음</span>'; };
    const srow = p => `<tr class="click${p.active ? '' : ' dim'}" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b> ${p.active ? '' : '<span class="chip">2군</span>'}${injChip(p)}${moodChip(p)}<div class="small muted vm">${pos(p)} · ${p.age}세</div></td><td class="l hm">${pos(p)}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${statLine(p)}</td><td class="l">${arrow(p)}</td><td data-stop="1">${mgBtn(p)}</td></tr>`;
    const shead = '<thead><tr><th class="l">선수</th><th class="l hm">포지션</th><th>OVR</th><th class="l">올 시즌</th><th class="l" title="최근 경기 폼(▲호조 ▼부진)">최근 폼</th><th>이동</th></tr></thead>';
    const body = v === 'stat' ? [['타자', p => p.type === 'B'], ['투수', p => p.type === 'P']].map(([nm, g]) => { const r = rows.filter(g); if (!r.length) return ''; return `<div class="card"><div class="row"><h2 style="margin:0">${nm}</h2><span class="muted small">${r.length}명 · 올 시즌 기록과 최근 경기 폼</span></div><div class="tablewrap"><table class="rost">${shead}<tbody>${r.map(srow).join('')}</tbody></table></div></div>`; }).join('') : v === 'pos' ? groups.map(([nm, g]) => { const r = rows.filter(g); if (!r.length) return ''; const a1 = r.filter(p => p.active);
      return `<div class="card"><div class="row"><h2 style="margin:0">${nm}</h2><span class="muted small">${r.length}명 · 1군 ${a1.length} · 평균 OVR ${avg(r, p => L.ovr(p)).toFixed(1)} · 평균 ${avg(r, p => p.age).toFixed(1)}세</span></div><div class="tablewrap"><table class="rost">${head}<tbody>${r.map((p, i) => (rank(p) === 2 && (i === 0 || rank(r[i - 1]) !== 2) ? '<tr class="sub"><td colspan="9" class="small muted">부상자 명단 — 복귀(예정일) 전까지 1군에 등록할 수 없습니다</td></tr>' : '') + rowOf(p)).join('')}</tbody></table></div></div>`; }).join('')
      : `<div class="card"><div class="tablewrap"><table class="rost">${head}<tbody>${rows.map(rowOf).join('')}</tbody></table></div></div>`;
    const flab = [['all', '전체'], ['act', '1군'], ['res', '2군'], ['inj', '부상'], ['exp', '계약 1년 이하'], ['frn', '외국인'], ['young', '유망주(25세↓ 잠재 C+)']];
    const sortName = { ovr: '능력치(OVR) 높은 순', age: '나이 어린 순', sal: '연봉 높은 순', pot: '잠재력 높은 순' }[sk];
    return `${clubCard()}<div class="card"><div class="row"><h2 style="margin:0">로스터</h2><span class="muted small">${all.length}명 · 1군 ${n1.length}/${ACTIVE_MAX}</span><span class="sp"></span><select data-sel="rsort" aria-label="정렬 기준"><option value="ovr" ${sk === 'ovr' ? 'selected' : ''}>능력치순</option><option value="pot" ${sk === 'pot' ? 'selected' : ''}>잠재력순</option><option value="age" ${sk === 'age' ? 'selected' : ''}>나이순</option><option value="sal" ${sk === 'sal' ? 'selected' : ''}>연봉순</option></select></div>
      <div class="kpis" style="margin-top:10px"><div class="kpi"><div class="l">1군 평균 OVR</div><div class="v">${avg(n1, p => L.ovr(p)).toFixed(1)}</div><div class="small muted">1군 평균 ${avg(n1, p => p.age).toFixed(1)}세</div></div><div class="kpi"><div class="l">구성</div><div class="v">투수 ${all.filter(p => p.type === 'P').length} · 타자 ${all.filter(p => p.type === 'B').length}</div><div class="small muted">부상 ${all.filter(p => L.isInj(p)).length} · 외국인 ${all.filter(p => p.foreign).length}</div></div><div class="kpi"><div class="l">연봉(상위 40)</div><div class="v">${L.cbtPay(t)}</div><div class="small muted">상한 ${L.cbtCap().toFixed(1)}억 · 계약 1년 이하 ${all.filter(flt.exp).length}명</div></div></div></div>
      ${entryStrip(n1)}
      <div class="tabs" role="tablist"><button role="tab" aria-selected="${v === 'pos'}" data-act="rview" data-a="pos">포지션별</button><button role="tab" aria-selected="${v === 'stat'}" data-act="rview" data-a="stat">성적·폼</button><button role="tab" aria-selected="${v === 'list'}" data-act="rview" data-a="list">전체 목록</button></div>
      <div class="chips">${flab.map(x => `<button class="sm" aria-pressed="${f === x[0]}" data-act="rfilter" data-a="${x[0]}">${x[1]}</button>`).join('')}</div>
      <div class="small muted">정렬: ${v === 'pos' ? '포지션 그룹 안에서 <b>1군 → 2군 → 부상자 명단</b>, 각각 ' : ''}<b>${sortName}</b> · 행을 누르면 상세(능력·잠재력·계약·성장 경로)가 열립니다. 2군은 흐리게 표시됩니다.</div>${body || '<div class="card muted">조건에 맞는 선수가 없습니다.</div>'}`;
  }
  function modalPlayer(id) {
    const p0 = P(id); if (L.hiddenForeign(p0)) { const e = L.fEst(p0); return `<div class="modal-bg" data-act="closeModal"><div class="modal" data-stop="1" role="dialog" aria-label="선수 상세"><div class="mhead"><div class="row" style="flex-wrap:nowrap"><h2 style="flex:1;margin:0">${esc(p0.ko)}</h2><button class="sm primary" data-act="closeModal" aria-label="닫기">✕</button></div></div><div class="mbody"><div class="small">${pos(p0)} · ${p0.age}세 · ${foreignOvr(p0)} <span class="muted">(추정, 조사 ${e.n}회)</span></div><div class="small muted">KBO 기록이 없는 외국인이라 능력은 스카우트 조사로만 정확해집니다. 영입하면 진짜 능력을 알 수 있습니다.</div></div></div></div>`; }
    const p = p0, mine = p.team === U(), s = L.sub(p);
    const bars = Object.entries(s).map(([k, v]) => `<span>${k}</span><div class="bar"><i style="width:${(v - 20) / 60 * 100}%"></i></div><b class="num">${v}</b>`).join('');
    const gsl = p.type === 'B' ? Object.entries(p.gs).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${posName[k]} ${v}경기`).join(' · ') : '';
    const fits = p.type === 'B' ? `<div class="small">수비 숙련: ${['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].map(ps => { const l = L.fitLevel(p, ps); return `<span class="chip ${l === 2 ? 'ks' : l === 1 ? 'in' : ''}">${posName[ps]}${l === 2 ? ' ●' : l === 1 ? ' ○' : ''}</span>`; }).join(' ')}</div><div class="small muted">● 주포지션 ○ 소화 가능(선발 15경기 이상). 선발로 나서면 경기 수가 쌓여 새 포지션에 적응합니다.${gsl ? ' 선발 기록: ' + gsl : ''}</div>` : '';
    const pot = p.peak !== undefined && p.scout ? `<span class="chip" title="스카우트 추정 성장 상한입니다. 실제 정점은 달라질 수 있고, 시즌을 거치며 평가가 정확해집니다.">잠재력 ${L.potLetter(p)} · ${L.tierLabel(Math.max(L.ovr(p), p.scout.ceil))}</span>` : (p.age <= 25 ? `<span class="chip" title="예상 정점 기준: A 슈퍼스타급(68+) · B 확실한 주전급(57+) · C 준주전급(48+) · D 후보급(38+) · E 육성급. 스카우트 추정이며 시즌을 거치며 정확해집니다.">잠재력 ${L.potLetter(p)}</span>` : '');
    const dhChip = p.dh ? `<span class="chip" title="${esc(p.dh.school)} · ${p.dh.kind}${p.dh.pick ? ' ' + p.dh.pick + '순위' : ''}${p.dh.deb ? ' · 1군 데뷔 ' + p.dh.deb + ' · KBO ' + p.dh.ss + '시즌 출전' : ' · 1군 미데뷔'}">${p.dh.y}년 입단 · ${p.dh.univ ? '대졸' : '고졸'}${p.dh.round ? ' ' + p.dh.round + 'R' : p.dh.kind === '1차' ? ' 1차' : ''}</span>` : '';
    const draftChip = p.draft ? `<span class="chip" title="2027 신인 드래프트 ${p.draft.round}라운드 · ${esc(p.draft.school)}">드래프트 ${p.draft.round}R${p.bonus ? ' · 계약금 ' + p.bonus + '억' : ''}${p.twoWay ? ' · 투타겸업' : ''}</span>` : '';
    const lo = L.loyalty(p), ld = lo ? L.loyDiscount(p, lo.team) : 0, loyChip = lo ? `<span class="chip ${lo.v >= 70 ? 'in' : ''}" title="${esc(lo.items.map(x => x[0] + ' +' + x[1]).join(' · ') || '근속·연고 정보 없음')} · 기본 40${ld > 0 ? ' · 원소속 계약 시 요구액 −' + Math.round(ld * 1000) / 10 + '%' : ''}">${KO[lo.team] || ''} 충성도 ${lo.v}${ld > 0 ? ' · 할인 −' + Math.round(ld * 1000) / 10 + '%' : ''}</span>` : '';
    const holdChip = p.hold ? `<span class="chip in" title="KBO 2027 FA 자격 유보선수(비FA 다년계약·옵션 등으로 자격은 충족했으나 계약 기간이 남아 FA 신청 불가, 계약 만료 시점까지 자격 유지)">FA 자격 유보</span>` : '';
    const birthChip = p.birth ? `<span class="chip" title="생년월일 ${p.birth}">${p.birth.slice(0, 4)}년생</span>` : '';
    const fChip = (p.virtual ? '<span class="chip" title="실제 자료가 없는 선수라 능력치는 2026 외국인 분포에서 뽑은 가상 값입니다.">가상 능력치</span>' : '') + (p.assumed ? '<span class="chip" title="2027 계약이 뉴스로 확정되지 않아 가정한 외국인입니다.">2027 계약 미확정(가정)</span>' : '') + (p.f27 && p.f27.total ? `<span class="chip in" title="${p.f27.date} 확정 · ${p.f27.status}">2027 계약 확정 ${(p.f27.total / 10000).toFixed(1)}만$</span>` : (p.f27 ? '<span class="chip in">2027 재계약 확정</span>' : ''));
    const milChip = p.team === 'MIL' ? `<span class="chip" title="상무 야구단 복무 중이라 전역 전에는 뛸 수 없습니다.">상무 복무 · ${milText(p)} 전역 예정</span>` : '';
    const src = p.src === 'F' ? `<span class="chip" title="2026 퓨처스 기록을 1군 능력치로 환산한 값입니다. 기록이 적을수록 평균에 가깝게 보정됩니다.">퓨처스 환산</span>${p.posEst ? '<span class="chip" title="세부 포지션(1B/2B/3B/SS, LF/CF/RF)과 수비 능력은 데이터가 없어 추정한 값입니다.">포지션 추정</span>' : ''}${p.roleEst ? '<span class="chip" title="선발 기록(GS)이 없어 경기당 이닝으로 선발/구원과 체력을 추정했습니다.">보직 추정</span>' : ''}${p.ageEst ? '<span class="chip" title="명단에 생년월일이 없어 나이를 추정했습니다.">나이 추정</span>' : ''}` : '';
    const favBtn = `<button class="sm" data-act="fav" data-a="${p.id}" aria-label="관심 선수">${favs().includes(p.id) ? '★ 관심' : '☆ 관심'}</button>`;
    const acts = mine ? `<div class="row">${favBtn}<button data-act="toggleActive" data-a="${p.id}" ${L.isInj(p) ? 'disabled title="부상자 명단"' : ''}>${p.active ? '2군으로 내림' : L.isInj(p) ? '부상자 명단' : '1군 등록'}</button>${p.foreign ? '' : `<button data-act="captain" data-a="${p.id}">${L.S.captain === p.id ? '주장 해임' : '주장 임명'}</button>`}<button class="warn" data-act="releaseAsk" data-a="${p.id}">${ui.confirm === p.id ? '정말 방출(되돌릴 수 없음)' : '방출'}</button></div>${ui.confirm === p.id ? relCost(p) : ''}` : `<div class="row">${favBtn}</div>`;
    const exBlock = mine && !p.foreign ? L.negBlock(p.id, 'extend') : '비FA 다년계약은 우리 팀 국내 선수만 대상입니다.', mtBlock = mine ? L.meetBlock(p.id) : '우리 팀 선수만 면담할 수 있습니다.';
    const negEntry = mine ? `<div class="card" style="margin:8px 0"><b>협상·면담</b><div class="row" style="gap:6px;margin-top:6px"><button class="sm primary" data-act="negOpen" data-a="${p.id}|extend" ${exBlock ? 'disabled' : ''}>비FA 다년계약 협상</button><button class="sm" data-act="negOpen" data-a="${p.id}|meeting|checkin" ${mtBlock ? 'disabled' : ''}>면담</button></div>${exBlock || mtBlock ? `<div class="small muted" style="margin-top:4px">${[exBlock, mtBlock].filter(Boolean).map(esc).join('<br>')}</div>` : ''}</div>` : '';
    const tab = ui.mtab || 'sum', chips = `${pot}${dhChip}${draftChip}${birthChip}${holdChip} ${loyChip}${moodChip(p)}${myChip(p)}${traitChip(p)}${fChip}${faStatus(p)}${src}${milChip}`;
    const contract = `<div class="small muted">${teamTag(p.team in KO ? p.team : U())} · 연봉 ${money(p.contract.salary)}${p.contract.amort ? ' + 계약금 상각 ' + p.contract.amort + '억/년' : ''} · 계약 ${p.contract.years}년 남음${p.contract.total ? ` · FA 계약 총 ${p.contract.total}억${p.contract.bonus ? '(계약금 ' + p.contract.bonus + '억)' : ''}${p.contract.end ? ' ~' + p.contract.end : ''}${p.contract.opt ? ' · 옵션 ' + esc(p.contract.opt) : ''}${p.contract.est ? ' · 기간 추정' : ''}` : ''} · 시장 가치 ${money(L.marketValue(p))}</div>`;
    const evalHtml = p.eval ? `<div class="card" style="margin:8px 0"><b>평가(사용자 제공)</b><div class="small">${esc(p.eval.text)}</div><div class="small muted">${esc(p.eval.src)} — 잠재력 하한 ${esc(p.eval.floor)}등급 이상으로 반영${p.eval.role === 'SP' ? ', 선발 후보 보직' : ''}</div></div>` : '';
    const dev = devBlock(p) || (mine ? `<div class="card" style="margin:8px 0"><b>육성 방향</b><div class="small muted">${!L.S.coach ? '코치진 정보가 없어 육성 방향을 정할 수 없습니다.' : '30세 이상 선수는 육성 방향을 정하지 않습니다(성장보다 유지 단계). 대신 팀 훈련 방침이 적용됩니다.'}</div></div>` : '<div class="small muted">우리 팀 선수만 육성·훈련을 정할 수 있습니다.</div>');
    const slotNow = mine ? L.trainSlots().find(x => x.id === p.id) : null, trainInfo = mine ? `<div class="card" style="margin:8px 0"><b>훈련</b><div class="small muted">팀 훈련(타자/투수 집중 분야·강도)은 훈련 센터에서, 선수별 육성 방향은 위에서 정합니다. 이 선수만 따로 훈련시키려면 개별 훈련에 추가하세요.</div>${slotNow ? `<div class="small" style="margin-top:4px">개별 훈련 중: <b>${esc(L.trainFocusInfo(p.type === 'P' ? 'P' : 'B')[slotNow.focus].n)}</b> (${L.trainIntenName(slotNow.inten)}) ${riskChip(L.trainRisk(p))}</div>` : `<div class="small muted" style="margin-top:4px">${riskChip(L.trainRisk(p))}</div>`}<div class="row" style="gap:6px;margin-top:6px"><button class="sm primary" data-act="goTrain">훈련 센터 열기</button>${slotNow ? `<button class="sm" data-act="slotRemoveA" data-a="${p.id}">개별 훈련 종료</button>` : `<button class="sm" data-act="slotAddDo" data-a="${p.id}">개별 훈련에 추가</button>`}</div></div>` : '';
    const body = tab === 'sum' ? `${injBlock(p)}${ovrTrend(p)}${prospectBlockFor(p)}<div class="pbars">${bars}</div>${fits}<div class="small">올 시즌 1군 기록: ${statLine(p)}</div>${(L.S.stats2.bat[p.id] || L.S.stats2.pit[p.id]) ? `<div class="small">올 시즌 2군 기록: ${p.type === 'B' ? batLine(p.id, true) : pitLine(p.id, true)}</div>` : ''}${p.lockUntil > L.S.day && p.team === U() && !p.active ? `<div class="small muted">1군 재등록 잠금: ${L.lockLeft(p)}경기일 남음</div>` : ''}`
      : tab === 'car' ? careerPanel(p) : tab === 'grow' ? `${dev}${trainInfo}` : `${contract}${negEntry}<div class="row" style="gap:6px">${chips}</div>${evalHtml}`;
    const tabs = [['sum', '능력·기록'], ['grow', '육성·훈련'], ['info', '계약·정보'], ['car', '커리어']].map(([k, t]) => `<button role="tab" aria-selected="${tab === k}" data-act="mtab2" data-a="${k}">${t}</button>`).join('');
    return `<div class="modal-bg" data-act="closeModal"><div class="modal" data-stop="1" role="dialog" aria-label="선수 상세"><div class="mhead"><div class="row" style="flex-wrap:nowrap"><button class="sm" data-act="mnav" data-a="-1" aria-label="이전 선수">◀</button><h2 style="flex:1;min-width:0;text-align:center;margin:0">${esc(p.name === p.ko ? p.ko : p.name)}</h2><button class="sm" data-act="mnav" data-a="1" aria-label="다음 선수">▶</button><button class="sm primary" data-act="closeModal" aria-label="닫기">✕</button></div>
      <div class="row" style="justify-content:center"><span class="chip">${pos(p)}</span><span class="chip">${p.age}세</span>${ovrChip(L.ovr(p))}<button class="sm" data-act="cmpAdd" data-a="${p.id}" aria-label="비교에 추가">⚖ 비교</button>${p.active ? '<span class="chip in">1군</span>' : p.team === U() ? '<span class="chip">2군</span>' : ''}${favs().includes(p.id) ? '<span class="chip in">★</span>' : ''}</div>
      <div class="tabs" role="tablist" style="margin:6px 0 0">${tabs}</div></div>
      <div class="mbody">${body}${acts}</div></div></div>`;
  }

  /* ---------------- 라인업 ---------------- */
  const lineupP = i => { const set = L.team(U()).set; return set.lineup[i]; };
  /* 팀 운영 방침: 시뮬레이션 입력(이닝·주루)과 부상 위험에 실제로 반영된다 */
  function policyCard(kind) {
    const pol = L.policy(), opt = {
      pitch: { title: '투수 운용 방침', cur: pol.pitch, items: [['save', '아끼기', '선발 이닝 −10% · 투수 부상 위험 −20% (불펜 부담↑)'], ['normal', '보통', '기본'], ['push', '밀어붙이기', '선발 이닝 +10% · 투수 부상 위험 +30%']] },
      run: { title: '주루 방침', cur: pol.run, items: [['low', '소극적', '도루 시도 −40% · 부상 위험 −5%'], ['normal', '보통', '기본'], ['high', '적극적', '도루 시도 +50% · 타자 부상 위험 +10%']] }
    }[kind], sel = opt.items.find(x => x[0] === opt.cur);
    const PL = L.plan(), pbtn = (k, items) => items.map(([v, lab, tip]) => `<button class="sm ${PL[k] === v ? 'primary' : ''}" data-act="plan" data-a="${k}:${v}" title="${esc(tip || '')}">${lab}</button>`).join(''), onoff = (k, lab, tip) => `<div class="row small" style="gap:6px;margin-top:6px"><span style="min-width:112px">${lab}</span>${pbtn(k, [[true, '켬', tip], [false, '끔', '']])}</div>`;
    const planHtml = kind === 'pitch' ? `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:6px"><b class="small">경기 계획 (자동 진행에 적용)</b>
      <div class="row small" style="gap:6px;margin-top:6px"><span style="min-width:112px">선발 교체 시점</span>${pbtn('starter', [['quick', '빠르게', '4실점·피로 2 또는 예정 이닝 −1이닝'], ['normal', '기본', '6실점·피로 3'], ['long', '오래', '8실점·피로 4 또는 예정 +1이닝']])}</div>
      <div class="row small" style="gap:6px;margin-top:6px"><span style="min-width:112px">마무리 투입</span>${pbtn('closer', [['ninth', '9회 세이브만', '9회 1~3점 차'], ['flex', '8회 위기부터', '8회 1~2점 차 리드에서도 마무리 투입']])}</div>
      ${onoff('infIn', '전진 수비', '7회 이후 0~2점 차, 3루 주자·2사 미만이면 전진 수비')}${onoff('hold', '주자 견제', '1루에 발 빠른 주자(주력 58+)가 있으면 견제')}${onoff('careful', '접전 신중한 승부', '8회 이후 1~2점 차 리드·주자 있을 때 신중한 승부')}</div>` : `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:6px"><b class="small">경기 계획 (자동 진행에 적용)</b>${onoff('contact', '득점권 컨택 접근', '3루 주자·2사 미만·2점 차 이내: 삼진을 줄이고 땅볼·플라이로도 득점')}
      <div class="row small" style="gap:6px;margin-top:6px"><span style="min-width:112px">접전 직접 지휘</span>${pbtn('hlFrom', [[6, '6회~', ''], [7, '7회~', ''], [8, '8회~', '']])}<span class="muted">'접전만 직접 지휘' 모드에서 2점 차 이내가 되면 직접 지휘로 전환</span></div></div>`;
    return `<div class="card"><div class="row"><h2 style="margin:0">${opt.title}</h2><span class="sp"></span>${opt.items.map(x => `<button class="sm ${x[0] === opt.cur ? 'primary' : ''}" data-act="policy" data-a="${kind}:${x[0]}" title="${esc(x[2])}">${x[1]}</button>`).join('')}</div><div class="small muted" style="margin-top:4px">현재: <b>${sel[1]}</b> — ${sel[2]}. 내 팀 경기 시뮬레이션에 바로 반영됩니다.</div>${planHtml}</div>`;
  }
  function screenLineup() { return policyCard('run') + presetCard() + screenLineup0(); }
  function screenLineup0() {
    const set = L.team(U()).set, H = L.hitters(U(), true), inL = new Set(set.lineup.map(x => x.id)), bench = H.filter(h => !inL.has(h.id)), sel = ui.sel && ui.sel.kind === 'lu' ? ui.sel : null;
    const rows = set.lineup.map((x, i) => { const p = P(x.id), isSel = sel && sel.i === i; return `<tr class="click lrow ${isSel ? 'sel' : ''}" data-act="lTap" data-a="${i}" data-lu="${i}"><td class="n"><span class="dgrip" data-drag="${i}" title="끌어서 타순 변경">⠿</span> ${i + 1}</td><td class="l"><b>${esc(p.ko)}</b>${L.handLabel(p) ? ` <span class="chip">${L.handLabel(p)}</span>` : ''}${injChip(p)}${moodChip(p)}<div class="small muted">${batLine(p.id)}</div></td><td data-stop="1"><button class="sm" data-act="lposPick" data-a="${i}">${posName[x.pos]} ▾</button> ${fitBadge(p, x.pos)}</td><td>${ovrChip(L.ovr(p))}</td><td data-stop="1"><button class="sm" data-act="lmove" data-a="${i}" data-b="-1">▲</button><button class="sm" data-act="lmove" data-a="${i}" data-b="1">▼</button></td></tr>`; }).join('');
    const nBad = set.lineup.filter(x => L.fitLevel(P(x.id), x.pos) === 0).length;
    const fixes = set.lineup.map((x, i) => ({ x, i, cur: P(x.id) })).filter(o => L.fitLevel(o.cur, o.x.pos) === 0).map(o => { let best = null, bd = 0; for (const c of bench) { const d = L.posScore(c, o.x.pos) - L.posScore(o.cur, o.x.pos); if (d > bd) { bd = d; best = c; } } return best ? { i: o.i, cur: o.cur, pos: o.x.pos, c: best, d: bd } : null; }).filter(Boolean);
    const fixHtml = fixes.length ? `<div class="advice" style="margin-bottom:8px">${fixes.map(f => `<div class="adv"><span>${posName[f.pos]}: <b>${esc(f.cur.ko)}</b>은 이 포지션이 부적합합니다. 후보 <b>${esc(f.c.ko)}</b>(${f.c.pos === f.pos ? '주포지션' : (f.c.gs[f.pos] ? posName[f.pos] + ' ' + f.c.gs[f.pos] + '경기' : '경험 없음')}, 종합 ${L.ovr(f.c)})로 바꾸면 나아집니다.</span><button class="sm" data-act="lfix" data-a="${f.i}" data-b="${f.c.id}">교체 적용</button></div>`).join('')}</div>` : '';
    const spos = sel ? set.lineup[sel.i].pos : null, ordered = bench.slice().sort((p, q) => spos ? L.posScore(q, spos) - L.posScore(p, spos) : L.ovr(q) - L.ovr(p));
    const br = ordered.map(p => { const fm = formOf(p); return `<tr class="click" data-act="${sel ? 'lBench' : 'player'}" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b>${L.handLabel(p) ? ` <span class="chip">${L.handLabel(p)}</span>` : ''}${injChip(p)}<div class="small muted">${posName[p.pos]}${spos ? ' · ' + fitBadge(p, spos).replace(/<[^>]+>/g, '') : ''}${fm ? ' · 최근 ' + esc(fm.txt) : ''}</div></td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${batLine(p.id)}</td></tr>`; }).join('');
    return `<div class="card"><div class="row"><h2>선발 라인업</h2><span class="sp"></span><button data-act="autoLineup">자동 설정</button></div>
      ${fixHtml}${nBad ? `<p class="chip bad" style="display:block;padding:6px 10px;margin:0 0 8px">익숙하지 않은 포지션에 선 선수가 ${nBad}명 있습니다. 해당 포지션의 수비 범위가 크게 줄고 실책이 늘어 안타를 더 맞습니다. [자동 설정]으로 최적 배치를 받을 수 있습니다.</p>` : ''}
      <p class="small muted" style="margin:0 0 8px">타순을 누르면 선택되고, <b>다른 타순을 누르면 타순이 서로 바뀌고</b> <b>아래 후보를 누르면 그 자리의 선수가 교체</b>됩니다. 수비 위치는 위치 버튼으로, 순서는 ⠿를 끌어서 바꿀 수 있습니다. 익숙하지 않은 포지션에 서면 수비가 크게 나빠집니다.</p>
      <div class="tablewrap"><table><thead><tr><th>타순</th><th class="l">선수</th><th class="l">수비</th><th>OVR</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card ${sel ? 'selcard' : ''}"><div class="row"><h2 style="margin:0">${sel ? `${sel.i + 1}번 ${esc(P(set.lineup[sel.i].id).ko)}(${posName[spos]})와 바꿀 후보` : '후보 (1군 야수)'}</h2><span class="sp"></span>${sel ? '<button class="sm" data-act="selClear">선택 취소</button>' : ''}</div>${sel ? `<div class="small muted">${posName[spos]} 수비에 맞는 선수부터 보여줍니다.</div>` : ''}${br ? `<div class="tablewrap"><table><tbody>${br}</tbody></table></div>` : '<p class="muted">후보 야수가 없습니다. 로스터에서 1군에 등록하세요.</p>'}</div>`;
  }
  function posPickSheet() {
    const i = ui.posPick; if (i === null || i === undefined || !L) return ''; const set = L.team(U()).set, x = set.lineup[i]; if (!x) return ''; const p = P(x.id);
    return `<div class="sheet-bg" data-act="lposClose"><div class="sheet" data-stop="1" role="dialog" aria-label="수비 위치"><div class="grabber"></div><h2>${esc(p.ko)} 수비 위치 <span class="muted small">현재 ${posName[x.pos]}</span></h2><div class="small muted">다른 선수가 서 있는 위치를 고르면 서로 위치가 바뀝니다.</div>
      ${POSS.map(q => { const holder = set.lineup.find(y => y.pos === q && y !== x), fb = fitBadge(p, q); return `<button data-act="lposSet" data-a="${i}:${q}" style="width:100%;display:flex;gap:8px;align-items:center;min-height:48px;margin-top:6px;text-align:left" ${q === x.pos ? 'class="primary"' : ''}><b style="min-width:44px">${posName[q]}</b><span style="flex:1">${fb || (q === 'DH' ? '<span class="chip">지명타자</span>' : '')}</span><span class="muted small">${holder ? esc(P(holder.id).ko) + ' 교대' : ''}</span></button>`; }).join('')}
      <button style="width:100%;min-height:44px;margin-top:8px" data-act="lposClose">닫기</button></div></div>`;
  }

  /* ---------------- 투수진 ---------------- */
  function pitchSlots() {
    const set = L.team(U()).set, b = set.bullpen, out = [];
    set.rotation.forEach((id, i) => out.push({ g: '선발 로테이션', l: `${i + 1}선발`, k: 'rot', i, id }));
    out.push({ g: '불펜', l: '마무리', k: 'close', i: 0, id: b.closer });
    b.setup.forEach((id, i) => out.push({ g: '불펜', l: `셋업 ${i + 1}`, k: 'setup', i, id }));
    b.middle.forEach((id, i) => out.push({ g: '불펜', l: `중간 ${i + 1}`, k: 'mid', i, id }));
    b.long.forEach((id, i) => out.push({ g: '불펜', l: `롱릴리프 ${i + 1}`, k: 'long', i, id }));
    return out;
  }
  function screenPitching() { return policyCard('pitch') + screenPitching0(); }
  function screenPitching0() {
    const set = L.team(U()).set, A = L.pitchers(U(), true), slots = pitchSlots(), S = L.S, nextI = set.rotIdx % set.rotation.length, sel = ui.sel && ui.sel.kind === 'p' ? ui.sel : null;
    const label = {}; slots.forEach(s => { label[s.id] = s.l; });
    const rows = slots.map(s => { const p = P(s.id); if (!p) return ''; const isSel = sel && sel.k === s.k && sel.i === s.i;
      return `<tr class="click pslot ${isSel ? 'sel' : ''}" data-act="pTap" data-a="${s.k}:${s.i}"><td class="l small muted">${s.l}</td><td class="l"><b>${esc(p.ko)}</b>${s.k === 'rot' && s.i === nextI ? ' <span class="chip in">다음 선발</span>' : ''}${injChip(p)}${moodChip(p)}<div class="small muted">${pitLine(p.id)}</div></td><td>${ovrChip(L.ovr(p))}</td><td class="l">${gauge(p)}</td></tr>`; }).join('');
    const cur = sel ? slots.find(s => s.k === sel.k && s.i === sel.i) : null;
    const cands = A.slice().sort((x, y) => L.restInfo(y).left - L.restInfo(x).left || L.ovr(y) - L.ovr(x));
    const candRows = cands.map(q => `<tr class="click" data-act="pAssign" data-a="${q.id}"><td class="l"><b>${esc(q.ko)}</b> <span class="muted small">${q.role === 'SP' ? '선발' : '구원'}${label[q.id] ? ' · 현재 ' + label[q.id] : ''}</span><div>${gauge(q)}</div></td><td>${ovrChip(L.ovr(q))}</td><td class="l small">${pitLine(q.id)}</td></tr>`).join('');
    return `<div class="card"><div class="row"><h2>투수진 운용</h2><span class="sp"></span><button data-act="autoPitch">자동 설정</button></div>
      <p class="small muted" style="margin:0 0 8px">자리를 누른 뒤 후보를 누르면 바뀝니다(다른 자리의 투수를 고르면 서로 맞바꿈). 선발은 로테이션 순서대로 등판하고 4일 이상 쉬어야 합니다. 불펜은 마무리(세이브 상황)·셋업(7~8회 박빙)·롱릴리프(큰 점수 차)·중간 순으로 투입되며, 체력이 낮은 투수는 쉬어야 합니다. 경기 중에는 직접 교체할 수 있습니다.</p>
      <div class="tablewrap"><table><thead><tr><th class="l">역할</th><th class="l">선수</th><th>OVR</th><th class="l">체력 · 등판 가능</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      ${sel ? `<div class="card selcard"><div class="row"><h2 style="margin:0">${cur ? cur.l : ''} 후보</h2><span class="sp"></span><button class="sm" data-act="selClear">선택 취소</button></div><div class="small muted">체력이 많은 투수부터 보여줍니다. 누르면 ${cur ? esc(P(cur.id).ko) : ''}와 바뀝니다.</div><div class="tablewrap"><table><tbody>${candRows}</tbody></table></div></div>` : '<div class="small muted">자리를 눌러 선수를 바꾸세요.</div>'}`;
  }

  function screenSchedule() {
    const S = L.S, mine = S.results.filter(r => r.home === U() || r.away === U()).slice().reverse();
    const rows = mine.slice(0, 40).map(r => { const home = r.home === U(), opp = home ? r.away : r.home, my = home ? r.rh : r.ra, th = home ? r.ra : r.rh, w = my > th, t = my === th;
      return `<tr><td class="l">${L.dateStr(r.day)}</td><td class="l">${home ? '홈' : '원정'} ${teamTag(opp)}</td><td class="n"><b class="${t ? '' : w ? 'pos' : 'neg'}">${t ? '무' : w ? '승' : '패'}</b> ${my}:${th}</td><td class="l small muted">${r.user ? '직접 지휘/설정 반영' : ''}</td></tr>`; }).join('');
    const up = nextGames(10).map(g => `<tr><td class="l">${L.dateStr(g.day)}</td><td class="l">${g.home === U() ? '홈' : '원정'} ${teamTag(g.home === U() ? g.away : g.home)}</td><td class="l small muted">${park(g.home)}</td></tr>`).join('');
    return `<div class="grid"><div class="card"><h2>최근 결과</h2>${rows ? `<div class="tablewrap"><table><tbody>${rows}</tbody></table></div>` : '<p class="muted">아직 치른 경기가 없습니다.</p>'}</div><div class="card"><h2>예정 경기</h2>${up ? `<div class="tablewrap"><table><tbody>${up}</tbody></table></div>` : '<p class="muted">남은 정규시즌 경기가 없습니다.</p>'}</div></div>`;
  }

  /* ---------------- 순위·기록 ---------------- */
  /* ---------------- 2군 ---------------- */
  const formOf = p => {
    const r = (L.S.recent[p.id] || []); if (!r.length) return null;
    if (p.type === 'B') { let ab = 0, h = 0, tb = 0, bb = 0; for (const e of r) { ab += e[1]; h += e[2]; tb += e[3]; bb += e[4]; } const ops = ab + bb ? (h + bb) / (ab + bb) + (ab ? tb / ab : 0) : 0; return { n: r.length, txt: `${pct3(ab ? h / ab : 0)} (${ab}타수 ${h}안타)`, score: ab >= 15 ? clamp((ops - 0.72) * 12, -3, 3) : 0 }; }
    let o = 0, R = 0, K = 0; for (const e of r) { o += e[1]; R += e[2]; K += e[3]; } const ra9 = o ? R * 27 / o : 0; return { n: r.length, txt: `RA9 ${ra9.toFixed(2)} (${Math.floor(o / 3)}${o % 3 ? '.' + (o % 3) : ''}이닝 ${K}K)`, score: o >= 9 ? clamp((4.8 - ra9) * 0.8, -3, 3) : 0 };
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function farmRecs() {
    const S = L.S, set = S.teams[U()].set, out = [];
    for (const type of ['B', 'P']) {
      const act = L.players(U()).filter(p => p.active && p.type === type), keep = new Set(type === 'B' ? set.lineup.map(x => x.id) : set.rotation.concat([set.bullpen.closer]));
      const weak = act.filter(p => !keep.has(p.id)).sort((a, b) => L.ovr(a) - L.ovr(b))[0];
      const cands = L.players(U()).filter(p => !p.active && p.type === type && !L.isInj(p) && L.lockLeft(p) === 0).map(p => { const f = formOf(p); return { p, f, sc: L.ovr(p) + (f ? f.score : 0) }; }).sort((a, b) => b.sc - a.sc);
      if (weak && cands[0] && cands[0].sc > L.ovr(weak) + 1) out.push({ up: cands[0], down: weak });
    }
    return out;
  }
  /* FA 표시: 등급·보상 안내 */
  const gradeTip = { A: '보호선수 20명 외 1명 + 전년 연봉 200%, 또는 300%', B: '보호선수 25명 외 1명 + 전년 연봉 100%, 또는 200%', C: '보상선수 없이 전년 연봉 150%' };
  const faChip = p => { if (p.foreign) return `<span class="chip" title="외국인은 FA 제도 대상이 아닙니다(일반 3명 + 아시아쿼터 1명, 신규 상한 ${p.aq ? '2.8억' : '14억'})">${p.aq ? '아시아쿼터' : '외국인'}</span>`; const g = p.faInfo && p.faInfo.grade; return g ? `<span class="chip ${g === 'C' ? '' : 'in'}" title="${gradeTip[g]}">${g}등급 FA</span>` : '<span class="muted small">자유계약</span>'; };
  const faStatus = p => { if (p.foreign || !p.fa) return ''; if (L.faEligible(p)) return `<span class="chip in" title="FA 자격 취득(${p.fa.used ? '재취득' : p.fa.univ ? '대졸 7시즌' : '고졸 8시즌'})">FA 자격 · 예상 ${L.faGrade(p)}등급</span>`; return `<span class="chip" title="1군 등록 145일을 1시즌으로 계산합니다">FA 자격까지 약 ${L.faSeasonsLeft(p)}시즌</span>`; };
  const milText = p => `${Math.floor(p.milReturn / 12)}.${String(p.milReturn % 12 + 1).padStart(2, '0')}`;
  function milCard() {
    const S = L.S, mine = (S.mil || []).map(id => P(id)).filter(p => p && p.milTeam === U()).sort((a, b) => a.milReturn - b.milReturn), all = (S.mil || []).length;
    return `<div class="card"><h2>군 복무 (상무)</h2><div class="small muted">상무에서 뛰는 선수는 전역 월이 되면 원소속 구단 2군으로 돌아옵니다(복무 18개월). 복무 중에는 로스터에서 빠지고 연봉 상한 산정에서도 제외됩니다. 리그 전체 ${all}명.</div>${mine.length ? `<div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th>입대</th><th>전역 예정</th></tr></thead><tbody>${mine.map(p => `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="n">${p.milFrom || '-'}</td><td class="n">${milText(p)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="small muted" style="margin-top:8px">우리 팀에서 상무에 가 있는 선수가 없습니다.</div>'}</div>`;
  }
  function farmList(farm, full) {
    const f = ui.farmF || 'all', sk = ui.farmS || 'ovr', fl = { all: () => true, B: p => p.type === 'B', SP: p => p.type === 'P' && p.role === 'SP', RP: p => p.type === 'P' && p.role !== 'SP', young: p => p.age <= 25 };
    const rows = farm.filter(fl[f] || fl.all).sort((x, y) => sk === 'form' ? ((formOf(y) ? formOf(y).score : -9) - (formOf(x) ? formOf(x).score : -9)) : sk === 'age' ? x.age - y.age : L.ovr(y) - L.ovr(x)); ui.mlist = rows.map(p => p.id);
    const item = p => { const lk = L.lockLeft(p), fm = formOf(p), line = p.type === 'B' ? batLine(p.id, true) : pitLine(p.id, true); return `<div class="pli" data-act="player" data-a="${p.id}"><div class="pl-main"><div class="pl-top"><b>${esc(p.ko)}</b> <span class="muted small">${pos(p)} · ${p.age}세</span>${p.age <= 25 ? ` <span class="chip">잠재 ${L.potLetter(p)}</span>` : ''}</div><div class="small muted">${line}${fm ? ' · 최근 ' + esc(fm.txt) : ''}</div>${p.type === 'P' ? `<div>${gauge(p)}</div>` : ''}</div><div class="pl-r">${ovrChip(L.ovr(p))}<span data-stop="1">${lk ? `<span class="chip">잠금 ${lk}일</span>` : `<button class="sm primary" data-act="toggleActive" data-a="${p.id}">${full ? '콜업' : '1군 등록'}</button>`}</span></div></div>`; };
    const chips = [['all', '전체'], ['B', '타자'], ['SP', '선발'], ['RP', '구원'], ['young', '유망주']].map(([k, t]) => `<button class="sm" aria-pressed="${f === k}" data-act="farmF" data-a="${k}">${t} ${farm.filter(fl[k]).length}</button>`).join('');
    const sorts = [['ovr', '능력치순'], ['form', '최근 폼순'], ['age', '어린 순']].map(([k, t]) => `<button class="sm ${sk === k ? 'primary' : ''}" data-act="farmS" data-a="${k}">${t}</button>`).join('');
    return `<div class="card"><div class="row"><h2 style="margin:0">2군 선수 ${rows.length}명</h2></div><div class="chips">${chips}</div><div class="row small" style="gap:6px">정렬 ${sorts}</div><div class="plist">${rows.map(item).join('') || '<div class="muted small">해당하는 2군 선수가 없습니다.</div>'}</div></div>`;
  }
  function screenFarm() {
    const S = L.S, me = U(), all = L.players(me), farm = all.filter(p => !p.active && !L.isInj(p)).sort((a, b) => L.ovr(b) - L.ovr(a)), injd = all.filter(p => !p.active && L.isInj(p)), act = all.filter(p => p.active);
    const full = act.length >= ACTIVE_MAX, st2 = L.standings2(), my2 = st2.find(x => x.team === me), recs = farmRecs();
    const line = p => p.type === 'B' ? batLine(p.id, true) : pitLine(p.id, true);
    const frow = p => { const lk = L.lockLeft(p), f = formOf(p); return `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b>${injChip(p)}${p.age <= 28 && L.S.coach ? ` <span class="chip" title="육성 방향">${L.planName(L.devPlan(p))}</span>` : ''}${p.age <= 25 ? ` <span class="chip" title="예상 정점 기준: A 슈퍼스타급(68+) · B 확실한 주전급(57+) · C 준주전급(48+) · D 후보급(38+) · E 육성급. 스카우트 추정이며 시즌을 거치며 정확해집니다.">잠재력 ${L.potLetter(p)}</span>` : ''}</td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${line(p)}</td><td class="l small">${f ? f.txt : '<span class="muted">-</span>'}</td><td data-stop="1">${L.isInj(p) ? `<span class="chip warn">부상자 명단</span>` : lk ? `<span class="chip">잠금 ${lk}일</span>` : `<button class="sm" data-act="toggleActive" data-a="${p.id}">${full ? '콜업' : '1군 등록'}</button>`}</td></tr>`; };
    const arow = p => `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${statLine(p)}</td><td data-stop="1"><button class="sm" data-act="toggleActive" data-a="${p.id}">2군으로</button></td></tr>`;
    const rec = recs.length ? recs.map(r => `<div class="row small"><span>↑ <b>${esc(r.up.p.ko)}</b> (OVR ${L.ovr(r.up.p)}${r.up.f ? ' · 최근 ' + r.up.f.txt : ''}) ↔ ↓ <b>${esc(r.down.ko)}</b> (OVR ${L.ovr(r.down)})</span><span class="sp"></span><button class="sm" data-act="swapFarm" data-a="${r.up.p.id}|${r.down.id}">교체</button></div>`).join('') : '<div class="small muted">지금 1군 후보보다 확실히 나은 2군 선수가 없습니다.</div>';
    const th = '<thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">2군 기록</th><th class="l">최근 10경기</th><th></th></tr></thead>';
    return `<div class="card"><div class="row"><h2>2군 (퓨처스)</h2><span class="muted small">1군 ${act.length}/${ACTIVE_MAX} · 2군 ${farm.length}명 · 2군 성적 ${my2.w}승 ${my2.l}패 ${my2.d}무 (${my2.rank}위)</span></div>
      <div class="small muted">1군 말소 후 10경기일(약 열흘) 동안은 재등록할 수 없습니다. 2군에서 꾸준히 뛴 어린 선수는 성장이 빠르고, 출전하지 못하면 성장이 더딥니다. 추천은 능력치와 최근 10경기 성적을 함께 본 참고용입니다.</div></div>
      <div class="card"><h2>콜업 추천</h2>${rec}</div>
      ${farmList(farm, full)}${trainCard()}
      ${injd.length ? `<div class="card"><details><summary><b>부상자 명단 ${injd.length}명</b> <span class="muted small">콜업 불가 · 복귀하면 알려드립니다</span></summary><div class="tablewrap"><table>${th}<tbody>${injd.map(frow).join('')}</tbody></table></div></details></div>` : ''}
      <div class="card"><h2>1군 엔트리</h2><div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">1군 기록</th><th></th></tr></thead><tbody>${act.sort((a, b) => (a.type > b.type ? 1 : a.type < b.type ? -1 : L.ovr(b) - L.ovr(a))).map(arow).join('')}</tbody></table></div></div>
      ${milCard()}
      <div class="card"><h2>${S.year} 2군 순위</h2><div class="tablewrap"><table><thead><tr><th class="l">순위</th><th class="l">팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th></tr></thead><tbody>${st2.map(x => `<tr class="${x.team === me ? 'me' : ''}"><td class="l n">${x.rank}</td><td class="l">${teamTag(x.team)}</td><td class="n">${x.w}</td><td class="n">${x.l}</td><td class="n">${x.d}</td><td class="n">${pct3(x.pct)}</td><td class="n">${x.rs}</td><td class="n">${x.ra}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* 경쟁균형세 표시: 상위 40명 합계(신인·외국인 제외) / 상한 */
  function salCell(p) { const c = p.contract; return c.amort ? `${money(c.salary)}<div class="muted small">+ 계약금 ${c.amort}억/년 (총 ${c.bonus}억)</div>` : money(c.salary); }
  function cbtText(t) { const v = L.cbtPreview(t), fl = v.fl !== null ? ` · 하한 ${v.fl.toFixed(1)}` : ''; return `연봉(상위 40) ${v.pay} / 상한 ${v.cap.toFixed(1)}억${fl}${v.kind === 'over' ? ` ⚠ 초과 시 기금 ${v.fee.toFixed(1)}억` : v.kind === 'under' ? ` ⚠ 하한 미달 시 기금 ${v.fee.toFixed(1)}억` : ''}`; }
  /* 래리 버드 룰 안내: FA가 끝난 시점에 추천(보수 최고 자격 선수) 지정 내용을 알리고 확정·변경 */
  function excPromptCard() {
    const c = L.S.cbt, pr = c && c.excPrompt; if (!pr || !L.S.off) return ''; const t = U(), cur = P(c.exc[t]); if (!cur) return '';
    const el = L.players(t).filter(p => L.excEligible(p, t)).sort((a, b) => L.cbtVal(b) - L.cbtVal(a));
    return `<div class="card" style="border-color:var(--accent,#2a7)"><div class="row"><h2 style="margin:0">래리 버드 룰 — 예외 선수 지정 안내</h2></div>
      <div class="small" style="margin-top:6px">FA 계약이 모두 끝났습니다. 우리 구단 7시즌 이상 등록 선수 중 <b>보수가 가장 높은 ${esc(P(pr.id).ko)}</b>(${L.cbtVal(P(pr.id)).toFixed(1)}억 · 소속 ${P(pr.id).tn}시즌)${c.exc[t] === pr.id ? '을(를) 예외 선수로 지정했습니다' : '이(가) 추천되었으나 현재 ' + esc(cur.ko) + '(으)로 바꿔 두었습니다'}. 이 선수 보수의 <b>50%</b>가 경쟁균형세 산정에서 제외됩니다.</div>
      <div class="small muted" style="margin-top:4px">내년 경쟁균형세 산정액(상위 40명) ${pr.pay0} → <b>${L.cbtPay(t, true)}</b>억 · 상한 ${L.cbtCap(L.S.year + 1).toFixed(1)}억${pr.prev && pr.prev !== pr.id && P(pr.prev) ? ` · 기존 지정: ${esc(P(pr.prev).ko)}` : ''}</div>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><select data-sel="excprompt">${el.slice(0, 40).map(p => `<option value="${p.id}" ${c.exc[t] === p.id ? 'selected' : ''}>${esc(p.ko)} · ${L.cbtVal(p).toFixed(1)}억 · ${p.tn}시즌</option>`).join('')}</select><button class="primary" data-act="excConfirm">이 선수로 확정</button></div>
      <div class="small muted" style="margin-top:4px">확정하지 않아도 위 선수로 적용된 채 새 시즌이 시작됩니다.</div></div>`;
  }
  function cbtCard() {
    const S = L.S, rows = TEAMS.map(t => ({ t, v: L.cbtPreview(t), fee: (S.cbt.fees || {})[t] || 0 })).sort((a, b) => b.v.pay - a.v.pay), cap = rows[0].v.cap;
    const last = (S.cbt.log || []).filter(x => x.team === U()).slice(-3).reverse();
    const ex = L.cbtExc(U()), el = L.players(U()).filter(p => L.excEligible(p, U())).sort((a, b) => L.cbtVal(b) - L.cbtVal(a)), g = L.capGrowth();
    const excHtml = `<div class="small" style="margin:6px 0"><b>래리 버드 룰(예외 선수)</b>: 우리 구단에 7시즌 이상 소속(등록)한 선수 1명을 지정하면 그 선수 보수(계약금·옵션 포함)의 50%가 상위 40명 합계에서 제외됩니다(KBO 2027~). 현재 ${ex ? `<b>${esc(ex.ko)}</b> (보수 ${L.cbtVal(ex).toFixed(1)}억 → ${(L.cbtVal(ex) / 2).toFixed(1)}억 제외, 소속 ${ex.tn}시즌)${S.cbt.excManual && S.cbt.excManual[U()] ? '' : ' · 자동 지정'}` : '지정 가능한 선수 없음'}.
      ${el.length ? `<select data-sel="excsel">${el.slice(0, 40).map(p => `<option value="${p.id}" ${ex && ex.id === p.id ? 'selected' : ''}>${esc(p.ko)} · ${L.cbtVal(p).toFixed(1)}억 · ${p.tn}시즌</option>`).join('')}</select> <button class="sm" data-act="setExc">지정</button>` : ''}</div>
      <div class="small" style="margin:6px 0">2029년 이후 상한·하한 인상률 가정(공식 확정은 2028년까지 매년 5%): <select data-sel="capg">${[0, 0.03, 0.05, 0.07].map(v => `<option value="${v}" ${Math.abs(g - v) < 1e-9 ? 'selected' : ''}>${v === 0 ? '동결' : '+' + Math.round(v * 100) + '%/년'}</option>`).join('')}</select> <span class="muted">(2029 상한 ${L.cbtCap(2029).toFixed(1)}억 · 2032 ${L.cbtCap(2032).toFixed(1)}억)</span></div>`;
    return `<div class="card"><h2>팀 연봉 현황 (경쟁균형세)</h2><div class="small muted">연봉 상위 40명 합계(신인·외국인 제외). 상한 ${cap.toFixed(1)}억 초과 시 초과분의 30%(2회 연속 50%, 3회 연속 100%)를 야구발전기금으로 내고, 3회 연속이면 다음 드래프트 1라운드 지명이 9단계 내려갑니다. 2027년부터 하한 ${L.cbtFloor(Math.max(2027, S.year)).toFixed(1)}억 미달 시에도 같은 비율로 납부합니다. 시즌 종료 시 정산합니다.</div>${excHtml}
      <div class="tablewrap"><table><thead><tr><th class="l">팀</th><th>상위 40 합계</th><th class="l">상한 대비</th><th>상태</th><th class="hm">누적 기금</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.t === U() ? 'me' : ''}"><td class="l">${teamTag(r.t)}</td><td class="n">${r.v.pay}</td><td class="l"><div class="bar"><i style="width:${Math.min(100, r.v.pay / cap * 100)}%"></i></div></td><td>${r.v.kind === 'over' ? '<span class="chip warn">초과</span>' : r.v.kind === 'under' ? '<span class="chip warn">하한 미달</span>' : '<span class="chip in">정상</span>'}</td><td class="n hm">${r.fee ? r.fee.toFixed(1) + '억' : '-'}</td></tr>`).join('')}</tbody></table></div>
      ${last.length ? `<div class="small muted">내 팀 정산 기록: ${last.map(x => `${x.year} ${x.pay}억 ${x.kind === 'over' ? `초과 ${x.n}회차 기금 ${x.fee}억${x.drop ? ' · 지명 9단계 하락' : ''}` : x.kind === 'under' ? `미달 ${x.n}회차 기금 ${x.fee}억` : '정상'}`).join(' / ')}</div>` : ''}</div>`;
  }
  function monthCard(me, mv) {
    const snap = me.snap || [], dead = (me.dead || []).filter(x => x.year >= L._finYear()), sg1 = x => (x >= 0 ? '+' : '') + f1(x);
    const tags = [me.evRev ? `스폰서 수입 +${f1(me.evRev)}억` : '', me.evCost ? `팬 이벤트 비용 −${f1(me.evCost)}억` : '', me.boardExtra ? `이사회 추가 예산 +${f1(me.boardExtra)}억` : '', L.deadNow(U()) ? `방출 위약금 −${f1(L.deadNow(U()))}억(올 시즌)` : '', me.promo && L.S.day < me.promo.until ? `팬 이벤트 진행 중(~${L.dateStr(me.promo.until)})` : ''].filter(Boolean);
    const rows = snap.map((s, i) => { const prev = i ? snap[i - 1].op : null; return `<tr><td class="l">${s.m}월</td><td class="n">${s.w}-${s.l}</td><td class="n">${s.rank}위</td><td class="n hm">${s.att.toLocaleString()}명</td><td class="n ${s.op >= 0 ? 'pos' : 'neg'}">${sg1(s.op)}억${prev !== null ? `<div class="small ${s.op - prev >= 0 ? 'pos' : 'neg'}">${s.op - prev >= 0 ? '▲' : '▼'}${f1(Math.abs(s.op - prev))}</div>` : ''}</td><td class="n hm">${f1(s.room)}억</td><td class="n hm">${f1(s.trust)}</td></tr>`; }).join('');
    return `<div class="card"><h2>시즌 중 재정 변화 (월말 기준)</h2><div class="small muted">성적(승률)·티켓 정책·이벤트·방출 위약금에 따라 시즌 예상 손익이 달라집니다. 지금 예상 손익 <b class="${mv.op >= 0 ? 'pos' : 'neg'}">${sg1(mv.op)}억</b>, 평균 관중 ${mv.att.toLocaleString()}명.</div>
      ${tags.length ? `<div class="row" style="margin:6px 0">${tags.map(t => `<span class="chip">${t}</span>`).join('')}</div>` : ''}
      ${rows ? `<div class="tablewrap"><table><thead><tr><th class="l">월</th><th>성적</th><th>순위</th><th class="hm">평균 관중</th><th>예상 손익</th><th class="hm">FA 여유</th><th class="hm">신뢰도</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted small">시즌이 시작되면 월별로 기록됩니다.</p>'}
      ${dead.length ? `<div class="small muted" style="margin-top:6px">방출 위약금: ${dead.map(x => `${esc(x.who)} ${x.year}년 ${f1(x.amt)}억`).join(' · ')}</div>` : ''}</div>`;
  }
  /* 재정이 게임에 주는 영향 한눈에: 예산 → FA·코치 여유 → 신뢰도 → 설득·허용 적자 */
  function finImpactCard() {
    if (!L.finReady()) return '';
    const S = L.S, t = U(), f = S.fin.teams[t], v = L.finPreview(t), allowed = L.finAllowed(t), per10 = allowed / (0.5 + f.trust / 100) * 0.1, room = L.faRoom(t);
    const tier = f.trust >= 70 ? ['높음', 'pos', '이사회가 적자를 넉넉히 허용합니다. 대형 영입·코치 투자 여력이 큽니다.'] : f.trust >= 40 ? ['보통', '', '허용 적자가 중간입니다. 무리한 영입은 설득이 필요합니다.'] : ['낮음', 'neg', '허용 적자가 크게 줄어 FA·코치 영입이 막히고 설득 성공률도 낮습니다. 흑자·성적으로 신뢰를 회복하세요.'];
    const row = (l, x, note) => `<tr><td class="l">${l}</td><td class="n"><b>${x}</b></td><td class="l small muted">${note || ''}</td></tr>`;
    return `<div class="card"><h2>재정이 게임에 미치는 영향</h2><div class="small muted">핵심은 <b>FA 여유자금</b>입니다. 여유자금이 FA·코치 영입과 방출 위약금·보상금을 결정하고, 시즌 손익과 성적은 <b>이사회 신뢰도</b>를 바꿔 다음 시즌 예산(허용 적자)을 키우거나 줄입니다.</div>
      <div class="tablewrap"><table><tbody>
        ${row('① 작년 매출', f1(f.lastRev) + '억', '입장·광고·중계 등. 성적·티켓 가격·이벤트로 변동')}
        ${row('② 고정 운영비', '−' + f1(f.opex) + '억', '프런트·경기진행·구장 등(감사보고서 기준)')}
        ${row('③ 허용 적자(신뢰도 ' + f1(f.trust) + ' · ' + tier[0] + ')', '+' + f1(allowed) + '억', '신뢰도 +10 → 약 +' + f1(per10) + '억')}
        ${f.boardExtra ? row('④ 이사회 추가 예산', '+' + f1(f.boardExtra) + '억', '설득·중간 점검으로 승인') : ''}
        ${row('= 선수단 예산', f1(L.finBudget(t)) + '억', '여기서 선수단 보수를 뺀 금액이 FA 여유자금')}
        ${row('− 선수단 보수(연봉+계약금 상각+위약금·보상금)', '−' + f1(v.pay) + '억', v.dead ? `방출 위약금 ${f1(v.dead)}억 포함` : '')}
        ${row('= FA 여유자금', `<span class="${room >= 0 ? 'pos' : 'neg'}">${room >= 0 ? '+' : ''}${f1(room)}억</span>`, '영입 가능액 · 부족하면 이사회 설득(확률은 신뢰도에 비례)')}
      </tbody></table></div>
      <div class="small" style="margin-top:6px"><b class="${tier[1]}">신뢰도 ${tier[0]}</b> — ${tier[2]}</div>
      <div class="small muted" style="margin-top:4px">시즌 종료 시 신뢰도 변화: 우승 +12 · 준우승 +6 · 가을야구 +3 · 하위권 −3~−6 · 흑자 +2 · 큰 적자 −6. 올 시즌 예상 손익 ${v.op >= 0 ? '+' : ''}${f1(v.op)}억(방출·이벤트·상한 초과 기금 반영).</div></div>`;
  }
  function econCard() {
    const E = L.econ(), me = L.S.fin && L.S.fin.teams[U()], g = v => (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
    const rows = [['객단가 인상', `연 ${g(E.price)}(잠실 LG·두산 2028~2031 ${g(E.priceJam)}, 2032 잠실돔 개장 +${g(E.jamJump)})`, '실측 2022~2026 연평균 +5.69%·2019~2026 +6.66%의 중간값, 잠실은 1~2층 위주 운영으로 둔화'], ['MD·기타 수입', `(1 + 관중 증가율) × (1 + ${E.mdK} × 객단가 인상률) − 1`, '관중·1인당 소비 증가에 연동(제공 프록시)'], ['모기업 광고·후원', `연 +${g(E.par)}`, '독립채산 가정(적자 보전형은 미구현)'], ['운영비', `연 +${g(E.cost)}`, '비용 쪽 가정(선수단운영비 +11.2%(2025)·연봉 +5% 수준)'], ['시장 연봉(계약 요구액)', `2028년부터 연 +${g(E.sal)}`, '경쟁균형세 상한 증액 5%와 같은 속도(제공: 연 +4.5~5.5%)'], ['중계권', '2027~2031 균등 분배 144억 고정', '실제 계약']];
    return `<div class="card"><div class="row"><h2 style="margin:0">재정 성장 가정</h2><span class="chip warn">가정값</span><span class="sp"></span><button class="sm ${E.on ? 'primary' : ''}" data-act="econToggle" aria-pressed="${E.on}">${E.on ? '켜짐' : '꺼짐'}</button></div>
      <div class="small muted" style="margin:4px 0">${E.on ? '매 시즌이 끝날 때 다음 시즌의 객단가·수입·비용이 아래 비율로 올라갑니다. 예산(FA 여유자금) 기준 매출에도 확정된 성장분이 더해집니다.' : '꺼져 있어 객단가·광고·MD·운영비·시장 연봉이 매년 그대로입니다(이전 방식).'}${me ? ` 현재 객단가 ${Math.round(me.price * 1e8).toLocaleString()}원.` : ''}</div>
      <div class="tablewrap"><table><thead><tr><th class="l">항목</th><th class="l">가정</th><th class="l">근거</th></tr></thead><tbody>${rows.map(r => `<tr><td class="l">${r[0]}</td><td class="l">${esc(r[1])}</td><td class="l small muted">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function screenFinance() {
    const S = L.S; if (!L.finReady()) return `<div class="card"><h2>재정</h2><div class="small muted">이 저장 데이터에는 재정 정보가 없습니다(예전 버전 저장). 새 게임을 시작하면 구단 재정이 반영됩니다.</div></div>`;
    const f1 = x => (Math.round(x * 10) / 10).toFixed(1), sg = x => (x >= 0 ? '+' : '') + f1(x);
    const rows = TEAMS.map(t => ({ t, f: S.fin.teams[t], v: L.finPreview(t) })).sort((a, b) => b.v.op - a.v.op);
    const me = S.fin.teams[U()], mv = L.finPreview(U()), hist = S.fin.hist.map(h => ({ year: h.year, r: h.teams[U()], ps: h.ps })).reverse();
    const nextCap = me.capchg.filter(c => c[0] >= S.year);
    return `<div class="kpis"><div class="kpi"><div class="l">예상 영업이익(정규시즌)</div><div class="v ${mv.op >= 0 ? 'pos' : 'neg'}">${sg(mv.op)}억</div></div><div class="kpi"><div class="l">선수단 보수</div><div class="v">${f1(mv.pay)}억</div></div><div class="kpi"><div class="l">FA 여유자금</div><div class="v ${mv.room >= 0 ? '' : 'neg'}">${f1(mv.room)}억</div></div><div class="kpi"><div class="l">이사회 신뢰도</div><div class="v ${mv.trust < 30 ? 'neg' : ''}">${mv.trust}</div></div></div>
    ${finImpactCard()}
    ${monthCard(me, mv)}
    <div class="card"><h2>티켓 가격 정책</h2><div class="small muted">가격을 올리면 객단가가 오르지만 관중이 줄어듭니다(탄력성 0.6, 가정). 시즌 중에도 바꿀 수 있고, 이후 경기부터 적용됩니다. 현재 홈 평균 관중 ${mv.att.toLocaleString()}명 / 좌석 ${mv.cap.toLocaleString()}</div>
      <div class="row" style="gap:6px;margin-top:6px">${[0.9, 1, 1.1, 1.2].map(m => `<button data-act="ticket" data-a="${m}" ${me.pm === m ? 'class="primary"' : ''}>${m === 1 ? '유지' : (m < 1 ? '' : '+') + Math.round((m - 1) * 100) + '%'}</button>`).join('')}</div></div>
    <div class="card"><h2>구단 재정 (정규시즌 예상, 억 원)</h2><div class="small muted">수입 = 입장(홈 관중 × 객단가) + 모기업·계열사 광고·후원(매출 × 의존도) + 중계권 KBOP 균등 분배(2027~ 구단당 144억) + MD·기타(2025 매출에서 역산, 고정). 비용 = 선수단 보수 + 운영비(2025 영업비용 − 보수) + 야구발전기금. 포스트시즌 배당·우승 보너스는 시즌 결산 때 더해집니다. FA 여유자금 = (직전 매출 − 운영비 + 허용 적자[매출 3% × (0.5 + 신뢰도/100)]) − 선수단 보수.</div>
      <div class="tablewrap"><table><thead><tr><th class="l">팀</th><th>평균 관중</th><th>입장</th><th>모기업·계열</th><th>중계분배</th><th>MD 등</th><th>선수단</th><th>운영비</th><th>기금</th><th>영업이익</th><th>FA 여유</th><th>신뢰</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.t === U() ? 'me' : ''}"><td class="l">${teamTag(r.t)}</td><td class="n">${r.v.att.toLocaleString()}<span class="muted small"> / ${r.v.cap.toLocaleString()}</span></td><td class="n">${f1(r.v.gate)}</td><td class="n">${f1(r.v.par)}${r.f.parKnown ? '' : '<span class="muted">*</span>'}</td><td class="n">${f1(r.v.bc)}</td><td class="n">${f1(r.v.other)}</td><td class="n">${f1(r.v.pay)}</td><td class="n">${f1(r.v.opex)}</td><td class="n">${r.v.cbt ? f1(r.v.cbt) : '-'}</td><td class="n ${r.v.op >= 0 ? 'pos' : 'neg'}"><b>${sg(r.v.op)}</b></td><td class="n ${r.v.room >= 0 ? '' : 'neg'}">${f1(r.v.room)}</td><td class="n">${r.f.trust}</td></tr>`).join('')}</tbody></table></div><div class="small muted">* 모기업 지원 의존도는 10개 구단 합산 약 25%(보도 평균 25%와 일치). 계열사(특수관계자) 거래 매출 비율(감사보고서): KT 44.0% · 삼성 37.3% · 롯데 33.7% · LG 31.7%(계열사 입장권 제외) · SSG 29.9% · 두산 24.1% · 한화 12.9% · NC 11.8% · KIA 6.3%(지원금 포함, 광고모델수입은 구분 없어 하한) · 키움 0%.</div></div>

    <div class="card"><h2>비용 구조 (2025 감사보고서 기준, 억 원)</h2><div class="small muted">선수단 보수는 현재 계약 연봉 합계(게임 값)이고, 나머지는 2025 영업비용을 감사보고서 항목으로 나눈 고정비입니다. 선수단 기타 = 선수단운영비 − 보수(인센티브·계약금 상각·원정·숙소·훈련·용품·의료 등, 세부 미공시). 프런트·직원 = 임직원 급여·퇴직·복리후생. 사업·구장 원가 = 상품·사업·광고·구장운영 원가.</div>
      <div class="tablewrap"><table><thead><tr><th class="l">팀</th><th>선수단 보수</th><th>선수단 기타</th><th>프런트·직원</th><th>경기진행</th><th>사업·구장 원가</th><th>기타</th><th>합계</th><th>매출 대비</th></tr></thead><tbody>${TEAMS.map(t => ({ t, f: S.fin.teams[t], v: L.finPreview(t) })).filter(r => r.f.parts).sort((a, b) => b.v.pay + b.v.opex - a.v.pay - a.v.opex).map(r => { const p = r.f.parts, tot = r.v.pay + r.v.opex; return `<tr class="${r.t === U() ? 'me' : ''}"><td class="l">${teamTag(r.t)}</td><td class="n">${f1(r.v.pay)}</td><td class="n">${f1(p.teamX)}${p.unsplit ? '<span class="muted">†</span>' : ''}</td><td class="n">${f1(p.staff)}</td><td class="n">${p.game ? f1(p.game) : '-'}</td><td class="n">${p.biz ? f1(p.biz) : '-'}</td><td class="n">${f1(p.other)}</td><td class="n"><b>${f1(tot)}</b></td><td class="n">${Math.round(tot / r.v.rev * 100)}%</td></tr>`; }).join('')}</tbody></table></div>
      <div class="small muted">† 두산은 선수단운영비와 사업원가를 분리해 공시하지 않아 매출원가 전체를 선수단 쪽에 넣었습니다. KT·LG는 농구단 운영 비용이 포함될 수 있고, 키움·KT는 경기진행·사업원가가 별도 공시되지 않아 '기타'에 포함됩니다. SSG의 사업·구장 원가는 일반운영비·판매촉진비로 추정 분류했습니다. ${esc(me.costNote || '')}</div></div>
    <div class="card"><h2>${KO[U()]} 재정 자료</h2><div class="small muted">2025 감사보고서·보도 기준 매출 ${f1(me.rev0)}억 · 영업이익 ${sg(me.op0)}억 · 구장 ${esc(me.park)} 좌석 ${me.cap.toLocaleString()}석(${esc(me.capsrc || '')}) · 객단가 ${Math.round(me.price * 1e8).toLocaleString()}원${me.gateKnown ? ' (2026 입장수입 ÷ 2026 총관중)' : ' <span class="chip warn">입장수입 미공시 → 다른 구단 평균 객단가 가정</span>'}<br>${nextCap.map(c => `${c[0]}년부터 ${c[1].toLocaleString()}석 <span class="chip warn">${esc(me.chgsrc || '')}</span>`).join('<br>')}${nextCap.length ? '<br>' : ''}${esc(me.note || '')}</div>
      ${me.audit && me.audit.length ? `<details style="margin-top:6px"><summary class="small">2025 감사보고서 항목(억 원)</summary><div class="tablewrap"><table><tbody>${me.audit.map(a => `<tr><td class="l">${esc(a[0])}</td><td class="l">${esc(a[1])}</td><td class="n">${a[2] ? f1(a[2]) : ''}</td><td class="l small muted">${esc(a[3] || '')}</td></tr>`).join('')}</tbody></table></div></details>` : '<div class="small muted">이 구단은 감사보고서에 항목별 수입 내역이 없습니다.</div>'}
      <div class="small muted" style="margin-top:6px">포스트시즌: 입장수입(경기당 좌석 × 4.5만 원, 매진 가정)에서 운영비 44%를 뺀 배당 재원을 정규시즌 1위 20%, 한국시리즈 우승 40%·준우승 19.2%, 플레이오프 패 11.2%, 준PO 패 7.2%, 와일드카드 패 2.4%로 나눕니다. 우승 시 모기업이 배당의 50%를 보너스로 주고, 그중 30%는 선수단 포상금으로 나갑니다(포상 비율은 가정).</div>
      ${hist.length ? `<div class="tablewrap"><table><thead><tr><th class="l">시즌</th><th>매출</th><th>PS 배당</th><th>모기업 보너스</th><th>선수단 보수</th><th>포상금</th><th>운영비</th><th>기금</th><th>영업이익</th><th>평균 관중</th><th>신뢰도</th></tr></thead><tbody>${hist.map(h => `<tr><td class="l">${h.year}</td><td class="n">${f1(h.r.rev)}</td><td class="n">${h.r.ps ? f1(h.r.ps) : '-'}</td><td class="n">${h.r.bonus ? f1(h.r.bonus) : '-'}</td><td class="n">${f1(h.r.pay)}</td><td class="n">${h.r.prize ? f1(h.r.prize) : '-'}</td><td class="n">${f1(h.r.opex)}</td><td class="n">${h.r.cbt ? f1(h.r.cbt) : '-'}</td><td class="n ${h.r.op >= 0 ? 'pos' : 'neg'}">${sg(h.r.op)}</td><td class="n">${h.r.att.toLocaleString()}</td><td class="n">${h.r.trust} (${h.r.dTrust >= 0 ? '+' : ''}${h.r.dTrust})</td></tr>`).join('')}</tbody></table></div>` : '<div class="small muted">아직 결산 기록이 없습니다.</div>'}</div>${econCard()}`;
  }
  /* 팀 정보: 내 팀뿐 아니라 모든 구단의 성적·로스터·연봉·최근 경기를 볼 수 있다 */
  function screenTeams() {
    const S = L.S, st = L.standings(), t = (ui.viewTeam && ui.viewTeam in KO ? ui.viewTeam : U()), x = st.find(r => r.team === t), top = st[0];
    const chips = `<div class="chips">${st.map(r => `<button class="sm" aria-pressed="${r.team === t}" data-act="team" data-a="${r.team}">${r.rank}. ${KO[r.team]}</button>`).join('')}</div>`;
    const games = S.results.filter(g => g.home === t || g.away === t), last = games.slice(-10).reverse();
    const wl = g => { const home = g.home === t, my = home ? g.rh : g.ra, op = home ? g.ra : g.rh; return { opp: home ? g.away : g.home, home, my, op, r: my === op ? '무' : my > op ? '승' : '패' }; };
    const l10 = games.slice(-10).map(wl), rec10 = `${l10.filter(r => r.r === '승').length}승 ${l10.filter(r => r.r === '패').length}패${l10.some(r => r.r === '무') ? ' ' + l10.filter(r => r.r === '무').length + '무' : ''}`;
    const streak = (() => { let n = 0, k = null; for (const g of games.slice().reverse().map(wl)) { if (k === null) k = g.r; if (g.r !== k) break; n++; } return k && k !== '무' ? `${n}${k}` : '-'; })();
    const pl = L.players(t), act = pl.filter(p => p.active), set = S.teams[t].set, byId = id => S.players[id];
    const row = p => p ? `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b>${injChip(p)}</td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="n hm">${money(p.contract.salary)}</td></tr>` : '';
    const tbl = (title, ids, note) => ids && ids.length ? `<div class="card"><h2>${title}</h2>${note ? `<div class="small muted" style="margin:-6px 0 6px">${note}</div>` : ''}<div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="hm">연봉</th></tr></thead><tbody>${ids.map(id => row(typeof id === 'string' ? byId(id) : id)).join('')}</tbody></table></div></div>` : '';
    const lineup = (set.lineup && set.lineup.length === 9 ? set.lineup : L.bestLineup(L.hitters(t, true))), lu = lineup.map(x => x.id).filter(id => byId(id) && byId(id).team === t), rot = (set.rotation || []).filter(id => byId(id) && byId(id).team === t), bp = set.bullpen || {};
    const pen = [bp.closer, ...(bp.setup || []), ...(bp.middle || [])].filter(id => id && byId(id) && byId(id).team === t);
    const star = pl.filter(p => !p.foreign || true).sort((a, b) => L.ovr(b) - L.ovr(a)).slice(0, 8);
    const inj = pl.filter(p => L.isInj(p)), fr = L.foreignOf(t), cv = L.cbtPreview(t), mgr = S.coach && S.coach.mgr[t];
    const gb = x.rank === 1 ? '-' : (((top.w - x.w) + (x.l - top.l)) / 2).toFixed(1);
    const rc = last.map(wl);
    return `${chips}<div class="card"><div class="row"><h2 style="margin:0">${teamTag(t)}</h2><span class="muted small">${park(t)}${mgr ? ' · 감독 ' + esc(mgr.name) : ''}${t === U() ? ' · <b>내 팀</b>' : ''}</span></div>
      <div class="kpis" style="margin-top:10px"><div class="kpi"><div class="l">순위</div><div class="v">${S.phase === 'offseason' || x.w + x.l + x.d === 0 ? '-' : x.rank + '위'}</div></div><div class="kpi"><div class="l">성적</div><div class="v">${x.w}-${x.l}${x.d ? '-' + x.d : ''}</div><div class="small muted">승률 ${pct3(x.pct)} · 게임차 ${gb}</div></div><div class="kpi"><div class="l">득점 / 실점</div><div class="v">${x.rs} / ${x.ra}</div><div class="small muted">득실 ${sgn(x.rs - x.ra)}</div></div><div class="kpi"><div class="l">최근 10경기</div><div class="v">${l10.length ? rec10 : '-'}</div><div class="small muted">연속 ${streak}</div></div><div class="kpi"><div class="l">연봉(상위 40)</div><div class="v">${cv.pay}</div><div class="small muted">상한 ${cv.cap.toFixed(1)}억${cv.kind === 'over' ? ' · 초과' : cv.kind === 'under' ? ' · 하한 미달' : ''}</div></div><div class="kpi"><div class="l">보유</div><div class="v">${pl.length}명</div><div class="small muted">1군 ${act.length} · 외국인 ${fr.filter(p => !p.aq).length}+AQ ${fr.filter(p => p.aq).length}</div></div></div></div>
      ${rc.length ? `<div class="card"><h2>최근 경기</h2><div class="tablewrap"><table><tbody>${last.map((g, i) => `<tr><td class="l">${L.dateStr(g.day)}</td><td class="l">${rc[i].home ? '홈' : '원정'} ${teamTag(rc[i].opp)}</td><td class="n"><b class="${rc[i].r === '승' ? 'pos' : rc[i].r === '패' ? 'neg' : ''}">${rc[i].r}</b> ${rc[i].my}:${rc[i].op}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="grid">${tbl('주요 선수 (OVR 상위)', star)}${tbl('타순', lu, t === U() ? '현재 라인업 기준' : '현재 1군 타자로 구성한 예상 라인업')}${tbl('선발 로테이션', rot)}${tbl('불펜 (마무리·승리조·중간)', pen)}</div>
      ${inj.length ? `<div class="card"><h2>부상자</h2><div class="tablewrap"><table><tbody>${inj.map(p => `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b> <span class="muted small">${pos(p)}</span></td><td class="l small">${esc(p.inj.dx)}</td><td class="n small">~${L.injDateStr(p)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  }
  /* 수상 기록: 실제 KBO 신인왕·골든글러브(2020~2025)와 내 게임의 연도별 수상 */
  function awardsCard() {
    const S = L.S, real = S.awardsReal || [], mine = S.awardsHist || [];
    const years = Array.from(new Set(real.map(x => x.y))).sort((a, b) => b - a);
    const realHtml = years.length ? `<details style="margin-top:6px"><summary><b>실제 KBO 신인왕·골든글러브 (${years[years.length - 1]}~${years[0]})</b> — 2026 시상: 신인왕 11/26 · 골든글러브 12/8 예정</summary>${years.map(y => { const rk = real.find(x => x.y === y && x.k === '신인왕'), gg = real.filter(x => x.y === y && x.k === '골든글러브');
      return `<div style="margin-top:8px"><b>${y}</b> <span class="small muted">신인왕</span> ${rk ? `<b>${esc(rk.name)}</b> (${esc(rk.team)} ${esc(rk.pos)}) <span class="small muted">${esc(rk.note)}</span>` : '-'}<div class="small" style="margin-top:2px">${gg.map(g => `<span class="chip" title="${esc(g.note)}">${esc(g.pos.replace('수', ''))} ${esc(g.name)}(${esc(g.team)})</span>`).join(' ')}</div></div>`; }).join('')}</details>` : '';
    const mineHtml = mine.length ? `<div style="margin-top:8px"><b>내 게임 수상 기록</b>${mine.slice().reverse().map(m => `<div class="small" style="margin-top:4px"><b>${m.year}</b> ${m.awards.filter(a => ['MVP', '신인왕', '홈런왕', '타율왕'].includes(a.label)).map(a => `${a.label} ${esc(a.name)}`).join(' · ')}</div>`).join('')}</div>` : '';
    return `<div class="card"><h2>수상 기록</h2>${mineHtml}${realHtml || '<span class="muted small">기록이 없습니다.</span>'}</div>`;
  }
  function screenStandings() {
    const S = L.S, st = L.standings(), top = st[0];
    const rows = st.map(x => `<tr class="click ${x.team === U() ? 'me' : ''} ${x.rank === 5 ? 'cut' : ''}" data-act="team" data-a="${x.team}"><td class="l n">${x.rank}</td><td class="l">${teamTag(x.team)}</td><td class="n">${x.w + x.l + x.d}</td><td class="n">${x.w}</td><td class="n">${x.l}</td><td class="n hm">${x.d}</td><td class="n"><b>${pct3(x.pct)}</b></td><td class="n">${x.rank === 1 ? '-' : (((top.w - x.w) + (x.l - top.l)) / 2).toFixed(1)}</td><td class="n hm">${x.rs}</td><td class="n hm">${x.ra}</td><td class="n ${x.rs - x.ra >= 0 ? 'pos' : 'neg'}">${sgn(x.rs - x.ra)}</td></tr>`).join('');
    const gp = Math.max(1, Math.round(S.results.length / 5)), minPA = Math.round(3.1 * gp / 10 * 1.0);
    const bat = Object.entries(S.stats.bat).map(([id, c]) => { const p = P(id); if (!p || !c.PA) return null; const ab = c.PA - c.BB - c.HBP - c.SF, h = c['1B'] + c['2B'] + c['3B'] + c.HR; return { p, PA: c.PA, avg: ab ? h / ab : 0, HR: c.HR, RBI: c.RBI, H: h, SB: c.SB }; }).filter(Boolean);
    const q = bat.filter(x => x.PA >= Math.max(30, 3.1 * (S.day)));
    const lead = (arr, key, fmt, n) => arr.slice().sort((a, b) => b[key] - a[key]).slice(0, n || 8).map((x, i) => `<tr class="click" data-act="player" data-a="${x.p.id}"><td class="l n">${i + 1}</td><td class="l">${esc(x.p.ko)}</td><td class="l">${teamTag(x.p.team in KO ? x.p.team : U())}</td><td class="n"><b>${fmt(x[key])}</b></td></tr>`).join('');
    const pit = Object.entries(S.stats.pit).map(([id, c]) => { const p = P(id); if (!p || c.outs < 3) return null; return { p, ra9: c.R * 27 / c.outs, K: c.K, outs: c.outs }; }).filter(Boolean);
    const pq = pit.filter(x => x.outs >= 3 * Math.max(5, S.day * 0.8) * 0 + 30);
    const lt = (title, body) => `<div class="card"><h2>${title}</h2><div class="tablewrap"><table><tbody>${body || '<tr><td class="muted">기록이 아직 없습니다.</td></tr>'}</tbody></table></div></div>`;
    return `<div class="card"><h2>${S.year} 정규시즌 순위</h2><div class="small muted" style="margin:-6px 0 8px">팀을 누르면 팀 정보를 볼 수 있습니다.</div><div class="tablewrap"><table class="stand"><thead><tr><th class="l">순위</th><th class="l">팀</th><th>경기</th><th>승</th><th>패</th><th class="hm">무</th><th>승률</th><th>게임차</th><th class="hm">득점</th><th class="hm">실점</th><th>득실</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="grid">${lt('홈런', lead(bat, 'HR', v => v))}${lt('타율 (규정 타석)', lead(q, 'avg', pct3))}${lt('안타', lead(bat, 'H', v => v))}${lt('타점', lead(bat, 'RBI', v => v))}${lt('탈삼진 (투수)', pit.slice().sort((a, b) => b.K - a.K).slice(0, 8).map((x, i) => `<tr class="click" data-act="player" data-a="${x.p.id}"><td class="l n">${i + 1}</td><td class="l">${esc(x.p.ko)}</td><td class="l">${teamTag(x.p.team in KO ? x.p.team : U())}</td><td class="n"><b>${x.K}</b></td></tr>`).join(''))}${lt('RA9 (30이닝 이상, 낮을수록 좋음)', pq.slice().sort((a, b) => a.ra9 - b.ra9).slice(0, 8).map((x, i) => `<tr class="click" data-act="player" data-a="${x.p.id}"><td class="l n">${i + 1}</td><td class="l">${esc(x.p.ko)}</td><td class="l">${teamTag(x.p.team in KO ? x.p.team : U())}</td><td class="n"><b>${x.ra9.toFixed(2)}</b></td></tr>`).join(''))}</div>${cbtCard()}`;
  }

  /* ---------------- 이적시장 ---------------- */
  function screenMarket() {
    const tabs = [['trade', '트레이드'], ['fa', 'FA 시장']];
    return `<div class="tabs" role="tablist">${tabs.map(t => `<button role="tab" aria-selected="${ui.market === t[0]}" data-act="mtab" data-a="${t[0]}">${t[1]}</button>`).join('')}</div>${ui.market === 'trade' ? screenTrade() : screenFA()}`;
  }
  function playerRow(p, checked, act, extra) {
    return `<tr><td class="l"><label class="row" style="gap:6px"><input type="checkbox" data-act="${act}" data-a="${p.id}" ${checked ? 'checked' : ''}>${esc(p.ko)}</label></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="n">${money(p.contract.salary)}</td><td class="n">${money(L.marketValue(p))}</td></tr>`;
  }
  function screenTrade() {
    const S = L.S, ais = TEAMS.filter(t => t !== U()); if (!ui.trade.team) ui.trade.team = ais[0];
    const T = ui.trade, mine = L.players(U()).sort((a, b) => L.marketValue(b) - L.marketValue(a)), theirs = L.players(T.team).sort((a, b) => L.marketValue(b) - L.marketValue(a));
    const give = [...T.give].filter(id => P(id) && P(id).team === U()), get = [...T.get].filter(id => P(id) && P(id).team === T.team);
    const ev = give.length && get.length ? L.evaluateTrade(T.team, give, get) : null;
    const th = '<thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th>연봉</th><th>가치</th></tr></thead>';
    const msg = !L.canTrade() ? '<p class="neg">지금은 트레이드할 수 없습니다(트레이드 마감 또는 포스트시즌).</p>' : ev ? (ev.ok ? `<p class="pos">상대 구단이 수락할 수 있는 제안입니다. (상대가 받는 가치 ${ev.vGive} ≥ 요구 ${ev.need})</p>` : `<p class="neg">${esc(ev.why)}</p>`) : '<p class="muted">내 선수와 상대 선수를 하나 이상씩 고르면 상대 구단의 평가를 보여줍니다.</p>';
    return `<div class="card"><div class="row"><h2>트레이드</h2><span class="sp"></span><label class="small muted">상대 구단 <select data-sel="ttteam">${ais.map(t => `<option value="${t}" ${t === T.team ? 'selected' : ''}>${KO[t]}</option>`).join('')}</select></label></div>
      <p class="small muted" style="margin:6px 0">가치는 능력치·나이·잠재력을 반영한 시장 가치(억 원)입니다. 상대 구단은 자기 선수를 높게 평가해서 보통 12% 이상의 차액과 핵심 선수에는 추가 대가를 요구합니다. 시즌 중에는 ${110}일차까지 가능합니다. 영입한 선수는 2군으로 들어오므로 1군에 등록해야 합니다.</p>${msg}
      <div class="row"><button class="primary" data-act="doTrade" ${ev && ev.ok ? '' : 'disabled'}>트레이드 실행</button><button data-act="clearTrade">선택 해제</button></div></div>
      <div class="grid two"><div class="card"><h2>내 선수 (내보냄)</h2><div class="tablewrap" style="max-height:480px;overflow-y:auto"><table>${th}<tbody>${mine.map(p => playerRow(p, T.give.has(p.id), 'tgive')).join('')}</tbody></table></div></div>
      <div class="card"><h2>${KO[T.team]} 선수 (영입)</h2><div class="tablewrap" style="max-height:480px;overflow-y:auto"><table>${th}<tbody>${theirs.map(p => playerRow(p, T.get.has(p.id), 'tget')).join('')}</tbody></table></div></div></div>`;
  }
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
  /* ---- 육성 방향 ---- */
  function devBlock(p) {
    if (p.team !== U() || p.age > 29 || !L.S.coach) return '';
    const plans = L.devPlans(p), cur = L.devPlan(p), auto = !(p.dev && !p.dev.auto), fc = L.devForecast(p, 3), isP = p.type === 'P';
    const sel = plans.map(pl => `<button class="sm ${pl === cur ? 'primary' : ''}" data-act="devPlan" data-a="${p.id}|${pl}">${L.planName(pl)}${pl === cur && auto ? ' (자동)' : ''}</button>`).join(' ');
    const row = pl => { const f = fc[pl]; return `<tr class="${pl === cur ? 'me' : ''}"><td class="l"><b>${L.planName(pl)}</b></td>${f.map(x => `<td class="n">${x.ovr}</td>`).join('')}${isP ? `<td class="n">${f[0].st} → ${f[3].st}</td><td class="n">${f[0].sub['구위']} → ${f[3].sub['구위']}</td><td class="n">${f[0].sub['제구']} → ${f[3].sub['제구']}</td><td class="n"><b>${f[3].fit}</b></td>` : `<td class="n">${f[3].fit}</td>`}</tr>`; };
    return `<div class="card" style="margin:8px 0"><b>육성 방향</b> <span class="small muted">${isP ? '선발·승리조·추격조(롱릴리프)·마무리 중 성장 방향을 정합니다. 코치진 능력에 따라 성장 속도가 달라집니다.' : '강화할 능력을 정합니다.'}</span><div class="row" style="gap:6px;margin:6px 0">${sel}</div>
      <div class="tablewrap"><table><thead><tr><th class="l">방향</th><th>현재</th><th>+1년</th><th>+2년</th><th>+3년</th>${isP ? '<th>체력</th><th>구위</th><th>제구</th><th>보직 적합도(3년 후)</th>' : '<th>3년 후 적합도</th>'}</tr></thead><tbody>${plans.map(row).join('')}</tbody></table></div>
      <div class="small muted">3년 성장 경로 예측(OVR 평균, 같은 선수를 12번 시뮬레이션). 코치진 보정 포함: 투수 ${esc(L.coachGrade(L.coachRating(U(), 'stuff')))}·${esc(L.coachGrade(L.coachRating(U(), 'control')))}·${esc(L.coachGrade(L.coachRating(U(), 'stamina')))}(구위·제구·체력), 타격 ${esc(L.coachGrade(L.coachRating(U(), 'contact')))}. 선발 방향은 체력이 50 이상이 되면 선발 투수로 전환됩니다.</div></div>`;
  }
  /* ---- 코치진 ---- */
  function coachRow(c, act) {
    const sp = new Set(c.spec || []);
    return `<tr><td class="l"><b>${esc(c.name)}</b>${c.origin === 'real' ? ' <span class="chip in" title="' + esc(c.src) + '">실명(보도)</span>' : c.origin === 'market' ? ' <span class="chip">시장</span>' : ' <span class="chip" title="가상 인물">가상</span>'}${c.lv ? ` <span class="muted small">${esc(c.lv)}</span>` : ''}</td><td class="l">${esc(c.role)}</td>${['stuff', 'control', 'stamina', 'contact', 'power', 'eye', 'defense', 'speed', 'mgmt'].map(f => { const v = c[f]; return `<td class="n ${sp.has(f) ? 'pos' : 'muted'}" title="${L.coachFieldName(f)} ${v}">${sp.has(f) || v >= 55 ? '<b>' + L.coachGrade(v) + '</b>' : L.coachGrade(v)}<span class="muted small"> ${v}</span></td>`; }).join('')}<td class="n">${c.salary.toFixed(1)}억</td><td>${act}</td></tr>`;
  }
  function screenCoach() {
    const S = L.S; if (!S.coach) return '<div class="card"><p class="muted">코치 정보가 없습니다.</p></div>';
    const C = S.coach, t = U(), mine = L.coachesOf(t), mk = L.coachMarket().sort((a, b) => b.salary - a.salary), lim = L.coachLimit(), room = L.faRoom(t), head = '<th class="l">코치</th><th class="l">보직</th><th>구위</th><th>제구</th><th>체력</th><th>컨택</th><th>파워</th><th>선구</th><th>수비</th><th>주루</th><th>관리</th><th>연봉</th><th></th>';
    const lg = TEAMS.map(x => ({ x, n: L.coachesOf(x).length, m: C.mgr[x] })).sort((a, b) => (L.coachRating(b.x, 'stuff') + L.coachRating(b.x, 'control') + L.coachRating(b.x, 'stamina')) - (L.coachRating(a.x, 'stuff') + L.coachRating(a.x, 'control') + L.coachRating(a.x, 'stamina')));
    return `<div class="kpis"><div class="kpi"><div class="l">육성 코치 / 정원</div><div class="v">${mine.length} / ${lim}</div></div><div class="kpi"><div class="l">감독</div><div class="v" style="font-size:18px">${esc(C.mgr[t].name)}</div></div><div class="kpi"><div class="l">코치 변동 비용</div><div class="v">${L.coachPayDelta(t) >= 0 ? '+' : ''}${L.coachPayDelta(t).toFixed(1)}억</div></div><div class="kpi"><div class="l">FA 여유자금</div><div class="v ${room < 0 ? 'neg' : ''}">${room.toFixed(1)}억</div></div></div>
      <div class="card"><h2>우리 팀 육성 코치진</h2><div class="small muted">능력치 등급 S≥75 · A≥65 · B≥55 · C≥45 · D≥35 (숫자는 20~80). 굵은 등급이 전문 분야. 정원은 리그 평균(${lim}명)이며 정원을 넘어도 불이익은 없고 신규 영입만 정원 이내입니다. <b>능력치는 모두 가상 값</b>(자료 없음). 코치 명단은 사용자 제공 1군 감독·코치(2026-10)와 퓨처스 감독·코치 명단이고, 보직은 선수 시절 포지션(드래프트 자료)으로 추정했습니다. 2027 보도 변동(한화 감독·코치 개편, 롯데·SSG 퓨처스 감독, 신규 영입) 반영.</div>
        <div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${mine.map(c => coachRow(c, `<button class="sm" data-act="fireCoach" data-a="${c.id}">해임</button>`)).join('')}</tbody></table></div></div>
      <div class="card"><h2>코치 시장 (${mk.length}명)</h2><div class="small muted">영입 연봉은 팀 예산(FA 여유자금 ${room.toFixed(1)}억) 안에서만 가능하고 코치 변동 비용으로 재정에 반영됩니다. 시장 코치는 가상 인물이며 오프시즌마다 일부 교체됩니다. ${mine.length >= lim ? '<b>정원이 찼습니다. 해임 후 영입하세요.</b>' : ''}</div>
        <div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${mk.map(c => coachRow(c, `<button class="sm primary" data-act="hireCoach" data-a="${c.id}" ${mine.length >= lim || room < c.salary ? 'disabled' : ''}>영입</button>`)).join('')}</tbody></table></div></div>
      <div class="card"><h2>리그 코칭 수준 (투수 육성 순)</h2><div class="tablewrap"><table><thead><tr><th class="l">팀</th><th class="l">감독</th><th>코치 수</th><th>투수(구위·제구·체력)</th><th>타격(컨택·파워·선구)</th><th>수비·주루</th><th>육성관리</th></tr></thead><tbody>${lg.map(r => { const g = (...f) => f.map(k => L.coachGrade(L.coachRating(r.x, k))).join('·'); return `<tr class="${r.x === t ? 'me' : ''}"><td class="l">${teamTag(r.x)}</td><td class="l">${esc(r.m.name)}${r.m.virtual ? ' <span class="chip" title="' + esc(r.m.src || '가상') + '">가상</span>' : ''}</td><td class="n">${r.n}</td><td class="n">${g('stuff', 'control', 'stamina')}</td><td class="n">${g('contact', 'power', 'eye')}</td><td class="n">${g('defense', 'speed')}</td><td class="n">${g('mgmt')}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  function injBlock(p) {
    if (p.prev) var prev = `<div class="small muted">2026 시즌 기록이 없어(장기 부상) 2025·2024 기록으로 능력치를 산정했습니다.</div>`;
    if (!p.inj || p.inj.apply === false && !p.inj.generated) return (p.prev ? prev : '') + (p.inj && p.inj.apply === false ? `<div class="small muted">2026 부상: ${esc(p.inj.dx)} (${esc(p.inj.since)}) — 복귀 예정 ${esc(p.inj.ret)}</div>` : '');
    if (!L.isInj(p)) return (p.prev ? prev : '') + `<div class="small muted">부상 이력: ${esc(p.inj.dx)} (복귀 완료)</div>`;
    return `<div class="card" style="border-left:4px solid var(--warn,#d97706);margin:8px 0"><b>부상자 명단</b> · ${esc(p.inj.dx)}<div class="small">${esc(p.inj.since)} · 복귀 예정 <b>${L.injDateStr(p)}</b> (${L.injLeft(p)}일 남음)</div><div class="small muted">${esc(p.inj.basis || '')}${p.inj.generated ? '' : ' — 복귀 시점은 보도 기반 추정이며, 재활 경과에 따라 달라질 수 있습니다.'}</div></div>${p.prev ? prev : ''}`;
  }
  function moodChip(p) {
    if (p.team !== U()) return ''; const m = L.moodOf(p); if (!m) return '';
    const until = p.mood && L.S.day < p.mood.until ? p.mood.until : (L.S.teamMood && L.S.day < L.S.teamMood.until ? L.S.teamMood.until : null);
    return ` <span class="chip ${m > 0 ? 'in' : 'warn'}" title="컨디션 ${m > 0 ? '+' : ''}${m}: 경기 능력치가 OVR 약 ${m > 0 ? '+' : ''}${(m * 0.55).toFixed(1)} 보정됩니다${until ? ' (~' + L.dateStr(until) + ')' : ''}">${m > 0 ? '▲호조' : '▼부진'}${Math.abs(m)}</span>`;
  }
  function injChip(p) { if (!L.isInj(p)) return ''; const n = L.injLeft(p); return ` <span class="chip warn" title="${esc(p.inj.dx)} · ${esc(p.inj.basis || '')} · 복귀 예정 ${L.injDateStr(p)}">부상 ~${L.injDateStr(p).slice(2)} (${n}일)</span>`; }
  function bidCell(bi) {
    if (!bi) return '<span class="muted">-</span>';
    const pe = bi.pend ? `<div class="pos"><b>내 제시 보류 중</b> (연 ${f1((bi.pend.bonus + bi.pend.salary * bi.pend.years) / bi.pend.years)}억 × ${bi.pend.years}년 · ${bi.pendLeft}일 남음)</div>` : '';
    if (!bi.n) return `<span class="muted">입찰 없음</span>${pe}`;
    return `<b>${bi.n}개 구단 경쟁</b>${bi.bids.slice(0, 3).map(b => `<div>${KO[b.team]} 연 ${b.per.toFixed(2)}억 × ${b.y}년</div>`).join('')}${pe}`;
  }
  /* 보호선수 지정(FA 보상): 내 팀이 A·B등급 외부 FA를 영입할 때 원소속 구단이 지명할 수 없는 선수 */
  function protectCard() {
    const S = L.S, t = U(), n = L.faList().filter(p => !p.foreign && p.faInfo && p.faInfo.grade && p.faInfo.grade !== 'C' && p.faInfo.from !== t).length;
    const log = (S.compLog || []).filter(c => c.year === S.year && !c.pending).slice(-6).reverse();
    const logHtml = log.length ? `<details style="margin-top:6px"><summary class="small">FA 보상 내역 (${log.length})</summary><ul class="news">${log.map(c => `<li><span class="d">${c.grade}</span><span>${esc(P(c.id) ? P(c.id).ko : '')} ${KO[c.from] || ''}→${KO[c.to] || ''}: ${esc(c.text)}</span></li>`).join('')}</ul></details>` : '';
    if (!n) return logHtml ? `<div class="card">${logHtml}</div>` : '';
    const open = !!ui.protOpen, prot = new Set(S.protect || L.compProtected(t, 'B')), el = L._compEligible(t).sort((a, b) => L.marketValue(b) - L.marketValue(a));
    const aProt = new Set(L.compProtected(t, 'A')), cnt = el.filter(p => prot.has(p.id)).length;
    return `<div class="card"><div class="row"><b>보호선수 명단</b><span class="muted small">A등급 영입 시 ${aProt.size}명 · B등급 25명 보호 (지정 ${cnt}/25${S.protect ? '' : ', 자동'})</span><span class="sp"></span><button class="sm" data-act="protToggle">${open ? '닫기' : '편집'}</button></div>
      <div class="small muted" style="margin-top:4px">A·B등급 외부 FA를 영입하면 보호선수 외 1명이 보상선수로 지명될 수 있습니다. 원소속 구단이 후보 가치와 보상금을 비교해 선택합니다. 보상금은 영입 구단 보수에 즉시 계상됩니다.</div>
      ${open ? `<div class="row" style="margin:6px 0"><button class="sm" data-act="protAuto">자동(가치 상위 25명)</button><span class="small muted">체크한 선수가 보호됩니다. A등급은 체크한 선수 중 가치 상위 20명만 보호됩니다.</span></div><div class="tablewrap" style="max-height:300px;overflow-y:auto"><table><tbody>${el.map(p => `<tr><td data-stop="1"><input type="checkbox" data-act="protSet" data-a="${p.id}" ${prot.has(p.id) ? 'checked' : ''}></td><td class="l"><b>${esc(p.ko)}</b> <span class="muted small">${pos(p)} · ${p.age}세</span></td><td>${ovrChip(L.ovr(p))}</td><td class="n small">${f1(L.marketValue(p))}억</td><td class="small muted">${aProt.has(p.id) ? 'A·B 보호' : prot.has(p.id) ? 'B만 보호' : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}${logHtml}</div>`;
  }
  function persuadeCard() {
    const pr = ui.persuade; if (!pr) return ''; const p = P(pr.id); if (!p || p.team !== 'FA') { ui.persuade = null; return ''; }
    const o = L.boardOdds(pr.id, pr.offer); if (!o.ok || o.need <= 0) { ui.persuade = null; return ''; }
    const pe = (L.S.fin.teams[U()].pers || { n: 0 });
    return `<div class="card evcard"><h2>예산 초과 — 이사회 설득</h2><div class="small">${esc(p.ko)} 영입 연 비용 <b>${f1(o.cost)}억</b>이 FA 여유자금 <b>${f1(o.room)}억</b>을 <b>${f1(o.need)}억</b> 초과합니다. 이사회를 설득하면 올 시즌 예산을 늘려 영입할 수 있습니다.</div>
      <div class="kpis" style="margin-top:8px"><div class="kpi"><div class="l">성공 확률</div><div class="v">${Math.round(o.prob * 100)}%</div><div class="small muted">신뢰도·선수 가치·초과 비율 반영</div></div><div class="kpi"><div class="l">이사회 신뢰도</div><div class="v">${f1(L.S.fin.teams[U()].trust)}</div><div class="small muted">성공 −${f1(Math.min(8, 2 + o.need * 0.4))} · 실패 −3</div></div><div class="kpi"><div class="l">설득 횟수</div><div class="v">${pe.n}/${o.max}</div><div class="small muted">${o.left > 0 ? o.left + '일 뒤 재논의' : '지금 요청 가능'}</div></div></div>
      <div class="row" style="margin-top:8px"><button class="primary" data-act="persuade" data-a="${pr.id}" ${o.left > 0 || pe.n >= o.max ? 'disabled' : ''}>이사회 설득하기</button><button data-act="persuadeCancel">취소</button><span class="small muted">조건을 낮추면(연봉·계약금·기간) 필요한 초과분이 줄어 확률이 올라갑니다.</span></div></div>`;
  }
  function relCost(p) { const c = L.releaseCost(p.id); return `<div class="small neg" style="margin-top:6px">방출해도 계약은 남습니다: 위약금 <b>${f1(c.total)}억</b>(이번 시즌 ${f1(c.thisYear)}억${c.rec.length > 1 ? ' + 이후 ' + (c.rec.length - 1) + '시즌' : ''}), FA 예산·재정에 계속 잡힙니다.${c.trust < 0 ? ` 이사회 신뢰도 ${c.trust}.` : ''}${c.core ? ' 오랜 핵심 선수 방출은 팬·선수단 반응이 좋지 않습니다.' : ''}</div>`; }
  function faCalendar() {
    const S = L.S, m = S.faMkt; if (!m) return '';
    if (m.closed) return `<div class="card"><b>FA 협상 마감</b> <span class="muted small">— 개막 전 FA 계약이 모두 정리되었습니다. 남은 선수는 시장에서 계속 영입할 수 있습니다.</span></div>`;
    const left = L.faDaysLeft(), log = (S.faLog || []).filter(x => x.year === S.year).slice(0, 5).map(x => `<li><span class="d">${L.faDateStr(x.day)}</span><span>${esc(x.text)}</span></li>`).join('');
    return `<div class="card"><div class="row"><h2>FA 협상 기간</h2><b>${L.faDateStr(m.day)}</b><span class="muted small">(1월 1일 개시 · 개막 전 ${left}일 남음 · ${L.faDateStr(75)}까지)</span><span class="sp"></span>
      <button data-act="faDay" data-a="1" ${left <= 0 ? 'disabled' : ''}>+1일</button><button data-act="faDay" data-a="3" ${left <= 0 ? 'disabled' : ''}>+3일</button><button data-act="faDay" data-a="7" ${left <= 0 ? 'disabled' : ''}>+7일</button><button class="primary" data-act="faClose">FA 마감${S.phase === 'offseason' ? '' : ' · 개막'}</button></div>
      <details style="margin-top:6px"><summary class="small">협상 규칙 보기 (요구액 하락 현재 −${Math.round((1 - L._marketDecay()) * 100)}%)</summary><div class="small muted" style="margin-top:4px"><b>미계약 기간이 길어질수록 요구액이 내려갑니다(현재 개시가 대비 −${Math.round((1 - L._marketDecay()) * 100)}%, 마감까지 최대 −30%).</b> AI 구단은 관심 선수에게 입찰하고 매일 상한까지 금액을 올립니다. 선수는 <b>연 보수(계약금 비중 선호) · 선호 기간 · 원소속 구단(+2%)</b>을 종합해 점수가 가장 높은 제시를 수락합니다. 내 제시가 경쟁 입찰보다 낮으면 5일간 보류되어 매일 재평가되므로, 금액을 올려 다시 제시하거나 '경쟁 이기는 제시'를 사용하세요. FA 마감 시 입찰 중인 계약이 확정되고 AI가 로스터를 정리합니다.</div></details>${log ? `<ul class="news" style="margin-top:6px">${log}</ul>` : ''}</div>`;
  }
  /* 외국인·아시아쿼터 시장: FA 제도(등급·보상·계약금·다년)가 없고 1년 계약, 신규 상한·재계약 인상 한도, 보유 슬롯 규정이 적용된다 */
  const foreignOvr = p => { const e = L.fEst(p); return e.exact ? ovrChip(L.ovr(p)) : `${ovrChip(Math.max(20, Math.min(80, Math.round(e.o))))}<div class="small muted" title="스카우트 조사로 오차를 줄일 수 있습니다">±${e.sd}</div>`; };
  function foreignSub(p) {
    const e = L.fEst(p); if (e.exact) return subHtml(p); const rp = L.fReport(p), sc = L.scouts();
    const btns = sc.map(s => { const done = p.fsc && p.fsc.by[s.id] && p.fsc.by[s.id].n >= 1; return `<button class="sm" data-act="scoutFor" data-a="${p.id}:${s.id}" ${done ? 'disabled' : ''} title="${esc(s.name)} 해외 ${s.abroad === undefined ? 45 : s.abroad} · 조사비 ${L.scoutProbeCost()}억">${esc(s.name)}${done ? ' ✓' : ''}</button>`; }).join(' ');
    return `<div class="small muted">KBO 기록이 없는 선수라 능력이 불확실합니다(조사 ${e.n}회 · 확신도 ${e.conf}).</div>${rp ? `<span class="sub">${Object.entries(rp.sub).map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('')}</span><div class="small muted">세부 능력 ±${rp.sd}</div>` : ''}${sc.length ? `<div class="chips wrap" style="margin-top:4px">${btns}</div>` : '<div class="small muted">스카우트를 고용하면 조사할 수 있습니다(운영 ▸ 스카우팅).</div>'}`;
  }
  function subCard() {   // 부상 대체 외국인(정규시즌 · 일반 외국인 · 6주 이상 부상)
    const S = L.S, el = L.subEligible(), subs = L.subList(), sw = L.fSwapInfo(), dl = L.postDeadline();
    const head = `<div class="row"><h2 style="margin:0">부상 대체 외국인</h2><span class="sp"></span><span class="small muted">시즌 중 교체 ${sw.n}/${sw.max}회 · 포스트시즌 등록 마감 ${dl.str.slice(5).replace('-', '월 ')}일${dl.passed ? '(지남)' : ''}</span></div>`;
    const rule = `<div class="small muted" style="margin:4px 0">일반 외국인이 6주(42일) 이상 치료가 필요한 부상이면 재활 선수명단에 올리고 대체 선수를 월 최대 10만 달러(1.4억)에 계약할 수 있습니다. 교체 횟수는 차감되지 않으며 3명 한도 밖에 둡니다. 선수가 복귀하면 7일 안에 대체 선수를 해지하거나 정식 전환(교체 1회 차감, 기존 선수 웨이버)해야 합니다. 비용은 계약 시 올해 비용으로 확정되며, 계약이 끝나면 즉시 FA로 공시됩니다. 8월 15일 이후 계약한 선수는 포스트시즌에 나갈 수 없습니다. 아시아쿼터는 대상이 아닌 것으로 가정했습니다(⚠).</div>`;
    const rowEl = x => `<div class="slotrow"><div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:0"><button class="linkbtn" data-act="player" data-a="${x.p.id}"><b>${esc(x.p.ko)}</b></button> <span class="muted small">${pos(x.p)} · ${esc(x.p.inj ? x.p.inj.dx : '부상')} · 총 ${x.days}일 · 복귀 ${esc(L.injDateStr(x.p))}</span></div><button class="sm primary" data-act="subOpen" data-a="${x.p.id}">대체 선수 영입</button></div></div>`;
    const rowSub = x => { const c = x.p, o = x.orig, bk = !!c.sub.back, left = bk ? Math.max(0, 7 - (S.day - c.sub.back)) : null;
      return `<div class="slotrow"><div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:0"><b>${esc(c.ko)}</b> <span class="muted small">${pos(c)} · OVR ${L.ovr(c)} · ${c.sub.mo}개월(~${L.dateStr(c.sub.end)}) · ${c.sub.cost}억</span><div class="small">${o ? `대체 대상 ${esc(o.ko)} ${bk ? '<span class="chip in">복귀 — ' + left + '일 안에 결정</span>' : '<span class="chip warn">재활 중</span>'}` : ''}</div></div></div>
        <div class="chips">${bk ? '' : `<button class="sm" data-act="subExtendA" data-a="${c.id}">1개월 연장(+${L.subCost(1)}억)</button>`}<button class="sm" data-act="subDecideA" data-a="${c.id}:release">계약 해지</button>${bk ? `<button class="sm primary" data-act="subDecideA" data-a="${c.id}:convert" ${sw.n >= sw.max ? 'disabled' : ''} title="기존 선수 웨이버 · 교체 1회 차감">정식 전환</button>` : ''}</div></div>`; };
    if (S.phase !== 'regular' && !subs.length) return `<div class="card">${head}${rule}<div class="small muted">정규시즌에만 이용할 수 있습니다.</div></div>`;
    return `<div class="card">${head}${rule}${subs.map(rowSub).join('')}${el.map(rowEl).join('')}${!subs.length && !el.length ? '<div class="small muted">지금 대체 대상이 없습니다(6주 이상 부상인 일반 외국인이 없음).</div>' : ''}</div>`;
  }
  function subSheet() {
    const id = ui.subFor; if (!id || !L) return ''; const o = P(id), el = L.subEligible().find(x => x.p.id === id); if (!o || !el) { ui.subFor = null; return ''; }
    const cands = L.subCands().map(c => ({ c, e: L.fEst(c) })).sort((a, b) => b.e.o - a.e.o).slice(0, 40), mx = L.subMaxMonths(), mo = Math.min(mx, ui.subMo || Math.min(2, mx)), cur = ui.subCand && cands.some(x => x.c.id === ui.subCand) ? ui.subCand : (cands[0] ? cands[0].c.id : ''), dl = L.postDeadline();
    return `<div class="sheet-bg" data-act="subClose"><div class="sheet" data-stop="1" role="dialog" aria-label="부상 대체 외국인 영입"><div class="grabber"></div>
      <h2>${esc(o.ko)} 대체 선수 영입</h2><div class="small muted">${esc(o.inj ? o.inj.dx : '부상')} · 총 ${el.days}일 · 복귀 예정 ${esc(L.injDateStr(o))} · 재활 선수명단에 등재됩니다.</div>
      <div class="row" style="margin-top:8px"><select data-sel="subcand" style="flex:1;min-width:0">${cands.map(x => `<option value="${x.c.id}" ${x.c.id === cur ? 'selected' : ''}>${esc(x.c.ko)} · ${x.c.type === 'P' ? (x.c.role === 'SP' ? '선발' : '구원') : posName[x.c.pos]} · ${x.c.age}세 · 추정 ${Math.round(x.e.o)}${x.e.exact ? '' : '±' + x.e.sd}${x.c.team === 'DRAFT' ? ' · 해외 후보' : ' · FA'}</option>`).join('')}</select>
        <select data-sel="submo">${Array.from({ length: mx }, (_, i) => i + 1).map(v => `<option value="${v}" ${v === mo ? 'selected' : ''}>${v}개월</option>`).join('')}</select></div>
      <div class="small" style="margin-top:6px">비용 <b>${L.subCost(mo)}억</b>(월 1.4억 × ${mo}개월) · FA 여유자금 ${L.faRoom(U()).toFixed(1)}억${dl.passed ? ' · <span class="chip warn">8월 15일 이후라 포스트시즌 출전 불가</span>' : ''}</div>
      <div class="small muted" style="margin-top:4px">해외 후보는 스카우트 관찰로 능력 추정이 정교해집니다. 계약하면 올해 비용이 바로 확정됩니다.</div>
      <div class="row" style="margin-top:10px"><button class="sm primary" data-act="subSignA" data-a="${id}" ${cands.length ? '' : 'disabled'}>계약</button><button class="sm" data-act="subClose">닫기</button></div></div></div>`;
  }
  function screenFAForeign(aq, all) {
    const t = U(), mine = L.foreignOf(t), gen = mine.filter(x => !x.aq), aqs = mine.filter(x => x.aq), room = L.faRoom(t);
    const list = all.filter(p => p.foreign && !!p.aq === aq).sort((a, b) => ui.faSort === 'ovr' ? L.fEst(b).o - L.fEst(a).o : ui.faSort === 'age' ? a.age - b.age : L.fSortKey(b) - L.fSortKey(a));   // 가상 외국인은 추정만으로 정렬(진짜 값 비노출)
    const slot = aq ? `아시아쿼터 보유 ${aqs.length}/1명` : `일반 외국인 보유 ${gen.length}/3명 (투수 ${gen.filter(x => x.type === 'P').length} · 타자 ${gen.filter(x => x.type === 'B').length})`;
    const rule = aq ? '아시아쿼터는 구단당 1명, 신규 연봉 상한 2.8억(20만 달러), 재계약 시 직전 연봉 +1.4억까지, 1년 계약입니다.' : '일반 외국인은 구단당 3명(같은 포지션 3명 불가), 신규 연봉 상한 14억(100만 달러 수준), 원소속 재계약은 직전 연봉 +7억까지, 1년 계약입니다.';
    const rows = list.map(p => { const ask = Math.min(L.askSalary(p), L.foreignCap(p, t)), ok = L.foreignOK(t, p), from = p.faInfo && p.faInfo.from;
      return `<tr><td class="l"><b>${esc(p.ko)}</b>${from === t ? ' <span class="chip in">원소속</span>' : ''}${L.faStar(p, t) ? ' <span class="chip warn" title="충성도가 높은 우리 출신 스타 — 이사회 특별 승인 대상">프랜차이즈 스타</span>' : ''}</td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${foreignOvr(p)}</td><td class="l small">${from ? KO[from] || '' : '-'}${p.faInfo && p.faInfo.prev ? ` · 직전 ${f1(p.faInfo.prev)}억` : ''}</td><td class="l">${foreignSub(p)}</td><td class="n">${money(ask)}<div class="small muted">상한 ${money(L.foreignCap(p, t))}</div></td><td>${ok ? `<button class="sm primary" data-act="negOpen" data-a="${p.id}|foreign" ${room >= ask ? '' : 'disabled'} title="${room >= ask ? '에이전트와 협상합니다' : '예산 부족'}">협상</button>` : `<button class="sm" data-act="foreignSlot" data-a="${p.id}" title="보유 한도가 가득 차 기존 선수와 교체해야 합니다">교체 계약</button>`}</td></tr>`; }).join('');
    return `${aq ? '' : subCard()}<div class="card"><div class="row"><h2>${aq ? '아시아쿼터 선수' : '외국인 선수'} 시장</h2><span class="muted small">${slot} · FA 여유자금 ${room.toFixed(1)}억 · 현재 보유: ${mine.map(x => esc(x.ko) + (x.aq ? '(AQ)' : '')).join(', ') || '없음'}</span><span class="sp"></span><select data-sel="fasort"><option value="war" ${ui.faSort === 'war' ? 'selected' : ''}>가치순</option><option value="ovr" ${ui.faSort === 'ovr' ? 'selected' : ''}>능력치순</option><option value="age" ${ui.faSort === 'age' ? 'selected' : ''}>나이순</option></select></div>
      <div class="small muted" style="margin:6px 0">${rule} FA 등급·보상·계약금·경쟁 입찰이 없으며, 개막 전 FA 마감 때 AI 구단이 빈 자리를 채웁니다.${aq ? '' : ` 일반 외국인 3명의 연봉 합산 상한은 56억(400만 달러)이고 지금 남은 여유는 ${L.foreignRoom(t).toFixed(1)}억입니다. 시즌 중 교체 영입은 연 ${L.fSwapInfo().max}회까지입니다(사용 ${L.fSwapInfo().n}회).`}</div>
      ${list.length ? `<div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">직전 구단</th><th class="l">세부 능력</th><th>요구 연봉</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">시장에 나온 선수가 없습니다.</p>'}</div>`;
  }
  /* ---------------- 라이벌전 · 이 순간 · 경기 되짚기 ---------------- */
  function rivalBlock(opp) {
    const ri = L.rivalInfo(opp); if (!ri) return ''; const r = ri.rec;
    return `<div class="rivalbox"><div class="small">${esc(ri.desc)}</div><div class="small" style="margin-top:4px">올해 맞대결 <b>${r.w}승 ${r.l}패${r.d ? ' ' + r.d + '무' : ''}</b>${r.last.length ? ' · 최근 ' + r.last.map(x => `${x.my}:${x.op}${x.my > x.op ? '승' : x.my < x.op ? '패' : '무'}`).join(', ') : ''}${ri.hist.length ? '<br>지난 시즌 ' + ri.hist.map(h => `${h.y} ${h.w}승 ${h.l}패${h.d ? ' ' + h.d + '무' : ''}`).join(' · ') : ''}</div></div>`;
  }
  const MOM = {
    loaded: { bat: ['만루, 모든 것이 이 타석에 걸렸습니다.', '베이스가 가득 찼습니다. 한 번의 스윙이 경기를 바꿀 수 있습니다.', '만루의 압박 속에 {n}이(가) 타석에 섭니다.'], fld: ['만루 위기, 마운드의 {n}에게 시선이 쏠립니다.', '한 점도 내줄 수 없는 순간입니다. {n}의 승부구가 중요합니다.'] },
    tie9: { bat: ['9회 동점 — 한 점이 승부를 가릅니다.', '끝내기가 걸린 순간입니다.'], fld: ['9회 동점, 실점하면 경기가 끝납니다.', '한 점도 안 됩니다. {n}이(가) 마운드를 지킵니다.'] },
    twoout: { bat: ['2사 득점권 — 마지막 기회입니다.', '아웃카운트 하나 남았습니다. 한 방이 필요합니다.'], fld: ['2사 득점권, 이닝을 끝낼 마지막 한 개입니다.', '아웃카운트 하나만 더 잡으면 됩니다.'] },
    risp: { bat: ['득점권 — 한 방이 필요한 순간입니다.', '주자가 득점권에 있습니다. 타선의 집중력이 중요합니다.'], fld: ['득점권 위기, 실점을 막아야 합니다.', '주자를 홈에 보내지 않는 것이 관건입니다.'] },
    lead1: { bat: ['박빙의 승부가 이어집니다.', '한 점 차 승부, 작은 선택이 결과를 가를 수 있습니다.'], fld: ['한 점 승부, 한 구 한 구가 무겁습니다.', '박빙의 상황에서 마운드의 집중력이 필요합니다.'] },
    save: { bat: ['마지막 반격의 기회입니다.'], fld: ['승리를 지켜야 하는 9회입니다.', '세이브 상황입니다.'] }
  };
  function momentCard(g, us, myBat, myField) {
    const m = L.momentInfo(g, us); if (!m) return ''; const b = g.bases, bt = P(g.batter.id), pp = P(g.pitcher.id), side = myBat ? 'bat' : 'fld', subj = myBat ? bt : pp; if (!subj) return '';
    const pool = (MOM[m.kind] || MOM.lead1)[side], idx = (m.inn * 7 + m.outs * 3 + m.runners + (m.top ? 1 : 0)) % pool.length, line = pool[idx].replace('{n}', esc(subj.ko));
    const baseTxt = m.runners === 3 ? '만루' : m.runners === 0 ? '주자 없음' : [b[0] ? '1루' : '', b[1] ? '2루' : '', b[2] ? '3루' : ''].filter(Boolean).join('·') + ' 주자';
    const opp = us === 'home' ? 'away' : 'home', ls = L.liveScore(g), sc = `${ls[us]}:${ls[opp]}`, dtxt = m.diff === 0 ? '동점' : m.diff > 0 ? `${m.diff}점 리드` : `${-m.diff}점 열세`;
    let facts = ''; const fm = formOf(subj);
    if (myBat) { const pas = g.log.filter(x => x.k === 'PA' && x.b === g.batter), ab = pas.filter(x => !['BB', 'HBP', 'IBB', '번트'].includes(x.e)).length, h = pas.filter(x => ['1B', '2B', '3B', 'HR', '번트안타'].includes(x.e)).length;
      facts = `${esc(subj.ko)} ${ovrChip(L.ovr(subj))} · 올 시즌 ${batLine(subj.id)}${fm ? ' · 최근 ' + esc(fm.txt) : ''} · 오늘 ${ab}타수 ${h}안타`; }
    else { const tr = ui.live.ctx.E.tracking().pit[g.pitcher.id] || { outs: 0, R: 0, K: 0 }; facts = `${esc(subj.ko)} ${ovrChip(L.ovr(subj))} · 올 시즌 ${pitLine(subj.id)}${fm ? ' · 최근 ' + esc(fm.txt) : ''} · 오늘 ${Math.floor(tr.outs / 3)}이닝 ${tr.R}실점 ${tr.K}K`; }
    return `<div class="card momentcard"><div class="small muted">${m.inn}회${m.top ? '초' : '말'} ${m.outs}사 · ${baseTxt} · ${sc} (${dtxt})</div><div class="mline">${line}</div><div class="small">${facts}</div></div>`;
  }
  function reviewHtml(rv) {
    if (!rv || !rv.length) return ''; const good = rv.filter(x => x.v === 'good').length, bad = rv.filter(x => x.v === 'bad').length;
    return `<div class="card" style="margin-top:8px"><b>내 결정 되짚기</b> <span class="muted small">잘 풀림 ${good} · 아쉬움 ${bad} · 보통 ${rv.length - good - bad}</span>${rv.map(x => `<div class="rvrow ${x.v}"><span class="rvmark">${x.v === 'good' ? '✔' : x.v === 'bad' ? '✘' : '–'}</span><span>${esc(x.text)}</span></div>`).join('')}<div class="small muted" style="margin-top:4px">결과는 한 경기의 우연이 크므로 결정의 옳고 그름을 단정하지는 않습니다.</div></div>`;
  }
  /* ---------------- 분위기 · 평판 ---------------- */
  function screenMood() {
    const rp = L.reputation(), bd = L.clubhouseBoard(), cap = L.captain(), fa = v => { v = Math.round((v || 0) * 10) / 10; return (v > 0 ? '+' : '') + v; }, chip = id => { const p = P(id); return `<button class="sm" data-act="player" data-a="${id}">${esc(p.ko)} <span class="muted">${fa(p.loyAdj)}</span></button>`; };
    return `<div class="card"><div class="row"><h2 style="margin:0">감독 평판</h2><span class="sp"></span><span class="chip ${rp.score >= 55 ? 'in' : rp.score < 40 ? 'bad' : ''}">${esc(rp.tag)}</span></div>
      <div class="gauge ${rp.score >= 60 ? 'good' : rp.score >= 40 ? 'mid' : 'low'}" style="margin:8px 0"><span class="gbar" style="width:160px"><i style="width:${rp.score}%"></i></span><span class="gtxt">${rp.score}</span></div>
      ${rp.items.length ? rp.items.map(x => `<div class="row small"><span>${esc(x[0])}</span><span class="sp"></span><b class="${x[1] >= 0 ? 'pos' : 'neg'}">${x[1] > 0 ? '+' : ''}${x[1]}</b></div>`).join('') : '<div class="small muted">아직 쌓인 기록이 없습니다. 약속을 지키고 면담·협상을 잘 마무리하면 오릅니다.</div>'}
      <div class="small muted" style="margin-top:6px">평판은 협상·면담 호감도의 시작값에 최대 ±5 영향을 줍니다(경제 수치에는 영향 없음).</div></div>
      <div class="card"><h2>선수단 분위기</h2><div class="kpis"><div class="kpi"><div class="l">평균 컨디션 보정</div><div class="v">${bd.club.mood >= 0 ? '+' : ''}${bd.club.mood}</div></div><div class="kpi"><div class="l">불만 선수</div><div class="v">${bd.unhappy.length}명</div></div><div class="kpi"><div class="l">주장</div><div class="v" style="font-size:15px">${cap ? esc(cap.ko) : '없음'}</div></div></div>
      ${bd.unhappy.length ? `<div style="margin-top:8px"><b class="small">마음이 불편한 선수</b><div class="chips">${bd.unhappy.map(chip).join('')}</div></div>` : ''}${bd.happy.length ? `<div style="margin-top:8px"><b class="small">구단에 만족하는 선수</b><div class="chips">${bd.happy.map(chip).join('')}</div></div>` : ''}</div>
      <div class="card"><h2>동료 관계</h2><div class="small muted">친한 동료(선수당 최대 3명)는 한 선수의 일에 함께 영향을 받습니다. 같은 선수는 10일에 한 번만 받습니다.</div>
      <details class="small" style="margin-top:6px"><summary>관계 종류 · 발동 조건 · 효과 보기</summary><div style="margin-top:6px"><b>관계</b>: 같은 학교 동기, 같은 학교 선후배, 같은 해 같은 구단 지명 동기, 우리 구단이 같은 해 지명한 동기, 멘토-제자(경력 8년·31세 이상 베테랑 ↔ 24세 이하, 같은 포지션)<br><b>긍정 사건</b>: 면담 성공, 재계약·비FA 다년계약, 약속 이행, 1군 승격, 기록 달성, 시즌 활약, 부상 복귀<br><b>부정 사건</b>: 면담 실패, 약속 불이행, 방출(근속 3년 이상 또는 OVR 50 이상), 트레이드로 내보냄, 장기 부상(30일 이상)<br><b>효과</b>: 충성도 보정 ±1(주인공이 리더형이면 ×1.5, 받는 선수가 소심형이면 ×1.3, 자유분방형이 부정 영향을 받으면 ×1.3)과 컨디션 ±1(긍정 8일·부정 10일)<br><b>회복</b>: 충성도 보정은 30일마다 1, 새 시즌에 2씩 0 쪽으로 돌아옵니다.</div></details>
      ${L.bondPreview().length ? `<div style="margin-top:8px"><b class="small">이 선수에게 일이 생기면 영향받는 동료</b>${L.bondPreview().map(x => `<div class="small" style="margin-top:4px"><button class="linkbtn" data-act="player" data-a="${x.p.id}"><b>${esc(x.p.ko)}</b></button> → ${x.b.map(b => `${esc(P(b.id).ko)} <span class="muted">(${esc(b.why)})</span>`).join(' · ')}</div>`).join('')}</div>` : ''}
      ${bd.groups.length ? bd.groups.map(g => `<div style="margin-top:8px"><b>${esc(g.label)}</b> <span class="muted small">${g.members.length}명 · 분위기 ${g.mood >= 0 ? '+' : ''}${g.mood}</span><div class="chips">${g.members.map(chip).join('')}</div></div>`).join('') : '<div class="small muted" style="margin-top:6px">뚜렷한 학교·입단 동기 그룹이 없습니다.</div>'}
      ${bd.log.length ? `<div style="margin-top:10px"><b class="small">최근 영향</b>${bd.log.map(x => `<div class="small muted">${L.dateStr(x.d)} · ${esc(x.text)}</div>`).join('')}</div>` : ''}</div>`;
  }
  /* ---------------- FA 시장 속보 ---------------- */
  function faFeedCard() {
    const S = L.S, all = S.faFeed || [], fd = all.filter(x => (x.y === S.year || x.y === S.year - 1) && (x.kind === 'bid' || x.mine)).slice(0, 10); if (!fd.length) return '';   // 계약 완료는 위쪽 FA 로그에 이미 나오므로 입찰 소식과 내 관심 선수 소식만 보여준다
    const seen = ui.faSeen === undefined ? 0 : ui.faSeen, fresh = Math.max(0, all.length - seen); ui.faSeen = all.length;
    return `<div class="card"><div class="row"><h2 style="margin:0">시장 속보</h2>${fresh ? `<span class="chip in">새 소식 ${Math.min(fresh, 10)}</span>` : ''}</div>${fd.map(x => `<div class="small feeditem ${x.kind}${x.mine ? ' mine' : ''}"><span class="muted">${S.faMkt ? L.faDateStr(x.d) : ''}</span> ${x.kind === 'sign' ? '✅' : '📣'} ${esc(x.text)}${x.mine ? ' <span class="chip in">관심</span>' : ''}</div>`).join('')}</div>`;
  }
  /* ---------------- 구단 역사 · 도전 과제 · 커리어 ---------------- */
  function histPanel() {
    const h = L.clubHistory(); const rows = h.rows.slice(0, 20).map(r => `<tr><td class="l">${r.year}</td><td>${r.rank}위</td><td>${r.w}승 ${r.l}패${r.d ? ' ' + r.d + '무' : ''}</td><td class="l">${r.champ ? '<span class="chip ks">우승</span>' : r.runner ? '<span class="chip in">준우승</span>' : r.rank <= 5 ? '<span class="chip">가을야구</span>' : ''}</td></tr>`).join('');
    return `<div class="card"><h2>${KO[U()]} 구단 역사</h2><div class="kpis"><div class="kpi"><div class="l">우승</div><div class="v">${h.titles}회</div></div><div class="kpi"><div class="l">준우승</div><div class="v">${h.runners}회</div></div><div class="kpi"><div class="l">가을야구</div><div class="v">${h.post}회</div></div></div>${rows ? `<div class="tablewrap"><table><thead><tr><th class="l">시즌</th><th>순위</th><th>성적</th><th class="l">비고</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="small muted" style="margin-top:6px">완료된 시즌이 아직 없습니다. 이 게임에서 치른 시즌이 쌓입니다.</div>'}</div>
      <div class="card"><h2>명예의 전당</h2>${h.hof.length ? h.hof.map(x => `<div class="stl"><span class="d">${x.y}</span><span><b>${esc(x.name)}</b> <span class="muted small">${esc(x.pos)} · 근속 ${x.tn}년${x.summary ? ' · ' + esc(x.summary) : ''}${x.awards.length ? ' · ' + esc(x.awards.join(', ')) : ''}</span></span></div>`).join('') : '<div class="small muted">우리 구단에서 6년 이상 뛰었거나 시상 경력이 있는 선수가 은퇴하면 헌액됩니다.</div>'}</div>
      <div class="card"><h2>구단 수상 기록</h2>${h.awards.length ? h.awards.slice(0, 30).map(x => `<div class="stl"><span class="d">${x.y}</span><span><b>${esc(x.label)}</b> ${esc(x.name)} <span class="muted small">${esc(x.txt || '')}</span></span></div>`).join('') : '<div class="small muted">아직 없습니다.</div>'}</div>`;
  }
  function chalPanel() {
    const S = L.S, cs = L.challenges(), done = (S.chalDone || []).slice().reverse();
    return `<div class="card"><h2>${S.year} 시즌 도전 과제</h2><div class="small muted">시즌 목표와 별개의 기록 과제입니다(보상은 업적 기록, 경제 수치 영향 없음). 시즌 종료 시 달성이 확정됩니다.</div>${cs.map(c => `<div class="chal ${c.done ? 'done' : ''}"><div class="row"><b>${c.done ? '🏅 ' : ''}${esc(c.label)}</b><span class="sp"></span><span class="small muted">${Math.min(c.cur, c.goal)}/${c.goal}</span></div><div class="small muted">${esc(c.desc)}</div><div class="gauge ${c.done ? 'good' : 'mid'}"><span class="gbar" style="width:100%"><i style="width:${Math.min(100, Math.round(c.cur / c.goal * 100))}%"></i></span></div></div>`).join('')}</div>
      <div class="card"><h2>달성 업적</h2>${done.length ? done.map(x => `<div class="stl"><span class="d">${x.y}</span><span>🏅 ${esc(x.label)}</span></div>`).join('') : '<div class="small muted">아직 달성한 업적이 없습니다.</div>'}</div>`;
  }
  function careerPanel(p) {
    const c = L.careerOf(p), o = c.origin, isB = p.type === 'B';
    const rows = c.seasons.slice().reverse().map(x => `<tr><td class="l">${x.y}</td><td class="l">${KO[x.t] || x.t}</td>${x.k === 'B' ? `<td>${x.PA}</td><td>${x.avg.toFixed(3).slice(1)}</td><td>${x.HR}</td><td>${x.RBI}</td><td>${x.ops.toFixed(3)}</td>` : `<td>${Math.floor(x.outs / 3)}${x.outs % 3 ? '.' + x.outs % 3 : ''}</td><td>${x.ra9.toFixed(2)}</td><td>${x.K}</td><td>${x.BB}</td><td>${x.HR}</td>`}</tr>`).join('');
    const head = isB ? '<th>타석</th><th>타율</th><th>HR</th><th>타점</th><th>OPS</th>' : '<th>이닝</th><th>RA9</th><th>K</th><th>BB</th><th>HR</th>';
    return `${o ? `<div class="small">${o.y ? o.y + '년 ' : ''}${esc(o.school || '')} ${o.univ ? '(대졸)' : o.school ? '(고졸)' : ''} ${o.kind ? '· ' + esc(o.kind) : ''}${o.pick ? ' ' + o.pick + '순위' : ''}${o.deb ? ' · 1군 데뷔 ' + esc(o.deb) : ''}</div>` : ''}
      <div class="card" style="margin:8px 0"><b>시즌 기록</b>${rows ? `<div class="tablewrap"><table><thead><tr><th class="l">시즌</th><th class="l">팀</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="small muted">이 게임에서 완료된 시즌 기록이 아직 없습니다(시즌이 끝날 때마다 쌓입니다).</div>'}${c.ovrHist.length ? `<div class="small muted" style="margin-top:4px">종합 능력치 추이: ${c.ovrHist.map(x => `${x.y} ${x.o}`).join(' → ')}</div>` : ''}</div>
      ${c.awards.length ? `<div class="card" style="margin:8px 0"><b>수상</b>${c.awards.map(x => `<div class="small">${x.y} · <b>${esc(x.label)}</b> ${esc(x.txt || '')}</div>`).join('')}</div>` : ''}
      <div class="card" style="margin:8px 0"><b>계약 이력</b>${c.contracts.length ? c.contracts.slice().reverse().map(x => `<div class="small">${x.y} · ${esc(x.kind)} · ${x.years}년 연봉 ${x.salary}억${x.bonus ? ' + 계약금 ' + x.bonus + '억' : ''} (총 ${x.total}억)${KO[x.team] ? ' · ' + KO[x.team] : ''}</div>`).join('') : '<div class="small muted">기록된 계약이 없습니다(현재 계약은 계약·정보 탭).</div>'}</div>
      <div class="card" style="margin:8px 0"><b>약속과 면담</b>${c.promise ? `<div class="small">진행 중인 약속: <b>${esc(c.promise.label)}</b> (${c.promise.y}년)</div>` : ''}<div class="small muted">지킨 약속 ${c.kept}건 · 깨진 약속 ${c.broken}건</div>${c.notes.length ? c.notes.slice().reverse().map(x => `<div class="small">${x.y} ${L.dateStr(x.d)} · ${esc(x.t)}</div>`).join('') : '<div class="small muted">남은 기록이 없습니다.</div>'}</div>
      ${c.bonds.length ? `<div class="card" style="margin:8px 0"><b>친한 동료</b><div class="chips">${c.bonds.map(b => `<button class="sm" data-act="player" data-a="${b.id}">${esc(P(b.id).ko)} <span class="muted">${esc(b.why)}</span></button>`).join('')}</div></div>` : ''}`;
  }
  /* ---------------- 협상 테이블 · 면담 ---------------- */
  const NEG_KIND = { fa: 'FA 계약', foreign: '외국인 선수 계약', resign: '재계약', extend: '비FA 다년계약', meeting: '면담' };
  const negMoodBar = (v, d0) => { const lv = v >= 60 ? 'good' : v >= 35 ? 'mid' : 'low', dd = Math.round(v - d0); return `<span class="gauge ${lv}"><span class="gbar"><i style="width:${Math.max(3, v)}%"></i></span><span class="gtxt">호감도 ${Math.round(v)}${dd ? ` (${dd > 0 ? '+' : ''}${dd})` : ''}</span></span>`; };
  function negPanelOffer(n, p) {
    L._negRangeSync(n);   // 호감도가 바뀌면 선수 기대 연봉 범위도 함께 갱신
    const tm = L._negTerms(p, n.kind), inn = ui.negIn || L.negBest(n.id), y = inn.years, bon = inn.bonus || 0, tot = Math.round((bon + inn.salary * y) * 10) / 10, per = Math.round(tot / y * 100) / 100, bi = n.kind === 'fa' && L.S.faMkt ? L.faBidInfo(n.id) : null;
    const opts = Array.from({ length: tm.maxY - tm.minY + 1 }, (_, i) => tm.minY + i).map(v => `<option value="${v}" ${v === y ? 'selected' : ''}>${v}년</option>`).join('');
    const bo = n.budgetOffer ? L.boardOdds(n.id, n.budgetOffer) : null, board = bo && bo.ok && bo.need > 0 ? `<div class="neg-counter"><span>${bo.star ? '<span class="chip in">프랜차이즈 스타</span> 충성도 ' + bo.star.v + ' — 이사회 특별 승인 가능 · ' : ''}예산 ${bo.need.toFixed(1)}억 초과 — 이사회 설득 성공 확률 <b>${Math.round(bo.prob * 100)}%</b>${bo.star ? ' <span class="muted small">(신뢰도 하락 절반 · 시도 ' + bo.max + '회까지)</span>' : ''}</span><button class="sm primary" data-act="negBoard" ${bo.left > 0 ? 'disabled' : ''}>이사회 설득</button></div>` : '';
    const cnt = board + (n.counter ? `<div class="neg-counter"><b>선수 역제안</b> ${n.counter.years}년 · 연봉 ${n.counter.salary}억${n.counter.bonus ? ' + 계약금 ' + n.counter.bonus + '억' : ''}<button class="sm primary" data-act="negCounter">수락하고 체결</button></div>` : '');
    return `${cnt}<div class="neg-offer"><label>기간 <select data-sel="negyears" ${tm.maxY === tm.minY ? 'disabled' : ''}>${opts}</select></label>
      <label>연봉(억) <input class="num" type="number" step="0.1" min="0.3" data-sel="negsal" value="${inn.salary}"></label>
      ${tm.bonusOK && y >= 2 ? `<label>계약금(억) <input class="num" type="number" step="0.1" min="0" data-sel="negbon" value="${bon}"></label>` : ''}</div>
      <div class="small muted">총 ${tot}억 · 연평균 <b>${per}</b>억${n.range && n.range[1] > 0 ? ` · 선수 기대 연 ${n.range[0].toFixed(1)}~${n.range[1].toFixed(1)}억(추정)` : ''}${tm.cap ? ` · 연봉 상한 ${tm.cap}억` : ''}${bi && bi.n ? ` · 경쟁 입찰 ${bi.n}곳(최고 연 ${bi.best ? bi.best.per.toFixed(1) : '-'}억)` : ''} · FA 여유자금 ${L.faRoom(U()).toFixed(1)}억</div>
      <div class="row"><button class="primary" data-act="negSend">이 조건으로 제안</button><button class="sm" data-act="negFill" title="호감도를 반영한 요구액을 막 넘는 조건을 채웁니다">요구 충족 조건 채우기</button></div>`;
  }
  function negPanelCards(n, p, meet) {
    const cs = meet ? L.meetCards() : L.negCards(), ro = L._roleOptions(p);
    return `<div class="neg-cards">${cs.map(c => `<div class="neg-card ${c.disabled ? 'off' : ''}"><div><b>${esc(c.label)}</b><div class="small muted">${esc(c.hint)}</div></div>${(c.k === 'role' || c.k === 'promise') && !c.disabled ? `<select data-sel="negrole">${ro.map(o => `<option value="${o[0]}" ${ui.negRole === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>` : ''}<button class="sm ${c.disabled ? '' : 'primary'}" data-act="${meet ? 'meetCard' : 'negCard'}" data-a="${c.k}" ${c.disabled ? 'disabled' : ''}>${c.disabled ? esc(c.disabled) : '사용'}</button></div>`).join('')}</div>`;
  }
  function negView() {
    const n = L && L.S.neg; if (!n || !ui.negOpen) return ''; const p = P(n.id); if (!p) return ''; const meet = n.kind === 'meeting', open = n.state === 'open';
    const chat = n.log.map(x => x.who === 'sys' ? `<div class="nb sys ${x.k || ''}">${esc(x.text)}</div>` : x.who === 'me' ? `<div class="nb me"><span class="nw">감독</span>${esc(x.text)}</div>` : `<div class="nb them"><span class="nw">${x.who === 'ag' ? '에이전트' : esc(p.ko)}</span>${esc(x.text)}</div>`).join('');
    const pr = !meet ? `<div class="small">선수 우선순위 ${n.prios.map(k => n.revealed.includes(k) ? `<span class="chip in">${esc(L.negPrioName(k))}</span>` : '<span class="chip">???</span>').join(' ')}</div>` : '';
    const fac = n.factors && n.factors.length ? `<details class="small"><summary>호감도 요인</summary>${n.factors.map(f => `<div class="row" style="gap:6px"><span>${esc(f[0])}</span><span class="sp"></span><b class="${f[1] >= 0 ? 'pos' : 'neg'}">${f[1] > 0 ? '+' : ''}${f[1]}</b></div>`).join('')}</details>` : '';
    const dots = `<span class="rdots" aria-label="라운드">${Array.from({ length: n.max }, (_, i) => `<i class="${i < n.round ? 'on' : ''}"></i>`).join('')}</span>`;
    let panel, negTabs = '';
    if (open) {
      const tab = ui.negTab || (meet ? 'cards' : 'offer');
      negTabs = meet ? '' : `<div class="tabs" role="tablist" style="margin:0"><button role="tab" aria-selected="${tab === 'offer'}" data-act="negTab" data-a="offer">조건 제안</button><button role="tab" aria-selected="${tab === 'cards'}" data-act="negTab" data-a="cards">대화 카드</button></div>`;
      panel = `
        ${tab === 'offer' && !meet ? negPanelOffer(n, p) : negPanelCards(n, p, meet)}
        <div class="row"><button class="sm" data-act="${meet ? 'meetEnd' : 'negLeave'}">${meet ? '면담 마무리' : '협상 종료(결렬)'}</button></div>`;
    } else {
      const sign = n.state === 'signed' || n.state === 'done';
      panel = `<div class="neg-result ${n.state === 'broke' ? 'bad' : 'good'}"><b>${n.state === 'signed' ? '계약 체결' : n.state === 'done' ? '면담 종료' : '협상 종료'}</b><div class="small">${meet ? esc(n.msg || '') : n.state === 'signed' ? `${n.final.years}년 · 연봉 ${n.final.salary}억${n.final.bonus ? ' + 계약금 ' + n.final.bonus + '억' : ''}` : '선수는 시장에 남아 있습니다. 며칠 뒤 다시 협상할 수 있습니다.'}${n.evMsg ? '<br>' + esc(n.evMsg) : ''}</div></div><div class="row"><button class="primary" data-act="negDone">닫기</button></div>`;
    }
    return `<div class="neg-bg"><div class="negwin" role="dialog" aria-label="협상 테이블" data-stop="1"><div class="neg-head"><div class="row" style="flex-wrap:nowrap"><button class="sm" data-act="negExit" aria-label="목록으로 돌아가기">← 돌아가기</button><b style="flex:1;text-align:center;min-width:0">${esc(p.ko)}</b><span class="chip in">${n.kind === 'foreign' && p.aq ? '아시아쿼터 선수 계약' : NEG_KIND[n.kind]}</span></div>
      <div class="row" style="justify-content:center;gap:6px"><span class="chip">${pos(p)}</span><span class="chip">${p.age}세</span>${foreignOvr(p)}${L.hiddenForeign(p) ? '' : moodChip(p) + traitChip(p)}</div>
      <div class="row" style="justify-content:space-between">${negMoodBar(n.mood, n.mood0)}<span class="small muted">${meet ? TOPIC_KO[n.topic] || '면담' : `${open ? `라운드 ${Math.min(n.round + 1, n.max)}/${n.max}` : '종료'}`} ${dots}</span></div>${pr}${fac}</div>
      <div class="neg-chat" aria-live="polite">${chat}</div>${negTabs}<div class="neg-panel">${panel}</div></div></div>`;
  }
  function fslotSheet() {
    const id = ui.fslot; if (!id || !L) return ''; const p = P(id); if (!p || p.team !== 'FA') { ui.fslot = null; return ''; }
    const mine = L.foreignOf(U()).filter(x => !!x.aq === !!p.aq);
    const rows = mine.map(x => { L._replacing = x.id; const okRep = L.foreignOK(U(), p); L._replacing = null; const rc = L.releaseCost(x.id); return `<button data-act="fslotPick" data-a="${p.id}|${x.id}" ${okRep ? '' : 'disabled'} style="width:100%;display:flex;gap:8px;align-items:center;text-align:left;min-height:52px;margin-top:6px"><span style="flex:1"><b>${esc(x.ko)}</b> <span class="muted small">${pos(x)} · ${x.age}세 · 연봉 ${money(x.contract.salary)}</span><div class="small muted">${okRep ? `방출 위약금 약 ${rc.total}억` : '이 선수를 내보내도 포지션 규정상 영입할 수 없습니다'}</div></span>${ovrChip(L.ovr(x))}</button>`; }).join('');
    return `<div class="sheet-bg" data-act="fslotClose"><div class="sheet" data-stop="1" role="dialog" aria-label="외국인 교체"><div class="grabber"></div><h2>${esc(p.ko)} 계약 — 어느 선수와 교체할까요?</h2><div class="small muted">${p.aq ? '아시아쿼터 선수는 1명까지입니다.' : '일반 외국인 선수는 3명까지이고 같은 포지션 3명은 안 됩니다.'} 합의되면 선택한 선수와의 계약을 해지(방출)하고 위약금을 지급합니다. 협상이 결렬되면 계약 해지는 없습니다.</div>${rows || '<p class="muted">교체할 수 있는 선수가 없습니다.</p>'}<button style="width:100%;min-height:44px;margin-top:8px" data-act="fslotClose">취소</button></div></div>`;
  }
  function negSync() { const n = L.S.neg; if (n && n.offer && (n.kind === 'fa') && P(n.id).team === 'FA') (ui.faIn = ui.faIn || {})[n.id] = Object.assign({}, n.offer); }   // 협상에서 마지막으로 제시한 조건을 제시 화면 입력칸에 이어 둔다
  function negBackTo() { const bk = ui.negBack; ui.negBack = null; if (bk) { ui.screen = bk.screen; ui.market = bk.market; ui.faTab = bk.faTab; if (bk.modal && P(bk.modal)) ui.modal = bk.modal; } render(); if (bk) window.scrollTo(0, bk.scroll); }
  const TOPIC_KO = { grievance: '출전 기회 불만', request: '이적 요청', slump: '부진 상담', checkin: '일반 면담' };
  const storyTopCard = () => { const S = L.S; if (S.phase !== 'offseason') return ''; const y = S.off ? S.off.year || S.year : S.year, top = L.storyTop(y, 5); if (!top.length) return ''; return `<div class="card"><div class="row"><h2 style="margin:0">${y} 올해의 이야기</h2><span class="sp"></span><button class="sm" data-act="go" data-a="story">전체 보기</button></div>${top.map(e => `<div class="stl"><span class="d">${e.ph === 'offseason' ? '오프시즌' : L.dateStr(e.d)}</span><span>${esc(e.text)}</span></div>`).join('')}</div>`; };
  const pressCard = () => { const pr = (L.S.press || []).slice(0, 3); if (!pr.length) return storyTopCard(); return `<div class="card"><div class="row"><h2 style="margin:0">언론·팬 반응</h2><span class="sp"></span><button class="sm" data-act="go" data-a="story">스토리</button></div>${pr.map(x => `<div class="press"><b>${esc(x.head)}</b>${x.fan ? `<div class="small muted">${esc(x.fan)}</div>` : ''}</div>`).join('')}</div>${storyTopCard()}`; };
  function screenStory() {
    const S = L.S, years = [...new Set((S.story || []).map(e => e.y).concat([S.year]))].sort((x, y) => y - x), y = ui.storyY || S.year, tab = ui.storyTab || 'top';
    const lab = e => e.ph === 'offseason' ? '오프시즌' : L.dateStr(e.d), star = i => '★'.repeat(Math.min(3, i));
    const tabs = [['top', '올해의 이야기'], ['line', '타임라인'], ['press', '언론·팬 반응'], ['chal', '도전 과제'], ['hist', '구단 역사']].map(([k, t]) => `<button role="tab" aria-selected="${tab === k}" data-act="storyTab" data-a="${k}">${t}</button>`).join('');
    let body;
    if (tab === 'top') { const top = L.storyTop(y, 8); body = top.length ? `<div class="card"><h2>${y} 시즌 하이라이트</h2>${top.map(e => `<div class="stl"><span class="d">${lab(e)}</span><span>${esc(e.text)}</span><span class="muted small">${star(e.imp)}</span></div>`).join('')}</div>` : '<div class="card muted">아직 기록된 이야기가 없습니다. 계약·트레이드·부상·연승 같은 사건이 쌓입니다.</div>'; }
    else if (tab === 'line') { const mi = ui.storyMin || 1, l = L.storyYear(y).filter(e => e.imp >= mi).reverse(); body = `<div class="chips">${[[1, '전체'], [2, '★2 이상'], [3, '★3']].map(([k, t]) => `<button class="sm" aria-pressed="${mi === k}" data-act="storyMin" data-a="${k}">${t}</button>`).join('')}</div>` + (l.length ? `<div class="card">${l.map(e => `<div class="stl"><span class="d">${lab(e)}</span><span>${esc(e.text)}</span><span class="muted small">${star(e.imp)}</span></div>`).join('')}</div>` : '<div class="card muted">기록이 없습니다.</div>'); }
    else if (tab === 'chal') body = chalPanel();
    else if (tab === 'hist') body = histPanel();
    else { const l = (S.press || []).filter(e => e.y === y); body = l.length ? `<div class="card">${l.map(e => `<div class="press"><b>${esc(e.head)}</b>${e.fan ? `<div class="small muted">${esc(e.fan)}</div>` : ''}<div class="small muted">${e.ph === 'offseason' ? '오프시즌' : L.dateStr(e.d)}</div></div>`).join('')}</div>` : '<div class="card muted">아직 기사가 없습니다.</div>'; }
    return `<div class="card"><div class="row"><h2 style="margin:0">시즌 스토리</h2><span class="sp"></span><select data-sel="storyy" aria-label="시즌">${years.map(v => `<option value="${v}" ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="tabs" role="tablist" style="margin-top:8px">${tabs}</div></div>${body}`;
  }
  /* ---------------- 시즌 중 소식(이벤트) ---------------- */
  const evIcon = { camp: '⛺', grievance: '🗣', sponsor: '🤝', promo: '🎉', board: '🏛' };
  function eventCards() {
    const open = L.eventsOpen(), warns = L.validateEntry(); if (!open.length && !warns.length) return '';
    const rows = open.map(e => { const rec = e.rec || e.def; return `<div class="ev"><div><b>${evIcon[e.type] || '📢'} ${esc(e.title)}</b> <span class="muted small">${L.dateStr(e.day)} · ${e.exp > 1e8 ? '개막 전까지 결정 · 미결정 시 변화 없음' : Math.max(0, e.exp - L.S.day) + '일 내 결정'}</span></div><div class="small" style="margin:4px 0 8px">${esc(e.text)}</div><div class="row evbtn">${e.choices.map(c => `<button class="sm ${c.k === rec ? 'primary' : ''}" data-act="evChoice" data-a="${e.id}|${c.k}" title="${esc(c.hint || '')}">${c.k === rec && open.length > 1 ? '★ ' : ''}${esc(c.label)}</button>`).join('')}</div><div class="small muted" style="margin-top:4px">${e.choices.map(c => esc(c.label.replace(/ \(.*\)$/, '')) + ': ' + esc(c.hint || '')).join(' / ')}</div></div>`; }).join('');
    return `<div class="card evcard"><div class="row"><h2 style="margin:0">할 일 <span class="chip warn">${open.length + (warns.length ? 1 : 0)}</span></h2><span class="sp"></span>${open.length ? '<button class="sm primary" data-act="inboxAll" title="★ 표시된 추천(없으면 기본) 선택으로 모두 처리">추천대로 모두 처리</button>' : ''}</div>${rows}${warns.length ? `<div class="ev"><b>⚠ 1군 엔트리 점검</b><div class="small neg" style="margin-top:4px">${warns.map(x => '• ' + esc(x)).join('<br>')}</div><div class="row" style="margin-top:6px"><button class="sm" data-act="go" data-a="roster">로스터에서 정리</button></div></div>` : ''}</div>`;
  }
  const evBanner = () => { const n = L.eventsOpen().length; return n ? `<div class="card evcard"><div class="row"><b>📢 결정이 필요한 소식 ${n}건</b><span class="sp"></span><button class="sm primary" data-act="go" data-a="home">대시보드에서 확인</button></div></div>` : ''; };
  function evHistory() {
    const done = ((L.S.events || {}).list || []).filter(e => e.status === 'done').slice(0, 6); if (!done.length) return '';
    return `<div class="card"><h2>최근 소식 처리</h2><ul class="news">${done.map(e => `<li><span class="d">${L.dateStr(e.day)}</span><span><b>${esc(e.title)}</b> — ${esc(e.result || '')}${e.auto ? ' (자동)' : ''}</span></li>`).join('')}</ul></div>`;
  }
  /* ---------------- 시즌 목표 · 가을야구 확률 · 해임 · 결산 리포트 ---------------- */
  function goalCard() {
    const S = L.S, gs = S.phase === 'offseason' ? null : L.goalStatus(); if (!gs) return '';
    const f = S.fin.teams[U()], reg = S.phase === 'regular' || S.phase === 'preseason', odds = reg && gs.played >= 10 ? L.playoffOdds(400) : null, o = odds ? odds[U()] : null;
    const row = (l, cur, ok, note) => `<tr><td class="l">${l}</td><td class="n"><b>${cur}</b></td><td>${ok === null ? '<span class="chip">시즌 전</span>' : ok ? '<span class="chip in">달성 중</span>' : '<span class="chip warn">미달</span>'}</td><td class="l small muted hm">${note}</td></tr>`;
    const risk = f.trust <= 25 ? `<div class="small neg" style="margin-top:6px">⚠ 이사회 신뢰도 ${f1(f.trust)} — 12 이하로 떨어지면 해임됩니다. 시즌 목표 달성과 흑자 운영으로 회복하세요.</div>` : '';
    return `<div class="card"><div class="row"><h2 style="margin:0">${S.year} 시즌 목표</h2><span class="muted small">이사회 신뢰도 ${f1(f.trust)}</span></div>
      <div class="tablewrap"><table><tbody>${row(`순위 ${gs.rank.goal}위 이내`, gs.played ? gs.rank.cur + '위' : '-', gs.rank.ok, `보수 ${gs.g.payRank}위 구단 기대`)}${row(`손익 ${f1(gs.profit.goal)}억 이상`, (gs.profit.cur >= 0 ? '+' : '') + f1(gs.profit.cur) + '억', gs.profit.ok, '예상 손익 기준(허용 적자 이내)')}${row(`25세 이하 ${gs.youth.goal}명 출전`, gs.youth.cur + '명', gs.youth.ok, '100타석 또는 50이닝 이상')}</tbody></table></div>
      ${o ? `<div class="kpis" style="margin-top:8px"><div class="kpi"><div class="l">가을야구(5위 이내) 확률</div><div class="v">${o.top5}%</div></div><div class="kpi"><div class="l">정규시즌 1위 확률</div><div class="v">${o.top1}%</div></div><div class="kpi"><div class="l">예상 최종 승수</div><div class="v">${o.exp}</div></div></div>` : ''}
      <div class="small muted" style="margin-top:6px">달성 시 신뢰도: 순위 목표 +3(2계단 이상 초과 +5), 육성 +2 / 순위 3계단 이상 미달 −3. 시즌 말 재정 결산과 함께 반영됩니다.</div>${risk}</div>`;
  }
  function firedModal() {
    const S = L.S, fr = S.fired; if (!fr || fr.done) return '';
    const st = L.standings(), opts = st.filter(x => x.team !== U());
    return `<div class="modal-bg"><div class="modal" data-stop="1"><h2>감독 해임</h2><p>이사회 신뢰도 ${f1(fr.trust)} — ${KO[U()]} 구단이 감독 계약을 해지했습니다. 다른 구단을 맡아 커리어를 이어가세요.</p>
      <div class="tablewrap" style="max-height:360px;overflow-y:auto"><table><thead><tr><th class="l">구단</th><th>올 시즌</th><th>선수단 보수</th><th></th></tr></thead><tbody>${opts.map(x => `<tr><td class="l">${teamTag(x.team)}</td><td class="n">${x.rank}위 ${x.w}-${x.l}</td><td class="n">${f1(L.finPay(x.team))}억</td><td><button class="sm primary" data-act="takeOver" data-a="${x.team}">부임</button></td></tr>`).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:6px">새 구단의 라인업·로테이션은 자동 편성되고 이사회 신뢰도는 55에서 시작합니다. 지금까지의 기록·소식은 유지됩니다.</div></div></div>`;
  }
  function reportCard() {
    const R = L.S.report; if (!R || R.year !== L.S.year) return '';
    const awRow = a => `<tr class="click" data-act="player" data-a="${a.id}"><td class="l"><b>${a.label.replace('골든글러브 ', '')}</b></td><td class="l">${esc(a.name)} ${teamTag(a.team in KO ? a.team : U())}</td><td class="l small">${esc(a.txt)}</td></tr>`, aw = R.awards.filter(a => !a.label.startsWith('골든글러브')).map(awRow).join(''), gg = R.awards.filter(a => a.label.startsWith('골든글러브')).map(awRow).join('');
    const mine = R.mine.map(m => `<tr class="click" data-act="player" data-a="${m.id}"><td class="l"><b>${esc(m.name)}</b></td><td class="l small">${esc(m.txt)}</td></tr>`).join('');
    const gl = R.goals.map(g => `<tr><td class="l">${esc(g.label)}</td><td class="n"><b>${esc(g.got)}</b> ${g.ok ? '<span class="chip in">달성</span>' : '<span class="chip warn">미달</span>'}${g.d ? ` <span class="${g.d >= 0 ? 'pos' : 'neg'}">${g.d > 0 ? '+' : ''}${g.d}</span>` : ''}</td></tr>`).join('');
    return `<div class="card"><h2>${R.year} 시즌 리포트</h2><div class="small muted">${KO[U()]} ${R.rank}위 (${R.w}승 ${R.l}패 ${R.d}무)${R.champion ? ' · 우승 ' + (KO[R.champion] || '') : ''} · 이사회 신뢰도 ${f1(R.trust)} (${R.goalTrust >= 0 ? '+' : ''}${R.goalTrust})</div>
      <div class="grid"><div><h3 style="margin:8px 0 4px">시즌 목표 결과</h3><div class="tablewrap"><table><tbody>${gl}</tbody></table></div><h3 style="margin:10px 0 4px">우리 팀 활약</h3><div class="tablewrap"><table><tbody>${mine}</tbody></table></div></div>
      <div><h3 style="margin:8px 0 4px">시상</h3><div class="tablewrap"><table><tbody>${aw}</tbody></table></div>${gg ? `<details open style="margin-top:8px"><summary><b>골든글러브</b> (포지션별)</summary><div class="tablewrap"><table><tbody>${gg}</tbody></table></div></details>` : ''}</div></div></div>`;
  }
  /* ---------------- 훈련 방침 · 내가 키운 선수 ---------------- */
  /* ---------------- 스카우팅 ---------------- */
  const gradeRange = e => e.lo === e.hi ? e.lo : `${e.hi}~${e.lo}`, confCls = c => c === '높음' ? 'in' : c === '낮음' ? 'warn' : '';
  const estChips = p => { const e = L.scoutEst(p); return `${ovrChip(Math.max(20, Math.min(80, Math.round(e.o))))}<span class="chip ${e.ceil >= 57 ? 'in' : ''}" title="성장 상한 추정 ${e.ceil}±${e.ceilSd}">상한 ${gradeRange(e)}</span><span class="chip ${confCls(e.conf)}" title="추정 오차 ±${e.ceilSd}">확신도 ${e.conf}</span>`; };
  const progLabel = p => p.type === 'B' ? posName[p.pos] : (p.role === 'SP' ? '선발형' : '구원형');
  function prospectRow(p, mode) {
    const e = L.scoutEst(p), w = L.scoutWatchList().find(x => x.id === p.id);
    return `<div class="pli" data-act="scoutOpen" data-a="${p.id}"><div class="pl-main"><div class="pl-top"><b>${esc(p.ko)}</b> <span class="muted small">${progLabel(p)} · ${p.age}세 · ${esc(p.pro ? p.pro.school : '')}</span></div><div class="small">${estChips(p)}</div><div class="small muted">관찰 ${e.n}회 · 추정 ${e.ceil} ± ${e.ceilSd}</div></div><div class="pl-r" data-stop="1"><button class="sm ${w ? 'primary' : ''}" data-act="scoutWatchA" data-a="${p.id}">${w ? '관심 ✓' : '관심'}</button>${w ? `<button class="sm ${w.star ? 'primary' : ''}" data-act="scoutStarA" data-a="${p.id}" aria-label="우선 관찰">${w.star ? '★' : '☆'}</button>` : ''}</div></div>`;
  }
  function screenScout() {
    const S = L.S, pr = L.ensureProspects(), scouts = L.scouts(), watch = L.scoutWatchList(), lim = L.scoutLimit();
    const cls = ui.scC || 1, all = cls === 2 ? L.prospectList2() : L.prospectList(), f = ui.scF || 'all', sk = ui.scS || 'score';
    const flt = { all: () => true, B: p => p.type === 'B', SP: p => p.type === 'P' && p.role === 'SP', RP: p => p.type === 'P' && p.role !== 'SP', univ: p => p.pro && p.pro.univ, hs: p => p.pro && !p.pro.univ, watch: p => watch.some(w => w.id === p.id) };
    const rows = all.filter(flt[f] || flt.all).map(p => ({ p, e: L.scoutEst(p) })).sort((a, b) => sk === 'unc' ? b.e.ceilSd - a.e.ceilSd : sk === 'age' ? a.p.age - b.p.age : b.e.score - a.e.score).slice(0, 60);
    const weekly = scouts.reduce((a, s) => a + L.scoutCap(s), 0), season = S.phase === 'regular', mkt = S.scoutMkt || [];
    const scRow = s => `<div class="slotrow"><div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:0"><b>${esc(s.name)}</b> <span class="muted small">${s.age}세</span></div><span class="small muted">연봉 ${s.salary}억</span><button class="sm" data-act="scoutFireA" data-a="${s.id}">해임</button></div><div class="small">고교 <b>${s.high}</b>(${L.coachGrade(s.high)}) · 대학 <b>${s.univ}</b>(${L.coachGrade(s.univ)}) · 해외 <b>${s.abroad === undefined ? 45 : s.abroad}</b> · 주 ${L.scoutCap(s)}건 관찰${s.ex ? ' · <span class="chip in">은퇴 선수 출신</span>' : ''}</div></div>`;
    const mkRow = c => `<div class="slotrow"><div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:0"><b>${esc(c.name)}</b> <span class="muted small">${c.age}세</span></div><span class="small muted">연봉 ${c.salary}억</span><button class="sm primary" data-act="scoutHireA" data-a="${c.id}" ${scouts.length >= lim ? 'disabled' : ''}>영입</button></div><div class="small">고교 <b>${c.high}</b>(${L.coachGrade(c.high)}) · 대학 <b>${c.univ}</b>(${L.coachGrade(c.univ)}) · 해외 <b>${c.abroad === undefined ? 45 : c.abroad}</b>${c.ex ? ` · <span class="chip in">우리 구단 은퇴 선수(근속 ${c.tn || '-'}년)</span>` : ''}</div></div>`;
    const chips = [['all', '전체'], ['B', '타자'], ['SP', '선발형'], ['RP', '구원형'], ['hs', '고교'], ['univ', '대학'], ['watch', '관심']].map(([k, t]) => `<button class="sm" aria-pressed="${f === k}" data-act="scoutFilter" data-a="${k}">${t}</button>`).join('');
    const sorts = [['score', '스카우트 점수'], ['unc', '불확실한 순'], ['age', '어린 순']].map(([k, t]) => `<button class="sm ${sk === k ? 'primary' : ''}" data-act="scoutSort" data-a="${k}">${t}</button>`).join('');
    const log = (S.scoutLog || []).slice(0, 5);
    return `<div class="card"><div class="row"><h2 style="margin:0">스카우팅</h2><span class="sp"></span><span class="small muted">${cls === 2 ? S.year + 1 : S.year} 드래프트 후보 ${all.length}명(가상 선수)</span></div>
      <div class="kpis"><div class="kpi"><div class="l">스카우트</div><div class="v">${scouts.length}/${lim}</div></div><div class="kpi"><div class="l">주간 관찰</div><div class="v">${weekly}건</div></div><div class="kpi"><div class="l">관심 목록</div><div class="v">${watch.length}명</div></div></div>
      <div class="small muted" style="margin-top:6px">스카우트를 고용하고 관심 목록에 후보를 올리면 시즌 중 매주 관찰해 성장 상한 추정의 오차가 줄어듭니다. 같은 스카우트가 여러 번 봐도 오차에는 바닥이 있고, 스카우트가 여러 명일수록 더 정확해집니다. 진짜 능력은 바뀌지 않으며 추정만 정교해집니다. 후보는 이 게임이 만든 가상 선수입니다.${season ? '' : ' 관찰은 정규시즌 중에만 진행됩니다.'}</div></div>
      <div class="card"><div class="row"><h2 style="margin:0">스카우트 조직</h2><span class="sp"></span><span class="small muted">연봉은 팀 보수에 포함</span></div>${scouts.length ? scouts.map(scRow).join('') : '<div class="small muted">고용한 스카우트가 없습니다. 아래 후보에서 영입하세요.</div>'}
        <div class="small" style="margin-top:8px"><b>영입 후보</b></div>${mkt.length ? mkt.map(mkRow).join('') : '<div class="small muted">영입 가능한 후보가 없습니다.</div>'}</div>
      <div class="card"><div class="row"><h2 style="margin:0">관심 목록</h2><span class="sp"></span><button class="sm" data-act="scoutAuto">추천으로 채우기</button></div><div class="small muted">★ 표시한 후보는 두 배로 관찰합니다. 최대 24명.</div>
        ${watch.length ? `<div class="plist">${watch.map(w => prospectRow(P(w.id))).join('')}</div>` : '<div class="small muted" style="margin-top:6px">관심 후보가 없습니다. "추천으로 채우기"는 상한이 높게 보이면서 아직 불확실한 후보를 올립니다.</div>'}
        ${log.length ? `<div class="small muted" style="margin-top:8px">최근 관찰: ${log.map(x => `${L.dateStr(x.d)} ${x.n}건`).join(' · ')}</div>` : ''}</div>
      <div class="card"><div class="row"><h2 style="margin:0">후보 풀</h2><span class="sp"></span><span class="small muted">${rows.length}명 표시</span></div><div class="chips wrap"><button class="sm ${cls === 1 ? 'primary' : ''}" data-act="scoutCls" data-a="1">${S.year} 드래프트</button><button class="sm ${cls === 2 ? 'primary' : ''}" data-act="scoutCls" data-a="2">${S.year + 1} 드래프트(내년)</button></div>${cls === 2 ? '<div class="small muted">내년 후보는 더 어려서 관찰 잡음이 25% 큽니다. 나이는 지명 시점 기준입니다.</div>' : ''}<div class="chips wrap">${chips}</div><div class="row small" style="gap:6px">정렬 ${sorts}</div><div class="plist">${rows.map(x => prospectRow(x.p)).join('') || '<div class="small muted">해당하는 후보가 없습니다.</div>'}</div></div>
      ${foreignCard()}
      <div class="card"><h2>구단별 스카우트 수준</h2><div class="small muted">재정이 큰 구단일수록 스카우트가 정확해 AI의 지명 추정이 진짜 값에 5~35% 가까워집니다(재정 순위 기반 추정). 내 구단은 위에서 고용한 스카우트와 관찰로 오차를 줄입니다.</div>${L.scoutRanking().map(x => `<div class="row small" style="margin-top:4px">${teamTag(x.t)}<span class="sp"></span>${x.q === null ? '<span class="chip in">내 구단</span>' : `<div class="gauge ${x.q >= 0.25 ? 'good' : x.q >= 0.15 ? 'mid' : 'low'}"><span class="gbar"><i style="width:${Math.round(x.q / 0.35 * 100)}%"></i></span><span class="gtxt">${x.q >= 0.25 ? '상' : x.q >= 0.15 ? '중' : '하'}</span></div>`}</div>`).join('')}</div>`;
  }
  function foreignRow(p) {
    const e = L.fEst(p), w = L.foreignWatchList().find(x => x.id === p.id);
    return `<div class="pli" data-act="scoutOpen" data-a="${p.id}"><div class="pl-main"><div class="pl-top"><b>${esc(p.ko)}</b> <span class="muted small">${p.aq ? '아시아쿼터' : '일반 외국인'} · ${p.type === 'P' ? (p.role === 'SP' ? '선발형' : '구원형') : posName[p.pos]} · ${p.age}세</span></div><div class="small">${ovrChip(Math.max(20, Math.min(80, Math.round(e.o))))}<span class="chip">±${e.sd}</span><span class="chip ${confCls(e.conf)}">확신도 ${e.conf}</span></div><div class="small muted">관찰 ${e.n}회</div></div><div class="pl-r" data-stop="1"><button class="sm ${w ? 'primary' : ''}" data-act="foreignWatchA" data-a="${p.id}">${w ? '관심 ✓' : '관심'}</button>${w ? `<button class="sm ${w.star ? 'primary' : ''}" data-act="foreignStarA" data-a="${p.id}" aria-label="우선 관찰">${w.star ? '★' : '☆'}</button>` : ''}</div></div>`;
  }
  function foreignCard() {
    const S = L.S, all = L.foreignPoolList(), f = ui.fF || 'all', fw = L.foreignWatchList(), cap = L.scouts().reduce((x, s) => x + L.scoutFCap(s), 0);
    const flt = { all: () => true, G: p => !p.aq, A: p => p.aq, P: p => p.type === 'P', B: p => p.type === 'B', watch: p => fw.some(w => w.id === p.id) };
    const rows = all.filter(flt[f] || flt.all).map(p => ({ p, e: L.fEst(p) })).sort((a, b) => b.e.o - a.e.o), shown = rows.slice(0, 40), out = L.foreignOut();
    const chips = [['all', '전체'], ['G', '일반 외국인'], ['A', '아시아쿼터'], ['P', '투수'], ['B', '타자'], ['watch', '관심']].map(([k, t]) => `<button class="sm" aria-pressed="${f === k}" data-act="foreignFilter" data-a="${k}">${t}</button>`).join('');
    return `<div class="card"><div class="row"><h2 style="margin:0">해외 후보군</h2><span class="sp"></span><button class="sm" data-act="foreignAuto">추천으로 채우기</button></div>
      <div class="small muted" style="margin:4px 0">${S.year} 시즌이 끝나면 외국인 선수 시장(일반 외국인·아시아쿼터)에 나올 가상 후보입니다. 해외 능력이 높은 스카우트가 매주 관찰하면 능력 추정의 오차가 줄고(스카우트의 해외 능력에 따라 주 1~3건), 시장에서 협상할 때 진짜 가치를 미리 알 수 있습니다. 관심 목록은 8명까지, ★는 2배로 관찰합니다. 관심 ${fw.length}명 · 주간 관찰 ${cap}건</div>
      ${all.length ? `<div class="chips wrap">${chips}</div><div class="small muted" style="margin-top:4px">실질 영입 후보 ${all.length}명 중 ${shown.length}명 표시(추정 능력 순) · 관찰·협상 대상으로 올라오지 못한 1차 모수 ${out.rows.length}명 포함 총 ${out.total}명</div><div class="plist">${shown.map(x => foreignRow(x.p)).join('') || '<div class="small muted">해당하는 후보가 없습니다.</div>'}</div><details style="margin-top:8px"><summary class="small">시장에서 빠진 선수 ${out.rows.length}명 보기</summary><div class="small muted" style="margin:4px 0">관찰 대상이었지만 신규 상한(일반 100만$·아시아쿼터 20만$)이나 자격 때문에 협상 테이블에 올라오지 못한 선수입니다(가상 선수 · ⚠ 비율은 가정).</div>${Object.entries(out.by).map(([k, v]) => `<div class="small">${esc(k)} <b>${v}명</b></div>`).join('')}<div class="small muted" style="margin-top:4px">예: ${out.rows.slice(0, 6).map(x => `${esc(x.name)}(${esc(x.lg)})`).join(' · ')}</div></details>` : '<div class="small muted">후보군이 시장에 합류했습니다. 이적시장 ▸ FA ▸ 외국인·아시아쿼터에서 조사하고 협상하세요.</div>'}</div>`;
  }
  function foreignSheet(p) {
    const e = L.fEst(p), rp = L.fReport(p), w = L.foreignWatchList().find(x => x.id === p.id), sc = L.scouts();
    return `<div class="sheet-bg" data-act="scoutClose"><div class="sheet" data-stop="1" role="dialog" aria-label="해외 후보 리포트"><div class="grabber"></div>
      <h2>${esc(p.ko)} <span class="muted small">${p.aq ? '아시아쿼터' : '일반 외국인'} · ${p.type === 'P' ? (p.role === 'SP' ? '선발형' : '구원형') : posName[p.pos]} · ${p.age}세</span></h2><div class="small muted">KBO 기록이 없는 가상 후보 · 시즌이 끝나면 외국인 선수 시장에 합류</div>
      <div class="kpis" style="margin-top:8px"><div class="kpi"><div class="l">능력 추정</div><div class="v">${Math.round(e.o)}</div><div class="small muted">± ${e.sd}</div></div><div class="kpi"><div class="l">확신도</div><div class="v"><span class="chip ${confCls(e.conf)}">${e.conf}</span></div><div class="small muted">관찰 ${e.n}회</div></div></div>
      ${rp ? `<div style="margin-top:8px"><b class="small">세부 능력(추정)</b> <span class="sub">${Object.entries(rp.sub).map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('')}</span><div class="small muted">관찰이 쌓일수록 정확해집니다(±${rp.sd}).</div></div>` : '<div class="small muted" style="margin-top:8px">관찰이 1회 이상 쌓이면 세부 능력 추정이 공개됩니다.</div>'}
      <div class="chips wrap" style="margin-top:8px">${sc.length ? sc.map(s => { const done = p.fsc && p.fsc.by[s.id] && p.fsc.by[s.id].manual; return `<button class="sm" data-act="scoutFor" data-a="${p.id}:${s.id}" ${done ? 'disabled' : ''} title="집중 조사 ${L.scoutProbeCost()}억 · 해외 ${s.abroad === undefined ? 45 : s.abroad}">${esc(s.name)} 집중 조사${done ? ' ✓' : ` (${L.scoutProbeCost()}억)`}</button>`; }).join('') : '<span class="small muted">스카우트를 고용하면 집중 조사를 할 수 있습니다.</span>'}</div>
      <div class="row" style="margin-top:10px"><button class="sm ${w ? 'primary' : ''}" data-act="foreignWatchA" data-a="${p.id}">${w ? '관심 해제' : '관심 목록에 추가'}</button>${w ? `<button class="sm ${w.star ? 'primary' : ''}" data-act="foreignStarA" data-a="${p.id}">${w.star ? '★ 우선 관찰 중' : '☆ 우선 관찰'}</button>` : ''}<button class="sm" data-act="scoutClose">닫기</button></div></div></div>`;
  }
  function scoutSheet() {
    const id = ui.scoutId; if (!id || !L) return ''; const p = P(id); if (!p || p.team !== 'DRAFT') { ui.scoutId = null; return ''; }
    if (p.fpool) return foreignSheet(p);
    const rp = L.scoutReport(p), e = rp.est, w = L.scoutWatchList().find(x => x.id === id), by = rp.by;
    return `<div class="sheet-bg" data-act="scoutClose"><div class="sheet" data-stop="1" role="dialog" aria-label="스카우팅 리포트"><div class="grabber"></div>
      <h2>${esc(p.ko)} <span class="muted small">${progLabel(p)} · ${p.age}세 · ${rp.hand}</span></h2><div class="small muted">${esc(rp.school)}${rp.univ ? '(대졸 예정)' : '(고졸 예정)'} · ${rp.cls === 2 ? '내년 드래프트 후보' : '올해 드래프트 후보'} · 가상 선수</div>
      <div class="kpis" style="margin-top:8px"><div class="kpi"><div class="l">현재 능력 추정</div><div class="v">${Math.round(e.o)}</div><div class="small muted">± ${e.oSd}</div></div><div class="kpi"><div class="l">성장 상한 추정</div><div class="v">${e.ceil}</div><div class="small muted">± ${e.ceilSd} · ${gradeRange(e)}급(${esc(L.tierLabel(e.ceil))})</div></div><div class="kpi"><div class="l">확신도</div><div class="v"><span class="chip ${confCls(e.conf)}">${e.conf}</span></div><div class="small muted">관찰 ${e.n}회</div></div></div>
      ${rp.detail ? `<div style="margin-top:8px"><div class="small"><b>강점</b> ${rp.strengths.length ? rp.strengths.map(x => `<span class="chip in">${esc(x)}</span>`).join(' ') : '<span class="muted">뚜렷하지 않음</span>'}</div><div class="small" style="margin-top:4px"><b>약점</b> ${rp.weaknesses.length ? rp.weaknesses.map(x => `<span class="chip bad">${esc(x)}</span>`).join(' ') : '<span class="muted">뚜렷하지 않음</span>'}</div><div class="small muted" style="margin-top:4px">세부 평가도 관찰이 쌓일수록 정확해집니다.</div></div>` : '<div class="small muted" style="margin-top:8px">관찰이 2회 이상 쌓이면 강점·약점이 공개됩니다.</div>'}
      ${by.length ? `<div class="small muted" style="margin-top:6px">관찰: ${by.map(x => `${esc(x.name)} ${x.n}회`).join(' · ')}</div>` : ''}
      <div style="margin-top:8px"><div class="small"><b>성격</b> ${rp.trait.known ? `<span class="chip ${rp.trait.split ? 'warn' : 'in'}">${esc(rp.trait.label)}</span> <span class="chip ${confCls(rp.trait.conf === '엇갈림' ? '낮음' : rp.trait.conf)}">신뢰 ${rp.trait.conf}</span>` : '<span class="chip">미확인</span>'}</div>${rp.trait.known ? `<div class="small muted">${rp.trait.opinions.map(o => `${esc(o.name)}: ${esc(o.label)}(정확도 ${Math.round(o.acc * 100)}%)`).join(' · ')}</div>` : '<div class="small muted">성격은 인성 조사로만 알 수 있습니다. 조사 결과는 틀릴 수 있고, 지명하면 실제 성격이 드러납니다.</div>'}
        ${L.scouts().length ? `<div class="chips wrap" style="margin-top:4px">${L.scouts().map(s => { const done = p.sc && p.sc.tr && p.sc.tr[s.id]; return `<button class="sm" data-act="scoutProbeA" data-a="${id}:${s.id}" ${done ? 'disabled' : ''} title="조사비 ${L.scoutProbeCost()}억">${esc(s.name)} 인성 조사${done ? ' ✓' : ` (${L.scoutProbeCost()}억)`}</button>`; }).join('')}</div>` : '<div class="small muted">스카우트를 고용하면 인성 조사를 할 수 있습니다.</div>'}</div>
      <div class="row" style="margin-top:10px"><button class="sm ${w ? 'primary' : ''}" data-act="scoutWatchA" data-a="${id}">${w ? '관심 해제' : '관심 목록에 추가'}</button>${w ? `<button class="sm ${w.star ? 'primary' : ''}" data-act="scoutStarA" data-a="${id}">${w.star ? '★ 우선 관찰 중' : '☆ 우선 관찰'}</button>` : ''}<button class="sm" data-act="scoutClose">닫기</button></div></div></div>`;
  }
  /* ---------------- 훈련 센터 ---------------- */
  function trainCard() {   // 2군 화면용 요약(설정은 선수단 ▸ 훈련 탭)
    const c = L.trainCfg(), fB = L.trainFocusInfo('B')[c.B.focus].n, fP = L.trainFocusInfo('P')[c.P.focus].n;
    return `<div class="card"><div class="row"><h2 style="margin:0">훈련</h2><span class="sp"></span><button class="sm primary" data-act="go" data-a="train">훈련 센터 열기</button></div><div class="small muted" style="margin-top:4px">타자 ${esc(fB)}(${L.trainIntenName(c.B.inten)}) · 투수 ${esc(fP)}(${L.trainIntenName(c.P.inten)}) · 개별 훈련 ${L.trainSlots().length}/${L.slotLimit()}명</div></div>`;
  }
  const riskChip = r => `<span class="chip ${r.level === 'high' ? 'bad' : r.level === 'mid' ? 'warn' : r.level === 'low' ? 'in' : ''}" title="${esc(r.why.join(' · ') || '기본')}">부상 위험 ${r.pct > 0 ? '+' : ''}${r.pct}%${r.level === 'high' ? ' ⚠' : ''}</span>`;
  function trainSideCard(side) {
    const cfg = L.trainCfg()[side], info = L.trainFocusInfo(side), keys = L.trainFocusKeys(side), pv = ui.trainPv || (ui.trainPv = L.trainPreview()), coach = L.trainCoach(side, cfg.focus), isB = side === 'B';
    const chips = keys.map(k => `<button class="sm ${cfg.focus === k ? 'primary' : ''}" data-act="trainSide" data-a="${side}:focus:${k}" title="${esc(info[k].tip)}">${info[k].n}</button>`).join('');
    const ints = ['light', 'normal', 'heavy'].map(v => `<button class="sm ${cfg.inten === v ? 'primary' : ''}" data-act="trainSide" data-a="${side}:inten:${v}" title="${v === 'heavy' ? '효과 ×1.5 · 부상 위험 +15%' : v === 'light' ? '효과 ×0.5 · 부상 위험 −8%' : '기본'}">${L.trainIntenName(v)}</button>`).join('');
    const p = pv[side], fields = p.fields.slice(0, 3).map(f => `${esc(L.trainFieldName(f[0]))} +${f[1]}%`).join(' · ');
    const inj = Math.round(((({ light: 0.92, normal: 1, heavy: 1.15 })[cfg.inten]) * (cfg.focus === 'cond' ? 0.88 : 1) - 1) * 100);
    return `<div class="card"><div class="row"><h2 style="margin:0">${isB ? '타자 훈련' : '투수 훈련'}</h2><span class="sp"></span><span class="small muted">${p.n}명(30세 이하)</span></div>
      <div class="small muted" style="margin:4px 0">${esc(info[cfg.focus].tip)}</div>
      <div class="small">집중 분야</div><div class="chips wrap">${chips}</div>
      <div class="small" style="margin-top:6px">훈련 강도</div><div class="chips wrap">${ints}</div>
      ${info[cfg.focus].coach ? `<div class="small" style="margin-top:8px">담당 코치 <b>${esc(coach.who)}</b> · 능력 ${coach.rating}(${coach.grade}) · 효과 ×${coach.cf.toFixed(2)}</div>` : ''}
      <div class="small muted" style="margin-top:4px">부상 위험 ${inj > 0 ? '+' : ''}${inj}% · 연말 예상 보정(시즌 끝까지 유지 시) <b class="${p.bonus > 0 ? 'pos' : ''}">+${p.bonus}%</b>${fields ? ' · 집중 능력: ' + fields : ''}</div></div>`;
  }
  function slotRow(s) {
    const p = P(s.id), side = p.type === 'P' ? 'P' : 'B', info = L.trainFocusInfo(side), r = L.trainRisk(p), keys = L.trainFocusKeys(side).filter(k => k !== 'none');
    return `<div class="slotrow"><div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:0"><button class="linkbtn" data-act="player" data-a="${p.id}"><b>${esc(p.ko)}</b></button> <span class="muted small">${pos(p)} · ${p.age}세</span> ${ovrChip(L.ovr(p))} ${riskChip(r)}</div><button class="sm" data-act="slotRemoveA" data-a="${p.id}" aria-label="개별 훈련 종료">종료</button></div>
      <div class="chips wrap">${keys.map(k => `<button class="sm ${s.focus === k ? 'primary' : ''}" data-act="slotSetA" data-a="${p.id}:focus:${k}">${info[k].n}</button>`).join('')}</div>
      <div class="chips wrap">${['light', 'normal', 'heavy'].map(v => `<button class="sm ${s.inten === v ? 'primary' : ''}" data-act="slotSetA" data-a="${p.id}:inten:${v}">${L.trainIntenName(v)}</button>`).join('')}</div>
      <div class="small muted">${p.tr && p.tr.y === L.S.year ? `개별 누적 ${Math.round(Object.values(p.tr.acc).reduce((x, y) => x + y, 0))}일(가중)` : '아직 누적 없음'}</div></div>`;
  }
  function screenTrain() {
    const S = L.S; ui.trainPv = L.trainPreview();
    const pr = L.trainPresets(), presets = pr.map(x => `<span class="presetchip"><button class="sm" data-act="trainPreset" data-a="${x.id}" title="${esc(x.tip || '내가 저장한 설정')}">${esc(x.name)}</button>${x.builtin ? '' : `<button class="sm" data-act="trainPresetDel" data-a="${x.id}" aria-label="삭제">✕</button>`}</span>`).join('');
    const slots = L.trainSlots(), lim = L.slotLimit(), cand = L.slotCandidates().filter(c => !slots.some(s => s.id === c.p.id)), all = L.players(U()).filter(p => !slots.some(s => s.id === p.id)).sort((a, b) => a.age - b.age).slice(0, 80);
    const F = L.trainForecast(), pv = ui.trainPv, risk = L.trainRiskList(), camp = L.camp(), ci = L.campInfo(), canCamp = !L.campCanSet(), log = (S.trainLog || []).slice(0, 8);
    const campSide = side => { const c = camp[side], info = L.trainFocusInfo(side), keys = L.trainFocusKeys(side).filter(k => k !== 'none'); return `<div class="small" style="margin-top:6px"><b>${side === 'B' ? '타자 캠프' : '투수 캠프'}</b></div><div class="chips wrap">${keys.map(k => `<button class="sm ${c.focus === k ? 'primary' : ''}" data-act="campSet" data-a="${side}:${k}:${c.level}" ${canCamp ? '' : 'disabled'}>${info[k].n}</button>`).join('')}</div><div class="chips wrap">${[0, 1, 2, 3].map(v => `<button class="sm ${c.level === v ? 'primary' : ''}" data-act="campSet" data-a="${side}:${c.focus}:${v}" ${canCamp ? '' : 'disabled'}>${ci.names[v]}${v ? ` · ${ci.cost[v]}억` : ''}</button>`).join('')}</div>`; };
    const coachTable = ['B', 'P'].map(side => { const info = L.trainFocusInfo(side); return L.trainFocusKeys(side).filter(k => info[k].coach).map(k => { const c = L.trainCoach(side, k); return `<tr><td class="l">${side === 'B' ? '타자' : '투수'} ${info[k].n}</td><td class="l">${esc(c.who)}</td><td>${c.rating} (${c.grade})</td><td>×${c.cf.toFixed(2)}</td></tr>`; }).join(''); }).join('');
    return `${prospectCard()}<div class="card"><div class="row"><h2 style="margin:0">훈련 센터</h2><span class="sp"></span><span class="small muted">올 시즌 누적 ${F.days}일 · 30세 이하 평균 보정 <b class="${F.avgBonus > 0 ? 'pos' : ''}">+${F.avgBonus}%</b></span></div>
      <div class="small muted" style="margin-top:4px">훈련은 시즌 중 매일 누적되어 연말 성장(양의 성장분)에 곱해집니다. 집중한 능력치는 더 빨리 크고, 담당 코치의 능력에 따라 효과가 달라집니다. 설정은 언제든 바꿀 수 있으며 되돌리기가 됩니다.</div>
      <div class="small" style="margin-top:8px">프리셋</div><div class="chips wrap">${presets}</div>
      <div class="row" style="margin-top:6px"><input id="presetName" type="text" maxlength="12" placeholder="현재 설정을 저장할 이름" style="flex:1;min-width:0"><button class="sm" data-act="trainPresetSave">저장</button></div></div>
      ${trainSideCard('B')}${trainSideCard('P')}
      <div class="card"><div class="row"><h2 style="margin:0">개별 훈련</h2><span class="sp"></span><span class="small muted">${slots.length}/${lim}명 · 육성관리 코치 능력에 따라 늘어남</span></div>
        <div class="small muted" style="margin:4px 0">팀 훈련과 별개로 선수 몇 명을 따로 지정합니다. 유망주·부진한 선수에게 적합합니다. 부상 중에는 훈련 효과가 쌓이지 않습니다.</div>
        ${slots.length ? slots.map(slotRow).join('') : '<div class="small muted">지정한 선수가 없습니다.</div>'}
        ${slots.length < lim ? `${cand.length ? `<div class="small" style="margin-top:8px">추천 후보</div><div class="chips wrap">${cand.slice(0, 5).map(c => `<button class="sm" data-act="slotAddDo" data-a="${c.p.id}" title="${esc(c.why)}">${esc(c.p.ko)} <span class="muted">${c.p.age}세 · ${esc(c.why)}</span></button>`).join('')}</div>` : ''}<div class="row" style="margin-top:8px"><select data-sel="slotpick" style="flex:1;min-width:0"><option value="">선수 선택…</option>${all.map(p => `<option value="${p.id}">${esc(p.ko)} · ${pos(p)} · ${p.age}세 · ${L.ovr(p)}</option>`).join('')}</select><button class="sm primary" data-act="slotAddPick">추가</button></div>` : ''}</div>
      <div class="card"><h2>부상 위험 경고</h2>${risk.length ? risk.map(x => `<div class="row small"><button class="linkbtn" data-act="player" data-a="${x.p.id}"><b>${esc(x.p.ko)}</b></button> <span class="muted">${x.p.age}세</span> ${riskChip(x.r)}<span class="muted">${esc(x.r.why.join(' · '))}</span></div>`).join('') : '<div class="small muted">특별히 위험한 선수가 없습니다. 33세 이상 선수에게 강한 훈련을 하면 이곳에 표시됩니다.</div>'}</div>
      <div class="card"><div class="row"><h2 style="margin:0">비시즌 캠프</h2><span class="sp"></span><span class="small muted">${canCamp ? '지금 설정 가능' : '오프시즌에만 설정'}</span></div>
        <div class="small muted" style="margin:4px 0">새 시즌 훈련 누적에 일수(소 8·중 16·대 24일)를 더합니다. 비용은 새 시즌 행사 비용으로 계상됩니다(⚠ 비용·효과 크기는 가정값).</div>${campSide('B')}${campSide('P')}
        <div class="small" style="margin-top:8px">예약 비용 <b>${L.campTotalCost()}억</b>${canCamp ? '' : ' · 시즌이 끝나면 설정할 수 있습니다.'}</div></div>
      <div class="card"><h2>코치 담당표</h2><div class="tablewrap"><table><thead><tr><th class="l">훈련</th><th class="l">담당 코치</th><th>능력</th><th>효과</th></tr></thead><tbody>${coachTable}</tbody></table></div><div class="small muted">효과 = 1 + 0.006 × (코치 능력 − 60), 0.8~1.25배. 코치는 운영 ▸ 코치진에서 영입·해임합니다.</div></div>
      <div class="card"><h2>훈련 이력</h2>${log.length ? log.map(x => `<div class="small"><span class="muted">${x.ph === 'offseason' ? '오프시즌' : L.dateStr(x.d)}</span> ${esc(x.text)}</div>`).join('') : '<div class="small muted">변경 이력이 없습니다.</div>'}</div>`;
  }
  const myChip = p => p.myFrom ? ` <span class="chip in" title="${esc(p.myFrom.y + ' · ' + p.myFrom.how)}">내가 ${p.myFrom.how.replace(/ 지명|영입/g, m => m === ' 지명' ? ' 지명' : ' 영입').slice(0, 12)}</span>` : '';
  function ovrTrend(p) {
    const h = (p.ovrHist || []).slice(); if (!h.length) return ''; const cur = L.ovr(p), pts = h.map(x => ({ y: x.y, o: x.o })); if (!pts.length || pts[pts.length - 1].o !== cur || pts[pts.length - 1].y !== L.S.year) pts.push({ y: L.S.year, o: cur });
    if (pts.length < 2) return ''; const w = 220, ht = 44, lo = Math.min(...pts.map(x => x.o)) - 2, hi = Math.max(...pts.map(x => x.o)) + 2, X = i => 6 + i * (w - 12) / (pts.length - 1), Y = o => ht - 6 - (o - lo) / Math.max(1, hi - lo) * (ht - 12);
    return `<div class="small muted" style="margin:6px 0">OVR 추이 ${pts.map(x => x.o).join(' → ')} <svg width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}" style="vertical-align:middle"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts.map((x, i) => X(i) + ',' + Y(x.o)).join(' ')}"/>${pts.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.o)}" r="3" fill="currentColor"/>`).join('')}</svg></div>`;
  }
  function risersCard() {
    const off = L.S.off; if (!off || !off.rep) return ''; const r = off.rep.prog.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 3); if (!r.length) return '';
    return `<div class="card"><h2>성장 하이라이트</h2><div class="small muted">올해 가장 크게 성장한 우리 팀 선수</div><div class="tablewrap"><table><tbody>${r.map(x => { const p = P(x.id); return `<tr class="click" data-act="player" data-a="${x.id}"><td class="l"><b>${esc(p.ko)}</b>${myChip(p)}</td><td class="n small">${p.age}세 · ${pos(p)}</td><td>${ovrChip(L.ovr(p))}</td><td class="n pos">▲${x.d}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  /* 경기 프리뷰: 다음 경기의 상대·구장·맞대결 전적·선발 매치업·관전 포인트 */
  function previewCard(g) {
    const v = L.gamePreview(g), home = g.home === U(), pf = v.pf || {}, pfTxt = pf.hr >= 1.08 ? '타자 친화' : pf.hr <= 0.85 ? '투수 친화' : '중립';
    return `<div class="card ${v.rival ? 'rivalcard' : ''}"><div class="row"><h2 style="margin:0">경기 프리뷰</h2><span class="muted small">${L.dateStr(g.day)} · ${home ? '홈' : '원정'}</span>${v.rival ? `<span class="chip warn">${esc(L.rivalName(U(), v.opp))}</span>` : ''}</div>${rivalBlock(v.opp)}
      <div style="margin:6px 0"><b>${teamTag(v.opp)}</b> <span class="muted small">${v.rank}위 · ${v.rec} · 최근 ${v.recent.join('') || '-'}</span></div>
      <div class="kpis"><div class="kpi"><div class="l">맞대결 전적</div><div class="v">${v.h2h[0]}승 ${v.h2h[1]}패${v.h2h[2] ? ' ' + v.h2h[2] + '무' : ''}</div></div><div class="kpi"><div class="l">구장</div><div class="v" style="font-size:15px">${esc(park(g.home))}</div><div class="small muted">${pfTxt} (홈런 ${pf.hr ? pf.hr.toFixed(2) : '-'})</div></div></div>
      <div class="small" style="margin-top:6px">${v.lines.map(x => '• ' + esc(x)).join('<br>')}</div>
      ${v.bats.length ? `<div class="small muted" style="margin-top:4px">상대 핵심 타자: ${v.bats.map(b => `<a data-act="player" data-a="${b.id}">${esc(b.ko)}(${b.ovr})</a>`).join(' · ')}${v.sps.length ? ' · 선발 후보: ' + v.sps.map(b => `<a data-act="player" data-a="${b.id}">${esc(b.ko)}(${b.ovr})</a>`).join(' · ') : ''}</div>` : ''}</div>`;
  }
  /* 선수 성격·주장·클럽하우스 */
  const traitChip = p => { if (p.team !== U() || p.foreign) return ''; const k = L.traitOf(p), isC = L.S.captain === p.id; return `${isC ? ' <span class="chip in" title="주장">C</span>' : ''} <span class="chip" title="성격: ${esc(L.traitName(k))}">${esc(L.traitName(k))}</span>`; };
  function clubCard() {
    const c = L.clubhouse(), cap = c.captain, cnt = c.counts;
    return `<div class="card"><div class="row"><h2 style="margin:0">클럽하우스</h2><span class="muted small">팀 컨디션 ${c.mood >= 0 ? '+' : ''}${c.mood} · 불만 선수 ${c.unhappy}명</span></div>
      <div class="small" style="margin-top:6px">주장: ${cap ? `<b>${esc(cap.ko)}</b> (${esc(L.traitName(L.traitOf(cap)))}) — 팀 컨디션 +${L.capBonus().toFixed(1)}` : '<span class="muted">없음 — 선수 상세에서 임명하세요</span>'}</div>
      <div class="small muted" style="margin-top:4px">성격 분포: ${['clutch', 'model', 'free', 'leader', 'shy'].map(k => `${esc(L.traitName(k))} ${cnt[k] || 0}`).join(' · ')}</div>
      <div class="small muted" style="margin-top:4px">승부사: 포스트시즌 컨디션 +1 · 모범생: 불만 드묾 · 자유분방/소심형: 부진에 취약 · 리더형: 면담·주장 효과 ↑. 선수 요청 트레이드·갈등 이벤트가 성격에 따라 발생합니다.</div></div>`;
  }
  function quickSheet() {
    if (!ui.quick || !L) return ''; const p = P(ui.quick); if (!p) return ''; const mine = p.team === U();
    const btn = (k, lab, cls) => `<button class="${cls || ''}" style="width:100%;min-height:48px;margin-top:8px" data-act="quickAct" data-a="${p.id}|${k}">${lab}</button>`;
    return `<div class="sheet-bg" data-act="quickClose"><div class="sheet" data-stop="1" role="dialog" aria-label="빠른 메뉴"><div class="grabber"></div><h2>${esc(p.ko)} <span class="muted small">${pos(p)} · ${p.age}세 · OVR ${L.ovr(p)}</span></h2>
      ${mine ? btn('toggle', p.active ? '2군으로 내림' : L.isInj(p) ? '부상자 명단(등록 불가)' : '1군 등록', p.active ? '' : 'primary') + (p.foreign ? '' : btn('captain', L.S.captain === p.id ? '주장 해임' : '주장 임명')) : ''}${btn('detail', '상세 보기')}<button style="width:100%;min-height:44px;margin-top:8px" data-act="quickClose">닫기</button></div></div>`;
  }
  function presetCard() {
    const pr = L.S.presets || {}, nm = pl => pl && pl.length ? pl.map(x => (P(x.id) || { ko: '?' }).ko).slice(0, 4).join('·') + '…' : '저장 없음';
    return `<div class="card"><div class="row"><h2 style="margin:0">라인업 프리셋</h2><span class="sp"></span><label class="row small" style="gap:4px"><input type="checkbox" data-act="presetOn" ${pr.on ? 'checked' : ''}>상대 선발에 따라 자동 적용</label></div>
      <div class="small muted" style="margin:4px 0 8px">현재 라인업을 상대 선발의 투구 손에 맞춰 저장해 두면, 경기 시작 때 상대 선발이 정해진 뒤 자동으로 바꿔 끼웁니다(선수가 부상·2군이면 적용 안 함).</div>
      ${[['L', '좌투 상대'], ['R', '우투 상대']].map(([h, lab]) => `<div class="row small" style="gap:6px;margin-bottom:6px"><b style="min-width:64px">${lab}</b><span class="muted" style="flex:1">${esc(nm(pr[h]))}</span><button class="sm" data-act="presetSave" data-a="${h}">현재 라인업 저장</button>${pr[h] ? `<button class="sm" data-act="presetClear" data-a="${h}">삭제</button>` : ''}</div>`).join('')}</div>`;
  }
  /* ---------------- 체력 게이지 · 교체형 콜업 · 변경 요약 · 할 일 함 ---------------- */
  const gauge = p => { if (!p || p.type !== 'P') return ''; const r = L.restInfo(p); return `<span class="gauge ${r.level}" title="남은 체력 ${r.left} · ${r.label}"><span class="gbar"><i style="width:${r.left}%"></i></span><span class="gtxt">체력 ${r.left} · ${r.label}</span></span>`; };
  function openSwap(upId, ev) { const p = P(upId); if (!p) return; if (L.isInj(p)) { toast(`${p.ko}은(는) 부상자 명단입니다.`); return; } const lk = L.lockLeft(p); if (lk > 0) { toast(`${p.ko}은(는) 2군 말소 후 10경기일이 지나야 1군에 등록할 수 있습니다. (${lk}일 남음)`); return; } ui.swap = { up: upId, ev: ev || null }; render(); }
  function swapSheet() {
    const sw = ui.swap; if (!sw || !L) return ''; const up = P(sw.up); if (!up || up.active) { ui.swap = null; return ''; }
    const open = L.players(U()).filter(p => p.active).length < ACTIVE_MAX, f = formOf(up), cands = L.downCandidates(up.id);
    const rows = cands.map(c => { const q = c.p, fm = formOf(q); return `<button data-act="swapPick" data-a="${q.id}" ${c.block ? 'disabled' : ''} style="width:100%;display:flex;gap:8px;align-items:center;text-align:left;min-height:52px;margin-top:6px"><span style="flex:1;min-width:0"><b>${esc(q.ko)}</b> <span class="muted small">${pos(q)} · ${q.age}세</span>${c.role ? ` <span class="chip warn">${c.role}</span>` : ''}${c.block ? ` <span class="chip bad">${c.block}</span>` : ''}<div class="small muted">${fm ? '최근 ' + esc(fm.txt) : '최근 기록 없음'}${q.type === 'P' ? ' · ' + gauge(q) : ''}</div></span>${ovrChip(L.ovr(q))}</button>`; }).join('');
    return `<div class="sheet-bg" data-act="swapClose"><div class="sheet" data-stop="1" role="dialog" aria-label="1군 콜업"><div class="grabber"></div>
      <h2>${esc(up.ko)} 1군 올리기 <span class="muted small">${pos(up)} · OVR ${L.ovr(up)}</span></h2><div class="small muted">${f ? '2군 최근 ' + esc(f.txt) + ' · ' : ''}누구와 교체할까요? (약한 선수·부진한 선수부터 추천)</div>
      ${open ? `<button class="primary" data-act="swapPick" data-a="none" style="width:100%;min-height:48px;margin-top:8px">교체 없이 등록 (엔트리 ${L.players(U()).filter(p => p.active).length}/${ACTIVE_MAX})</button>` : ''}
      <div style="max-height:52vh;overflow-y:auto;margin-top:4px">${rows || '<p class="muted">교체할 수 있는 1군 선수가 없습니다.</p>'}</div><button style="width:100%;min-height:44px;margin-top:8px" data-act="swapClose">취소</button></div></div>`;
  }
  function changeBar() {
    const d = L.diffSinceBase(), w = L.validateEntry().filter(x => !/^1군 엔트리/.test(x) || true); if (!d && !w.length) return '';
    const items = d ? d.up.map(p => `↑ ${esc(p.ko)} 콜업`).concat(d.down.map(p => `↓ ${esc(p.ko)} 강등`), d.ch.map(esc)) : [];
    return `<div class="card ${w.length ? 'warncard' : ''}"><div class="row"><b>변경 ${d ? d.n : 0}건</b>${w.length ? `<span class="chip warn">점검 ${w.length}</span>` : '<span class="chip in">규칙 이상 없음</span>'}<span class="sp"></span>${d ? '<button class="sm primary" data-act="chgConfirm">확정</button><button class="sm" data-act="chgRevert">전체 취소</button>' : ''}</div>
      ${items.length ? `<details style="margin-top:4px"><summary class="small">변경 내역 보기</summary><div class="small" style="margin-top:4px">${items.map(x => '• ' + x).join('<br>')}</div></details>` : ''}
      ${w.length ? `<div class="small neg" style="margin-top:4px">${w.map(x => '⚠ ' + esc(x)).join('<br>')}</div>` : ''}<div class="small muted" style="margin-top:4px">변경은 바로 적용됩니다. 확정하지 않아도 하루가 지나면 확정되며, 확정 전에는 전체 취소로 되돌릴 수 있습니다.</div></div>`;
  }
  function screenFA() {
    const S = L.S, mk = !!(S.faMkt && !S.faMkt.closed), tab = ui.faTab || 'dom';
    const all = L.faList(), cnt = { dom: all.filter(p => !p.foreign).length, for: all.filter(p => p.foreign && !p.aq).length, aq: all.filter(p => p.foreign && p.aq).length };
    const tabBar = `<div class="tabs" role="tablist">${[['dom', '국내 FA'], ['for', '외국인'], ['aq', '아시아쿼터']].map(t => `<button role="tab" aria-selected="${tab === t[0]}" data-act="fatab" data-a="${t[0]}">${t[1]} (${cnt[t[0]]})</button>`).join('')}</div>`;
    if (tab !== 'dom') return faCalendar() + faFeedCard() + tabBar + screenFAForeign(tab === 'aq', all);
    const list = all.filter(p => !p.foreign).sort((a, b) => ui.faSort === 'ovr' ? L.ovr(b) - L.ovr(a) : ui.faSort === 'age' ? a.age - b.age : L.war(b) - L.war(a)).slice(0, 80);
    const rows = list.map(p => {
      const tm = L.faTerms(p, U()), fr = p.foreign, o = fr ? null : Object.assign(L.faDefaultOffer(p, U()), (ui.faIn || {})[p.id] || {}), per = o ? (o.bonus + o.salary * o.years) / o.years : 0, bi = fr || !tm.graded ? null : L.faBidInfo(p.id);
      const req = fr ? `<td class="n">${money(Math.min(L.askSalary(p), L.foreignCap(p, U())))}</td><td class="small muted">외국인 1년</td>` : tm.graded ? `<td class="n">${f1(tm.req(tm.pref))}<div class="small muted">시장가 ${f1(tm.mv)}${tm.ext ? ' · 이적 +4%' : ''}${tm.disc > 0 ? ' · <b class="pos">충성 할인 −' + Math.round(tm.disc * 1000) / 10 + '%</b>' : ''}${tm.comp > 1 ? ' · 경쟁 +' + Math.round((tm.comp - 1) * 1000) / 10 + '%' : ''}</div></td><td class="small muted">${tm.pref}년 선호 · 총 ${f1(tm.req(tm.pref) * tm.pref)}억</td>` : `<td class="n">${f1(tm.req(1))}</td><td class="small muted">1년 계약만 가능(FA 자격 없음)</td>`;
      const offer = fr ? `<button class="sm primary" data-act="negOpen" data-a="${p.id}|foreign">협상</button>` : `<select data-sel="fayears" data-a="${p.id}" ${tm.graded ? '' : 'disabled'}>${Array.from({ length: tm.maxYears }, (_, i) => i + 1).map(y => `<option value="${y}" ${y === o.years ? 'selected' : ''}>${y}년</option>`).join('')}</select> 연봉 <input class="num" type="number" step="0.1" min="0.3" style="width:64px" data-sel="fasal" data-a="${p.id}" value="${o.salary}"> ${tm.graded ? `계약금 <input class="num" type="number" step="0.1" min="0" style="width:64px" data-sel="fabonus" data-a="${p.id}" value="${o.bonus}">` : ''} <button class="sm primary" data-act="signFA" data-a="${p.id}">제시</button> <button class="sm" data-act="negOpen" data-a="${p.id}|fa" title="선수와 마주 앉아 협상합니다">협상</button>`;
      return `<tr><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l">${faChip(p)}${p.faInfo && p.faInfo.from ? ` <span class="muted small">${KO[p.faInfo.from] || ''}</span>` : ''}</td><td class="l">${subHtml(p)}</td>${req}${mk ? `<td class="l small">${bidCell(bi)}</td>` : ''}<td>${offer}${bi && bi.best ? ` <button class="sm" data-act="faBeat" data-a="${p.id}" title="경쟁 입찰을 넘는 최소 제시를 입력칸에 채웁니다">경쟁 이기는 제시</button>` : ''}</td></tr>`;
    }).join('');
    return `${faCalendar()}${faFeedCard()}${persuadeCard()}${protectCard()}${tabBar}<div class="card"><div class="row"><h2>국내 FA 시장</h2><span class="muted small">${cbtText(U())} · FA 여유자금 ${L.faRoom(U()).toFixed(1)}억 · 보유 ${S.teams[U()].ids.length}명 · 외부 FA ${L._faCount(U())}/3 · 외국인 일반 ${L.foreignOf(U()).filter(x => !x.aq).length}/3 + AQ ${L.foreignOf(U()).filter(x => x.aq).length}/1</span><span class="sp"></span><select data-sel="fasort"><option value="war" ${ui.faSort === 'war' ? 'selected' : ''}>가치순</option><option value="ovr" ${ui.faSort === 'ovr' ? 'selected' : ''}>능력치순</option><option value="age" ${ui.faSort === 'age' ? 'selected' : ''}>나이순</option></select></div>
      ${list.length ? `<div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">FA 등급·원소속</th><th class="l">세부 능력</th><th>요구 연 보수(억)</th><th class="l">요구 조건</th>${mk ? '<th class="l">경쟁 현황</th>' : ''}<th class="l">제시 (연 보수 = 연봉 + 계약금 ÷ 기간)</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">시장에 나온 FA가 없습니다. 오프시즌에 계약이 끝난 선수가 시장에 나옵니다.</p>'}</div>`;
  }

  /* ---------------- 오프시즌 ---------------- */
  function screenOffseason() {
    const S = L.S, off = S.off; if (!off) return '<div class="card"><p class="muted">지금은 오프시즌이 아닙니다.</p></div>';
    const steps = [['review', '시즌 결산·재계약'], ['draft', '신인 드래프트'], ['fa', 'FA 시장']], cur = off.step;
    const bar = `<div class="tabs">${steps.map(s => `<button role="tab" aria-selected="${cur === s[0]}">${s[1]}</button>`).join('')}</div>`;
    if (cur === 'review') {
      const h = S.history[S.history.length - 1], prog = off.rep.prog.slice().sort((a, b) => b.d - a.d);
      const pr = prog.map(x => `<tr class="click" data-act="player" data-a="${x.id}"><td class="l">${esc(P(x.id).ko)}</td><td class="n">${P(x.id).age}</td><td>${ovrChip(L.ovr(P(x.id)))}</td><td class="n ${x.d > 0 ? 'pos' : x.d < 0 ? 'neg' : ''}">${x.d > 0 ? '▲' : x.d < 0 ? '▼' : ''}${Math.abs(x.d)}</td></tr>`).join('');
      const ex = off.rep.expiring.map(id => { const p = P(id), ask = L.resignAsk(p); return `<tr><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l">${faStatus(p) || '<span class="muted small">외국인(1년 계약)</span>'}</td><td class="n">${money(ask)}${L.loyDiscount(p, p.team) > 0 ? `<div class="small pos">충성 할인 −${Math.round(L.loyDiscount(p, p.team) * 500) / 10}%</div>` : ''}</td><td><button class="sm primary" data-act="negOpen" data-a="${id}|resign">협상</button> <button class="sm" data-act="resign" data-a="${id}" title="요구액 그대로 1년 재계약">1년 바로 계약</button></td></tr>`; }).join('');
      return `${bar}${growthBanner()}${reportCard()}${risersCard()}<div class="card"><h2>${S.year} 시즌 결산</h2><p style="margin:0">${S.year}년 최종 ${h.userRank}위 (${h.userRec.w}승 ${h.userRec.l}패 ${h.userRec.d}무) · 우승 ${h.champion ? teamTag(h.champion) : '-'}</p>${off.rep.retired.length ? `<p class="small muted">은퇴: ${off.rep.retired.map(id => esc(P(id).ko)).join(', ')}</p>` : ''}</div>
        <div class="grid"><div class="card"><h2>선수 성장·노화 (내 팀)</h2><div class="tablewrap" style="max-height:360px;overflow-y:auto"><table><thead><tr><th class="l">선수</th><th>나이</th><th>OVR</th><th>변화</th></tr></thead><tbody>${pr}</tbody></table></div></div>
        <div class="card"><h2>계약 만료 선수</h2>${off.rep.auto ? `<p class="small muted" style="margin:0 0 6px">연봉 2억 미만·35세 미만의 FA 자격 없는 선수 ${off.rep.auto}명은 시장 요구액으로 자동 재계약되었습니다.</p>` : ''}${ex ? '<div class="row" style="margin-bottom:6px"><button class="sm" data-act="resignAll">외국인 제외 전원 재계약(1년)</button></div>' : ''}${ex ? `<div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">FA</th><th>1년 연봉</th><th></th></tr></thead><tbody>${ex}</tbody></table></div>` : '<p class="muted">계약이 만료된 선수가 없습니다.</p>'}<p class="small muted">재계약은 모두 1년(연봉 계약)입니다. 여러 해 계약은 FA 시장에서 계약금을 포함해 협상합니다. FA 자격이 있는 선수를 재계약하지 않으면 FA 시장으로 나가며(등급에 따라 보상 발생), 자격이 없는 선수는 방출되어 자유계약이 됩니다.</p></div></div>
        <div class="row"><button class="primary big" data-act="toDraft">계약 확정 · 드래프트로</button></div>`;
    }
    if (cur === 'draft') {
      const d = off.draft, onClock = L.draftOnClock(), mine = onClock === U(), pool = d.pool.map(id => P(id)).sort((a, b) => L.userScore(b) - L.userScore(a));
      const pr = pool.slice(0, 60).map(p => `<tr><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${p.type === 'B' ? posName[p.pos] : (p.role === 'SP' ? '선발형' : '구원형')}</td><td class="n">${p.age}</td><td>${ovrChip(Math.max(20, Math.min(80, Math.round(L.scoutEst(p).o))))}</td><td class="l"><span class="chip ${L.scoutEst(p).ceil >= 57 ? 'in' : ''}" title="스카우트 추정 ${L.scoutEst(p).ceil}±${L.scoutEst(p).ceilSd} — 실제 정점은 달라질 수 있습니다">${gradeRange(L.scoutEst(p))}급 ${L.tierLabel(L.scoutEst(p).ceil)}</span> <span class="chip ${confCls(L.scoutEst(p).conf)}">${L.scoutEst(p).conf}</span></td><td>${mine ? `<button class="sm primary" data-act="draftPick" data-a="${p.id}">지명</button>` : ''}</td></tr>`).join('');
      const picks = d.picks.slice(-14).reverse().map(x => `<tr><td class="l n">${x.pick}</td><td class="l">${teamTag(x.team)}</td><td class="l">${esc(P(x.id).ko)}</td></tr>`).join('');
      const myp = d.picks.filter(x => x.team === U()).map(x => esc(P(x.id).ko)).join(', ');
      const lastPk = d.picks[d.picks.length - 1], stage = lastPk ? `<div class="draftstage"><div class="small muted">${Math.ceil(lastPk.pick / 10)}라운드 ${((lastPk.pick - 1) % 10) + 1}순위 · ${KO[lastPk.team]}</div><div class="dname">${esc(P(lastPk.id).ko)}${lastPk.team === U() ? ' <span class="chip in">우리 구단 지명</span>' : ''}</div><div class="small">${esc(L.draftIntro(lastPk.id))}</div>${L.draftDay().lastRx ? `<div class="small" style="margin-top:4px">${rxChip(L.draftDay().lastRx)} ${esc(L.draftDay().lastRx.text)}</div>` : ''}</div>` : '';
      const topPk = mine ? `<div class="card"><h2>스카우트 추천</h2><div class="small muted">내 스카우트 추정 기준 상위 3명입니다. 확신도가 낮으면 실제와 크게 다를 수 있습니다(스카우팅 탭에서 관찰해 오차를 줄일 수 있습니다).</div>${pool.slice(0, 3).map(p => `<div class="row small" style="margin-top:6px"><b>${esc(p.ko)}</b> <span class="muted">${progLabel(p)} · ${p.age}세</span> ${estChips(p)}<span class="sp"></span><button class="sm primary" data-act="draftPick" data-a="${p.id}">지명</button></div>`).join('')}</div>` : '';
      return `${bar}${draftDayCard()}${stage}${topPk}<div class="card"><div class="row"><h2>신인 드래프트</h2><span class="muted small">${d.pick}/${d.order.length}번째 지명 · ${onClock ? (mine ? '<b class="pos">내 차례</b>' : KO[onClock] + ' 차례') : '종료'}</span><span class="sp"></span>${onClock && !mine ? (ui.draftT ? '<button data-act="draftSkip">건너뛰기</button>' : '<button data-act="draftSim">발표 보기</button><button data-act="draftSkip">내 차례까지 바로</button>') : ''}${onClock ? '<button data-act="draftAuto">나머지 자동 지명</button>' : '<button class="primary" data-act="toFA">FA 시장으로</button>'}</div>
        <p class="small muted" style="margin:6px 0">스카우트 평가(능력치·성장 상한 등급)는 오차가 있어 지명 순번이 높아도 크게 못 클 수 있고, 하위 지명에서 대성하기도 합니다. 지명 순서는 정규시즌 성적 역순이고 10라운드까지 진행합니다. 신인은 2군으로 들어옵니다. 내 지명: ${myp || '없음'}</p></div>
        <div class="grid"><div class="card"><h2>지명 가능 선수</h2><div class="tablewrap" style="max-height:520px;overflow-y:auto"><table><thead><tr><th class="l">선수</th><th class="l">유형</th><th>나이</th><th>OVR(추정)</th><th class="l">성장 상한·확신도</th><th></th></tr></thead><tbody>${pr}</tbody></table></div></div>
        <div class="card"><h2>최근 지명</h2><div class="tablewrap"><table><tbody>${picks || '<tr><td class="muted">아직 없습니다.</td></tr>'}</tbody></table></div></div></div>${draftBoardCard()}${draftReportCard()}`;
    }
    return `${bar}${screenFA()}<div class="row"><button class="primary big" data-act="toSeason">FA 종료 · 새 시즌 시작</button></div>`;
  }

  /* ---------------- 저장·설정 ---------------- */
  const pref = (k, d) => { try { const v = localStorage.getItem('kbo_' + k); return v === null ? d : v; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('kbo_' + k, v); } catch (e) { /* 저장소 사용 불가 */ } };
  const applyFont = () => { document.documentElement.style.fontSize = ({ s: '15px', m: '', l: '17px', xl: '19px' })[pref('fs', 'm')] || ''; };
  const buzz = () => { if (pref('vib', '1') === '1' && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* 미지원 */ } } };
  const favs = () => (L.S.favs = L.S.favs || []);
  function prefCard() {
    const fs = pref('fs', 'm'), fv = favs().map(P).filter(Boolean);
    return `<div class="card"><h2>화면 설정</h2><div class="row small">글자 크기 ${[['s', '작게'], ['m', '보통'], ['l', '크게'], ['xl', '더 크게']].map(([k, t]) => `<button class="sm ${fs === k ? 'primary' : ''}" data-act="fontSz" data-a="${k}">${t}</button>`).join('')}</div>
      <div class="row small"><label><input type="checkbox" data-act="vibTog" ${pref('vib', '1') === '1' ? 'checked' : ''}> 조작 시 진동 효과(지원 기기)</label></div>
      <div class="small muted" style="margin-top:6px">관심 선수 ${fv.length}명 — 선수 상세의 ☆ 버튼으로 추가합니다.${fv.length ? '<br>' + fv.map(p => `<button class="sm" data-act="player" data-a="${p.id}">${esc(p.ko)} ${L.ovr(p)}</button>`).join(' ') : ''}</div></div>`;
  }
  function integrityCard() {
    const r = ui.integ; return `<div class="card"><div class="row"><h2 style="margin:0">데이터 점검</h2><span class="sp"></span><button class="sm primary" data-act="integrityRun">지금 점검</button></div><div class="small muted" style="margin-top:4px">같은 선수가 두 번 들어 있는지(개명·동명이인), 한 선수가 두 팀에 있는지, 계약·외국인 슬롯·엔트리에 이상이 없는지 검사합니다.</div>${r ? (r.errors.length || r.warns.length ? `<div style="margin-top:8px">${r.errors.map(e => `<div class="small neg">⚠ ${esc(e.text)}</div>`).join('')}${r.warns.map(e => `<div class="small muted">· ${esc(e.text)}</div>`).join('')}</div>` : '') + `<div class="small ${r.errors.length ? 'neg' : 'pos'}" style="margin-top:6px">${r.errors.length ? `오류 ${r.errors.length}건` : '이상 없음'} · 점검한 선수 ${r.checked}명${r.warns.length ? ` · 확인 필요 ${r.warns.length}건` : ''}</div>` : ''}</div>`;
  }
  function screenSave() {
    const hk = L.handsKnown();
    return prefCard() + integrityCard() + `<div class="card"><h2>투타(좌우) 정보</h2><p class="small muted" style="margin:0 0 8px">대타 좌우 매치업은 투타 정보가 있는 선수에게만 적용됩니다. 현재 타자 ${hk.b}/${hk.bt}명, 투수 ${hk.p}/${hk.pt}명이 입력되어 있고, 나머지는 좌우 상성 없이 중립으로 처리합니다.<br>KBO 홈페이지의 선수 등록 현황 표를 그대로 붙여넣거나, 한 줄에 「이름,우투좌타」 형식으로 입력하세요. 같은 이름의 선수가 여러 명이면 같은 줄에 팀 이름(예: 삼성)을 함께 적어야 합니다.</p>
      <textarea id="handsText" placeholder="예) 최재훈 우투우타&#10;김도영,KIA,우투우타">${esc(ui.handsText)}</textarea><div class="row"><button class="primary" data-act="importHands">투타 정보 적용</button><button data-act="handTemplate">입력 안 된 선수 목록 복사</button></div></div>
      <div class="card"><h2>저장·불러오기</h2><p class="small muted">진행 상황은 자동 저장됩니다(이 브라우저에만 보관). 아래 텍스트로 백업하거나 다른 곳에서 불러올 수 있습니다.</p>
      <div class="row"><button class="primary" data-act="saveNow">지금 저장</button><button data-act="exportSave">백업 텍스트 만들기</button><button class="warn" data-act="newGameMenu">새 게임(팀 다시 선택)</button></div>
      <textarea id="saveText" placeholder="여기에 백업 텍스트를 붙여넣고 [불러오기]를 누르세요">${esc(ui.saveText)}</textarea><div class="row"><button data-act="importSave">불러오기</button></div></div>`;
  }

  /* ---------------- 결과 시트 ---------------- */
  const snapshot = () => { const st = L.standings().find(x => x.team === U()); return { day: L.S.day, rank: st.rank, w: st.w, l: st.l, d: st.d }; };
  function resRow(g) {
    const me = U(), home = g.home === me, opp = home ? g.away : g.home, my = home ? g.rh : g.ra, th = home ? g.ra : g.rh, w = my > th, t = my === th;
    return `<div class="gline"><span class="small muted">${L.dateStr(g.day)}</span><span>${home ? '홈' : '원정'} ${teamTag(opp)}</span><span class="res ${t ? '' : w ? 'w' : 'l'}">${t ? '무' : w ? '승' : '패'} ${my}:${th}</span></div>`;
  }
  function openResultSheet(before) {
    const S = L.S, st = L.standings().find(x => x.team === U()), games = S.results.filter(r => r.day >= before.day && (r.home === U() || r.away === U()));
    if (!games.length) return;
    const W = games.filter(g => (g.home === U() ? g.rh > g.ra : g.ra > g.rh)).length, D = games.filter(g => g.rh === g.ra).length, Ls = games.length - W - D;
    const title = games.length === 1 ? `${L.dateStr(games[0].day)} 경기 결과` : `${L.dateStr(games[0].day)} ~ ${L.dateStr(games[games.length - 1].day)} (${games.length}경기)`;
    const arrow = st.rank < before.rank ? 'pos' : st.rank > before.rank ? 'neg' : '';
    ui.sheet = { title, html: `<div class="kpis"><div class="kpi"><div class="l">이 기간 성적</div><div class="v">${W}승 ${Ls}패${D ? ' ' + D + '무' : ''}</div></div><div class="kpi"><div class="l">순위</div><div class="v ${arrow}">${before.rank}위 → ${st.rank}위</div></div><div class="kpi"><div class="l">시즌 성적</div><div class="v">${st.w}승 ${st.l}패</div></div></div>${ui.lastStop ? `<div class="small" style="margin:6px 0"><b>멈춘 이유</b> · ${esc(ui.lastStop)}</div>` : ''}${(S.recap || []).slice(0, 3).map(r => `<div class="small" style="margin:4px 0">📰 ${esc(r.text)}</div>`).join('')}<details ${games.length <= 3 ? 'open' : ''}><summary class="small">경기 결과 ${games.length}경기 (최근 8경기)</summary><div>${games.slice(-8).reverse().map(resRow).join('')}</div>${games.length > 8 ? '<p class="small muted" style="margin:0">전체는 [일정·결과]에서 볼 수 있습니다.</p>' : ''}</details>` };
  }
  function openPostSheet(list) {
    const rows = list.map(r => `<div class="gline"><span class="small muted">${esc(r.round)}</span><span>${teamTag(r.away)} <b>${r.ra}</b> : <b>${r.rh}</b> ${teamTag(r.home)}</span><span class="res ${r.ended ? 'w' : ''}">${r.ended ? '시리즈 종료' : ''}</span></div>`).join('');
    const last = list[list.length - 1], P2 = L.S.post;
    ui.sheet = { title: list.length === 1 ? '포스트시즌 경기 결과' : `포스트시즌 ${list.length}경기 진행`, html: `${rows}${P2 && P2.done ? `<div class="champ"><div><div class="small muted">한국시리즈 우승</div><div class="t">${teamTag(P2.champion)}</div></div></div>` : ''}` };
  }
  const sheetHtml = () => (ui.sheet ? `<div class="sheet-bg" data-act="sheetClose"><div class="sheet" data-stop="1" role="dialog" aria-label="${esc(ui.sheet.title)}"><div class="grabber"></div><h2>${esc(ui.sheet.title)}</h2>${ui.sheet.html}<button class="primary big" data-act="sheetClose">확인</button></div></div>` : '');

  /* ---------------- 좌우 매치업 ---------------- */
  const platoonOf = (bp, pp) => { const u = bp && pp ? E0.platoonUnit(bp.bats, pp.throws) : null; return u === null ? null : { u, tag: u >= 0.25 ? '유리' : u <= -0.4 ? '불리' : '보통' }; };
  const platChip = (bp, pp) => { const m = platoonOf(bp, pp); return m ? `<span class="chip ${m.tag === '유리' ? 'in' : m.tag === '불리' ? 'bad' : ''}">${L.handLabel(bp)} vs ${L.handLabel(pp)} · ${m.tag}</span>` : ''; };

  /* ---------------- 경기 화면 ---------------- */
  const BAT_LBL = { normal: '기본', contact: '컨택', power: '장타', patient: '신중' }, PIT_LBL = { normal: '기본', attack: '공격적 승부', careful: '신중한 승부', strikeout: '삼진 유도' };
  const BAT_HELP = { normal: '', contact: '삼진과 홈런이 줄고 타구가 살아납니다. 3루 주자가 있으면 땅볼·플라이로도 득점하기 쉽습니다.', power: '홈런과 삼진이 늘고 볼넷·타구 질은 조금 나빠집니다. 한 방이 필요할 때.', patient: '볼넷이 늘고 홈런이 줄어듭니다. 출루가 필요할 때.' };
  const PIT_HELP = { normal: '', attack: '볼넷이 줄고 삼진이 조금 늘지만 홈런·피안타가 늘어납니다. 주자를 내보내기 싫을 때.', careful: '홈런이 줄지만 볼넷이 늘어납니다. 장타자를 피할 때.', strikeout: '삼진이 늘지만 볼넷과 홈런도 조금 늘어납니다.' };
  function nm(b) { const p = P(b.id); return p ? p.ko : b.name; }
  function evText(e) {
    switch (e.k) {
      case 'PA': {
        const b = nm(e.b), r = e.runs ? ` (${e.runs}점)` : '';
        const t = { K: '삼진', BB: '볼넷', HBP: '몸에 맞는 공', HR: '홈런!', '1B': '안타', '2B': '2루타', '3B': '3루타', ROE: '실책 출루', IBB: '고의사구', '번트': '희생번트', '번트실패': '번트 실패', '번트(선택)': '번트, 야수선택', '번트안타': '번트 안타' }[e.e];
        const pn = e.p ? ` · 투수 ${nm(e.p)}` : '';   // 엔진은 범타를 'OUT' 하나로만 기록한다(땅볼·뜬공·수비수 정보 없음) → 지어낸 타구 설명을 쓰지 않는다
        if (t) return { t: `${b} ${t}${r}${pn}`, run: e.runs > 0 };
        if (e.dout >= 2) return { t: `${b} 병살타${pn}`, run: false };
        return { t: `${b} ${e.runs ? '희생타로 ' + e.runs + '점' : '범타 아웃'}${pn}`, run: e.runs > 0 };
      }
      case 'SB': return { t: `${nm(e.b)} 도루 성공` }; case 'CS': return { t: `${nm(e.b)} 도루 실패` }; case 'WP': return { t: '폭투로 주자 진루' };
      case 'PC': return { t: `${e.auto ? '[자동] ' : ''}투수 교체: ${nm(e.p)}`, sys: true };
      case 'PH': return { t: `대타: ${nm(e.out)} → ${nm(e.in)}`, sys: true };
      case 'MV': return { t: `마운드 방문 (${e.n}/3): ${nm(e.p)} 안정을 찾습니다`, sys: true };
      case 'HAR': return { t: `히트앤드런! ${nm(e.b)} 스타트`, sys: true };
      case 'PO': return { t: e.balk ? '보크! 견제를 너무 많이 던져 주자가 진루합니다' : e.out ? `${nm(e.b)} 견제사!` : e.err ? `견제 악송구! ${nm(e.b)} 진루` : `견제구 — ${nm(e.b)} 귀루`, run: !!e.out, sys: !e.out };
      case 'DS': return { t: `수비 교체: ${nm(e.out)} → ${nm(e.in)} (${posName[e.pos] || '지명'})`, sys: true };
      case 'PR': return { t: `대주자: ${nm(e.out)} → ${nm(e.in)}`, sys: true };
      case 'SW': return { t: `수비 위치 변경: ${nm(e.a)} ${posName[e.pa] || '지명'} · ${nm(e.b)} ${posName[e.pb] || '지명'}`, sys: true };
      default: return null;
    }
  }
  function pushLive(l0, side0) {
    const lv = ui.live, g = lv.ctx.live;
    const ev = g.log.slice(l0); let last = -1; ev.forEach((e, i) => { if (e.k === 'PA') last = i; });
    ev.forEach((e, i) => { const o = evText(e); if (!o) return; if (i === last) o.t += stateText(e, g); lv.feed.unshift({ w: lv.lbl || '', ...o }); });
    for (const t of L.liveNotes(g, ev, side0 || g.batSide, lv.ns || (lv.ns = {}), lv.ctx.userSide)) lv.feed.unshift({ w: lv.lbl || '', t: '▶ ' + t, sys: true, cm: true });   // 해설: 엔진 기록으로 확인되는 사실만
    syncHalf(lv, g);
  }
  function syncHalf(lv, g) {   // 초↔말 전환(타석·도루 실패·번트 등 어떤 경로든)을 감지해 이닝 요약과 공격 팀 안내를 남긴다
    const key = g.inning + (g.top ? 't' : 'b'); if (lv.halfKey === undefined) { lv.halfKey = key; lv.halfL = 0; return; } if (lv.halfKey === key) return;
    const oi = parseInt(lv.halfKey), ot = /t$/.test(lv.halfKey);
    lv.feed.unshift({ w: '', t: halfSummary(lv.halfL, oi, ot), sys: true });
    { const nh = L.liveNoHit(g, lv.ns || (lv.ns = {})); if (nh) lv.feed.unshift({ w: '', t: '▶ ' + nh, sys: true, cm: true }); }
    if (!g.finished) lv.feed.unshift({ w: '', t: `— ${g.inning}회${g.top ? '초' : '말'} ${g.top ? KO[g.away] : KO[g.home]} 공격 (${g.score.away}:${g.score.home}) —`, sys: true });
    lv.halfKey = key; lv.halfL = g.log.length;
  }
  function stateText(e, g) {   // 타석 직후 상황(아웃·주자·점수): 엔진이 기록한 값만 사용
    const ls = L.liveScore(g), sc = ` · ${KO[g.away]} ${ls.away}:${ls.home} ${KO[g.home]}`;
    if (e.outs >= 3) return ` — 3아웃 공수 교대${e.runs > 0 ? sc : ''}`;
    const occ = g.bases.map((b, i) => (b ? i + 1 : 0)).filter(Boolean);
    return ` — ${e.outs}아웃 ${occ.length ? occ.join('·') + '루' : '주자 없음'}${e.runs > 0 ? sc : ''}`;
  }
  function halfSummary(l0, inn, top) {   // 한 이닝(초/말) 요약: 로그에 기록된 값만 집계
    const g = ui.live.ctx.live, ev = g.log.slice(l0).filter(e => e.k === 'PA'), H = ev.filter(e => ['1B', '2B', '3B', 'HR', '번트안타'].includes(e.e)).length, R = ev.reduce((a, e) => a + (e.runs || 0), 0), BB = ev.filter(e => ['BB', 'HBP', 'IBB'].includes(e.e)).length, K = ev.filter(e => e.e === 'K').length;
    return `${inn}회${top ? '초' : '말'} 종료 — ${H}안타 ${R}점 ${BB}사사구 ${K}삼진`;
  }
  function liveRun(mode) {
    const lv = ui.live, g = lv.ctx.live, start = g.inning, st = g.top;
    while (!g.finished) {
      lvOrders(lv); applyOrders(); if (g.finished) break;
      const l0 = g.log.length, side0 = g.batSide, us = lv.ctx.userSide, pre = stopState(g, us, lv); lv.lbl = `${g.inning}${g.top ? '초' : '말'}`;
      g.step(); pushLive(l0, side0);
      if (g.finished) { lv.feed.unshift({ w: '', t: `경기 종료 ${KO[g.away]} ${g.score.away} : ${g.score.home} ${KO[g.home]}`, sys: true }); break; }
      if (mode === 'pa') break;
      { const post = stopState(g, us, lv); if ((post.fat && !pre.fat) || (post.risp && !pre.risp)) { lv.feed.unshift({ w: lv.lbl || '', t: post.fat && !pre.fat ? `⏸ 멈춤: ${P(g.pitcher.id) ? P(g.pitcher.id).ko : '투수'}의 남은 체력 ${fatLeft(g)}% (설정 ${lv.stops.fat}% 이하)` : '⏸ 멈춤: 득점권 주자가 나갔습니다', sys: true, cm: true }); break; } }
      if (mode === 'inning' && (g.inning !== start || g.top !== st)) break;
    }
    lv.sheet = null; render();
  }
  function runTactic(kind, arg) {   // 화면을 다시 그리지 않고 작전을 실행(예약 실행에서도 사용)
    const lv = ui.live, g = lv.ctx.live, us = lv.ctx.userSide, E = lv.ctx.E, side0 = g.batSide; lv.lbl = `${g.inning}${g.top ? '초' : '말'}`; const l0 = g.log.length, d0 = { kind, arg, l0, inn: g.inning, top: g.top, old: P(g.pitcher.id) ? P(g.pitcher.id).ko : '', name: (kind === 'pc' || kind === 'ph') && P(arg) ? P(arg).ko : '' };
    if (kind === 'ibb') g.ibb(); else if (kind === 'bunt') g.bunt(); else if (kind === 'steal') g.steal(); else if (kind === 'har') g.hitAndRun(); else if (kind === 'po') g.pickoff(arg === undefined || arg === '' ? undefined : +arg); else if (kind === 'mv') g.moundVisit(us);
    else if (kind === 'pc') g.changePitcher(us, E.pitById[arg]);
    else if (kind === 'ph') g.pinchHit(us, g.idx[us] % 9, E.batById[arg]);
    else if (kind === 'pr') { const [bs, id] = arg.split(':'); g.pinchRun(us, +bs, E.batById[id]); }
    else if (kind === 'ds') { const [sl, id] = arg.split(':'); g.swapField(us, +sl, E.batById[id]); }
    else if (kind === 'sw') { const [x, y] = arg.split(':'); g.swapPos(us, +x, +y); }
    if (['pc', 'ph', 'ibb', 'bunt', 'steal'].includes(kind) && g.log.length > l0) (lv.dec = lv.dec || []).push(d0);   // 경기 후 결정 되짚기용
    pushLive(l0, side0);
  }
  function liveTactic(kind, arg) { const lv = ui.live; runTactic(kind, arg); lv.pick = null; lv.sheet = null; lv.pop = null; render(); }
  const benchOf = () => { const lv = ui.live, g = lv.ctx.live, us = lv.ctx.userSide, E = lv.ctx.E; return L.hitters(U(), true).filter(p => E.batById[p.id] && !g.L[us].includes(E.batById[p.id]) && !g.subs[us].some(s => s.out === E.batById[p.id])); };
  function pcScore(p) { const g = ui.live && ui.live.ctx.live, bt = g && g.batter ? P(g.batter.id) : null, ri = L.restInfo(p); let s = ri.left * 0.5 + L.ovr(p) * 0.5; if (bt && bt.bats && p.throws) { if (bt.bats === 'S') s += 0; else if (bt.bats !== p.throws) s += 0; else s += 6; } if (p.role !== 'SP') s += 3; return s; }   // 체력·종합·같은 손(좌투-좌타) 상성 순
  function advice() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, opp = us === 'home' ? 'away' : 'home', myBat = g.batSide === us, myField = g.fldSide === us, out = [];
    const inn = g.inning, diff = L.liveScore(g)[us] - L.liveScore(g)[opp], b = g.bases, bt = P(g.batter.id), bo = bt ? L.ovr(bt) : 50, bench = benchOf().sort((x, y) => L.ovr(y) - L.ovr(x));
    if (myField) {
      const f = g.pitchFatigue(us), pp = P(g.pitcher.id);
      if (f.over > 0) out.push({ t: `${pp.ko}의 체력이 한계를 넘었습니다 (상대 타자 ${f.bf}명 / 한계 ${f.lim}). 볼넷·피홈런이 늘고 삼진이 줄고 있습니다.`, a: 'pcOpen', l: '투수 교체' });
      else if (f.pct >= 0.85) out.push({ t: `${pp.ko}의 체력이 거의 한계입니다 (${f.bf}/${f.lim}). 다음 위기에서 교체를 고려하세요.`, a: 'pcOpen', l: '투수 교체' });
      { const rn = b[0] && !b[1] ? P(b[0].id) : null; if (rn && !g.tact[us].hold && L.sub(rn).주력 >= 58) out.push({ t: `1루 주자 ${esc(rn.ko)}는 발이 매우 빠릅니다. 주자 견제 지시로 도루를 억제할 수 있습니다.`, a: 'hold', l: '견제 지시' }); }
      { const pa_ = g.log.filter(x => x.k === 'PA' && x.p === g.pitcher).slice(-3), reach = pa_.filter(x => ['BB', 'HBP', '1B', '2B', '3B', 'HR', 'ROE', 'IBB'].includes(x.e)).length; if (g.canVisit(us) && pa_.length >= 2 && reach >= 2 && g.calm[us] === 0) out.push({ t: `${esc(P(g.pitcher.id).ko)}가 최근 ${pa_.length}타자 중 ${reach}명을 내보냈습니다. 마운드 방문으로 안정시키세요 (남은 방문 ${3 - g.visits[us]}번).`, a: 'mv', l: '마운드 방문' }); }
      if (g.outs < 2 && (b[1] || b[2]) && !b[0] && inn >= 7 && Math.abs(diff) <= 2 && bo >= 60) out.push({ t: `1루가 비어 있고 상대 타자(${esc(bt.ko)}, ${bo})가 강합니다. 고의사구로 병살 기회를 만들 수 있습니다.`, a: 'ibb', l: '고의사구' });
      if (b[2] && g.outs < 2 && inn >= 7 && diff >= 0 && diff <= 2 && !g.tact[us].inf) out.push({ t: '1~2점 차 리드에서 3루 주자입니다. 전진 수비로 쉬운 득점을 막아 보세요(안타는 조금 늘어납니다).', a: 'inf', l: '전진 수비' });
    }
    if (myBat) {
      if (b[2] && g.outs < 2 && g.tact[us].bat !== 'contact') out.push({ t: `${g.outs}사 3루입니다. 컨택 접근으로 삼진을 줄이면 땅볼·플라이로도 득점하기 쉽습니다.`, a: 'contact', l: '컨택 접근' });
      if (inn >= 7 && diff < 0 && diff >= -3 && g.tact[us].bat !== 'power' && !b[2]) out.push({ t: `${-diff}점 뒤진 후반입니다. 장타 접근으로 한 방을 노려볼 수 있습니다.`, a: 'power', l: '장타 접근' });
      { const opp2 = P(g.pitcher.id), cm = platoonOf(bt, opp2), alt = bench.map(x => ({ x, m: platoonOf(x, opp2) })).filter(y => y.m && y.m.u >= 0.25 && L.ovr(y.x) >= bo - 4).sort((p1, p2) => (L.ovr(p2.x) + 30 * p2.m.u) - (L.ovr(p1.x) + 30 * p1.m.u))[0]; if (cm && cm.tag === '불리' && alt && inn >= 5) out.push({ t: `${esc(bt.ko)}(${L.handLabel(bt)})은 ${L.handLabel(opp2)} 투수에게 불리합니다. ${esc(alt.x.ko)}(${L.handLabel(alt.x)}, ${L.ovr(alt.x)})가 좌우 상성이 좋습니다.`, a: 'phOpen', l: '대타' }); }
      const bb = bench[0]; if (bb && inn >= 6 && L.ovr(bb) >= bo + 8) out.push({ t: `대타 후보 ${esc(bb.ko)}(${L.ovr(bb)})가 현재 타자 ${esc(bt ? bt.ko : '')}(${bo})보다 확실히 낫습니다.`, a: 'phOpen', l: '대타' });
      const runner = b[0] && !b[1] ? P(b[0].id) : null; if (runner && inn >= 8 && diff <= 0 && runner.p.sba < 0.05 && bench.some(x => x.p.sba > 0.09)) out.push({ t: `접전 후반, 1루 주자 ${esc(runner.ko)}는 발이 느립니다. 대주자를 쓰면 득점 확률이 올라갑니다.`, a: 'prOpen', l: '대주자' });
      { const rn = b[0] && !b[1] ? P(b[0].id) : null; if (rn && g.outs < 2 && bt && L.sub(bt).컨택 >= 55 && L.sub(rn).주력 >= 52 && inn >= 3) out.push({ t: `1루 주자 ${esc(rn.ko)}는 발이 빠르고 타자 ${esc(bt.ko)}는 컨택이 좋습니다. 히트앤드런이 잘 맞는 조합입니다.`, a: 'har', l: '히트앤드런' }); }
      if (g.outs === 0 && b[0] && !b[1] && bo < 48 && inn >= 6 && diff >= -1 && diff <= 0) out.push({ t: '타자가 약하고 무사 1루입니다. 희생번트로 주자를 2루에 보낼 수 있습니다.', a: 'bunt', l: '번트' });
    }
    return out.slice(0, 3);
  }
  const diamond = g => { const b = g.bases; return `<svg class="diamond" viewBox="0 0 120 100" role="img" aria-label="주자 상황"><rect class="${b[1] ? 'on' : ''}" x="52" y="8" width="16" height="16" transform="rotate(45 60 16)"/><rect class="${b[2] ? 'on' : ''}" x="14" y="46" width="16" height="16" transform="rotate(45 22 54)"/><rect class="${b[0] ? 'on' : ''}" x="90" y="46" width="16" height="16" transform="rotate(45 98 54)"/><rect x="52" y="82" width="16" height="12" transform="rotate(45 60 88)" style="fill:var(--surface2)"/></svg>`; };
  function liveScore(g) {
    const A = [], H = []; for (const [a, h] of g.inns) { A.push(a); H.push(h); }
    if (!g.finished) { if (g.top) { A.push(g.h.runs); H.push(null); } else { A.push(g.curInn[0]); H.push(g.h.runs); } }
    const n = Math.max(9, A.length);
    const row = (arr, side) => { let c = ''; for (let i = 0; i < n; i++) { const v = arr[i]; const cur = !g.finished && i === A.length - 1 && ((g.top && side === 'away') || (!g.top && side === 'home')); c += `<td class="${cur ? 'cur' : ''}">${v === undefined || v === null ? (i < A.length ? 'x' : '') : v}</td>`; } return c; };
    return `<table><thead><tr><th class="l"></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>R</th></tr></thead><tbody><tr><td class="t">${teamTag(g.away)}</td>${row(A, 'away')}<td class="r">${g.score.away + (g.top && !g.finished ? g.h.runs : 0)}</td></tr><tr><td class="t">${teamTag(g.home)}</td>${row(H, 'home')}<td class="r">${g.score.home + (!g.top && !g.finished ? g.h.runs : 0)}</td></tr></tbody></table>`;
  }

  /* ---------------- 세분화 지시: 타자별 접근 · 교체 예약 · 자동 진행 멈춤 조건 ----------------
   * 모두 화면(UI) 단계의 편의 기능이다. 실제 효과는 같은 작전 함수(setTactic·changePitcher·pinchHit)를 같은 시점에 호출하는 것과 같아 엔진은 그대로다. */
  const lvOrders = lv => { lv.batPlan = lv.batPlan || {}; lv.resv = lv.resv || []; lv.stops = lv.stops || { fat: 0, risp: false }; lv.form = lv.form || {}; if (!lv.batBase) lv.batBase = lv.ctx.live.tact[lv.ctx.userSide].bat || 'normal'; return lv; };
  const fatLeft = g => Math.max(0, 100 - Math.round(g.pitchFatigue(g.fldSide).pct * 100));
  function applyOrders() {
    const lv = lvOrders(ui.live), g = lv.ctx.live, us = lv.ctx.userSide, myBat = g.batSide === us, myField = g.fldSide === us, E = lv.ctx.E;
    for (const r of lv.resv.slice()) {
      if (g.finished) break; let note = null, drop = false;
      if (r.kind === 'pc' && myField && fatLeft(g) <= r.thr) {
        const to = E.pitById[r.to], usedP = g.staff[us].used;
        if (!to || usedP.has(to.name) || g.pitcher.id === r.to) { drop = true; note = `예약 취소: ${P(r.to) ? P(r.to).ko : '투수'}를 투입할 수 없습니다`; }
        else { runTactic('pc', r.to); drop = true; note = `예약 실행: 남은 체력 ${r.thr}% 이하 → ${P(r.to).ko} 투입`; }
      } else if (r.kind === 'ph' && myBat && g.batter.id === r.batter) {
        const to = E.batById[r.to]; if (!to || !benchOf().some(p => p.id === r.to)) { drop = true; note = `예약 취소: ${P(r.to) ? P(r.to).ko : '대타'}를 쓸 수 없습니다`; }
        else { runTactic('ph', r.to); drop = true; note = `예약 실행: ${P(r.batter).ko} 타석 → ${P(r.to).ko} 대타`; }
      } else if (r.kind === 'ph' && !g.L[us].some(b => b.id === r.batter)) { drop = true; note = `예약 취소: ${P(r.batter) ? P(r.batter).ko : '타자'}가 이미 교체되었습니다`; }
      if (drop) lv.resv = lv.resv.filter(x => x.id !== r.id); if (note) lv.feed.unshift({ w: lv.lbl || '', t: '⏱ ' + note, sys: true, cm: true });
    }
    if (myBat) { const want = lv.batPlan[g.batter.id] || lv.batBase; if (g.tact[us].bat !== want) g.setTactic(us, 'bat', want); }   // 타자별 접근(없으면 기본 접근)
  }
  function ordersChips() {
    const lv = lvOrders(ui.live), n = lv.resv.length, st = [lv.stops.fat ? `체력 ${lv.stops.fat}%` : '', lv.stops.risp ? '득점권' : ''].filter(Boolean);
    return `<div class="tacts small" style="margin-top:6px"><button class="sm" data-act="livePop" data-a="plan">예약·멈춤 설정</button>${n ? `<span class="chip in">예약 ${n}건</span>` : ''}${st.length ? `<span class="chip in">멈춤: ${st.join('·')}</span>` : ''}${Object.keys(lv.batPlan).length ? `<span class="chip in">타자별 접근 ${Object.keys(lv.batPlan).length}명</span>` : ''}</div>`;
  }
  function stopState(g, us, lv) { const myField = g.fldSide === us; return { fat: !!(lv.stops.fat && myField && fatLeft(g) <= lv.stops.fat), risp: !!(lv.stops.risp && myField && (g.bases[1] || g.bases[2])) }; }
  function pickerHtml() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, E = ctx.E, pk = lv.pick; if (!pk) return '';
    const close = '<button class="sm" data-act="livePickClose">닫기</button>';
    const wrap = (title, body, help) => `<div class="sheet-bg" data-act="livePickClose"><div class="sheet" data-stop="1"><div class="grabber"></div><div class="row"><h2>${title}</h2><span class="sp"></span>${close}</div>${help ? `<p class="help" style="margin:0">${help}</p>` : ''}<div class="picker">${body}</div></div></div>`;
    const bench = benchOf().sort((a, b) => L.ovr(b) - L.ovr(a)), btn = (act, b, left, mid, right) => `<button data-act="${act}" data-a="${act === 'liveDo' ? pk.t : ''}" data-b="${b}"><span>${left}</span>${mid}<span class="small">${right || ''}</span></button>`;
    if (pk.t === 'pc') {
      const usedP = new Set([...g.staff[us].used]), cands = L.pitchers(U(), true).filter(p => E.pitById[p.id] && !usedP.has(E.pitById[p.id].name)).sort((a, b) => pcScore(b) - pcScore(a));
      return wrap('투수 교체', cands.map(p => `<button data-act="liveDo" data-a="pc" data-b="${p.id}"><span><b>${esc(p.ko)}</b> <span class="muted small">${p.role === 'SP' ? '선발' : '구원'}${L.team(U()).set.bullpen.closer === p.id ? ' · 마무리' : ''}</span></span>${ovrChip(L.ovr(p))}${gauge(p)}</button>`).join('') || '<p class="muted">투입 가능한 투수가 없습니다.</p>', '이미 던진 투수는 다시 나올 수 없습니다. 피로가 높은 투수는 연투로 지쳐 있습니다.');
    }
    if (pk.t === 'ph') {
      const opp = g.fldSide === us ? null : P(g.pitcher.id), cur = P(g.batter.id), adj = p => L.ovr(p) + 30 * ((platoonOf(p, opp) || { u: 0 }).u), ranked = bench.slice().sort((a, b) => adj(b) - adj(a));
      const curM = platoonOf(cur, opp);
      return wrap(`대타 · ${esc(nm(g.batter))} 대신`, ranked.map((p, i) => `<button data-act="liveDo" data-a="ph" data-b="${p.id}"><span><b>${esc(p.ko)}</b> <span class="muted small">${posName[p.pos]}${i === 0 ? ' · 추천' : ''}</span><br>${platChip(p, opp)}</span>${ovrChip(L.ovr(p))}<span class="small">${batLine(p.id)}</span></button>`).join('') || '<p class="muted">대타로 쓸 후보가 없습니다.</p>',
        `${opp ? `상대 투수는 ${L.handLabel(opp) || '투타 정보 없음'}입니다. ${curM ? `현재 타자 ${esc(nm(g.batter))}: ${platChip(cur, opp)}` : ''}` : ''} 좌우 상성(유리/불리)은 투타 정보가 있는 선수에게만 표시됩니다. 교체된 선수는 다시 나올 수 없고, 대타가 같은 수비 위치를 이어받습니다.`);
    }
    if (pk.t === 'pr') {
      if (pk.base === null) { const rs = [0, 1, 2].filter(i => g.bases[i]).map(i => `<button data-act="livePrBase" data-a="${i}"><span><b>${i + 1}루 주자 ${esc(nm(g.bases[i]))}</b></span><span>${ovrChip(L.ovr(P(g.bases[i].id)))}</span><span class="small">주력 ${L.sub(P(g.bases[i].id)).주력}</span></button>`).join(''); return wrap('대주자 · 교체할 주자 선택', rs || '<p class="muted">주자가 없습니다.</p>'); }
      return wrap(`대주자 · ${pk.base + 1}루 ${esc(nm(g.bases[pk.base]))} 대신`, bench.slice().sort((a, b) => L.sub(b).주력 - L.sub(a).주력).map(p => `<button data-act="liveDo" data-a="pr" data-b="${pk.base}:${p.id}"><span><b>${esc(p.ko)}</b> <span class="muted small">${posName[p.pos]}</span></span><span class="chip in">주력 ${L.sub(p).주력}</span>${ovrChip(L.ovr(p))}</button>`).join('') || '<p class="muted">후보가 없습니다.</p>', '대주자는 그 타순과 수비 위치를 이어받습니다. 주력이 높을수록 진루·득점에 유리합니다.');
    }
    if (pk.t === 'ds') {
      const ass = g.assign[us], posOf = b => { const f = ass.find(x => x[0] === b); return f ? f[1] : 'DH'; };
      if (pk.slot === null) return wrap('수비 교체 · 대상 선택', g.L[us].map((b, i) => `<button data-act="liveDsSlot" data-a="${i}"><span>${i + 1}번 <b>${esc(nm(b))}</b></span><span class="chip">${posName[posOf(b)]}</span>${ovrChip(L.ovr(P(b.id)))}</button>`).join(''), '벤치 선수로 바꾸거나 다른 야수와 수비 위치를 맞바꿀 수 있습니다.');
      const tb = g.L[us][pk.slot], tp = posOf(tb);
      const subs = bench.map(p => `<button data-act="liveDo" data-a="ds" data-b="${pk.slot}:${p.id}"><span><b>${esc(p.ko)}</b> <span class="muted small">벤치</span></span>${fitChip(p, tp)}${ovrChip(L.ovr(p))}</button>`).join('');
      const swaps = g.L[us].map((b, i) => ({ b, i })).filter(x => x.i !== pk.slot && posOf(x.b) !== tp).map(x => { const pa_ = P(x.b.id), pb_ = P(tb.id); return `<button data-act="liveDo" data-a="sw" data-b="${pk.slot}:${x.i}"><span><b>${esc(nm(x.b))}</b> <span class="muted small">${posName[posOf(x.b)]} ↔ ${posName[tp]}</span></span>${fitChip(pa_, tp)}${fitChip(pb_, posOf(x.b))}</button>`; }).join('');
      return wrap(`${esc(nm(tb))} (${posName[tp]})`, `<h3>벤치 선수로 교체</h3>${subs || '<p class="muted">후보가 없습니다.</p>'}<h3>수비 위치 맞바꾸기</h3>${swaps || '<p class="muted">바꿀 수 있는 선수가 없습니다.</p>'}`);
    }
    return '';
  }
  const fitChip = (p, ps) => { if (!p || ps === 'DH') return '<span></span>'; const l = L.fitLevel(p, ps); return l === 2 ? '<span class="chip in">주포지션</span>' : l === 1 ? '<span class="chip">가능</span>' : '<span class="chip bad">부적합</span>'; };

  /* ---------------- 화면 안에서 직접 지시(탭) ----------------
   * 경기장 그림의 주자·타자·투수를 눌러 그 자리에서 쓸 수 있는 지시만 팝업으로 연다. 효과는 기존 작전(liveTactic/setTactic)과 같다.
   * 코치 조언의 추천 대상은 맥박 표시로 알려 준다. 아래 '작전' 시트는 전체 목록으로 그대로 남는다. */
  const BASE_NM = ['1루', '2루', '3루'];
  const stealFrom = (bs, outs) => (outs >= 2 ? -1 : (bs[1] && !bs[2] ? 1 : (bs[0] && !bs[1] ? 0 : -1)));   // 엔진 steal()이 고르는 주자와 같은 규칙
  const recTarget = a => ({ hold: 'b0', ibb: 'home', inf: 'b2', pcOpen: 'pit', mv: 'pit', bunt: 'bat', har: 'b0', contact: 'bat', power: 'bat', phOpen: 'bat', prOpen: 'b0' }[a] || null);
  const shortNm = n => { const t = String(n || ''); return t.length > 4 ? t.slice(0, 4) : t; };
  function fieldHtml(g, adv) {
    const lv = ui.live, us = lv.ctx.userSide, myBat = g.batSide === us, myField = g.fldSide === us, bs = g.bases, rec = new Set(adv.map(x => recTarget(x.a)).filter(Boolean)), f = g.pitchFatigue(g.fldSide);
    const pb = P(g.batter.id), pp = P(g.pitcher.id), left = Math.max(0, 100 - Math.round(f.pct * 100));
    const pos = [[190, 105, 'b0'], [120, 40, 'b1'], [50, 105, 'b2']];
    const hit = (key, cx, cy, label, on) => `<g class="${on ? 'tap' : ''} ${rec.has(key) ? 'rec' : ''}" ${on ? `role="button" tabindex="0" data-act="livePop" data-a="${key}" aria-label="${esc(label)}"` : ''}><circle class="hit" cx="${cx}" cy="${cy}" r="24"/>`;
    const base = ([x, y, k], i) => { const r = bs[i], rp = r ? P(r.id) : null; return `${hit(k, x, y, `${BASE_NM[i]} 주자 ${rp ? rp.ko : ''} 지시`, !!r)}<rect class="base ${r ? 'on' : ''}" x="${x - 9}" y="${y - 9}" width="18" height="18" transform="rotate(45 ${x} ${y})"/>${r ? `<text x="${x}" y="${y + 26}" text-anchor="middle">${esc(shortNm(rp ? rp.ko : r.name))}</text>` : ''}</g>`; };
    const home = `${hit('home', 120, 168, '홈 플레이트 지시', true)}<path class="plate" d="M112 160h16v8l-8 7-8-7z"/><text x="120" y="188" text-anchor="middle">${myBat ? '내 타자' : '상대 타자'}</text></g>`;
    const bat = `${hit('bat', 168, 163, `${myBat ? '내' : '상대'} 타자 ${pb ? pb.ko : ''} 지시`, true)}<rect class="chipbg" x="140" y="150" width="56" height="26" rx="6"/><text x="168" y="161" text-anchor="middle" class="b">${esc(shortNm(pb ? pb.ko : g.batter.name))}</text><text x="168" y="172" text-anchor="middle" class="s">${g.idx[g.batSide] % 9 + 1}번 타자</text></g>`;
    const mound = `${hit('pit', 120, 105, `${myField ? '내' : '상대'} 투수 ${pp ? pp.ko : ''} 지시`, true)}<circle class="mound" cx="120" cy="105" r="13"/><text x="120" y="109" text-anchor="middle" class="b">${esc(shortNm(pp ? pp.ko : g.pitcher.name))}</text><rect class="sbar" x="98" y="122" width="44" height="5" rx="2"/><rect class="sfill ${f.over > 0 ? 'dead' : f.pct >= 0.85 ? 'warn' : ''}" x="98" y="122" width="${(44 * left / 100).toFixed(1)}" height="5" rx="2"/></g>`;
    return `<svg class="fieldsvg" viewBox="0 0 240 192" role="group" aria-label="경기장: 주자·타자·투수를 눌러 지시"><polygon class="grass" points="120,40 190,105 120,168 50,105"/>${pos.map(base).join('')}${mound}${bat}${home}</svg>`;
  }
  function popSheet() {
    const lv = ui.live; if (!lv || !lv.pop) return ''; lvOrders(lv);
    const ctx = lv.ctx, g = ctx.live, us = ctx.userSide, myBat = g.batSide === us, myField = g.fldSide === us, bs = g.bases, T = g.tact[us], k = lv.pop === 'home' && g.batSide === us ? 'bat' : lv.pop;   // 내 공격 중 홈 플레이트 = 타자
    const b = (a, label, on, why, hint) => `<button class="big" data-act="popDo" data-a="${a}" ${on ? '' : 'disabled'}>${label}${hint ? `<span class="muted small"> · ${hint}</span>` : ''}${!on && why ? `<span class="why small"> · ${why}</span>` : ''}</button>`;
    const seg = (kind, cur, lbls) => `<div class="seg">${Object.entries(lbls).map(([v, t]) => `<button data-act="popDo" data-a="set:${kind}:${v}" aria-pressed="${cur === v}">${t}</button>`).join('')}</div>`;
    let title = '', body = '';
    if (/^b[012]$/.test(k)) {
      const i = +k[1], r = bs[i], rp = r ? P(r.id) : null; if (!r) { lv.pop = null; return ''; }
      const sp = rp ? L.sub(rp).주력 : null; title = `${BASE_NM[i]} 주자 ${rp ? rp.ko : r.name}`;
      const info = `<div class="small muted">${sp !== null ? `주력 ${sp}` : ''}${rp ? ` · 올 시즌 ${batLine(rp.id)}` : ''}</div>`;
      if (myBat) {
        const sf = stealFrom(bs, g.outs);
        body = info + b(`tac:steal`, '도루', sf === i, g.outs >= 2 ? '2사에는 불가' : sf < 0 ? '도루할 수 있는 주자가 없음' : `선두 주자(${BASE_NM[sf]})만 시도`, '성공하면 한 베이스 진루') + b('tac:har', '히트앤드런', i === 0 && !bs[1] && g.outs < 2, '1루 주자만 · 2사 미만', '주자 스타트 + 타자는 맞히기')
          + b(`open:pr:${i}`, '대주자 교체', true, '', '이 주자를 교체');
      } else {
        const pk = g.h.pk || 0;
        body = info + b(`po:${i}`, `견제구 (${pk}회${pk >= 2 ? ' · 다음은 보크' : ''})`, myField, '', '주자를 잡을 수 있으나 성공률 낮음') + b(`set:hold:${T.hold ? 0 : 1}`, `주자 견제 지시 ${T.hold ? '끄기' : '켜기'}`, true, '', '도루 시도·성공을 크게 줄임')
          + (i === 2 ? b(`set:inf:${T.inf ? 0 : 1}`, `전진 수비 ${T.inf ? '끄기' : '켜기'}`, true, '', '쉬운 득점 방지, 내야 안타 증가') : '');
      }
    } else if (k === 'home') {
      title = '홈 플레이트';
      body = myField ? b('tac:ibb', '고의사구', true, '', '타자를 거르고 병살 기회') + b(`set:inf:${T.inf ? 0 : 1}`, `전진 수비 ${T.inf ? '끄기' : '켜기'}`, true, '', '3루 주자·2사 미만에서 득점 방지') : `<div class="small muted">내 공격 중입니다. 타자 카드를 눌러 접근 방식·번트·대타를 고르세요.</div>`;
    } else if (k === 'bat') {
      const pb = P(g.batter.id); title = `${myBat ? '내' : '상대'} 타자 ${pb ? pb.ko : g.batter.name} (${g.idx[g.batSide] % 9 + 1}번)`;
      const info = `<div class="small muted">${pb ? `${posName[pb.pos] || ''} · OVR ${L.ovr(pb)} · 올 시즌 ${batLine(pb.id)}` : ''}</div>`;
      if (myBat) body = info + `<div class="small" style="margin-top:6px">이 타자의 접근 <span class="muted">(이 타자가 설 때만 적용)</span></div>${seg('bplan', lv.batPlan[g.batter.id] || lv.batBase, BAT_LBL)}<p class="help">${BAT_HELP[lv.batPlan[g.batter.id] || lv.batBase] || '기본: 선수 능력치대로 타석에 섭니다.'}</p><div class="small">모든 타자의 기본 접근 <span class="muted">(타자별 설정이 없을 때)</span></div>${seg('bbase', lv.batBase, BAT_LBL)}`
        + b('tac:bunt', '희생번트', !!(bs[0] || bs[1] || bs[2]) && g.outs < 2, '주자가 있고 2사 미만일 때', '주자를 한 베이스 보냄') + b('open:ph', '대타', true, '', '타자를 교체');
      else body = info + b('tac:ibb', '고의사구', true, '', '타자를 거르고 1루를 채움') + `<p class="help">상대 타자는 지시할 수 없습니다. 투수 카드에서 투구 접근을 정하세요.</p>`;
    } else if (k === 'pit') {
      const pp = P(g.pitcher.id), f = g.pitchFatigue(g.fldSide), left = Math.max(0, 100 - Math.round(f.pct * 100)); title = `${myField ? '내' : '상대'} 투수 ${pp ? pp.ko : g.pitcher.name}`;
      const info = `<div class="small muted">${pp ? `OVR ${L.ovr(pp)} · ` : ''}남은 체력 ${left}%${f.over > 0 ? ' · 한계 초과(구위 저하)' : ''} · 상대 타자 ${f.bf}명</div>`;
      if (myField) body = info + `<div class="small" style="margin-top:6px">투구 접근</div>${seg('pit', T.pit, PIT_LBL)}<p class="help">${PIT_HELP[T.pit] || '기본: 투수 능력치대로 던집니다.'}</p>`
        + b('tac:mv', `마운드 방문 (${g.visits[us]}/3)`, g.canVisit(us), '경기당 3번 · 한 이닝에 한 번', '체력 조금 회복, 다음 3타자 안정') + b('open:pc', '투수 교체', true, '', '불펜에서 고르기') + b('open:plan', '교체 예약 · 자동 진행 멈춤 설정', true, '', '체력 기준 자동 교체, 대타 예약');
      else body = info + `<p class="help">상대 투수는 지시할 수 없습니다.</p>`;
    } else if (k === 'plan') {
      title = '교체 예약 · 자동 진행 멈춤'; const E = ctx.E, f = lv.form, usedP = new Set([...g.staff[us].used]);
      const cands = L.pitchers(U(), true).filter(p => E.pitById[p.id] && !usedP.has(E.pitById[p.id].name) && p.id !== g.pitcher.id).sort((a, c) => pcScore(c) - pcScore(a)).slice(0, 12), bench = benchOf().sort((a, c) => L.ovr(c) - L.ovr(a)).slice(0, 12);
      const sel = (key, opts, cur) => `<select data-sel="${key}" style="flex:1;min-width:0">${opts.map(([v, t]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      const rl = lv.resv.map(r => `<div class="row small" style="flex-wrap:nowrap"><span style="flex:1;min-width:0">${r.kind === 'pc' ? `남은 체력 ${r.thr}% 이하 → <b>${esc(P(r.to) ? P(r.to).ko : '')}</b> 투입` : `<b>${esc(P(r.batter) ? P(r.batter).ko : '')}</b> 타석 → <b>${esc(P(r.to) ? P(r.to).ko : '')}</b> 대타`}</span><button class="sm" data-act="popDo" data-a="rv:del:${r.id}">취소</button></div>`).join('');
      body = `<div class="small"><b>자동 진행 멈춤</b> <span class="muted">('이닝 끝까지'·'경기 끝까지' 중 이 조건이 새로 생기면 멈춥니다)</span></div>
        <div class="seg">${[[0, '체력 알림 끔'], [30, '남은 체력 30%'], [15, '남은 체력 15%']].map(([v, t]) => `<button data-act="popDo" data-a="set:stopfat:${v}" aria-pressed="${lv.stops.fat === v}">${t}</button>`).join('')}</div>
        <div class="seg"><button data-act="popDo" data-a="set:stoprisp:${lv.stops.risp ? 0 : 1}" aria-pressed="${lv.stops.risp}">내 수비 중 득점권 주자 ${lv.stops.risp ? 'ON' : 'OFF'}</button></div>
        <div class="small" style="margin-top:6px"><b>예약</b> <span class="muted">(조건이 되면 자동으로 실행)</span></div>${rl || '<div class="small muted">예약이 없습니다.</div>'}
        <div class="small" style="margin-top:6px">투수 교체 예약</div>
        <div class="row">${sel('rvpcpct', [[40, '남은 체력 40%'], [30, '남은 체력 30%'], [15, '남은 체력 15%']], f.rvpcpct || 30)}${sel('rvpcto', cands.map(p => [p.id, `${p.ko} (${L.ovr(p)})`]), f.rvpcto || '')}<button class="sm primary" data-act="popDo" data-a="rv:addpc" ${cands.length ? '' : 'disabled'}>예약</button></div>
        <div class="small" style="margin-top:6px">대타 예약 <span class="muted">(그 타자 차례가 되면)</span></div>
        <div class="row">${sel('rvphbat', g.L[us].map((x, i) => [x.id, `${i + 1}번 ${nm(x)}`]), f.rvphbat || '')}${sel('rvphto', bench.map(p => [p.id, `${p.ko} (${L.ovr(p)})`]), f.rvphto || '')}<button class="sm primary" data-act="popDo" data-a="rv:addph" ${bench.length ? '' : 'disabled'}>예약</button></div>
        <p class="help">예약은 실제 교체와 같은 효과이며, 실행되면 중계에 ⏱ 표시와 함께 기록되고 경기 후 되짚기에도 포함됩니다. 이미 던진 투수·교체된 선수는 쓸 수 없어 예약이 취소됩니다.</p>`;
    }
    return `<div class="sheet-bg" data-act="livePopClose"><div class="sheet pop" data-stop="1" role="dialog" aria-label="${esc(title)} 지시"><div class="grabber"></div><div class="row"><h2 style="margin:0">${esc(title)}</h2><span class="sp"></span><button class="sm" data-act="livePopClose">닫기</button></div><div class="popbody">${body}</div></div></div>`;
  }
  function sheetsHtml() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, myBat = g.batSide === us, myField = g.fldSide === us, bs = g.bases, runners = bs[0] || bs[1] || bs[2], T = g.tact[us];
    if (lv.pop) return popSheet();
    if (lv.sheet === 'tact') {
      const seg = (kind, cur, lbls) => `<div class="seg">${Object.entries(lbls).map(([k, v]) => `<button data-act="liveSet" data-a="${kind}" data-b="${k}" aria-pressed="${cur === k}">${v}</button>`).join('')}</div>`;
      return `<div class="sheet-bg" data-act="liveSheetClose"><div class="sheet" data-stop="1"><div class="grabber"></div><div class="row"><h2>작전</h2><span class="sp"></span><button class="sm" data-act="liveSheetClose">닫기</button></div>
        <div><h3>공격 접근 <span class="muted small">(내가 공격할 때)</span></h3>${seg('bat', T.bat, BAT_LBL)}<p class="help">${BAT_HELP[T.bat] || '기본: 선수 능력치대로 타석에 섭니다.'}</p></div>
        <div><h3>투구 접근 <span class="muted small">(내가 수비할 때)</span></h3>${seg('pit', T.pit, PIT_LBL)}<p class="help">${PIT_HELP[T.pit] || '기본: 투수 능력치대로 던집니다.'}</p></div>
        <div><h3>수비 위치</h3><div class="seg"><button data-act="liveSet" data-a="inf" data-b="${T.inf ? 0 : 1}" aria-pressed="${T.inf}">전진 수비 ${T.inf ? 'ON' : 'OFF'}</button><button data-act="liveSet" data-a="hold" data-b="${T.hold ? 0 : 1}" aria-pressed="${T.hold}">주자 견제 ${T.hold ? 'ON' : 'OFF'}</button></div><p class="help">전진 수비: 3루 주자·2사 미만에서 쉬운 득점을 줄이는 대신 내야를 뚫는 안타가 늘어납니다.<br>주자 견제: 1루 주자가 있을 때 도루 시도와 성공을 크게 줄이지만 투구에 약간 부담이 됩니다.</p></div>
        <div><h3>즉시 작전</h3><div class="tacts"><button data-act="liveTac" data-a="bunt" ${myBat && runners && g.outs < 2 ? '' : 'disabled'}>희생번트</button><button data-act="liveTac" data-a="steal" ${myBat && runners && g.outs < 2 ? '' : 'disabled'}>도루</button><button data-act="liveTac" data-a="har" ${myBat && bs[0] && !bs[1] && g.outs < 2 ? '' : 'disabled'}>히트앤드런</button><button data-act="liveTac" data-a="ibb" ${myField ? '' : 'disabled'}>고의사구</button><button data-act="liveTac" data-a="mv" ${g.canVisit(us) ? '' : 'disabled'}>마운드 방문 (${g.visits[us]}/3)</button><button class="${(g.h.pk || 0) >= 2 ? 'warn' : ''}" data-act="liveTac" data-a="po" ${myField && runners ? '' : 'disabled'}>견제구 (${g.h.pk || 0}회${(g.h.pk || 0) >= 2 ? ' · 다음은 보크' : ''})</button></div><p class="help">번트·도루는 내 공격 중 주자가 있고 2사 미만일 때 쓸 수 있습니다.<br>히트앤드런: 1루 주자가 스타트하고 타자는 맞히려 합니다. 삼진·병살이 줄고 주자가 한 베이스 더 가기 쉽지만, 컨택이 약한 타자는 약한 타구가 늘고 빠르지 않은 주자는 이득이 적습니다.<br>견제구: 주자를 잡을 수 있지만 성공률이 낮고, 이닝 중 3번째 견제는 보크입니다.<br>마운드 방문: 경기당 3번까지, 한 이닝에 두 번은 안 됩니다. 투수 체력을 조금 회복시키고 다음 3타자 동안 볼넷·피홈런을 줄입니다.</p></div></div></div>`;
    }
    if (lv.sheet === 'subs') return `<div class="sheet-bg" data-act="liveSheetClose"><div class="sheet" data-stop="1"><div class="grabber"></div><div class="row"><h2>교체</h2><span class="sp"></span><button class="sm" data-act="liveSheetClose">닫기</button></div>
        <div class="seg" style="flex-direction:column;align-items:stretch"><button class="big" data-act="liveTac" data-a="pcOpen" ${myField ? '' : 'disabled'}>투수 교체</button><button class="big" data-act="liveTac" data-a="phOpen" ${myBat ? '' : 'disabled'}>대타</button><button class="big" data-act="liveTac" data-a="prOpen" ${myBat && runners ? '' : 'disabled'}>대주자</button><button class="big" data-act="liveTac" data-a="dsOpen">수비 교체 · 위치 변경</button></div><p class="help">투수 교체는 내 수비 중, 대타·대주자는 내 공격 중에 쓸 수 있습니다. 교체된 선수는 다시 나올 수 없습니다.</p></div></div>`;
    return '';
  }
  /* ---------------- 경기 전 브리핑: 상대 선발·상대 타순·상성, 타순 제안(타순만, 이번 경기만) ---------------- */
  const HAND = { L: '좌', R: '우', S: '양' };
  function screenPre() {
    const pre = ui.pre; if (!pre.pg) pre.pg = L.preGame(); const pg = pre.pg;
    if (!pg) { ui.pre = null; return ''; }
    const sp = pg.oppSp, tn = pg.source === 'tonight', pf = pg.park || {}, ln = sp.line;
    const platChip = u => u.plat === 'good' ? '<span class="chip in">유리</span>' : u.plat === 'bad' ? '<span class="chip warn">불리</span>' : '';
    const pct = v => (v * 100).toFixed(1) + '%', ob = v => v.toFixed(3).replace(/^0/, '');
    const hs = x => x.hand ? `<span class="muted small">${HAND[x.hand] || ''}타</span>` : '';
    const sugList = pg.sug, curIdx = new Map(pg.cur.map((u, i) => [u.id, i]));
    const move = (u, i) => { const d = curIdx.get(u.id) - i; return d > 0 ? `<span class="pos small">▲${d}</span>` : d < 0 ? `<span class="neg small">▼${-d}</span>` : '<span class="muted small">-</span>'; };
    const lhn = pg.cur.filter(u => u.plat === 'good').length, bad = pg.cur.filter(u => u.plat === 'bad').length;
    const srcNote = pg.source === 'preset' ? `<div class="small muted" style="margin-top:6px">기본 라인업: 프리셋(${esc(pg.preset)}) · 오늘 타순을 적용하면 프리셋 대신 이 타순이 쓰입니다.</div>` : tn ? `<div class="small" style="margin-top:6px"><span class="chip in">오늘 타순 적용 중</span> <span class="muted">이번 경기에만 적용 — 저장된 라인업·프리셋은 그대로입니다.</span></div>` : '';
    const abs = pg.absent.length ? `<div class="small muted" style="margin-top:6px">컨디션 난조 결장: ${pg.absent.map(a => `${esc(a.out)} → ${esc(a.in)}`).join(', ')} (이미 반영됨)</div>` : '';
    const tbl = `<div class="tablewrap"><table><thead><tr><th>#</th><th class="l">선수</th><th>손</th><th>상성</th><th>출루</th><th>홈런</th><th>삼진</th></tr></thead><tbody>${pg.cur.map((u, i) => `<tr><td class="n">${i + 1}</td><td class="l"><b>${esc(u.ko)}</b> <span class="muted small">${esc(posName[u.pos] || u.pos)}</span></td><td>${hs(u)}</td><td>${platChip(u)}</td><td class="n">${ob(u.ob)}</td><td class="n">${pct(u.hr)}</td><td class="n">${pct(u.k)}</td></tr>`).join('')}</tbody></table></div>`;
    const cmp = pg.keep ? `<div class="small" style="margin-top:8px">현재 타순이 상대 선발 기준으로 거의 최적입니다 <span class="muted">(제안 효과 ${pg.gain >= 0 ? '+' : ''}${pg.gain.toFixed(2)}점/경기 — 의미 있는 차이 없음)</span></div>`
      : `<div style="margin-top:10px"><b>제안 타순</b> <span class="muted small">같은 9명·같은 수비 위치, 순서만 변경 · 기대 득점 ${pg.curExp.toFixed(2)} → <b class="pos">${pg.sugExp.toFixed(2)}</b> (+${pg.gain.toFixed(2)}/경기)</span></div>
        <div class="tablewrap"><table><thead><tr><th>#</th><th class="l">현재</th><th class="l">제안</th><th></th></tr></thead><tbody>${sugList.map((u, i) => `<tr><td class="n">${i + 1}</td><td class="l muted">${esc(pg.cur[i].ko)}</td><td class="l"><b>${esc(u.ko)}</b> ${platChip(u)}</td><td>${move(u, i)}</td></tr>`).join('')}</tbody></table></div>
        <button class="primary" style="width:100%;min-height:48px;margin-top:8px" data-act="preApply">이번 경기만 제안 타순 적용</button>`;
    const note = `<div class="small muted" style="margin-top:8px">⚠ 기대 득점은 모델 추정입니다 — 경기 엔진과 같은 확률식·진루 규칙으로 계산하되 상대 선발은 평균 ${pg.spInn}이닝(엔진과 같은 분포) 던지고 이후는 상대 불펜 평균으로 계산하며(도루·폭투·작전·연장·9회말 제외) 비교용으로만 씁니다. 실제 경기 결과를 보장하지 않습니다.</div>`;
    return `<div class="lvwrap"><div class="lvhead"><b style="font-family:var(--font-display);font-size:18px">경기 전 브리핑</b><span class="muted small">${L.dateStr(pg.day)} · ${pg.isHome ? '홈' : '원정'} · ${esc(park(pg.home))}</span></div>
      <div class="card"><div class="row"><h2 style="margin:0">${teamTag(pg.opp)}</h2><span class="sp"></span>${pf.hr ? `<span class="muted small">${pf.hr >= 1.08 ? '타자 친화' : pf.hr <= 0.85 ? '투수 친화' : '중립'} 구장 (홈런 ${pf.hr.toFixed(2)})</span>` : ''}</div>
        <div style="margin-top:8px"><b>상대 선발</b> <b>${esc(sp.ko)}</b> <span class="muted small">${sp.hand ? (HAND[sp.hand] || '') + '투' : ''}${sp.ovr !== null ? ' · OVR ' + sp.ovr : ''}</span></div>
        <div class="small muted">${ln ? `올 시즌 ${ln.ip}이닝 · 9이닝당 실점 ${ln.ra9} · 탈삼진 ${ln.k9} · 볼넷 ${ln.bb9} · 피홈런 ${ln.hr9}` : '올 시즌 기록 없음'}</div>
        <div class="small" style="margin-top:6px">상성: 유리 ${lhn}명 · 불리 ${bad}명 <span class="muted">(좌/우·양타 상성, 엔진의 플래툰 보정과 동일)</span></div>${srcNote}${abs}
        <div class="small muted" style="margin-top:8px">상대 타순: ${pg.oppLineup.map(x => `${esc(x.ko)}${x.hand ? `<span class="small">(${HAND[x.hand] || ''})</span>` : ''}`).join(' · ')}</div></div>
      <div class="card"><h2>우리 타순 — 상대 선발 기준</h2><div class="small muted">출루·홈런·삼진은 이 상대 선발에게 각 타자가 낼 타석당 확률입니다(구장·상대 수비 반영).</div>${tbl}${cmp}${tn ? `<button style="width:100%;min-height:44px;margin-top:8px" data-act="preUndo">오늘 타순 적용 취소</button>` : ''}${note}</div>
      <div class="card"><div class="row"><button class="primary big" style="flex:1" data-act="preStart">경기 시작</button></div>
        <label class="row small" style="gap:6px;margin-top:8px"><input type="checkbox" data-act="preSkip" ${pref('briefSkip', '0') === '1' ? 'checked' : ''}>다음부터 경기 전 브리핑 건너뛰기 <span class="muted">(설정은 이 기기에 저장)</span></label></div></div>`;
  }
  function screenLive() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, myBat = g.batSide === us, myField = g.fldSide === us, fin = g.finished, E = ctx.E, T = g.tact[us];
    const b = g.batter, pt = g.pitcher, bp = P(b.id), pp = P(pt.id), tr = E.tracking().pit[pt.id] || { outs: 0, R: 0, K: 0 }, f = g.pitchFatigue(g.fldSide);
    const lp = lv.feed.find(x => !x.sys) || lv.feed[0], lpHtml = lp ? `<div class="lastplay ${lp.run ? 'run' : ''}" aria-live="polite"><span class="w">${lp.w || ''}</span><span class="t">${esc(lp.t)}</span></div>` : '<div class="lastplay"><span class="t">「다음 타석」을 눌러 경기를 시작하세요</span></div>';
    const chips = `<div class="tacts small"><span class="chip ${T.bat !== 'normal' ? 'in' : ''}">공격 ${BAT_LBL[T.bat]}</span><span class="chip ${T.pit !== 'normal' ? 'in' : ''}">투구 ${PIT_LBL[T.pit]}</span>${T.inf ? '<span class="chip in">전진 수비</span>' : ''}${T.hold ? '<span class="chip in">견제 지시</span>' : ''}${g.calm[us] > 0 ? `<span class="chip in">투수 안정 (${g.calm[us]}타자)</span>` : ''}${ctx.auto ? '<span class="chip">자동 불펜</span>' : '<span class="chip bad">수동 불펜</span>'}</div>`;
    const adv = fin ? [] : advice();
    const stick = `<div class="lvstick"><div class="card score"><div class="tablewrap">${liveScore(g)}</div><div class="situ" style="margin-top:6px"><div class="outs" aria-label="${g.outs}아웃">${[0, 1, 2].map(i => `<i class="${i < g.outs && !fin ? 'on' : ''}"></i>`).join('')}</div><span class="small">${g.inning}회${g.top ? '초' : '말'} · ${fin ? '종료' : (g.top ? KO[g.away] : KO[g.home]) + ' 공격'} · ${g.outs}아웃</span><span class="sp"></span>${diamond(g)}</div></div>${lpHtml}</div>`;
    const fcls = f.over > 0 ? 'dead' : f.pct >= 0.85 ? 'warn' : '';
    const matchup = `<div class="cards2"><div class="pcard"><div class="small muted">${myBat ? '내 타자' : '상대 타자'} (${g.idx[g.batSide] % 9 + 1}번)</div><div class="nm">${esc(bp ? bp.ko : b.name)} ${bp ? ovrChip(L.ovr(bp)) : ''}</div><div class="small muted">${bp ? posName[bp.pos] : ''}${bp && L.handLabel(bp) ? ' · ' + L.handLabel(bp) : ''} · 올 시즌 ${bp ? batLine(bp.id) : ''}</div>${platChip(bp, pp)}${bp ? subHtml(bp) : ''}</div>
      <div class="pcard"><div class="small muted">${myField ? '내 투수' : '상대 투수'}</div><div class="nm">${esc(pp ? pp.ko : pt.name)} ${pp ? ovrChip(L.ovr(pp)) : ''}${pp && L.handLabel(pp) ? ` <span class="chip">${L.handLabel(pp)}</span>` : ''}</div><div class="small muted">이 경기 ${Math.floor(tr.outs / 3)}${tr.outs % 3 ? '.' + tr.outs % 3 : ''}이닝 ${tr.R}실점 ${tr.K}K · 상대 타자 ${f.bf}명</div><div class="fbar ${fcls}" title="남은 체력 ${Math.max(0, 100 - Math.round(f.pct * 100))}% (상대 타자 ${f.bf}명 / 한계 ${f.lim}명)" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0, 100 - Math.round(f.pct * 100))}" aria-label="투수 남은 체력"><i style="width:${Math.max(0, 100 - Math.round(f.pct * 100))}%"></i></div><div class="small ${f.over > 0 ? 'neg' : 'muted'}">${f.over > 0 ? '체력 바닥 · 한계 초과(구위 저하 중)' : `남은 체력 ${Math.max(0, 100 - Math.round(f.pct * 100))}%${f.pct >= 0.85 ? ' · 한계에 가까움' : ''}`}</div>${pp ? subHtml(pp) : ''}</div></div>`;
    const advHtml = adv.length ? `<div class="card"><h2>코치 조언</h2><div class="advice">${adv.map(a => `<div class="adv"><span>${a.t}</span><button class="sm" data-act="liveAdv" data-a="${a.a}">${a.l}</button></div>`).join('')}</div></div>` : '';
    const feed = lv.feed.slice(0, 60).map(x => `<li class="${x.cm ? 'sys cm' : x.sys ? 'sys' : x.run ? 'hl' : ''}"><span class="w">${x.w}</span><span>${esc(x.t)}</span></li>`).join('');
    const ass = g.assign[us], lineup = g.L[us].map((x, i) => { const f2 = ass.find(a => a[0] === x); return `<tr><td class="n">${i + 1}</td><td class="l">${esc(nm(x))}</td><td class="l small muted">${f2 ? posName[f2[1]] : '지명'}</td></tr>`; }).join('');
    const dock = fin ? `<div class="r"><button class="primary" style="font-size:16px" data-act="liveFinish">경기 종료 · 결과 반영 (${KO[g.away]} ${g.score.away} : ${g.score.home} ${KO[g.home]})</button></div>`
      : `${adv.length ? `<div class="r chiprow" aria-label="추천 작전">${adv.slice(0, 2).map(x => `<button class="sm recchip" data-act="liveAdv" data-a="${x.a}">★ ${x.l}</button>`).join('')}</div>` : ''}<div class="r"><button class="primary" data-act="liveRun" data-a="pa">다음 타석</button><button data-act="liveRun" data-a="inning">이닝 끝까지</button><button data-act="liveRun" data-a="end">경기 끝까지</button></div><div class="r"><button data-act="liveSheet" data-a="tact">작전</button><button data-act="liveSheet" data-a="subs">교체</button><button data-act="liveAuto">${ctx.auto ? '자동 불펜 ON' : '자동 불펜 OFF'}</button></div>`;
    return `<div class="lvwrap"><div class="lvhead"><b style="font-family:var(--font-display);font-size:18px">${logo(g.away, 28)} ${KO[g.away]} @ ${logo(g.home, 28)} ${KO[g.home]}</b>${L.isRival(g.home, g.away) && (g.home === U() || g.away === U()) ? ` <span class="chip warn">${esc(L.rivalName(g.home, g.away))}</span>` : ''}<span class="muted small">${park(g.home)} · ${ctx.post ? '포스트시즌' : L.dateStr(L.S.day)}${ctx.prep.absent && ctx.prep.absent.length ? ` · 결장 ${ctx.prep.absent.map(a => esc(a.out.ko) + '→' + esc(a.in.ko)).join(', ')}` : ''}</span><span class="sp"></span>${fin ? '' : '<button class="warn sm" data-act="liveAbort">자동으로 끝내기</button>'}</div>
      ${stick}<div class="livecols"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${fin ? '' : `<div class="card"><div class="row"><h3 style="margin:0">경기장</h3><span class="sp"></span><span class="small muted">주자·타자·투수를 눌러 지시</span></div>${fieldHtml(g, adv)}${chips}${ordersChips()}</div><div class="card">${matchup}</div>${momentCard(g, us, myBat, myField)}`}${advHtml}</div>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0"><details class="card" open><summary>경기 기록</summary><ul class="feed" style="margin-top:8px">${feed || '<li class="muted">경기를 시작하세요.</li>'}</ul></details><details class="card"><summary>내 라인업</summary><div class="tablewrap"><table><tbody>${lineup}</tbody></table></div></details></div></div></div>
      <div class="livedock">${dock}</div>${pickerHtml()}${fin ? '' : sheetsHtml()}`;
  }


  /* ---------------- 전역 검색 · 선수 비교 · 확정 전 요약 · 프런트 데스크 ---------------- */
  const tipsHtml = () => `<div class="small muted" style="margin-top:6px">이름 일부, <b>초성</b>(예: ㅇㅅㅈ), 팀·포지션·태그를 공백으로 섞어 검색합니다.<br>예) <code>삼성 투수</code> · <code>외국인</code> · <code>FA 포수</code> · <code>2군 내야수</code> · <code>부상</code> · <code>김</code></div>`;
  function searchHtml(q) {
    q = String(q || '').trim(); const rec = (ui.recent || []).filter(r => !!r);
    if (!q) return `${rec.length ? `<div class="small" style="margin-top:8px"><b>최근 검색</b></div>${rec.map(r => `<div class="srow" data-act="searchPick" data-a="${r.k}"><div class="sm1"><b>${esc(r.label)}</b> <span class="muted small">${esc(r.sub || '')}</span></div></div>`).join('')}` : ''}${tipsHtml()}`;
    const isCho = /^[ㄱ-ㅎ]+$/.test(q), pl = L.searchPlayers(q, 30);
    const teams = TEAMS.filter(t => KO[t].includes(q) || (isCho && L.chosung(KO[t]).includes(q))), scr = Object.entries(SCR).filter(([k, v]) => v.includes(q) || (isCho && L.chosung(v).includes(q)));
    const prow = x => { const p = x.p, hid = L.hiddenForeign(p), ov = hid ? `<span class="chip">추정 ${Math.round(L.fEst(p).o)}</span>` : ovrChip(L.ovr(p)); return `<div class="srow" data-act="searchPick" data-a="p:${p.id}"><div class="sm1"><b>${esc(p.ko)}</b> ${p.team === 'FA' ? '<span class="chip warn">FA</span>' : teamTag(p.team)} <span class="muted small">${pos(p)} · ${p.age}세${p.foreign ? ' · ' + (p.aq ? '아시아쿼터' : '외국인') : ''}${p.team in KO && p.team === U() ? (p.active ? ' · 1군' : ' · 2군') : ''}${L.isInj(p) ? ' · 부상' : ''}</span></div><div class="sm2">${ov}<button class="sm" data-act="cmpAdd" data-a="${p.id}" aria-label="${esc(p.ko)} 비교에 추가">⚖</button></div></div>`; };
    return `${teams.length ? `<div class="small" style="margin-top:8px"><b>팀</b></div>${teams.map(t => `<div class="srow" data-act="searchPick" data-a="t:${t}"><div class="sm1">${logo(t, 22)} <b>${KO[t]}</b> <span class="muted small">팀 정보</span></div></div>`).join('')}` : ''}
      ${scr.length ? `<div class="small" style="margin-top:8px"><b>화면</b></div>${scr.map(([k, v]) => `<div class="srow" data-act="searchPick" data-a="s:${k}"><div class="sm1"><b>${v}</b> <span class="muted small">화면 열기</span></div></div>`).join('')}` : ''}
      ${pl.length ? `<div class="small" style="margin-top:8px"><b>선수</b> <span class="muted">${pl.length}명${pl.length >= 30 ? '(상위 30명)' : ''}</span></div>${pl.map(prow).join('')}` : ''}
      ${!teams.length && !scr.length && !pl.length ? '<div class="small muted" style="margin-top:10px">검색 결과가 없습니다.</div>' : ''}`;
  }
  function searchSheet() {
    if (!ui.search) return ''; const q = ui.search.q || '';
    return `<div class="sheet-bg" data-act="searchClose"><div class="sheet" data-stop="1" role="dialog" aria-label="검색"><div class="grabber"></div><div class="row"><input id="gsq" type="search" autocomplete="off" placeholder="선수·팀·화면 검색 (초성 가능)" value="${esc(q)}" style="flex:1;min-width:0" aria-label="검색어"><button class="sm" data-act="searchClose">닫기</button></div><div id="gsres">${searchHtml(q)}</div></div></div>`;
  }
  function cmpTray() {
    const c = ui.cmp || []; if (!c.length || ui.cmpOpen || ui.live) return '';
    return `<div class="cmptray" role="region" aria-label="선수 비교"><span class="small">⚖ 비교</span>${c.map(id => `<span class="chip">${esc(P(id) ? P(id).ko : id)} <button class="linkbtn" data-act="cmpDel" data-a="${id}" aria-label="제외">✕</button></span>`).join('')}<span class="sp"></span><button class="sm primary" data-act="cmpOpen" ${c.length >= 2 ? '' : 'disabled'}>${c.length >= 2 ? '비교 보기' : '1명 더 추가'}</button><button class="sm" data-act="cmpClear">비우기</button></div>`;
  }
  function cmpSheet() {
    if (!ui.cmpOpen) return ''; const r = L.compareRows((ui.cmp || []).filter(id => P(id))); if (!r) { ui.cmpOpen = false; return ''; }
    let grp = '', body = '';
    for (const row of r.rows) { if (row.group !== grp) { grp = row.group; body += `<tr class="grp"><th colspan="${r.cols.length + 1}">${grp}</th></tr>`; } body += `<tr><th class="l">${row.label}</th>${row.vals.map((v, i) => `<td class="${row.best === i ? 'best' : ''}">${v.txt}</td>`).join('')}</tr>`; }
    return `<div class="sheet-bg" data-act="cmpClose"><div class="sheet cmp" data-stop="1" role="dialog" aria-label="선수 비교"><div class="grabber"></div><div class="row"><h2 style="margin:0">선수 비교</h2><span class="sp"></span><button class="sm" data-act="cmpClear">비우기</button><button class="sm" data-act="cmpClose">닫기</button></div>
      <div class="tablewrap"><table class="cmpt"><thead><tr><th></th>${r.cols.map(c => `<th><button class="linkbtn" data-act="cmpPlayer" data-a="${c.id}"><b>${esc(c.name)}</b></button><div class="small muted">${c.team === 'FA' ? 'FA' : KO[c.team] || ''} · ${c.pos} · ${c.age}세</div><button class="sm" data-act="cmpDel" data-a="${c.id}">제외</button></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="help">굵게 표시된 값이 가장 좋은 쪽입니다(동률은 표시 안 함). ${r.mixed ? '투수와 타자를 섞으면 공통 항목만 비교합니다. ' : ''}${r.cols.some(c => c.hidden) ? '스카우트로 확정되지 않은 외국인은 OVR이 추정치이고 세부 능력은 비공개입니다.' : ''}</p></div></div>`;
  }
  /* 확정 전 요약: 돈·전력·로스터가 바뀌는 결정은 변경 내용을 보여 주고 확정한다 */
  const askConfirm = cfg => { ui.cf = cfg; render(); };
  function confirmSheet() {
    const c = ui.cf; if (!c) return '';
    return `<div class="sheet-bg" data-act="cfClose"><div class="sheet" data-stop="1" role="dialog" aria-label="${esc(c.title)} 확인"><div class="grabber"></div><h2>${esc(c.title)}</h2><div class="small muted">확정하기 전에 변경 내용을 확인하세요.</div>
      <table class="cf"><tbody>${c.rows.map(([k, v, cls]) => `<tr><th class="l">${esc(k)}</th><td class="${cls || ''}">${v}</td></tr>`).join('')}</tbody></table>${(c.notes || []).map(n => `<p class="help ${n.cls || ''}">${n.t}</p>`).join('')}
      <div class="row"><button class="primary big" data-act="cfDo" ${c.disabled ? 'disabled' : ''}>${esc(c.ok || '확정')}</button><button class="big" data-act="cfClose">취소</button></div></div></div>`;
  }
  const plist = ids => ids.map(id => { const p = P(id); return p ? `${esc(p.ko)} <span class="muted small">(${pos(p)} ${L.ovr(p)} · ${money(p.contract.salary)})</span>` : ''; }).join('<br>');
  function confirmTrade() {
    const T = ui.trade, give = [...T.give].filter(id => P(id) && P(id).team === U()), get = [...T.get].filter(id => P(id) && P(id).team === T.team), ev = L.evaluateTrade(T.team, give, get);
    const sal = ids => ids.reduce((a, id) => a + P(id).contract.salary, 0), n0 = L.S.teams[U()].ids.length, act = give.filter(id => P(id).active).length, d = sal(get) - sal(give), n1 = n0 - give.length + get.length;
    askConfirm({ title: `${KO[T.team]}와 트레이드`, ok: '트레이드 실행', disabled: !(ev && ev.ok) || n1 < 44 || n1 > 130,
      rows: [['보내는 선수', plist(give)], ['받는 선수', plist(get)], ['연봉 합계 변화', `${sal(give).toFixed(1)}억 → ${sal(get).toFixed(1)}억 (<b class="${d > 0 ? 'neg' : 'pos'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}억</b>)`], ['1군에서 빠지는 선수', `${act}명`], ['로스터 인원', `${n0}명 → <b class="${n1 < 44 || n1 > 130 ? 'neg' : ''}">${n1}명</b> (44~130명)`], ['상대가 받는 가치', ev && ev.ok ? `${ev.vGive} (요구 ${ev.need})` : '-']],
      notes: [{ t: '영입한 선수는 2군으로 들어옵니다. 1군 등록은 직접 하세요. 확정하면 되돌릴 수 없습니다(실행 직전 상태는 되돌리기 ↶ 로 복구할 수 있습니다).' }, ...(n1 < 44 || n1 > 130 ? [{ t: '로스터 인원이 한도를 벗어나 실행할 수 없습니다.', cls: 'neg' }] : [])],
      run: () => A.doTradeNow() });
  }
  function confirmRelease(a) {
    const p = P(a), c = L.releaseCost(a), n = L.S.teams[U()].ids.length, blocked = n <= 44;
    askConfirm({ title: `${p.ko} 방출`, ok: '방출 확정', disabled: blocked,
      rows: [['선수', `${esc(p.ko)} <span class="muted small">(${pos(p)} ${p.age}세 · OVR ${L.ovr(p)} · ${money(p.contract.salary)} · 잔여 ${p.contract.years}년)</span>`], ['위약금 합계', `<b>${c.total.toFixed(1)}억</b>`], ['올해 비용 반영', `${c.thisYear.toFixed(1)}억`], ...(c.rec.length > 1 ? [['연도별', c.rec.map(x => `${x.year}년 ${x.amt.toFixed(1)}억`).join(' · ')]] : []), ['이사회 신뢰도', c.trust < 0 ? `<b class="neg">${c.trust}</b>` : '변화 없음'], ['방출 후 로스터', `${n}명 → ${n - 1}명 (최소 44명)`]],
      notes: [...(c.core ? [{ t: '오랜 핵심 선수 방출로 팬·선수단 반응이 좋지 않습니다.', cls: 'neg' }] : []), ...(blocked ? [{ t: '보유 선수가 최소 44명이라 방출할 수 없습니다.', cls: 'neg' }] : []), { t: '방출은 되돌릴 수 없습니다. 위약금은 올해와 남은 계약 연도에 나뉘어 반영됩니다.' }],
      run: () => A.releaseNow(a) });
  }
  function confirmFA(a) {
    const q = k => $(`[data-sel="${k}"][data-a="${a}"]`), y = q('fayears'), sal = q('fasal'), bon = q('fabonus'), p = P(a), t = U();
    if (!(y && sal) || p.foreign) { A.signFADo(a); return; }
    const offer = { years: +y.value, salary: +sal.value, bonus: bon ? +bon.value : 0 }, ev = L.faEvaluate(p, offer, t);
    if (!ev.ok) { A.signFADo(a); return; }   // 조건이 맞지 않으면 기존 안내(토스트)를 그대로 보여 준다
    const comp = L.faCompCost(p, t), cost = ev.sal + ev.bon / ev.y + comp, room = L.faRoom(t), left = room - cost, n = L.S.teams[t].ids.length;
    askConfirm({ title: `${p.ko} FA 영입`, ok: left < 0 ? '이사회 설득으로 진행' : '계약 확정',
      rows: [['선수', `${esc(p.ko)} <span class="muted small">(${pos(p)} ${p.age}세 · OVR ${L.ovr(p)})</span>`], ['계약', `${ev.y}년 · 연봉 ${ev.sal.toFixed(1)}억${ev.bon ? ` · 계약금 ${ev.bon.toFixed(1)}억` : ''}`], ['총액', `${(ev.per * ev.y).toFixed(1)}억 (연 평균 ${ev.per.toFixed(1)}억)`], ...(comp ? [['FA 보상금(올해)', `${comp.toFixed(1)}억`]] : []), ['올해 부담', `${cost.toFixed(1)}억`], ['FA 여유자금', `${room.toFixed(1)}억 → <b class="${left < 0 ? 'neg' : ''}">${left.toFixed(1)}억</b>`], ['로스터 인원', `${n}명 → ${n + 1}명`]],
      notes: [{ t: left < 0 ? '여유자금이 부족합니다. 진행하면 이사회 설득 절차(성공 확률, 신뢰도 영향)가 이어집니다.' : '영입한 선수는 2군에 등록됩니다.', cls: left < 0 ? 'neg' : '' }], run: () => A.signFADo(a) });
  }
  function screenDesk() {
    const d = L.deskInfo(), S = L.S, sev = { 3: 'bad', 2: 'warn', 1: '' };
    const todo = d.todo.length ? d.todo.map(x => `<div class="row small" style="flex-wrap:nowrap"><span class="chip ${sev[x.sev] || ''}">${x.sev >= 3 ? '긴급' : x.sev === 2 ? '중요' : '확인'}</span><span style="flex:1;min-width:0">${esc(x.text)}</span><button class="sm" data-act="${x.act}" ${x.a !== undefined ? `data-a="${esc(x.a)}"` : ''}>열기</button></div>`).join('') : '<div class="small muted">지금 처리할 일이 없습니다.</div>';
    const dl = d.deadlines.length ? d.deadlines.map(x => `<span class="chip ${x.days <= 5 ? 'warn' : ''}">${esc(x.label)} D-${Math.max(0, x.days)}</span>`).join('') : '<span class="small muted">임박한 마감이 없습니다.</span>';
    const prow = (p, extra) => `<div class="row small" style="flex-wrap:nowrap"><button class="linkbtn" data-act="player" data-a="${p.id}"><b>${esc(p.ko)}</b></button><span class="muted">${pos(p)} · ${p.age}세</span>${ovrChip(L.ovr(p))}<span class="sp"></span><span>${extra}</span></div>`;
    const fo = d.foreign, tiles = [['roster', '로스터'], ['lineup', '라인업'], ['pitching', '투수진'], ['train', '훈련'], ['market', '이적시장'], ['finance', '재정'], ['scout', '스카우팅'], ['story', '스토리']];
    return `<div class="card"><div class="row"><h2 style="margin:0">프런트 데스크</h2><span class="sp"></span><button class="sm" data-act="searchOpen">🔍 검색</button></div><div class="small muted" style="margin-top:4px">지금 처리할 일, 임박한 마감, 선수단·계약·재정 점검을 한 화면에서 봅니다. 읽기 전용이며 항목의 [열기]로 해당 화면에서 처리합니다.</div></div>
      <div class="card"><h2>오늘 처리할 일 <span class="chip ${d.todo.length ? 'warn' : ''}">${d.todo.length}</span></h2>${todo}<div class="chips" style="margin-top:8px">${dl}</div></div>
      <div class="grid"><div class="card"><h2>선수단 점검</h2>
        <div class="small"><b>부상자 ${d.inj.length}명</b></div>${d.inj.slice(0, 5).map(x => prow(x.p, `복귀 ${esc(x.ret)} (${x.left}일)`)).join('') || '<div class="small muted">없음</div>'}
        <div class="small" style="margin-top:8px"><b>피로한 투수 ${d.tired.length}명</b></div>${d.tired.slice(0, 4).map(x => prow(x.p, `남은 체력 ${x.r.left}% · ${esc(x.r.label)}`)).join('') || '<div class="small muted">없음</div>'}
        <div class="small" style="margin-top:8px"><b>2군 콜업 후보</b> <span class="muted">(같은 유형 1군 최약체보다 높은 선수)</span></div>${d.farm.map(x => prow(x.p, `+${x.gap}`)).join('') || '<div class="small muted">없음</div>'}</div>
      <div class="card"><h2>계약·재정</h2>${d.fin ? `<div class="kpis"><div class="kpi"><div class="l">FA 여유자금</div><div class="v">${d.fin.room.toFixed(1)}억</div></div><div class="kpi"><div class="l">선수단 보수</div><div class="v">${d.fin.pay.toFixed(1)}억</div></div></div>` : ''}<div class="small muted" style="margin-top:4px">${esc(cbtText(U()))}</div>
        <div class="small" style="margin-top:8px"><b>올해 FA 자격 선수 ${d.faElig.length}명</b></div>${d.faElig.slice(0, 5).map(x => prow(x.p, `${x.grade ? x.grade + '등급 · ' : ''}${money(x.sal)}`)).join('') || '<div class="small muted">없음</div>'}
        <div class="small" style="margin-top:8px"><b>외국인</b> 일반 ${fo.gen}/3 · 아시아쿼터 ${fo.aq}/1${fo.room !== null ? ` · 합산 상한 여유 ${fo.room.toFixed(1)}억` : ''}${fo.swap ? ` · 시즌 중 교체 ${fo.swap.n}/${fo.swap.max}회` : ''}</div>
        <div class="small" style="margin-top:8px"><b>스카우팅</b> 스카우트 ${d.scouts}명 · 관심 후보 ${d.watch}명</div></div></div>
      <div class="card"><h2>바로가기</h2><div class="chips wrap">${tiles.map(([k, t]) => `<button class="sm" data-act="go" data-a="${k}">${t}</button>`).join('')}<button class="sm" data-act="searchOpen">🔍 검색</button>${(ui.cmp || []).length ? `<button class="sm" data-act="cmpOpen" ${(ui.cmp || []).length >= 2 ? '' : 'disabled'}>⚖ 비교(${ui.cmp.length})</button>` : ''}</div></div>`;
  }
  /* ---------------- 연말 성장 공개 · 유망주 성장 서사 ---------------- */
  const GTAG = { 급성장: 'in', 성장: 'in', 유지: '', 하락: 'warn', 급락: 'bad' };
  function growthBanner() {
    const gr = L.growthReveal(); if (!gr || !gr.list.length) return ''; const s = gr.summary, seen = (ui.grSeen || {})[gr.year];
    return `<div class="card growthbn ${seen ? '' : 'new'}"><div class="row"><h2 style="margin:0">🌱 ${gr.year} 시즌 성장 공개</h2><span class="sp"></span><button class="sm primary" data-act="grOpen" ${gr.reveal.length ? '' : 'disabled'}>${seen ? '다시 보기' : '공개 시작'}</button><button class="sm" data-act="grSum">요약</button></div>
      <div class="small muted" style="margin-top:4px">내 선수 ${s.n}명: <b class="pos">상승 ${s.up}</b> · <b class="neg">하락 ${s.down}</b> · 유지 ${s.same} · 평균 ${s.avg >= 0 ? '+' : ''}${s.avg}${s.best ? ` · 최고 ${esc(s.best.name)} +${s.best.d}` : ''}${s.worst && s.worst.d < 0 ? ` · 최대 하락 ${esc(s.worst.name)} ${s.worst.d}` : ''}</div></div>`;
  }
  function growthSheet() {
    const g = ui.gr; if (!g || !L) return ''; const gr = L.growthReveal(); if (!gr) { ui.gr = null; return ''; }
    const close = '<button class="sm" data-act="grClose">닫기</button>';
    if (g.sum) {
      const s = gr.summary, row = x => `<div class="row small" style="flex-wrap:nowrap"><button class="linkbtn" data-act="grPlayer" data-a="${x.id}"><b>${esc(x.name)}</b></button><span class="muted">${x.a1}세 · ${x.pos}</span><span class="sp"></span><span>${x.o0} → <b>${x.o1}</b></span><span class="chip ${GTAG[x.tag]}">${x.d >= 0 ? '+' : ''}${x.d} ${x.tag}</span></div>`;
      const pros = gr.list.filter(x => x.prospect).sort((a, b) => b.d - a.d).slice(0, 6), ups = gr.list.slice().sort((a, b) => b.d - a.d).slice(0, 5), dns = gr.list.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 5);
      return `<div class="sheet-bg" data-act="grClose"><div class="sheet" data-stop="1" role="dialog" aria-label="성장 요약"><div class="grabber"></div><div class="row"><h2 style="margin:0">${gr.year} 성장 요약</h2><span class="sp"></span>${gr.reveal.length ? '<button class="sm" data-act="grOpen">처음부터 공개</button>' : ''}${close}</div>
        <div class="kpis" style="margin-top:8px"><div class="kpi"><div class="l">상승</div><div class="v pos">${s.up}</div></div><div class="kpi"><div class="l">하락</div><div class="v neg">${s.down}</div></div><div class="kpi"><div class="l">평균 변화</div><div class="v">${s.avg >= 0 ? '+' : ''}${s.avg}</div></div></div>
        <div class="small" style="margin-top:8px"><b>가장 많이 오른 선수</b></div>${ups.map(row).join('')}${dns.length ? `<div class="small" style="margin-top:8px"><b>가장 많이 내려간 선수</b></div>${dns.map(row).join('')}` : ''}${pros.length ? `<div class="small" style="margin-top:8px"><b>유망주(24세 이하)</b></div>${pros.map(row).join('')}` : ''}
        <p class="help">성장·노화는 시즌 종료 때 이미 확정된 결과를 보여 주는 연출입니다(공개 순서·연출은 결과에 영향이 없습니다).</p></div></div>`;
    }
    const n = gr.reveal.length; if (!n) { ui.gr = null; return ''; } const i = Math.min(g.i, n - 1), x = gr.reveal[i], shown = g.shown;
    const subs = x.s0 ? Object.keys(x.s1).map(k => { const a = x.s0[k], b = x.s1[k], dd = b - a; return `<div class="grow"><span class="k">${k}</span><div class="gbar"><i class="ghost" style="width:${(a - 20) / 60 * 100}%"></i><i class="now ${dd > 0 ? 'up' : dd < 0 ? 'dn' : ''}" data-to="${(b - 20) / 60 * 100}" style="width:${shown ? (a - 20) / 60 * 100 : 0}%"></i></div><b class="num ${dd > 0 ? 'pos' : dd < 0 ? 'neg' : ''}">${shown ? b : '?'}${shown && dd ? ` <span class="small">${dd > 0 ? '▲' : '▼'}${Math.abs(dd)}</span>` : ''}</b></div>`; }).join('') : '<div class="small muted">세부 능력 변화 기록이 없는 저장 파일입니다.</div>';
    return `<div class="sheet-bg" data-act="grClose"><div class="sheet growth" data-stop="1" role="dialog" aria-label="성장 공개"><div class="grabber"></div><div class="row"><span class="small muted">${i + 1} / ${n}</span><div class="gdots">${gr.reveal.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'cur' : ''}"></i>`).join('')}</div><span class="sp"></span><button class="sm" data-act="grSum">요약으로</button>${close}</div>
      <div class="gcard ${shown ? 'on ' + (x.d > 0 ? 'up' : x.d < 0 ? 'dn' : '') : ''}"><div class="small muted">${x.a0}세 → ${x.a1}세 · ${esc(x.pos)}${x.prospect ? ' · ★ 유망주' : ''}</div><h2 style="margin:2px 0">${esc(x.name)}</h2>
        <div class="gnum">${shown ? `<span class="o0">${x.o0}</span><span class="arrow">→</span><b class="o1 ${x.d > 0 ? 'pos' : x.d < 0 ? 'neg' : ''}">${x.o1}</b><span class="chip ${GTAG[x.tag]} gtag">${x.d >= 0 ? '+' : ''}${x.d} ${x.tag}</span>` : `<span class="o0">${x.o0}</span><span class="arrow">→</span><b class="o1">??</b>`}</div>
        <div class="chips">${x.factors.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div><div class="gsubs">${subs}</div></div>
      <div class="row" style="margin-top:10px">${i > 0 ? '<button class="big" data-act="grPrev">◀ 이전</button>' : ''}${shown ? `<button class="primary big" data-act="grNext">${i < n - 1 ? '다음 선수 ▶' : '요약 보기'}</button>` : '<button class="primary big" data-act="grShow">결과 공개</button>'}</div>
      <p class="help">변화가 작은 선수부터, 가장 큰 변화가 마지막입니다(|변화| 2 이상 최대 15명). 요인은 확인된 사실(나이대·출전 비중·개별 훈련 일수)이며 기여도를 계산한 값이 아닙니다.</p></div></div>`;
  }
  const spark = pts => { const v = pts.map(p => p.o), lo = Math.min(...v), hi = Math.max(...v), w = 90, h = 26, xs = i => (pts.length === 1 ? w / 2 : 4 + i * (w - 8) / (pts.length - 1)), ys = o => (hi === lo ? h / 2 : h - 4 - (o - lo) / (hi - lo) * (h - 8)); return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="OVR 추이 ${v.join(' → ')}"><polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${pts.map((p, i) => `${xs(i).toFixed(1)},${ys(p.o).toFixed(1)}`).join(' ')}"/>${pts.map((p, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(p.o).toFixed(1)}" r="2.2" fill="var(--accent)"/>`).join('')}</svg>`; };
  function prospectRowNote(n) { return `<div class="prow"><div class="row" style="flex-wrap:nowrap"><button class="linkbtn" data-act="player" data-a="${n.id}"><b>${esc(n.name)}</b></button><span class="muted small">${n.pos} · ${n.age}세 · ${n.active ? '1군' : '2군'}</span>${ovrChip(n.ovr)}<span class="sp"></span>${spark(n.spark)}</div><div class="small">${esc(n.line)}</div>${n.facts.length ? `<div class="small muted">${n.facts.map(esc).join(' · ')}</div>` : ''}</div>`; }
  function prospectCard() {
    const ns = L.prospectNotes(6); if (!ns.length) return '';
    return `<div class="card"><div class="row"><h2 style="margin:0">유망주 노트</h2><span class="sp"></span><span class="small muted">24세 이하 · OVR 순</span></div><div class="small muted" style="margin:4px 0">입단 경로, OVR 추이, 1군 출전 같은 확인된 기록으로 정리합니다. 숨은 잠재력(정점)은 알 수 없으며 표시하지 않습니다.</div>${ns.map(prospectRowNote).join('')}</div>`;
  }
  /* ---------------- 구단 투자 센터 ---------------- */
  function screenInvest() {
    const S = L.S, t = U(), rows = L.investRows(), budget = L.investBudget(), spent = L.investSpent(), left = Math.round((budget - spent) * 10) / 10, up = L.investUpkeep(), I = S.invest, pv = L.finReady() ? L.finPreview(t) : null;
    const dots = (lv, pend) => [1, 2, 3].map(i => `<i class="ldot ${i <= lv ? 'on' : i === pend ? 'pend' : ''}"></i>`).join('');
    const card = r => `<div class="card inv"><div class="row" style="flex-wrap:nowrap"><div class="invic">${r.icon}</div><div style="flex:1;min-width:0"><div class="row" style="gap:8px"><h3 style="margin:0">${esc(r.n)}</h3><span class="ldots" aria-label="${r.lv}단계">${dots(r.lv, r.pend)}</span>${r.pend ? `<span class="chip warn">${r.pend}단계 공사 중</span>` : ''}</div><div class="small muted">${esc(r.desc)}</div></div></div>
      <div class="small" style="margin-top:6px">현재 효과: <b>${esc(r.effNow)}</b>${r.pend ? ` → 개막 후 <b>${esc(L.investProjects()[r.key].eff[r.pend])}</b>` : ''}${r.key === 'farm' && r.lv ? ` <span class="chip">도달률 ${Math.round(L.investRamp('farm') * 100)}%</span>` : ''}</div>
      ${r.canBuy ? `<div class="small" style="margin-top:4px">다음 단계: <b>${esc(r.effNext)}</b> · 비용 <b>${r.cost}억</b>${r.cost > left + 1e-9 ? ' <span class="neg">(올해 예산 부족)</span>' : ''}</div>${r.key === 'fan' ? `<div class="small muted">${esc(L.investEstimate('fan', r.lv + 1))}</div>` : ''}` : (r.pend ? '<div class="small muted">다음 시즌 개막 때 완공되어 효과가 시작됩니다.</div>' : '<div class="small muted">최고 단계입니다.</div>')}
      <div class="row" style="margin-top:8px"><button class="primary" data-act="investAsk" data-a="${r.key}" ${r.canBuy && r.cost <= left + 1e-9 ? '' : 'disabled'}>${r.pend ? '공사 중' : r.lv >= 3 ? '최고 단계' : (r.lv + 1) + '단계 착공'}</button><span class="small muted">누적 투자 ${r.paid}억</span></div></div>`;
    return `<div class="card"><div class="row"><h2 style="margin:0">구단 투자 센터</h2><span class="sp"></span><span class="small muted">장기 시설 투자 · 효과는 다음 시즌 개막부터</span></div>
      <div class="small muted" style="margin:4px 0">시설에 투자하면 몇 시즌에 걸쳐 훈련·부상·스카우팅·육성·관중에 보정이 붙습니다. 비용은 올해 구단 손익(목표·이사회 평가)에 반영되고, 선수단 예산(FA 여유자금)과 경쟁균형세는 직접 바뀌지 않습니다. <b>투자하지 않으면 아무 것도 달라지지 않습니다.</b></div>
      <div class="kpis"><div class="kpi"><div class="l">올해 투자 예산</div><div class="v">${left.toFixed(1)}억</div><div class="small muted">총 ${budget.toFixed(1)}억 · 사용 ${spent.toFixed(1)}억</div></div><div class="kpi"><div class="l">연 유지비</div><div class="v">${up.toFixed(1)}억</div><div class="small muted">완공 시설 투자액의 5%</div></div>${pv ? `<div class="kpi"><div class="l">올해 예상 손익</div><div class="v ${pv.op < 0 ? 'neg' : ''}">${pv.op.toFixed(1)}억</div></div>` : ''}</div></div>
      <div class="grid">${rows.map(card).join('')}</div>
      <div class="card"><h2>투자 이력</h2>${I && I.log.length ? I.log.slice(0, 10).map(x => `<div class="small"><span class="muted">${x.ph === 'offseason' || x.ph === 'preseason' ? `${x.y} ${x.ph === 'offseason' ? '오프시즌' : '개막'}` : L.dateStr(x.d)}</span> ${esc(x.text)}</div>`).join('') : '<div class="small muted">투자 이력이 없습니다.</div>'}</div>
      ${investRefCards()}
      <div class="card"><h2>규칙 <span class="chip warn">가정값</span></h2><div class="small muted">프로젝트 5개 × 3단계, 한 번에 한 단계씩 착공 → <b>다음 시즌 개막 때 완공</b>. 단계 비용(억): 훈련·의무·스카우팅·육성 8/16/28, 팬 경험 10/20/34. 착공할 때 올해 행사 비용으로 한 번에 계상. 연 유지비는 완공된 단계에 낸 누적 투자액의 5%. 올해 착공 비용 합계는 '이사회가 허용하는 적자 한도'의 80% 이내. 효과는 훈련 보정 ×1.05/1.10/1.15 · 부상 복귀 기간 −5/−10/−15%와 부상 확률 −4/−8/−12% · 스카우트 한도 +1/+2/+2(3단계는 주간 관찰 +1건) · 성장 출전 비중 +0.04/+0.08/+0.12(완공 후 1·2년차 0%, 3년차 40%, 4년차 70%, 5년차부터 100% — 실제 사례의 '완공 3~5년 뒤 효과'·T+3 시차) · 기본 관중 +0.7/+1.4/+2.2%(구장 수용 한계까지). 실제 구단 투자 규모와 효과 데이터가 없어 모든 수치는 게임 균형용 가정입니다.</div></div>`;
  }
  function investRefCards() {
    const fac = L.investFacilities(), me = fac[U()], la = L.investLeagueAtt();
    return `<div class="card"><h2>실제 KBO 시설 투자 현황 <span class="chip warn">참고 · 미검증</span></h2>
      <div class="small muted" style="margin:4px 0">제공받은 자료 기준입니다(원출처 대조 전). 실제 건립비(부지·공사 포함, 모기업 부담으로 추정)는 게임 재정 밖의 일로 보고, 위의 단계는 <b>증축·리모델링·장비 업그레이드</b> 규모(수십억 원)로 두었습니다.</div>
      ${me ? `<div class="small" style="margin-top:6px"><b>${KO[U()]}</b>: ${esc(me.name)} — ${esc(me.cost)}${me.note ? `<br><span class="muted">${esc(me.note)}</span>` : ''}</div>` : ''}
      <details style="margin-top:6px"><summary class="small">전 구단 보기</summary><div class="tablewrap"><table><thead><tr><th class="l">구단</th><th class="l">시설</th><th class="l">투자 규모</th></tr></thead><tbody>${TEAMS.filter(t => fac[t]).map(t => `<tr><td class="l">${teamTag(t)}</td><td class="l small">${esc(fac[t].name)}${fac[t].note ? `<div class="muted">${esc(fac[t].note)}</div>` : ''}</td><td class="l small">${esc(fac[t].cost)}</td></tr>`).join('')}</tbody></table></div></details>
      <div class="small muted" style="margin-top:6px">실제 효과(제공 자료): 전용 재활센터·치료 장비로 부상 복귀 기간 단축·재발 방지, 1군과 같은 구장 환경으로 콜업 적응력 향상, 대형 훈련장 완공 3~5년 뒤부터 신인·육성선수 출신 주전 비중 상승.</div></div>
      <div class="card"><h2>리그 관중 추이(실제) <span class="chip warn">참고 · 미검증</span></h2><div class="tablewrap"><table><thead><tr><th class="l">구분</th><th>2024</th><th>2025</th><th>2026</th></tr></thead><tbody>${la.table.map(r => `<tr><td class="l">${r[0]}</td><td class="n">${r[1]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td></tr>`).join('')}</tbody></table></div>
      ${la.mine ? `<div class="small" style="margin-top:6px">우리 구단(게임 데이터): 평균 ${la.mine.att.toLocaleString()}명 / 수용 ${la.mine.cap.toLocaleString()}명 = <b>${la.mine.occ}%</b> (리그 평균 85.4%). 점유율이 높을수록 팬 경험 투자의 관중 효과는 구장 한계에 막혀 줄어듭니다.</div>` : ''}</div>`;
  }
  function confirmInvest(k) {
    const r = L.investRows().find(x => x.key === k), t = U(), pv = L.finPreview(t), bl = L.investCheck(k), left = Math.round((L.investBudget() - L.investSpent()) * 10) / 10, P = L.investProjects()[k], I = L.S.invest;
    const up0 = L.investUpkeep(), up1 = Math.round(((up0 / 0.05 || 0) + r.cost) * 0.05 * 10) / 10;
    askConfirm({ title: `${r.n} ${r.lv + 1}단계 착공`, ok: '착공 확정', disabled: !!bl,
      rows: [['프로젝트', `${r.icon} ${esc(r.n)} (${r.lv}단계 → ${r.lv + 1}단계)`], ['비용', `<b>${r.cost}억</b> (올해 행사 비용으로 즉시 계상)`], ['올해 예상 손익', `${pv.op.toFixed(1)}억 → <b class="${pv.op - r.cost < 0 ? 'neg' : ''}">${(pv.op - r.cost).toFixed(1)}억</b>`], ['올해 투자 예산', `${left.toFixed(1)}억 → ${(left - r.cost).toFixed(1)}억`], ['완공', '다음 시즌 개막 때'], ['효과', `${esc(r.effNow)} → <b>${esc(r.effNext)}</b>`], ['연 유지비(완공 후)', `${up0.toFixed(1)}억 → +${Math.round(r.cost * 0.05 * 10) / 10}억 증가`], ['선수단 예산·경쟁균형세', '변화 없음']],
      notes: [{ t: '착공하면 취소할 수 없고 비용은 돌려받지 못합니다. 효과 수치는 게임 균형을 위한 가정값입니다.' }, ...(bl ? [{ t: bl, cls: 'neg' }] : [])], run: () => A.investDo(k) });
  }
  /* ---------------- 드래프트 데이 ---------------- */
  const rxChip = r => (r ? `<span class="chip ${r.kind === 'steal' ? 'in' : r.kind === 'reach' ? 'warn' : ''}" title="${esc(r.text)}">${r.label}</span>` : '');
  function draftDayCard() {
    const dd = L.draftDay(); if (!dd) return ''; const pct = Math.round(dd.pick / dd.total * 100), d = L.S.off.draft;
    const mineList = d.order.map((t, i) => (t === U() ? i + 1 : 0)).filter(Boolean);
    const status = dd.done ? '<b>드래프트 종료</b>' : dd.untilMine === 0 ? '<b class="pos">지금 내 차례입니다</b>' : dd.untilMine === null ? '내 지명은 모두 끝났습니다' : `내 다음 지명(${dd.nextMine}순번)까지 <b>${dd.untilMine}명</b>`;
    return `<div class="card draftday"><div class="row"><h2 style="margin:0">드래프트 데이</h2><span class="sp"></span><span class="small muted">${dd.round}라운드 · ${dd.pick}/${dd.total}</span></div>
      <div class="dprog" role="progressbar" aria-valuemin="0" aria-valuemax="${dd.total}" aria-valuenow="${dd.pick}"><i style="width:${pct}%"></i>${mineList.map(n => `<b class="mk" style="left:${((n - 0.5) / dd.total * 100).toFixed(1)}%" title="내 지명 ${n}순번"></b>`).join('')}</div>
      <div class="small" style="margin-top:6px">${status} · 내 지명 ${dd.myTotal - dd.myLeft}/${dd.myTotal}명 완료 <span class="muted">(내 순번: ${mineList.join(', ')})</span></div></div>`;
  }
  function draftBoardCard() {
    const dd = L.draftDay(); if (!dd) return ''; const S = L.S;
    const cell = c => `<td class="dc ${c.mine ? 'mine' : ''} ${c.cur ? 'cur' : ''} ${c.rx ? c.rx.kind : ''}" title="${c.id ? esc(P(c.id).ko) + ' — ' + esc(c.rx ? c.rx.text : '') : ''}">${c.id ? `${logo(c.team, 14)}<span>${esc(P(c.id).ko)}</span>` : `<span class="muted">${logo(c.team, 14)}</span>`}</td>`;
    return `<details class="card"${dd.pick > 0 && !dd.done ? '' : ' open'}><summary><b>지명 보드</b> <span class="muted small">라운드별 전체 지명 · 내 지명 강조 · ▲스틸 초록 / 이른 지명 주황(내 스카우트 보드 기준)</span></summary><div class="tablewrap"><table class="dboard"><thead><tr><th>R</th>${Array.from({ length: dd.per }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead><tbody>${dd.grid.map((row, r) => `<tr><th>${r + 1}</th>${row.map(cell).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }
  function draftReportCard() {
    const r = L.draftReport(); if (!r) return '';
    return `<div class="card"><h2>드래프트 결과 리포트</h2><div class="small muted">내 스카우트 보드(드래프트 시작 때의 평가 순위)와 실제 지명 순번을 비교합니다. 평가에는 오차가 있고, 지명 순번만으로 선수의 성장이 정해지지 않습니다.</div>
      <div class="kpis" style="margin-top:6px"><div class="kpi"><div class="l">내 지명</div><div class="v">${r.mine.length}명</div></div><div class="kpi"><div class="l">평균 보드 순위</div><div class="v">${r.avgRank === null ? '-' : r.avgRank}</div></div><div class="kpi"><div class="l">스틸 / 이른 지명</div><div class="v">${r.steals} / ${r.reaches}</div></div></div>
      ${r.best && r.best.diff >= 5 ? `<div class="small" style="margin-top:6px">가장 값진 지명: <b>${esc(r.best.name)}</b> — 보드 ${r.best.rank}위를 ${r.best.pick}순번에 지명</div>` : ''}
      <div class="tablewrap" style="margin-top:6px"><table><thead><tr><th class="l">순번</th><th class="l">선수</th><th>보드</th><th>OVR(추정)</th><th class="l">성장 상한(추정)</th><th class="l">평가</th></tr></thead><tbody>${r.mine.map(x => `<tr class="click" data-act="player" data-a="${x.id}"><td class="l n">${x.round}R · ${x.pick}</td><td class="l"><b>${esc(x.name)}</b></td><td class="n">${x.rank === null ? '-' : x.rank + '위'}</td><td class="n">${x.est ? x.est.o : '-'}</td><td class="l small">${x.est ? `${x.est.ceil}±${x.est.sd}` : '-'}</td><td class="l">${x.kind ? rxChip({ kind: x.kind, label: { steal: '스틸', reach: '이른 지명', fair: '예상 범위' }[x.kind], text: '' }) : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:6px">입단 후 성장은 훈련 센터의 유망주 노트와 연말 성장 공개에서 이어서 볼 수 있습니다.</div></div>`;
  }
  /* ---------------- 렌더 ---------------- */
  /* 휴대폰(≤560px)에서 가로로 넘치는 표는 행을 카드처럼 쌓아 보여준다(좌우 스크롤 제거). 열 이름은 셀 앞에 라벨로 붙는다 */
  function stackTables(root) {
    if (!window.matchMedia || !window.matchMedia('(max-width: 560px)').matches) return;
    root.querySelectorAll('.tablewrap').forEach(w => {
      const t = w.querySelector('table'); if (!t || w.scrollWidth <= w.clientWidth + 2) return;
      const heads = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim()); t.classList.add('rt');
      t.querySelectorAll('tbody tr').forEach(tr => Array.from(tr.children).forEach((td, i) => { if (heads[i] && td.tagName === 'TD' && !td.getAttribute('colspan')) td.dataset.l = heads[i]; }));
    });
  }
  const INNER_SEL = '.tablewrap, .plist, .neg-panel, .neg-chat, .mbody, .sheet, .modal-bg, [style*="overflow-y"]';
  function snapInner(root) {
    const sc = [...root.querySelectorAll(INNER_SEL)].map((e, i) => e.scrollTop > 0 ? [i, e.scrollTop] : null).filter(Boolean);
    return { sig: [ui.screen, ui.modal, ui.mtab, ui.market, ui.faTab, ui.negOpen, ui.storyTab].join('|'), sc, n: root.querySelectorAll(INNER_SEL).length, det: [...root.querySelectorAll('details')].map(d => d.open) };
  }
  function restoreInner(root, k) {
    if (!k || k.sig !== [ui.screen, ui.modal, ui.mtab, ui.market, ui.faTab, ui.negOpen, ui.storyTab].join('|')) return; const els = [...root.querySelectorAll(INNER_SEL)]; if (els.length === k.n) for (const [i, v] of k.sc) { if (!els[i].classList.contains('neg-chat')) els[i].scrollTop = v; }
    const ds = [...root.querySelectorAll('details')]; if (ds.length === k.det.length) ds.forEach((d, i) => { d.open = k.det[i]; });
  }
  function render() {
    const root = $('#root'); applyTheme();
    if (!L) { document.body.classList.remove('modal-open'); root.innerHTML = renderStart() + toastHtml(); return; }
    const scroll = window.scrollY;
    if (ui.pre && !ui.live) { document.body.classList.remove('modal-open'); root.innerHTML = screenPre() + confirmSheet() + toastHtml(); window.scrollTo(0, scroll); return; }   // 경기 전 브리핑(날짜 처리 끝, 경기 시작 전)
    if (ui.live) { document.body.classList.remove('modal-open'); root.innerHTML = screenLive() + toastHtml(); window.scrollTo(0, scroll); return; }   // 경기 화면에서는 이전 화면의 스크롤 잠금이 남지 않게 푼다
    const S = ui.screen, f = { invest: screenInvest, desk: screenDesk, home: () => goalCard() + pressCard() + screenHome() + evHistory(), roster: () => changeBar() + screenRoster(), farm: () => changeBar() + screenFarm(), lineup: () => changeBar() + screenLineup(), pitching: () => changeBar() + screenPitching(), schedule: screenSchedule, standings: () => screenStandings() + awardsCard(), teams: screenTeams, story: screenStory, mood: screenMood, train: screenTrain, scout: screenScout, finance: screenFinance, coach: screenCoach, market: screenMarket, offseason: screenOffseason, save: screenSave }[S] || screenHome;
    document.body.classList.toggle('modal-open', !!ui.modal);
    const keep = snapInner(root);   // 체크박스·버튼으로 다시 그려도 안쪽 스크롤 상자와 펼침 상태를 유지한다
    root.innerHTML = shell((S === 'home' || S === 'market' || S === 'offseason' ? eventCards() + excPromptCard() : evBanner()) + f()) + (ui.modal ? modalPlayer(ui.modal) : '') + sheetHtml() + firedModal() + quickSheet() + swapSheet() + posPickSheet() + fslotSheet() + scoutSheet() + growthSheet() + subSheet() + confirmSheet() + cmpSheet() + searchSheet() + cmpTray() + negView() + toastHtml();
    window.scrollTo(0, scroll); stackTables(root); restoreInner(root, keep);
    { const ch = root.querySelector('.neg-chat'); if (ch) ch.scrollTop = ch.scrollHeight; document.body.classList.toggle('modal-open', !!(ui.modal || (ui.negOpen && L.S.neg))); }
    const cur = root.querySelector('.side button[aria-current=true]'); if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* 일부 브라우저 */ } }
  }
  const prospectBlockFor = p => { if (p.team !== U() || p.age > 24 || p.foreign) return ''; const n = L.prospectNote(p); return n ? `<div class="card" style="margin:8px 0"><div class="small"><b>성장 서사</b> <span class="muted">(확인된 기록)</span></div>${prospectRowNote(n)}</div>` : ''; };
  function growthAnimate() { setTimeout(() => { document.querySelectorAll('.gbar i.now[data-to]').forEach(i => { i.style.width = i.dataset.to + '%'; }); }, 40); }
  const toastHtml = () => (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '');

  /* ---------------- 액션 ---------------- */
  function startPlay(g, idx) { if (ui.hl) openLiveHL(g, idx); else openLive(g, idx, false); }
  function afterAdvance(r) {
    if (r.status === 'userGame') { if (pref('briefSkip', '0') !== '1' && L.preGame()) { ui.pre = { g: r.game, idx: r.idx, pg: null }; render(); window.scrollTo(0, 0); return; } startPlay(r.game, r.idx); return; }
    autosave(); render();
  }
  /* 하이라이트 개입: 설정한 이닝 이후 접전이 되기 전까지는 경기 계획대로 자동 진행하고, 그 시점부터 직접 지휘 */
  function openLiveCtx(ctx, intro) {
    ui.live = { ctx, feed: [], lbl: '', pick: null, sheet: null, post: false, before: snapshot(), halfKey: ctx.live.inning + (ctx.live.top ? 't' : 'b'), halfL: ctx.live.log.length }; ui.live.feed.unshift({ w: '', t: intro, sys: true }); render(); window.scrollTo(0, 0);
  }
  function openLiveHL(g, idx) {
    L.mergeTracking(); const ctx = L.startUserGame(g, idx), us = ctx.userSide, done = L.playAuto(ctx, gm => L.isHighlight(gm, us)), gm = ctx.live;
    ui.live = { ctx, feed: [], lbl: '', pick: null, sheet: null, post: false, before: snapshot(), halfKey: ctx.live.inning + (ctx.live.top ? 't' : 'b'), halfL: ctx.live.log.length };
    ui.live.feed.unshift({ w: '', t: done ? `경기 계획대로 자동 진행 — 접전 구간 없이 종료 (${KO[gm.away]} ${gm.score.away} : ${gm.score.home} ${KO[gm.home]})` : `하이라이트 — ${gm.inning}회 ${gm.top ? '초' : '말'} ${KO[gm.away]} ${gm.score.away} : ${gm.score.home} ${KO[gm.home]} 접전, 여기서부터 직접 지휘합니다`, sys: true });
    if (done) { A.liveFinish(); return; }
    render(); window.scrollTo(0, 0);
  }
  function openLive(g, idx, post) {
    L.mergeTracking(); const ctx = post ? L.startUserPostGame() : L.startUserGame(g, idx);
    ui.live = { ctx, feed: [], lbl: '', pick: null, sheet: null, post: !!post, before: snapshot(), halfKey: ctx.live.inning + (ctx.live.top ? 't' : 'b'), halfL: ctx.live.log.length }; ui.live.feed.unshift({ w: '', t: `${KO[ctx.live.away]} @ ${KO[ctx.live.home]} — 선발 ${P(ctx.prep.sp.id).ko}`, sys: true }); render(); window.scrollTo(0, 0);
  }
  const A = {
    pickteam(a) { ui.team = a; render(); },
    newgame() { const seed = parseInt(($('#seedIn') || {}).value, 10); ui.seed = ($('#seedIn') || {}).value || ''; L = League.create(KBO_BASE, ui.team, Number.isFinite(seed) ? seed : 1 + Math.floor(Math.random() * 99999)); ui.screen = 'home'; window.scrollTo(0, 0); autosave(); render(); },
    continue() { const s = store.get(SAVE_KEY); if (s) { try { L = League.load(s); ui.screen = 'home'; window.scrollTo(0, 0); render(); } catch (e) { toast('저장 데이터를 읽을 수 없습니다.'); } } },
    negOpen(a) { const [id, kind, topic, evId, rep] = a.split('|'), n = L.S.neg; if (n && n.id === id && n.kind === kind && n.state === 'open' && (!rep || n.replace === rep)) { if (!ui.negBack) ui.negBack = { scroll: window.scrollY, screen: ui.screen, market: ui.market, faTab: ui.faTab, modal: ui.modal }; ui.negOpen = true; ui.modal = null; render(); return; } if (n) L.negClose();
      if (kind === 'meeting' && !evId) { const b = L.meetBlock(id); if (b) { toast(b); return; } }
      const r = L.negStart(id, kind, { topic: topic || undefined, evId: evId || undefined, replace: rep || undefined }); if (!r.ok) { toast(r.msg); return; } if (!ui.negBack) ui.negBack = { scroll: window.scrollY, screen: ui.screen, market: ui.market, faTab: ui.faTab, modal: ui.modal }; ui.negOpen = true; ui.negTab = kind === 'meeting' ? 'cards' : 'offer'; ui.negIn = kind === 'meeting' ? null : L.negBest(id); ui.negRole = null; ui.modal = null; autosave(); render(); },
    negBoard() { const r = L.negBoard(); if (!r.ok && r.msg) toast(r.msg); autosave(); render(); },
    fslotPick(a) { const [cid, rid] = a.split('|'); ui.fslot = null; A.negOpen(`${cid}|foreign|||${rid}`); },
    negTab(a) { ui.negTab = a; render(); const pn = document.querySelector('.neg-panel'); if (pn) pn.scrollTop = 0; },
    negFill() { const n = L.S.neg; if (!n) return; ui.negIn = L._negMin(P(n.id), n.kind, (ui.negIn || {}).years); render(); },
    negSend() { const n = L.S.neg; if (!n) return; const r = L.negOffer(ui.negIn || L.negBest(n.id)); if (!r.ok && r.msg && !r.rejected) toast(r.msg); if (r.signed) buzz(); ui.negIn = n.state === 'open' ? (ui.negIn || L.negBest(n.id)) : ui.negIn; autosave(); render(); },
    negCounter() { const r = L.negCounter(); if (!r.ok && r.msg) toast(r.msg); autosave(); render(); },
    negCard(a) { const r = L.negCard(a, ui.negRole || undefined); if (!r.ok && r.msg) toast(r.msg); if (L.S.neg && L.S.neg.state === 'open' && a !== 'time') ui.negTab = 'cards'; autosave(); render(); },
    meetCard(a) { const r = L.meetCard(a, ui.negRole || undefined); if (!r.ok && r.msg) toast(r.msg); autosave(); render(); },
    meetEnd() { const n = L.S.neg; if (n && n.kind === 'meeting') L._meetFinish(n); autosave(); render(); },
    negLeave() { L.negLeave(); autosave(); render(); },
    negExit() { const n = L.S.neg; negSync(); if (n && n.kind === 'meeting' && n.state === 'open' && n.round === 0) { L.S.neg = null; } else if (n && (n.state !== 'open' || n.kind === 'meeting')) L.negClose(); ui.negOpen = false; negBackTo(); autosave(); },
    negDone() { negSync(); L.negClose(); ui.negOpen = false; ui.negIn = null; negBackTo(); autosave(); },
    integrityRun() { ui.integ = L.integrity(); render(); },
    storyTab(a) { ui.storyTab = a; render(); }, storyMin(a) { ui.storyMin = +a; render(); },
    devPlan(a) { const [id, pl] = a.split('|'), e = L.setDevPlan(id, pl); if (e) toast(e); else { toast(`${P(id).ko}: 육성 방향 ${L.planName(pl)}`); autosave(); } render(); },
    hireCoach(a) { const e = L.hireCoach(a); if (e) toast(e); else { toast('코치를 영입했습니다.'); autosave(); } render(); },
    fireCoach(a) { const e = L.fireCoach(a); if (e) toast(e); else autosave(); render(); },
    excConfirm() { const el = $('[data-sel="excprompt"]'); const e = L.confirmExc(el ? el.value : null); if (e) toast(e); else { toast('예외 선수를 확정했습니다.'); autosave(); } render(); },
    setExc() { const el = $('[data-sel="excsel"]'); if (!el) return; const e = L.setCbtExc(el.value); if (e) toast(e); else { toast('예외 선수를 지정했습니다.'); autosave(); } render(); },
    ticket(a) { if (L.setTicketPolicy(U(), +a)) { toast(`티켓 가격 ${+a === 1 ? '유지' : (+a > 1 ? '+' : '') + Math.round((+a - 1) * 100) + '%'}`); autosave(); render(); } },
    goG(a) { ui.sel = null; const g = GROUPS.find(x => x[0] === a); ui.last = ui.last || {}; ui.screen = ui.last[a] && g[2].includes(ui.last[a]) ? ui.last[a] : g[2][0]; ui.modal = null; render(); window.scrollTo(0, 0); },
    go(a) { ui.sel = null; ui.last = ui.last || {}; const gg = GROUPS.find(x => x[2].includes(a)); if (gg) ui.last[gg[0]] = a; ui.screen = a; ui.modal = null; render(); window.scrollTo(0, 0); },
    adv(a) { ui.lastStop = ''; if (L.S.faMkt && !L.S.faMkt.closed) { toast('FA 협상 기간입니다. 이적시장 > FA 시장에서 날짜를 진행하거나 FA를 마감하세요.'); ui.screen = 'market'; ui.market = 'fa'; render(); return; } const live = ui.liveMode && (L.S.phase === 'preseason' || L.S.phase === 'regular'), before = snapshot(), r = L.advance(+a, live, true); if (r.status === 'userGame') { afterAdvance(r); return; } if (r.status === 'seasonEnd') toast('정규시즌이 끝났습니다.'); if (r.status === 'event') toast('새 소식이 도착했습니다. 대시보드에서 결정하세요.'); openResultSheet(before); autosave(); render(); },
    advMoment() { if (L.S.faMkt && !L.S.faMkt.closed) { toast('FA 협상 기간입니다. 이적시장 > FA 시장에서 날짜를 진행하거나 FA를 마감하세요.'); ui.screen = 'market'; ui.market = 'fa'; render(); return; } const live = ui.liveMode && (L.S.phase === 'preseason' || L.S.phase === 'regular'), before = snapshot(), r = L.advanceMoment(live, ui.hl); if (r.status === 'highlight') { ui.lastStop = r.reason; openLiveCtx(r.ctx, `하이라이트 — ${r.ctx.live.inning}회 ${r.ctx.live.top ? '초' : '말'} ${KO[r.ctx.live.away]} ${r.ctx.live.score.away} : ${r.ctx.live.score.home} ${KO[r.ctx.live.home]} 접전, 여기서부터 직접 지휘합니다`); return; } if (r.status === 'userGame') { ui.lastStop = r.reason || ''; if (r.reason) toast('멈춤: ' + r.reason); afterAdvance(r); return; } ui.lastStop = r.status === 'moment' ? r.reason : (r.status === 'seasonEnd' ? '정규시즌 종료' : ''); if (r.status === 'moment') toast('멈춤: ' + r.reason); if (r.status === 'seasonEnd') toast('정규시즌이 끝났습니다.'); openResultSheet(before); autosave(); render(); },
    stopSet(a, el) { L.setStop(a, el.checked); autosave(); },
    advAuto(a) { ui.lastStop = ''; if (L.S.faMkt && !L.S.faMkt.closed) { toast('FA 협상 기간입니다. 이적시장 > FA 시장에서 날짜를 진행하거나 FA를 마감하세요.'); ui.screen = 'market'; ui.market = 'fa'; render(); return; } const before = snapshot(), r = L.advance(+a, false, true); openResultSheet(before); if (r.status === 'seasonEnd') toast('정규시즌이 끝났습니다.'); if (r.status === 'event') toast('새 소식이 도착했습니다. 대시보드에서 결정하세요.'); autosave(); render(); },
    startPost() { const my = L.standings().find(x => x.team === U()); L.startPostseason(); if (my.rank > 5) { while (!L.S.post.done) L.simPostGame(); } autosave(); render(); },
    postNext() { if (L.userInPost()) { ui.liveMode ? A.postLive() : A.postAuto(); return; } const r = L.simPostGame(); if (r) openPostSheet([r]); autosave(); render(); },
    postAll() { let n = 0; const list = []; while (!L.S.post.done && !L.userInPost() && n++ < 40) { const r = L.simPostGame(); if (r) list.push(r); } if (list.length) openPostSheet(list); autosave(); render(); },
    postLive() { openLive(null, 0, true); },
    preStart() { const pre = ui.pre; if (!pre) return; ui.pre = null; startPlay(pre.g, pre.idx); },
    preSkip(_a, el) { setPref('briefSkip', el && el.checked ? '1' : '0'); },
    preUndo() { L.clearTonight(); if (ui.pre) ui.pre.pg = null; toast('오늘 타순 적용을 취소했습니다.'); render(); },
    preApply() {
      const pre = ui.pre, pg = pre && pre.pg; if (!pg || pg.keep) return;
      const nm = list => list.map((u, i) => `${i + 1}. ${esc(u.ko)} <span class="muted small">${esc(posName[u.pos] || u.pos)}</span>`).join('<br>');
      askConfirm({ title: '오늘 타순 적용', ok: '이번 경기만 적용',
        rows: [['현재 타순', nm(pg.cur)], ['제안 타순', nm(pg.sug)], ['기대 득점(추정)', `${pg.curExp.toFixed(2)} → <b class="pos">${pg.sugExp.toFixed(2)}</b> (+${pg.gain.toFixed(2)}/경기)`]],
        notes: [{ t: '이번 경기에만 적용됩니다. 경기가 끝나면 원래 라인업(저장된 라인업·프리셋)으로 돌아가며, 프리셋이 켜져 있어도 오늘은 이 타순이 우선합니다.' }, { t: '기대 득점은 모델 추정이며 결과를 보장하지 않습니다.', cls: 'muted' }],
        run: () => { const err = L.applyTonight(pg.sug.map(u => ({ id: u.id, pos: u.pos }))); if (err) toast(err); else { ui.pre.pg = null; toast('오늘 타순을 적용했습니다.'); } render(); } });
    },
    postAuto() { const c = L.startUserPostGame(); L.playAuto(c); const r = L.finishUserPostGame(c); openPostSheet([r]); autosave(); render(); },
    toOff() { L.startOffseason(); ui.screen = 'offseason'; autosave(); render(); },
    rfilter(a) { ui.rf.f = a; render(); },
    rview(a) { ui.rf.v = a; render(); },
    player(a) { if (ui.modal !== a) ui.mtab = 'sum'; ui.modal = a; ui.confirm = null; render(); },
    farmF(a) { ui.farmF = a; render(); }, farmS(a) { ui.farmS = a; render(); },
    mtab2(a) { ui.mtab = a; render(); const b = document.querySelector('.modal .mbody'); if (b) b.scrollTop = 0; },
    mnav(a) { const p = P(ui.modal), list = ui.mlist && ui.mlist.includes(p.id) ? ui.mlist.map(P).filter(Boolean) : L.players(p.team).sort((x, y) => L.ovr(y) - L.ovr(x)), i = list.findIndex(x => x.id === p.id), n = list[(i + +a + list.length) % list.length]; if (n) { ui.modal = n.id; ui.confirm = null; render(); } },
    goTrain() { ui.modal = null; ui.screen = 'train'; const g = GROUPS.find(x => x[2].includes('train')); if (g) (ui.last = ui.last || {})[g[0]] = 'train'; render(); window.scrollTo(0, 0); },
    closeModal() { ui.modal = null; ui.confirm = null; render(); },
    toggleActive(a) { const p = P(a); if (!p.active) { openSwap(a); return; } const err = L.moveActive(a, !p.active); if (err) toast(err); else { autosave(); } render(); },
    swapFarm(a) { const [up, dn] = a.split('|'), err = L.swapActive(up, dn); if (err) toast(err); else { toast('콜업/말소를 완료했습니다.'); autosave(); } render(); },
    releaseAsk(a) { confirmRelease(a); },
    releaseNow(a) { if (true) { const r = L.releasePlayer(a); if (!r.ok) toast(r.msg); else { toast(`${P(a).ko} 방출 — 위약금 ${f1(r.cost.total)}억`); ui.modal = null; ui.confirm = null; autosave(); } } render(); },
    autoLineup() { L.autoSettings(U(), 'lineup'); autosave(); render(); },
    autoPitch() { L.autoSettings(U(), 'rotation'); L.autoSettings(U(), 'bullpen'); autosave(); render(); },
    lfix(a, b) { const set = L.team(U()).set, i = +a; set.lineup[i].id = b; autosave(); render(); toast('후보로 교체했습니다.'); },
    lmove(a, b) { const i = +a, j = i + (+b), l = L.team(U()).set.lineup; if (j < 0 || j > 8) return; [l[i], l[j]] = [l[j], l[i]]; autosave(); render(); },
    mtab(a) { ui.market = a; render(); },
    tgive(a, el) { ui.trade.give[el.checked ? 'add' : 'delete'](a); render(); }, tget(a, el) { ui.trade.get[el.checked ? 'add' : 'delete'](a); render(); },
    clearTrade() { ui.trade.give.clear(); ui.trade.get.clear(); render(); },
    doTrade() { confirmTrade(); },
    doTradeNow() { const T = ui.trade, r = L.executeTrade(T.team, [...T.give], [...T.get]); if (r.ok) { toast('트레이드가 성사되었습니다. 영입한 선수는 2군에 있으니 1군에 등록하세요.'); T.give.clear(); T.get.clear(); autosave(); } else toast(r.why || '트레이드가 거절되었습니다.'); render(); },
    openFAMarket() { ui.screen = 'market'; ui.market = 'fa'; render(); window.scrollTo(0, 0); },
    takeOver(a) { if (L.takeOverTeam(a)) { toast(`${KO[a]} 감독으로 취임했습니다.`); ui.screen = 'home'; ui.viewTeam = null; autosave(); } render(); window.scrollTo(0, 0); },
    plan(a) { const [k, v] = a.split(':'), val = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? +v : v; if (L.setPlan(k, val)) { autosave(); render(); } },
    policy(a) { const [k, v] = a.split(':'); if (L.setPolicy(k, v)) { autosave(); render(); } },
    evChoice(a) { const [id, k] = a.split('|'), ev0 = ((L.S.events || {}).list || []).find(x => x.id === id); if (k === 'talk' && ev0 && (ev0.type === 'grievance' || ev0.type === 'request') && ev0.data.pid && P(ev0.data.pid)) { A.negOpen(`${ev0.data.pid}|meeting|${ev0.type}|${id}`); return; } const r = L.resolveEvent(id, k); if (r.need === 'swap') { const e = ((L.S.events || {}).list || []).find(x => x.id === id); openSwap(e.data.pid, id); return; } toast(r.msg || ''); if (r.ok) autosave(); render(); },
    persuade(a) { const pr = ui.persuade; if (!pr || pr.id !== a) return; const r = L.persuadeBoard(a, pr.offer); if (!r.ok) { toast(r.msg); } else { toast(r.success ? `이사회가 승인했습니다. ${P(a).ko} 영입 완료 (신뢰도 −${r.drop.toFixed(1)})` : r.msg); ui.persuade = null; autosave(); } render(); },
    protToggle() { ui.protOpen = !ui.protOpen; render(); },
    protAuto() { L.S.protect = undefined; render(); },
    protSet(a) { const S = L.S, cur = new Set(S.protect || L.compProtected(U(), 'B')); if (cur.has(a)) cur.delete(a); else { if (cur.size >= 25) { toast('보호선수는 최대 25명입니다.'); render(); return; } cur.add(a); } L.setProtect([...cur]); autosave(); render(); },
    persuadeCancel() { ui.persuade = null; render(); },
    fontSz(a) { setPref('fs', a); applyFont(); render(); },
    vibTog(a, el) { setPref('vib', el.checked ? '1' : '0'); render(); },
    fav(a) { const f = favs(), i = f.indexOf(a); if (i >= 0) f.splice(i, 1); else f.push(a); autosave(); render(); },
    selClear() { ui.sel = null; render(); },
    lTap(a) { buzz(); const i = +a; if (!ui.sel || ui.sel.kind !== 'lu') ui.sel = { kind: 'lu', i }; else if (ui.sel.i === i) ui.sel = null; else { L.swapLineup(ui.sel.i, i); ui.sel = null; autosave(); } render(); },
    lBench(a) { buzz(); const sel = ui.sel; if (!sel) return; const e = L.replaceLineup(sel.i, a); if (e) toast(e); else { ui.sel = null; autosave(); } render(); },
    lposPick(a) { ui.posPick = +a; render(); }, lposClose() { ui.posPick = null; render(); },
    lposSet(a) { const [i, q] = a.split(':'); L.setLineupPos(+i, q); ui.posPick = null; autosave(); render(); },
    pTap(a) { buzz(); const [k, i] = a.split(':'), sl = pitchSlots().find(s => s.k === k && s.i === +i), cur = ui.sel && ui.sel.kind === 'p' ? ui.sel : null; if (!cur) ui.sel = { kind: 'p', k, i: +i }; else if (cur.k === k && cur.i === +i) ui.sel = null; else { const e = L.assignPitcher(cur.k, cur.i, sl.id); if (e) toast(e); ui.sel = null; autosave(); } render(); },
    pAssign(a) { buzz(); const sel = ui.sel; if (!sel) return; const e = L.assignPitcher(sel.k, sel.i, a); if (e) toast(e); else { ui.sel = null; autosave(); } render(); },
    swapPick(a) { buzz(); const sw = ui.swap; if (!sw) return; let err = null; if (a === 'none') { L.pushUndo('콜업'); err = L.moveActive(sw.up, true); } else err = L.swapActive(sw.up, a); if (err) { toast(err); return; }
      const up = P(sw.up); toast(`${up.ko} 콜업${a === 'none' ? '' : ' — ' + P(a).ko + ' 2군'}`); if (sw.ev) L.resolveEvent(sw.ev, 'callup', true); ui.swap = null; autosave(); render(); },
    swapClose() { ui.swap = null; render(); },
    chgConfirm() { L.confirmChanges(); toast('변경을 확정했습니다.'); autosave(); render(); },
    chgRevert() { if (L.revertToBase()) { toast('변경을 모두 취소했습니다.'); autosave(); } render(); },
    inboxAll() { const r = L.resolveAllRecommended(); toast(`${r.length}건을 추천대로 처리했습니다.`); autosave(); render(); },
    undo() { const lab = L.undo(); toast(lab ? `되돌림: ${lab}` : '되돌릴 변경이 없습니다.'); if (lab) autosave(); render(); },
    presetSave(a) { L.pushUndo('라인업 프리셋'); if (L.savePreset(a)) { toast(`현재 라인업을 ${a === 'L' ? '좌투' : '우투'} 상대 프리셋으로 저장했습니다.`); autosave(); } render(); },
    presetClear(a) { L.pushUndo('라인업 프리셋'); L.clearPreset(a); autosave(); render(); },
    presetOn(a, el) { L.pushUndo('라인업 프리셋'); L.setPresetOn(el.checked); autosave(); render(); },
    quickClose() { ui.quick = null; render(); },
    quickAct(a) { const [id, k] = a.split('|'), p = P(id); ui.quick = null;
      if (k === 'toggle') { if (!p.active) { openSwap(id); return; } const err = L.moveActive(id, !p.active); if (err) toast(err); else autosave(); }
      else if (k === 'captain') { const e = L.setCaptain(id); if (e) toast(e); else { toast(L.S.captain === id ? `${p.ko} 주장 임명` : '주장 해임'); autosave(); } }
      else if (k === 'detail') ui.modal = id; render(); },
    captain(a) { const e = L.setCaptain(a); if (e) toast(e); else { toast(L.S.captain === a ? `${P(a).ko}을(를) 주장으로 임명했습니다.` : '주장을 해임했습니다.'); autosave(); } render(); },
    scoutHireA(a) { const e = L.scoutHire(a); if (e) toast(e); else { toast('스카우트를 영입했습니다.'); autosave(); } render(); },
    scoutFireA(a) { const e = L.scoutFire(a); if (e) toast(e); else autosave(); render(); },
    scoutWatchA(a) { const e = L.scoutWatch(a); if (e) toast(e); else autosave(); render(); },
    scoutStarA(a) { const e = L.scoutStar(a); if (e) toast(e); else autosave(); render(); },
    scoutAuto() { const n = L.scoutAutoWatch(10, ui.scC || 1); toast(n ? `${n}명을 관심 목록에 추가했습니다.` : '추가할 후보가 없거나 목록이 가득 찼습니다.'); autosave(); render(); },
    scoutProbeA(a) { const [id, sid] = a.split(':'), e = L.scoutProbe(id, sid); if (e) toast(e); else { toast('인성 조사를 마쳤습니다.'); autosave(); } render(); },
    scoutFor(a) { const [id, sid] = a.split(':'), e = L.scoutForeign(id, sid); if (e) toast(e); else { toast('외국인 조사를 마쳤습니다.'); autosave(); } render(); },
    scoutCls(a) { ui.scC = +a; render(); },
    foreignWatchA(a) { const e = L.foreignWatch(a); if (e) toast(e); else autosave(); render(); },
    foreignStarA(a) { const e = L.foreignStar(a); if (e) toast(e); else autosave(); render(); },
    foreignAuto() { const n = L.foreignAutoWatch(4); toast(n ? `${n}명을 관심 목록에 추가했습니다.` : '추가할 후보가 없거나 목록이 가득 찼습니다.'); autosave(); render(); },
    foreignFilter(a) { ui.fF = a; render(); },
    grOpen() { ui.gr = { i: 0, shown: false, sum: false }; render(); }, grShow() { ui.gr.shown = true; render(); growthAnimate(); },
    grNext() { const n = (L.growthReveal() || { reveal: [] }).reveal.length; if (ui.gr.i < n - 1) { ui.gr.i++; ui.gr.shown = false; } else ui.gr.sum = true; render(); }, grPrev() { if (ui.gr.i > 0) { ui.gr.i--; ui.gr.shown = true; } render(); growthAnimate(); },
    grSum() { ui.gr = { i: 0, shown: false, sum: true }; render(); }, grClose() { const gr = L.growthReveal(); if (gr) (ui.grSeen = ui.grSeen || {})[gr.year] = true; ui.gr = null; render(); }, grPlayer(a) { ui.gr = null; A.player(a); },
    econToggle() { const E = L.econ(); L.S.econ = Object.assign({}, L.S.econ || {}, { on: !E.on }); autosave(); toast(!E.on ? '재정 성장 가정을 켰습니다. 다음 시즌 정산부터 적용됩니다.' : '재정 성장 가정을 껐습니다.'); render(); },
    investAsk(a) { confirmInvest(a); }, investDo(a) { const e = L.investBuy(a); if (e) toast(e); else { toast('착공했습니다. 다음 시즌 개막 때 완공됩니다.'); autosave(); } render(); },
    searchOpen() { ui.search = { q: '' }; render(); setTimeout(() => { const i = $('#gsq'); if (i) i.focus(); }, 40); }, searchClose() { ui.search = null; render(); },
    searchPick(a) {
      const k = a.slice(0, 1), v = a.slice(2); ui.recent = ui.recent || []; let label = '', sub = '';
      if (k === 'p' && P(v)) { label = P(v).ko; sub = `${P(v).team === 'FA' ? 'FA' : KO[P(v).team] || ''} ${pos(P(v))}`; } else if (k === 't') { label = KO[v]; sub = '팀 정보'; } else if (k === 's') { label = SCR[v]; sub = '화면'; }
      if (label) ui.recent = [{ k: a, label, sub }].concat(ui.recent.filter(r => r.k !== a)).slice(0, 6);
      ui.search = null; if (k === 'p') A.player(v); else if (k === 't') A.team(v); else if (k === 's') A.go(v); else render();
    },
    cmpAdd(a) { ui.cmp = ui.cmp || []; if (ui.cmp.includes(a)) { toast('이미 비교 목록에 있습니다.'); return; } if (ui.cmp.length >= 3) { toast('비교는 최대 3명까지입니다. 하나를 제외하세요.'); return; } ui.cmp.push(a); toast(`${P(a).ko} 비교 목록에 추가 (${ui.cmp.length}/3)`); render(); if (ui.search) setTimeout(() => { const i = $('#gsq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); },
    cmpDel(a) { ui.cmp = (ui.cmp || []).filter(x => x !== a); if (ui.cmp.length < 2) ui.cmpOpen = false; render(); }, cmpClear() { ui.cmp = []; ui.cmpOpen = false; render(); },
    cmpOpen() { if ((ui.cmp || []).length >= 2) { ui.cmpOpen = true; ui.search = null; ui.modal = null; render(); } }, cmpClose() { ui.cmpOpen = false; render(); },
    cmpPlayer(a) { ui.cmpOpen = false; A.player(a); },
    cfDo() { const c = ui.cf; ui.cf = null; if (c && c.run) c.run(); else render(); }, cfClose() { ui.cf = null; render(); },
    subOpen(a) { ui.subFor = a; ui.subCand = null; ui.subMo = null; render(); }, subClose() { ui.subFor = null; render(); },
    subSignA(a) {
      const c = P(ui.subCand || ($('[data-sel="subcand"]') || {}).value), mo = ui.subMo || +($('[data-sel="submo"]') || {}).value || 1, o = P(a); if (!c) { toast('후보를 고르세요.'); return; }
      const cost = L.subCost(mo), room = L.finReady() ? L.faRoom(U()) : 1e9, dl = L.postDeadline();
      askConfirm({ title: `${c.ko} 대체 외국인 계약`, ok: '계약 확정', disabled: room < cost, rows: [['대체 대상', `${esc(o.ko)} (${esc(o.inj ? o.inj.dx : '부상')} · 복귀 ${esc(L.injDateStr(o))}) → 재활 선수명단`], ['대체 선수', `${esc(c.ko)} <span class="muted small">(${pos(c)} ${c.age}세 · ${L.hiddenForeign(c) ? '추정 ' + Math.round(L.fEst(c).o) : 'OVR ' + L.ovr(c)})</span>`], ['계약 기간', `${mo}개월`], ['비용', `<b>${cost}억</b> (월 1.4억 × ${mo}개월, 올해 비용으로 즉시 확정)`], ['FA 여유자금', `${room.toFixed(1)}억 → ${(room - cost).toFixed(1)}억`], ['일반 외국인 한도', '3명 한도 밖(대체 계약)'], ['포스트시즌', dl.passed ? '<b class="neg">8월 15일 이후라 출전 불가</b>' : '출전 가능(8월 15일 이전)']], notes: [{ t: '계약이 끝나거나 해지하면 즉시 FA로 공시되며 지급한 비용은 돌려받지 못합니다.' }], run: () => A.subSignDo(a) });
    },
    subSignDo(a) { const e = L.subSign(a, ui.subCand || ($('[data-sel="subcand"]') || {}).value, ui.subMo || +($('[data-sel="submo"]') || {}).value || 1); if (e) toast(e); else { toast('대체 외국인을 영입했습니다.'); ui.subFor = null; autosave(); } render(); },
    subExtendA(a) { const e = L.subExtend(a, 1); if (e) toast(e); else { toast('계약을 1개월 연장했습니다.'); autosave(); } render(); },
    subDecideA(a) {
      const [id, ch] = a.split(':'); if (ch === 'convert') { const pv = L.subConvertPreview(id); if (pv && pv.ok) { askConfirm({ title: `${pv.c.ko} 정식 전환`, ok: '정식 전환 확정', rows: [['정식 전환', `${esc(pv.c.ko)} <span class="muted small">(OVR ${L.ovr(pv.c)})</span>`], ['웨이버 대상', `${esc(pv.o.ko)} <span class="muted small">(${money(pv.o.contract.salary)} · 위약금 ${pv.rel.total.toFixed(1)}억)</span>`], ['새 계약', `${pv.sal}억 (잔여 ${pv.rem.toFixed(1)}개월 × 월 1.4억 한도)`], ['교체 횟수', `${pv.sw.n}/${pv.sw.max}회 → ${pv.sw.n + 1}/${pv.sw.max}회`], ['이사회 신뢰도', pv.rel.trust < 0 ? `<b class="neg">${pv.rel.trust}</b>` : '변화 없음']], notes: [{ t: '기존 선수는 방출(웨이버)되고 되돌릴 수 없습니다.' }], run: () => A.subDecideDo(a) }); return; } }
      A.subDecideDo(a);
    },
    subDecideDo(a) { const [id, ch] = a.split(':'); const e = L.subDecide(id, ch); if (e) toast(e); else { toast(ch === 'convert' ? '정식 외국인으로 전환했습니다.' : '대체 계약을 해지했습니다.'); autosave(); } render(); },
    scoutOpen(a) { ui.scoutId = a; render(); }, scoutClose() { ui.scoutId = null; render(); },
    scoutFilter(a) { ui.scF = a; render(); }, scoutSort(a) { ui.scS = a; render(); },
    trainSide(a) { const [s, k, v] = a.split(':'); if (L.setTrainSide(s, k, v)) { autosave(); render(); } },
    trainPreset(a) { const e = L.applyTrainPreset(a); if (e) toast(e); else { toast('훈련 프리셋을 적용했습니다.'); autosave(); } render(); },
    trainPresetSave() { const e = L.saveTrainPreset(($('#presetName') || {}).value); if (e) toast(e); else { toast('현재 설정을 프리셋으로 저장했습니다.'); autosave(); } render(); },
    trainPresetDel(a) { const e = L.deleteTrainPreset(a); if (e) toast(e); else autosave(); render(); },
    slotAddDo(a) { const e = L.slotAdd(a); if (e) toast(e); else { toast('개별 훈련을 시작했습니다.'); autosave(); } render(); },
    slotAddPick() { const id = ui.slotPick; if (!id) return toast('추가할 선수를 선택하세요.'); const e = L.slotAdd(id); if (e) toast(e); else { ui.slotPick = ''; autosave(); } render(); },
    slotSetA(a) { const [id, k, v] = a.split(':'), e = L.slotSet(id, k, v); if (e) toast(e); else autosave(); render(); },
    slotRemoveA(a) { const e = L.slotRemove(a); if (e) toast(e); else autosave(); render(); },
    campSet(a) { const [s, f, lv] = a.split(':'), e = L.setCamp(s, f, +lv); if (e) toast(e); else autosave(); render(); },
    team(a) { ui.viewTeam = a; ui.screen = 'teams'; ui.modal = null; render(); window.scrollTo(0, 0); },
    fatab(a) { ui.faTab = a; render(); },
    faDay(a) { const k = L.faAdvance(+a); toast(L.S.faMkt ? `${L.faDateStr(L.S.faMkt.day)}가 되었습니다.` : ''); if (k) autosave(); render(); },
    faClose() { L.closeFA(); toast('FA 협상을 마감했습니다.'); autosave(); render(); },
    faBeat(a) { const p = P(a), q = k => $(`[data-sel="${k}"][data-a="${a}"]`), y = q('fayears'), b = L.faBeat(p, U(), y ? +y.value : undefined); (ui.faIn = ui.faIn || {})[a] = { years: b.years, salary: b.salary, bonus: b.bonus }; render(); },
    signFA(a) { confirmFA(a); },
    signFADo(a) { const q = k => $(`[data-sel="${k}"][data-a="${a}"]`), y = q('fayears'), sal = q('fasal'), bon = q('fabonus'), e = L.signFA(a, y && sal ? { years: +y.value, salary: +sal.value, bonus: bon ? +bon.value : 0 } : undefined); (ui.faIn = ui.faIn || {})[a] = y && sal ? { years: +y.value, salary: +sal.value, bonus: bon ? +bon.value : 0 } : undefined; if (e && e.startsWith('예산 부족') && y && sal) { ui.persuade = { id: a, offer: { years: +y.value, salary: +sal.value, bonus: bon ? +bon.value : 0 } }; toast(e); autosave(); } else if (e) { toast(e); autosave(); } else { ui.persuade = null; delete ui.faIn[a]; toast(P(a).foreign ? `${P(a).ko} 계약 완료. ${P(a).active ? '1군 엔트리에 등록했습니다.' : '1군 엔트리가 가득 차 2군에서 대기합니다.'}` : `${P(a).ko} 영입 완료. 2군에 등록되었습니다.`); autosave(); } render(); },
    resignAll() { const n = L.resignAll(); toast(`${n}명 재계약했습니다.`); autosave(); render(); },
    foreignSlot(a) { ui.fslot = a; render(); }, fslotClose() { ui.fslot = null; render(); },
    resign(a) { const e = L.resign(a); if (e) toast(e); else autosave(); render(); },
    toDraft() { L.finishContracts(); L.buildDraft(); L.S.off.step = 'draft'; autosave(); render(); A.draftRun(); },
    draftRun() { clearInterval(ui.draftT); ui.draftT = setInterval(() => { const off = L && L.S.off; if (!off || !off.draft || off.step !== 'draft') { clearInterval(ui.draftT); ui.draftT = null; return; } const r = L.draftAiStep(); if (r.done || r.userTurn) { clearInterval(ui.draftT); ui.draftT = null; autosave(); } softRender(); }, 550); render(); },
    draftSkip() { clearInterval(ui.draftT); ui.draftT = null; L.draftAiUntilUser(); autosave(); render(); },
    draftPick(a) { const e = L.draftPick(a); if (e) toast(e); else { autosave(); render(); A.draftRun(); return; } render(); },
    draftSim() { A.draftRun(); },
    draftAuto() { L.draftAutoRest(); autosave(); render(); },
    toFA() { L.finishDraft(); L.openFAMarket(); L.S.off.step = 'fa'; ui.market = 'fa'; autosave(); render(); },
    toSeason() { L.closeFA(); L.startNewSeason(); ui.faIn = {}; ui.screen = 'home'; autosave(); render(); window.scrollTo(0, 0); },
    importHands() { const t = ($('#handsText') || {}).value; if (!t || !t.trim()) return toast('붙여넣은 내용이 없습니다.'); const r = L.importHands(t); autosave(); render(); toast(`투타 ${r.applied}명 적용${r.ambiguous.length ? ' · 동명이인 ' + r.ambiguous.length + '명은 팀 이름이 필요합니다(' + [...new Set(r.ambiguous)].slice(0, 4).join(', ') + ')' : ''}${r.missing.length ? ' · 찾지 못한 이름 ' + r.missing.length + '줄' : ''}`); },
    handTemplate() { const t = L.handTemplate(); ui.handsText = t; try { navigator.clipboard.writeText(t).then(() => toast('입력 양식을 복사했습니다. 이름,팀,구분 뒤에 투타(예: 우투우타)를 적어 붙여넣으세요.'), () => toast('텍스트를 직접 복사하세요.')); } catch (e) { toast('텍스트를 직접 복사하세요.'); } },
    saveNow() { if (store.set(SAVE_KEY, L.save())) toast('저장했습니다.'); else toast('이 환경에서는 저장할 수 없습니다. 백업 텍스트를 사용하세요.'); },
    exportSave() { const t = { value: L.save() }; ui.saveText = t.value; try { navigator.clipboard.writeText(t.value).then(() => toast('백업 텍스트를 복사했습니다.'), () => toast('텍스트를 직접 복사하세요.')); } catch (e) { toast('텍스트를 직접 복사하세요.'); } },
    importSave() { const t = ($('#saveText') || {}).value; if (!t || !t.trim()) return toast('붙여넣은 텍스트가 없습니다.'); try { L = League.load(t.trim()); ui.screen = 'home'; autosave(); render(); toast('불러왔습니다.'); } catch (e) { toast('올바른 백업 텍스트가 아닙니다.'); } },
    newGameMenu() { L = null; ui.live = null; ui.pre = null; render(); },
    /* 경기 */
    liveRun(a) { liveRun(a); },
    liveTac(a) { const lv = ui.live; if (a === 'pcOpen') { lv.pick = { t: 'pc' }; lv.sheet = null; render(); } else if (a === 'phOpen') { lv.pick = { t: 'ph' }; lv.sheet = null; render(); } else if (a === 'prOpen') { lv.pick = { t: 'pr', base: null }; lv.sheet = null; render(); } else if (a === 'dsOpen') { lv.pick = { t: 'ds', slot: null }; lv.sheet = null; render(); } else liveTactic(a); },
    liveSheet(a) { ui.live.sheet = a; render(); }, liveSheetClose() { ui.live.sheet = null; render(); }, sheetClose() { ui.sheet = null; render(); },
    liveSet(a, b) { const lv = lvOrders(ui.live), us = lv.ctx.userSide; if (a === 'bat') lv.batBase = b; lv.ctx.live.setTactic(us, a, (a === 'inf' || a === 'hold') ? b === '1' : b); render(); },
    liveAuto() { ui.live.ctx.auto = !ui.live.ctx.auto; render(); },
    livePrBase(a) { ui.live.pick.base = +a; render(); }, liveDsSlot(a) { ui.live.pick.slot = +a; render(); },
    liveAdv(a) { const lv = ui.live, us = lv.ctx.userSide; if (a === 'pcOpen' || a === 'phOpen' || a === 'prOpen') A.liveTac(a); else if (a === 'ibb' || a === 'bunt' || a === 'har' || a === 'mv') liveTactic(a); else if (a === 'inf' || a === 'hold') { lv.ctx.live.setTactic(us, a, true); render(); } else { lvOrders(lv); lv.batPlan[lv.ctx.live.batter.id] = a; applyOrders(); render(); } },
    livePickClose() { ui.live.pick = null; render(); },
    livePop(a) { ui.live.pop = a; render(); }, livePopClose() { ui.live.pop = null; render(); },
    popDo(a) {   // 팝업 지시 실행: 기존 작전과 같은 함수를 호출한다
      const lv = ui.live, [t, x, y] = a.split(':'); lv.pop = null;
      lvOrders(lv); const g = lv.ctx.live, us = lv.ctx.userSide;
      if (t === 'tac') liveTactic(x); else if (t === 'po') liveTactic('po', x);
      else if (t === 'set' && (x === 'bplan' || x === 'bbase')) { if (x === 'bplan') lv.batPlan[g.batter.id] = y; else { lv.batBase = y; } applyOrders(); render(); }
      else if (t === 'set' && x === 'stopfat') { lv.stops.fat = +y; lv.pop = 'plan'; render(); }
      else if (t === 'set' && x === 'stoprisp') { lv.stops.risp = y === '1'; lv.pop = 'plan'; render(); }
      else if (t === 'rv') {
        const q = n => (document.querySelector(`[data-sel="${n}"]`) || {}).value || lv.form[n];
        if (x === 'del') lv.resv = lv.resv.filter(r => String(r.id) !== y);
        else if (x === 'addpc') { const to = q('rvpcto'), thr = +q('rvpcpct') || 30; if (to) lv.resv.push({ id: ++lv.rvSeq || (lv.rvSeq = 1), kind: 'pc', thr, to }); }
        else if (x === 'addph') { const bt = q('rvphbat'), to = q('rvphto'); if (bt && to) { if (bt === g.batter.id && g.batSide === us) toast('지금 타석에 선 타자입니다. 바로 대타를 쓰려면 타자 팝업의 대타를 누르세요.'); else lv.resv.push({ id: ++lv.rvSeq || (lv.rvSeq = 1), kind: 'ph', batter: bt, to }); } }
        lv.pop = 'plan'; render();
      }
      else if (t === 'set') A.liveSet(x, y);
      else if (t === 'open') { if (x === 'plan') { lv.pop = 'plan'; render(); } else if (x === 'pr') { lv.pick = { t: 'pr', base: +y }; render(); } else if (x === 'pc') { lv.pick = { t: 'pc' }; render(); } else if (x === 'ph') { lv.pick = { t: 'ph' }; render(); } }
    },
    liveDo(a, b) { liveTactic(a, b); },
    liveAbort() { const lv = ui.live; lv.ctx.auto = true; const g = lv.ctx.live; L.playAuto(lv.ctx); lv.feed.unshift({ w: '', t: `경기 종료 ${KO[g.away]} ${g.score.away} : ${g.score.home} ${KO[g.home]}`, sys: true }); lv.sheet = null; lv.pick = null; render(); },
    liveFinish() {
      const lv = ui.live, post = lv.post, before = lv.before; let rv = []; try { rv = L.reviewDecisions(lv.ctx.live, lv.dec); } catch (e) { rv = []; } const r = post ? L.finishUserPostGame(lv.ctx) : L.finishUserGame(lv.ctx);
      ui.live = null; ui.review = rv; autosave(); if (post) openPostSheet([r]); else openResultSheet(before); if (ui.review && ui.sheet && ui.review.length) ui.sheet.html += reviewHtml(ui.review); ui.review = null; render(); window.scrollTo(0, 0);
    }
  };
  const UNDO_LABEL = { toggleActive: '1군/2군 이동', autoLineup: '라인업 자동 설정', autoPitch: '투수진 자동 설정', lmove: '타순 변경', plan: '경기 계획', train: '훈련 방침', policy: '운영 방침', captain: '주장 변경', quickAct: '빠른 메뉴 변경' };
  Object.assign(UNDO_LABEL, { trainSide: '훈련 설정', trainPreset: '훈련 프리셋', slotAddDo: '개별 훈련 추가', slotAddPick: '개별 훈련 추가', slotSetA: '개별 훈련 변경', slotRemoveA: '개별 훈련 종료', campSet: '비시즌 캠프' });
  Object.keys(UNDO_LABEL).forEach(k => { const f = A[k]; if (f) A[k] = function (...args) { if (L) L.pushUndo(UNDO_LABEL[k]); return f.apply(this, args); }; });
  /* 길게 누르기(0.45초): 선수 행에서 빠른 메뉴 */
  let lpT = null, lpX = 0, lpY = 0, lpFired = false;
  document.addEventListener('pointerdown', e => { lpFired = false; const tr = e.target.closest && e.target.closest('tr[data-act="player"]'); if (!tr || !L || ui.live || e.target.closest('[data-stop]')) return; lpFired = false; lpX = e.clientX; lpY = e.clientY; clearTimeout(lpT); lpT = setTimeout(() => { lpFired = true; ui.quick = tr.dataset.a; render(); if (navigator.vibrate) { try { navigator.vibrate(15); } catch (x) { /* 미지원 */ } } }, 450); });
  document.addEventListener('pointermove', e => { if (lpT && (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10)) { clearTimeout(lpT); lpT = null; } });
  ['pointerup', 'pointercancel', 'scroll'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(lpT); lpT = null; if (lpFired) setTimeout(() => { lpFired = false; }, 350); }, true));   // 길게 누른 뒤 클릭이 오지 않아도 다음 탭이 막히지 않게
  let drg = null;
  document.addEventListener('pointerdown', e => { const h = e.target.closest && e.target.closest('[data-drag]'); if (!h || !L) return; drg = { i: +h.dataset.drag, over: null }; e.preventDefault(); });
  document.addEventListener('pointermove', e => { if (!drg) return; const el = document.elementFromPoint(e.clientX, e.clientY), tr = el && el.closest && el.closest('tr[data-lu]'); document.querySelectorAll('tr.dragover').forEach(x => x.classList.remove('dragover')); if (tr) { tr.classList.add('dragover'); drg.over = +tr.dataset.lu; } });
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { if (!drg) return; const d = drg; drg = null; document.querySelectorAll('tr.dragover').forEach(x => x.classList.remove('dragover')); if (d.over !== null && d.over !== d.i) { L.swapLineup(d.i, d.over); ui.sel = null; autosave(); render(); } }));
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('tr[data-act="player"]')) e.preventDefault(); });
  document.addEventListener('click', e => {
    if (lpFired) { lpFired = false; e.stopPropagation(); e.preventDefault(); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    if ((el.classList.contains('modal-bg') || el.classList.contains('sheet-bg')) && e.target !== el) return;   // 배경을 눌렀을 때만 닫기
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return;   // 체크박스는 change 에서 처리
    const act = el.dataset.act; if (A[act]) A[act](el.dataset.a, el.dataset.b);
  });
  document.addEventListener('input', e => { const el = e.target; if (el.id === 'gsq' && ui.search) { ui.search.q = el.value; const r = $('#gsres'); if (r) r.innerHTML = searchHtml(el.value); return; } if (el.id === 'handsText') ui.handsText = el.value; else if (el.id === 'saveText') ui.saveText = el.value; });
  document.addEventListener('change', e => {
    const el = e.target; if (!L && el.id !== 'seedIn') return;
    if (el.id === 'seedIn') { ui.seed = el.value; return; }
    if (el.id === 'liveMode') { ui.liveMode = el.checked; render(); return; }
    if (el.id === 'playMode') { ui.liveMode = el.value !== 'auto'; ui.hl = el.value === 'highlight'; render(); return; }
    if (el.id === 'autoBp') { ui.live.ctx.auto = el.checked; return; }
    if (el.type === 'checkbox' && el.dataset.act && A[el.dataset.act]) { A[el.dataset.act](el.dataset.a, el); return; }
    const sel = el.dataset.sel; if (!sel) return;
    if (sel === 'negyears') { const n = L.S.neg; if (n) { ui.negIn = L._negMin(P(n.id), n.kind, +el.value); render(); } return; }
    if (sel === 'negsal' || sel === 'negbon') { const n = L.S.neg; if (n) { ui.negIn = Object.assign({}, ui.negIn || L.negBest(n.id)); ui.negIn[sel === 'negsal' ? 'salary' : 'bonus'] = Math.max(0, +el.value || 0); render(); } return; }
    if (sel === 'negrole') { ui.negRole = el.value; return; }
    if (sel === 'storyy') { ui.storyY = +el.value; render(); return; }
    if (sel === 'slotpick') { ui.slotPick = el.value; return; }
    if (['rvpcpct', 'rvpcto', 'rvphbat', 'rvphto'].includes(sel)) { const lv = ui.live; if (lv) { lv.form = lv.form || {}; lv.form[sel] = el.value; } return; }
    if (sel === 'subcand') { ui.subCand = el.value; return; }
    if (sel === 'submo') { ui.subMo = +el.value; render(); return; }
    if (['lpl', 'lpos', 'pslot'].includes(sel)) L.pushUndo('편성 변경');
    const set = L.team(U()).set;
    if (sel === 'rsort') { ui.rf.s = el.value; render(); }
    else if (sel === 'ttteam') { ui.trade.team = el.value; ui.trade.get.clear(); render(); }
    else if (sel === 'fasort') { ui.faSort = el.value; render(); }
    else if (sel === 'capg') { L.S.cbt.growth = +el.value; L.invalidate(); autosave(); render(); }
    else if (sel === 'fayears') { const a = el.dataset.a, o = L.faDefaultOffer(P(a), U(), +el.value), sal = $(`[data-sel="fasal"][data-a="${a}"]`), bon = $(`[data-sel="fabonus"][data-a="${a}"]`); if (sal) sal.value = o.salary; if (bon) bon.value = o.bonus; }
    else if (sel === 'lpl') { const i = +el.dataset.i, j = set.lineup.findIndex(x => x.id === el.value); if (j >= 0 && j !== i) { const t = set.lineup[i].id; set.lineup[i].id = el.value; set.lineup[j].id = t; } else set.lineup[i].id = el.value; const map = L.resolvePositions(set.lineup.map(x => x.id)); set.lineup.forEach(x => { x.pos = map[x.id]; }); autosave(); render(); toast('선수를 바꾸면 수비 위치를 자동으로 다시 배정합니다. 위치는 직접 바꿀 수도 있습니다.'); }
    else if (sel === 'lpos') { const i = +el.dataset.i, j = set.lineup.findIndex((x, k) => x.pos === el.value && k !== i); if (j >= 0) set.lineup[j].pos = set.lineup[i].pos; set.lineup[i].pos = el.value; autosave(); render(); }
    else if (sel === 'pslot') {
      const b = set.bullpen, get = (k, i) => k === 'rot' ? set.rotation[i] : k === 'close' ? b.closer : k === 'setup' ? b.setup[i] : k === 'mid' ? b.middle[i] : b.long[i];
      const put = (k, i, id) => { if (k === 'rot') set.rotation[i] = id; else if (k === 'close') b.closer = id; else if (k === 'setup') b.setup[i] = id; else if (k === 'mid') b.middle[i] = id; else b.long[i] = id; };
      const k = el.dataset.k, i = +el.dataset.i, old = get(k, i), nid = el.value, slots = pitchSlots(), at = slots.find(s => s.id === nid && !(s.k === k && s.i === i));
      if (at) put(at.k, at.i, old); put(k, i, nid); autosave(); render();
    }
  });
  applyFont();
  let sw0 = null;   // 선수 상세 좌우 스와이프: 같은 팀 선수 이전/다음
  document.addEventListener('touchstart', e => { sw0 = ui.modal && e.target.closest && e.target.closest('.modal') && !e.target.closest('.tablewrap') ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  document.addEventListener('touchend', e => { if (!sw0 || !ui.modal || !L) return; const t = e.changedTouches[0], dx = t.clientX - sw0.x, dy = t.clientY - sw0.y; sw0 = null; if (Math.abs(dx) < 70 || Math.abs(dy) > 40) return; const p = P(ui.modal), list = L.players(p.team).sort((x, y) => L.ovr(y) - L.ovr(x)), i = list.findIndex(x => x.id === p.id), n = list[i + (dx < 0 ? 1 : -1)]; if (n) { ui.modal = n.id; ui.confirm = null; render(); } }, { passive: true });
  /* 아래 시트: 손잡이(회색 막대)가 있는 시트는 맨 위에서 아래로 쓸어내려 닫을 수 있다(배경 터치·닫기 버튼과 같은 동작). 위로·옆으로 쓸거나 목록을 스크롤하는 중에는 반응하지 않는다 */
  let sheetDrag = null;
  document.addEventListener('touchstart', e => {
    const sh = e.target.closest && e.target.closest('.sheet'), bg = sh && sh.parentElement; if (!sh || !bg || !bg.classList.contains('sheet-bg') || !bg.dataset.act || e.touches.length !== 1) { sheetDrag = null; return; }
    const t = e.touches[0]; sheetDrag = { sh, bg, x0: t.clientX, y0: t.clientY, t0: Date.now(), dy: 0, on: false, top: sh.scrollTop <= 0, ok: !e.target.closest('input, textarea, select, .tablewrap') };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    const d = sheetDrag; if (!d || !d.ok || e.touches.length !== 1) return; const t = e.touches[0], dy = t.clientY - d.y0, dx = t.clientX - d.x0;
    if (!d.on) { if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) { sheetDrag = null; return; } if (!(d.top && d.sh.scrollTop <= 0 && dy > 10 && dy > Math.abs(dx))) return; d.on = true; d.y0 = t.clientY; d.t0 = Date.now(); d.dy = 0; d.sh.style.transition = 'none'; return; }
    d.dy = Math.max(0, t.clientY - d.y0); d.sh.style.transform = `translateY(${d.dy}px)`;
  }, { passive: true });
  const endSheetDrag = () => {
    const d = sheetDrag; sheetDrag = null; if (!d || !d.on) return; const fast = d.dy / Math.max(1, Date.now() - d.t0) > 0.6; d.sh.style.transition = 'transform .18s ease-out';
    if (d.dy > 110 || (fast && d.dy > 50)) { d.sh.style.transform = 'translateY(100%)'; setTimeout(() => d.bg.dispatchEvent(new MouseEvent('click', { bubbles: true })), 170); } else d.sh.style.transform = '';
  };
  ['touchend', 'touchcancel'].forEach(ev => document.addEventListener(ev, endSheetDrag, { passive: true }));
  window.addEventListener('keydown', e => {
    if (!L) return; const tg = e.target, typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
    if (e.key === 'Escape') { if (ui.cf) A.cfClose(); else if (ui.search) A.searchClose(); else if (ui.cmpOpen) A.cmpClose(); else if (ui.modal) A.closeModal(); return; }
    if (e.key === 'Enter' && ui.search && tg && tg.id === 'gsq') { const f = document.querySelector('#gsres .srow[data-act="searchPick"]'); if (f) { e.preventDefault(); A.searchPick(f.dataset.a); } return; }
    if (e.key === '/' && !typing && !ui.live && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); A.searchOpen(); }
    if ((e.key === 'Enter' || e.key === ' ') && tg && tg.getAttribute && tg.getAttribute('role') === 'button' && tg.dataset.act && tg.tagName !== 'BUTTON') { e.preventDefault(); tg.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  render();
})();
