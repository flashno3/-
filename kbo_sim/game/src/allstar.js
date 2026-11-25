/* 올스타전·전반기 결산: 올스타 휴식기(전반기 89경기일 종료 직후, 90번째 경기일 전)에 올스타 명단 발표 → (내 구단 선수가 있으면) 참가/휴식 선택 → 올스타전 결과·MVP, 그리고 전반기 결산(후반기 운용 선택).
 *  - 명단은 전반기 성적(타자 OPS×타석, 투수 RA9×이닝)과 구단 인기(관중 기반)로 정한다. 두 팀(드림·나눔)의 구단 편성은 게임 설정이며 실제와 다를 수 있다(⚠).
 *  - 올스타전은 정규시즌 순위·기록에 포함되지 않는 별도 기록이다. 경기는 엔진 시뮬레이션이 아니라 명단의 능력치를 이용한 간이 계산(⚠).
 *  - 효과(⚠ 가정): 참가 = 팬 관심(관중 수요 +1%/명, 최대 +5%, 14일) · 올스타 선수 컨디션 −1(6일) / 휴식 = 컨디션 +1(6일). 경기·재정 엔진의 다른 계산은 건드리지 않는다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TEAMS, KO0, news } = LG.OFFC;
  const BREAK_DAY = 88;   // 전반기 마지막 경기일(0부터 88일째)의 틱에서 열어, 그날 경기를 마친 뒤 휴식기(89일째 경기 전)에 소식이 뜬다
  const DREAM = ['Bears', 'Lions', 'Giants', 'Wiz', 'Heroes'];   // ⚠ 편성은 게임 설정
  const SIDE_NAME = { dream: '드림', nanum: '나눔' };
  const KO = t => (KO0 && KO0[t]) || t;
  const r2 = x => Math.round(x * 100) / 100;
  proto.allStar = function () { const A = this.S.allstar; return A && A.year === this.S.year ? A : null; };
  proto._asSide = t => DREAM.includes(t) ? 'dream' : 'nanum';
  /* 전반기 성적 가치(없으면 null) */
  proto._asVal = function (p) {
    const S = this.S;
    if (p.type === 'B') { const b = S.stats.bat[p.id]; if (!b || b.PA < 100) return null; const ab = b.PA - b.BB - b.HBP - b.SF, h = b['1B'] + b['2B'] + b['3B'] + b.HR, tb = b['1B'] + 2 * b['2B'] + 3 * b['3B'] + 4 * b.HR, obp = (h + b.BB + b.HBP) / Math.max(1, b.PA), slg = ab ? tb / ab : 0, ops = obp + slg;
      return { v: (ops - 0.70) * b.PA / 10, line: `타율 ${(ab ? h / ab : 0).toFixed(3).slice(1)} ${b.HR}홈런 ${b.RBI}타점 OPS ${ops.toFixed(3)}` }; }
    const q = S.stats.pit[p.id], min = p.role === 'SP' ? 120 : 30; if (!q || q.outs < min) return null; const ra9 = q.R * 27 / q.outs;
    return { v: (4.8 - ra9) * q.outs / 27 * 1.1 * (p.role === 'SP' ? 1 : 1.6), line: `RA9 ${ra9.toFixed(2)} ${Math.floor(q.outs / 3)}이닝 ${q.K}K` };   // 구원은 이닝이 적어 가치에 보정
  };
  /* 한 팀(드림/나눔)의 명단: 야수 12(포지션 선발 9 + 후보 3)·선발 3·구원 2, 구단별 최소 1명 */
  proto._asPick = function (side) {
    const S = this.S, teams = TEAMS.filter(t => this._asSide(t) === side), avgAtt = TEAMS.reduce((a, t) => a + (S.fin ? S.fin.teams[t].att0 : 0), 0) / TEAMS.length || 1, picks = [], used = new Set();
    const pop = t => S.fin && S.fin.teams[t] ? clamp(1 + 0.12 * (S.fin.teams[t].att0 / avgAtt - 1), 0.9, 1.2) : 1;   // 팬 투표는 구단 인기(관중)를 약간 반영
    const pool = []; for (const t of teams) for (const p of this.players(t)) { if (this.isInj(p) && (p.inj && this.injLeft(p) > 21)) continue; const ev = this._asVal(p); if (ev) pool.push({ p, t, v: ev.v, vv: ev.v * (p.type === 'B' ? pop(t) : 1), line: ev.line }); }
    const add = (x, role) => { if (!x || used.has(x.p.id)) return false; used.add(x.p.id); picks.push({ id: x.p.id, ko: x.p.ko, team: x.t, pos: x.p.type === 'B' ? x.p.pos : x.p.role === 'SP' ? '선발' : '구원', kind: x.p.type, role, v: r2(x.v), line: x.line }); return true; };
    const best = (pred, n) => pool.filter(x => !used.has(x.p.id) && pred(x)).sort((a, b) => b.vv - a.vv).slice(0, n || 1);
    for (const pos of ['C', '1B', '2B', '3B', 'SS']) add(best(x => x.p.type === 'B' && x.p.pos === pos)[0], '선발');
    for (const x of best(x => x.p.type === 'B' && ['LF', 'CF', 'RF'].includes(x.p.pos), 3)) add(x, '선발');
    add(best(x => x.p.type === 'B')[0], '선발');   // 지명타자: 남은 타자 중 최고
    for (const x of best(x => x.p.type === 'B', 3)) add(x, '후보');
    for (const x of best(x => x.p.type === 'P' && x.p.role === 'SP', 3)) add(x, '선발투수');
    for (const x of best(x => x.p.type === 'P' && x.p.role !== 'SP', 2)) add(x, '구원');
    for (const t of teams) if (!picks.some(k => k.team === t)) { const x = pool.filter(z => z.t === t && !used.has(z.p.id)).sort((a, b) => b.vv - a.vv)[0]; if (x) add(x, '구단 대표'); }   // 구단당 최소 1명
    return picks;
  };
  proto.allStarBreakDay = () => BREAK_DAY;   // 화면(시즌 타임라인)용
  proto._allStarDay = function (d) {
    const S = this.S; if (d !== BREAK_DAY || S.phase !== 'regular' || this.allStar()) return;
    const dream = this._asPick('dream'), nanum = this._asPick('nanum'), user = S.userTeam, my = dream.concat(nanum).filter(k => k.team === user);
    S.allstar = { year: S.year, dream, nanum, my: my.map(k => k.id), res: null };
    for (const k of dream.concat(nanum)) { const p = S.players[k.id]; if (p) { p.asg = p.asg || []; if (!p.asg.includes(S.year)) p.asg.push(S.year); } }
    news(this, `${S.year} 올스타 명단 발표 — 드림 ${dream.length}명·나눔 ${nanum.length}명${my.length ? `, 우리 구단 ${my.length}명(${my.slice(0, 4).map(k => k.ko).join(', ')}${my.length > 4 ? ' 외' : ''})` : ''}`);
    if (my.length) {
      const snub = this.players(user).map(p => ({ p, ev: this._asVal(p) })).filter(x => x.ev && !my.some(k => k.id === x.p.id)).sort((a, b) => b.ev.v - a.ev.v).slice(0, 2);
      this._evAdd({ type: 'allstar', title: `⭐ ${S.year} 올스타 휴식기`, ttl: 3, def: 'play', rec: 'play', data: { n: my.length },
        text: `올스타 명단이 발표되었습니다. 우리 구단 선정 ${my.length}명: ${my.map(k => `${k.ko}(${k.pos})`).join(', ')}.${snub.length ? ` 아쉽게 빠진 선수: ${snub.map(x => `${x.p.ko}(${x.ev.line})`).join(' · ')}.` : ''} 올스타전에 어떻게 임할까요?`, choices: [
          { k: 'play', label: '정상 참가(팬 서비스)', hint: `관중 수요 +${Math.min(5, my.length)}%(14일) · 올스타 선수 컨디션 −1(6일) · 올스타전 MVP 후보` },
          { k: 'rest', label: '핵심 선수 휴식 허용', hint: '올스타 선수 컨디션 +1(6일) · 올스타전에는 대체 선수가 출전(MVP 불가) · 팬 서비스 효과 없음' }] });
    } else this._asFinish(new Set());
    this._halfSummary();
  };
  /* 올스타전 결과(간이 계산): 명단의 능력치 합으로 득점 기대를 정하고 시드 난수로 결정 */
  proto._asFinish = function (rest) {
    const S = this.S, A = this.allStar(); if (!A || A.res) return A && A.res;
    const r = rngFor(S.seed, S.year, 8800, 1), strength = side => A[side].filter(k => !rest.has(k.id)).reduce((a, k) => { const p = S.players[k.id]; if (!p) return a; return a + (k.kind === 'B' ? this._runsB(p, true) : -this._runsP(p) * 0.6); }, 0);
    const z = strength('dream') - strength('nanum'), pois = m => { let L2 = Math.exp(-m), k = 0, p = 1; do { k++; p *= r.random(); } while (p > L2); return k - 1; };
    let rd = pois(clamp(4.6 + z * 0.02, 3.2, 6.4)), rn = pois(clamp(4.6 - z * 0.02, 3.2, 6.4)), ext = false; if (rd === rn) { ext = true; if (r.random() < 0.5 + clamp(z * 0.004, -0.15, 0.15)) rd++; else rn++; }
    const win = rd > rn ? 'dream' : 'nanum', cand = A[win].filter(k => k.kind === 'B' && !rest.has(k.id)), tot = cand.reduce((a, k) => a + Math.exp(Math.max(-2, Math.min(3, k.v / 2))), 0); let x = r.random() * tot, mvp = cand[0];
    for (const k of cand) { x -= Math.exp(Math.max(-2, Math.min(3, k.v / 2))); if (x <= 0) { mvp = k; break; } }
    A.res = { dream: rd, nanum: rn, win, ext, mvp: mvp ? { id: mvp.id, ko: mvp.ko, team: mvp.team, line: mvp.line } : null, rest: [...rest] };
    (S.allstarHist = S.allstarHist || []).unshift({ year: S.year, dream: rd, nanum: rn, win, mvp: A.res.mvp }); if (S.allstarHist.length > 30) S.allstarHist.length = 30;
    const txt = `${S.year} 올스타전: 드림 ${rd} : ${rn} 나눔${ext ? '(연장)' : ''} — ${SIDE_NAME[win]} 승리, MVP ${mvp ? `${mvp.ko}(${KO(mvp.team)})` : '-'}`; news(this, txt);
    const mine = mvp && mvp.team === S.userTeam; this.story('allstar', txt + (mine ? ' · 우리 구단 선수 MVP' : ''), mine ? 3 : 2);
    if (mine && S.players[mvp.id]) { const p = S.players[mvp.id]; p.loyAdj = clamp((p.loyAdj || 0) + 3, -15, 15); (p.asgMvp = p.asgMvp || []).push(S.year); }
    return A.res;
  };
  proto._halfSummary = function () {
    const S = this.S, t = S.userTeam, st = this.standings(), me = st.find(x => x.team === t), fifth = st[4], gb = ((fifth.w - me.w) + (me.l - fifth.l)) / 2, played = me.w + me.l + me.d;
    const top = this.players(t).map(p => ({ p, ev: this._asVal(p) })).filter(x => x.ev), bat = top.filter(x => x.p.type === 'B').sort((a, b) => b.ev.v - a.ev.v)[0], pit = top.filter(x => x.p.type === 'P').sort((a, b) => b.ev.v - a.ev.v)[0], inj = this.players(t).filter(p => this.isInj(p)).length;
    const gs = this.goalStatus ? this.goalStatus() : null, goalTxt = gs ? `시즌 목표: 순위 ${gs.rank.goal}위 이내(현재 ${gs.rank.cur}위${gs.rank.ok ? ' 달성권' : ''}) · 손익 ${gs.profit.goal.toFixed(1)}억(예상 ${gs.profit.cur >= 0 ? '+' : ''}${gs.profit.cur.toFixed(1)}억)` : '';
    const gap = me.rank <= 5 ? `5위권(5위와 ${Math.abs(gb).toFixed(1)}경기 ${gb <= 0 ? '앞' : '뒤'})` : `5위와 ${gb.toFixed(1)}경기 차`;
    const rec = me.rank <= 3 ? 'hold' : gb > 0 && gb <= 4 ? 'push' : gb > 9 ? 'care' : 'hold';
    this._evAdd({ type: 'halfsum', title: `📋 ${S.year} 전반기 결산`, ttl: 5, def: 'hold', rec, data: { rank: me.rank },
      text: `전반기 ${me.w}승 ${me.l}패${me.d ? ' ' + me.d + '무' : ''}(${played}경기) · ${me.rank}위 · ${gap}. ${bat ? `팀 타선 ${bat.p.ko}(${bat.ev.line})` : ''}${pit ? ` · 마운드 ${pit.p.ko}(${pit.ev.line})` : ''}${inj ? ` · 부상자 ${inj}명` : ''}. ${goalTxt ? goalTxt + '. ' : ''}후반기를 어떻게 운용할까요?`, choices: [
        { k: 'push', label: '승부수 — 공격적 운용', hint: '투수 운용 「승부」·주루 「적극」으로 설정(기존 정책 카드와 같은 효과: 성적 ↑·부상 위험 ↑, 언제든 되돌릴 수 있음)' },
        { k: 'hold', label: '현재 운용 유지', hint: '변화 없음' },
        { k: 'care', label: '체력 관리 — 안정 운용', hint: '투수 운용 「절약」·주루 「보수」로 설정(부상 위험 ↓, 성적 약간 ↓, 언제든 되돌릴 수 있음)' }] });
  };
  proto._asResolve = function (e, k) {
    const S = this.S, t = S.userTeam;
    if (e.type === 'allstar') {
      const A = this.allStar(), ids = A ? A.my : [], mood = (p, v, days) => { p.mood = { v, until: S.day + days }; }, f = S.fin && S.fin.teams[t];
      for (const id of ids) { const p = S.players[id]; if (p && p.team === t) mood(p, k === 'rest' ? 1 : -1, 6); }
      if (k === 'play' && f && ids.length) f.promo = { until: S.day + 14, mult: 1 + Math.min(5, ids.length) / 100 };
      this.invalidate(); const res = this._asFinish(new Set(k === 'rest' ? ids : []));
      return `${k === 'play' ? '올스타전에 정상 참가했습니다(관중 수요 +' + Math.min(5, ids.length) + '%, 선수 컨디션 −1)' : '핵심 선수를 쉬게 했습니다(컨디션 +1)'}. 결과: 드림 ${res.dream} : ${res.nanum} 나눔, MVP ${res.mvp ? res.mvp.ko : '-'}.`;
    }
    if (k === 'push') { this.setPolicy('pitch', 'push'); this.setPolicy('run', 'high'); return '후반기 승부수: 투수 운용 「승부」·주루 「적극」으로 설정했습니다.'; }
    if (k === 'care') { this.setPolicy('pitch', 'save'); this.setPolicy('run', 'low'); return '후반기 체력 관리: 투수 운용 「절약」·주루 「보수」로 설정했습니다.'; }
    return '후반기도 현재 운용을 유지합니다.';
  };
});
