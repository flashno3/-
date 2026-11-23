(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 시즌 목표·평가·해임 압박 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, TEAMS, rngFor, clamp, news, KO0 } = LG.OFFC;
  /* ---------------- 시즌 목표 · 평가 · 해임 압박 ----------------
     시즌 시작 시 이사회가 목표를 제시한다: ① 순위(선수단 보수 순위를 기대 순위로 환산) ② 재정(손익이 허용 적자 이내) ③ 육성(25세 이하 3명이 1군에서 100타석·50이닝 이상).
     시즌 종료 시 달성 여부가 이사회 신뢰도를 바꾸고, 신뢰도가 12 이하로 떨어지면 해임 → 다른 구단을 맡는다. */
  const RANK_GOAL = [3, 3, 3, 5, 5, 5, 7, 7, 8, 8];   // 보수 순위 1~10 → 목표 순위(이내)
  proto._payRank = function (t) { const pays = TEAMS.map(x => [x, this.finPay(x)]).sort((a, b) => b[1] - a[1]); return pays.findIndex(x => x[0] === t) + 1; };
  proto._setGoals = function () {
    const S = this.S, t = S.userTeam; if (!this.finReady()) return; const pr = this._payRank(t), f = S.fin.teams[t];
    S.goals = { year: S.year, team: t, payRank: pr, rank: RANK_GOAL[pr - 1], profit: -Math.round(this.finAllowed(t) * 10) / 10, youth: 3 };
  };
  proto.goalStatus = function () {
    const S = this.S, g = S.goals; if (!g || g.team !== S.userTeam) return null; const t = S.userTeam, st = this.standings(), me = st.find(x => x.team === t), played = me.w + me.l + me.d;
    const v = this.finPreview(t), y = this.players(t).filter(p => !p.foreign && p.age <= 25).filter(p => { if (p.type === 'B') return (((S.stats.bat[p.id] || {}).PA) || 0) >= 100; return (((S.stats.pit[p.id] || {}).outs) || 0) >= 150; }).length;
    return { g, rank: { cur: me.rank, goal: g.rank, ok: played ? me.rank <= g.rank : null }, profit: { cur: Math.round(v.op * 10) / 10, goal: g.profit, ok: v.op >= g.profit }, youth: { cur: y, goal: g.youth, ok: y >= g.youth }, played };
  };
  /* 가을야구(5위 이내)·1위 확률: 남은 경기를 현재 성적·득실 마진(피타고리안)으로 몬테카를로 */
  proto.playoffOdds = function (n) {
    const S = this.S, st = this.standings(), N = n || 400, r = rngFor(S.seed, S.year, S.day, 9700), len = S.schedule ? S.schedule.length || 144 : 144;
    const rem = Object.fromEntries(st.map(x => [x.team, Math.max(0, len - (x.w + x.l + x.d))]));
    const pw = Object.fromEntries(st.map(x => { const g = x.w + x.l + x.d, rs = x.rs + 80, ra = x.ra + 80, pyth = Math.pow(rs, 1.83) / (Math.pow(rs, 1.83) + Math.pow(ra, 1.83)), wp = g ? (x.w + 0.5 * x.d) / g : 0.5; return [x.team, clamp(0.5 + (pyth - 0.5) * 0.6 + (wp - 0.5) * 0.25 * Math.min(1, g / 60), 0.32, 0.68)]; }));
    const out = {}; for (const x of st) out[x.team] = { top5: 0, top1: 0, exp: 0 };
    for (let k = 0; k < N; k++) {
      const w = st.map(x => { let wins = x.w + 0.5 * x.d; const p = pw[x.team]; for (let i = 0; i < rem[x.team]; i++) if (r.random() < p) wins++; return { t: x.team, wins: wins + r.random() * 0.01 }; }).sort((a, b) => b.wins - a.wins);
      w.forEach((x, i) => { if (i < 5) out[x.t].top5++; if (i === 0) out[x.t].top1++; out[x.t].exp += x.wins; });
    }
    for (const t in out) { out[t].top5 = Math.round(out[t].top5 / N * 100); out[t].top1 = Math.round(out[t].top1 / N * 100); out[t].exp = Math.round(out[t].exp / N * 10) / 10; }
    return out;
  };
  /* 신인왕 자격(KBO: 입단 5년 이내, 이전 누적 투수 30이닝·타자 60타석 이하): 시작 시점 입단 2023년 이후 + 기록 한도 이내, 신규 드래프트 선수. 첫 풀 시즌 후 기록 초과 시 자격 상실 */
  proto._markRookies = function () { for (const p of Object.values(this.S.players)) { const d = p.dh; if (p.foreign || p.team === 'MIL') continue; if (d && d.y >= 2023 && (d.pa || 0) <= 60 && (d.ip || 0) <= 30) p.rk = true; } };
  proto._seasonReport = function () {   // startOffseason 직후: 시상·팀 하이라이트·목표 평가·해임 판정
    const S = this.S, t = S.userTeam, st = this.standings(), me = st.find(x => x.team === t), games = me.w + me.l + me.d, aw = [];
    const bat = Object.entries(S.stats.bat).map(([id, c]) => { const p = S.players[id]; if (!p || !c.PA) return null; const ab = c.PA - c.BB - c.HBP - c.SF, h = c['1B'] + c['2B'] + c['3B'] + c.HR, tb = c['1B'] + 2 * c['2B'] + 3 * c['3B'] + 4 * c.HR, obp = (h + c.BB + c.HBP) / Math.max(1, c.PA), slg = ab ? tb / ab : 0; return { p, c, PA: c.PA, avg: ab ? h / ab : 0, H: h, HR: c.HR, RBI: c.RBI, SB: c.SB || 0, ops: obp + slg, val: (obp + slg - 0.72) * c.PA / 9 }; }).filter(Boolean);
    const pit = Object.entries(S.stats.pit).map(([id, c]) => { const p = S.players[id]; if (!p || c.outs < 3) return null; const ra9 = c.R * 27 / c.outs; return { p, c, outs: c.outs, ra9, K: c.K, val: (4.8 - ra9) * c.outs / 27 * 1.1 }; }).filter(Boolean);
    const qB = bat.filter(x => x.PA >= 3.1 * games), qP = pit.filter(x => x.outs >= games * 3 * 0.9), nm = x => ({ id: x.p.id, name: x.p.ko, team: x.p.team });
    const top = (arr, f, label, txt) => { const x = arr.slice().sort((a, b) => f(b) - f(a))[0]; if (x) aw.push(Object.assign(nm(x), { label, txt: txt(x) })); };
    const mv = bat.map(x => ({ x, v: x.val })).concat(pit.map(x => ({ x, v: x.val }))).sort((a, b) => b.v - a.v)[0];
    if (mv) aw.push(Object.assign(nm(mv.x), { label: 'MVP', txt: mv.x.ops !== undefined ? `OPS ${mv.x.ops.toFixed(3)} ${mv.x.HR}홈런 ${mv.x.RBI}타점` : `RA9 ${mv.x.ra9.toFixed(2)} ${Math.floor(mv.x.outs / 3)}이닝 ${mv.x.K}K` }));
    top(qB, x => x.avg, '타율왕', x => `타율 ${x.avg.toFixed(3).slice(1)}`); top(bat, x => x.HR, '홈런왕', x => `${x.HR}홈런`); top(bat, x => x.RBI, '타점왕', x => `${x.RBI}타점`); top(bat, x => x.SB, '도루왕', x => `${x.SB}도루`);
    top(qP, x => -x.ra9, '최저 RA9', x => `RA9 ${x.ra9.toFixed(2)}`); top(pit, x => x.K, '탈삼진왕', x => `${x.K}탈삼진`);
    const mine = bat.filter(x => x.p.team === t).map(x => ({ id: x.p.id, name: x.p.ko, v: x.val, txt: `타율 ${x.avg.toFixed(3).slice(1)} ${x.HR}홈런 ${x.RBI}타점` })).concat(pit.filter(x => x.p.team === t).map(x => ({ id: x.p.id, name: x.p.ko, v: x.val, txt: `RA9 ${x.ra9.toFixed(2)} ${Math.floor(x.outs / 3)}이닝 ${x.K}K` }))).sort((a, b) => b.v - a.v).slice(0, 3);
    // 골든글러브(포지션별 1명, 외야 3명): 주 포지션 기준 시즌 가치 최고(타자 PA 규정의 70% 이상, 투수 이닝 규정의 70% 이상)
    { const gg = [], used = new Set(), okB = bat.filter(x => x.PA >= 3.1 * games * 0.7), okP = pit.filter(x => x.outs >= games * 3 * 0.9 * 0.7), pk = (arr, pred) => arr.filter(x => pred(x.p) && !used.has(x.p.id)).sort((a, b) => b.val - a.val);
      const pw = pk(okP, p => true)[0]; if (pw) { used.add(pw.p.id); gg.push(Object.assign(nm(pw), { label: '골든글러브 투수', txt: `RA9 ${pw.ra9.toFixed(2)} ${Math.floor(pw.outs / 3)}이닝 ${pw.K}K` })); }
      for (const [lab, pr, cnt] of [['포수', p => p.pos === 'C', 1], ['1루수', p => p.pos === '1B', 1], ['2루수', p => p.pos === '2B', 1], ['3루수', p => p.pos === '3B', 1], ['유격수', p => p.pos === 'SS', 1], ['외야수', p => ['LF', 'CF', 'RF'].includes(p.pos), 3]]) {
        for (const x of pk(okB, pr).slice(0, cnt)) { used.add(x.p.id); gg.push(Object.assign(nm(x), { label: '골든글러브 ' + lab, txt: `타율 ${x.avg.toFixed(3).slice(1)} ${x.HR}홈런 ${x.RBI}타점 OPS ${x.ops.toFixed(3)}` })); } }
      const dh = pk(okB, p => p.pos === 'DH')[0] || pk(okB, p => true)[0]; if (dh) { used.add(dh.p.id); gg.push(Object.assign(nm(dh), { label: '골든글러브 지명타자', txt: `타율 ${dh.avg.toFixed(3).slice(1)} ${dh.HR}홈런 ${dh.RBI}타점` })); }
      // 신인왕
      const rk = x => { const p = x.p; return p.rkx !== false && (p.rk === true || (p.rookie !== undefined && p.rookie >= S.year - 1)) && !p.foreign; };
      const rkc = bat.filter(rk).filter(x => x.PA >= 60).map(x => ({ x, v: x.val })).concat(pit.filter(rk).filter(x => x.outs >= 45).map(x => ({ x, v: x.val }))).sort((a, b) => b.v - a.v)[0];
      if (rkc) aw.push(Object.assign(nm(rkc.x), { label: '신인왕', txt: rkc.x.ops !== undefined ? `타율 ${rkc.x.avg.toFixed(3).slice(1)} ${rkc.x.HR}홈런 ${rkc.x.RBI}타점 OPS ${rkc.x.ops.toFixed(3)}` : `RA9 ${rkc.x.ra9.toFixed(2)} ${Math.floor(rkc.x.outs / 3)}이닝 ${rkc.x.K}K` }));
      for (const x of bat) if (x.p.rk && x.PA > 60) x.p.rkx = false; for (const x of pit) if (x.p.rk && x.outs > 90) x.p.rkx = false;   // 기록 한도를 넘으면 신인 자격 상실
      aw.push(...gg); }
    // 목표 평가 → 신뢰도 반영
    const gs = this.goalStatus(), f = S.fin.teams[t], res = []; let d = 0;
    if (gs) {
      const r = gs.rank; const rd = r.goal - r.cur; let dr = rd >= 2 ? 5 : rd >= 0 ? 3 : rd <= -3 ? -3 : 0; res.push({ k: 'rank', label: `순위 목표 ${r.goal}위 이내`, got: `${r.cur}위`, ok: rd >= 0, d: dr }); d += dr;
      const pr = this._lastOp !== undefined ? this._lastOp : gs.profit.cur; const okp = pr >= gs.profit.goal; res.push({ k: 'profit', label: `손익 ${gs.profit.goal.toFixed(1)}억 이상`, got: `${pr >= 0 ? '+' : ''}${pr.toFixed(1)}억`, ok: okp, d: 0 });
      const dy = gs.youth.ok ? 2 : 0; res.push({ k: 'youth', label: `25세 이하 ${gs.youth.goal}명 이상 출전(100타석·50이닝)`, got: `${gs.youth.cur}명`, ok: gs.youth.ok, d: dy }); d += dy;
      f.trust = clamp(Math.round((f.trust + d) * 10) / 10, 0, 100);
    }
    (S.awardsHist = S.awardsHist || []).push({ year: S.year, awards: aw }); for (const m of mine.slice(0, 3)) if (S.players[m.id]) this._bondShift(S.players[m.id], 1, '시즌 활약');
    if (this._awardCeremony) this._awardCeremony(aw);   // 내 구단 수상자가 있으면 시상식 이벤트
    S.report = { year: S.year, rank: me.rank, w: me.w, l: me.l, d: me.d, champion: S.post ? S.post.champion : null, awards: aw, mine, goals: res, goalTrust: d, trust: f.trust };
    if (res.length) news(this, `시즌 목표 평가: ${res.map(x => `${x.label} ${x.ok ? '달성' : '미달'}`).join(' · ')} → 이사회 신뢰도 ${d >= 0 ? '+' : ''}${d} (현재 ${f.trust})`);
    if (f.trust <= 12) { S.fired = { year: S.year, trust: f.trust, done: false }; news(this, `이사회가 감독 해임을 결정했습니다 (신뢰도 ${f.trust}).`); }
  };
  proto.takeOverTeam = function (t) {   // 해임 후 다른 구단 지휘: 라인업·로테이션 자동 편성, 신뢰도 55로 시작
    const S = this.S; if (!(t in S.teams) || t === S.userTeam) return false; const old = S.userTeam;
    S.userTeam = t; if (this._investReset) this._investReset(); this.autoSettings(t); this.repairSettings(t); const f = S.fin.teams[t]; f.trust = 55;
    S.protect = undefined; S.policy = { pitch: 'normal', run: 'normal' }; S.teamMood = null; if (S.events) for (const e of S.events.list) if (e.status === 'open') { e.status = 'done'; e.result = '감독 교체로 종결'; }
    for (const id in S.players) if (S.players[id].mood) delete S.players[id].mood;
    if (S.fired) S.fired.done = true; this._setGoals(); this.invalidate(); news(this, `${KO0[old]} 감독 해임 → ${KO0[t]} 감독 취임`); return true;
  };
  /* AI 트레이드 제안: 내 선수 1명을 원하는 구단이 동등 가치의 선수 1명을 제시(트레이드 평가 규칙을 통과하는 안만) */
  proto._tradeOffer = function (r) {
    const S = this.S, me = S.userTeam, cands = this.players(me).filter(p => !p.foreign && p.rookie !== S.year && this.marketValue(p) >= 1.5 && !this.isInj(p)).sort((a, b) => this.marketValue(b) - this.marketValue(a)).slice(3, 18); if (!cands.length) return null;
    const mine = cands[Math.floor(r.random() * cands.length)], ai = TEAMS.filter(t => t !== me).sort(() => r.random() - 0.5);
    for (const t of ai) {
      const vGive = this.tradeValue(mine, t), opts = this.players(t).filter(p => !p.foreign && p.type === mine.type && p.rookie !== S.year && this.tradeValue(p, t) * 1.12 + 0.1 <= vGive).sort((a, b) => this.ovr(b) - this.ovr(a));
      for (const y of opts.slice(0, 4)) { if (this.ovr(y) < this.ovr(mine) - 8) continue; const ev = this.evaluateTrade(t, [mine.id], [y.id]); if (ev.ok) return { t, mine, y }; }
    }
    return null;
  };
});
