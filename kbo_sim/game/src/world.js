/* KBO 감독 모드: 선수단 관계·감독 평판·선수 커리어·구단 역사·도전 과제·FA 시장 속보·라이벌전·경기 되짚기
 * 모든 항목은 게임 안에서 실제로 일어난 기록(스탯·계약·수상·경기 로그)에서 계산한다. 경제 수치(관중·수익·예산)는 바꾸지 않는다.
 * 감독 평판과 동료 관계는 협상·면담 호감도의 시작값에만 영향을 준다(±5 이내).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { League, KO, rngFor, clamp } = LG;
  const proto = League.prototype;
  const r1 = v => Math.round(v * 10) / 10;

  /* ---------------- 선수 노트 · 계약 이력 ---------------- */
  proto.note = function (p, text) { const S = this.S; if (!p) return; p.notes = p.notes || []; p.notes.push({ y: S.year, d: S.day, t: text }); if (p.notes.length > 24) p.notes.shift(); };
  proto._contractNote = function (p, kind, c) {
    const S = this.S; c = c || p.contract; if (!p) return; p.cHist = p.cHist || [];
    const total = c.total !== undefined ? c.total : r1(c.salary * c.years); p.cHist.push({ y: S.year, team: p.team, kind, years: c.years, salary: c.salary, total, bonus: c.bonus || 0 }); if (p.cHist.length > 12) p.cHist.shift();
  };

  /* ---------------- 감독 평판 ---------------- */
  proto._ry = function () { const S = this.S; if (!S.repY || S.repY.y !== S.year) S.repY = { y: S.year, kept: 0, broken: 0, meetOk: 0, meetBad: 0, ext: 0, signed: 0 }; return S.repY; };
  proto._repBump = function (k, n) { const S = this.S; S.rep = S.rep || { kept: 0, broken: 0, meetOk: 0, meetBad: 0, negOk: 0, negBroke: 0, ext: 0 }; const a = k === 'negOk' || k === 'negBroke' ? null : k; S.rep[k] = (S.rep[k] || 0) + (n || 1); const y = this._ry(); if (y[k] !== undefined) y[k] += (n || 1); if (k === 'negOk') y.signed++; return a; };
  proto.reputation = function () {
    const S = this.S, R = S.rep || {}, items = []; let v = 50; const add = (label, x) => { x = Math.round(x * 10) / 10; if (Math.abs(x) >= 0.5) { items.push([label, x]); v += x; } };
    add(`지킨 약속 ${R.kept || 0}건`, Math.min(12, 3 * (R.kept || 0))); add(`깨진 약속 ${R.broken || 0}건`, -Math.min(24, 8 * (R.broken || 0)));
    add(`면담 성공 ${R.meetOk || 0}회`, Math.min(8, 2 * (R.meetOk || 0))); add(`면담 실패 ${R.meetBad || 0}회`, -Math.min(8, 3 * (R.meetBad || 0)));
    add(`협상 타결 ${R.negOk || 0}건`, Math.min(6, R.negOk || 0)); add(`협상 결렬 ${R.negBroke || 0}건`, -Math.min(6, 2 * (R.negBroke || 0)));
    const win = (S.history || []).filter(h => h.userRank <= 5).length; add(`가을야구 ${win}회`, Math.min(6, 2 * win));
    const score = clamp(Math.round(v), 10, 95), tag = score >= 70 ? '신뢰받는 감독' : score >= 55 ? '믿을 만한 감독' : score >= 40 ? '평범한 감독' : '신뢰가 떨어진 감독';
    return { score, tag, items };
  };

  /* ---------------- 동료 관계 ----------------
     관계(선수당 최대 3명, 외국인 제외): 같은 학교 동기(3) · 같은 학교 선후배(2) · 같은 해 같은 구단 지명 동기(1.5) · 우리 구단이 같은 해 지명한 동기(1.5) · 멘토-제자(1.2: 경력 8년 이상·31세 이상 베테랑 ↔ 24세 이하, 같은 포지션 그룹)
     발동(우리 구단 선수 P에게 일어난 일 → P의 친한 동료 Q): 긍정 = 면담 성공·재계약·비FA 다년계약·약속 이행·1군 승격·기록 달성·시즌 활약(수상 상위)·부상 복귀 / 부정 = 면담 실패·약속 불이행·방출(근속 3년↑ 또는 OVR 50↑)·트레이드로 내보냄·장기 부상(30일↑)
     효과(같은 Q는 10일에 한 번): 충성도 보정 ±1 × 성격 가중(P가 리더형 ×1.5, Q가 소심형 ×1.3, Q가 자유분방형이고 부정이면 ×1.3) + 컨디션 ±1(긍정 8일·부정 10일, 기존 컨디션 보정과 합산, ±3 한도).
     회복: 충성도 보정은 30일마다 0 쪽으로 1, 새 시즌 시작 때 2 줄어든다. */
  proto.bonds = function (p) {
    const S = this.S; if (!p || p.foreign || !(p.team in S.teams)) return []; const dh = p.dh || {}, out = new Map(), add = (id, w, why) => { const o = out.get(id); if (!o || o.w < w) out.set(id, { id, w, why }); };
    const grp = q => q.type === 'P' ? (q.role === 'SP' ? 'SP' : 'RP') : q.pos === 'C' ? 'C' : ['1B', '2B', '3B', 'SS'].includes(q.pos) ? 'IF' : ['LF', 'CF', 'RF'].includes(q.pos) ? 'OF' : 'DH';
    const vet = q => q.age >= 31 && ((q.tn || 0) >= 8 || (q.dh && q.dh.ss >= 8)), rook = q => q.age <= 24, my = p.myFrom && /^드래프트/.test(p.myFrom.how) ? p.myFrom.y : null;
    for (const q of this.players(p.team)) { if (q.id === p.id || q.foreign) continue; const qd = q.dh || {};
      if (dh.school && qd.school === dh.school) add(q.id, dh.y && dh.y === qd.y ? 3 : 2, dh.y && dh.y === qd.y ? '같은 학교 동기' : '같은 학교 선후배');
      else if (dh.y && qd.y === dh.y && dh.dt && dh.dt === qd.dt) add(q.id, 1.5, '입단 동기');
      if (my !== null && q.myFrom && /^드래프트/.test(q.myFrom.how) && q.myFrom.y === my) add(q.id, 1.5, '입단 동기(우리 지명)');
      if (p.type === q.type && grp(p) === grp(q) && ((vet(p) && rook(q)) || (rook(p) && vet(q)))) add(q.id, 1.2, vet(p) ? '제자' : '멘토'); }
    return [...out.values()].sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : 1)).slice(0, 3);
  };
  const BOND_NEWS = ['방출', '트레이드', '장기 부상', '약속 불이행'];
  proto._bondShift = function (p, dir, cause, list) {
    const S = this.S, t = S.userTeam, bl = list || this.bonds(p), srcLead = this.traitOf(p) === 'leader', hit = [];
    for (const b of bl) {
      const q = S.players[b.id]; if (!q || q.team !== t || q.foreign || q.id === p.id) continue; if (q.bondAt !== undefined && q.bondAt <= S.day && S.day - q.bondAt < 10) continue; q.bondAt = S.day;
      const qt = this.traitOf(q); let f = 1; if (srcLead) f *= 1.5; if (qt === 'shy') f *= 1.3; if (qt === 'free' && dir < 0) f *= 1.3;
      const d = r1((dir > 0 ? 1 : -1) * f); q.loyAdj = clamp(r1((q.loyAdj || 0) + d), -15, 15);
      const cur = q.mood && S.day < q.mood.until ? q.mood : null; q.mood = { v: clamp((cur ? cur.v : 0) + (dir > 0 ? 1 : -1), -3, 3), until: Math.max(cur ? cur.until : 0, S.day + (dir > 0 ? 8 : 10)) };   // 컨디션 ±1
      hit.push(q); (S.bondLog = S.bondLog || []).unshift({ y: S.year, d: S.day, text: `${q.ko}: ${b.why}인 ${p.ko}의 ${cause} 소식에 ${dir > 0 ? '기분이 좋아졌습니다' : '마음이 불편합니다'} (충성도 ${d > 0 ? '+' : '−'}${Math.abs(d)} · 컨디션 ${dir > 0 ? '+1' : '−1'})` }); if (S.bondLog.length > 30) S.bondLog.pop();
    }
    if (hit.length) { this.invalidate(); if (BOND_NEWS.includes(cause)) { const text = `분위기: ${p.ko}의 ${cause} — ${hit.map(x => x.ko).join('·')} 선수가 동요합니다`; S.news.unshift({ year: S.year, day: S.day, text }); if (S.news.length > 120) S.news.length = 120; this.story('bond', text, 1); } }
    return hit.length;
  };
  proto._loyDecay = function (n) {   // 충성도 보정(최근 대우)이 시간이 지나며 0 쪽으로 회복
    for (const p of this.players(this.S.userTeam)) if (p.loyAdj) p.loyAdj = r1(p.loyAdj > 0 ? Math.max(0, p.loyAdj - n) : Math.min(0, p.loyAdj + n));
  };
  proto.bondPreview = function () {   // 영향 관계가 많은 선수(주전급 우선) — 이 선수에게 일이 생기면 누가 영향받는지
    const t = this.S.userTeam; return this.players(t).filter(p => !p.foreign).map(p => ({ p, b: this.bonds(p) })).filter(x => x.b.length).sort((a, b) => b.b.length - a.b.length || this.ovr(b.p) - this.ovr(a.p)).slice(0, 8);
  };
  proto.clubhouseBoard = function () {
    const S = this.S, t = S.userTeam, ps = this.players(t).filter(p => !p.foreign), groups = {};
    for (const p of ps) { const dh = p.dh || {}; if (dh.school) (groups['학교|' + dh.school] = groups['학교|' + dh.school] || []).push(p); if (dh.y && dh.dt === t) (groups['동기|' + dh.y] = groups['동기|' + dh.y] || []).push(p); }
    const gl = Object.entries(groups).filter(([k, m]) => m.length >= (k.startsWith('학교') ? 2 : 3)).map(([k, m]) => ({ label: k.startsWith('학교') ? `${k.slice(3)} 출신` : `${k.slice(3)}년 입단 동기`, members: m.map(p => p.id), mood: r1(m.reduce((a, p) => a + this.moodOf(p) + (p.loyAdj || 0) / 4, 0) / m.length) })).sort((a, b) => b.members.length - a.members.length).slice(0, 6);
    const unhappy = ps.filter(p => (p.loyAdj || 0) <= -4 || this.moodOf(p) <= -2).sort((a, b) => ((a.loyAdj || 0) + this.moodOf(a)) - ((b.loyAdj || 0) + this.moodOf(b))).slice(0, 8).map(p => p.id);
    const happy = ps.filter(p => (p.loyAdj || 0) >= 4).sort((a, b) => (b.loyAdj || 0) - (a.loyAdj || 0)).slice(0, 5).map(p => p.id);
    return { groups: gl, unhappy, happy, log: (S.bondLog || []).slice(0, 6), club: this.clubhouse() };
  };

  /* ---------------- 선수 커리어 ---------------- */
  proto._careerSnapshot = function () {
    const S = this.S;
    for (const id of Object.keys(S.players)) { const p = S.players[id]; if (!p || p.retired) continue; const b = S.stats.bat[id], q = S.stats.pit[id]; let row = null;
      if (b && b.PA > 0) { const ab = b.PA - b.BB - b.HBP - b.SF, h = b['1B'] + b['2B'] + b['3B'] + b.HR, tb = b['1B'] + 2 * b['2B'] + 3 * b['3B'] + 4 * b.HR; row = { y: S.year, t: p.team, k: 'B', PA: b.PA, avg: ab ? Math.round(h / ab * 1000) / 1000 : 0, ops: Math.round(((h + b.BB + b.HBP) / Math.max(1, b.PA) + (ab ? tb / ab : 0)) * 1000) / 1000, HR: b.HR, RBI: b.RBI, SB: b.SB }; }
      else if (q && q.outs > 0) row = { y: S.year, t: p.team, k: 'P', outs: q.outs, ra9: Math.round(q.R * 27 / q.outs * 100) / 100, K: q.K, BB: q.BB, HR: q.HR };
      if (row) { p.seasons = (p.seasons || []).filter(x => x.y !== S.year); p.seasons.push(row); if (p.seasons.length > 25) p.seasons.shift(); } }
  };
  proto.careerOf = function (p) {
    const S = this.S, aw = []; for (const h of S.awardsHist || []) for (const a of h.awards) if (a.id === p.id) aw.push({ y: h.year, label: a.label, txt: a.txt });
    return { origin: p.dh || null, seasons: (p.seasons || []).slice(), contracts: (p.cHist || []).slice(), awards: aw, notes: (p.notes || []).slice(), ovrHist: (p.ovrHist || []).slice(), promise: p.promise || null, kept: p.keptP || 0, broken: p.brokenP || 0, bonds: this.bonds(p) };
  };

  /* ---------------- 구단 역사 · 명예의 전당 ---------------- */
  proto._hofCheck = function (p) {
    const S = this.S, t = S.userTeam, aw = []; for (const h of S.awardsHist || []) for (const a of h.awards) if (a.id === p.id) aw.push(a.label);
    const tn = p.tnTeam === t ? p.tn || 0 : 0; if (tn < 6 && !aw.length) return false;
    S.hof = S.hof || []; if (S.hof.some(x => x.id === p.id)) return false;
    const seasons = (p.seasons || []).filter(x => x.t === t); S.hof.push({ id: p.id, name: p.ko, y: S.year, age: p.age, tn, awards: aw, pos: p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos, summary: seasons.length ? (p.type === 'P' ? `${Math.round(seasons.reduce((a, x) => a + (x.outs || 0), 0) / 3)}이닝(${seasons.length}시즌 기록)` : `${seasons.reduce((a, x) => a + (x.HR || 0), 0)}홈런·${seasons.reduce((a, x) => a + (x.RBI || 0), 0)}타점(${seasons.length}시즌 기록)`) : '' });
    this.story('hof', `${p.ko} 은퇴 — 구단 명예의 전당 헌액(근속 ${tn}년${aw.length ? ', 수상 ' + aw.length + '회' : ''})`, 3); return true;
  };
  proto.clubHistory = function () {
    const S = this.S, t = S.userTeam, rows = (S.history || []).map(h => ({ year: h.year, rank: h.userRank, w: h.userRec ? h.userRec.w : 0, l: h.userRec ? h.userRec.l : 0, d: h.userRec ? h.userRec.d : 0, champ: h.champion === t, runner: h.runnerUp === t })).reverse();
    const titles = rows.filter(r => r.champ).length, runners = rows.filter(r => r.runner).length, post = rows.filter(r => r.rank <= 5).length;
    const awards = []; for (const h of S.awardsHist || []) for (const a of h.awards) if (a.team === t) awards.push({ y: h.year, label: a.label, name: a.name, txt: a.txt });
    return { rows, titles, runners, post, hof: (S.hof || []).slice().reverse(), awards };
  };

  /* ---------------- 시즌 도전 과제 ---------------- */
  const CHAL = [
    { id: 'wins80', label: '80승 달성', desc: '정규시즌 80승' },
    { id: 'winning', label: '위닝 시즌', desc: '승률 5할 이상으로 시즌 마감' },
    { id: 'streak8', label: '8연승', desc: '8연승 이상 달성' },
    { id: 'rivals', label: '라이벌 제압', desc: '라이벌 상대 전적에서 승 우위를 점한 구단이 절반 이상' },
    { id: 'rookies3', label: '신인 3명 1군 데뷔', desc: '올해 입단한 신인 3명이 1군 기록을 남김' },
    { id: 'kept', label: '약속을 지킨 해', desc: '올해 깨진 약속 없이 약속 2건 이상 지킴' },
    { id: 'meet5', label: '소통하는 감독', desc: '올해 면담 성공 5회' },
    { id: 'ext2', label: '장기 투자', desc: '올해 비FA 다년계약 2건 체결' },
    { id: 'payrank', label: '가성비 시즌', desc: '연봉 순위보다 순위가 2단계 이상 높음' },
    { id: 'title', label: '한국시리즈 우승', desc: '한국시리즈 우승' }
  ];
  proto._userStreak = function () {
    const S = this.S, t = S.userTeam; let best = 0, cur = 0; for (const r of S.results || []) { if (r.home !== t && r.away !== t) continue; const my = r.home === t ? r.rh : r.ra, op = r.home === t ? r.ra : r.rh; if (my > op) { cur++; best = Math.max(best, cur); } else if (my < op) cur = 0; }
    return best;
  };
  proto.rivalRecord = function (opp) {
    const S = this.S, t = S.userTeam; let w = 0, l = 0, d = 0; const last = [];
    for (const r of S.results || []) { if (!((r.home === t && r.away === opp) || (r.away === t && r.home === opp))) continue; const my = r.home === t ? r.rh : r.ra, op = r.home === t ? r.ra : r.rh; if (my > op) w++; else if (my < op) l++; else d++; last.push({ day: r.day, my, op, home: r.home === t }); }
    return { w, l, d, last: last.slice(-3).reverse() };
  };
  proto._rivalsOf = function (t) { return Engine.TEAMS.filter(x => x !== t && this.isRival(t, x)); };
  proto.challenges = function () {
    const S = this.S, t = S.userTeam, me = this.standings().find(x => x.team === t), y = this._ry(), done = new Set((S.chalDone || []).filter(c => c.y === S.year).map(c => c.id));
    const rv = this._rivalsOf(t).map(o => this.rivalRecord(o)), rvWin = rv.filter(r => r.w > r.l).length, need = Math.ceil(rv.length / 2);
    const rookies = this.players(t).filter(p => p.rookie === S.year && ((S.stats.bat[p.id] && S.stats.bat[p.id].PA > 0) || (S.stats.pit[p.id] && S.stats.pit[p.id].outs > 0))).length;
    const g = S.goals, pr = g ? g.payRank : null, over = pr ? pr - me.rank : 0, tot = me.w + me.l + me.d, final = S.phase === 'offseason' || S.phase === 'post_done';
    const val = { wins80: [me.w, 80], winning: [me.w > me.l ? 1 : 0, 1], streak8: [this._userStreak(), 8], rivals: [rvWin, Math.max(1, need)], rookies3: [rookies, 3], kept: [y.broken === 0 ? Math.min(2, y.kept) : 0, 2], meet5: [y.meetOk, 5], ext2: [y.ext, 2], payrank: [Math.max(0, over), 2], title: [S.post && S.post.champion === t ? 1 : 0, 1] };
    const needFinal = ['winning', 'payrank', 'rivals', 'title'];
    return CHAL.map(c => { const [cur, goal] = val[c.id]; return { id: c.id, label: c.label, desc: c.desc, cur, goal, done: (cur >= goal && (!needFinal.includes(c.id) || final)) || done.has(c.id) }; });
  };
  proto._challengeEval = function () {   // 시즌 종료 시 달성 확정
    const S = this.S; S.chalDone = S.chalDone || []; const have = new Set(S.chalDone.filter(c => c.y === S.year).map(c => c.id)); let n = 0;
    for (const c of this.challenges()) if (c.done && !have.has(c.id)) { S.chalDone.push({ id: c.id, y: S.year, label: c.label }); n++; this.story('chal', `도전 과제 달성: ${c.label}`, 2); }
    return n;
  };

  /* ---------------- 라이벌전 ---------------- */
  const RIVAL_DESC = { '잠실 시리즈': 'LG와 두산이 잠실을 함께 쓰는 서울 라이벌전입니다.', '낙동강 시리즈': '낙동강을 사이에 둔 부산(롯데)과 창원(NC)의 경남 지역 라이벌전입니다.', '달빛 시리즈': "대구의 옛 이름 '달구벌'과 광주의 옛 이름 '빛고을'에서 딴 삼성-KIA전입니다.", '수인선 시리즈': '수원(kt)과 인천(SSG)을 잇는 수인선에서 유래한 매치업입니다.', '항구 시리즈': '대표 항구 도시 부산(롯데)과 인천(SSG)의 대결입니다.', '클래식 시리즈': '1982년 원년부터 연고지·팀명·모기업이 한 번도 바뀌지 않은 롯데와 삼성의 대결입니다.', '통신사 시리즈': '모기업이 이동통신사(LG유플러스·KT)인 LG-kt전입니다.', '단군 매치': '마스코트인 곰(두산)과 호랑이(KIA)가 단군신화에 함께 등장하는 데서 유래했습니다.', '싸대기 매치': 'KBO 포스트시즌에서 역대 가장 많이 맞붙은 두산-삼성 구도에서 비롯된 별칭입니다.', '헤리티지 시리즈': '오랜 역사와 전국구 인기를 공유하는 롯데-KIA전입니다.', '엘롯라시코': "스페인 '엘 클라시코'에 빗댄 LG-롯데전으로, 난타전과 명승부가 잦아 붙은 별칭입니다.", '엘키라시코': '서울 연고 LG-키움의 순위 경쟁과 접전에서 팬들 사이에 자리 잡은 이름입니다.' };
  proto.rivalInfo = function (opp) {
    const S = this.S, t = S.userTeam; if (!this.isRival(t, opp)) return null; const name = this.rivalName(t, opp);
    return { name, desc: RIVAL_DESC[name] || '', rec: this.rivalRecord(opp), hist: ((S.rivH || {})[opp] || []).slice(-3) };
  };
  proto._rivalSeason = function () {   // 시즌 종료 시 라이벌별 전적 보관
    const S = this.S, t = S.userTeam; S.rivH = S.rivH || {}; for (const o of this._rivalsOf(t)) { const r = this.rivalRecord(o); (S.rivH[o] = (S.rivH[o] || []).filter(x => x.y !== S.year)).push({ y: S.year, w: r.w, l: r.l, d: r.d }); }
  };

  /* ---------------- FA 시장 속보 ---------------- */
  proto._faFeedAdd = function (kind, text, pid) {
    const S = this.S, m = S.faMkt; S.faFeed = S.faFeed || []; const day = m ? m.day : S.day, mine = !!(S.neg && S.neg.id === pid) || !!((S.favs || []).includes(pid));
    S.faFeed.unshift({ y: S.year, d: day, kind, text, pid, mine }); if (S.faFeed.length > 60) S.faFeed.pop();
  };

  /* ---------------- 드래프트 연출: 한 픽씩 진행 ---------------- */
  proto.draftAiStep = function () {   // AI 구단의 지명 1건. 반환: { done, userTurn, pick }
    const S = this.S, d = S.off.draft; if (d.pick >= d.order.length) return { done: true };
    const t = d.order[d.pick]; if (t === S.userTeam) return { userTurn: true };
    const r = rngFor(S.seed, S.year, 42, d.pick), best = d.pool.map(id => { const p = S.players[id]; return { id, s: (this.aiScoutScore ? this.aiScoutScore(t, p) : this.scoutScore(p)) + (r.random() - 0.5) * 4 }; }).sort((a, b) => b.s - a.s)[0];
    this._draftTake(t, best.id); return { pick: d.picks[d.picks.length - 1] };
  };
  proto.draftIntro = function (id) {
    const p = this.S.players[id], dr = p.draft || {}, sc = p.scout || {};
    return `${dr.school || '출신교 미상'} 출신 ${p.age}세 ${p.type === 'B' ? (p.pos === 'C' ? '포수' : '야수') : (p.role === 'SP' ? '선발형 투수' : '구원형 투수')} · 스카우트 평가 ${this.tierLabel(sc.ceil || 40)}${p.twoWay ? ' · 투타겸업' : ''}`;
  };

  /* ---------------- 경기 후 결정 되짚기 ---------------- */
  const HITS = ['1B', '2B', '3B', 'HR', '번트안타'], RESN = { K: '삼진', BB: '볼넷', HBP: '사구', HR: '홈런', '1B': '안타', '2B': '2루타', '3B': '3루타', ROE: '실책 출루', OUT: '범타', IBB: '고의사구', '번트': '번트 성공', '번트안타': '번트 안타', '번트(선택)': '야수선택', '번트실패': '번트 실패' };
  proto.reviewDecisions = function (g, decs) {
    const out = [], log = g.log || [];
    for (const d of decs || []) {
      const seg = log.slice(d.l0), when = `${d.inn}회${d.top ? '초' : '말'}`; let text = null, v = 'neu';
      if (d.kind === 'pc') { const pas = seg.filter(x => x.k === 'PA' && x.p && x.p.id === d.arg), outs = pas.reduce((a, x) => a + (x.dout || 0), 0), runs = pas.reduce((a, x) => a + (x.runs || 0), 0), k = pas.filter(x => x.e === 'K').length, nm = d.name || '신임 투수';
        text = pas.length ? `${when} 투수 교체(${d.old || ''} → ${nm}): 상대 ${pas.length}타자, ${Math.floor(outs / 3)}${outs % 3 ? '.' + outs % 3 : ''}이닝 ${runs}실점${k ? ' ' + k + 'K' : ''}` : `${when} 투수 교체(${d.old || ''} → ${nm}): 상대한 타자 없음`; v = !pas.length ? 'neu' : runs === 0 && outs >= 1 ? 'good' : runs >= 2 ? 'bad' : 'neu'; }
      else if (d.kind === 'ph') { const pa = seg.find(x => x.k === 'PA' && x.b && x.b.id === d.arg); text = pa ? `${when} 대타 ${d.name}: ${RESN[pa.e] || pa.e}${pa.runs ? ' · ' + pa.runs + '타점/득점' : ''}` : `${when} 대타 ${d.name}: 타석 없음`; v = !pa ? 'neu' : HITS.includes(pa.e) || pa.e === 'BB' || pa.e === 'HBP' || pa.runs > 0 ? 'good' : pa.e === 'K' ? 'bad' : 'neu'; }
      else if (d.kind === 'ibb') { const pa = seg.filter(x => x.k === 'PA' && x.e !== 'IBB')[0]; text = `${when} 고의사구 → 다음 타자 ${pa ? (RESN[pa.e] || pa.e) : '타석 없음'}${pa && pa.runs ? ' · ' + pa.runs + '점 허용' : ''}`; v = !pa ? 'neu' : pa.runs > 0 || HITS.includes(pa.e) ? 'bad' : pa.e === 'OUT' || pa.e === 'K' ? 'good' : 'neu'; }
      else if (d.kind === 'bunt') { const pa = seg.find(x => x.k === 'PA'); text = `${when} 희생번트: ${pa ? (RESN[pa.e] || pa.e) : '미실행'}`; v = !pa ? 'neu' : pa.e === '번트' || pa.e === '번트안타' ? 'good' : pa.e === '번트실패' ? 'bad' : 'neu'; }
      else if (d.kind === 'steal') { const e = seg.find(x => x.k === 'SB' || x.k === 'CS'); text = `${when} 도루 지시: ${e ? (e.k === 'SB' ? '성공' : '실패') : '시도 없음'}`; v = !e ? 'neu' : e.k === 'SB' ? 'good' : 'bad'; }
      if (text) out.push({ text, v, inn: d.inn });
    }
    return out;
  };

  /* ---------------- 경기 중 '이 순간' 카드(사실 기반) ---------------- */
  /* 지금 이 순간의 점수: 엔진의 g.score는 초/말이 끝나야 반영되므로, 진행 중인 공격 이닝의 득점(h.runs)을 더해야 화면의 점수판과 같다 */
  proto.liveScore = function (g) { return { away: g.score.away + (g.top && !g.finished ? g.h.runs : 0), home: g.score.home + (!g.top && !g.finished ? g.h.runs : 0) }; };
  /* ---------------- 라이브 해설(엔진 기록만 사용) ----------------
   * ns(상태)는 호출하는 쪽이 경기 동안 들고 있다: { hits:{away,home}, reach:{away,home}, k:{투수id:연속삼진}, lead, any, hits0 }.
   * evs = 이번 동작에서 새로 생긴 로그, side = 그 동작 직전의 공격 팀. 반환: 해설 문장 배열(득점·역전·연속 삼진·만루·끝내기). */
  const NHITS = ['1B', '2B', '3B', 'HR', '번트안타'], NREACH = ['1B', '2B', '3B', 'HR', 'BB', 'HBP', 'ROE', 'IBB', '번트안타'];
  proto.liveNotes = function (g, evs, side, ns, us) {
    const out = []; ns.hits = ns.hits || { away: 0, home: 0 }; ns.reach = ns.reach || { away: 0, home: 0 }; ns.k = ns.k || {};
    const nm = b => { const p = b && this.S.players[b.id]; return p ? p.ko : (b && b.name) || ''; }, tn = t => KO[t] || t;
    let last = null;
    for (const e of evs) {
      if (e.k !== 'PA') continue; last = e;
      if (NHITS.includes(e.e)) ns.hits[side]++; if (NREACH.includes(e.e)) ns.reach[side]++;
      if (e.p) { const id = e.p.id; ns.k[id] = e.e === 'K' ? (ns.k[id] || 0) + 1 : 0; if (ns.k[id] >= 3) out.push(`${nm(e.p)} ${ns.k[id]}타자 연속 삼진`); }
      if (e.e === 'HR' && e.runs === 4) out.push(`만루홈런! ${nm(e.b)}`); else if (e.e === 'HR' && e.runs >= 2) out.push(`${e.runs}점 홈런 — ${nm(e.b)}`);
    }
    const ls = this.liveScore(g), lead = Math.sign(ls.home - ls.away), tot = ls.home + ls.away;
    if (last || tot !== (ns.tot || 0)) {
      if (ns.lead === undefined) ns.lead = 0;
      if (!ns.any && tot > 0) { out.push(`선취점! ${ls.home > 0 ? tn(g.home) : tn(g.away)} (${ls.away}:${ls.home})`); ns.any = true; }
      else if (lead !== ns.lead && tot > 0) {
        if (lead === 0) out.push(`동점! ${ls.away}:${ls.home}`);
        else if (ns.lead !== 0) out.push(`역전! ${tn(lead > 0 ? g.home : g.away)} ${ls.away}:${ls.home}`);
      }
      ns.lead = lead; ns.tot = tot;
    }
    if (last && last.outs < 3 && !g.finished && g.bases[0] && g.bases[1] && g.bases[2]) out.push(`${last.outs}사 만루${g.fldSide === us ? ' — 위기입니다' : ' — 기회입니다'}`);
    if (g.finished && last && last.runs > 0 && !g.top && g.inning >= 9 && g.score.home > g.score.away) out.push(`끝내기! ${nm(last.b)}`);
    return out;
  };
  proto.liveNoHit = function (g, ns) {   // 초/말이 끝났을 때: 5회 이후에도 안타(또는 출루)를 하나도 못 친 팀이 있으면 알려 준다
    const done = g.top ? g.inning - 1 : g.inning; if (done < 5) return null;
    // 방금 끝난 half의 공격 팀 = 지금 top이면 home(말이 끝남), 아니면 away(초가 끝남)
    const bat = g.top ? 'home' : 'away', pit = bat === 'home' ? 'away' : 'home'; if (!ns.hits || ns.hits[bat] > 0) return null;
    const pn = KO[g[pit]] || g[pit];
    return ns.reach && ns.reach[bat] === 0 ? `${pn} 마운드, ${done}회까지 퍼펙트 진행 중` : `${pn} 마운드, ${done}회까지 노히트 진행 중`;
  };
  proto.momentInfo = function (g, us) {
    const opp = us === 'home' ? 'away' : 'home', ls = this.liveScore(g), diff = ls[us] - ls[opp], b = g.bases, inn = g.inning, outs = g.outs, runners = (b[0] ? 1 : 0) + (b[1] ? 1 : 0) + (b[2] ? 1 : 0), risp = !!(b[1] || b[2]);
    const late = inn >= 7, close = Math.abs(diff) <= 3; let kind = null;
    if (runners === 3) kind = 'loaded'; else if (inn >= 9 && diff === 0) kind = 'tie9'; else if (late && close && risp && outs === 2) kind = 'twoout'; else if (late && close && risp) kind = 'risp'; else if (late && Math.abs(diff) <= 1) kind = 'lead1'; else if (late && close && g.top === (us === 'home') && inn >= 9) kind = 'save';
    if (!kind) return null; return { kind, inn, top: g.top, outs, runners, diff, risp };
  };

  /* ---------------- 관심 선수·소식 보조 ---------------- */
  proto.favNews = function () { const S = this.S, f = S.favs || []; return f.map(id => S.players[id]).filter(Boolean); };

  /* ---------------- 데이터 무결성 점검 ----------------
     같은 사람이 두 번 들어 있거나(개명·동명이인 오매칭), 한 선수가 두 팀에 있거나, 계약·능력치에 이상한 값이 있는지 검사한다.
     반환: { errors: [...], warns: [...], checked: n } — 오류는 반드시 고쳐야 하는 문제, 경고는 확인이 필요한 의심 사례(동명이인 등). */
  proto.integrity = function () {
    const S = this.S, errors = [], warns = [], E = (code, text, ids) => errors.push({ code, text, ids: ids || [] }), W = (code, text, ids) => warns.push({ code, text, ids: ids || [] });
    const all = Object.values(S.players).filter(p => p && !p.retired && p.team !== 'RET' && p.team !== 'DRAFT'), teamOf = {};
    for (const t of Object.keys(S.teams)) for (const id of S.teams[t].ids) { if (teamOf[id]) E('two-teams', `${S.players[id] ? S.players[id].ko : id}이(가) ${teamOf[id]}와 ${t} 두 팀에 있습니다.`, [id]); teamOf[id] = t; if (!S.players[id]) E('missing', `${t} 명단의 ${id}에 해당하는 선수가 없습니다.`, [id]); else if (S.players[id].team !== t) E('team-mismatch', `${S.players[id].ko}의 소속(${S.players[id].team})과 ${t} 명단이 다릅니다.`, [id]); }
    for (const id of S.fa || []) if (S.players[id] && S.players[id].team !== 'FA') E('fa-mismatch', `${S.players[id].ko}이(가) FA 목록에 있지만 소속은 ${S.players[id].team}입니다.`, [id]);
    for (const p of all) {   // 부상 대체 외국인 일관성
      if (p.sub) { const o = S.players[p.sub.for]; if (p.team !== S.userTeam || !p.foreign || p.aq) E('sub-team', `${p.ko}의 대체 계약 상태가 올바르지 않습니다.`, [p.id]); else if (!o || o.team !== p.team || !o.rehab || o.rehab.sub !== p.id) E('sub-link', `${p.ko}와(과) 재활 선수명단 선수의 연결이 끊어져 있습니다.`, [p.id]); }
      if (p.rehab) { const c = S.players[p.rehab.sub]; if (!c || c.team !== p.team || !c.sub || c.sub.for !== p.id) E('rehab-link', `${p.ko}의 재활 선수명단 등재가 대체 선수와 연결되어 있지 않습니다.`, [p.id]); }
    }
    if (S.fSwap && S.fSwap.y === S.year && S.fSwap.n > 2) E('swap-count', `올 시즌 외국인 교체가 ${S.fSwap.n}회로 연 2회를 넘었습니다.`);
    const key = p => `${p.ko}|${p.type}`, groups = {};
    for (const p of all) (groups[key(p)] = groups[key(p)] || []).push(p);
    const dhKey = p => p.dh && p.dh.y && p.dh.school ? [p.dh.y, p.dh.dt, p.dh.round, p.dh.pick, p.dh.school, p.dh.kind].join('/') : null, dhs = {};
    for (const p of all) { const k = dhKey(p); if (k) (dhs[k] = dhs[k] || []).push(p); }
    for (const v of Object.values(dhs)) if (v.length > 1) E('dup-draft', `같은 드래프트 지명 이력(${v[0].dh.y}년 ${v[0].dh.school})을 가진 선수가 ${v.length}명입니다: ${v.map(p => p.ko + '(' + (KO[p.team] || p.team) + ')').join(', ')}`, v.map(p => p.id));
    for (const v of Object.values(groups)) {
      if (v.length < 2) continue; const foreign = v.filter(p => p.foreign);
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
        const a = v[i], b = v[j], tm = q => q.team in S.teams ? q.team : (q.faInfo && q.faInfo.from) || q.milTeam || q.team, sameTeam = tm(a) === tm(b), dA = dhKey(a), dB = dhKey(b);
        const grp = q => q.type !== 'B' ? null : q.pos === 'C' ? 'C' : ['1B', '2B', '3B', 'SS'].includes(q.pos) ? 'IF' : ['LF', 'CF', 'RF'].includes(q.pos) ? 'OF' : null, dataId = q => q.rookie === undefined && !q.virtual, distinct = (dataId(a) && dataId(b) && a.name !== b.name) || (grp(a) && grp(b) && grp(a) !== grp(b)) || (a.ns && b.ns) || (a.fpid && b.fpid && a.fpid !== b.fpid) || (dA && dB && dA !== dB) || (a.birth && b.birth && a.birth !== b.birth) || Math.abs(a.age - b.age) >= 3 || (a.foreign && b.foreign && a.name !== b.name) || (!!a.foreign !== !!b.foreign);
        if (a.birth && b.birth && a.birth === b.birth) E('dup-person', `${a.ko}: 생년월일(${a.birth})이 같은 선수가 둘 있습니다(${KO[a.team] || a.team}·${KO[b.team] || b.team}).`, [a.id, b.id]);
        else if (sameTeam && !distinct) E('dup-name', `${KO[a.team] || a.team}에 이름·유형·나이가 같은 ${a.ko}이(가) 두 명 있습니다. 개명·중복 가능성이 있습니다.`, [a.id, b.id]);
        else if (sameTeam && distinct && !(a.ns && b.ns) && !(dA && dB) && !(a.birth && b.birth) && Math.abs(a.age - b.age) < 5) W('namesake', `${KO[a.team] || a.team}의 동명이인 ${a.ko}(${a.age}세·${b.age}세)가 나이 차이만으로 구분됩니다. 같은 사람이면 한 명을 정리해야 합니다.`, [a.id, b.id]);
      }
    }
    for (const p of all) {
      if (!Number.isFinite(this.ovr(p))) E('ovr', `${p.ko}의 능력치가 올바르지 않습니다.`, [p.id]);
      if (p.team in S.teams) { const c = p.contract || {}; if (!(c.salary >= 0.3 || (p.sub && c.salary === 0)) || !(c.years >= 0 && c.years <= 12) || !Number.isFinite(c.salary)) E('contract', `${p.ko}의 계약(${JSON.stringify(c)})이 올바르지 않습니다.`, [p.id]); }
      if (!Number.isFinite(p.age) || p.age < 16 || p.age > 50) E('age', `${p.ko}의 나이(${p.age})가 올바르지 않습니다.`, [p.id]);
    }
    for (const t of Object.keys(S.teams)) { const fo = this.foreignOf(t), gen = fo.filter(p => !p.aq && !p.sub), aq = fo.filter(p => p.aq); if (gen.length > 3 || aq.length > 1) E('foreign-slot', `${KO[t] || t} 외국인 보유 한도 초과(일반 ${gen.length}/3, AQ ${aq.length}/1)`); if (S.teams[t].ids.length > LG.ROSTER_MAX + 6) E('roster', `${KO[t] || t} 보유 선수 ${S.teams[t].ids.length}명이 한도를 크게 넘습니다.`); }
    return { errors, warns, checked: all.length };
  };

  /* ================= 전역 검색 · 선수 비교 · 프런트 데스크(관리 허브) ================= (모두 읽기 전용: 게임 상태를 바꾸지 않는다) */
  const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
  const chosung = s => [...String(s || '')].map(ch => { const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch; }).join('');
  const POSK = { C: '포수', '1B': '1루수 내야수', '2B': '2루수 내야수', '3B': '3루수 내야수', SS: '유격수 내야수', LF: '좌익수 외야수', CF: '중견수 외야수', RF: '우익수 외야수', DH: '지명타자' };
  proto.chosung = chosung;
  /* 검색어: 이름 일부·초성(ㅇㅅㅈ)·영문 이름·팀명·포지션(투수/포수/내야수…)·태그(외국인/FA/2군)를 공백으로 섞어 쓸 수 있다. 숨은 능력은 노출하지 않는다 */
  proto.searchPlayers = function (q, limit) {
    const S = this.S, toks = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean); if (!toks.length) return [];
    const res = [];
    for (const p of Object.values(S.players)) {
      if (!p || p.retired || p.team === 'RET' || p.team === 'DRAFT') continue; if (!(p.team in S.teams) && p.team !== 'FA') continue;
      const tn = (KO[p.team] || (p.team === 'FA' ? 'FA 자유계약' : p.team)).toLowerCase(), ko = String(p.ko || '').toLowerCase(), cho = chosung(ko), en = String(p.name || '').toLowerCase();
      const tags = [p.type === 'P' ? '투수' : '타자 야수', p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : (POSK[p.pos] || ''), p.foreign ? '외국인' : '', p.aq ? '아시아쿼터 aq' : '', p.team === 'FA' ? 'fa 자유계약' : '', p.team in S.teams && !p.active ? '2군' : '', p.team in S.teams && p.active ? '1군' : '', p.team === S.userTeam ? '우리 내 팀' : '', this.isInj(p) ? '부상' : ''].join(' ').toLowerCase();
      let score = 0, okAll = true, nameHit = false;
      for (const t of toks) {
        const isCho = /^[ㄱ-ㅎ]+$/.test(t);
        if (!isCho && ko === t) { score += 100; nameHit = true; } else if (!isCho && ko.startsWith(t)) { score += 80; nameHit = true; } else if (!isCho && ko.includes(t)) { score += 60; nameHit = true; }
        else if (isCho && cho.includes(t)) { score += cho.startsWith(t) ? 58 : 50; nameHit = true; }
        else if (en && en.includes(t)) { score += 45; nameHit = true; }
        else if (tn.includes(t) || tags.includes(t)) score += 20;
        else { okAll = false; break; }
      }
      if (!okAll) continue; if (p.team === S.userTeam) score += 5; score += (this.hiddenForeign && this.hiddenForeign(p) ? 0 : this.ovr(p)) / 100;
      res.push({ p, score, nameHit });
    }
    res.sort((a, b) => b.score - a.score || a.p.ko.localeCompare(b.p.ko)); return res.slice(0, limit || 40);
  };
  proto.compareRows = function (ids) {
    const S = this.S, ps = ids.map(id => S.players[id]).filter(Boolean); if (ps.length < 2) return null;
    const hid = p => !!(this.hiddenForeign && this.hiddenForeign(p)), allB = ps.every(p => p.type === 'B'), allP = ps.every(p => p.type === 'P');
    const f3 = v => (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, '')), r1 = v => Math.round(v * 10) / 10;
    const bat = p => { const c = S.stats.bat[p.id]; if (!c || !c.PA) return null; const ab = c.PA - c.BB - c.HBP - c.SF, h = c['1B'] + c['2B'] + c['3B'] + c.HR; return { avg: ab ? h / ab : 0, hr: c.HR, rbi: c.RBI, pa: c.PA }; };
    const pit = p => { const c = S.stats.pit[p.id]; if (!c || !c.outs) return null; return { ra9: c.R * 27 / c.outs, ip: c.outs / 3, k: c.K }; };
    const rows = [], add = (label, get, o) => { o = o || {}; const vals = ps.map(p => { const v = get(p); return v === null || v === undefined || Number.isNaN(v) ? { v: null, txt: '-' } : { v, txt: o.fmt ? o.fmt(v) : String(v) }; }); const nums = vals.map(x => x.v); let best = -1; if (o.dir) { const live = nums.filter(x => x !== null); if (live.length >= 2) { const m = o.dir > 0 ? Math.max(...live) : Math.min(...live); if (live.filter(x => x === m).length === 1) best = nums.indexOf(m); } } rows.push({ label, vals, best, group: o.group || '' }); };
    add('OVR', p => hid(p) ? Math.round(this.fEst(p).o) : this.ovr(p), { dir: 1, group: '종합' });
    add('나이', p => p.age, { group: '종합' });
    add('가치(억)', p => hid(p) ? null : this.marketValue(p), { dir: 1, fmt: v => v.toFixed(1), group: '종합' });
    add('연봉(억)', p => (p.team in S.teams ? p.contract.salary : null), { fmt: v => v.toFixed(1), group: '계약' });
    add('계약 잔여(년)', p => (p.team in S.teams ? p.contract.years : null), { group: '계약' });
    if (allB) for (const k of ['컨택', '선구', '파워', '타구질', '장타', '주력', '수비']) add(k, p => (hid(p) ? null : this.sub(p)[k]), { dir: 1, group: '능력' });
    if (allP) for (const k of ['구위', '제구', '피홈런', '타구억제', '체력']) add(k, p => (hid(p) ? null : this.sub(p)[k]), { dir: 1, group: '능력' });
    if (allB) { add('타율', p => (bat(p) || {}).avg, { dir: 1, fmt: f3, group: '올 시즌' }); add('홈런', p => (bat(p) || {}).hr, { dir: 1, group: '올 시즌' }); add('타점', p => (bat(p) || {}).rbi, { dir: 1, group: '올 시즌' }); }
    if (allP) { add('RA9', p => (pit(p) || {}).ra9, { dir: -1, fmt: v => v.toFixed(2), group: '올 시즌' }); add('이닝', p => (pit(p) || {}).ip, { fmt: v => r1(v).toFixed(1), group: '올 시즌' }); add('탈삼진', p => (pit(p) || {}).k, { dir: 1, group: '올 시즌' }); }
    add('부상', p => (this.isInj(p) ? this.injLeft(p) : 0), { dir: -1, fmt: v => (v ? `${v}일` : '없음'), group: '상태' });
    return { cols: ps.map(p => ({ id: p.id, name: p.ko, team: p.team, pos: p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos, age: p.age, hidden: hid(p), foreign: !!p.foreign })), rows, mixed: !allB && !allP };
  };
  proto.deskInfo = function () {
    const S = this.S, t = S.userTeam, ps = this.players(t), todo = [], deadlines = [];
    const ev = this.eventsOpen(); if (ev.length) todo.push({ sev: 2, text: `결정이 필요한 소식 ${ev.length}건`, act: 'go', a: 'home' });
    const warns = this.validateEntry(); for (const w of warns.slice(0, 3)) todo.push({ sev: 2, text: String(w.text || w), act: 'go', a: 'lineup' });
    if (S.neg && S.neg.state === 'open') todo.push({ sev: 2, text: `진행 중인 협상: ${(S.players[S.neg.id] || {}).ko || ''}`, act: 'negOpen', a: `${S.neg.id}|${S.neg.kind}` });
    if (this.subList) for (const x of this.subList()) if (x.sub.back) todo.push({ sev: 3, text: `대체 외국인 ${x.p.ko}: ${Math.max(0, 7 - (S.day - x.sub.back))}일 안에 해지/정식 전환을 결정`, act: 'openFAMarket' });
    if (this.subEligible) for (const x of this.subEligible()) todo.push({ sev: 1, text: `${x.p.ko} ${x.days}일 부상 — 대체 외국인 영입 가능`, act: 'openFAMarket' });
    if (S.faMkt && !S.faMkt.closed) { const d = this.faDaysLeft(); deadlines.push({ label: 'FA 협상 마감', days: d }); }
    if (S.phase === 'regular') { const td = this.tradeDeadlineDay() - S.day; if (td >= 0 && this.canTrade()) deadlines.push({ label: '트레이드 마감', days: td }); if (this.postDeadline) { const pd = this.postDeadline(); if (!pd.passed) deadlines.push({ label: '포스트시즌 외국인 등록 마감(8/15)', days: pd.n - this.todayN() }); } }
    const inj = ps.filter(p => this.isInj(p)).map(p => ({ p, left: this.injLeft(p), ret: this.injDateStr(p) })).sort((a, b) => b.left - a.left);
    const tired = ps.filter(p => p.type === 'P' && p.active && !this.isInj(p)).map(p => ({ p, r: this.restInfo(p) })).filter(x => x.r.level === 'low').sort((a, b) => a.r.left - b.r.left);
    const faElig = ps.filter(p => this.faEligible(p)).map(p => ({ p, sal: p.contract.salary, ovr: this.ovr(p), grade: this.faGrade ? this.faGrade(p, t) : null })).sort((a, b) => b.ovr - a.ovr);   // 올 시즌 후 FA 자격을 얻는 선수(비FA 계약은 모두 1년이라 만료 인원 전체는 의미가 없다)
    const weakest = ty => Math.min(...ps.filter(p => p.active && p.type === ty).map(p => this.ovr(p)).concat([99]));
    const farm = ps.filter(p => !p.active && !this.isInj(p) && !p.sub).map(p => ({ p, ovr: this.ovr(p), gap: this.ovr(p) - weakest(p.type) })).filter(x => x.gap > 0).sort((a, b) => b.gap - a.gap);
    const fin = this.finReady() ? { room: this.faRoom(t), pay: this.finPay(t) } : null;
    const gen = this.foreignOf(t).filter(p => !p.aq && !p.sub), aq = this.foreignOf(t).filter(p => p.aq);
    if (inj.length) todo.push({ sev: 1, text: `부상자 ${inj.length}명 (가장 긴 복귀: ${inj[0].p.ko} ${inj[0].left}일)`, act: 'go', a: 'roster' });
    if (tired.length) todo.push({ sev: 1, text: `피로가 높은 투수 ${tired.length}명: ${tired.slice(0, 3).map(x => x.p.ko).join(', ')}`, act: 'go', a: 'pitching' });
    todo.sort((a, b) => b.sev - a.sev);
    return { todo, deadlines, inj, tired, faElig, farm: farm.slice(0, 4), fin, foreign: { gen: gen.length, aq: aq.length, swap: this.fSwapInfo ? this.fSwapInfo() : null, room: this.foreignRoom ? this.foreignRoom(t) : null }, scouts: (S.scouts || []).length, watch: this.scoutWatchList ? this.scoutWatchList().length : 0 };
  };

  /* ================= 연말 성장 공개 · 유망주 성장 서사 (읽기 전용: 이미 일어난 일을 보여 줄 뿐 결과를 바꾸지 않는다) ================= */
  const gTag = d => (d >= 5 ? '급성장' : d >= 2 ? '성장' : d >= -1 ? '유지' : d >= -4 ? '하락' : '급락');
  const ageBand = a => (a <= 22 ? '성장기 초반' : a <= 26 ? '성장기' : a <= 30 ? '전성기' : a <= 33 ? '노화 시작' : '노화 구간');
  proto.growthTag = gTag;
  proto.growthReveal = function () {
    const S = this.S, off = S.off; if (!off || !off.rep || !off.rep.prog) return null;
    const list = [];
    for (const x of off.rep.prog) {
      const p = S.players[x.id]; if (!p || p.retired || p.team !== S.userTeam) continue;
      const o1 = this.ovr(p), o0 = x.o0 !== undefined ? x.o0 : o1 - x.d, d = o1 - o0, s1 = this.sub(p), s0 = x.s0 || null, a1 = p.age, a0 = x.a0 !== undefined ? x.a0 : a1 - 1;
      const factors = [`만 ${a1}세 · ${ageBand(a1)}`]; if (x.ps !== undefined) factors.push(`올해 출전 비중 ${x.ps}%`); if (x.trd) factors.push(`개별 훈련 누적 ${x.trd}일`);
      list.push({ id: p.id, name: p.ko, pos: p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos, type: p.type, o0, o1, d, a0, a1, s0, s1, tag: gTag(d), factors, prospect: a1 <= 24, known: x.o0 !== undefined });
    }
    const reveal = list.filter(x => Math.abs(x.d) >= 2).sort((a, b) => Math.abs(a.d) - Math.abs(b.d) || a.d - b.d).slice(-15);   // 변화가 큰 선수일수록 뒤에(마지막이 가장 극적)
    const up = list.filter(x => x.d > 0), down = list.filter(x => x.d < 0), best = list.slice().sort((a, b) => b.d - a.d)[0] || null, worst = list.slice().sort((a, b) => a.d - b.d)[0] || null;
    return { list, reveal, summary: { n: list.length, up: up.length, down: down.length, same: list.length - up.length - down.length, avg: list.length ? Math.round(list.reduce((a, x) => a + x.d, 0) / list.length * 10) / 10 : 0, best, worst }, year: S.year };
  };
  proto.prospectNote = function (p) {
    const S = this.S; if (!p || p.team !== S.userTeam) return null;
    const hist = (p.ovrHist || []).map(h => ({ y: h.y, o: h.o })), cur = this.ovr(p), facts = [], dh = p.dh && p.dh.y ? p.dh : null;
    if (p.myFrom && p.myFrom.how) facts.push(`${p.myFrom.y} ${p.myFrom.how}`); else if (dh) facts.push(`${dh.y} 드래프트${dh.round ? ' ' + dh.round + '라운드' : ''}${dh.school ? ' · ' + dh.school : ''}`);
    const sl = this.trainCfg().slots.find(x => x.id === p.id); if (sl) facts.push('개별 훈련 중');
    if (p.debut1) facts.push(`${p.debut1.y}년 ${this.dateStr(p.debut1.d)} 1군 데뷔`);
    const st = p.type === 'B' ? S.stats.bat[p.id] : S.stats.pit[p.id], used = p.type === 'B' ? (st && st.PA ? `1군 ${st.PA}타석` : null) : (st && st.outs ? `1군 ${Math.floor(st.outs / 3)}이닝` : null); if (used) facts.push(`올해 ${used}`);
    const pts = hist.slice(); if (!pts.length || pts[pts.length - 1].o !== cur || pts[pts.length - 1].y !== S.year + (S.phase === 'offseason' ? 1 : 0)) pts.push({ y: S.year + (S.phase === 'offseason' ? 1 : 0), o: cur });
    const last = pts.length >= 2 ? pts[pts.length - 1].o - pts[pts.length - 2].o : null, first = pts[0].o, total = cur - first, next = Math.ceil((cur + 1) / 5) * 5;
    const parts = [];
    if (last !== null) parts.push(last >= 5 ? `지난 시즌 OVR ${last >= 0 ? '+' : ''}${last} 급성장` : last >= 2 ? `지난 시즌 OVR +${last} 성장` : last <= -2 ? `지난 시즌 OVR ${last} 하락` : '지난 시즌은 제자리');
    if (pts.length >= 3 && pts.every((x, i) => i === 0 || x.o > pts[i - 1].o)) parts.push(`${pts.length - 1}년 연속 상승`);
    if (pts.length >= 2 && Math.abs(total) >= 3) parts.push(`입단 후 ${total >= 0 ? '+' : ''}${total}`);
    if (p.debut1 && p.debut1.y === S.year) parts.push('올해 1군 데뷔');
    else if (!p.active && p.age <= 23) parts.push('2군에서 성장 중');
    parts.push(`다음 목표: OVR ${next} (+${next - cur})`);
    return { id: p.id, name: p.ko, age: p.age, pos: p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos, ovr: cur, spark: pts, facts, line: parts.join(' · '), active: !!p.active };
  };
  proto.prospectNotes = function (n) { return this.players(this.S.userTeam).filter(p => p.age <= 24 && !p.foreign).sort((a, b) => this.ovr(b) - this.ovr(a)).slice(0, n || 6).map(p => this.prospectNote(p)); };
});
