(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 라이벌·프리뷰·성격·주장 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, KO0, news, TRAITS, rngFor, TEAMS } = LG.OFFC;
  /* ---------------- 라이벌 · 경기 프리뷰 · 리캡 ----------------
     라이벌(게임 설정): 잠실 더비 두산-LG, 낙동강 더비 롯데-NC, 영호남 삼성-KIA, 경인 SSG-KT, 한화-키움. 라이벌전은 홈 관중 +4%, 프리뷰·리캡에 표시. */
  const RIVAL_PAIRS = [['Twins', 'Bears', '잠실 시리즈'], ['Giants', 'Dinos', '낙동강 시리즈'], ['Lions', 'Tigers', '달빛 시리즈'], ['Wiz', 'Landers', '수인선 시리즈'], ['Giants', 'Landers', '항구 시리즈'], ['Giants', 'Lions', '클래식 시리즈'], ['Twins', 'Wiz', '통신사 시리즈'], ['Bears', 'Tigers', '단군 매치'], ['Bears', 'Lions', '싸대기 매치'], ['Giants', 'Tigers', '헤리티지 시리즈'], ['Twins', 'Giants', '엘롯라시코'], ['Twins', 'Heroes', '엘키라시코']];   // 사용자 제공 목록(한화는 해당 없음)
  const rivalOf = (a, b) => RIVAL_PAIRS.find(r => (r[0] === a && r[1] === b) || (r[0] === b && r[1] === a));
  proto.isRival = function (a, b) { return !!rivalOf(a, b); };
  proto.rivalName = function (t, opp) { if (opp) { const r = rivalOf(t, opp); return r ? r[2] : ''; } const r = RIVAL_PAIRS.find(x => x[0] === t || x[1] === t); return r ? r[2] : ''; };
  proto.gamePreview = function (g) {
    const S = this.S, me = S.userTeam, home = g.home, opp = home === me ? g.away : g.home, st = this.standings(), so = st.find(x => x.team === opp), sm = st.find(x => x.team === me), h2 = (S.h2h[me] && S.h2h[me][opp]) || [0, 0, 0];
    const res = (S.results || []).filter(r => r.home === opp || r.away === opp).slice(-5).map(r => { const my = r.home === opp ? r.rh : r.ra, op = r.home === opp ? r.ra : r.rh; return my > op ? '승' : my < op ? '패' : '무'; });
    const bats = this.hitters(opp, true).sort((a, b) => this.ovr(b) - this.ovr(a)).slice(0, 2), sps = this.pitchers(opp, true).filter(p => p.role === 'SP').sort((a, b) => this._runsP(b) - this._runsP(a)).slice(0, 2), pf = S.calib.pf[home] || { runs: 1, hr: 1 };
    const rot = S.teams[me].set.rotation, mySp = S.players[rot[S.teams[me].set.rotIdx % rot.length]];
    const lines = []; if (this.isRival(me, opp)) lines.push(`${this.rivalName(me, opp)} — 라이벌전입니다. 홈 관중이 평소보다 늘어납니다.`);
    if (pf.hr >= 1.08) lines.push('타자 친화 구장(홈런 ↑)'); else if (pf.hr <= 0.85) lines.push('투수 친화 구장(홈런 ↓)');
    if (so.rank <= 3) lines.push(`상위권 상대(${so.rank}위) — 접전 가능성이 높습니다.`); else if (Math.abs(so.rank - sm.rank) <= 2) lines.push('순위 경쟁 상대 — 이기면 순위가 직접 바뀝니다.');
    if (mySp) lines.push(`우리 선발 ${mySp.ko}(OVR ${this.ovr(mySp)}) vs 상대 주요 선발 ${sps[0] ? sps[0].ko + '(OVR ' + this.ovr(sps[0]) + ')' : '-'}`);
    return { opp, home, rank: so.rank, rec: `${so.w}승 ${so.l}패`, h2h: h2, recent: res, bats: bats.map(p => ({ id: p.id, ko: p.ko, ovr: this.ovr(p) })), sps: sps.map(p => ({ id: p.id, ko: p.ko, ovr: this.ovr(p) })), pf, rival: this.isRival(me, opp), lines, mySp: mySp ? { id: mySp.id, ko: mySp.ko, ovr: this.ovr(mySp) } : null };
  };
  proto._recap = function (ctx, rh, ra, trP, trB) {
    const S = this.S, t = S.userTeam, home = ctx.live.home === t, my = home ? rh : ra, op = home ? ra : rh, opp = home ? ctx.live.away : ctx.live.home, win = my > op, tie = my === op;
    const mine = id => { const p = S.players[id]; return p && p.team === t ? p : null; };
    const bs = Object.entries(trB).map(([id, c]) => ({ p: mine(id), c })).filter(x => x.p && x.p.type === 'B').map(x => { const h = (x.c['1B'] || 0) + (x.c['2B'] || 0) + (x.c['3B'] || 0) + (x.c.HR || 0); return { p: x.p, h, hr: x.c.HR || 0, rbi: x.c.RBI || 0, s: (x.c.HR || 0) * 4 + (x.c.RBI || 0) * 1.5 + h }; }).sort((a, b) => b.s - a.s)[0];
    const sp = ctx.prep && ctx.prep.sp, sc = sp && trP[sp.id];
    const bits = []; if (ctx.prep && ctx.prep.presetUsed) bits.push(`프리셋 라인업(${ctx.prep.presetUsed})`); if (bs && bs.s >= 3) bits.push(`${bs.p.ko} ${bs.h}안타${bs.hr ? ' ' + bs.hr + '홈런' : ''}${bs.rbi ? ' ' + bs.rbi + '타점' : ''}`);
    if (sc && sc.outs >= 12) bits.push(`선발 ${sp.ko} ${Math.floor(sc.outs / 3)}${sc.outs % 3 ? '⅓⅔'[sc.outs % 3 - 1] : ''}이닝 ${sc.R}실점${sc.K ? ' ' + sc.K + 'K' : ''}`);
    const g = (S.results || []).filter(r => r.home === t || r.away === t).slice(-15).map(r => (r.home === t ? r.rh : r.ra) - (r.home === t ? r.ra : r.rh)); let n = 0; for (let i = g.length - 1; i >= 0 && !tie && g[i] !== 0 && ((g[i] > 0) === win); i--) n++;
    const text = `${this.isRival(t, opp) ? '[' + this.rivalName(t, opp) + '] ' : ''}${KO0[opp]}전 ${my}:${op} ${tie ? '무승부' : win ? '승' : '패'}${!tie && n >= 3 ? ` (${n}${win ? '연승' : '연패'})` : ''}${bits.length ? ' — ' + bits.join(' · ') : ''}`;
    (S.recap = S.recap || []).unshift({ day: S.day, text, win, tie }); if (S.recap.length > 20) S.recap.pop(); news(this, text); return text;
  };
  /* ---------------- 선수 성격 · 주장 · 클럽하우스 ----------------
     성격(선수별 고정, 시드 기반): 승부사(포스트시즌 컨디션 +1·불만 방치 시 반발 큼) / 모범생(불만 이벤트 드묾·방치 충격 작음) / 자유분방(부진·불만에 취약, 면담 성공률 −) / 리더형(면담 성공률 +, 주장 효과 큼) / 소심형(부진 잘 빠짐, 집중 지도 효과 −).
     주장: 임명하면 팀 전체 컨디션 보정(리더형 +1.0·모범생 +0.6·승부사 +0.4·그 외 +0.3). 요청 트레이드·선수 갈등 이벤트의 해결 확률에도 영향. */
  proto.traitName = function (k) { return TRAITS[k] || ''; };
  proto.traitOf = function (p) {
    if (p.foreign && !p.team) return null; if (p.trait) return p.trait;
    const r = rngFor(this.S.seed, 4242, parseInt(p.id.slice(1))).random(), lead = (p.tn || 0) >= 7 && p.age >= 30 ? 0.12 : 0;
    const x = r - lead; p.trait = lead && r < lead + 0.15 ? 'leader' : x < 0.15 ? 'leader' : x < 0.37 ? 'clutch' : x < 0.62 ? 'model' : x < 0.80 ? 'free' : 'shy'; return p.trait;
  };
  proto.captain = function () { const S = this.S, p = S.captain ? S.players[S.captain] : null; return p && p.team === S.userTeam ? p : null; };
  proto.setCaptain = function (id) {
    const S = this.S, p = S.players[id]; if (!p || p.team !== S.userTeam) return '우리 팀 선수만 주장으로 임명할 수 있습니다.'; if (p.foreign) return '외국인 선수는 주장이 될 수 없습니다.';
    if (S.captain === id) { S.captain = null; news(this, `${p.ko} 주장 해임`); this.invalidate(); return null; }
    S.captain = id; this.traitOf(p); news(this, `${p.ko}(${TRAITS[p.trait]}) 주장 임명 — 팀 컨디션 +${this.capBonus().toFixed(1)}`); this.invalidate(); return null;
  };
  proto.capBonus = function () { const c = this.captain(); if (!c) return 0; return { leader: 1.0, model: 0.6, clutch: 0.4, free: 0.3, shy: 0.3 }[this.traitOf(c)] || 0.3; };
  proto.clubhouse = function () {
    const S = this.S, t = S.userTeam, act = this.players(t).filter(p => p.active), ms = act.map(p => this.moodOf(p)), avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0, cnt = {};
    for (const p of this.players(t)) { const k = this.traitOf(p); cnt[k] = (cnt[k] || 0) + 1; }
    return { captain: this.captain(), mood: Math.round(avg * 10) / 10, counts: cnt, unhappy: this.players(t).filter(p => !p.foreign && (p.loyAdj || 0) <= -4).length };
  };
  /* 요청 트레이드·선수 갈등 이벤트에서 쓰는 보조: 특정 내 선수에 대해 규칙을 통과하는 1대1 제안 */
  proto._offerFor = function (mine, r) {
    const S = this.S, me = S.userTeam; for (const t of TEAMS.filter(x => x !== me).sort(() => r.random() - 0.5)) {
      const vGive = this.tradeValue(mine, t), opts = this.players(t).filter(p => !p.foreign && p.type === mine.type && p.rookie !== S.year && this.tradeValue(p, t) * 1.12 + 0.1 <= vGive).sort((a, b) => this.ovr(b) - this.ovr(a));
      for (const y of opts.slice(0, 4)) { if (this.ovr(y) < this.ovr(mine) - 10) continue; if (this.evaluateTrade(t, [mine.id], [y.id]).ok) return { t, y }; }
    }
    return null;
  };
  /* 부상 복귀: 콜업할지 묻는 결정 카드(콜업 시 교체할 선수는 화면에서 고름). 부상 선수는 콜업 후보 목록에 나오지 않는다 */
  proto._returnEvent = function (p) {
    const S = this.S; if (!S.events) S.events = { seq: 0, list: [] }; if (this.eventsOpen().some(e => e.type === 'return' && e.data.pid === p.id)) return;
    const act = this.players(S.userTeam).filter(x => x.active && x.type === p.type), weak = act.sort((a, b) => this.ovr(a) - this.ovr(b))[0], rec = weak && this.ovr(p) >= this.ovr(weak) + 1 ? 'callup' : 'stay';
    this._evAdd({ type: 'return', title: `${p.ko} 부상 복귀`, ttl: 12, rec, def: 'stay', data: { pid: p.id }, text: `${p.ko}(${p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos} · OVR ${this.ovr(p)})가 ${p.inj ? p.inj.dx : '부상'}에서 복귀했습니다. 1군에 콜업할까요? ${rec === 'callup' ? `(1군 최저 ${weak.ko} OVR ${this.ovr(weak)}보다 높아 콜업을 추천합니다)` : ''}`,
      choices: [{ k: 'callup', label: '콜업 (교체할 선수 선택)', hint: '1군 엔트리에서 같은 유형의 선수와 교체합니다' }, { k: 'stay', label: '2군에서 컨디션 조절', hint: '나중에 직접 올릴 수 있습니다' }] });
  };
  proto.resolveAllRecommended = function () {   // 할 일 함: 추천(없으면 기본) 선택으로 모두 처리
    const out = []; for (const e of this.eventsOpen().slice()) {
      let k = e.rec || e.def || (e.choices[e.choices.length - 1] || {}).k, res;
      if (e.type === 'return' && k === 'callup') { const p = this.S.players[e.data.pid], cs = p ? this.downCandidates(p.id).filter(c => !c.block) : [], c = cs[0]; if (!p || p.active || !c || this.swapActive(p.id, c.p.id)) k = 'stay'; }
      res = this.resolveEvent(e.id, k, true); out.push({ id: e.id, title: e.title, k, msg: res.msg });
    }
    return out;
  };
});
