(function () {
  'use strict';
  const E0 = KBOEngine, TEAMS = E0.TEAMS, PARK = E0.PARKNAME;
  const KO = { Bears: '두산', Twins: 'LG', Heroes: '키움', Landers: 'SSG', Wiz: 'KT', Eagles: '한화', Tigers: 'KIA', Giants: '롯데', Dinos: 'NC', Lions: '삼성' };
  const COL = { Bears: '#1A1748', Twins: '#C30452', Heroes: '#820024', Landers: '#CE0E2D', Wiz: '#6B6B6B', Eagles: '#FF6600', Tigers: '#EA0029', Giants: '#0B2A56', Dinos: '#315288', Lions: '#0A5BC4' };
  const $ = id => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  const engines = {}; const eng = m => engines[m] || (engines[m] = E0.createEngine(KBO_DATA, m));
  const S = { mode: 'forward', season: null, post: null, snap: null, busy: false, seed: null, sample: false, batch: null };

  const team = t => `<span class="team"><i class="dot" style="background:${COL[t]}"></i>${KO[t]}</span>`;
  const pct3 = x => (x >= 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));
  const sgn = n => (n > 0 ? '+' + n : String(n));
  const pname = n => n.split(' ').pop();

  /* ---------- 설정 ---------- */
  const modeSel = $('mode');
  for (const k of Object.keys(KBO_DATA.modes)) { const o = document.createElement('option'); o.value = k; o.textContent = KBO_DATA.modes[k].label; modeSel.appendChild(o); }
  { const m = store.get('kbo.mode'); if (m && KBO_DATA.modes[m]) { S.mode = m; } modeSel.value = S.mode; }
  { const s = store.get('kbo.seed'); if (s) $('seed').value = s; }
  modeSel.addEventListener('change', () => { S.mode = modeSel.value; store.set('kbo.mode', S.mode); });

  /* ---------- 탭 ---------- */
  const TABS = ['standings', 'post', 'players', 'batch'];
  function showTab(id) {
    if (!TABS.includes(id)) id = 'standings';
    for (const t of TABS) { $('p-' + t).hidden = t !== id; $('t-' + t).setAttribute('aria-selected', String(t === id)); }
    try { if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id); } catch (e) { }
  }
  for (const t of TABS) $('t-' + t).addEventListener('click', () => showTab(t));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  /* ---------- 상태 표시 ---------- */
  function status() {
    const s = S.season, parts = [];
    parts.push(`<span><b>${KBO_DATA.modes[S.mode].label}</b></span>`);
    if (S.seed !== null) parts.push(`<span>시드 <b class="num">${S.seed}</b>${S.sample ? ' (예시 시즌)' : ''}</span>`);
    if (s) parts.push(`<span>정규시즌 <b class="num">${s.pos}/${s.sched.length}</b>경기</span>`);
    if (s && s.done) parts.push(S.post ? `<span>포스트시즌 <b>완료</b></span>` : `<span>포스트시즌 <b>대기</b></span>`);
    $('status').innerHTML = parts.join('');
    $('runpost').disabled = S.busy || !(s && s.done && !S.post);
    $('run').disabled = S.busy;
  }
  function progress(f) { $('prog').style.width = Math.round(f * 100) + '%'; }

  /* ---------- 순위 ---------- */
  function renderStandings() {
    const s = S.season, el = $('p-standings');
    if (!s) { el.innerHTML = '<p class="empty">시즌을 시작하면 순위가 표시됩니다.</p>'; return; }
    const st = s.standings(), top = st[0], done = s.done;
    const champ = S.post ? S.post.champion : null, ru = S.post ? S.post.runnerUp : null;
    const chipFor = (r, t) => {
      if (S.post && t === champ) return '<span class="chip ks">우승</span>';
      if (S.post && t === ru) return '<span class="chip in">준우승</span>';
      if (!done) return '';
      if (r === 1) return '<span class="chip ks">한국시리즈 직행</span>';
      if (r === 2) return '<span class="chip in">플레이오프 직행</span>';
      if (r === 3) return '<span class="chip in">준플레이오프</span>';
      if (r <= 5) return '<span class="chip in">와일드카드</span>';
      return '';
    };
    const rows = st.map(x => {
      const gb = ((top.w - x.w) + (x.l - top.l)) / 2, diff = x.rs - x.ra;
      return `<tr class="${x.rank === 5 && done ? 'cut' : ''}"><td class="l n">${x.rank}</td><td class="l">${team(x.team)}</td><td class="n">${x.w + x.l + x.d}</td><td class="n">${x.w}</td><td class="n">${x.l}</td><td class="n">${x.d}</td>
      <td class="n"><b>${pct3(x.pct)}</b><span class="pctbar" aria-hidden="true"><i style="width:${Math.round(x.pct * 100)}%"></i></span></td><td class="n">${x.rank === 1 ? '-' : gb.toFixed(1)}</td><td class="n">${x.rs}</td><td class="n">${x.ra}</td><td class="n ${diff >= 0 ? 'pos' : 'neg'}">${sgn(diff)}</td><td class="l">${chipFor(x.rank, x.team)}</td></tr>`;
    }).join('');
    const order = st.map(x => x.team);
    const h2h = `<div class="tablewrap"><table class="h2h"><thead><tr><th></th>${order.map(t => `<th>${KO[t]}</th>`).join('')}</tr></thead><tbody>` +
      order.map(a => `<tr><th class="l" style="text-align:left;color:var(--fg)">${KO[a]}</th>` + order.map(b => {
        if (a === b) return '<td class="self"></td>';
        const r = s.h2h[a][b], cls = r[0] > r[1] ? 'pos' : (r[0] < r[1] ? 'neg' : '');
        return `<td class="n ${cls}">${r[0]}-${r[1]}${r[2] ? '-' + r[2] : ''}</td>`;
      }).join('') + '</tr>').join('') + '</tbody></table></div>';
    let park = '';
    if (S.snap) {
      const PR = S.snap.park, M = KBO_DATA.modes[S.mode];
      let tr = 0, tg = 0; for (const k in PR) { tr += PR[k][0]; tg += PR[k][1]; }
      const first = {}; for (const t of TEAMS) if (!first[PARK[t]]) first[PARK[t]] = t;
      const rowsP = Object.keys(first).map(pk => ({ pk, rg: PR[pk] ? PR[pk][0] / PR[pk][1] : 0, idx: PR[pk] ? (PR[pk][0] / PR[pk][1]) / (tr / tg) * 100 : 0, pf: M.pf[first[pk]].runs * 100 })).sort((a, b) => b.pf - a.pf);
      park = `<div class="tablewrap"><table><thead><tr><th class="l">구장</th><th>설정 득점 지수</th><th>이번 시즌 지수</th><th>경기당 득점</th></tr></thead><tbody>` +
        rowsP.map(r => `<tr><td class="l"><b>${r.pk}</b></td><td class="n">${r.pf.toFixed(0)}</td><td class="n">${r.idx.toFixed(0)}</td><td class="n">${r.rg.toFixed(2)}</td></tr>`).join('') + '</tbody></table></div>';
    }
    el.innerHTML = `<div class="panel"><div class="tablewrap"><table><thead><tr><th class="l">순위</th><th class="l">팀</th><th>경기</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>게임차</th><th>득점</th><th>실점</th><th>득실차</th><th class="l">${done ? '진출' : '진행 중'}</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <p class="legend">순위는 승률, 동률이면 상대전적, 득실차 순입니다. 1~5위가 포스트시즌에 진출합니다.</p>
      <div class="grid2"><div class="panel"><h2>팀 간 상대전적</h2><p class="note">행 팀 기준 승-패(-무)</p>${h2h}</div>
      <div class="panel"><h2>구장 효과</h2><p class="note">100이 리그 평균입니다. 한 시즌은 표본이 작아 설정값과 차이가 납니다.</p>${park || '<p class="empty">정규시즌이 끝나면 표시됩니다.</p>'}</div></div>`;
  }

  /* ---------- 포스트시즌 ---------- */
  function seriesCard(r, seeds, pending) {
    const hi = r.hi, lo = r.lo, sd = t => { const i = seeds.indexOf(t); return i >= 0 ? `${i + 1}위` : ''; };
    const side = (t, w, win) => `<div class="side ${win ? 'win' : ''}"><span>${team(t)} <span class="seed">${sd(t)}</span></span><span class="sc">${w === null ? '' : w}</span></div>`;
    const note = r.wcAdvantage ? '4위 1승 어드밴티지' : (r.need === 4 ? '7전 4선승' : '5전 3선승');
    if (pending) return `<div class="series"><div class="name"><span>${r.name}</span><span>${note}</span></div><div class="matchup">${hi ? side(hi, null, false) : ''}${lo ? side(lo, null, false) : '<div class="side"><span class="seed">이전 라운드 승자</span><span></span></div>'}</div></div>`;
    const list = r.games.map((g, i) => {
      const ext = g.inns.length > 9 ? ` <span class="sp">(연장 ${g.inns.length}회)</span>` : '';
      const res = g.draw ? '<b>무승부</b> ' : '';
      return `<li><span class="g">${i + 1}</span><span>${res}${KO[g.away]} <b class="num">${g.ra}</b> : <b class="num">${g.rh}</b> ${KO[g.home]}${ext}<br><span class="sp">${PARK[g.home]} · 선발 ${pname(g.spA)} / ${pname(g.spH)}</span></span></li>`;
    }).join('');
    return `<div class="series"><div class="name"><span>${r.name}</span><span>${note}</span></div><div class="matchup">${side(hi, r.wins[hi], r.winner === hi)}${side(lo, r.wins[lo], r.winner === lo)}</div>
      <details><summary>경기별 결과 (${r.games.length})</summary><ul class="games">${list}</ul></details></div>`;
  }
  function renderPost() {
    const s = S.season, el = $('p-post');
    if (!s || !s.done) { el.innerHTML = '<p class="empty">정규시즌이 끝나면 포스트시즌 대진이 확정됩니다.</p>'; return; }
    const st = s.standings(), T = i => st[i].team, seeds = st.slice(0, 5).map(x => x.team);
    let html = '', rounds;
    if (S.post) {
      rounds = S.post.rounds;
      const ks = rounds[3], w = ks.wins[ks.winner], l = ks.wins[ks.winner === ks.hi ? ks.lo : ks.hi];
      html += `<div class="champ"><div><div class="l">한국시리즈 우승</div><div class="t">${team(S.post.champion)}</div></div><div class="l">한국시리즈 ${w}승 ${l}패 · 정규시즌 ${seeds.indexOf(S.post.champion) + 1}위${KBO_DATA ? '' : ''}</div></div>`;
      html += `<div class="bracket">${rounds.map(r => seriesCard(r, seeds, false)).join('')}</div>`;
    } else {
      rounds = [{ name: '와일드카드 결정전', hi: T(3), lo: T(4), need: 2, wcAdvantage: true }, { name: '준플레이오프', hi: T(2), lo: null, need: 3 }, { name: '플레이오프', hi: T(1), lo: null, need: 3 }, { name: '한국시리즈', hi: T(0), lo: null, need: 4 }];
      html += `<p class="legend">대진이 확정되었습니다. 「포스트시즌 진행」을 누르면 시리즈를 시뮬레이션합니다.</p><div class="bracket">${rounds.map(r => seriesCard(r, seeds, true)).join('')}</div>`;
    }
    el.innerHTML = html;
  }

  /* ---------- 선수 기록 ---------- */
  function renderPlayers() {
    const el = $('p-players');
    if (!S.snap) { el.innerHTML = '<p class="empty">정규시즌이 끝나면 선수 기록이 표시됩니다.</p>'; return; }
    const L = S.snap.leaders, q = L.filter(x => x.qualified);
    const top = (arr, f, n) => arr.slice().sort((a, b) => f(b) - f(a) || b.PA - a.PA).slice(0, n);
    const tbl = (title, rows, val, note) => `<div class="panel"><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}<div class="tablewrap"><table><thead><tr><th class="l">순위</th><th class="l">선수</th><th class="l">팀</th><th>기록</th><th>타석</th></tr></thead><tbody>` +
      rows.map((x, i) => `<tr><td class="l n">${i + 1}</td><td class="l"><b>${x.name}</b></td><td class="l">${team(x.team)}</td><td class="n"><b>${val(x)}</b></td><td class="n">${x.PA}</td></tr>`).join('') + '</tbody></table></div></div>';
    el.innerHTML = `<p class="legend">정규시즌 기록입니다. 규정 타석은 446(144경기 × 3.1)입니다. 타점·득점·투수 기록은 아직 집계하지 않습니다.</p><div class="grid2">` +
      tbl('홈런', top(L, x => x.HR, 10), x => x.HR) + tbl('타율', top(q, x => x.avg, 10), x => pct3(x.avg), '규정 타석 충족 선수') +
      tbl('안타', top(L, x => x.H, 10), x => x.H) + tbl('OPS', top(q, x => x.ops, 10), x => x.ops.toFixed(3), '규정 타석 충족 선수') + '</div>';
  }

  /* ---------- 시즌 실행 ---------- */
  function randomSeed() { return 1 + Math.floor(Math.random() * 999999); }
  function finishRegular() {
    const E = eng(S.mode);
    S.snap = { leaders: E.leaders(S.season), park: JSON.parse(JSON.stringify(E.parkRuns())) };
    progress(1); renderAll();
  }
  function renderAll() { renderStandings(); renderPost(); renderPlayers(); status(); }
  function startSeason(seed, sample, instant) {
    const E = eng(S.mode); S.seed = seed; S.sample = !!sample; S.post = null; S.snap = null;
    S.season = new E.Season(seed); S.busy = true; progress(0);
    const anim = $('anim').checked && !instant;
    const done = () => {
      S.busy = false; finishRegular();
      if ($('auto').checked || instant) runPost();
    };
    if (!anim) { S.season.playAll(); done(); return; }
    renderAll();
    (function tick() {
      S.season.play(12); progress(S.season.pos / S.season.sched.length);
      renderStandings(); status();
      if (!S.season.done) setTimeout(tick, 24); else done();
    })();
  }
  function runPost() {
    if (!S.season || !S.season.done || S.post) return;
    S.post = eng(S.mode).playPostseason(S.season); renderAll();
  }
  $('run').addEventListener('click', () => {
    if (S.busy) return;
    const raw = $('seed').value.trim();
    let seed = raw === '' ? randomSeed() : Math.abs(parseInt(raw, 10));
    if (!Number.isFinite(seed)) seed = randomSeed();
    store.set('kbo.seed', raw);
    showTab('standings'); startSeason(seed, false, false);
  });
  $('runpost').addEventListener('click', () => { runPost(); showTab('post'); });

  /* ---------- 여러 시즌 통계 ---------- */
  function renderBatch() {
    const el = $('p-batch'), B = S.batch;
    let table = '<p class="empty">시즌 수를 정하고 실행하면 팀별 평균 성적과 우승 확률이 표시됩니다.</p>';
    if (B && B.rows) {
      const max = Math.max(...B.rows.map(r => r.champ)) || 1;
      table = `<div class="tablewrap"><table><thead><tr><th class="l">평균순위</th><th class="l">팀</th><th>평균 승</th><th>승률</th><th>득점/경기</th><th>실점/경기</th><th>1위</th><th>포스트시즌</th><th>한국시리즈</th><th>우승</th></tr></thead><tbody>` +
        B.rows.map((r, i) => `<tr><td class="l n">${i + 1} <span class="note">(${r.rank.toFixed(2)})</span></td><td class="l">${team(r.t)}</td><td class="n">${r.w.toFixed(1)}</td><td class="n">${pct3(r.pct)}</td><td class="n">${r.rs.toFixed(2)}</td><td class="n">${r.ra.toFixed(2)}</td><td class="n">${r.first.toFixed(0)}%</td><td class="n">${r.post.toFixed(0)}%</td><td class="n">${r.ks.toFixed(0)}%</td><td class="n"><b>${r.champ.toFixed(0)}%</b><span class="pctbar" aria-hidden="true"><i style="width:${(r.champ / max) * 100}%"></i></span></td></tr>`).join('') + '</tbody></table></div>' +
        `<p class="note">${B.n}시즌 · ${KBO_DATA.modes[B.mode].label} · 리그 평균 ${B.rg.toFixed(2)}득점/경기. 포스트시즌은 5위 이내, 한국시리즈는 결승 진출 비율입니다.</p>`;
    }
    el.innerHTML = `<div class="panel controls"><div class="row"><div class="field"><label for="n">시즌 수</label><select id="n"><option value="30">30</option><option value="100" selected>100</option><option value="300">300</option></select></div>
      <div class="btns"><button id="runbatch" type="button" class="primary"${S.busy ? ' disabled' : ''}>여러 시즌 시뮬레이션</button></div></div><div class="bar" aria-hidden="true"><i id="bprog" style="width:${B && B.rows ? 100 : 0}%"></i></div>
      <p class="note">위에서 고른 데이터 모드와 시드(비우면 1부터)로 시즌마다 시드를 1씩 올려 가며 정규시즌과 포스트시즌을 모두 돌립니다.</p></div>${table}`;
    $('runbatch').addEventListener('click', runBatch);
    if (B && B.n) $('n').value = String(B.n);
  }
  function runBatch() {
    if (S.busy) return;
    const n = parseInt($('n').value, 10), E = eng(S.mode), mode = S.mode;
    const raw = parseInt($('seed').value.trim(), 10), base = Number.isFinite(raw) ? Math.abs(raw) : 1;
    const A = {}; for (const t of TEAMS) A[t] = { w: 0, l: 0, rs: 0, ra: 0, rank: 0, first: 0, post: 0, ks: 0, champ: 0 };
    let i = 0, games = 0, runs = 0; S.busy = true; $('runbatch').disabled = true; $('run').disabled = true; $('runpost').disabled = true;
    (function step() {
      const t0 = performance.now();
      while (i < n && performance.now() - t0 < 40) {
        const s = new E.Season(base + i); s.playAll(); const st = s.standings(), P = E.playPostseason(s);
        st.forEach(x => { const a = A[x.team]; a.w += x.w; a.l += x.l; a.rs += x.rs; a.ra += x.ra; a.rank += x.rank; if (x.rank === 1) a.first++; if (x.rank <= 5) a.post++; runs += x.rs; games += x.w + x.l + x.d; });
        const ks = P.rounds[3]; A[ks.hi].ks++; A[ks.lo].ks++; A[P.champion].champ++; i++;
      }
      const bp = $('bprog'); if (bp) bp.style.width = Math.round(i / n * 100) + '%';
      if (i < n) { setTimeout(step, 0); return; }
      const rows = TEAMS.map(t => { const a = A[t]; return { t, w: a.w / n, pct: a.w / (a.w + a.l), rs: a.rs / n / 144, ra: a.ra / n / 144, rank: a.rank / n, first: a.first / n * 100, post: a.post / n * 100, ks: a.ks / n * 100, champ: a.champ / n * 100 }; }).sort((x, y) => x.rank - y.rank);
      S.batch = { n, mode, rows, rg: runs / games }; S.busy = false;   // 팀 득점 합 / 팀 경기 합 = 팀당 경기당 득점
      renderBatch(); status();
    })();
  }

  /* ---------- 시작: 예시 시즌을 바로 보여준다 ---------- */
  renderBatch();
  showTab(location.hash.slice(1));
  { const raw = $('seed').value.trim(); const seed = raw !== '' && Number.isFinite(parseInt(raw, 10)) ? Math.abs(parseInt(raw, 10)) : 5000; startSeason(seed, raw === '', true); }
})();
