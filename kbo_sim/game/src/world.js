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

  /* ---------------- 동료 관계(같은 학교·입단 동기) ---------------- */
  proto.bonds = function (p) {
    if (!p || p.foreign || !(p.team in this.S.teams)) return []; const dh = p.dh || {}, out = [];
    for (const q of this.players(p.team)) { if (q.id === p.id || q.foreign) continue; const qd = q.dh || {};
      if (dh.school && qd.school === dh.school) out.push({ id: q.id, w: dh.y && dh.y === qd.y ? 3 : 2, why: dh.y && dh.y === qd.y ? '같은 학교 동기' : '같은 학교 선후배' });
      else if (dh.y && qd.y === dh.y && dh.dt && dh.dt === qd.dt) out.push({ id: q.id, w: 1.5, why: '입단 동기' }); }
    return out.sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : 1)).slice(0, 3);
  };
  proto._bondShift = function (p, dir, cause, list) {   // 친한 동료의 일에 영향을 받는다(충성도 ±1, 같은 선수 10일에 1번)
    const S = this.S, t = S.userTeam, bl = list || this.bonds(p);
    for (const b of bl) { const q = S.players[b.id]; if (!q || q.team !== t || q.foreign || q.id === p.id) continue; if (q.bondAt !== undefined && q.bondAt <= S.day && S.day - q.bondAt < 10) continue; q.bondAt = S.day; q.loyAdj = clamp((q.loyAdj || 0) + (dir > 0 ? 1 : -1), -15, 15);
      (S.bondLog = S.bondLog || []).unshift({ y: S.year, d: S.day, text: `${q.ko}: ${b.why}인 ${p.ko}의 ${cause} 소식에 ${dir > 0 ? '기분이 좋아졌습니다' : '마음이 불편합니다'} (충성도 ${dir > 0 ? '+1' : '−1'})` }); if (S.bondLog.length > 30) S.bondLog.pop(); }
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
    const r = rngFor(S.seed, S.year, 42, d.pick), best = d.pool.map(id => { const p = S.players[id]; return { id, s: this.scoutScore(p) + (r.random() - 0.5) * 4 }; }).sort((a, b) => b.s - a.s)[0];
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
  proto.momentInfo = function (g, us) {
    const opp = us === 'home' ? 'away' : 'home', diff = g.score[us] - g.score[opp], b = g.bases, inn = g.inning, outs = g.outs, runners = (b[0] ? 1 : 0) + (b[1] ? 1 : 0) + (b[2] ? 1 : 0), risp = !!(b[1] || b[2]);
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
    const key = p => `${p.ko}|${p.type}`, groups = {};
    for (const p of all) (groups[key(p)] = groups[key(p)] || []).push(p);
    const dhKey = p => p.dh && p.dh.y && p.dh.school ? [p.dh.y, p.dh.dt, p.dh.round, p.dh.pick, p.dh.school, p.dh.kind].join('/') : null, dhs = {};
    for (const p of all) { const k = dhKey(p); if (k) (dhs[k] = dhs[k] || []).push(p); }
    for (const v of Object.values(dhs)) if (v.length > 1) E('dup-draft', `같은 드래프트 지명 이력(${v[0].dh.y}년 ${v[0].dh.school})을 가진 선수가 ${v.length}명입니다: ${v.map(p => p.ko + '(' + (KO[p.team] || p.team) + ')').join(', ')}`, v.map(p => p.id));
    for (const v of Object.values(groups)) {
      if (v.length < 2) continue; const foreign = v.filter(p => p.foreign);
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
        const a = v[i], b = v[j], tm = q => q.team in S.teams ? q.team : (q.faInfo && q.faInfo.from) || q.milTeam || q.team, sameTeam = tm(a) === tm(b), dA = dhKey(a), dB = dhKey(b);
        const distinct = (a.ns && b.ns) || (a.fpid && b.fpid && a.fpid !== b.fpid) || (dA && dB && dA !== dB) || (a.birth && b.birth && a.birth !== b.birth) || Math.abs(a.age - b.age) >= 3 || (a.foreign && b.foreign && a.name !== b.name) || (!!a.foreign !== !!b.foreign);
        if (a.birth && b.birth && a.birth === b.birth) E('dup-person', `${a.ko}: 생년월일(${a.birth})이 같은 선수가 둘 있습니다(${KO[a.team] || a.team}·${KO[b.team] || b.team}).`, [a.id, b.id]);
        else if (sameTeam && !distinct) E('dup-name', `${KO[a.team] || a.team}에 이름·유형·나이가 같은 ${a.ko}이(가) 두 명 있습니다. 개명·중복 가능성이 있습니다.`, [a.id, b.id]);
        else if (sameTeam && distinct && !(a.ns && b.ns) && !(dA && dB) && !(a.birth && b.birth) && Math.abs(a.age - b.age) < 5) W('namesake', `${KO[a.team] || a.team}의 동명이인 ${a.ko}(${a.age}세·${b.age}세)가 나이 차이만으로 구분됩니다. 같은 사람이면 한 명을 정리해야 합니다.`, [a.id, b.id]);
      }
    }
    for (const p of all) {
      if (!Number.isFinite(this.ovr(p))) E('ovr', `${p.ko}의 능력치가 올바르지 않습니다.`, [p.id]);
      if (p.team in S.teams) { const c = p.contract || {}; if (!(c.salary >= 0.3) || !(c.years >= 0 && c.years <= 12) || !Number.isFinite(c.salary)) E('contract', `${p.ko}의 계약(${JSON.stringify(c)})이 올바르지 않습니다.`, [p.id]); }
      if (!Number.isFinite(p.age) || p.age < 16 || p.age > 50) E('age', `${p.ko}의 나이(${p.age})가 올바르지 않습니다.`, [p.id]);
    }
    for (const t of Object.keys(S.teams)) { const fo = this.foreignOf(t), gen = fo.filter(p => !p.aq), aq = fo.filter(p => p.aq); if (gen.length > 3 || aq.length > 1) E('foreign-slot', `${KO[t] || t} 외국인 슬롯 초과(일반 ${gen.length}/3, AQ ${aq.length}/1)`); if (S.teams[t].ids.length > LG.ROSTER_MAX + 6) E('roster', `${KO[t] || t} 보유 선수 ${S.teams[t].ids.length}명이 한도를 크게 넘습니다.`); }
    return { errors, warns, checked: all.length };
  };
});
