/* KBO 감독 모드: 스카우팅 (후보 풀 사전 공개 · 스카우트 고용 · 주간 관찰 · 추정 범위 · 리포트 · 빅보드)
 * 원칙: 선수의 진짜 능력(숨은 정점 peak, 현재 능력치)과 성장 규칙은 바꾸지 않는다. 스카우팅은 '내가 아는 추정치'의 오차만 줄인다.
 *   - 기본 추정(관찰 없음) = 기존 `p.scout`(능력 σ=3, 성장 상한 σ=16) 그대로 → 스카우팅을 쓰지 않으면 기존과 같다. AI 구단의 지명 기준도 그대로.
 *   - 관찰 1건 = 스카우트 한 명의 측정값: 성장 상한 측정 = peak + (스카우트×선수 고정 편향 N(0,7²)) + 관찰 잡음 N(0,σe²), σe = 16 − 0.17×(능력−40), 7~16.
 *     같은 스카우트가 여러 번 봐도 편향은 줄지 않으므로 추정 오차에 바닥이 있다(스카우트 1명 ≈ 6~7, 3명 ≈ 4). 여러 스카우트가 보면 편향이 평균화된다.
 *   - 추정치 = 기본 추정과 스카우트별 측정 평균을 정밀도(1/분산)로 가중 평균한 값. 모든 난수는 시드·연도·선수·스카우트·주차로 고정(같은 입력 → 같은 결과).
 * 후보 선수는 이 게임이 만든 가상 선수다(출신 학교 표기는 분위기용).
 * 2단계: ① 내년 드래프트 후보(2년치)까지 미리 관찰(어린 후보는 관찰 잡음 ×1.25) ② 성격은 '인성 조사'로만 알 수 있음(스카우트 의견, 정확도 50~85%)
 *        ③ FA 시장의 가상 외국인·아시아쿼터는 능력이 불확실(조사로 오차 감소) ④ AI 구단은 재정 순위에 따라 스카우트 수준 격차(지명 추정이 진짜 값 쪽으로 5~35% 이동).
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
  proto._genClass = function (year) {   // 드래프트 후보 한 학년(120명). 난수열은 이전 버전의 드래프트 후보 생성과 같다
    const S = this.S, r = rngFor(S.seed, year, 41), r2 = rngFor(S.seed, year, 7200), ids = [];
    for (let i = 0; i < POOL_N; i++) { const p = this.makeRookie(r, i % 2 === 0 ? 'B' : 'P'); p.rookie = year + 1; const univ = p.age >= 21; p.pro = { school: univ ? UNIV[Math.floor(r2.random() * UNIV.length)] : HS[Math.floor(r2.random() * HS.length)], univ, cls: year === S.year ? 1 : 2 }; ids.push(p.id); }
    return { y: year, ids };
  };
  proto.ensureProspects = function () {
    const S = this.S; if (S.prospectsDone === S.year) { this._ensureClass2(); return null; }
    if (S.prospects && S.prospects.y === S.year) { this._ensureClass2(); this.ensureForeignPool(); return S.prospects; }
    if (S.prospects && S.prospects.ids) for (const id of S.prospects.ids) { const p = S.players[id]; if (p && p.team === 'DRAFT') { p.retired = true; p.team = 'RET'; } }   // 지난 시즌 후보 중 미지명자 정리
    if (S.prospects2 && S.prospects2.y === S.year) {   // 지난해 미리 공개한 '내년 후보'가 올해 후보가 된다(관찰 기록 유지)
      S.prospects = { y: S.year, ids: S.prospects2.ids.slice() }; S.prospects2 = null;
      for (const id of S.prospects.ids) { const p = S.players[id]; if (p) { p.rookie = S.year + 1; if (p.pro) p.pro.cls = 1; } }
    } else S.prospects = this._genClass(S.year);
    this._ensureClass2(); this._scoutMarket(); this.ensureForeignPool(); return S.prospects;
  };
  proto._ensureClass2 = function () { const S = this.S; if (!S.prospects2 || S.prospects2.y !== S.year + 1) S.prospects2 = this._genClass(S.year + 1); return S.prospects2; };
  proto.prospectList2 = function () { const pr = this._ensureClass2(); return pr.ids.map(id => this.S.players[id]).filter(p => p && p.team === 'DRAFT'); };
  proto.prospectList = function () { const pr = this.ensureProspects(); return pr ? pr.ids.map(id => this.S.players[id]).filter(p => p && p.team === 'DRAFT') : []; };
  proto.prospectAll = function () { return this.prospectList().concat(this.prospectList2()); };

  /* ---------------- 스카우트 고용 ---------------- */
  proto._scoutMarket = function () {
    const S = this.S, r = rngFor(S.seed, S.year, 7300), out = [];
    for (let i = 0; i < 6; i++) {
      const name = SUR[Math.floor(r.random() * SUR.length)] + GIV[Math.floor(r.random() * GIV.length)], hi = r.random() < 0.5, ab = r.random() < 0.25;
      const high = clamp(Math.round(gauss(r, 48 + (hi ? 8 : -2), 10)), 30, 82), univ = clamp(Math.round(gauss(r, 48 + (hi ? -2 : 8), 10)), 30, 82), abroad = clamp(Math.round(gauss(r, 40 + (ab ? 22 : 0), 9)), 25, 82);
      out.push({ id: `SC${S.year}-${i + 1}`, name, age: 40 + Math.floor(r.random() * 22), high, univ, abroad, salary: this._scoutSalary(high, univ, abroad) });
    }
    const ex = (S.hof || []).filter(h => h.y === S.year - 1 || h.y === S.year).slice(-1)[0];   // 우리 구단에서 은퇴한 헌액 선수가 있으면 스카우트 후보로 합류
    if (ex) { const rr = rngFor(S.seed, S.year, 7310), high = clamp(Math.round(gauss(rr, 60, 6)), 45, 80), univ = clamp(Math.round(gauss(rr, 60, 6)), 45, 80), abroad = clamp(Math.round(gauss(rr, 45, 8)), 30, 70); out[5] = { id: `SC${S.year}-EX`, name: ex.name, age: ex.age || 40, high, univ, abroad, salary: this._scoutSalary(high, univ, abroad), ex: true, tn: ex.tn }; }
    S.scoutMkt = out;
  };
  proto._scoutSalary = function (h, u, a) { return Math.round(clamp(0.5 + 0.04 * ((h + u) / 2 - 40) + 0.01 * ((a === undefined ? 50 : a) - 50), 0.5, 2.8) * 10) / 10; };
  proto.scoutLimit = function () { return SCOUT_MAX + (this.investSlots ? this.investSlots() : 0); };   // 스카우팅 센터 투자: 한도 +1~2
  proto.scoutCap = function (s) { return clamp(3 + Math.floor(((s.high + s.univ) / 2 - 50) / 10), 2, 6) + (this.investObs ? this.investObs() : 0); };   // 한 스카우트의 주간 관찰 수
  proto.scouts = function () { return (this.S.scouts || []).slice(); };
  proto.scoutPay = function (t) { const S = this.S; return t === S.userTeam ? Math.round((S.scouts || []).reduce((a, s) => a + s.salary, 0) * 10) / 10 : 0; };
  proto.scoutHire = function (id) {
    const S = this.S; this.ensureProspects(); const c = (S.scoutMkt || []).find(x => x.id === id); if (!c) return '영입할 수 없는 스카우트입니다.';
    S.scouts = S.scouts || []; if (S.scouts.length >= this.scoutLimit()) return `스카우트는 ${this.scoutLimit()}명까지 둘 수 있습니다.`;
    const room = this.faRoom(S.userTeam); if (room < c.salary) return `예산 부족: 연봉 ${c.salary}억이 FA 여유자금 ${room.toFixed(1)}억을 넘습니다.`;
    S.scouts.push({ id: c.id, name: c.name, age: c.age, high: c.high, univ: c.univ, abroad: c.abroad === undefined ? 45 : c.abroad, salary: c.salary, y: S.year, ex: !!c.ex }); S.scoutMkt = S.scoutMkt.filter(x => x.id !== id); this.invalidate();
    this._scoutNews(`스카우트 영입: ${c.name}${c.ex ? '(은퇴 선수 출신)' : ''}(고교 ${c.high} · 대학 ${c.univ} · 해외 ${c.abroad === undefined ? 45 : c.abroad}) 연봉 ${c.salary}억`); return null;
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
  proto.scoutAutoWatch = function (n, cls) {   // 상한이 높게 보이면서 아직 불확실한 후보부터 채운다
    const S = this.S; S.scWatch = this.scoutWatchList(); const have = new Set(S.scWatch.map(w => w.id)); n = n || 10;
    const c = (cls === 2 ? this.prospectList2() : cls === 1 ? this.prospectList() : this.prospectAll()).filter(p => !have.has(p.id)).map(p => { const e = this.scoutEst(p); return { p, v: e.ceil + 0.8 * e.ceilSd }; }).sort((a, b) => b.v - a.v);
    let added = 0; for (const x of c) { if (S.scWatch.length >= WATCH_MAX || added >= n) break; S.scWatch.push({ id: x.p.id, star: false }); added++; } return added;
  };

  /* ---------------- 추정치 ---------------- */
  const tier = v => v >= 68 ? 'A' : v >= 57 ? 'B' : v >= 48 ? 'C' : v >= 38 ? 'D' : 'E';
  proto.scoutTier = tier;
  proto.scoutEst = function (p) {
    if (!p || !p.scout) return null; const sc = p.sc, by = sc ? sc.by : {};
    let pc = 1 / (SD0_C * SD0_C), nc = p.scout.ceil * pc, po = 1 / (SD0_O * SD0_O), no = p.scout.o * po, n = 0;
    for (const id of Object.keys(by)) { const b = by[id]; if (!b.n) continue; n += b.n;
      const se2 = b.v2 !== undefined ? b.v2 / b.n : b.se * b.se, vc = BIAS_C * BIAS_C + se2 / b.n, vo = BIAS_O * BIAS_O + SE_O * SE_O / b.n; pc += 1 / vc; nc += (b.mc / b.n) / vc; po += 1 / vo; no += (b.mo / b.n) / vo; }
    const ceil = clamp(nc / pc, 25, 85), ceilSd = Math.sqrt(1 / pc), o = no / po, oSd = Math.sqrt(1 / po);
    const conf = ceilSd >= 12 ? '낮음' : ceilSd >= 8 ? '보통' : '높음';
    return { o: r1(o), oSd: r1(oSd), ceil: r1(ceil), ceilSd: r1(ceilSd), n, conf, lo: tier(ceil - ceilSd), hi: tier(ceil + ceilSd), grade: tier(ceil), score: 0.35 * o + 0.65 * ceil };
  };
  proto.userScore = function (p) { if (!p.sc || !p.sc.by || !Object.keys(p.sc.by).length) return this.scoutScore(p); return this.scoutEst(p).score; };   // 관찰이 없으면 기존 점수 그대로

  /* ---------------- 주간 관찰 ---------------- */
  proto._scoutDay = function () { const S = this.S; if (this._subDay) this._subDay(); if (S.phase !== 'regular' || !S.scouts || !S.scouts.length || !S.day || S.day % 7 !== 0) return; this._scoutWeek(); S.scoutObs = (S.scoutObs || 0) + this._scoutWeekForeign(); };
  proto._scoutObserve = function (id, sc, week, idx) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== 'DRAFT') return false; const rating = p.pro && p.pro.univ ? sc.univ : sc.high, se = clamp(16 - 0.17 * (rating - 40), 7, 16) * (p.pro && p.pro.cls === 2 ? 1.25 : 1);   // 내년 후보는 더 어려서 관찰 잡음 ×1.25
    const si = idn(sc.id), rb = rngFor(S.seed, S.year, idn(id) * 997 + si, 7410), bc = gauss(rb, 0, BIAS_C), bo = gauss(rb, 0, BIAS_O);   // 스카우트×선수 고정 편향
    const rn = rngFor(S.seed, S.year, idn(id) * 131 + week * 7 + idx, 7420 + si % 50);
    const mc = clamp(p.peak + bc + gauss(rn, 0, se), 20, 90), mo = this.ovr(p) + bo + gauss(rn, 0, SE_O);
    p.sc = p.sc || { by: {} }; const b = p.sc.by[sc.id] = p.sc.by[sc.id] || { n: 0, mc: 0, mo: 0, se: Math.round(se * 10) / 10 }; if (b.v2 === undefined) b.v2 = b.n * b.se * b.se; b.n++; b.mc += mc; b.mo += mo; b.v2 += se * se; b.se = Math.round(se * 10) / 10; p.sc.last = S.day;
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
    return { est: e, strengths: e.n >= 2 ? sorted.slice(0, 2).filter(x => x[1] >= mean + 2).map(x => x[0]) : [], weaknesses: e.n >= 2 ? sorted.slice(-1).filter(x => x[1] <= mean - 2).map(x => x[0]) : [], detail: e.n >= 2, hand: p.type === 'B' ? (p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타') : (p.throws === 'L' ? '좌투' : '우투'), school: p.pro ? p.pro.school : '', univ: !!(p.pro && p.pro.univ), by: Object.entries((p.sc && p.sc.by) || {}).map(([id, b]) => ({ id, n: b.n, name: ((S.scouts || []).find(s => s.id === id) || {}).name || '이전 스카우트' })), trait: this.scoutTraitView(p), cls: p.pro ? p.pro.cls : 1 };
  };

  /* ---------------- 드래프트 연동 ---------------- */
  proto._scoutCarry = function (p) {   // 내가 지명한 선수는 스카우팅으로 얻은 추정치를 이후 평가의 출발점으로 삼는다
    if (p.sc && p.sc.tr && Object.keys(p.sc.tr).length) { const truth = this.traitOf(p), ops = Object.values(p.sc.tr), hit = ops.filter(o => o.t === truth).length; this._scoutNews(`인성 조사 결과 확인: ${p.ko}의 실제 성격은 ${this.traitName(truth)} — 스카우트 의견 ${ops.length}건 중 ${hit}건 일치`); }
    const e = this.scoutEst(p); if (!e || !e.n) return; p.scout = { o: Math.round(e.o), ceil: e.ceil }; p.sc.carried = true;
  };

  /* ---------------- 성격 정보: 인성 조사 ---------------- */
  const TRAIT_KEYS = ['clutch', 'model', 'free', 'leader', 'shy'], PROBE_COST = 0.3, FSD0 = 6, FBIAS = 3;
  proto.scoutProbeCost = function () { return PROBE_COST; };
  const spend = function (L, cost) {   // 스카우팅 조사비는 새 시즌 행사 비용(evCost)로 계상
    const S = L.S, f = S.fin && S.fin.teams && S.fin.teams[S.userTeam]; if (!f) return '재정 정보가 없습니다.'; const room = L.faRoom(S.userTeam); if (room < cost) return `예산 부족: 조사비 ${cost}억이 FA 여유자금 ${room.toFixed(1)}억을 넘습니다.`;
    f.evCost = Math.round(((f.evCost || 0) + cost) * 10) / 10; return null;
  };
  proto.scoutProbe = function (id, scoutId) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== 'DRAFT') return '조사할 수 있는 후보가 아닙니다.'; const sc = (S.scouts || []).find(x => x.id === scoutId); if (!sc) return '조사를 맡을 스카우트를 고르세요.';
    p.sc = p.sc || { by: {} }; p.sc.tr = p.sc.tr || {}; if (p.sc.tr[scoutId]) return '이 스카우트가 이미 조사했습니다.';
    const bad = spend(this, PROBE_COST); if (bad) return bad;
    const truth = this.traitOf(p), rating = p.pro && p.pro.univ ? sc.univ : sc.high, acc = clamp(0.5 + 0.005 * (rating - 40), 0.5, 0.85), r = rngFor(S.seed, S.year, idn(id) * 53 + idn(scoutId) % 997, 7510);
    let rep = truth; if (r.random() >= acc) { const others = TRAIT_KEYS.filter(k => k !== truth); rep = others[Math.floor(r.random() * others.length)]; }
    p.sc.tr[scoutId] = { t: rep, acc: Math.round(acc * 100) / 100 }; return null;
  };
  proto.scoutTraitView = function (p) {
    const op = Object.entries((p.sc && p.sc.tr) || {}); if (!op.length) return { known: false };
    const S = this.S, cnt = {}; for (const [, o] of op) cnt[o.t] = (cnt[o.t] || 0) + 1; const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]), split = top.length > 1 && top[0][1] === top[1][1];
    const conf = split ? '엇갈림' : op.length >= 2 && top.length === 1 ? '높음' : op.length === 1 && op[0][1].acc >= 0.75 ? '보통' : op.length >= 2 ? '보통' : '낮음';
    return { known: true, trait: split ? null : top[0][0], label: split ? '불분명' : this.traitName(top[0][0]), n: op.length, conf, split, opinions: op.map(([id, o]) => ({ name: ((S.scouts || []).find(x => x.id === id) || {}).name || '이전 스카우트', t: o.t, label: this.traitName(o.t), acc: o.acc })) };
  };

  /* ---------------- 외국인 스카우팅 ---------------- */
  proto.hiddenForeign = function (p) { return !!(p && p.foreign && p.virtual && (p.team === 'FA' || p.fpool)); };   // 가상 능력치 외국인(KBO 기록 없음)이 FA 시장에 있는 동안은 능력이 불확실
  proto.fEst = function (p) {
    if (!this.hiddenForeign(p)) return { exact: true, o: this.ovr(p), sd: 0, n: 0 };
    const S = this.S; if (!p.fsc) p.fsc = { o: Math.round(this.ovr(p) + gauss(rngFor(S.seed, 0, idn(p.id), 7500), 0, FSD0)), by: {} };
    let prec = 1 / (FSD0 * FSD0), num = p.fsc.o * prec, n = 0;
    for (const id of Object.keys(p.fsc.by)) { const b = p.fsc.by[id]; if (!b.n) continue; n += b.n; const se2 = b.v2 !== undefined ? b.v2 / b.n : b.se * b.se, v = FBIAS * FBIAS + se2 / b.n; prec += 1 / v; num += (b.m / b.n) / v; }
    const o = num / prec, sd = Math.sqrt(1 / prec); return { exact: false, o: r1(o), sd: r1(sd), n, conf: sd >= 5 ? '낮음' : sd >= 3.5 ? '보통' : '높음' };
  };
  proto._fObs = function (p, sc, seMul, idx, manual) {   // 외국인 후보 1회 관찰: 진짜 능력 + 스카우트×선수 고정 편향 + 관찰 잡음
    const S = this.S; this.fEst(p); const ab = sc.abroad === undefined ? 45 : sc.abroad, se = clamp(8 - 0.07 * (ab - 40), 3, 8) * seMul, si = idn(sc.id) % 997;
    const bias = gauss(rngFor(S.seed, 0, idn(p.id) * 29 + si, 7525), 0, FBIAS), noise = gauss(rngFor(S.seed, S.year, idn(p.id) * 31 + si * 7 + idx, 7520), 0, se);
    const b = p.fsc.by[sc.id] = p.fsc.by[sc.id] || { n: 0, m: 0, se: Math.round(se * 10) / 10 }; if (b.v2 === undefined) b.v2 = b.n * b.se * b.se; b.n++; b.m += this.ovr(p) + bias + noise; b.v2 += se * se; b.se = Math.round(se * 10) / 10; if (manual) b.manual = true; return true;
  };
  proto.scoutForeign = function (id, scoutId) {   // 집중 조사(조사비 0.3억, 스카우트별 1회): 일반 관찰보다 잡음이 40% 작다
    const S = this.S, p = S.players[id]; if (!this.hiddenForeign(p)) return '조사가 필요 없는 선수입니다(KBO 기록이 있거나 이미 계약했습니다).'; const sc = (S.scouts || []).find(x => x.id === scoutId); if (!sc) return '조사를 맡을 스카우트를 고르세요.';
    this.fEst(p); const old = p.fsc.by[scoutId]; if (old && old.manual) return '이 스카우트가 이미 집중 조사했습니다.';
    const bad = spend(this, PROBE_COST); if (bad) return bad; this._fObs(p, sc, 0.6, 99, true); return null;
  };
  proto.fReport = function (p) {   // 조사한 외국인의 세부 능력(관찰 수가 적으면 잡음이 큼). 조사 전에는 null
    const e = this.fEst(p); if (e.exact) return { exact: true, sub: this.sub(p) }; if (!e.n) return null; const S = this.S, sub = this.sub(p), sd = 8 / Math.sqrt(1 + e.n), out = {};
    Object.keys(sub).forEach((k, i) => { out[k] = Math.round(clamp(sub[k] + gauss(rngFor(S.seed, S.year, idn(p.id) * 19 + i, 7530), 0, sd), 20, 80)); }); return { exact: false, sub: out, sd: r1(sd) };
  };
  proto.fSortKey = function (p) { const e = this.fEst(p); return e.exact ? this.war(p) : (e.o - 40) / 10; };   // 추정만 알 때의 정렬 기준(진짜 가치 비노출)

  /* ---------------- AI 구단의 스카우트 수준 ---------------- */
  proto.aiScoutQ = function (t) {   // 재정이 큰 구단일수록 스카우트가 정확: 추정이 진짜 값 쪽으로 5~35% 이동
    const T = Engine.TEAMS, key = x => this.finReady && this.finReady() ? this.finBudget(x) : this.cbtPay(x), sorted = T.slice().sort((a, b) => key(a) - key(b)), rank = sorted.indexOf(t);
    return Math.round((0.05 + 0.30 * Math.max(0, rank) / (T.length - 1)) * 1000) / 1000;
  };
  proto.aiScoutScore = function (t, p) { const q = this.aiScoutQ(t), ceil = p.scout.ceil + q * (p.peak - p.scout.ceil), o = p.scout.o + q * (this.ovr(p) - p.scout.o); return 0.35 * o + 0.65 * ceil; };
  proto.scoutRanking = function () { const S = this.S; return Engine.TEAMS.map(t => ({ t, q: t === S.userTeam ? null : this.aiScoutQ(t) })).sort((a, b) => a.q === null ? -1 : b.q === null ? 1 : b.q - a.q); };

  /* ---------------- 해외 후보군(외국인·아시아쿼터) ----------------
     시즌 시작 때 그해 오프시즌에 FA 시장에 나올 가상 외국인 후보를 미리 공개한다(일반 18명 + 아시아쿼터 10명). 해외 스카우트가 매주 관찰해 오차를 줄이고,
     시즌이 끝나 계약이 정리되면(finishContracts) 외국인 FA 시장에 합류한다(AI 구단도 같은 시장에서 고른다). */
  const FOR_SUR = ['카르', '로페', '미첼', '스미', '브라', '윌슨', '존슨', '해리', '터너', '로저', '필립', '데이', '콜린', '다니', '레이', '헤이', '모리', '샌더', '프레', '그랜', '페레', '곤잘', '마르', '디아', '알바', '로드'], FOR_GIV = ['스', '슨', '즈', '트', '드', '로', '닐', '크', '또', '츠'];
  const AQ_SUR = ['이와타', '코마츠', '나카야마', '하시모토', '마에다', '스즈키', '오가와', '후지이', '타나카', '사토', '야마다', '요시다', '미야자와', '기무라', '천', '린', '장', '왕', '맥도널', '켈리', '산토스', '리'], AQ_GIV = ['유토', '켄지', '쇼타', '하루토', '류세이', '소마', '타쿠미', '웨이', '밍', '제이크', '라이언', '루카스'];
  const FPOOL_G = [11, 7], FPOOL_A = [7, 3];   // 일반(투수·타자) · 아시아쿼터(투수·타자)
  proto._foreignName = function (r, aq, taken) {
    for (let k = 0; k < 80; k++) { const nm = aq ? AQ_SUR[Math.floor(r.random() * AQ_SUR.length)] + ' ' + AQ_GIV[Math.floor(r.random() * AQ_GIV.length)] : FOR_SUR[Math.floor(r.random() * FOR_SUR.length)] + FOR_GIV[Math.floor(r.random() * FOR_GIV.length)]; if (!taken.has(nm)) { taken.add(nm); return nm; } }
    let nm, k = 2; do { nm = (aq ? '이와타 ' : '카르') + k++; } while (taken.has(nm)); taken.add(nm); return nm;
  };
  /* 후보군 구성(⚠ 규모는 제공받은 추정 자료 기준): 실질 영입 가능 풀 = 일반 투수 36·타자 30, 아시아쿼터 투수 28·타자 22(연 116명).
   * 앞의 28명(core)은 기존과 같은 난수·같은 ID로 만든 후보이고, 나머지(deep)는 별도 난수로 core 뒤에 만든다(core 후보는 기존과 완전히 같다).
   * AI 구단은 core만 고른다(리그 전체의 외국인 수준을 이전과 같게 유지). 1차 모수 = 실질 풀 + '시장에서 빠진 선수'(NPB 특급 제시·바이아웃·자격 제외 등) 약 340명. */
  const FDEEP_G = [25, 23], FDEEP_A = [21, 19], FOUT_G = 150, FOUT_A = 70;
  const FLG_G = ['MLB 산하 AAA', 'NPB 방출', '중남미 윈터리그'], FLG_A = ['NPB 2군', 'NPB 육성', '일본 독립리그', '대만 CPBL', '호주 ABL'];
  const FWHY_G = ['NPB 특급 제시(150만$ 이상)', '마이너 옵션·바이아웃 과다', 'KBO 수준 미달'], FWHY_A = ['직전 시즌 미국 마이너 등록(자격 제외)', 'NPB 1군 주전급(상한 20만$ 초과)', 'CPBL 최정상급(상한 초과)', '구단 눈높이 미달'];
  proto.ensureForeignPool = function () {
    const S = this.S; if (S.fpool && S.fpool.y === S.year) return S.fpool;
    const r = rngFor(S.seed, S.year, 7700), taken = new Set(Object.values(S.players).map(q => q.ko)), ids = [];
    for (const [aq, cnt] of [[false, FPOOL_G], [true, FPOOL_A]]) for (const [ti, n] of [['P', cnt[0]], ['B', cnt[1]]].map(x => x)) for (let i = 0; i < n; i++) {
      const p = this.makeForeign(r, ti, aq, { name: this._foreignName(r, aq, taken) }); p.team = 'DRAFT'; p.fpool = true; p.fpy = S.year; p.active = false; p.virtual = true; ids.push(p.id);
    }
    const r2 = rngFor(S.seed, S.year, 7701);
    for (const [aq, cnt] of [[false, FDEEP_G], [true, FDEEP_A]]) for (const [ti, n] of [['P', cnt[0]], ['B', cnt[1]]]) for (let i = 0; i < n; i++) {
      const p = this.makeForeign(r2, ti, aq, { name: this._foreignName(r2, aq, taken) }); p.team = 'DRAFT'; p.fpool = true; p.deep = true; p.fpy = S.year; p.active = false; p.virtual = true; ids.push(p.id);
    }
    const r3 = rngFor(S.seed, S.year, 7702), out = [];
    for (const [aq, n, lg, why] of [[false, FOUT_G, FLG_G, FWHY_G], [true, FOUT_A, FLG_A, FWHY_A]]) for (let i = 0; i < n; i++) out.push([this._foreignName(r3, aq, taken), aq ? 1 : 0, Math.floor(r3.random() * lg.length), Math.floor(r3.random() * why.length), r3.random() < (aq ? 0.6 : 0.62) ? 'P' : 'B']);
    S.fpool = { y: S.year, ids, released: false, out }; return S.fpool;
  };
  proto.foreignOut = function () {   // 시장에서 빠진 1차 모수(관찰만 가능했던 선수)
    const fp = this.ensureForeignPool(), rows = fp.out.map(x => ({ name: x[0], aq: !!x[1], lg: (x[1] ? FLG_A : FLG_G)[x[2]], why: (x[1] ? FWHY_A : FWHY_G)[x[3]], type: x[4] })), by = {};
    for (const x of rows) { const k = (x.aq ? '아시아쿼터 · ' : '일반 · ') + x.why; by[k] = (by[k] || 0) + 1; }
    return { rows, by, total: rows.length + fp.ids.length, pool: fp.ids.length };
  };
  proto.foreignPoolList = function () { const fp = this.ensureForeignPool(); return fp.released ? [] : fp.ids.map(id => this.S.players[id]).filter(p => p && p.fpool && p.team === 'DRAFT'); };
  proto._releaseForeignPool = function () {   // 계약 정리 시점: 후보군이 외국인 FA 시장에 합류. 지난해 후보 중 계약 못 한 선수는 정리
    const S = this.S; for (const id of S.fa || []) { const q = S.players[id]; if (q && q.fpy && q.fpy < S.year && q.team === 'FA' && !q.pool27) { q.retired = true; q.team = 'RET'; } }
    S.fa = (S.fa || []).filter(id => S.players[id] && S.players[id].team === 'FA');
    const fp = S.fpool; if (!fp || fp.y !== S.year || fp.released) return 0; let n = 0;
    for (const id of fp.ids) { const q = S.players[id]; if (!q || q.team !== 'DRAFT') continue; q.team = 'FA'; q.fpool = false; q.active = false; (S.fa = S.fa || []).push(id); n++; }
    fp.released = true; S.fWatch = []; if (n) { S.news.unshift({ year: S.year, day: S.day, text: `해외 후보군 ${n}명이 외국인 선수 시장에 나왔습니다(일반 외국인·아시아쿼터).` }); if (S.news.length > 120) S.news.length = 120; } return n;
  };
  /* 해외 후보 관심 목록(최대 8명)과 주간 관찰 */
  const FWATCH_MAX = 8;
  proto.foreignWatchList = function () { const S = this.S; return (S.fWatch || []).filter(w => S.players[w.id] && S.players[w.id].fpool && S.players[w.id].team === 'DRAFT'); };
  proto.foreignWatch = function (id) {
    const S = this.S, p = S.players[id]; if (!p || !p.fpool || p.team !== 'DRAFT') return '관찰할 수 있는 해외 후보가 아닙니다.'; S.fWatch = this.foreignWatchList(); const i = S.fWatch.findIndex(w => w.id === id);
    if (i >= 0) { S.fWatch.splice(i, 1); return null; } if (S.fWatch.length >= FWATCH_MAX) return `해외 후보 관심 목록은 ${FWATCH_MAX}명까지입니다.`; S.fWatch.push({ id, star: false }); return null;
  };
  proto.foreignStar = function (id) { const w = this.foreignWatchList().find(x => x.id === id); if (!w) return '관심 목록에 없습니다.'; w.star = !w.star; this.S.fWatch = this.foreignWatchList(); return null; };
  proto.foreignAutoWatch = function (n) {
    const S = this.S; S.fWatch = this.foreignWatchList(); const have = new Set(S.fWatch.map(w => w.id)); let added = 0;
    for (const x of this.foreignPoolList().filter(p => !have.has(p.id)).map(p => ({ p, v: this.fEst(p).o + 0.8 * this.fEst(p).sd })).sort((a, b) => b.v - a.v)) { if (S.fWatch.length >= FWATCH_MAX || added >= (n || 4)) break; S.fWatch.push({ id: x.p.id, star: false }); added++; } return added;
  };
  proto.scoutFCap = function (s) { return clamp(1 + Math.floor(((s.abroad === undefined ? 45 : s.abroad) - 40) / 15), 1, 3); };   // 스카우트의 주간 해외 관찰 수(해외 능력 기준)
  proto._scoutWeekForeign = function () {
    const S = this.S, watch = this.foreignWatchList(); if (!watch.length) return 0; const order = []; for (const w of watch) { order.push(w.id); if (w.star) order.push(w.id); }
    const week = Math.floor(S.day / 7); let k = (S.fPtr || 0) % order.length, total = 0;
    (S.scouts || []).forEach(sc => { for (let i = 0; i < this.scoutFCap(sc); i++) { const p = S.players[order[k % order.length]]; k++; if (p && p.fpool) { this._fObs(p, sc, 1, week * 5 + i, false); total++; } } });
    S.fPtr = k % order.length; return total;
  };

  /* ================= 외국인: 합산 상한 · 교체 횟수 · 부상 대체 ================= (⚠ 규정 수치는 제공받은 2차 자료 기준, 원출처 확인 전까지 가정값)
   * - 일반 외국인 3명 연봉(계약금 상각 포함) 합산 ≤ 400만$ = 56억(1$=1,400원, 신규 상한 100만$=14억과 같은 환율). 내 구단에만 적용(AI 구단은 기존 규칙 유지).
   * - 시즌 중(정규시즌) 외국인 교체 영입은 연 2회까지. 부상 대체 영입은 횟수에서 제외하고, 정식 전환할 때만 1회 차감.
   * - 부상 대체: 내 일반 외국인이 6주(42일) 이상 부상이면 재활 선수명단에 올리고 대체 선수를 월 최대 10만$(1.4억)로 계약. 대체 선수는 3명 한도 밖이다.
   *   비용 = 월 1.4억 × 개월을 계약 시점에 지급 확정(선수 연봉에는 넣지 않고 올해 계약 정리 비용으로 계상 → 연봉 합계·경쟁균형세에 이중 반영되지 않음).
   *   통역·숙소 등 부대 비용은 재정의 선수단 운영비(보정값)에 이미 들어 있어 따로 더하지 않는다. 아시아쿼터는 대체 대상이 아니라고 가정(⚠). */
  const FOREIGN_TOTAL = 56, SUB_MONTHLY = 1.4, SUB_MIN_DAYS = 42, SWAP_MAX = 2;
  const todayAug15 = S => Math.floor(Date.UTC(S.year, 7, 15) / 864e5);
  proto.foreignGenPay = function (t, excl) {
    const rep = this._replacing || (this.S.neg && this.S.neg.kind === 'foreign' ? this.S.neg.replace : null);
    return this.foreignOf(t).filter(x => !x.aq && !x.sub && x.id !== excl && x.id !== rep).reduce((a, x) => a + x.contract.salary + (x.contract.amort && x.contract.years > 0 ? x.contract.amort : 0), 0);
  };
  proto.foreignRoom = function (t, excl) { return Math.max(0, r1(FOREIGN_TOTAL - this.foreignGenPay(t, excl))); };
  proto._fSwapInit = function () { const S = this.S; if (!S.fSwap || S.fSwap.y !== S.year) S.fSwap = { y: S.year, n: 0 }; return S.fSwap; };
  proto.fSwapInfo = function () { const S = this.S; return { n: S.fSwap && S.fSwap.y === S.year ? S.fSwap.n : 0, max: SWAP_MAX }; };   // 읽기 전용
  proto.fSwapBlock = function () { const S = this.S; if (S.phase !== 'regular') return null; const i = this.fSwapInfo(); return i.n >= i.max ? `올 시즌 외국인 교체 ${i.max}회를 모두 사용했습니다(부상 대체 영입은 제외).` : null; };
  proto.postDeadline = function () { const S = this.S; return { n: todayAug15(S), str: `${S.year}-08-15`, passed: S.phase === 'regular' && this.todayN() > todayAug15(S) }; };
  proto._foreignIn = function (p) {   // 시즌 중 외국인 영입: 교체 횟수 +1, 8/15 이후면 포스트시즌 출전 불가
    const S = this.S; if (S.phase !== 'regular') return; this._fSwapInit(); S.fSwap.n++; if (this.postDeadline().passed) p.noPost = S.year;
  };
  proto._postElig = function () {   // 포스트시즌 시작: 8/15 이후 영입한 외국인은 출전 불가
    const S = this.S, t = S.userTeam; let ch = false;
    for (const p of this.players(t)) if (p.noPost === S.year && p.active) { p.active = false; ch = true; }
    if (ch) { this._engDirty = true; this.repairSettings(t); }
  };
  proto.subList = function () { const S = this.S, t = S.userTeam; return this.foreignOf(t).filter(p => p.sub).map(p => ({ p, orig: S.players[p.sub.for], sub: p.sub })); };
  const injDays = (L, p) => {   // 부상 총 치료 기간(발생일~복귀 예정일), 발생일을 알 수 없으면 남은 일수
    const m = p.inj && /(\d{4})-(\d{2})-(\d{2})/.exec(String(p.inj.since || '')); const r = L.injRet(p), left = L.injLeft(p);
    if (m && r !== null) return Math.max(left, r - Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5)); return left;
  };
  proto.subEligible = function () {
    const S = this.S, t = S.userTeam; if (S.phase !== 'regular') return [];
    return this.foreignOf(t).filter(p => !p.aq && !p.sub && !p.rehab && this.isInj(p) && injDays(this, p) >= SUB_MIN_DAYS).map(p => ({ p, days: injDays(this, p), left: this.injLeft(p) }));
  };
  proto.subCands = function () {   // 대체 후보: 외국인 FA 시장(일반) + 해외 후보군(일반)
    const S = this.S, out = []; for (const id of S.fa || []) { const q = S.players[id]; if (q && q.foreign && !q.aq && q.team === 'FA') out.push(q); }
    const fp = S.fpool && S.fpool.y === S.year && !S.fpool.released ? S.fpool.ids : []; for (const id of fp) { const q = S.players[id]; if (q && q.fpool && !q.aq && q.team === 'DRAFT') out.push(q); }
    return out;
  };
  proto.subMaxMonths = function () { const S = this.S, left = Math.max(0, (S.schedule || []).length - (S.day || 0)); return clamp(Math.ceil(left / 30.4), 1, 6); };
  proto.subCost = function (months) { return r1(SUB_MONTHLY * months); };
  proto.subSign = function (origId, candId, months) {
    const S = this.S, t = S.userTeam, orig = S.players[origId], c = S.players[candId]; months = Math.round(months);
    if (S.phase !== 'regular') return '부상 대체 영입은 정규시즌 중에만 할 수 있습니다.';
    if (!orig || orig.team !== t || !orig.foreign) return '대체 대상 외국인 선수를 찾을 수 없습니다.';
    if (orig.aq) return '아시아쿼터 선수는 부상 대체 영입 대상이 아닙니다(가정).';
    if (!this.subEligible().some(x => x.p.id === origId)) return '6주(42일) 이상 치료가 필요한 부상이어야 하고, 이미 대체 선수가 있으면 안 됩니다.';
    if (!c || !c.foreign || c.aq || !(c.team === 'FA' || (c.fpool && c.team === 'DRAFT'))) return '대체로 영입할 수 있는 일반 외국인 후보가 아닙니다.';
    if (!(months >= 1 && months <= this.subMaxMonths())) return `계약 기간은 1~${this.subMaxMonths()}개월입니다.`;
    if (S.teams[t].ids.length >= 130) return '보유 선수 130명 제한입니다.';
    const cost = this.subCost(months), room = this.finReady() ? this.faRoom(t) : 1e9; if (room < cost) return `예산 부족: 대체 계약 ${cost}억(월 ${SUB_MONTHLY}억 × ${months}개월)이 여유자금 ${room.toFixed(1)}억을 넘습니다.`;
    const f = S.fin && S.fin.teams[t]; if (!f && this.finReady()) return '재정 정보가 없습니다.';
    if (c.team === 'FA') S.fa = (S.fa || []).filter(x => x !== candId); else if (S.fpool) { S.fpool.ids = S.fpool.ids.filter(x => x !== candId); S.fWatch = (S.fWatch || []).filter(w => w.id !== candId); }
    c.fpool = false; c.deep = false; c.team = t; c.active = false; S.teams[t].ids.push(candId); c.contract = { salary: 0, years: 1 }; c.myFrom = { y: S.year, how: '대체 외국인 영입' };
    c.sub = { for: origId, mo: months, monthly: SUB_MONTHLY, start: S.day, end: S.day + Math.round(months * 30.4), cost, back: null }; orig.rehab = { sub: candId, day: S.day };
    if (f) { f.dead = (f.dead || []).concat([{ year: this._finYear(), amt: cost, who: `${c.ko}(대체 계약 ${months}개월)` }]); }
    this._foreignJoin(c); if (this.postDeadline().passed) c.noPost = S.year; this.invalidate();
    this._news(`부상 대체 외국인: ${orig.ko}(${orig.inj ? orig.inj.dx : '부상'}) 재활 선수명단 등재 → ${c.ko} ${months}개월 계약(${cost}억)${c.noPost ? ' · 8월 15일 이후라 포스트시즌 출전 불가' : ''}`);
    S.subLog = [{ d: S.day, text: `${orig.ko} → 대체 ${c.ko} ${months}개월 ${cost}억` }].concat(S.subLog || []).slice(0, 12); return null;
  };
  proto.subExtend = function (subId, months) {
    const S = this.S, t = S.userTeam, c = S.players[subId]; months = Math.round(months); if (!c || c.team !== t || !c.sub) return '대체 선수를 찾을 수 없습니다.';
    const orig = S.players[c.sub.for]; if (!orig || orig.team !== t || !this.isInj(orig)) return '원래 선수가 복귀했거나 팀에 없어 연장할 수 없습니다.';
    if (!(months >= 1 && months <= this.subMaxMonths())) return `연장 기간은 1~${this.subMaxMonths()}개월입니다.`;
    const cost = this.subCost(months), room = this.finReady() ? this.faRoom(t) : 1e9; if (room < cost) return `예산 부족: ${cost}억이 여유자금 ${room.toFixed(1)}억을 넘습니다.`;
    const f = S.fin && S.fin.teams[t]; if (f) f.dead = (f.dead || []).concat([{ year: this._finYear(), amt: cost, who: `${c.ko}(대체 계약 연장 ${months}개월)` }]);
    c.sub.mo += months; c.sub.end += Math.round(months * 30.4); c.sub.cost = r1(c.sub.cost + cost); this._news(`대체 외국인 ${c.ko} 계약 ${months}개월 연장(${cost}억)`); return null;
  };
  proto._subDrop = function (c, why) {   // 대체 계약 종료 → 즉시 FA 공시(웨이버 없음, 타 구단 계약 가능)
    const S = this.S, t = S.userTeam, orig = S.players[c.sub ? c.sub.for : null]; if (orig) delete orig.rehab;
    delete c.sub; S.teams[t].ids = S.teams[t].ids.filter(x => x !== c.id); c.team = 'FA'; c.active = false; c.noPost = 0; c.contract = { salary: this.askSalary(c), years: 1 }; c.faInfo = { from: t, grade: null, prev: 0, sub: true };
    (S.fa = S.fa || []).includes(c.id) || S.fa.push(c.id); this.repairSettings(t); this.invalidate(); this._news(`대체 외국인 ${c.ko}: ${why} → 자유계약선수(FA)로 공시`);
  };
  proto._subDay = function () {
    const S = this.S, t = S.userTeam; if (S.phase !== 'regular') return;
    if (this.todayN() === todayAug15(S)) this._news('8월 15일: 오늘까지 계약한 외국인 선수만 포스트시즌에 출전할 수 있습니다.');
    for (const p of this.players(t).filter(x => x.sub)) {
      const o = S.players[p.sub.for];
      if (!o || o.team !== t) { if (S.day >= p.sub.end) this._subDrop(p, '계약 종료'); continue; }
      if (!p.sub.back && !this.isInj(o)) { p.sub.back = S.day; this._news(`${o.ko} 부상 복귀 — 대체 외국인 ${p.ko}: 7일 안에 결정(계약 해지 / 정식 전환), 정하지 않으면 해지됩니다.`); }
      if (p.sub.back ? S.day - p.sub.back >= 7 || S.day >= p.sub.end : S.day >= p.sub.end) this._subDrop(p, p.sub.back ? '결정 기한 만료' : '계약 종료');
    }
    for (const p of this.players(t).filter(x => x.rehab)) if (!S.players[p.rehab.sub] || S.players[p.rehab.sub].team !== t) delete p.rehab;
  };
  proto._subEnd = function () { const S = this.S, t = S.userTeam; for (const p of this.players(t).filter(x => x.sub)) this._subDrop(p, '시즌 종료'); for (const p of this.players(t).filter(x => x.rehab)) delete p.rehab; };
  proto.subConvertPreview = function (subId) {   // 정식 전환 시 새 계약·위약금·교체 횟수(읽기 전용)
    const S = this.S, t = S.userTeam, c = S.players[subId]; if (!c || c.team !== t || !c.sub) return null; const o = S.players[c.sub.for];
    const rem = Math.max(0.5, (Math.floor(Date.UTC(S.year, 10, 30) / 864e5) - this.todayN()) / 30.4), sal = r1(Math.max(0.3, SUB_MONTHLY * rem));
    return { ok: !!(o && o.team === t), c, o, rem, sal, rel: o ? this.releaseCost(o.id) : null, sw: this.fSwapInfo() };
  };
  proto.subDecide = function (subId, choice) {
    const S = this.S, t = S.userTeam, c = S.players[subId]; if (!c || c.team !== t || !c.sub) return '대체 선수를 찾을 수 없습니다.';
    if (choice === 'release') { this._subDrop(c, '계약 해지'); return null; }
    if (choice !== 'convert') return '알 수 없는 선택입니다.';
    const o = S.players[c.sub.for]; if (S.phase !== 'regular') return '정규시즌 중에만 전환할 수 있습니다.'; if (!o || o.team !== t) return '원래 선수가 팀에 없습니다.';
    const bl = this.fSwapBlock(); if (bl) return bl;
    const pv = this.subConvertPreview(subId), sal = pv.sal;   // 잔여 개월 × 10만$(월 1.4억) 한도
    const rel = this.releasePlayer(o.id); if (!rel.ok) return rel.msg;   // 기존 선수 웨이버(위약금 규정은 일반 방출과 같게 처리 ⚠)
    delete c.sub; c.contract = { salary: sal, years: 1 }; this._fSwapInit(); S.fSwap.n++; this.invalidate();
    this._news(`외국인 정식 전환: ${c.ko}(잔여 계약 ${sal}억) — ${o.ko}는 웨이버, 교체 ${S.fSwap.n}/${SWAP_MAX}회`); return null;
  };
});
