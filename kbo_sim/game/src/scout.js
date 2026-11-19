/* KBO 감독 모드: 스카우팅 (후보 풀 사전 공개 · 스카우트 고용 · 주간 관찰 · 추정 범위 · 리포트 · 빅보드)
 * 원칙: 선수의 진짜 능력(숨은 정점 peak, 현재 능력치)과 성장 규칙은 바꾸지 않는다. 스카우팅은 '내가 아는 추정치'의 오차만 줄인다.
 *   - 기본 추정(관찰 없음) = 기존 `p.scout`(능력 σ=3, 성장 상한 σ=16) 그대로 → 스카우팅을 쓰지 않으면 기존과 같다. AI 구단의 지명 기준도 그대로.
 *   - 관찰 1건 = 스카우트 한 명의 측정값: 성장 상한 측정 = peak + (스카우트×선수 고정 편향 N(0,7²)) + 관찰 잡음 N(0,σe²), σe = 16 − 0.17×(능력−40), 7~16.
 *     같은 스카우트가 여러 번 봐도 편향은 줄지 않으므로 추정 오차에 바닥이 있다(스카우트 1명 ≈ 6~7, 3명 ≈ 4). 여러 스카우트가 보면 편향이 평균화된다.
 *   - 추정치 = 기본 추정과 스카우트별 측정 평균을 정밀도(1/분산)로 가중 평균한 값. 모든 난수는 시드·연도·선수·스카우트·주차로 고정(같은 입력 → 같은 결과).
 * 후보 선수는 이 게임이 만든 가상 선수다(출신 학교 표기는 분위기용).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { League, rngFor, clamp } = LG;
  const proto = League.prototype;
  const r1 = v => Math.round(v * 10) / 10;
  const idn = id => parseInt(String(id).replace(/\D/g, '')) || 0;
  const gauss = (r, m, s) => { let u = 0, v = 0; while (u === 0) u = r.random(); while (v === 0) v = r.random(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const SD0_C = 16, SD0_O = 3, BIAS_C = 7, BIAS_O = 1.5, SE_O = 2.5, SCOUT_MAX = 3, POOL_N = 120, WATCH_MAX = 24;
  const HS = ['경남고', '광주제일고', '대구상원고', '부산고', '성남고', '북일고', '장충고', '덕수고', '휘문고', '유신고', '세광고', '충암고', '인천고', '청주고', '마산용마고', '전주고', '대전고', '배재고', '충훈고', '경기고'];
  const UNIV = ['고려대', '연세대', '한양대', '동국대', '성균관대', '건국대', '동의대', '경성대', '경희대', '단국대'];
  const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'], GIV = ['동수', '성호', '재훈', '병철', '상민', '태영', '영철', '기석', '준호', '승환', '대환', '철민', '용식', '정훈', '현수', '무성'];

  /* ---------------- 후보 풀 ---------------- */
  proto.ensureProspects = function () {
    const S = this.S; if (S.prospectsDone === S.year) return null;
    if (S.prospects && S.prospects.y === S.year) return S.prospects;
    if (S.prospects && S.prospects.ids) for (const id of S.prospects.ids) { const p = S.players[id]; if (p && p.team === 'DRAFT') { p.retired = true; p.team = 'RET'; } }   // 지난 시즌 후보 중 미지명자 정리
    const r = rngFor(S.seed, S.year, 41), r2 = rngFor(S.seed, S.year, 7200), ids = [];   // 41번 난수열은 이전 버전의 드래프트 후보 생성과 같다
    for (let i = 0; i < POOL_N; i++) { const p = this.makeRookie(r, i % 2 === 0 ? 'B' : 'P'); const univ = p.age >= 21; p.pro = { school: univ ? UNIV[Math.floor(r2.random() * UNIV.length)] : HS[Math.floor(r2.random() * HS.length)], univ }; ids.push(p.id); }
    S.prospects = { y: S.year, ids }; this._scoutMarket(); return S.prospects;
  };
  proto.prospectList = function () { const pr = this.ensureProspects(); return pr ? pr.ids.map(id => this.S.players[id]).filter(p => p && p.team === 'DRAFT') : []; };

  /* ---------------- 스카우트 고용 ---------------- */
  proto._scoutMarket = function () {
    const S = this.S, r = rngFor(S.seed, S.year, 7300), out = [];
    for (let i = 0; i < 6; i++) {
      const name = SUR[Math.floor(r.random() * SUR.length)] + GIV[Math.floor(r.random() * GIV.length)], hi = r.random() < 0.5;
      const high = clamp(Math.round(gauss(r, 48 + (hi ? 8 : -2), 10)), 30, 82), univ = clamp(Math.round(gauss(r, 48 + (hi ? -2 : 8), 10)), 30, 82);
      out.push({ id: `SC${S.year}-${i + 1}`, name, age: 40 + Math.floor(r.random() * 22), high, univ, salary: this._scoutSalary(high, univ) });
    }
    S.scoutMkt = out;
  };
  proto._scoutSalary = function (h, u) { return Math.round(clamp(0.5 + 0.04 * ((h + u) / 2 - 40), 0.5, 2.5) * 10) / 10; };
  proto.scoutLimit = function () { return SCOUT_MAX; };
  proto.scoutCap = function (s) { return clamp(3 + Math.floor(((s.high + s.univ) / 2 - 50) / 10), 2, 6); };   // 한 스카우트의 주간 관찰 수
  proto.scouts = function () { return (this.S.scouts || []).slice(); };
  proto.scoutPay = function (t) { const S = this.S; return t === S.userTeam ? Math.round((S.scouts || []).reduce((a, s) => a + s.salary, 0) * 10) / 10 : 0; };
  proto.scoutHire = function (id) {
    const S = this.S; this.ensureProspects(); const c = (S.scoutMkt || []).find(x => x.id === id); if (!c) return '영입할 수 없는 스카우트입니다.';
    S.scouts = S.scouts || []; if (S.scouts.length >= SCOUT_MAX) return `스카우트는 ${SCOUT_MAX}명까지 둘 수 있습니다.`;
    const room = this.faRoom(S.userTeam); if (room < c.salary) return `예산 부족: 연봉 ${c.salary}억이 FA 여유자금 ${room.toFixed(1)}억을 넘습니다.`;
    S.scouts.push({ id: c.id, name: c.name, age: c.age, high: c.high, univ: c.univ, salary: c.salary, y: S.year }); S.scoutMkt = S.scoutMkt.filter(x => x.id !== id); this.invalidate();
    this._scoutNews(`스카우트 영입: ${c.name}(고교 ${c.high} · 대학 ${c.univ}) 연봉 ${c.salary}억`); return null;
  };
  proto.scoutFire = function (id) {
    const S = this.S, n = (S.scouts || []).length; S.scouts = (S.scouts || []).filter(s => s.id !== id); if (S.scouts.length === n) return '해임할 수 없습니다.'; this.invalidate(); return null;   // 이미 얻은 관찰 정보는 남는다
  };
  proto._scoutNews = function (text) { const S = this.S; S.news.unshift({ year: S.year, day: S.day, text }); if (S.news.length > 120) S.news.length = 120; if (this._storyFromNews) this.story('scout', text, 1); };

  /* ---------------- 관심 목록 ---------------- */
  proto.scoutWatchList = function () { const S = this.S; return (S.scWatch || []).filter(w => S.players[w.id] && S.players[w.id].team === 'DRAFT'); };
  proto.scoutWatch = function (id) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== 'DRAFT') return '관찰할 수 있는 후보가 아닙니다.'; S.scWatch = this.scoutWatchList(); const i = S.scWatch.findIndex(w => w.id === id);
    if (i >= 0) { S.scWatch.splice(i, 1); return null; } if (S.scWatch.length >= WATCH_MAX) return `관심 목록은 ${WATCH_MAX}명까지입니다.`; S.scWatch.push({ id, star: false }); return null;
  };
  proto.scoutStar = function (id) { const w = this.scoutWatchList().find(x => x.id === id); if (!w) return '관심 목록에 없습니다.'; w.star = !w.star; this.S.scWatch = this.scoutWatchList(); return null; };
  proto.scoutAutoWatch = function (n) {   // 상한이 높게 보이면서 아직 불확실한 후보부터 채운다
    const S = this.S; S.scWatch = this.scoutWatchList(); const have = new Set(S.scWatch.map(w => w.id)); n = n || 10;
    const c = this.prospectList().filter(p => !have.has(p.id)).map(p => { const e = this.scoutEst(p); return { p, v: e.ceil + 0.8 * e.ceilSd }; }).sort((a, b) => b.v - a.v);
    let added = 0; for (const x of c) { if (S.scWatch.length >= WATCH_MAX || added >= n) break; S.scWatch.push({ id: x.p.id, star: false }); added++; } return added;
  };

  /* ---------------- 추정치 ---------------- */
  const tier = v => v >= 68 ? 'A' : v >= 57 ? 'B' : v >= 48 ? 'C' : v >= 38 ? 'D' : 'E';
  proto.scoutTier = tier;
  proto.scoutEst = function (p) {
    if (!p || !p.scout) return null; const sc = p.sc, by = sc ? sc.by : {};
    let pc = 1 / (SD0_C * SD0_C), nc = p.scout.ceil * pc, po = 1 / (SD0_O * SD0_O), no = p.scout.o * po, n = 0;
    for (const id of Object.keys(by)) { const b = by[id]; if (!b.n) continue; n += b.n;
      const vc = BIAS_C * BIAS_C + b.se * b.se / b.n, vo = BIAS_O * BIAS_O + SE_O * SE_O / b.n; pc += 1 / vc; nc += (b.mc / b.n) / vc; po += 1 / vo; no += (b.mo / b.n) / vo; }
    const ceil = clamp(nc / pc, 25, 85), ceilSd = Math.sqrt(1 / pc), o = no / po, oSd = Math.sqrt(1 / po);
    const conf = ceilSd >= 12 ? '낮음' : ceilSd >= 8 ? '보통' : '높음';
    return { o: r1(o), oSd: r1(oSd), ceil: r1(ceil), ceilSd: r1(ceilSd), n, conf, lo: tier(ceil - ceilSd), hi: tier(ceil + ceilSd), grade: tier(ceil), score: 0.35 * o + 0.65 * ceil };
  };
  proto.userScore = function (p) { if (!p.sc || !p.sc.by || !Object.keys(p.sc.by).length) return this.scoutScore(p); return this.scoutEst(p).score; };   // 관찰이 없으면 기존 점수 그대로

  /* ---------------- 주간 관찰 ---------------- */
  proto._scoutDay = function () { const S = this.S; if (S.phase !== 'regular' || !S.scouts || !S.scouts.length || !S.day || S.day % 7 !== 0) return; this._scoutWeek(); };
  proto._scoutObserve = function (id, sc, week, idx) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== 'DRAFT') return false; const rating = p.pro && p.pro.univ ? sc.univ : sc.high, se = clamp(16 - 0.17 * (rating - 40), 7, 16);
    const si = idn(sc.id), rb = rngFor(S.seed, S.year, idn(id) * 997 + si, 7410), bc = gauss(rb, 0, BIAS_C), bo = gauss(rb, 0, BIAS_O);   // 스카우트×선수 고정 편향
    const rn = rngFor(S.seed, S.year, idn(id) * 131 + week * 7 + idx, 7420 + si % 50);
    const mc = clamp(p.peak + bc + gauss(rn, 0, se), 20, 90), mo = this.ovr(p) + bo + gauss(rn, 0, SE_O);
    p.sc = p.sc || { by: {} }; const b = p.sc.by[sc.id] = p.sc.by[sc.id] || { n: 0, mc: 0, mo: 0, se: Math.round(se * 10) / 10 }; b.n++; b.mc += mc; b.mo += mo; b.se = Math.round(se * 10) / 10; p.sc.last = S.day;
    S.scoutObs = (S.scoutObs || 0) + 1; return true;
  };
  proto._scoutWeek = function () {
    const S = this.S, pr = S.prospects; if (!pr || pr.y !== S.year) return; const watch = this.scoutWatchList(); if (!watch.length) return;
    const order = []; for (const w of watch) { order.push(w.id); if (w.star) order.push(w.id); }
    const week = Math.floor(S.day / 7); let k = (S.scPtr || 0) % order.length, total = 0; const touched = new Set();   // 주마다 이어서 돌아가며 관찰(관심 목록이 많아도 골고루)
    (S.scouts || []).forEach((sc, si) => { const cap = this.scoutCap(sc); for (let i = 0; i < cap; i++) { const id = order[k % order.length]; k++; if (this._scoutObserve(id, sc, week, i)) { total++; touched.add(id); } } });
    S.scPtr = k % order.length;
    for (const id of touched) { const p = S.players[id], e = this.scoutEst(p); if (e.ceil >= 66 && e.ceilSd <= 9 && !p.sc.found) { p.sc.found = S.day; this._scoutNews(`스카우트 보고: ${p.ko}(${p.pro ? p.pro.school : ''}) — 성장 상한 ${e.grade}급 가능성(추정 ${e.ceil}±${e.ceilSd}, 확신도 ${e.conf})`); } }
    (S.scoutLog = S.scoutLog || []).unshift({ y: S.year, d: S.day, n: total, who: touched.size }); if (S.scoutLog.length > 20) S.scoutLog.pop();
  };

  /* ---------------- 리포트 ---------------- */
  proto.scoutReport = function (p) {
    const S = this.S, e = this.scoutEst(p); if (!e) return null; const sub = this.sub(p), keys = Object.keys(sub);
    const sd = 8 / Math.sqrt(1 + e.n), noisy = keys.map((k, i) => { const r = rngFor(S.seed, S.year, idn(p.id) * 17 + i, 7430); return [k, sub[k] + gauss(r, 0, sd)]; }), mean = noisy.reduce((a, x) => a + x[1], 0) / noisy.length;
    const sorted = noisy.slice().sort((a, b) => b[1] - a[1]);
    return { est: e, strengths: e.n >= 2 ? sorted.slice(0, 2).filter(x => x[1] >= mean + 2).map(x => x[0]) : [], weaknesses: e.n >= 2 ? sorted.slice(-1).filter(x => x[1] <= mean - 2).map(x => x[0]) : [], detail: e.n >= 2, hand: p.type === 'B' ? (p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타') : (p.throws === 'L' ? '좌투' : '우투'), school: p.pro ? p.pro.school : '', univ: !!(p.pro && p.pro.univ), by: Object.entries((p.sc && p.sc.by) || {}).map(([id, b]) => ({ id, n: b.n, name: ((S.scouts || []).find(s => s.id === id) || {}).name || '이전 스카우트' })) };
  };

  /* ---------------- 드래프트 연동 ---------------- */
  proto._scoutCarry = function (p) {   // 내가 지명한 선수는 스카우팅으로 얻은 추정치를 이후 평가의 출발점으로 삼는다
    const e = this.scoutEst(p); if (!e || !e.n) return; p.scout = { o: Math.round(e.o), ceil: e.ceil }; p.sc.carried = true;
  };
});
