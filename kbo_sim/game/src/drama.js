/* 몰입 2단계: 라커룸 분위기 지수 · 기자회견 · 상대 감독 성향
 *  - 라커룸 분위기(내 구단, 0~100): 최근 10경기·불만 선수·선수 컨디션·주장·기자회견 효과의 합. 62 이상이면 선수 컨디션 +1, 35 이하면 −1(경기 엔진 입력, moodOf). ⚠ 가중치·임계값은 가정
 *  - 기자회견(내 구단 이벤트): 5연패·7연승·무단이탈·가을야구 확정/탈락 뒤(12일에 한 번). 선택이 라커룸 분위기·팀 컨디션·팬 충성도 지수·이사회 신뢰도에 작게 반영. ⚠ 크기는 가정
 *  - 상대 감독 성향(AI 구단): 작전 야구(컨택)·빅볼(장타)·신중한 승부·공격적 승부. 내 구단과의 경기에서 상대 팀 기본 작전으로 쓰인다(AI끼리 경기는 작전이 없는 빠른 계산이라 영향 없음). ⚠ 성향 배정은 게임 설정 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TEAMS, KO0 } = LG.OFFC;
  /* ---------------- 상대 감독 성향 ---------------- */
  const STY = { small: { n: '작전 야구', tip: '컨택 위주로 짧게 친다(삼진·홈런 감소)', bat: 'contact' }, big: { n: '빅볼', tip: '장타를 노린다(홈런·삼진 증가)', bat: 'power' }, careful: { n: '신중한 승부', tip: '볼넷을 감수하고 장타를 피한다', pit: 'careful' }, attack: { n: '공격적 승부', tip: '볼넷을 줄이고 정면 승부(피홈런 증가)', pit: 'attack' } };
  const KEYS = Object.keys(STY);
  proto.mgrStyle = function (t) {
    const S = this.S; if (t === S.userTeam) return null; const m = S.mgrStyle = S.mgrStyle || {};
    if (!m[t]) m[t] = KEYS[Math.floor(rngFor(S.seed, 4100 + TEAMS.indexOf(t)).random() * KEYS.length)];
    return Object.assign({ k: m[t] }, STY[m[t]]);
  };
  proto._applyMgrStyle = function (live, oppSide, opp) {   // 내 경기 시작 때 상대 팀 기본 작전
    const st = this.mgrStyle(opp); if (!st || !live.tact || !live.tact[oppSide]) return; if (st.bat) live.tact[oppSide].bat = st.bat; if (st.pit) live.tact[oppSide].pit = st.pit;
  };
  /* ---------------- 라커룸 분위기 ---------------- */
  proto.chemistry = function () {
    const S = this.S, t = S.userTeam, key = S.year + ':' + S.day + ':' + (S.results ? S.results.length : 0) + ':' + ((S.events && S.events.seq) || 0); if (this._chem && this._chem.key === key) return this._chem.v;
    const items = [], add = (l, x) => { x = Math.round(x * 10) / 10; if (Math.abs(x) >= 0.5) items.push([l, x]); return x; }; let v = 50;
    const games = S.results.filter(x => x.home === t || x.away === t).slice(-10), w = games.filter(x => (x.home === t ? x.rh > x.ra : x.ra > x.rh)).length, l = games.filter(x => (x.home === t ? x.rh < x.ra : x.ra < x.rh)).length;
    if (games.length) v += add(`최근 ${games.length}경기 ${w}승 ${l}패`, (w - l) * 2);
    const ps = this.players(t), un = ps.filter(p => p.unrest), unv = un.reduce((a, p) => a + ({ meeting: 4, request: 4, refused: 8, slack: 8 }[p.unrest.stage] || 12), 0); if (un.length) v += add(`불만 선수 ${un.length}명`, -Math.min(30, unv));
    const act = ps.filter(p => p.active), md = act.length ? act.reduce((a, p) => a + (p.mood && S.day < p.mood.until ? p.mood.v : 0), 0) / act.length : 0; v += add('선수 컨디션 평균', md * 4);
    if (this.captain && this.captain()) v += add('주장 있음', 5);
    const pa = (S.chemAdj || []).filter(x => x.until > S.day && x.y === S.year), ps2 = pa.reduce((a, x) => a + x.v, 0); if (pa.length) v += add('기자회견', ps2);
    const out = { v: clamp(Math.round(v), 0, 100), items }; out.tag = out.v >= 62 ? '최고' : out.v >= 55 ? '좋음' : out.v >= 45 ? '보통' : out.v > 35 ? '가라앉음' : '최악'; out.mood = out.v >= 62 ? 1 : out.v <= 35 ? -1 : 0;   // 측정 분포(p5 37·p50 50·p95 60)의 양쪽 끝 약 3%가 되게 대칭으로(⚠ 가정)
    this._chem = { key, v: out }; return out;
  };
  proto.chemMood = function () { return this.S.phase === 'offseason' || !this.S.results ? 0 : this.chemistry().mood; };
  proto._chemAdd = function (v, days, why) { const S = this.S; (S.chemAdj = S.chemAdj || []).push({ v, until: S.day + days, y: S.year, why }); S.chemAdj = S.chemAdj.filter(x => x.y === S.year && x.until > S.day); this._chem = null; this.invalidate(); };
  /* ---------------- 기자회견 ---------------- */
  const TOPIC = {
    slump: { title: '연패 뒤 기자회견', q: n => `${n}연패에 대해 기자들이 감독의 생각을 묻습니다.` },
    hot: { title: '연승 기자회견', q: n => `${n}연승의 비결을 묻는 질문이 쏟아집니다.` },
    awol: { title: '무단이탈 관련 기자회견', q: (n, p) => `${p}의 무단이탈에 대한 입장을 묻습니다.` },
    in: { title: '가을야구 확정 기자회견', q: () => '가을야구 진출 소감을 묻습니다.' },
    out: { title: '시즌 정리 기자회견', q: () => '가을야구 탈락에 대한 입장을 묻습니다.' }
  };
  proto._pressConDay = function (d) {
    const S = this.S; if (S.phase !== 'regular') return; const P = S.pcon = S.pcon && S.pcon.y === S.year ? S.pcon : { y: S.year, last: -99, done: {} }; if (d - P.last < 12) return;
    const t = S.userTeam, games = S.results.filter(x => x.home === t || x.away === t), wl = x => { const h = x.home === t, a = h ? x.rh : x.ra, b = h ? x.ra : x.rh; return a === b ? 'D' : a > b ? 'W' : 'L'; };
    let n = 0, k = null; for (const x of games.slice().reverse()) { const r = wl(x); if (k === null) k = r; if (r !== k) break; n++; }
    let topic = null, arg = n, who = '';
    const aw = this.players(t).find(p => p.unrest && p.unrest.stage === 'awol' && d - p.unrest.since <= 2 && !P.done['awol' + p.id]);
    if (aw) { topic = 'awol'; who = aw.ko; P.done['awol' + aw.id] = 1; }
    else if (S.clinch && S.clinch.y === S.year && S.clinch.k && d - S.clinch.d <= 2 && !P.done['c' + S.clinch.k]) { topic = S.clinch.k; P.done['c' + S.clinch.k] = 1; }
    else { const key = k + (games.length - n);   // 같은 연승·연패(시작 위치가 같은 흐름)에는 한 번만
      if (k === 'L' && n >= 5 && !P.done[key]) { topic = 'slump'; P.done[key] = 1; } else if (k === 'W' && n >= 7 && !P.done[key]) { topic = 'hot'; P.done[key] = 1; } }
    if (!topic) return;
    P.last = d; const T = TOPIC[topic], good = topic === 'hot' || topic === 'in';
    this._evAdd({ type: 'presscon', ttl: 4, def: 'quiet', rec: good ? 'credit' : 'shield', data: { topic, who }, title: T.title, text: `${T.q(arg, who)} 어떤 메시지를 낼까요? 선택은 라커룸 분위기·팬·이사회에 작게 반영됩니다.`, choices: [
      { k: good ? 'credit' : 'shield', label: good ? '선수들에게 공을 돌린다' : '선수들을 감싼다', hint: '라커룸 분위기 +6(14일)' },
      { k: 'push', label: good ? '방심을 경계한다' : '공개적으로 쓴소리', hint: '50%: 팀 컨디션 +1(7일) / 아니면 라커룸 분위기 −6(14일)' },
      { k: 'fans', label: good ? '팬들에게 감사를 전한다' : '팬들에게 사과한다', hint: '팬 충성도 지수 +2' },
      { k: 'quiet', label: '말을 아낀다', hint: '변화 없음' }] });
  };
  proto._pressConResolve = function (e, k) {
    const S = this.S, d = S.day, f = S.fin && S.fin.teams[S.userTeam], good = ['hot', 'in'].includes(e.data.topic); let msg = '', fan = '';
    if (k === 'credit' || k === 'shield') { this._chemAdd(6, 14, '기자회견'); msg = '선수들이 감독의 말에 힘을 얻었습니다(라커룸 분위기 +6, 14일).'; fan = good ? '팬 반응: "선수들 덕분이라는 말이 좋다"는 반응입니다.' : '팬 반응: "선수 탓을 안 해서 다행"이라는 반응과 "그래도 변화가 필요하다"는 의견이 섞였습니다.'; }
    else if (k === 'push') { if (rngFor(S.seed, S.year, d, 7611).random() < 0.5) { S.teamMood = { v: 1, until: d + 7 }; this.invalidate(); msg = '쓴소리가 자극제가 됐습니다(팀 컨디션 +1, 7일).'; fan = '커뮤니티: "감독이 제대로 짚었다"는 글이 늘었습니다.'; } else { this._chemAdd(-6, 14, '기자회견'); msg = '쓴소리에 선수단 분위기가 가라앉았습니다(라커룸 분위기 −6, 14일).'; fan = '커뮤니티: "선수 탓만 한다"는 비판이 나옵니다.'; } }
    else if (k === 'fans') { if (f) f.fl = Math.min(100, Math.round(((f.fl === undefined ? 100 : f.fl) + 2) * 10) / 10); msg = '팬들에게 진심을 전했습니다(팬 충성도 지수 +2).'; fan = '팬 반응: 감독의 메시지에 응원 댓글이 이어집니다.'; }
    else msg = '짧게 답하고 자리를 떠났습니다.';
    if (fan && this._press) this._press('race', { text: `[기자회견] ${e.title}`, fan });
    return msg;
  };
  /* ---------------- 감독 커리어 · 다른 구단의 감독 제의 ----------------
   *  커리어: S.history(시즌 종료 기록)의 userTeam·userRank·userRec·champion에서 계산(이 기능 이전 시즌은 구단 정보가 없어 '기록 없음'으로 센다).
   *  제의(시즌 종료 평가 직후, 해임이 아닐 때): 7위 이하로 끝난 AI 구단이 성과 좋은 감독에게. 확률 = 0.15 + 우승 0.4 + 3위 이내 0.2 + 감독 평판 65 이상 0.15(최대 2곳). ⚠ 확률·효과는 가정 */
  proto.mgrCareer = function () {
    const S = this.S, H = (S.history || []).filter(h => h.userRec), seasons = H.map(h => ({ y: h.year, t: h.userTeam || null, rank: h.userRank, w: h.userRec.w, l: h.userRec.l, d: h.userRec.d, champ: !!h.userTeam && h.champion === h.userTeam, ru: !!h.userTeam && h.runnerUp === h.userTeam }));
    const sum = k => seasons.reduce((a, x) => a + (x[k] || 0), 0), w = sum('w'), l = sum('l');
    return { seasons, n: seasons.length, w, l, d: sum('d'), pct: w + l ? w / (w + l) : 0, post: seasons.filter(x => x.rank <= 5).length, titles: seasons.filter(x => x.champ).length, ru: seasons.filter(x => x.ru).length, teams: [...new Set(seasons.map(x => x.t).filter(Boolean))], offers: (S.mgrOffers || []).slice() };
  };
  proto._mgrOffers = function () {
    const S = this.S, st = this.standings(), me = st.find(x => x.team === S.userTeam), champ = S.post && S.post.champion === S.userTeam, rep = this.reputation ? this.reputation().score : 50, r = rngFor(S.seed, S.year, 4200);
    const p = Math.min(0.9, 0.15 + (champ ? 0.4 : 0) + (me.rank <= 3 ? 0.2 : 0) + (rep >= 65 ? 0.15 : 0)); if (!(champ || me.rank <= 3 || rep >= 65)) return;
    const cand = st.filter(x => x.team !== S.userTeam && x.rank >= 7).map(x => x.team); let n = 0;
    for (const t of cand) { if (n >= 2 || r.random() >= p) continue; n++; const why = champ ? '우승 감독' : me.rank <= 3 ? `${me.rank}위 감독` : '평판 좋은 감독';
      (S.mgrOffers = S.mgrOffers || []).push({ y: S.year, t, res: null });
      this._evAdd({ type: 'mgroffer', ttl: 9999, def: 'decline', rec: 'decline', data: { t }, title: `${KO0[t] || t} 감독 제의`, text: `${KO0[t] || t}(올해 ${st.find(x => x.team === t).rank}위)가 ${why}인 당신에게 새 감독직을 제의했습니다. 옮기면 그 구단을 맡아 재건해야 합니다(이사회 신뢰도 62로 시작). 지금 구단에 남을 수도, 이 제의를 협상 카드로 쓸 수도 있습니다.`, choices: [
        { k: 'accept', label: `${KO0[t] || t}로 옮긴다`, hint: '새 구단 감독 취임 · 신뢰도 62로 시작 · 지금 구단의 진행 중 일은 정리됨' },
        { k: 'decline', label: '지금 구단에 남는다', hint: '의리 — 이사회 신뢰도 +3 · 팬 충성도 지수 +1' },
        { k: 'leverage', label: '협상 카드로 쓴다', hint: '60%: 이사회 신뢰도 +6 / 40%: 이사회가 불쾌해함 −3' }] }); }
    if (n) this._lnews(`다른 구단에서 감독 제의 ${n}건이 들어왔습니다`);
  };
  proto._mgrOfferResolve = function (e, k) {
    const S = this.S, t = e.data.t, rec = (S.mgrOffers || []).find(x => x.y === S.year && x.t === t), f = S.fin.teams[S.userTeam]; if (rec) rec.res = k;
    if (k === 'accept') { const old = S.userTeam; if (!this.takeOverTeam(t)) return '지금은 옮길 수 없습니다.'; S.fin.teams[t].trust = 62; this._lnews(`${KO0[old] || old} 감독이 ${KO0[t] || t}의 제의를 받아들여 자리를 옮겼습니다`); return `${KO0[t] || t} 감독으로 취임했습니다(이사회 신뢰도 62).`; }
    if (k === 'leverage') { if (rngFor(S.seed, S.year, 4201 + TEAMS.indexOf(t)).random() < 0.6) { f.trust = clamp(Math.round((f.trust + 6) * 10) / 10, 0, 100); return '이사회가 감독을 붙잡기 위해 힘을 실어 줍니다(신뢰도 +6).'; } f.trust = clamp(Math.round((f.trust - 3) * 10) / 10, 0, 100); return '이사회가 불쾌해합니다(신뢰도 −3).'; }
    f.trust = clamp(Math.round((f.trust + 3) * 10) / 10, 0, 100); f.fl = Math.min(100, Math.round(((f.fl === undefined ? 100 : f.fl) + 1) * 10) / 10); return '제의를 정중히 거절했습니다(이사회 신뢰도 +3, 팬 충성도 지수 +1).';
  };
});
