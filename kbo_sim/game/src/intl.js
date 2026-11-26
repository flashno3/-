/* 국제대회(42단계): 대표 선발 → 대회 시뮬레이션 → 메달·올림픽 출전권 → 병역 특례.
 *  일정(검색 확인, 2026-11-26): 2027 WBSC 프리미어12(2027년 11월, 16개국, 슈퍼라운드·결승 11/21~24 도쿄돔, 아시아 최상위 1개국 LA 올림픽 출전권),
 *    2028 LA 올림픽 최종예선(2028년 3월까지 — 형식 미발표 ⚠), 2028 LA 올림픽(7/13~19 다저스타디움, 6개국: 개최국 미국·2026 WBC 아메리카 상위 2·프리미어12 아시아 1·유럽/오세아니아 1·최종예선).
 *    차기 WBC: 2030년 3월·이후 4년 주기 가정(⚠ MLB 커미셔너 '2029년 또는 2030년' 발언, 시기 3월/7월 미정), 20개국·한국은 도쿄 조·병역 특례 없음.
 *    2030년 이후 아시안게임: 4년 주기·야구 채택·11월 개최·2026년과 같은 선발 규정(만 25세 이하 또는 입단 4년 차 이하 + 와일드카드 3명, 만 29세 이하)을 가정(⚠ 미확인).
 *  병역 특례(병역법 시행령 제68조의11, 보도 확인): 올림픽 3위 이상 · 아시안게임 1위 → 예술체육요원(게임에서는 '병역 필(특례)'로 취급, 34개월 봉사활동은 생략).
 *  ⚠ 게임 가정: 국가별 전력(Elo식 점수), 한국 전력 = 기준 1480 + 500 × (대표팀 상위 20명 WAR 합 ÷ 처음 열리는 대회 때 최강 대표팀 WAR 합 − 1, 아시안게임은 나이 제한 대표끼리 따로), 경기 점수 생성,
 *    대회 형식 단순화(조별 풀리그 → 슈퍼라운드 → 결승), 엔트리 28명(올림픽·아시안게임 24명), 올림픽 대표 소집(7/6)부터 복귀(7/21)까지 소속팀 결장(리그는 계속 진행). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, rngFor, TEAMS, KO0 } = LG.OFFC;
  const NAT = { KOR: '한국', JPN: '일본', USA: '미국', DOM: '도미니카공화국', VEN: '베네수엘라', PUR: '푸에르토리코', MEX: '멕시코', TPE: '대만', CUB: '쿠바', NED: '네덜란드', PAN: '파나마', AUS: '호주', CAN: '캐나다', ITA: '이탈리아', COL: '콜롬비아', CZE: '체코', CHN: '중국', HKG: '홍콩', PHI: '필리핀', THA: '태국', PAK: '파키스탄', ISR: '이스라엘', GBR: '영국', NCA: '니카라과' };
  // ⚠ 전력 점수(가정): 최근 국제대회 결과(2023 WBC 일본·호주전 패, 2024 프리미어12 대만·일본전 패, 2026 WBC 8강 도미니카전 0-10, 아시안게임 2010~2026 연속 금)를 대략 반영
  const ELO = { JPN: 1600, USA: 1570, DOM: 1570, VEN: 1540, PUR: 1500, MEX: 1500, TPE: 1480, CUB: 1450, NED: 1420, PAN: 1400, AUS: 1400, CAN: 1390, ITA: 1370, COL: 1360, CZE: 1300, CHN: 1240, HKG: 950, PHI: 1050, THA: 950, PAK: 1000, ISR: 1300, GBR: 1280, NCA: 1300 };
  const ELO_AG = { TPE: 1310, JPN: 1290, CHN: 1180 };   // 아시안게임(한국은 아시안게임 대표 기준 1480): 일본은 사회인 대표, 대만은 프로 일부 — 2018·2023 조별리그 대만전 패, 결승·슈퍼라운드 승(⚠)
  const ELO_NOMLB = { USA: 1460, DOM: 1450, VEN: 1450, PUR: 1400, MEX: 1430, CUB: 1430 };   // 프리미어12·최종예선: 메이저리거 불참(⚠) — 한국 2015 우승·2019 준우승·2024 조별 탈락
  const KOR0 = 1480, KOR_K = 500;
  const ASIA = ['KOR', 'JPN', 'TPE', 'CHN'], EUOC = ['NED', 'ITA', 'CZE', 'AUS'];
  const EVENTS = () => {
    const ev = [
      { id: 'p12_2027', kind: 'P12', y: 2027, name: '2027 WBSC 프리미어12', size: 28, phase: 'off', src: 'WBSC 발표: 2027년 11월 · 16개국 · 슈퍼라운드·결승 11/21~24 도쿄돔 · 아시아 최상위 1개국 LA 올림픽 출전권', ok: true },
      { id: 'oqt_2028', kind: 'OQT', y: 2028, name: '2028 LA 올림픽 최종예선', size: 28, phase: 'pre', src: '보도: 2028년 3월까지 최종예선(형식 미발표 — 6개국 풀리그 1위 진출로 가정 ⚠)', ok: false },
      { id: 'oly_2028', kind: 'OLY', y: 2028, name: '2028 LA 올림픽', size: 24, phase: 'season', ann: [5, 10], camp: [6, 6], back: [6, 21], src: 'WBSC 발표: 2028-07-13~19 다저스타디움 · 6개국 · 3위 이상 병역 특례(엔트리 24명·소집 7/6·복귀 7/21은 가정 ⚠)', ok: true }
    ];
    for (let y = 2030; y <= 2070; y += 4) ev.push({ id: 'wbc_' + y, kind: 'WBC', y, name: `${y} 월드베이스볼클래식(WBC)`, size: 30, phase: 'pre', src: y === 2030 ? '차기 WBC: MLB 커미셔너 "2029년 또는 2030년, 3~4년 간격"(2026-03 보도) — 올림픽 직후라 2030년 가능성 언급, 3월 또는 7월 중순 개최 검토. 2030년 3월·20개국(5개국 4조 → 8강)·한국은 도쿄 조로 가정 ⚠' : '4년 주기·3월 개최 가정 ⚠', ok: false });
    for (let y = 2030; y <= 2070; y += 4) ev.push({ id: 'ag_' + y, kind: 'AG', y, name: `${y} 아시안게임`, size: 24, phase: 'off', src: y === 2030 ? '2030 도하 아시안게임(11/4~19) — 야구 채택은 미확인 ⚠, 선발 규정은 2026년과 같다고 가정' : '4년 주기·야구 채택·11월 개최 가정 ⚠', ok: false });
    return ev.sort((a, b) => a.y - b.y || ({ pre: 0, season: 1, off: 2 }[a.phase] - { pre: 0, season: 1, off: 2 }[b.phase]));
  };
  proto.intlEvents = function () { return EVENTS(); };
  proto._intl = function () { const S = this.S; return S.intl || (S.intl = { hist: [], olyQ: false, base: null, cur: null }); };
  const grpOf = p => p.type === 'P' ? 'P' : p.pos === 'C' ? 'C' : ['LF', 'CF', 'RF'].includes(p.pos) ? 'OF' : 'IF';
  /* 대표 선발(KBO 전력강화위원회 역할): 포지션별 WAR 상위. 아시안게임은 나이·연차 제한 + 와일드카드 3명 */
  proto.intlPick = function (ev) {
    const S = this.S, N = ev.size, nP = N >= 30 ? 15 : N >= 28 ? 13 : 11, nC = 2, rest = N - nP - nC, nIF = Math.ceil(rest * 0.55), nOF = rest - nIF;
    const pool = Object.values(S.players).filter(p => !p.foreign && !p.retired && (p.team in S.teams || p.team === 'MIL' || p.team === 'FA') && !this.isInj(p) && p.age >= 18);
    const young = p => ev.kind !== 'AG' || p.age <= 25 || (p.dh && p.dh.y && ev.y - p.dh.y + 1 <= 4) || (p.rookie !== undefined && ev.y - p.rookie + 1 <= 4);
    const w = p => this.war(p), need = { P: nP, C: nC, IF: nIF, OF: nOF }, pick = [];
    for (const g of ['P', 'C', 'IF', 'OF']) pick.push(...pool.filter(p => grpOf(p) === g && young(p)).sort((a, b) => w(b) - w(a)).slice(0, need[g]));
    if (ev.kind === 'AG') {   // 와일드카드: 나이 제한 밖(만 29세 이하) 선수가 같은 포지션 최저 가치 선수보다 나으면 교체, 최대 3명
      const wc = pool.filter(p => !young(p) && p.age <= 29).sort((a, b) => w(b) - w(a)); let used = 0;
      for (const p of wc) { if (used >= 3) break; const g = grpOf(p), cur = pick.filter(q => grpOf(q) === g && !q._wc).sort((a, b) => w(a) - w(b))[0]; if (cur && w(p) > w(cur) + 0.3) { pick.splice(pick.indexOf(cur), 1, p); p._wc = true; used++; } }
      for (const p of pick) if (p._wc) { delete p._wc; p._wcTmp = 1; }
    }
    const ids = pick.map(p => p.id), wc = pick.filter(p => p._wcTmp).map(p => p.id); for (const p of pick) delete p._wcTmp;
    return { ids, wc };
  };
  proto._intlStrength = function (ids) { const S = this.S, ps = ids.map(id => S.players[id]).filter(Boolean), w = p => Math.max(0, this.war(p)); return ps.map(w).sort((a, b) => b - a).slice(0, 20).reduce((a, b) => a + b, 0); };
  proto._intlBase = function (kind) { const I = this._intl(), ag = kind === 'AG', k = ag ? 'baseAG' : 'base'; if (!I[k]) I[k] = Math.max(1, this._intlStrength(this.intlPick(ag ? { kind: 'AG', y: this.S.year, size: 24 } : { kind: 'P12', y: this.S.year, size: 28 }).ids)); return I[k]; };   // 기준 전력: 처음 열리는 대회 때 뽑을 수 있는 최강 대표(아시안게임은 나이 제한 대표끼리 따로)
  /* ---- 경기·대회 시뮬레이션 ---- */
  const winP = (a, b) => 1 / (1 + Math.pow(10, -(a - b) / 400));
  function game(r, A, B, R) {
    const aw = r.random() < winP(R[A], R[B]), w = 2 + Math.floor(r.random() * 7), l = Math.floor(r.random() * w);
    return { a: A, b: B, as: aw ? w : l, bs: aw ? l : w, win: aw ? A : B };
  }
  function rr(r, teams, R, stage, log) {   // 풀리그: 승수 → 득실차 → 전력 순
    const st = {}; for (const t of teams) st[t] = { w: 0, rd: 0 };
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) { const g = game(r, teams[i], teams[j], R); g.stage = stage; log.push(g); st[g.win].w++; st[g.a].rd += g.as - g.bs; st[g.b].rd += g.bs - g.as; }
    return teams.slice().sort((x, y) => st[y].w - st[x].w || st[y].rd - st[x].rd || R[y] - R[x]);
  }
  function ko(r, A, B, R, stage, log) { const g = game(r, A, B, R); g.stage = stage; log.push(g); return [g.win, g.win === A ? B : A]; }
  function snake(teams, R, n) { const s = teams.slice().sort((a, b) => R[b] - R[a]), g = Array.from({ length: n }, () => []); s.forEach((t, i) => { const k = Math.floor(i / n) % 2 ? n - 1 - (i % n) : i % n; g[k].push(t); }); return g; }
  function tourney(kind, r, R, field) {
    const log = [], place = {};
    if (kind === 'OQT') { rr(r, field, R, '풀리그', log).forEach((t, i) => { place[t] = i + 1; }); return { log, place }; }
    if (kind === 'WBC') {   // 20개국: 한국 조는 도쿄 조(일본·대만·호주·체코, 2026년 구성) 가정, 나머지는 전력 순 배치 → 조 2위까지 8강(교차) → 4강 → 결승(동메달전 없음)
      const tokyo = ['JPN', 'KOR', 'TPE', 'AUS', 'CZE'], others = snake(field.filter(t => !tokyo.includes(t)), R, 3), P = [tokyo].concat(others).map(g => rr(r, g, R, '1라운드', log));
      for (const g of P) g.slice(2).forEach(t => { place[t] = 9; });
      const qf = [[P[0][0], P[1][1]], [P[1][0], P[0][1]], [P[2][0], P[3][1]], [P[3][0], P[2][1]]].map(([a, b]) => { const [w, l] = ko(r, a, b, R, '8강', log); place[l] = 5; return w; });
      const [s1, l1] = ko(r, qf[0], qf[2], R, '4강', log), [s2, l2] = ko(r, qf[1], qf[3], R, '4강', log), [g1, g2] = ko(r, s1, s2, R, '결승', log);
      Object.assign(place, { [g1]: 1, [g2]: 2, [l1]: 3, [l2]: 3 }); return { log, place };
    }
    if (kind === 'OLY') {
      const [A, B] = snake(field, R, 2).map(g => rr(r, g, R, '조별리그', log));
      const [q1] = ko(r, A[1], B[2], R, '준결승 진출전', log), [q2] = ko(r, B[1], A[2], R, '준결승 진출전', log);
      for (const t of [A[1], A[2], B[1], B[2]]) if (t !== q1 && t !== q2) place[t] = 5;
      const [s1, l1] = ko(r, A[0], q1, R, '준결승', log), [s2, l2] = ko(r, B[0], q2, R, '준결승', log), [g1, g2] = ko(r, s1, s2, R, '결승', log), [b3, b4] = ko(r, l1, l2, R, '동메달 결정전', log);
      Object.assign(place, { [g1]: 1, [g2]: 2, [b3]: 3, [b4]: 4 }); return { log, place };
    }
    // P12(16개국: 4조 → 2조 → 슈퍼라운드) · AG(8개국: 2조 → 슈퍼라운드)
    let groups = snake(field, R, kind === 'P12' ? 4 : 2).map(g => rr(r, g, R, '1라운드', log)); let adv = [];
    for (const g of groups) { adv.push(g[0], g[1]); g.slice(2).forEach(t => { place[t] = kind === 'P12' ? 9 : 5; }); }
    if (kind === 'P12') { const g2 = snake(adv, R, 2).map(g => rr(r, g, R, '2라운드', log)); adv = []; for (const g of g2) { adv.push(g[0], g[1]); g.slice(2).forEach(t => { place[t] = 5; }); } }
    const sr = rr(r, adv, R, '슈퍼라운드', log), [g1, g2] = ko(r, sr[0], sr[1], R, '결승', log), [b3, b4] = ko(r, sr[2], sr[3], R, '동메달 결정전', log);
    Object.assign(place, { [g1]: 1, [g2]: 2, [b3]: 3, [b4]: 4 }); return { log, place };
  }
  const MEDAL = { 1: '금메달', 2: '은메달', 3: '동메달' }, WBC_RES = { 1: '우승', 2: '준우승', 3: '4강', 5: '8강', 9: '1라운드 탈락' };
  proto._intlField = function (ev) {
    const I = this._intl();
    if (ev.kind === 'P12') return ['KOR', 'JPN', 'USA', 'DOM', 'VEN', 'PUR', 'MEX', 'TPE', 'CUB', 'NED', 'PAN', 'AUS', 'CAN', 'ITA', 'COL', 'CZE'];
    if (ev.kind === 'WBC') return ['JPN', 'KOR', 'TPE', 'AUS', 'CZE', 'USA', 'DOM', 'VEN', 'PUR', 'MEX', 'CUB', 'NED', 'PAN', 'CAN', 'ITA', 'COL', 'ISR', 'GBR', 'NCA', 'CHN'];
    if (ev.kind === 'OQT') return ['KOR', 'TPE', 'JPN', 'CUB', 'PUR', 'MEX', 'AUS', 'NED'].filter(t => !(I.olyField || []).includes(t)).slice(0, 6);
    if (ev.kind === 'OLY') { const f = (I.olyField || []).filter(Boolean).slice(0, 6); for (const t of ['JPN', 'TPE', 'CUB', 'PUR', 'MEX', 'NED', 'AUS']) { if (f.length >= 6) break; if (!f.includes(t)) f.push(t); } return f; }   // 최종예선을 치르지 않았으면(한국 직행) 나머지 자리는 전력 순으로 채움(⚠)
    return ['KOR', 'TPE', 'JPN', 'CHN', 'HKG', 'PHI', 'THA', 'PAK'];
  };
  /* 대회 진행: 선발 → 시뮬레이션 → 결과 기록·특례 */
  proto._intlRun = function (ev, roster) {
    const S = this.S, I = this._intl(), r = rngFor(S.seed, ev.y, 4242, ev.kind.length), sel = roster || this.intlPick(ev), str = this._intlStrength(sel.ids), base = this._intlBase(ev.kind);
    const R = Object.assign({}, ELO, ev.kind === 'AG' ? ELO_AG : ev.kind === 'P12' || ev.kind === 'OQT' ? ELO_NOMLB : {}), kor = Math.round(KOR0 + KOR_K * (str / base - 1)); R.KOR = kor;
    const field = this._intlField(ev); if (!field.includes('KOR')) { const h = { id: ev.id, name: ev.name, y: ev.y, kind: ev.kind, out: true, note: '본선 진출 실패' }; I.hist.unshift(h); this._lnews(`${ev.name}: 한국은 본선 진출권을 얻지 못했습니다.`); return h; }
    const T = tourney(ev.kind, r, R, field), pl = T.place.KOR, games = T.log.filter(g => g.a === 'KOR' || g.b === 'KOR').map(g => ({ st: g.stage, opp: g.a === 'KOR' ? g.b : g.a, ks: g.a === 'KOR' ? g.as : g.bs, os: g.a === 'KOR' ? g.bs : g.as }));
    const h = { id: ev.id, name: ev.name, y: ev.y, kind: ev.kind, ids: sel.ids, wc: sel.wc || [], kor, str: Math.round(str * 10) / 10, games, place: pl, medal: ev.kind === 'WBC' ? (pl <= 2 ? WBC_RES[pl] : null) : MEDAL[pl] || null, res: ev.kind === 'WBC' ? WBC_RES[pl] : null, field, top: Object.keys(T.place).sort((a, b) => T.place[a] - T.place[b]).slice(0, 4), exempt: [] };
    if (ev.kind === 'P12') {   // LA 올림픽 출전권: 아시아 최상위 1개국 + 유럽·오세아니아 최상위 1개국(개최국 미국·2026 WBC 아메리카 상위 2개국은 별도 — 도미니카·베네수엘라로 가정 ⚠)
      const best = arr => arr.filter(t => T.place[t]).sort((a, b) => T.place[a] - T.place[b])[0]; const asia = best(ASIA), eu = best(EUOC);
      I.olyField = ['USA', 'DOM', 'VEN', asia, eu]; I.olyQ = asia === 'KOR'; h.oly = asia; h.note = I.olyQ ? 'LA 올림픽 본선 직행(아시아 최상위)' : `아시아 최상위는 ${NAT[asia]} — 한국은 최종예선으로`;
    }
    if (ev.kind === 'OQT') { const win = Object.keys(T.place).find(t => T.place[t] === 1); (I.olyField = I.olyField || ['USA', 'DOM', 'VEN', 'JPN', 'NED']).push(win); I.olyQ = win === 'KOR'; h.note = I.olyQ ? 'LA 올림픽 본선 진출(최종예선 1위)' : `최종예선 1위는 ${NAT[win]} — 올림픽 진출 실패`; }
    const ex = (ev.kind === 'OLY' && pl <= 3) || (ev.kind === 'AG' && pl === 1);
    if (ex) for (const id of sel.ids) { const p = S.players[id]; if (p && p.mil && ['pending', 'apply', 'sangmu27'].includes(p.mil.st)) { p.mil = { st: 'ag', how: `${ev.name} ${MEDAL[pl]}`, src: 'game', was: p.mil.st }; h.exempt.push(id); } }
    I.hist.unshift(h); if (I.hist.length > 20) I.hist.length = 20;
    const mine = sel.ids.map(id => S.players[id]).filter(p => p && (p.team === S.userTeam || p.milTeam === S.userTeam));
    this._lnews(`${ev.name}: 한국 ${h.res || h.medal || pl + '위'} (${games.filter(g => g.ks > g.os).length}승 ${games.filter(g => g.ks < g.os).length}패)${h.note ? ' · ' + h.note : ''}${h.exempt.length ? ` · 병역 특례 ${h.exempt.length}명` : ''}`);
    for (const p of mine) { const v = h.medal ? 2 : 1, cur = p.mood && S.day < p.mood.until ? p.mood.v : 0; if (v > cur) p.mood = { v, until: (S.day || 0) + 20 }; }   // 우리 구단 대표 선수: 컨디션 상승(메달이면 더 크게)
    if (this._front && (h.medal || (ev.kind !== 'OLY' && I.olyQ && ev.kind !== 'AG'))) {
      const star = sel.ids.map(id => S.players[id]).filter(Boolean).sort((a, b) => this.war(b) - this.war(a)).find(p => mine.includes(p)) || null;
      this._front('intl', { head: h.medal ? `한국 야구, ${ev.name} ${h.medal}!` : `한국 야구, LA 올림픽 간다`, sub: h.note || `${games.length}경기 ${games.filter(g => g.ks > g.os).length}승`, pid: star ? star.id : null, facts: [mine.length ? `우리 구단 대표: ${mine.map(p => p.ko).join(', ')}` : '', h.exempt.length ? `병역 특례 ${h.exempt.length}명${h.exempt.filter(id => mine.some(p => p.id === id)).length ? ' (우리 구단 ' + h.exempt.filter(id => mine.some(p => p.id === id)).length + '명)' : ''}` : '', games.length ? `결승·주요 경기: ${games.slice(-2).map(g => `${NAT[g.opp]} ${g.ks}-${g.os}`).join(' · ')}` : ''] });
    }
    return h;
  };
  /* ---- 일정 연결 ---- */
  proto._intlOffseason = function () {   // 포스트시즌 뒤(11월): 프리미어12·아시안게임
    const S = this.S; for (const ev of EVENTS().filter(e => e.phase === 'off' && e.y === S.year)) if (!this._intl().hist.some(h => h.id === ev.id)) { this._intlAnnounce(ev); this._intlRun(ev); }
  };
  proto._intlPreseason = function () {   // 새 시즌 직전(3월): WBC·올림픽 최종예선
    const S = this.S, I = this._intl(); for (const ev of EVENTS().filter(e => e.phase === 'pre' && e.y === S.year)) if (!I.hist.some(h => h.id === ev.id) && (ev.kind !== 'OQT' || (I.olyField && !I.olyQ))) { this._intlAnnounce(ev); this._intlRun(ev); }   // 3월: WBC(가정)·올림픽 최종예선(직행 실패 시)
  };
  proto._intlAnnounce = function (ev, sel) {
    const S = this.S, s = sel || this.intlPick(ev), mine = s.ids.map(id => S.players[id]).filter(p => p && (p.team === S.userTeam || p.milTeam === S.userTeam));
    this._lnews(`${ev.name} 대표팀 ${s.ids.length}명 발표${mine.length ? ` — 우리 구단: ${mine.map(p => p.ko).join(', ')}` : ''}${s.wc && s.wc.length ? ` (와일드카드 ${s.wc.map(id => S.players[id].ko).join('·')})` : ''}`);
    return s;
  };
  const dN = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 864e5);
  proto._intlDay = function () {   // 시즌 중 대회(올림픽): 발표 → 소집(소속팀 결장) → 대회 → 복귀
    const S = this.S, I = this._intl(), now = this.todayN();
    for (const ev of EVENTS().filter(e => e.phase === 'season' && e.y === S.year)) {
      if (I.hist.some(h => h.id === ev.id)) continue;
      if (ev.kind === 'OLY' && !I.olyQ) { if (I.olyField && now >= dN(ev.y, ev.camp[0], ev.camp[1])) this._intlRun(ev); continue; }
      if (!I.cur && now >= dN(ev.y, ev.ann[0], ev.ann[1])) I.cur = { id: ev.id, sel: this._intlAnnounce(ev), camp: false };
      const c = I.cur; if (!c || c.id !== ev.id) continue;
      if (!c.camp && now >= dN(ev.y, ev.camp[0], ev.camp[1])) {   // 소집: 부상·이탈 선수는 같은 포지션 대체 선발
        const pk = this.intlPick(ev), keep = c.sel.ids.filter(id => S.players[id] && !this.isInj(S.players[id]) && !S.players[id].retired), g = id => grpOf(S.players[id]);
        for (const id of c.sel.ids) if (!keep.includes(id)) { const rep = pk.ids.find(x => !keep.includes(x) && S.players[x] && g(x) === (S.players[id] ? g(id) : 'P')); if (rep) keep.push(rep); }
        c.sel = { ids: keep, wc: c.sel.wc || [] }; c.camp = true; this._intlAway(c.sel.ids, dN(ev.y, ev.back[0], ev.back[1]), ev.name);
      }
      if (c.camp && now >= dN(ev.y, ev.back[0], ev.back[1]) - 2) { this._intlRun(ev, c.sel); I.cur = null; }
    }
  };
  proto._intlAway = function (ids, retN, name) {   // 소속팀 결장(부상 구조를 빌려 씀: natl 표시, 기존 부상 기록은 보관 후 복원)
    const S = this.S, out = {};
    for (const id of ids) { const p = S.players[id]; if (!p || !(p.team in S.teams)) continue; if (p.inj) p.injPrev = p.inj; p.inj = { dx: `${name} 대표 차출`, since: `${S.year} 소집`, ret: new Date(retN * 864e5).toISOString().slice(0, 10), retN, basis: '국가대표 소집', apply: true, generated: false, natl: true }; if (p.active) { p.active = false; (out[p.team] = out[p.team] || []).push(p); } }
    for (const t in out) {
      if (t === S.userTeam) { if (this._injAutoFix && this.injAuto && this.injAuto() !== 'off') this._injAutoFix(out[t], []); this.ensureActive(t); this.repairSettings(t); }
      else { this.autoActive(t); this.assignUsage(t); this.assignUsage(t, true); }
      this._engDirty = true; this._f2dirty = true;
    }
    this.invalidate();
  };
  proto.intlSummary = function () {
    const S = this.S, I = this._intl(), hist = I.hist.map(h => Object.assign({}, h, { players: (h.ids || []).map(id => S.players[id]).filter(Boolean) }));
    const next = EVENTS().filter(e => e.y >= S.year && !I.hist.some(h => h.id === e.id) && !(e.kind === 'OQT' && I.olyQ)).slice(0, 4).map(e => Object.assign({}, e, { cond: e.kind === 'OQT' ? '프리미어12 직행 실패 시' : e.kind === 'OLY' && !I.olyQ ? '출전권 획득 시' : '' }));   // 최종예선은 직행하면 열리지 않음
    return { hist, next, olyQ: I.olyQ, olyField: I.olyField || null, cur: I.cur, nat: NAT };
  };
  proto.intlCaps = function (p) { return this._intl().hist.filter(h => (h.ids || []).includes(p.id)).map(h => ({ y: h.y, name: h.name, medal: h.medal, place: h.place, ex: (h.exempt || []).includes(p.id) })); };
});
