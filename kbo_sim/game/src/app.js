(function () {
  'use strict';
  const { League, KO, POSS, ACTIVE_MAX } = KBOLeague, E0 = KBOEngine, TEAMS = E0.TEAMS, PARK = E0.PARKNAME;
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
        <div class="small muted">${PARK[t]} 구장 · 연봉 ${money(preview.cbtPay(t))}</div>
        <div class="row small"><span>타선 <b class="num">${r.bat.toFixed(0)}</b></span><span>선발 <b class="num">${r.sp.toFixed(0)}</b></span><span>불펜 <b class="num">${r.rp.toFixed(0)}</b></span></div>
        <div class="small">${stars.map(p => `${esc(p.ko)} ${ovrChip(preview.ovr(p))}`).join(' ')}</div></button>`;
    }).join('');
    return `<div class="start"><header><h1>KBO 감독 모드</h1><p class="muted" style="margin:6px 0 0">구단을 골라 라인업·로테이션·불펜을 짜고, 경기를 직접 지휘하고, 트레이드·FA·드래프트로 팀을 키우세요. 정규시즌 144경기 뒤 포스트시즌이 이어지고, 시즌이 끝나면 다음 시즌으로 계속됩니다.</p></header>
      <div class="teamcards">${cards}</div>
      <div class="card row"><div><h2>${KO[ui.team]}으로 시작</h2><div class="small muted">2027 시즌 · 선수 능력치는 2024~2026 기록을 합산해 평균으로 보정한 값입니다.</div></div><span class="sp"></span>
        <label class="small muted">시드(선택) <input type="text" id="seedIn" inputmode="numeric" value="${esc(ui.seed)}" style="width:110px" placeholder="무작위"></label>
        <button class="primary big" data-act="newgame">감독 시작</button>${has ? '<button class="big" data-act="continue">이어하기</button>' : ''}</div></div>`;
  }

  /* ---------------- 공통 셸 ---------------- */
  const NAV = [['home', '대시보드'], ['roster', '로스터'], ['farm', '2군'], ['lineup', '라인업'], ['pitching', '투수진'], ['schedule', '일정·결과'], ['standings', '순위·기록'], ['teams', '팀 정보'], ['finance', '재정'], ['coach', '코치진'], ['market', '이적시장'], ['offseason', '오프시즌'], ['save', '저장·설정']];
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
    const S = L.S, st = L.standings(), my = st.find(x => x.team === U()), pr = primary(), nav = NAV.filter(n => n[0] !== 'offseason' || S.phase === 'offseason');
    return `<div class="app"><nav class="side" aria-label="메뉴"><div class="club">${logo(U(), 34)}${KO[U()]}</div>
      ${nav.map(n => `<button data-act="go" data-a="${n[0]}" ${ui.screen === n[0] ? 'aria-current="true"' : ''}>${n[1]}${n[0] === 'offseason' ? ' ●' : ''}</button>`).join('')}</nav>
      <div class="main"><header class="top"><div class="info"><span class="date">${S.year} · ${phaseLabel()}</span><span class="muted">${S.phase === 'offseason' ? '오프시즌' : (my.w + my.l + my.d === 0 ? '개막 전' : `${my.rank}위 · ${my.w}승 ${my.l}패 ${my.d}무`)}</span><span class="muted">${cbtText(U())}</span></div>
      <button class="primary" data-act="${pr.act}" ${pr.a !== undefined ? `data-a="${pr.a}"` : ''}>${pr.label}</button></header><main class="content">${content}</main>
      <div class="dock"><div class="dinfo"><b>${phaseLabel()}</b><span class="muted">${S.phase === 'offseason' ? '오프시즌' : (my.w + my.l + my.d === 0 ? '개막 전' : `${my.rank}위 · ${my.w}승 ${my.l}패${my.d ? ' ' + my.d + '무' : ''}`)}</span></div><button class="primary" data-act="${pr.act}" ${pr.a !== undefined ? `data-a="${pr.a}"` : ''}>${pr.label}</button></div></div></div>`;
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
    const act = fam ? `<div class="card"><h2>FA 협상 기간 · ${L.faDateStr(S.faMkt.day)}</h2><div class="small muted">시즌 개막 전에 FA 계약을 마무리해야 합니다. 개막 ${L.faDaysLeft()}일 전 — 날짜를 하루씩 진행하며 경쟁 구단의 입찰을 보고 금액을 조정하세요.</div><div class="row" style="margin-top:8px"><button class="primary" data-act="openFAMarket">FA 시장 열기</button></div></div>` : live ? `<div class="card"><h2>진행</h2><div class="row"><label class="row" style="gap:6px"><input type="checkbox" id="liveMode" ${ui.liveMode ? 'checked' : ''}>내 경기는 직접 지휘</label><span class="sp"></span>
      <button data-act="adv" data-a="1">${ui.liveMode ? '경기 시작' : '하루 진행'}</button><button data-act="advAuto" data-a="7">1주 자동</button><button data-act="advAuto" data-a="30">1개월 자동</button><button data-act="advAuto" data-a="999">시즌 끝까지</button></div>
      <p class="small muted" style="margin:8px 0 0">직접 지휘를 켜면 내 경기 직전에 멈춰 타석 단위로 진행합니다. 자동 진행은 설정한 라인업·로테이션·불펜대로 경기를 처리합니다.</p></div>` : '';
    const nxt = ng.length ? `<div class="card"><h2>다음 경기</h2><div class="tablewrap"><table><tbody>${ng.map((g, i) => { const opp = g.home === U() ? g.away : g.home; return `<tr><td class="l">${L.dateStr(g.day)}</td><td class="l">${g.home === U() ? '홈' : '원정'} ${teamTag(opp)}</td><td class="l small muted">${PARK[g.home]}</td>${i === 0 ? `<td class="l small">선발 <b>${esc(nextSp.ko)}</b></td>` : '<td></td>'}</tr>`; }).join('')}</tbody></table></div></div>` : '';
    return `<div class="kpis"><div class="kpi"><div class="l">순위</div><div class="v">${S.phase === 'offseason' || my.w + my.l + my.d === 0 ? '-' : my.rank + '위'}</div></div><div class="kpi"><div class="l">성적</div><div class="v">${my.w}승 ${my.l}패</div></div><div class="kpi"><div class="l">득점 / 실점</div><div class="v">${my.rs} / ${my.ra}</div></div><div class="kpi"><div class="l">연봉(상위 40) / 상한</div><div class="v">${L.cbtPay(U())} / ${L.cbtCap().toFixed(1)}</div></div><div class="kpi"><div class="l">경기 진행</div><div class="v">${Math.min(S.day, 144)} / 144</div></div></div>
      ${screenPhaseBanner()}${act}${nxt}${injCard()}<div class="grid"><div class="card"><h2>순위</h2><div class="tablewrap"><table><tbody>${rows}</tbody></table></div></div><div class="card"><h2>구단 소식</h2><ul class="news">${news}</ul></div></div>`;
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
    else if (L.userInPost()) head = `<div class="card"><h2>내 경기</h2><div class="row"><span>${esc(P2.cur.name)} · ${KO[L.postNextGame().home]} 홈구장 ${PARK[L.postNextGame().home]}</span><span class="sp"></span><button class="primary" data-act="postLive">직접 지휘</button><button data-act="postAuto">자동 진행</button></div></div>`;
    else head = `<div class="card row"><span>${esc(P2.cur ? P2.cur.name : '')} 진행 중${S.phase === 'post' && !P2.seeds.includes(U()) ? ' · 내 팀은 탈락/미진출' : ''}</span><span class="sp"></span><button data-act="postNext">다음 경기</button><button data-act="postAll">내 경기 전까지 진행</button></div>`;
    return `<div class="card"><h2>포스트시즌</h2>${head}<div class="bracket" style="margin-top:12px">${rounds.map(s => seriesCard(s, seeds)).join('')}</div></div>`;
  }

  /* ---------------- 로스터 ---------------- */
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
      return `<tr class="click${p.active ? '' : ' dim'}" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b> ${p.active ? '' : '<span class="chip" title="2군">2군</span>'}${p.foreign ? ` <span class="chip">${p.aq ? 'AQ' : '외'}</span>` : ''}${injChip(p)}${L.handLabel(p) ? ` <span class="chip hm">${L.handLabel(p)}</span>` : ''}<div class="small muted vm">${pos(p)} · ${p.age}세</div></td><td class="l hm">${pos(p)}</td><td class="n hm">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td>${lk}</td><td class="n">${salCell(p)}<div class="small muted">${c.years}년${c.end ? ' <span class="hm">(~' + c.end + ')</span>' : ''}</div></td><td class="l hm">${subHtml(p)}</td><td class="l small hm">${statLine(p)}</td></tr>`; };
    const head = '<thead><tr><th class="l">선수</th><th class="l hm">포지션</th><th class="hm">나이</th><th>OVR</th><th title="스카우트 추정 성장 상한(25세 이하)">잠재</th><th>연봉·계약</th><th class="l hm">세부 능력</th><th class="l hm">올 시즌</th></tr></thead>';
    const groups = [['선발투수', p => p.type === 'P' && p.role === 'SP'], ['구원투수', p => p.type === 'P' && p.role !== 'SP'], ['포수', p => p.pos === 'C'], ['내야수', p => ['1B', '2B', '3B', 'SS'].includes(p.pos)], ['외야수', p => ['LF', 'CF', 'RF'].includes(p.pos)], ['지명타자', p => p.type === 'B' && p.pos === 'DH']];
    const body = v === 'pos' ? groups.map(([nm, g]) => { const r = rows.filter(g); if (!r.length) return ''; const a1 = r.filter(p => p.active);
      return `<div class="card"><div class="row"><h2 style="margin:0">${nm}</h2><span class="muted small">${r.length}명 · 1군 ${a1.length} · 평균 OVR ${avg(r, p => L.ovr(p)).toFixed(1)} · 평균 ${avg(r, p => p.age).toFixed(1)}세</span></div><div class="tablewrap"><table class="rost">${head}<tbody>${r.map((p, i) => (rank(p) === 2 && (i === 0 || rank(r[i - 1]) !== 2) ? '<tr class="sub"><td colspan="8" class="small muted">부상자 명단 — 복귀(예정일) 전까지 1군에 등록할 수 없습니다</td></tr>' : '') + rowOf(p)).join('')}</tbody></table></div></div>`; }).join('')
      : `<div class="card"><div class="tablewrap"><table class="rost">${head}<tbody>${rows.map(rowOf).join('')}</tbody></table></div></div>`;
    const flab = [['all', '전체'], ['act', '1군'], ['res', '2군'], ['inj', '부상'], ['exp', '계약 1년 이하'], ['frn', '외국인'], ['young', '유망주(25세↓ 잠재 C+)']];
    const sortName = { ovr: '능력치(OVR) 높은 순', age: '나이 어린 순', sal: '연봉 높은 순', pot: '잠재력 높은 순' }[sk];
    return `<div class="card"><div class="row"><h2 style="margin:0">로스터</h2><span class="muted small">${all.length}명 · 1군 ${n1.length}/${ACTIVE_MAX}</span><span class="sp"></span><select data-sel="rsort" aria-label="정렬 기준"><option value="ovr" ${sk === 'ovr' ? 'selected' : ''}>능력치순</option><option value="pot" ${sk === 'pot' ? 'selected' : ''}>잠재력순</option><option value="age" ${sk === 'age' ? 'selected' : ''}>나이순</option><option value="sal" ${sk === 'sal' ? 'selected' : ''}>연봉순</option></select></div>
      <div class="kpis" style="margin-top:10px"><div class="kpi"><div class="l">1군 평균 OVR</div><div class="v">${avg(n1, p => L.ovr(p)).toFixed(1)}</div><div class="small muted">1군 평균 ${avg(n1, p => p.age).toFixed(1)}세</div></div><div class="kpi"><div class="l">구성</div><div class="v">투수 ${all.filter(p => p.type === 'P').length} · 타자 ${all.filter(p => p.type === 'B').length}</div><div class="small muted">부상 ${all.filter(p => L.isInj(p)).length} · 외국인 ${all.filter(p => p.foreign).length}</div></div><div class="kpi"><div class="l">연봉(상위 40)</div><div class="v">${L.cbtPay(t)}</div><div class="small muted">상한 ${L.cbtCap().toFixed(1)}억 · 계약 1년 이하 ${all.filter(flt.exp).length}명</div></div></div></div>
      <div class="tabs" role="tablist"><button role="tab" aria-selected="${v === 'pos'}" data-act="rview" data-a="pos">포지션별</button><button role="tab" aria-selected="${v === 'list'}" data-act="rview" data-a="list">전체 목록</button></div>
      <div class="chips">${flab.map(x => `<button class="sm" aria-pressed="${f === x[0]}" data-act="rfilter" data-a="${x[0]}">${x[1]}</button>`).join('')}</div>
      <div class="small muted">정렬: ${v === 'pos' ? '포지션 그룹 안에서 <b>1군 → 2군 → 부상자 명단</b>, 각각 ' : ''}<b>${sortName}</b> · 행을 누르면 상세(능력·잠재력·계약·성장 경로)가 열립니다. 2군은 흐리게 표시됩니다.</div>${body || '<div class="card muted">조건에 맞는 선수가 없습니다.</div>'}`;
  }
  function modalPlayer(id) {
    const p = P(id), mine = p.team === U(), s = L.sub(p);
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
    const acts = mine ? `<div class="row"><button data-act="toggleActive" data-a="${p.id}" ${L.isInj(p) ? 'disabled title="부상자 명단"' : ''}>${p.active ? '2군으로 내림' : L.isInj(p) ? '부상자 명단' : '1군 등록'}</button><button class="warn" data-act="releaseAsk" data-a="${p.id}">${ui.confirm === p.id ? '정말 방출(되돌릴 수 없음)' : '방출'}</button></div>` : '';
    return `<div class="modal-bg" data-act="closeModal"><div class="modal" data-stop="1"><div class="row"><h2>${esc(p.name === p.ko ? p.ko : p.name)}</h2><span class="chip">${pos(p)}</span><span class="chip">${p.age}세</span>${pot}${dhChip}${draftChip}${birthChip}${holdChip} ${loyChip}${fChip}${faStatus(p)}${src}${milChip}<span class="sp"></span><button class="sm" data-act="closeModal">닫기</button></div>
      <div class="row"><div>종합 ${ovrChip(L.ovr(p))}</div><div class="small muted">${teamTag(p.team in KO ? p.team : U())} · 연봉 ${money(p.contract.salary)}${p.contract.amort ? ' + 계약금 상각 ' + p.contract.amort + '억/년' : ''} · 계약 ${p.contract.years}년 남음${p.contract.total ? ` · FA 계약 총 ${p.contract.total}억${p.contract.bonus ? '(계약금 ' + p.contract.bonus + '억)' : ''}${p.contract.end ? ' ~' + p.contract.end : ''}${p.contract.opt ? ' · 옵션 ' + esc(p.contract.opt) : ''}${p.contract.est ? ' · 기간 추정' : ''}` : ''} · 시장 가치 ${money(L.marketValue(p))}</div></div>
      ${p.eval ? `<div class="card" style="margin:8px 0"><b>평가(사용자 제공)</b><div class="small">${esc(p.eval.text)}</div><div class="small muted">${esc(p.eval.src)} — 잠재력 하한 ${esc(p.eval.floor)}등급 이상으로 반영${p.eval.role === 'SP' ? ', 선발 후보 보직' : ''}</div></div>` : ''}${injBlock(p)}<div class="pbars">${bars}</div>${fits}${devBlock(p)}<div class="small">올 시즌 1군 기록: ${statLine(p)}</div>${(L.S.stats2.bat[p.id] || L.S.stats2.pit[p.id]) ? `<div class="small">올 시즌 2군 기록: ${p.type === 'B' ? batLine(p.id, true) : pitLine(p.id, true)}</div>` : ''}${p.lockUntil > L.S.day && p.team === U() && !p.active ? `<div class="small muted">1군 재등록 잠금: ${L.lockLeft(p)}경기일 남음</div>` : ''}${acts}</div></div>`;
  }

  /* ---------------- 라인업 ---------------- */
  const lineupP = i => { const set = L.team(U()).set; return set.lineup[i]; };
  function screenLineup() {
    const set = L.team(U()).set, H = L.hitters(U(), true), inL = new Set(set.lineup.map(x => x.id)), bench = H.filter(h => !inL.has(h.id));
    const opts = id => H.map(q => `<option value="${q.id}" ${q.id === id ? 'selected' : ''}>${esc(q.ko)} · ${posName[q.pos]} · ${L.ovr(q)}</option>`).join('');
    const rows = set.lineup.map((x, i) => { const p = P(x.id); return `<tr><td class="n">${i + 1}</td><td class="l"><select data-sel="lpl" data-i="${i}">${opts(x.id)}</select></td><td class="l"><select data-sel="lpos" data-i="${i}">${POSS.map(q => `<option value="${q}" ${q === x.pos ? 'selected' : ''}>${posName[q]}</option>`).join('')}</select></td><td>${fitBadge(p, x.pos)}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${batLine(p.id)}</td><td><button class="sm" data-act="lmove" data-a="${i}" data-b="-1">▲</button><button class="sm" data-act="lmove" data-a="${i}" data-b="1">▼</button></td></tr>`; }).join('');
    const nBad = set.lineup.filter(x => L.fitLevel(P(x.id), x.pos) === 0).length;
    const fixes = set.lineup.map((x, i) => ({ x, i, cur: P(x.id) })).filter(o => L.fitLevel(o.cur, o.x.pos) === 0).map(o => { let best = null, bd = 0; for (const c of bench) { const d = L.posScore(c, o.x.pos) - L.posScore(o.cur, o.x.pos); if (d > bd) { bd = d; best = c; } } return best ? { i: o.i, cur: o.cur, pos: o.x.pos, c: best, d: bd } : null; }).filter(Boolean);
    const fixHtml = fixes.length ? `<div class="advice" style="margin-bottom:8px">${fixes.map(f => `<div class="adv"><span>${posName[f.pos]}: <b>${esc(f.cur.ko)}</b>은 이 포지션이 부적합합니다. 후보 <b>${esc(f.c.ko)}</b>(${f.c.pos === f.pos ? '주포지션' : (f.c.gs[f.pos] ? posName[f.pos] + ' ' + f.c.gs[f.pos] + '경기' : '경험 없음')}, 종합 ${L.ovr(f.c)})로 바꾸면 나아집니다.</span><button class="sm" data-act="lfix" data-a="${f.i}" data-b="${f.c.id}">교체 적용</button></div>`).join('')}</div>` : '';
    const tot = set.lineup.reduce((a, x) => a + L._runsB(P(x.id), true) + L.defRuns(P(x.id), x.pos) - (L.fit(P(x.id), x.pos) === 'ok' ? 0 : 1) * 0, 0);
    const br = bench.map(p => `<tr class="click" data-act="player" data-a="${p.id}"><td class="l">${esc(p.ko)}${L.handLabel(p) ? ` <span class="chip">${L.handLabel(p)}</span>` : ''}</td><td class="l">${posName[p.pos]}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${batLine(p.id)}</td></tr>`).join('');
    return `<div class="card"><div class="row"><h2>선발 라인업</h2><span class="sp"></span><button data-act="autoLineup">자동 설정</button></div>
      ${fixHtml}${nBad ? `<p class="chip bad" style="display:block;padding:6px 10px;margin:0 0 8px">익숙하지 않은 포지션에 선 선수가 ${nBad}명 있습니다. 해당 포지션의 수비 범위가 크게 줄고 실책이 늘어 안타를 더 맞습니다. [자동 설정]으로 최적 배치를 받을 수 있습니다.</p>` : ''}
      <p class="small muted" style="margin:0 0 8px">타순과 수비 위치를 정합니다. 선수가 익숙하지 않은 포지션에 서면 수비가 크게 나빠집니다(부적합). 경기 당일 컨디션 난조로 결장하는 선수는 후보 중 같은 포지션에 가장 적합한 선수가 대신합니다.</p>
      <div class="tablewrap"><table><thead><tr><th>타순</th><th class="l">선수</th><th class="l">수비</th><th></th><th>OVR</th><th class="l">올 시즌</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card"><h2>후보 (1군 야수)</h2>${br ? `<div class="tablewrap"><table><tbody>${br}</tbody></table></div>` : '<p class="muted">후보 야수가 없습니다. 로스터에서 1군에 등록하세요.</p>'}</div>`;
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
  function screenPitching() {
    const set = L.team(U()).set, A = L.pitchers(U(), true), slots = pitchSlots(), S = L.S;
    const opts = id => A.map(q => `<option value="${q.id}" ${q.id === id ? 'selected' : ''}>${esc(q.ko)} · ${q.role === 'SP' ? '선발' : '구원'} · ${L.ovr(q)}</option>`).join('');
    const nextI = set.rotIdx % set.rotation.length;
    const rows = slots.map(s => { const p = P(s.id); if (!p) return ''; const fat = Math.min(100, p.fat || 0), rest = s.k === 'rot' ? Math.max(0, 4 - (S.day - p.lastStart)) : 0;
      const st = s.k === 'rot' ? (s.i === nextI ? '<span class="chip in">다음 선발</span>' : (rest > 0 ? `<span class="chip bad">휴식 ${rest}일</span>` : '')) : (fat >= 35 ? '<span class="chip bad">휴식 필요</span>' : fat >= 25 ? '<span class="chip">피곤</span>' : '<span class="chip in">대기</span>');
      return `<tr><td class="l small muted">${s.l}</td><td class="l"><select data-sel="pslot" data-k="${s.k}" data-i="${s.i}">${opts(s.id)}</select></td><td>${ovrChip(L.ovr(p))}</td><td>${st}</td><td><div class="bar ${fat >= 35 ? 'dead' : fat >= 25 ? 'tired' : ''}" title="피로 ${Math.round(fat)}"><i style="width:${s.k === 'rot' ? 0 : fat}%"></i></div></td><td class="l small">${pitLine(p.id)}</td></tr>`; }).join('');
    return `<div class="card"><div class="row"><h2>투수진 운용</h2><span class="sp"></span><button data-act="autoPitch">자동 설정</button></div>
      <p class="small muted" style="margin:0 0 8px">선발은 로테이션 순서대로 등판하고 4일 이상 쉬어야 합니다. 불펜은 상황에 따라 마무리(세이브 상황)·셋업(7~8회 박빙)·롱릴리프(큰 점수 차)·중간 순으로 투입되며, 연투로 피로가 쌓이면 쉬어야 합니다. 경기 중에는 직접 교체할 수 있습니다.</p>
      <div class="tablewrap"><table><thead><tr><th class="l">역할</th><th class="l">선수</th><th>OVR</th><th>상태</th><th>피로</th><th class="l">올 시즌</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  /* ---------------- 일정·결과 ---------------- */
  function screenSchedule() {
    const S = L.S, mine = S.results.filter(r => r.home === U() || r.away === U()).slice().reverse();
    const rows = mine.slice(0, 40).map(r => { const home = r.home === U(), opp = home ? r.away : r.home, my = home ? r.rh : r.ra, th = home ? r.ra : r.rh, w = my > th, t = my === th;
      return `<tr><td class="l">${L.dateStr(r.day)}</td><td class="l">${home ? '홈' : '원정'} ${teamTag(opp)}</td><td class="n"><b class="${t ? '' : w ? 'pos' : 'neg'}">${t ? '무' : w ? '승' : '패'}</b> ${my}:${th}</td><td class="l small muted">${r.user ? '직접 지휘/설정 반영' : ''}</td></tr>`; }).join('');
    const up = nextGames(10).map(g => `<tr><td class="l">${L.dateStr(g.day)}</td><td class="l">${g.home === U() ? '홈' : '원정'} ${teamTag(g.home === U() ? g.away : g.home)}</td><td class="l small muted">${PARK[g.home]}</td></tr>`).join('');
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
      const cands = L.players(U()).filter(p => !p.active && p.type === type && L.lockLeft(p) === 0).map(p => { const f = formOf(p); return { p, f, sc: L.ovr(p) + (f ? f.score : 0) }; }).sort((a, b) => b.sc - a.sc);
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
  function screenFarm() {
    const S = L.S, me = U(), all = L.players(me), farm = all.filter(p => !p.active).sort((a, b) => L.ovr(b) - L.ovr(a)), act = all.filter(p => p.active);
    const full = act.length >= ACTIVE_MAX, st2 = L.standings2(), my2 = st2.find(x => x.team === me), recs = farmRecs();
    const line = p => p.type === 'B' ? batLine(p.id, true) : pitLine(p.id, true);
    const frow = p => { const lk = L.lockLeft(p), f = formOf(p); return `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b>${injChip(p)}${p.age <= 28 && L.S.coach ? ` <span class="chip" title="육성 방향">${L.planName(L.devPlan(p))}</span>` : ''}${p.age <= 25 ? ` <span class="chip" title="예상 정점 기준: A 슈퍼스타급(68+) · B 확실한 주전급(57+) · C 준주전급(48+) · D 후보급(38+) · E 육성급. 스카우트 추정이며 시즌을 거치며 정확해집니다.">잠재력 ${L.potLetter(p)}</span>` : ''}</td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${line(p)}</td><td class="l small">${f ? f.txt : '<span class="muted">-</span>'}</td><td data-stop="1">${L.isInj(p) ? `<span class="chip warn">부상자 명단</span>` : lk ? `<span class="chip">잠금 ${lk}일</span>` : `<button class="sm" data-act="toggleActive" data-a="${p.id}" ${full ? 'disabled' : ''}>1군 등록</button>`}</td></tr>`; };
    const arow = p => `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${statLine(p)}</td><td data-stop="1"><button class="sm" data-act="toggleActive" data-a="${p.id}">2군으로</button></td></tr>`;
    const rec = recs.length ? recs.map(r => `<div class="row small"><span>↑ <b>${esc(r.up.p.ko)}</b> (OVR ${L.ovr(r.up.p)}${r.up.f ? ' · 최근 ' + r.up.f.txt : ''}) ↔ ↓ <b>${esc(r.down.ko)}</b> (OVR ${L.ovr(r.down)})</span><span class="sp"></span><button class="sm" data-act="swapFarm" data-a="${r.up.p.id}|${r.down.id}">교체</button></div>`).join('') : '<div class="small muted">지금 1군 후보보다 확실히 나은 2군 선수가 없습니다.</div>';
    const th = '<thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">2군 기록</th><th class="l">최근 10경기</th><th></th></tr></thead>';
    return `<div class="card"><div class="row"><h2>2군 (퓨처스)</h2><span class="muted small">1군 ${act.length}/${ACTIVE_MAX} · 2군 ${farm.length}명 · 2군 성적 ${my2.w}승 ${my2.l}패 ${my2.d}무 (${my2.rank}위)</span></div>
      <div class="small muted">1군 말소 후 10경기일(약 열흘) 동안은 재등록할 수 없습니다. 2군에서 꾸준히 뛴 어린 선수는 성장이 빠르고, 출전하지 못하면 성장이 더딥니다. 추천은 능력치와 최근 10경기 성적을 함께 본 참고용입니다.</div></div>
      <div class="card"><h2>콜업 추천</h2>${rec}</div>
      <div class="card"><h2>2군 선수</h2><div class="tablewrap"><table>${th}<tbody>${farm.map(frow).join('') || '<tr><td class="muted">2군 선수가 없습니다.</td></tr>'}</tbody></table></div></div>
      <div class="card"><h2>1군 엔트리</h2><div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">1군 기록</th><th></th></tr></thead><tbody>${act.sort((a, b) => (a.type > b.type ? 1 : a.type < b.type ? -1 : L.ovr(b) - L.ovr(a))).map(arow).join('')}</tbody></table></div></div>
      ${milCard()}
      <div class="card"><h2>${S.year} 2군 순위</h2><div class="tablewrap"><table><thead><tr><th class="l">순위</th><th class="l">팀</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>득점</th><th>실점</th></tr></thead><tbody>${st2.map(x => `<tr class="${x.team === me ? 'me' : ''}"><td class="l n">${x.rank}</td><td class="l">${teamTag(x.team)}</td><td class="n">${x.w}</td><td class="n">${x.l}</td><td class="n">${x.d}</td><td class="n">${pct3(x.pct)}</td><td class="n">${x.rs}</td><td class="n">${x.ra}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* 경쟁균형세 표시: 상위 40명 합계(신인·외국인 제외) / 상한 */
  function salCell(p) { const c = p.contract; return c.amort ? `${money(c.salary)}<div class="muted small">+ 계약금 ${c.amort}억/년 (총 ${c.bonus}억)</div>` : money(c.salary); }
  function cbtText(t) { const v = L.cbtPreview(t), fl = v.fl !== null ? ` · 하한 ${v.fl.toFixed(1)}` : ''; return `연봉(상위 40) ${v.pay} / 상한 ${v.cap.toFixed(1)}억${fl}${v.kind === 'over' ? ` ⚠ 초과 시 기금 ${v.fee.toFixed(1)}억` : v.kind === 'under' ? ` ⚠ 하한 미달 시 기금 ${v.fee.toFixed(1)}억` : ''}`; }
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
  function screenFinance() {
    const S = L.S; if (!L.finReady()) return `<div class="card"><h2>재정</h2><div class="small muted">이 저장 데이터에는 재정 정보가 없습니다(예전 버전 저장). 새 게임을 시작하면 구단 재정이 반영됩니다.</div></div>`;
    const f1 = x => (Math.round(x * 10) / 10).toFixed(1), sg = x => (x >= 0 ? '+' : '') + f1(x);
    const rows = TEAMS.map(t => ({ t, f: S.fin.teams[t], v: L.finPreview(t) })).sort((a, b) => b.v.op - a.v.op);
    const me = S.fin.teams[U()], mv = L.finPreview(U()), hist = S.fin.hist.map(h => ({ year: h.year, r: h.teams[U()], ps: h.ps })).reverse();
    const nextCap = me.capchg.filter(c => c[0] >= S.year);
    return `<div class="kpis"><div class="kpi"><div class="l">예상 영업이익(정규시즌)</div><div class="v ${mv.op >= 0 ? 'pos' : 'neg'}">${sg(mv.op)}억</div></div><div class="kpi"><div class="l">선수단 보수</div><div class="v">${f1(mv.pay)}억</div></div><div class="kpi"><div class="l">FA 여유자금</div><div class="v ${mv.room >= 0 ? '' : 'neg'}">${f1(mv.room)}억</div></div><div class="kpi"><div class="l">이사회 신뢰도</div><div class="v ${mv.trust < 30 ? 'neg' : ''}">${mv.trust}</div></div></div>
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
      ${hist.length ? `<div class="tablewrap"><table><thead><tr><th class="l">시즌</th><th>매출</th><th>PS 배당</th><th>모기업 보너스</th><th>선수단 보수</th><th>포상금</th><th>운영비</th><th>기금</th><th>영업이익</th><th>평균 관중</th><th>신뢰도</th></tr></thead><tbody>${hist.map(h => `<tr><td class="l">${h.year}</td><td class="n">${f1(h.r.rev)}</td><td class="n">${h.r.ps ? f1(h.r.ps) : '-'}</td><td class="n">${h.r.bonus ? f1(h.r.bonus) : '-'}</td><td class="n">${f1(h.r.pay)}</td><td class="n">${h.r.prize ? f1(h.r.prize) : '-'}</td><td class="n">${f1(h.r.opex)}</td><td class="n">${h.r.cbt ? f1(h.r.cbt) : '-'}</td><td class="n ${h.r.op >= 0 ? 'pos' : 'neg'}">${sg(h.r.op)}</td><td class="n">${h.r.att.toLocaleString()}</td><td class="n">${h.r.trust} (${h.r.dTrust >= 0 ? '+' : ''}${h.r.dTrust})</td></tr>`).join('')}</tbody></table></div>` : '<div class="small muted">아직 결산 기록이 없습니다.</div>'}</div>`;
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
    return `${chips}<div class="card"><div class="row"><h2 style="margin:0">${teamTag(t)}</h2><span class="muted small">${PARK[t]} 구장${mgr ? ' · 감독 ' + esc(mgr.name) : ''}${t === U() ? ' · <b>내 팀</b>' : ''}</span></div>
      <div class="kpis" style="margin-top:10px"><div class="kpi"><div class="l">순위</div><div class="v">${S.phase === 'offseason' || x.w + x.l + x.d === 0 ? '-' : x.rank + '위'}</div></div><div class="kpi"><div class="l">성적</div><div class="v">${x.w}-${x.l}${x.d ? '-' + x.d : ''}</div><div class="small muted">승률 ${pct3(x.pct)} · 게임차 ${gb}</div></div><div class="kpi"><div class="l">득점 / 실점</div><div class="v">${x.rs} / ${x.ra}</div><div class="small muted">득실 ${sgn(x.rs - x.ra)}</div></div><div class="kpi"><div class="l">최근 10경기</div><div class="v">${l10.length ? rec10 : '-'}</div><div class="small muted">연속 ${streak}</div></div><div class="kpi"><div class="l">연봉(상위 40)</div><div class="v">${cv.pay}</div><div class="small muted">상한 ${cv.cap.toFixed(1)}억${cv.kind === 'over' ? ' · 초과' : cv.kind === 'under' ? ' · 하한 미달' : ''}</div></div><div class="kpi"><div class="l">보유</div><div class="v">${pl.length}명</div><div class="small muted">1군 ${act.length} · 외국인 ${fr.filter(p => !p.aq).length}+AQ ${fr.filter(p => p.aq).length}</div></div></div></div>
      ${rc.length ? `<div class="card"><h2>최근 경기</h2><div class="tablewrap"><table><tbody>${last.map((g, i) => `<tr><td class="l">${L.dateStr(g.day)}</td><td class="l">${rc[i].home ? '홈' : '원정'} ${teamTag(rc[i].opp)}</td><td class="n"><b class="${rc[i].r === '승' ? 'pos' : rc[i].r === '패' ? 'neg' : ''}">${rc[i].r}</b> ${rc[i].my}:${rc[i].op}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="grid">${tbl('주요 선수 (OVR 상위)', star)}${tbl('타순', lu, t === U() ? '현재 라인업 기준' : '현재 1군 타자로 구성한 예상 라인업')}${tbl('선발 로테이션', rot)}${tbl('불펜 (마무리·승리조·중간)', pen)}</div>
      ${inj.length ? `<div class="card"><h2>부상자</h2><div class="tablewrap"><table><tbody>${inj.map(p => `<tr class="click" data-act="player" data-a="${p.id}"><td class="l"><b>${esc(p.ko)}</b> <span class="muted small">${pos(p)}</span></td><td class="l small">${esc(p.inj.dx)}</td><td class="n small">~${L.injDateStr(p)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
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
  function injChip(p) { if (!L.isInj(p)) return ''; const n = L.injLeft(p); return ` <span class="chip warn" title="${esc(p.inj.dx)} · ${esc(p.inj.basis || '')} · 복귀 예정 ${L.injDateStr(p)}">부상 ~${L.injDateStr(p).slice(2)} (${n}일)</span>`; }
  function bidCell(bi) {
    if (!bi) return '<span class="muted">-</span>';
    const pe = bi.pend ? `<div class="pos"><b>내 제시 보류 중</b> (연 ${f1((bi.pend.bonus + bi.pend.salary * bi.pend.years) / bi.pend.years)}억 × ${bi.pend.years}년 · ${bi.pendLeft}일 남음)</div>` : '';
    if (!bi.n) return `<span class="muted">입찰 없음</span>${pe}`;
    return `<b>${bi.n}개 구단 경쟁</b>${bi.bids.slice(0, 3).map(b => `<div>${KO[b.team]} 연 ${b.per.toFixed(2)}억 × ${b.y}년</div>`).join('')}${pe}`;
  }
  function faCalendar() {
    const S = L.S, m = S.faMkt; if (!m) return '';
    if (m.closed) return `<div class="card"><b>FA 협상 마감</b> <span class="muted small">— 개막 전 FA 계약이 모두 정리되었습니다. 남은 선수는 시장에서 계속 영입할 수 있습니다.</span></div>`;
    const left = L.faDaysLeft(), log = (S.faLog || []).filter(x => x.year === S.year).slice(0, 5).map(x => `<li><span class="d">${L.faDateStr(x.day)}</span><span>${esc(x.text)}</span></li>`).join('');
    return `<div class="card"><div class="row"><h2>FA 협상 기간</h2><b>${L.faDateStr(m.day)}</b><span class="muted small">(1월 1일 개시 · 개막 전 ${left}일 남음 · ${L.faDateStr(75)}까지)</span><span class="sp"></span>
      <button data-act="faDay" data-a="1" ${left <= 0 ? 'disabled' : ''}>+1일</button><button data-act="faDay" data-a="3" ${left <= 0 ? 'disabled' : ''}>+3일</button><button data-act="faDay" data-a="7" ${left <= 0 ? 'disabled' : ''}>+7일</button><button class="primary" data-act="faClose">FA 마감${S.phase === 'offseason' ? '' : ' · 개막'}</button></div>
      <div class="small muted" style="margin-top:6px">AI 구단은 관심 선수에게 입찰하고 매일 상한까지 금액을 올립니다. 선수는 <b>연 보수(계약금 비중 선호) · 선호 기간 · 원소속 구단(+2%)</b>을 종합해 점수가 가장 높은 제시를 수락합니다. 내 제시가 경쟁 입찰보다 낮으면 5일간 보류되어 매일 재평가되므로, 금액을 올려 다시 제시하거나 '경쟁 이기는 제시'를 사용하세요. FA 마감 시 입찰 중인 계약이 확정되고 AI가 로스터를 정리합니다.</div>${log ? `<ul class="news" style="margin-top:6px">${log}</ul>` : ''}</div>`;
  }
  /* 외국인·아시아쿼터 시장: FA 제도(등급·보상·계약금·다년)가 없고 1년 계약, 신규 상한·재계약 인상 한도, 보유 슬롯 규정이 적용된다 */
  function screenFAForeign(aq, all) {
    const t = U(), mine = L.foreignOf(t), gen = mine.filter(x => !x.aq), aqs = mine.filter(x => x.aq), room = L.faRoom(t);
    const list = all.filter(p => p.foreign && !!p.aq === aq).sort((a, b) => ui.faSort === 'ovr' ? L.ovr(b) - L.ovr(a) : ui.faSort === 'age' ? a.age - b.age : L.war(b) - L.war(a));
    const slot = aq ? `아시아쿼터 ${aqs.length}/1` : `일반 외국인 ${gen.length}/3 (투수 ${gen.filter(x => x.type === 'P').length} · 타자 ${gen.filter(x => x.type === 'B').length})`;
    const rule = aq ? '아시아쿼터는 구단당 1명, 신규 연봉 상한 2.8억(20만 달러), 재계약 시 직전 연봉 +1.4억까지, 1년 계약입니다.' : '일반 외국인은 구단당 3명(같은 포지션 3명 불가), 신규 연봉 상한 14억(100만 달러 수준), 원소속 재계약은 직전 연봉 +7억까지, 1년 계약입니다.';
    const rows = list.map(p => { const ask = Math.min(L.askSalary(p), L.foreignCap(p, t)), ok = L.foreignOK(t, p), from = p.faInfo && p.faInfo.from;
      return `<tr><td class="l"><b>${esc(p.ko)}</b>${from === t ? ' <span class="chip in">원소속</span>' : ''}</td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l small">${from ? KO[from] || '' : '-'}${p.faInfo && p.faInfo.prev ? ` · 직전 ${f1(p.faInfo.prev)}억` : ''}</td><td class="l">${subHtml(p)}</td><td class="n">${money(ask)}<div class="small muted">상한 ${money(L.foreignCap(p, t))}</div></td><td><button class="sm primary" data-act="signFA" data-a="${p.id}" ${ok && room >= ask ? '' : 'disabled'} title="${ok ? (room >= ask ? '' : '예산 부족') : '슬롯·포지션 규정상 영입 불가'}">영입</button></td></tr>`; }).join('');
    return `<div class="card"><div class="row"><h2>${aq ? '아시아쿼터' : '외국인'} 시장</h2><span class="muted small">${slot} · FA 여유자금 ${room.toFixed(1)}억 · 현재 보유: ${mine.map(x => esc(x.ko) + (x.aq ? '(AQ)' : '')).join(', ') || '없음'}</span><span class="sp"></span><select data-sel="fasort"><option value="war" ${ui.faSort === 'war' ? 'selected' : ''}>가치순</option><option value="ovr" ${ui.faSort === 'ovr' ? 'selected' : ''}>능력치순</option><option value="age" ${ui.faSort === 'age' ? 'selected' : ''}>나이순</option></select></div>
      <div class="small muted" style="margin:6px 0">${rule} FA 등급·보상·계약금·경쟁 입찰이 없으며, 개막 전 FA 마감 시 AI 구단이 빈 슬롯을 보충합니다.</div>
      ${list.length ? `<div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">직전 구단</th><th class="l">세부 능력</th><th>요구 연봉</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">시장에 나온 선수가 없습니다.</p>'}</div>`;
  }
  function screenFA() {
    const S = L.S, mk = !!(S.faMkt && !S.faMkt.closed), tab = ui.faTab || 'dom';
    const all = L.faList(), cnt = { dom: all.filter(p => !p.foreign).length, for: all.filter(p => p.foreign && !p.aq).length, aq: all.filter(p => p.foreign && p.aq).length };
    const tabBar = `<div class="tabs" role="tablist">${[['dom', '국내 FA'], ['for', '외국인'], ['aq', '아시아쿼터']].map(t => `<button role="tab" aria-selected="${tab === t[0]}" data-act="fatab" data-a="${t[0]}">${t[1]} (${cnt[t[0]]})</button>`).join('')}</div>`;
    if (tab !== 'dom') return faCalendar() + tabBar + screenFAForeign(tab === 'aq', all);
    const list = all.filter(p => !p.foreign).sort((a, b) => ui.faSort === 'ovr' ? L.ovr(b) - L.ovr(a) : ui.faSort === 'age' ? a.age - b.age : L.war(b) - L.war(a)).slice(0, 80);
    const rows = list.map(p => {
      const tm = L.faTerms(p, U()), fr = p.foreign, o = fr ? null : Object.assign(L.faDefaultOffer(p, U()), (ui.faIn || {})[p.id] || {}), per = o ? (o.bonus + o.salary * o.years) / o.years : 0, bi = fr || !tm.graded ? null : L.faBidInfo(p.id);
      const req = fr ? `<td class="n">${money(Math.min(L.askSalary(p), L.foreignCap(p, U())))}</td><td class="small muted">외국인 1년</td>` : tm.graded ? `<td class="n">${f1(tm.req(tm.pref))}<div class="small muted">시장가 ${f1(tm.mv)}${tm.ext ? ' · 이적 +4%' : ''}${tm.disc > 0 ? ' · <b class="pos">충성 할인 −' + Math.round(tm.disc * 1000) / 10 + '%</b>' : ''}${tm.comp > 1 ? ' · 경쟁 +' + Math.round((tm.comp - 1) * 1000) / 10 + '%' : ''}</div></td><td class="small muted">${tm.pref}년 선호 · 총 ${f1(tm.req(tm.pref) * tm.pref)}억</td>` : `<td class="n">${f1(tm.req(1))}</td><td class="small muted">1년 계약만 가능(FA 자격 없음)</td>`;
      const offer = fr ? `<button class="sm primary" data-act="signFA" data-a="${p.id}">영입</button>` : `<select data-sel="fayears" data-a="${p.id}" ${tm.graded ? '' : 'disabled'}>${Array.from({ length: tm.maxYears }, (_, i) => i + 1).map(y => `<option value="${y}" ${y === o.years ? 'selected' : ''}>${y}년</option>`).join('')}</select> 연봉 <input class="num" type="number" step="0.1" min="0.3" style="width:64px" data-sel="fasal" data-a="${p.id}" value="${o.salary}"> ${tm.graded ? `계약금 <input class="num" type="number" step="0.1" min="0" style="width:64px" data-sel="fabonus" data-a="${p.id}" value="${o.bonus}">` : ''} <button class="sm primary" data-act="signFA" data-a="${p.id}">제시</button>`;
      return `<tr><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l">${faChip(p)}${p.faInfo && p.faInfo.from ? ` <span class="muted small">${KO[p.faInfo.from] || ''}</span>` : ''}</td><td class="l">${subHtml(p)}</td>${req}${mk ? `<td class="l small">${bidCell(bi)}</td>` : ''}<td>${offer}${bi && bi.best ? ` <button class="sm" data-act="faBeat" data-a="${p.id}" title="경쟁 입찰을 넘는 최소 제시를 입력칸에 채웁니다">경쟁 이기는 제시</button>` : ''}</td></tr>`;
    }).join('');
    return `${faCalendar()}${tabBar}<div class="card"><div class="row"><h2>국내 FA 시장</h2><span class="muted small">${cbtText(U())} · FA 여유자금 ${L.faRoom(U()).toFixed(1)}억 · 보유 ${S.teams[U()].ids.length}명 · 외부 FA ${L._faCount(U())}/3 · 외국인 일반 ${L.foreignOf(U()).filter(x => !x.aq).length}/3 + AQ ${L.foreignOf(U()).filter(x => x.aq).length}/1</span><span class="sp"></span><select data-sel="fasort"><option value="war" ${ui.faSort === 'war' ? 'selected' : ''}>가치순</option><option value="ovr" ${ui.faSort === 'ovr' ? 'selected' : ''}>능력치순</option><option value="age" ${ui.faSort === 'age' ? 'selected' : ''}>나이순</option></select></div>
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
      const ex = off.rep.expiring.map(id => { const p = P(id), ask = L.resignAsk(p); return `<tr><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${pos(p)}</td><td class="n">${p.age}</td><td>${ovrChip(L.ovr(p))}</td><td class="l">${faStatus(p) || '<span class="muted small">외국인(1년 계약)</span>'}</td><td class="n">${money(ask)}${L.loyDiscount(p, p.team) > 0 ? `<div class="small pos">충성 할인 −${Math.round(L.loyDiscount(p, p.team) * 500) / 10}%</div>` : ''}</td><td><span class="muted small">1년</span> <button class="sm primary" data-act="resign" data-a="${id}">재계약</button></td></tr>`; }).join('');
      return `${bar}<div class="card"><h2>${S.year} 시즌 결산</h2><p style="margin:0">${S.year}년 최종 ${h.userRank}위 (${h.userRec.w}승 ${h.userRec.l}패 ${h.userRec.d}무) · 우승 ${h.champion ? teamTag(h.champion) : '-'}</p>${off.rep.retired.length ? `<p class="small muted">은퇴: ${off.rep.retired.map(id => esc(P(id).ko)).join(', ')}</p>` : ''}</div>
        <div class="grid"><div class="card"><h2>선수 성장·노화 (내 팀)</h2><div class="tablewrap" style="max-height:360px;overflow-y:auto"><table><thead><tr><th class="l">선수</th><th>나이</th><th>OVR</th><th>변화</th></tr></thead><tbody>${pr}</tbody></table></div></div>
        <div class="card"><h2>계약 만료 선수</h2>${off.rep.auto ? `<p class="small muted" style="margin:0 0 6px">연봉 2억 미만·35세 미만의 FA 자격 없는 선수 ${off.rep.auto}명은 시장 요구액으로 자동 재계약되었습니다.</p>` : ''}${ex ? '<div class="row" style="margin-bottom:6px"><button class="sm" data-act="resignAll">외국인 제외 전원 재계약(1년)</button></div>' : ''}${ex ? `<div class="tablewrap"><table><thead><tr><th class="l">선수</th><th class="l">포지션</th><th>나이</th><th>OVR</th><th class="l">FA</th><th>1년 연봉</th><th></th></tr></thead><tbody>${ex}</tbody></table></div>` : '<p class="muted">계약이 만료된 선수가 없습니다.</p>'}<p class="small muted">재계약은 모두 1년(연봉 계약)입니다. 여러 해 계약은 FA 시장에서 계약금을 포함해 협상합니다. FA 자격이 있는 선수를 재계약하지 않으면 FA 시장으로 나가며(등급에 따라 보상 발생), 자격이 없는 선수는 방출되어 자유계약이 됩니다.</p></div></div>
        <div class="row"><button class="primary big" data-act="toDraft">계약 확정 · 드래프트로</button></div>`;
    }
    if (cur === 'draft') {
      const d = off.draft, onClock = L.draftOnClock(), mine = onClock === U(), pool = d.pool.map(id => P(id)).sort((a, b) => L.scoutScore(b) - L.scoutScore(a));
      const pr = pool.slice(0, 60).map(p => `<tr><td class="l"><b>${esc(p.ko)}</b></td><td class="l">${p.type === 'B' ? posName[p.pos] : (p.role === 'SP' ? '선발형' : '구원형')}</td><td class="n">${p.age}</td><td>${ovrChip(Math.max(20, Math.min(80, p.scout.o)))}</td><td class="l"><span class="chip ${p.scout.ceil >= 57 ? 'in' : ''}" title="스카우트 추정 — 실제 정점은 ±15 정도 달라질 수 있습니다">${L.tierLabel(p.scout.ceil)}</span></td><td>${mine ? `<button class="sm primary" data-act="draftPick" data-a="${p.id}">지명</button>` : ''}</td></tr>`).join('');
      const picks = d.picks.slice(-14).reverse().map(x => `<tr><td class="l n">${x.pick}</td><td class="l">${teamTag(x.team)}</td><td class="l">${esc(P(x.id).ko)}</td></tr>`).join('');
      const myp = d.picks.filter(x => x.team === U()).map(x => esc(P(x.id).ko)).join(', ');
      return `${bar}<div class="card"><div class="row"><h2>신인 드래프트</h2><span class="muted small">${d.pick}/${d.order.length}번째 지명 · ${onClock ? (mine ? '<b class="pos">내 차례</b>' : KO[onClock] + ' 차례') : '종료'}</span><span class="sp"></span>${onClock && !mine ? '<button data-act="draftSim">내 차례까지 진행</button>' : ''}${onClock ? '<button data-act="draftAuto">나머지 자동 지명</button>' : '<button class="primary" data-act="toFA">FA 시장으로</button>'}</div>
        <p class="small muted" style="margin:6px 0">스카우트 평가(능력치·성장 상한 등급)는 오차가 있어 지명 순번이 높아도 크게 못 클 수 있고, 하위 지명에서 대성하기도 합니다. 지명 순서는 정규시즌 성적 역순이고 10라운드까지 진행합니다. 신인은 2군으로 들어옵니다. 내 지명: ${myp || '없음'}</p></div>
        <div class="grid"><div class="card"><h2>지명 가능 선수</h2><div class="tablewrap" style="max-height:520px;overflow-y:auto"><table><thead><tr><th class="l">선수</th><th class="l">유형</th><th>나이</th><th>OVR(추정)</th><th>잠재력</th><th></th></tr></thead><tbody>${pr}</tbody></table></div></div>
        <div class="card"><h2>최근 지명</h2><div class="tablewrap"><table><tbody>${picks || '<tr><td class="muted">아직 없습니다.</td></tr>'}</tbody></table></div></div></div>`;
    }
    return `${bar}${screenFA()}<div class="row"><button class="primary big" data-act="toSeason">FA 종료 · 새 시즌 시작</button></div>`;
  }

  /* ---------------- 저장·설정 ---------------- */
  function screenSave() {
    const hk = L.handsKnown();
    return `<div class="card"><h2>투타(좌우) 정보</h2><p class="small muted" style="margin:0 0 8px">대타 좌우 매치업은 투타 정보가 있는 선수에게만 적용됩니다. 현재 타자 ${hk.b}/${hk.bt}명, 투수 ${hk.p}/${hk.pt}명이 입력되어 있고, 나머지는 좌우 상성 없이 중립으로 처리합니다.<br>KBO 홈페이지의 선수 등록 현황 표를 그대로 붙여넣거나, 한 줄에 「이름,우투좌타」 형식으로 입력하세요. 같은 이름의 선수가 여러 명이면 같은 줄에 팀 이름(예: 삼성)을 함께 적어야 합니다.</p>
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
    ui.sheet = { title, html: `<div class="kpis"><div class="kpi"><div class="l">이 기간 성적</div><div class="v">${W}승 ${Ls}패${D ? ' ' + D + '무' : ''}</div></div><div class="kpi"><div class="l">순위</div><div class="v ${arrow}">${before.rank}위 → ${st.rank}위</div></div><div class="kpi"><div class="l">시즌 성적</div><div class="v">${st.w}승 ${st.l}패</div></div></div><div>${games.slice(-8).reverse().map(resRow).join('')}</div>${games.length > 8 ? '<p class="small muted" style="margin:0">최근 8경기만 표시합니다. 전체는 [일정·결과]에서 볼 수 있습니다.</p>' : ''}` };
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
  const FLAV = ['유격수 땅볼', '중견수 뜬공', '2루수 땅볼', '좌익수 플라이', '우익수 플라이', '3루수 땅볼', '내야 뜬공', '1루수 땅볼'];
  const BAT_LBL = { normal: '기본', contact: '컨택', power: '장타', patient: '신중' }, PIT_LBL = { normal: '기본', attack: '공격적 승부', careful: '신중한 승부', strikeout: '삼진 유도' };
  const BAT_HELP = { normal: '', contact: '삼진과 홈런이 줄고 타구가 살아납니다. 3루 주자가 있으면 땅볼·플라이로도 득점하기 쉽습니다.', power: '홈런과 삼진이 늘고 볼넷·타구 질은 조금 나빠집니다. 한 방이 필요할 때.', patient: '볼넷이 늘고 홈런이 줄어듭니다. 출루가 필요할 때.' };
  const PIT_HELP = { normal: '', attack: '볼넷이 줄고 삼진이 조금 늘지만 홈런·피안타가 늘어납니다. 주자를 내보내기 싫을 때.', careful: '홈런이 줄지만 볼넷이 늘어납니다. 장타자를 피할 때.', strikeout: '삼진이 늘지만 볼넷과 홈런도 조금 늘어납니다.' };
  let flavN = 0;
  function nm(b) { const p = P(b.id); return p ? p.ko : b.name; }
  function evText(e) {
    switch (e.k) {
      case 'PA': {
        const b = nm(e.b), r = e.runs ? ` (${e.runs}점)` : '';
        const t = { K: '삼진', BB: '볼넷', HBP: '몸에 맞는 공', HR: '홈런!', '1B': '안타', '2B': '2루타', '3B': '3루타', ROE: '실책 출루', IBB: '고의사구', '번트': '희생번트', '번트실패': '번트 실패', '번트(선택)': '번트, 야수선택', '번트안타': '번트 안타' }[e.e];
        if (t) return { t: `${b} ${t}${r}`, run: e.runs > 0 };
        if (e.dout >= 2) return { t: `${b} 병살타`, run: false };
        return { t: `${b} ${e.runs ? '희생타로 ' + e.runs + '점' : FLAV[(flavN++) % FLAV.length] + ' 아웃'}`, run: e.runs > 0 };
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
  function pushLive(l0) {
    const lv = ui.live, g = lv.ctx.live;
    for (const e of g.log.slice(l0)) { const o = evText(e); if (o) lv.feed.unshift({ w: lv.lbl || '', ...o }); }
  }
  function liveRun(mode) {
    const lv = ui.live, g = lv.ctx.live, start = g.inning, st = g.top;
    while (!g.finished) {
      const l0 = g.log.length; lv.lbl = `${g.inning}${g.top ? '초' : '말'}`;
      const wasInn = g.inning, wasTop = g.top; g.step(); pushLive(l0);
      if (g.finished) { lv.feed.unshift({ w: '', t: `경기 종료 ${KO[g.away]} ${g.score.away} : ${g.score.home} ${KO[g.home]}`, sys: true }); break; }
      if (g.inning !== wasInn || g.top !== wasTop) lv.feed.unshift({ w: '', t: `— ${g.inning}회${g.top ? '초' : '말'} ${g.top ? KO[g.away] : KO[g.home]} 공격 (${g.score.away}:${g.score.home}) —`, sys: true });
      if (mode === 'pa') break;
      if (mode === 'inning' && (g.inning !== start || g.top !== st)) break;
    }
    lv.sheet = null; render();
  }
  function liveTactic(kind, arg) {
    const lv = ui.live, g = lv.ctx.live, us = lv.ctx.userSide, E = lv.ctx.E; lv.lbl = `${g.inning}${g.top ? '초' : '말'}`; const l0 = g.log.length;
    if (kind === 'ibb') g.ibb(); else if (kind === 'bunt') g.bunt(); else if (kind === 'steal') g.steal(); else if (kind === 'har') g.hitAndRun(); else if (kind === 'po') g.pickoff(); else if (kind === 'mv') g.moundVisit(us);
    else if (kind === 'pc') g.changePitcher(us, E.pitById[arg]);
    else if (kind === 'ph') g.pinchHit(us, g.idx[us] % 9, E.batById[arg]);
    else if (kind === 'pr') { const [bs, id] = arg.split(':'); g.pinchRun(us, +bs, E.batById[id]); }
    else if (kind === 'ds') { const [sl, id] = arg.split(':'); g.swapField(us, +sl, E.batById[id]); }
    else if (kind === 'sw') { const [x, y] = arg.split(':'); g.swapPos(us, +x, +y); }
    pushLive(l0); lv.pick = null; lv.sheet = null; render();
  }
  const benchOf = () => { const lv = ui.live, g = lv.ctx.live, us = lv.ctx.userSide, E = lv.ctx.E; return L.hitters(U(), true).filter(p => E.batById[p.id] && !g.L[us].includes(E.batById[p.id]) && !g.subs[us].some(s => s.out === E.batById[p.id])); };
  function advice() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, opp = us === 'home' ? 'away' : 'home', myBat = g.batSide === us, myField = g.fldSide === us, out = [];
    const inn = g.inning, diff = g.score[us] - g.score[opp], b = g.bases, bt = P(g.batter.id), bo = bt ? L.ovr(bt) : 50, bench = benchOf().sort((x, y) => L.ovr(y) - L.ovr(x));
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
  function pickerHtml() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, E = ctx.E, pk = lv.pick; if (!pk) return '';
    const close = '<button class="sm" data-act="livePickClose">닫기</button>';
    const wrap = (title, body, help) => `<div class="sheet-bg" data-act="livePickClose"><div class="sheet" data-stop="1"><div class="grabber"></div><div class="row"><h2>${title}</h2><span class="sp"></span>${close}</div>${help ? `<p class="help" style="margin:0">${help}</p>` : ''}<div class="picker">${body}</div></div></div>`;
    const bench = benchOf().sort((a, b) => L.ovr(b) - L.ovr(a)), btn = (act, b, left, mid, right) => `<button data-act="${act}" data-a="${act === 'liveDo' ? pk.t : ''}" data-b="${b}"><span>${left}</span>${mid}<span class="small">${right || ''}</span></button>`;
    if (pk.t === 'pc') {
      const usedP = new Set([...g.staff[us].used]), cands = L.pitchers(U(), true).filter(p => E.pitById[p.id] && !usedP.has(E.pitById[p.id].name)).sort((a, b) => (a.fat || 0) - (b.fat || 0));
      return wrap('투수 교체', cands.map(p => `<button data-act="liveDo" data-a="pc" data-b="${p.id}"><span><b>${esc(p.ko)}</b> <span class="muted small">${p.role === 'SP' ? '선발' : '구원'}${L.team(U()).set.bullpen.closer === p.id ? ' · 마무리' : ''}</span></span>${ovrChip(L.ovr(p))}<span class="chip ${(p.fat || 0) >= 35 ? 'bad' : ''}">피로 ${Math.round(p.fat || 0)}</span></button>`).join('') || '<p class="muted">투입 가능한 투수가 없습니다.</p>', '이미 던진 투수는 다시 나올 수 없습니다. 피로가 높은 투수는 연투로 지쳐 있습니다.');
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
  function sheetsHtml() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, myBat = g.batSide === us, myField = g.fldSide === us, bs = g.bases, runners = bs[0] || bs[1] || bs[2], T = g.tact[us];
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
  function screenLive() {
    const lv = ui.live, ctx = lv.ctx, g = ctx.live, us = ctx.userSide, myBat = g.batSide === us, myField = g.fldSide === us, fin = g.finished, E = ctx.E, T = g.tact[us];
    const b = g.batter, pt = g.pitcher, bp = P(b.id), pp = P(pt.id), tr = E.tracking().pit[pt.id] || { outs: 0, R: 0, K: 0 }, f = g.pitchFatigue(g.fldSide);
    const lp = lv.feed.find(x => !x.sys) || lv.feed[0], lpHtml = lp ? `<div class="lastplay ${lp.run ? 'run' : ''}" aria-live="polite"><span class="w">${lp.w || ''}</span><span class="t">${esc(lp.t)}</span></div>` : '<div class="lastplay"><span class="t">「다음 타석」을 눌러 경기를 시작하세요</span></div>';
    const chips = `<div class="tacts small"><span class="chip ${T.bat !== 'normal' ? 'in' : ''}">공격 ${BAT_LBL[T.bat]}</span><span class="chip ${T.pit !== 'normal' ? 'in' : ''}">투구 ${PIT_LBL[T.pit]}</span>${T.inf ? '<span class="chip in">전진 수비</span>' : ''}${T.hold ? '<span class="chip in">견제 지시</span>' : ''}${g.calm[us] > 0 ? `<span class="chip in">투수 안정 (${g.calm[us]}타자)</span>` : ''}${ctx.auto ? '<span class="chip">자동 불펜</span>' : '<span class="chip bad">수동 불펜</span>'}</div>`;
    const stick = `<div class="lvstick"><div class="card score"><div class="tablewrap">${liveScore(g)}</div><div class="situ" style="margin-top:6px"><div class="outs" aria-label="${g.outs}아웃">${[0, 1, 2].map(i => `<i class="${i < g.outs && !fin ? 'on' : ''}"></i>`).join('')}</div><span class="small">${g.inning}회${g.top ? '초' : '말'} · ${fin ? '종료' : (g.top ? KO[g.away] : KO[g.home]) + ' 공격'} · ${g.outs}아웃</span><span class="sp"></span>${diamond(g)}</div></div>${lpHtml}</div>`;
    const fcls = f.over > 0 ? 'dead' : f.pct >= 0.85 ? 'warn' : '';
    const matchup = `<div class="cards2"><div class="pcard"><div class="small muted">${myBat ? '내 타자' : '상대 타자'} (${g.idx[g.batSide] % 9 + 1}번)</div><div class="nm">${esc(bp ? bp.ko : b.name)} ${bp ? ovrChip(L.ovr(bp)) : ''}</div><div class="small muted">${bp ? posName[bp.pos] : ''}${bp && L.handLabel(bp) ? ' · ' + L.handLabel(bp) : ''} · 올 시즌 ${bp ? batLine(bp.id) : ''}</div>${platChip(bp, pp)}${bp ? subHtml(bp) : ''}</div>
      <div class="pcard"><div class="small muted">${myField ? '내 투수' : '상대 투수'}</div><div class="nm">${esc(pp ? pp.ko : pt.name)} ${pp ? ovrChip(L.ovr(pp)) : ''}${pp && L.handLabel(pp) ? ` <span class="chip">${L.handLabel(pp)}</span>` : ''}</div><div class="small muted">이 경기 ${Math.floor(tr.outs / 3)}${tr.outs % 3 ? '.' + tr.outs % 3 : ''}이닝 ${tr.R}실점 ${tr.K}K · 상대 타자 ${f.bf}명</div><div class="fbar ${fcls}" title="체력"><i style="width:${Math.min(100, Math.round(f.pct * 100))}%"></i></div><div class="small ${f.over > 0 ? 'neg' : 'muted'}">${f.over > 0 ? '체력 한계 초과 · 구위 저하 중' : f.pct >= 0.85 ? '체력 한계에 가까움' : '체력 여유'}</div>${pp ? subHtml(pp) : ''}</div></div>`;
    const adv = fin ? [] : advice();
    const advHtml = adv.length ? `<div class="card"><h2>코치 조언</h2><div class="advice">${adv.map(a => `<div class="adv"><span>${a.t}</span><button class="sm" data-act="liveAdv" data-a="${a.a}">${a.l}</button></div>`).join('')}</div></div>` : '';
    const feed = lv.feed.slice(0, 60).map(x => `<li class="${x.sys ? 'sys' : x.run ? 'hl' : ''}"><span class="w">${x.w}</span><span>${esc(x.t)}</span></li>`).join('');
    const ass = g.assign[us], lineup = g.L[us].map((x, i) => { const f2 = ass.find(a => a[0] === x); return `<tr><td class="n">${i + 1}</td><td class="l">${esc(nm(x))}</td><td class="l small muted">${f2 ? posName[f2[1]] : '지명'}</td></tr>`; }).join('');
    const dock = fin ? `<div class="r"><button class="primary" style="font-size:16px" data-act="liveFinish">경기 종료 · 결과 반영 (${KO[g.away]} ${g.score.away} : ${g.score.home} ${KO[g.home]})</button></div>`
      : `<div class="r"><button class="primary" data-act="liveRun" data-a="pa">다음 타석</button><button data-act="liveRun" data-a="inning">이닝 끝까지</button><button data-act="liveRun" data-a="end">경기 끝까지</button></div><div class="r"><button data-act="liveSheet" data-a="tact">작전</button><button data-act="liveSheet" data-a="subs">교체</button><button data-act="liveAuto">${ctx.auto ? '자동 불펜 ON' : '자동 불펜 OFF'}</button></div>`;
    return `<div class="lvwrap"><div class="lvhead"><b style="font-family:var(--font-display);font-size:18px">${logo(g.away, 28)} ${KO[g.away]} @ ${logo(g.home, 28)} ${KO[g.home]}</b><span class="muted small">${PARK[g.home]} · ${ctx.post ? '포스트시즌' : L.dateStr(L.S.day)}${ctx.prep.absent && ctx.prep.absent.length ? ` · 결장 ${ctx.prep.absent.map(a => esc(a.out.ko) + '→' + esc(a.in.ko)).join(', ')}` : ''}</span><span class="sp"></span>${fin ? '' : '<button class="warn sm" data-act="liveAbort">자동으로 끝내기</button>'}</div>
      ${stick}<div class="livecols"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${fin ? '' : `<div class="card">${chips}<div style="height:8px"></div>${matchup}</div>`}${advHtml}</div>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0"><details class="card" open><summary>경기 기록</summary><ul class="feed" style="margin-top:8px">${feed || '<li class="muted">경기를 시작하세요.</li>'}</ul></details><details class="card"><summary>내 라인업</summary><div class="tablewrap"><table><tbody>${lineup}</tbody></table></div></details></div></div></div>
      <div class="livedock">${dock}</div>${pickerHtml()}${fin ? '' : sheetsHtml()}`;
  }

  /* ---------------- 렌더 ---------------- */
  function render() {
    const root = $('#root'); applyTheme();
    if (!L) { root.innerHTML = renderStart() + toastHtml(); return; }
    const scroll = window.scrollY;
    if (ui.live) { root.innerHTML = screenLive() + toastHtml(); window.scrollTo(0, scroll); return; }
    const S = ui.screen, f = { home: screenHome, roster: screenRoster, farm: screenFarm, lineup: screenLineup, pitching: screenPitching, schedule: screenSchedule, standings: screenStandings, teams: screenTeams, finance: screenFinance, coach: screenCoach, market: screenMarket, offseason: screenOffseason, save: screenSave }[S] || screenHome;
    root.innerHTML = shell(f()) + (ui.modal ? modalPlayer(ui.modal) : '') + sheetHtml() + toastHtml();
    window.scrollTo(0, scroll);
  }
  const toastHtml = () => (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '');

  /* ---------------- 액션 ---------------- */
  function afterAdvance(r) {
    if (r.status === 'userGame') { openLive(r.game, r.idx, false); return; }
    autosave(); render();
  }
  function openLive(g, idx, post) {
    L.mergeTracking(); const ctx = post ? L.startUserPostGame() : L.startUserGame(g, idx);
    ui.live = { ctx, feed: [], lbl: '', pick: null, sheet: null, post: !!post, before: snapshot() }; ui.live.feed.unshift({ w: '', t: `${KO[ctx.live.away]} @ ${KO[ctx.live.home]} — 선발 ${P(ctx.prep.sp.id).ko}`, sys: true }); render(); window.scrollTo(0, 0);
  }
  const A = {
    pickteam(a) { ui.team = a; render(); },
    newgame() { const seed = parseInt(($('#seedIn') || {}).value, 10); ui.seed = ($('#seedIn') || {}).value || ''; L = League.create(KBO_BASE, ui.team, Number.isFinite(seed) ? seed : 1 + Math.floor(Math.random() * 99999)); ui.screen = 'home'; autosave(); render(); },
    continue() { const s = store.get(SAVE_KEY); if (s) { try { L = League.load(s); ui.screen = 'home'; render(); } catch (e) { toast('저장 데이터를 읽을 수 없습니다.'); } } },
    devPlan(a) { const [id, pl] = a.split('|'), e = L.setDevPlan(id, pl); if (e) toast(e); else { toast(`${P(id).ko}: 육성 방향 ${L.planName(pl)}`); autosave(); } render(); },
    hireCoach(a) { const e = L.hireCoach(a); if (e) toast(e); else { toast('코치를 영입했습니다.'); autosave(); } render(); },
    fireCoach(a) { const e = L.fireCoach(a); if (e) toast(e); else autosave(); render(); },
    setExc() { const el = $('[data-sel="excsel"]'); if (!el) return; const e = L.setCbtExc(el.value); if (e) toast(e); else { toast('예외 선수를 지정했습니다.'); autosave(); } render(); },
    ticket(a) { if (L.setTicketPolicy(U(), +a)) { toast(`티켓 가격 ${+a === 1 ? '유지' : (+a > 1 ? '+' : '') + Math.round((+a - 1) * 100) + '%'}`); autosave(); render(); } },
    go(a) { ui.screen = a; ui.modal = null; render(); window.scrollTo(0, 0); },
    adv(a) { if (L.S.faMkt && !L.S.faMkt.closed) { toast('FA 협상 기간입니다. 이적시장 > FA 시장에서 날짜를 진행하거나 FA를 마감하세요.'); ui.screen = 'market'; ui.market = 'fa'; render(); return; } const live = ui.liveMode && (L.S.phase === 'preseason' || L.S.phase === 'regular'), before = snapshot(), r = L.advance(+a, live); if (r.status === 'userGame') { afterAdvance(r); return; } if (r.status === 'seasonEnd') toast('정규시즌이 끝났습니다.'); openResultSheet(before); autosave(); render(); },
    advAuto(a) { if (L.S.faMkt && !L.S.faMkt.closed) { toast('FA 협상 기간입니다. 이적시장 > FA 시장에서 날짜를 진행하거나 FA를 마감하세요.'); ui.screen = 'market'; ui.market = 'fa'; render(); return; } const before = snapshot(), r = L.advance(+a, false); openResultSheet(before); if (r.status === 'seasonEnd') toast('정규시즌이 끝났습니다.'); autosave(); render(); },
    startPost() { const my = L.standings().find(x => x.team === U()); L.startPostseason(); if (my.rank > 5) { while (!L.S.post.done) L.simPostGame(); } autosave(); render(); },
    postNext() { if (L.userInPost()) { ui.liveMode ? A.postLive() : A.postAuto(); return; } const r = L.simPostGame(); if (r) openPostSheet([r]); autosave(); render(); },
    postAll() { let n = 0; const list = []; while (!L.S.post.done && !L.userInPost() && n++ < 40) { const r = L.simPostGame(); if (r) list.push(r); } if (list.length) openPostSheet(list); autosave(); render(); },
    postLive() { openLive(null, 0, true); },
    postAuto() { const c = L.startUserPostGame(); c.live.playToEnd(); const r = L.finishUserPostGame(c); openPostSheet([r]); autosave(); render(); },
    toOff() { L.startOffseason(); ui.screen = 'offseason'; autosave(); render(); },
    rfilter(a) { ui.rf.f = a; render(); },
    rview(a) { ui.rf.v = a; render(); },
    player(a) { ui.modal = a; ui.confirm = null; render(); },
    closeModal() { ui.modal = null; ui.confirm = null; render(); },
    toggleActive(a) { const p = P(a), err = L.moveActive(a, !p.active); if (err) toast(err); else { autosave(); } render(); },
    swapFarm(a) { const [up, dn] = a.split('|'), err = L.swapActive(up, dn); if (err) toast(err); else { toast('콜업/말소를 완료했습니다.'); autosave(); } render(); },
    releaseAsk(a) { if (ui.confirm === a) { if (L.players(U()).length <= 44) { toast('보유 선수가 최소 44명 필요합니다.'); } else { L.release(U(), a); ui.modal = null; ui.confirm = null; autosave(); } } else ui.confirm = a; render(); },
    autoLineup() { L.autoSettings(U(), 'lineup'); autosave(); render(); },
    autoPitch() { L.autoSettings(U(), 'rotation'); L.autoSettings(U(), 'bullpen'); autosave(); render(); },
    lfix(a, b) { const set = L.team(U()).set, i = +a; set.lineup[i].id = b; autosave(); render(); toast('후보로 교체했습니다.'); },
    lmove(a, b) { const i = +a, j = i + (+b), l = L.team(U()).set.lineup; if (j < 0 || j > 8) return; [l[i], l[j]] = [l[j], l[i]]; autosave(); render(); },
    mtab(a) { ui.market = a; render(); },
    tgive(a, el) { ui.trade.give[el.checked ? 'add' : 'delete'](a); render(); }, tget(a, el) { ui.trade.get[el.checked ? 'add' : 'delete'](a); render(); },
    clearTrade() { ui.trade.give.clear(); ui.trade.get.clear(); render(); },
    doTrade() { const T = ui.trade, r = L.executeTrade(T.team, [...T.give], [...T.get]); if (r.ok) { toast('트레이드가 성사되었습니다. 영입한 선수는 2군에 있으니 1군에 등록하세요.'); T.give.clear(); T.get.clear(); autosave(); } else toast(r.why || '트레이드가 거절되었습니다.'); render(); },
    openFAMarket() { ui.screen = 'market'; ui.market = 'fa'; render(); window.scrollTo(0, 0); },
    team(a) { ui.viewTeam = a; ui.screen = 'teams'; ui.modal = null; render(); window.scrollTo(0, 0); },
    fatab(a) { ui.faTab = a; render(); },
    faDay(a) { const k = L.faAdvance(+a); toast(L.S.faMkt ? `${L.faDateStr(L.S.faMkt.day)}가 되었습니다.` : ''); if (k) autosave(); render(); },
    faClose() { L.closeFA(); toast('FA 협상을 마감했습니다.'); autosave(); render(); },
    faBeat(a) { const p = P(a), q = k => $(`[data-sel="${k}"][data-a="${a}"]`), y = q('fayears'), b = L.faBeat(p, U(), y ? +y.value : undefined); (ui.faIn = ui.faIn || {})[a] = { years: b.years, salary: b.salary, bonus: b.bonus }; render(); },
    signFA(a) { const q = k => $(`[data-sel="${k}"][data-a="${a}"]`), y = q('fayears'), sal = q('fasal'), bon = q('fabonus'), e = L.signFA(a, y && sal ? { years: +y.value, salary: +sal.value, bonus: bon ? +bon.value : 0 } : undefined); (ui.faIn = ui.faIn || {})[a] = y && sal ? { years: +y.value, salary: +sal.value, bonus: bon ? +bon.value : 0 } : undefined; if (e) { toast(e); autosave(); } else { delete ui.faIn[a]; toast(`${P(a).ko} 영입 완료. 2군에 등록되었습니다.`); autosave(); } render(); },
    resignAll() { const n = L.resignAll(); toast(`${n}명 재계약했습니다.`); autosave(); render(); },
    resign(a) { const e = L.resign(a); if (e) toast(e); else autosave(); render(); },
    toDraft() { L.finishContracts(); L.buildDraft(); L.draftAiUntilUser(); L.S.off.step = 'draft'; autosave(); render(); },
    draftPick(a) { const e = L.draftPick(a); if (e) toast(e); else { L.draftAiUntilUser(); autosave(); } render(); },
    draftSim() { L.draftAiUntilUser(); render(); },
    draftAuto() { L.draftAutoRest(); autosave(); render(); },
    toFA() { L.finishDraft(); L.openFAMarket(); L.S.off.step = 'fa'; ui.market = 'fa'; autosave(); render(); },
    toSeason() { L.closeFA(); L.startNewSeason(); ui.faIn = {}; ui.screen = 'home'; autosave(); render(); window.scrollTo(0, 0); },
    importHands() { const t = ($('#handsText') || {}).value; if (!t || !t.trim()) return toast('붙여넣은 내용이 없습니다.'); const r = L.importHands(t); autosave(); render(); toast(`투타 ${r.applied}명 적용${r.ambiguous.length ? ' · 동명이인 ' + r.ambiguous.length + '명은 팀 이름이 필요합니다(' + [...new Set(r.ambiguous)].slice(0, 4).join(', ') + ')' : ''}${r.missing.length ? ' · 찾지 못한 이름 ' + r.missing.length + '줄' : ''}`); },
    handTemplate() { const t = L.handTemplate(); ui.handsText = t; try { navigator.clipboard.writeText(t).then(() => toast('입력 양식을 복사했습니다. 이름,팀,구분 뒤에 투타(예: 우투우타)를 적어 붙여넣으세요.'), () => toast('텍스트를 직접 복사하세요.')); } catch (e) { toast('텍스트를 직접 복사하세요.'); } },
    saveNow() { if (store.set(SAVE_KEY, L.save())) toast('저장했습니다.'); else toast('이 환경에서는 저장할 수 없습니다. 백업 텍스트를 사용하세요.'); },
    exportSave() { const t = { value: L.save() }; ui.saveText = t.value; try { navigator.clipboard.writeText(t.value).then(() => toast('백업 텍스트를 복사했습니다.'), () => toast('텍스트를 직접 복사하세요.')); } catch (e) { toast('텍스트를 직접 복사하세요.'); } },
    importSave() { const t = ($('#saveText') || {}).value; if (!t || !t.trim()) return toast('붙여넣은 텍스트가 없습니다.'); try { L = League.load(t.trim()); ui.screen = 'home'; autosave(); render(); toast('불러왔습니다.'); } catch (e) { toast('올바른 백업 텍스트가 아닙니다.'); } },
    newGameMenu() { L = null; ui.live = null; render(); },
    /* 경기 */
    liveRun(a) { liveRun(a); },
    liveTac(a) { const lv = ui.live; if (a === 'pcOpen') { lv.pick = { t: 'pc' }; lv.sheet = null; render(); } else if (a === 'phOpen') { lv.pick = { t: 'ph' }; lv.sheet = null; render(); } else if (a === 'prOpen') { lv.pick = { t: 'pr', base: null }; lv.sheet = null; render(); } else if (a === 'dsOpen') { lv.pick = { t: 'ds', slot: null }; lv.sheet = null; render(); } else liveTactic(a); },
    liveSheet(a) { ui.live.sheet = a; render(); }, liveSheetClose() { ui.live.sheet = null; render(); }, sheetClose() { ui.sheet = null; render(); },
    liveSet(a, b) { const lv = ui.live, us = lv.ctx.userSide; lv.ctx.live.setTactic(us, a, (a === 'inf' || a === 'hold') ? b === '1' : b); render(); },
    liveAuto() { ui.live.ctx.auto = !ui.live.ctx.auto; render(); },
    livePrBase(a) { ui.live.pick.base = +a; render(); }, liveDsSlot(a) { ui.live.pick.slot = +a; render(); },
    liveAdv(a) { const lv = ui.live, us = lv.ctx.userSide; if (a === 'pcOpen' || a === 'phOpen' || a === 'prOpen') A.liveTac(a); else if (a === 'ibb' || a === 'bunt' || a === 'har' || a === 'mv') liveTactic(a); else if (a === 'inf' || a === 'hold') { lv.ctx.live.setTactic(us, a, true); render(); } else { lv.ctx.live.setTactic(us, 'bat', a); render(); } },
    livePickClose() { ui.live.pick = null; render(); },
    liveDo(a, b) { liveTactic(a, b); },
    liveAbort() { const lv = ui.live; lv.ctx.auto = true; const g = lv.ctx.live; g.playToEnd(); lv.feed.unshift({ w: '', t: `경기 종료 ${KO[g.away]} ${g.score.away} : ${g.score.home} ${KO[g.home]}`, sys: true }); lv.sheet = null; lv.pick = null; render(); },
    liveFinish() {
      const lv = ui.live, post = lv.post, before = lv.before, r = post ? L.finishUserPostGame(lv.ctx) : L.finishUserGame(lv.ctx);
      ui.live = null; autosave(); if (post) openPostSheet([r]); else openResultSheet(before); render(); window.scrollTo(0, 0);
    }
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    if ((el.classList.contains('modal-bg') || el.classList.contains('sheet-bg')) && e.target !== el) return;   // 배경을 눌렀을 때만 닫기
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return;   // 체크박스는 change 에서 처리
    const act = el.dataset.act; if (A[act]) A[act](el.dataset.a, el.dataset.b);
  });
  document.addEventListener('input', e => { const el = e.target; if (el.id === 'handsText') ui.handsText = el.value; else if (el.id === 'saveText') ui.saveText = el.value; });
  document.addEventListener('change', e => {
    const el = e.target; if (!L && el.id !== 'seedIn') return;
    if (el.id === 'seedIn') { ui.seed = el.value; return; }
    if (el.id === 'liveMode') { ui.liveMode = el.checked; render(); return; }
    if (el.id === 'autoBp') { ui.live.ctx.auto = el.checked; return; }
    if (el.type === 'checkbox' && el.dataset.act && A[el.dataset.act]) { A[el.dataset.act](el.dataset.a, el); return; }
    const sel = el.dataset.sel; if (!sel) return;
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
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.modal) A.closeModal(); });
  render();
})();
