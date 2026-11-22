(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 시즌 중 이벤트 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, rngFor, TEAMS, clamp, LIM_DEADLINE, TRAITS, KO0, news, ACTIVE_MAX } = LG.OFFC;
  /* ---------------- 시즌 중 이벤트 ----------------
     S.events = { seq, list:[{id,type,day,year,title,text,choices:[{k,label,hint}],data,exp,status,result}] }
     - 선수 불만(출전 기회) · 스폰서 제안 · 팬 이벤트 · 이사회 중간 점검 · 월간 MVP(정보)
     - 새 이벤트가 생기면 advance()가 그날 멈춘다. 만료되면 기본 선택으로 자동 처리. */
  proto.eventsOpen = function () { const E = this.S.events; return E ? E.list.filter(e => e.status === 'open') : []; };
  proto._evAdd = function (e) { const S = this.S, E = S.events = S.events || { seq: 0, list: [] }; e.id = 'E' + (++E.seq); e.day = S.day; e.year = S.year; e.status = 'open'; e.exp = S.day + (e.ttl || 10); E.list.unshift(e); if (E.list.length > 60) E.list.length = 60; return e; };
  proto.compOpen = function () { return this.eventsOpen().filter(e => e.type === 'comp'); };   // 아직 내가 고르지 않은 FA 보상 선택
  proto._evCount = function (type) { const E = this.S.events; return E ? E.list.filter(e => e.type === type && e.year === this.S.year).length : 0; };
  proto._evOpenOf = function (type) { return this.eventsOpen().some(e => e.type === type); };
  proto._eventDay = function (d) {
    const S = this.S, t = S.userTeam, f = S.fin && S.fin.teams[t]; if (!f || S.phase !== 'regular' && S.phase !== 'preseason') return; if (S.phase === 'preseason' && d < 1) return;
    const r = rngFor(S.seed, S.year, d, 8800), E = S.events = S.events || { seq: 0, list: [] };
    { let ch = S.teamMood && S.teamMood.until === d; for (const p of this.players(t)) if (p.mood && p.mood.until === d) ch = true; if (ch) this.invalidate(); }   // 컨디션 효과 종료일에 엔진 입력 갱신
    if (this._promiseTick) this._promiseTick(d); if (this._loyDecay && d > 0 && d % 30 === 0) this._loyDecay(1);   // 충성도 보정 회복(30일마다 1)
    // 만료 → 기본 처리
    for (const e of this.eventsOpen()) if (d >= e.exp) this.resolveEvent(e.id, e.def || (e.choices[e.choices.length - 1] || {}).k, true);
    const open = this.eventsOpen().length; if (open >= 3) return;
    // 1) 이사회 중간 점검: 72일·120일차(경기일)
    if ((d === 72 || d === 120) && !E.list.some(e => e.type === 'board' && e.year === S.year && e.data.at === d)) {
      const st = this.standings(), me = st.find(x => x.team === t), pays = TEAMS.map(x => [x, this.finPay(x)]).sort((a, b) => b[1] - a[1]), exp = pays.findIndex(x => x[0] === t) + 1, gap = me.rank - exp;   // 기대 순위 = 선수단 보수 순위
      const v = this.finPreview(t), over = gap <= -2, under = gap >= 2;
      this._evAdd({ type: 'board', title: `이사회 중간 점검 (${me.w}승 ${me.l}패 · ${me.rank}위)`, ttl: 8, data: { at: d, gap, rank: me.rank, exp, op: Math.round(v.op) },
        text: over ? `보수 순위(${exp}위)를 웃도는 ${me.rank}위입니다. 이사회가 선전을 평가하며 보강 투자를 제안합니다.` : under ? `보수 순위(${exp}위)에 못 미치는 ${me.rank}위입니다. 이사회가 성적 부진에 우려를 표했습니다. 시즌 예상 손익 ${Math.round(v.op)}억.` : `기대 순위(${exp}위)와 비슷한 ${me.rank}위입니다. 이사회가 시즌 후반 운영 방향을 묻습니다.`,
        choices: over ? [{ k: 'invest', label: '보강 예산 5억 승인 받기', hint: '신뢰도 변화 없음, 올 시즌 FA 예산 +5억' }, { k: 'thanks', label: '감사 표하고 넘어가기', hint: '신뢰도 +2' }] : under ? [{ k: 'plead', label: '보강 예산 요청', hint: `확률 ${Math.round(clamp(0.2 + 0.5 * f.trust / 100, 0.1, 0.8) * 100)}% 성공 시 +6억, 실패 시 신뢰도 −3`, def: false }, { k: 'accept', label: '책임 인정(조용히 넘어감)', hint: '신뢰도 −1' }] : [{ k: 'hold', label: '현 전력 유지', hint: '변화 없음' }, { k: 'ask', label: '소폭 증액 요청', hint: '신뢰도 −1, 예산 +2억' }], def: over ? 'thanks' : under ? 'accept' : 'hold' });
      return;
    }
    // 2) 선수 불만(출전 기회) — 하루 4%
    if (!this._evOpenOf('grievance') && r.random() < 0.04) {   // 모범생은 불만을 잘 드러내지 않는다(후보에서 절반 제외)
      const act = this.players(t).filter(p => p.active), med = act.map(p => this.ovr(p)).sort((a, b) => a - b)[Math.floor(act.length * 0.5)] || 0, rec = new Set((E.list || []).filter(e => e.type === 'grievance' && e.day > d - 40).map(e => e.data.pid));
      const c = this.players(t).filter(p => !p.active && !this.isInj(p) && !p.foreign && this.ovr(p) >= med + 4 && !rec.has(p.id) && !p.lockUntil && !(this.traitOf(p) === 'model' && r.random() < 0.5)).sort((a, b) => this.ovr(b) - this.ovr(a))[0];
      if (c) { this._evAdd({ type: 'grievance', title: `${c.ko} 출전 기회 불만`, ttl: 7, data: { pid: c.id }, text: `2군에 있는 ${c.ko}(OVR ${this.ovr(c)})가 "1군 경기에 뛸 자격이 있다"며 면담을 요청했습니다. (1군 중앙값 OVR ${med})`,
        choices: [{ k: 'promote', label: '1군에 등록한다', hint: '엔트리에 여유가 있어야 합니다. 충성도 +4' }, { k: 'talk', label: '면담으로 설득한다', hint: `성공 ${Math.round(clamp(0.35 + (this.loyalty(c) ? this.loyalty(c).v : 40) / 200, 0.2, 0.85) * 100)}% — 성공 시 충성도 +1, 실패 시 −5` }, { k: 'ignore', label: '무시한다', hint: '충성도 −6' }], def: 'ignore' }); return; }
    }
    // 2b) 부진(슬럼프): 최근 경기 성적이 나쁜 1군 선수 — 하루 3%, 같은 선수 30일 간격
    if (!this._evOpenOf('slump') && r.random() < 0.03) {
      const rec = new Set((E.list || []).filter(e => e.type === 'slump' && e.day > d - 30).map(e => e.data.pid)), form = p => { const x = S.recent[p.id] || []; if (p.type === 'B') { let ab = 0, h = 0; for (const e of x) { ab += e[1]; h += e[2]; } return ab >= 30 ? { bad: h / ab < 0.17 + (['free', 'shy'].includes(this.traitOf(p)) ? 0.018 : 0), txt: `최근 ${x.length}경기 타율 ${(h / ab).toFixed(3).slice(1)}`, s: h / ab } : null; } let o = 0, R = 0; for (const e of x) { o += e[1]; R += e[2]; } return o >= 18 ? { bad: R * 27 / o > 8.5, txt: `최근 ${x.length}경기 RA9 ${(R * 27 / o).toFixed(2)}`, s: -R * 27 / o } : null; };
      const c = this.players(t).filter(p => p.active && !rec.has(p.id)).map(p => ({ p, f: form(p) })).filter(x => x.f && x.f.bad).sort((a, b) => a.f.s - b.f.s)[0];
      if (c) { const p = c.p, pr = Math.round(clamp(0.45 + 0.15 * (this.coachRating(t, p.type === 'P' ? 'control' : 'contact') - 55) / 20, 0.3, 0.75) * 100);
        this._evAdd({ type: 'slump', title: `${p.ko} 부진`, ttl: 6, data: { pid: p.id }, text: `${p.ko}(OVR ${this.ovr(p)})가 ${c.f.txt}로 부진합니다. 대응에 따라 컨디션(경기 능력치 ±)이 바뀝니다.`,
          choices: [{ k: 'coach', label: '코치진 집중 지도 (비용 0.3억)', hint: `성공 ${pr}% → 20일간 컨디션 +2, 실패 → 10일간 −1` }, { k: 'trust', label: '믿고 계속 기용', hint: '40% 회복(14일 +1), 60% 부진 지속(14일 −1)' }, { k: 'farm', label: '2군 재조정 (10경기일 등록 불가)', hint: '2군으로 내리고 복귀 시 25일간 컨디션 +2' }], def: 'trust' }); return; }
    }
    // 2c) 연승·연패: 선수단 분위기 — 연승 7·연패 6 이상
    if (!this._evOpenOf('streak') && !(E.list || []).some(e => e.type === 'streak' && e.day > d - 20)) {
      const g = (S.results || []).filter(x => x.home === t || x.away === t).slice(-12).map(x => { const my = x.home === t ? x.rh : x.ra, op = x.home === t ? x.ra : x.rh; return my > op ? 1 : my < op ? -1 : 0; }); let n = 0, k = g.length ? g[g.length - 1] : 0; for (let i = g.length - 1; i >= 0 && g[i] === k && k; i--) n++;
      if (k === 1 && n >= 7) { this._evAdd({ type: 'streak', title: `${n}연승 — 선수단 분위기`, ttl: 5, data: { kind: 'win', n }, text: `팀이 ${n}연승 중입니다. 분위기를 이어갈 방법을 고르세요.`,
          choices: [{ k: 'bonus', label: '연승 격려금 (0.3억)', hint: '20일간 팀 컨디션 +1' }, { k: 'rest', label: '선수단 휴식 배려', hint: '14일간 부상 위험 −30%' }, { k: 'none', label: '그대로 진행', hint: '변화 없음' }], def: 'none' }); return; }
      if (k === -1 && n >= 6) { this._evAdd({ type: 'streak', title: `${n}연패 — 선수단 분위기`, ttl: 5, data: { kind: 'lose', n }, text: `팀이 ${n}연패 중입니다. 분위기 반전이 필요합니다.`,
          choices: [{ k: 'meeting', label: '선수단 면담·미팅', hint: '60% 성공: 15일간 팀 컨디션 +1, 실패: 7일간 −1' }, { k: 'camp', label: '휴식일 부여(훈련 강도 ↓)', hint: '10일간 팀 컨디션 +1, 부상 위험 −20%' }, { k: 'none', label: '정면 돌파(그대로)', hint: '변화 없음' }], def: 'none' }); return; }
    }
    // 2c2) 선수 요청 트레이드 — 충성도가 많이 깎였거나 자유분방 + 컨디션 부진, 하루 5%, 시즌 2회
    if (!this._evOpenOf('request') && this._evCount('request') < 2 && d > 10 && d < LIM_DEADLINE - 3 && this.canTrade() && r.random() < 0.05) {
      const c = this.players(t).filter(p => !p.foreign && p.rookie !== S.year && !this.isInj(p) && ((p.loyAdj || 0) <= -5 || (this.traitOf(p) === 'free' && this.moodOf(p) <= -2))).sort((a, b) => (a.loyAdj || 0) - (b.loyAdj || 0))[0];
      if (c) { const off = this._offerFor(c, r); if (off) { const cap = this.captain(), pr = Math.round(clamp(0.3 + (cap ? 0.15 * (this.traitOf(cap) === 'leader' ? 1.5 : 1) : 0) + (this.loyalty(c) ? this.loyalty(c).v : 40) / 250 + (this.traitOf(c) === 'leader' ? 0.1 : this.traitOf(c) === 'free' ? -0.1 : 0), 0.1, 0.85) * 100);
        this._evAdd({ type: 'request', title: `${c.ko} 트레이드 요청`, ttl: 7, data: { pid: c.id, t: off.t, get: off.y.id }, text: `${c.ko}(${TRAITS[this.traitOf(c)]}, OVR ${this.ovr(c)})가 구단에 트레이드를 요청했습니다. ${KO0[off.t]}가 ${off.y.ko}(OVR ${this.ovr(off.y)})와의 맞교환에 응할 의사가 있습니다.`,
          choices: [{ k: 'trade', label: `요청 수락: ${c.ko} ↔ ${off.y.ko}`, hint: `즉시 트레이드(받는 선수는 2군 등록)` }, { k: 'talk', label: `면담으로 설득${cap ? ' (주장 도움)' : ''}`, hint: `성공 ${pr}% — 성공 시 충성도 +5·컨디션 +1(15일), 실패 시 컨디션 −2` }, { k: 'refuse', label: '요청 거절', hint: '충성도 −4·컨디션 −2(30일)' }], def: 'refuse' }); return; } }
    }
    // 2c3) 선수 갈등 — 같은 포지션 1군 선수 중 승부사/자유분방 조합, 하루 2%, 시즌 1회
    if (!this._evOpenOf('conflict') && this._evCount('conflict') < 1 && d > 15 && r.random() < 0.02) {
      const act = this.players(t).filter(p => p.active && p.type === 'B' && !this.isInj(p)), by = {}; for (const p of act) (by[p.pos] = by[p.pos] || []).push(p);
      const pair = Object.values(by).map(g => g.filter(p => ['clutch', 'free'].includes(this.traitOf(p)))).find(g => g.length >= 2);
      if (pair) { const [a, b] = pair, cap = this.captain(), pm = Math.round(clamp(cap ? 0.6 + (this.traitOf(cap) === 'leader' ? 0.2 : 0) : 0.25, 0.1, 0.9) * 100);
        this._evAdd({ type: 'conflict', title: `${a.ko}·${b.ko} 갈등`, ttl: 6, data: { a: a.id, b: b.id }, text: `같은 ${a.pos} 자리를 놓고 ${a.ko}(${TRAITS[this.traitOf(a)]})와 ${b.ko}(${TRAITS[this.traitOf(b)]})의 신경전이 클럽하우스로 번지고 있습니다.`,
          choices: [{ k: 'captain', label: cap ? `주장 ${cap.ko}가 중재` : '주장 없이 중재(성공 낮음)', hint: `성공 ${pm}% — 성공 시 팀 컨디션 +1(10일), 실패 시 −1(7일)` }, { k: 'talk', label: '각각 면담 (0.2억)', hint: '성공 55% — 성공 시 팀 컨디션 +1(8일), 실패 시 −1(7일)' }, { k: 'ignore', label: '지켜본다', hint: '팀 컨디션 −1(10일)' }], def: 'ignore' }); return; }
    }
    // 2d) AI 트레이드 제안 — 하루 1.5%, 시즌 3회, 마감 전
    if (!this._evOpenOf('trade') && this._evCount('trade') < 3 && d > 8 && d < LIM_DEADLINE - 5 && r.random() < 0.015) {
      const o = this._tradeOffer(r);
      if (o) { const d1 = (p, tt) => `${p.ko} (${p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos} · OVR ${this.ovr(p)} · ${p.age}세 · 연봉 ${p.contract.salary}억 · ${p.contract.years}년)`;
        this._evAdd({ type: 'trade', title: `${KO0[o.t]} 트레이드 제안`, ttl: 6, data: { t: o.t, give: o.mine.id, get: o.y.id }, text: `${KO0[o.t]}가 ${o.mine.ko}를 원합니다. 대가로 ${o.y.ko}를 제시했습니다. 수락하면 즉시 이동하며 2군에 등록됩니다.`,
          choices: [{ k: 'accept', label: `수락: ${o.mine.ko} ↔ ${o.y.ko}`, hint: `내줌: ${d1(o.mine)} / 받음: ${d1(o.y)}` }, { k: 'decline', label: '거절', hint: '변화 없음' }], def: 'decline' }); return; }
    }
    // 3) 스폰서 제안 — 하루 1.2%, 시즌 2회
    if (!this._evOpenOf('sponsor') && this._evCount('sponsor') < 2 && d > 10 && d < 120 && r.random() < 0.012) {
      const amt = Math.round(f.lastRev * (0.004 + 0.004 * r.random()) * 10) / 10;
      this._evAdd({ type: 'sponsor', title: '구장 광고·스폰서 확대 제안', ttl: 10, data: { amt }, text: `모기업 계열 스폰서가 구장 광고판과 중계 노출 확대를 조건으로 시즌 ${amt}억을 제안했습니다. 다만 광고 확대로 관람 환경이 다소 나빠질 수 있습니다(관중 −1.5%).`,
        choices: [{ k: 'accept', label: `수락 (+${amt}억)`, hint: '올 시즌 매출 +' + amt + '억, 관중 −1.5%' }, { k: 'decline', label: '거절', hint: '변화 없음' }], def: 'decline' }); return;
    }
    // 4) 팬 이벤트 — 하루 1.2%, 시즌 2회
    if (!this._evOpenOf('promo') && this._evCount('promo') < 2 && d > 5 && d < 130 && !(f.promo && d < f.promo.until) && r.random() < 0.012) {
      const cost = Math.round(f.lastRev * 0.001 * 10) / 10;
      this._evAdd({ type: 'promo', title: '팬 감사 이벤트 제안', ttl: 8, data: { cost }, text: `마케팅팀이 팬 사인회·유니폼 증정 이벤트를 제안했습니다. 비용 ${cost}억, 향후 20일 홈 관중 +6% 예상.`,
        choices: [{ k: 'go', label: `진행 (−${cost}억)`, hint: '운영비 +' + cost + '억, 20일간 관중 +6%' }, { k: 'skip', label: '보류', hint: '변화 없음' }], def: 'skip' }); return;
    }
    // 5) 월간 MVP(정보) — 30일마다
    if (d > 0 && d % 30 === 0) {
      const bat = Object.entries(S.stats.bat).map(([id, c]) => ({ p: S.players[id], c })).filter(x => x.p && x.p.team === t && x.c.PA >= 40).map(x => { const ab = x.c.PA - x.c.BB - x.c.HBP - x.c.SF, h = x.c['1B'] + x.c['2B'] + x.c['3B'] + x.c.HR; return { p: x.p, s: (ab ? h / ab : 0) + 0.02 * x.c.HR / Math.max(1, x.c.PA / 20), txt: `${x.p.ko} 타율 ${ab ? (h / ab).toFixed(3).slice(1) : '-'} ${x.c.HR}홈런 ${x.c.RBI}타점` }; });
      const pit = Object.entries(S.stats.pit).map(([id, c]) => ({ p: S.players[id], c })).filter(x => x.p && x.p.team === t && x.c.outs >= 45).map(x => ({ p: x.p, s: 1.2 - x.c.R * 27 / x.c.outs / 10 + x.c.K / 400, txt: `${x.p.ko} ${(x.c.R * 27 / x.c.outs).toFixed(2)} RA9 ${x.c.K}탈삼진` }));
      const best = bat.concat(pit).sort((a, b) => b.s - a.s)[0]; if (best) news(this, `${S.year} ${Math.floor(d / 30)}개월차 팀 MVP: ${best.txt}`);
    }
  };
  /* 월별 재정 스냅샷(내 팀): 월말 기준 시즌 예상 손익·평균 관중·순위. 매 경기일 갱신해 달이 바뀌면 직전 달 값이 남는다 */
  proto._finSnapDay = function (d) {
    const S = this.S; if (!this.finReady() || S.phase !== 'regular' && S.phase !== 'preseason') return; const t = S.userTeam, f = S.fin.teams[t]; if (!f) return;
    const m = this.dateOf(d).getUTCMonth() + 1, v = this.finPreview(t), me = this.standings().find(x => x.team === t); f.snap = f.snap || [];
    const row = { m, day: d, op: Math.round(v.op * 10) / 10, att: v.att, price: f.price * f.pm, games: f.games, gate: Math.round(f.gate * 10) / 10, rank: me.rank, w: me.w, l: me.l, pay: v.pay, room: v.room, trust: f.trust };
    const last = f.snap[f.snap.length - 1]; if (last && last.m === m) f.snap[f.snap.length - 1] = row; else f.snap.push(row);
  };
  proto.resolveEvent = function (id, k, auto, opts) {
    const S = this.S, t = S.userTeam, f = S.fin.teams[t], e = ((S.events || {}).list || []).find(x => x.id === id); if (!e || e.status !== 'open') return { ok: false, msg: '처리할 수 없는 소식입니다.' };
    let res = '';
    const adj = (p, v) => { p.loyAdj = clamp((p.loyAdj || 0) + v, -15, 15); }, mood = (p, v, days) => { p.mood = { v, until: S.day + days }; this.invalidate(); }, tmood = (v, days) => { S.teamMood = { v, until: S.day + days }; this.invalidate(); }, rr = salt => rngFor(S.seed, S.year, S.day, salt).random();
    if (e.type === 'grievance') {
      const p = S.players[e.data.pid];
      if (!p || p.team !== t) res = '선수가 이미 팀을 떠났습니다.';
      else if (k === 'promote') { const err = this.moveActive(p.id, true); if (err) { if (!auto) return { ok: false, msg: err }; adj(p, -6); mood(p, -2, 30); res = `${p.ko} 불만을 처리하지 못했습니다(${err}). 컨디션 −2(30일).`; } else { adj(p, 4); mood(p, 1, 20); res = `${p.ko}을(를) 1군에 등록했습니다. 충성도 +4, 컨디션 +1(20일).`; } }
      else if (k === 'talk') { const pr = clamp(0.35 + (this.loyalty(p) ? this.loyalty(p).v : 40) / 200, 0.2, 0.85); if (opts && opts.talk !== undefined ? opts.talk : rngFor(S.seed, S.year, S.day, 8810 + parseInt(p.id.slice(1))).random() < pr) { adj(p, 1); mood(p, 1, 15); res = `면담이 잘 풀렸습니다. ${p.ko} 충성도 +1, 컨디션 +1(15일).`; } else { adj(p, -5); mood(p, -2, 20); res = `면담이 결렬되었습니다. ${p.ko} 충성도 −5, 컨디션 −2(20일).`; } }
      else { const hv = this.traitOf(p) === 'clutch' ? 3 : this.traitOf(p) === 'model' ? 1 : 2; adj(p, -6); mood(p, -hv, 30); res = `${p.ko}(${TRAITS[this.traitOf(p)]}) 불만을 방치했습니다. 충성도 −6(FA·재계약 협상), 컨디션 −${hv}(30일).`; }
    } else if (e.type === 'slump') {
      const p = S.players[e.data.pid];
      if (!p || p.team !== t) res = '선수가 팀을 떠났습니다.';
      else if (k === 'coach') { f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; if (rr(8830 + parseInt(p.id.slice(1))) < clamp(0.45 + 0.15 * (this.coachRating(t, p.type === 'P' ? 'control' : 'contact') - 55) / 20 + (this.traitOf(p) === 'shy' ? -0.1 : this.traitOf(p) === 'leader' ? 0.05 : 0), 0.2, 0.75)) { mood(p, 2, 20); res = `${p.ko} 집중 지도 성공: 컨디션 +2(20일).`; } else { mood(p, -1, 10); res = `${p.ko} 집중 지도가 통하지 않았습니다: 컨디션 −1(10일).`; } }
      else if (k === 'farm') { const err = this.moveActive(p.id, false); if (err) { res = `2군 재조정 불가(${err}).`; } else { mood(p, 2, 25); res = `${p.ko}을(를) 2군에서 재조정합니다. 복귀 후 컨디션 +2(~25일).`; } }
      else { if (rr(8840 + parseInt(p.id.slice(1))) < (this.traitOf(p) === 'clutch' ? 0.5 : this.traitOf(p) === 'shy' ? 0.3 : 0.4)) { mood(p, 1, 14); res = `${p.ko}이(가) 부진을 털었습니다: 컨디션 +1(14일).`; } else { mood(p, -1, 14); res = `${p.ko}의 부진이 이어집니다: 컨디션 −1(14일).`; } }
    } else if (e.type === 'streak') {
      if (k === 'bonus') { f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; tmood(1, 20); res = '격려금 지급: 팀 컨디션 +1(20일), 비용 0.3억.'; }
      else if (k === 'rest') { S.restUntil = S.day + 14; res = '휴식 배려: 14일간 부상 위험 −30%.'; }
      else if (k === 'meeting') { if (rr(8850) < 0.6) { tmood(1, 15); res = '면담 성공: 팀 컨디션 +1(15일).'; } else { tmood(-1, 7); res = '면담이 역효과: 팀 컨디션 −1(7일).'; } }
      else if (k === 'camp') { S.restUntil = S.day + 10; tmood(1, 10); res = '휴식일 부여: 팀 컨디션 +1(10일), 부상 위험 −20%.'; }
      else res = '그대로 진행합니다.';
    } else if (e.type === 'sponsor') {
      if (k === 'accept') { f.evRev = Math.round(((f.evRev || 0) + e.data.amt) * 10) / 10; f.attMult = (f.attMult || 1) * 0.985; res = `스폰서 계약 체결: 올 시즌 매출 +${e.data.amt}억, 관중 −1.5%.`; } else res = '제안을 거절했습니다.';
    } else if (e.type === 'promo') {
      if (k === 'go') { f.evCost = Math.round(((f.evCost || 0) + e.data.cost) * 10) / 10; f.promo = { until: S.day + 20, mult: 1.06 }; res = `팬 이벤트 진행: 비용 ${e.data.cost}억, 20일간 관중 +6%.`; } else res = '이벤트를 보류했습니다.';
    } else if (e.type === 'request') {
      const D = e.data, p = S.players[D.pid];
      if (!p || p.team !== t) res = '선수가 이미 팀을 떠났습니다.';
      else if (k === 'trade') { const ev = this.executeTrade(D.t, [D.pid], [D.get]); res = ev.ok ? `요청을 수락해 트레이드했습니다: ${S.players[D.get].ko} 영입(2군 등록), ${p.ko} 이적.` : `트레이드가 성사되지 않았습니다(${ev.why || '조건 변경'}).`; }
      else if (k === 'talk') { const cap = this.captain(), pr = clamp(0.3 + (cap ? 0.15 * (this.traitOf(cap) === 'leader' ? 1.5 : 1) : 0) + (this.loyalty(p) ? this.loyalty(p).v : 40) / 250 + (this.traitOf(p) === 'leader' ? 0.1 : this.traitOf(p) === 'free' ? -0.1 : 0), 0.1, 0.85); if (opts && opts.talk !== undefined ? opts.talk : rr(8860 + parseInt(p.id.slice(1))) < pr) { adj(p, 5); mood(p, 1, 15); res = `면담이 통했습니다. ${p.ko} 잔류 — 충성도 +5, 컨디션 +1(15일).`; } else { mood(p, -2, 20); res = `설득에 실패했습니다. ${p.ko} 컨디션 −2(20일).`; } }
      else { adj(p, -4); mood(p, -2, 30); res = `요청을 거절했습니다. ${p.ko} 충성도 −4, 컨디션 −2(30일).`; }
    } else if (e.type === 'conflict') {
      const cap = this.captain(), pm = clamp(cap ? 0.6 + (this.traitOf(cap) === 'leader' ? 0.2 : 0) : 0.25, 0.1, 0.9);
      if (k === 'captain') { if (rr(8870) < pm) { tmood(1, 10); res = '주장의 중재가 통했습니다: 팀 컨디션 +1(10일).'; } else { tmood(-1, 7); res = '중재가 먹히지 않았습니다: 팀 컨디션 −1(7일).'; } }
      else if (k === 'talk') { f.evCost = Math.round(((f.evCost || 0) + 0.2) * 10) / 10; if (rr(8871) < 0.55) { tmood(1, 8); res = '면담 후 화해했습니다: 팀 컨디션 +1(8일), 비용 0.2억.'; } else { tmood(-1, 7); res = '면담이 오히려 불씨가 됐습니다: 팀 컨디션 −1(7일), 비용 0.2억.'; } }
      else { tmood(-1, 10); res = '갈등을 방치했습니다: 팀 컨디션 −1(10일).'; }
    } else if (e.type === 'return') {
      const p = S.players[e.data.pid];
      if (!p || p.team !== t) res = '선수가 팀을 떠났습니다.';
      else if (k === 'callup') { if (p.active) res = `${p.ko}을(를) 1군에 콜업했습니다.`; else if (this.players(t).filter(x => x.active).length < ACTIVE_MAX) { const err = this.moveActive(p.id, true); if (err) { if (!auto) return { ok: false, msg: err }; res = err; } else res = `${p.ko}을(를) 1군에 콜업했습니다.`; } else if (!auto) return { ok: false, need: 'swap', msg: '1군 엔트리가 가득 찼습니다. 교체할 선수를 고르세요.' }; else res = '엔트리가 가득 차 콜업하지 못했습니다.'; }
      else res = `${p.ko}은(는) 2군에서 컨디션을 조절합니다.`;
    } else if (e.type === 'trade') {
      const D = e.data;
      if (k !== 'accept') res = '제안을 거절했습니다.';
      else { const ev = this.executeTrade(D.t, [D.give], [D.get]); res = ev.ok ? `트레이드 성사: ${S.players[D.get].ko} 영입(2군 등록), ${S.players[D.give].ko} 이적.` : `성사되지 않았습니다(${ev.why || ev.msg || '조건 변경'}).`; }
    } else if (e.type === 'camp') {
      res = this._campEvResolve(e, k);
    } else if (e.type === 'comp') {
      const D = e.data, fa = S.players[D.fa], pid = k && k.startsWith('p:') ? k.slice(2) : null, pl = pid ? S.players[pid] : null, valid = pl && pl.team === D.signer;
      for (const id of D.cands || []) if (S.players[id]) delete S.players[id].compHold;
      const lg = (S.compLog || []).find(c => c.pending && c.id === D.fa); if (lg) { const i = S.compLog.indexOf(lg); S.compLog.splice(i, 1); }
      res = this._compApply(D.signer, t, fa, D.grade, D.prev, valid ? pid : null);
    } else if (e.type === 'board') {
      const tr = d => { f.trust = clamp(Math.round((f.trust + d) * 10) / 10, 0, 100); };
      if (k === 'invest') { f.boardExtra = (f.boardExtra || 0) + 5; res = '이사회가 보강 예산 5억을 승인했습니다.'; }
      else if (k === 'thanks') { tr(2); res = '이사회 신뢰도 +2.'; }
      else if (k === 'plead') { if (rngFor(S.seed, S.year, S.day, 8820).random() < clamp(0.2 + 0.5 * f.trust / 100, 0.1, 0.8)) { f.boardExtra = (f.boardExtra || 0) + 6; res = '이사회가 보강 예산 6억을 승인했습니다.'; } else { tr(-3); res = '요청이 거절되었습니다. 신뢰도 −3.'; } }
      else if (k === 'accept') { tr(-1); res = '책임을 인정했습니다. 신뢰도 −1.'; }
      else if (k === 'ask') { tr(-1); f.boardExtra = (f.boardExtra || 0) + 2; res = '소폭 증액(+2억), 신뢰도 −1.'; }
      else res = '현 전력을 유지합니다.';
    }
    e.status = 'done'; e.choice = k; e.result = res; e.auto = !!auto; news(this, `${e.title}: ${res}`); this.invalidate();
    return { ok: true, msg: res };
  };
});
