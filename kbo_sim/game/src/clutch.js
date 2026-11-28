/* 승부처 개입(49단계): 자동 진행 중 내 경기가 7회 이후 접전 + 득점권이 되면 한 번 멈추고 2~4개 선택지로 묻는다.
 *  선택은 직접 지휘와 같은 엔진 명령(대타·번트·도루·히트앤런·투수 교체·고의사구·마운드 방문)으로 실행되고, 결과는 엔진이 정한다(같은 선택도 결과가 갈림).
 *  멈춤 조건: 8회 이후('전부' 설정은 7회), 득점권, 동점 또는 1점 차, 실제 대안이 있는 상황(선택지 2개 이상).
 *  선택지 힌트는 실제 기록(시즌 타율·OPS, 좌우 상성, 투수 체력, 구원 RA9)만 보여 준다. 확률을 꾸며 보여 주지 않는다.
 *  UI 에서 L.clutchUI = true 일 때만 멈춘다(테스트·시뮬 자동 진행은 그대로). 설정 S.clutch: 'key'(기본, 8회 이후) | 'all'(7회 이후) | 'off'. 한 경기 최대 1회. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, EM) {
  'use strict';
  const { proto, KO0 } = LG.OFFC;
  const RESN = { K: '삼진', BB: '볼넷', HBP: '사구', HR: '홈런', '1B': '안타', '2B': '2루타', '3B': '3루타', ROE: '실책 출루', OUT: '범타', IBB: '고의사구', '번트': '희생번트 성공', '번트안타': '번트 안타', '번트(선택)': '야수선택', '번트실패': '번트 실패' };
  const jo = (n, a, b) => { const c = String(n).charCodeAt(String(n).length - 1); return n + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b); };
  const ro = n => { const c = String(n).charCodeAt(String(n).length - 1), j = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 : 0; return n + (j === 0 || j === 8 ? '로' : '으로'); };
  const f3 = x => (x >= 1 ? x.toFixed(3) : x.toFixed(3).slice(1));
  proto.clutchMode = function () { const v = this.S.clutch; return v === 'off' || v === 'all' ? v : 'key'; };   // key: 8회 이후(기본) · all: 7회 이후 · off
  proto.clutchOn = function () { return this.clutchMode() !== 'off'; };
  proto.setClutch = function (v) { this.S.clutch = ['off', 'all'].includes(v) ? v : 'key'; return this.S.clutch; };
  /* 승부처 판정: 7회 이후, 득점권 주자, 공격 중이면 0~2점 뒤짐·동점, 수비 중이면 0~2점 앞섬·동점. 한 경기 1회 */
  proto._clutchSpot = function (g, us, ctx) {   // 기본 설정은 이틀 연속 멈추지 않음
    if (g.finished || (ctx && ctx.clutchN) || g.inning < (this.clutchMode() === 'all' ? 7 : 8)) return null; if (ctx && this.clutchMode() === 'key' && this.S.clutchLast !== undefined && this.S.clutchLast >= this.S.day - 1 && this.S.clutchLastY === this.S.year) return null;
    const b = g.bases; if (!(b[1] || b[2]) || g.outs > 2) return null;
    const opp = us === 'home' ? 'away' : 'home', ls = this.liveScore(g), diff = ls[us] - ls[opp], bat = g.batSide === us;
    if (bat ? (diff > 0 || diff < -1) : (diff < 0 || diff > 1)) return null;   // 동점 또는 1점 차(빈도 측정: 2점 차까지 넣으면 경기의 50%에서 멈춤)
    return { bat, diff, inn: g.inning, top: g.top, outs: g.outs, b: [!!b[0], !!b[1], !!b[2]] };
  };
  proto._clutchStop = function (g, us, ctx) { if (!this._clutchSpot(g, us, ctx)) return false; const i = this.clutchInfo(ctx); return !!i && i.choices.length >= 2; };
  const baseTxt = b => (b[0] && b[1] && b[2] ? '만루' : [b[0] ? '1루' : '', b[1] ? '2루' : '', b[2] ? '3루' : ''].filter(Boolean).join('·') + ' 주자');
  proto._batLine = function (id) { const c = this.S.stats.bat[id]; if (!c || !c.PA) return '올해 기록 없음'; const ab = c.PA - c.BB - c.HBP - c.SF, h = c['1B'] + c['2B'] + c['3B'] + c.HR, tb = c['1B'] + 2 * c['2B'] + 3 * c['3B'] + 4 * c.HR, obp = (h + c.BB + c.HBP) / c.PA, slg = ab ? tb / ab : 0; return `타율 ${f3(ab ? h / ab : 0)} OPS ${f3(obp + slg)} (${c.PA}타석)`; };
  proto._pitLine = function (id) { const c = this.S.stats.pit[id]; if (!c || !c.outs) return '올해 기록 없음'; return `RA9 ${(c.R * 27 / c.outs).toFixed(2)} (${Math.floor(c.outs / 3)}${c.outs % 3 ? ' ' + (c.outs % 3) + '/3' : ''}이닝)`; };
  const plat = (bp, pp) => { const u = bp && pp && EM && EM.platoonUnit ? EM.platoonUnit(bp.bats, pp.throws) : null; return u === null ? null : { u, tag: u >= 0.25 ? '유리' : u <= -0.4 ? '불리' : '보통' }; };
  /* 상황 설명과 선택지 */
  proto.clutchInfo = function (ctx) {
    const S = this.S, g = ctx.live, us = ctx.userSide, sp = this._clutchSpot(g, us, null); if (!sp) return null; const E = ctx.E, t = S.userTeam, opp = us === 'home' ? 'away' : 'home', oppT = g[opp];
    const ls = this.liveScore(g), bt = S.players[g.batter.id], pp = S.players[g.pitcher.id], ch = [];
    const head = `${sp.inn}회${sp.top ? '초' : '말'} ${sp.outs}사 ${baseTxt(sp.b)} · ${sp.diff === 0 ? '동점' : sp.diff > 0 ? sp.diff + '점 앞섬' : -sp.diff + '점 뒤짐'} (${ls[us]}:${ls[opp]})`;
    if (sp.bat) {
      const m0 = plat(bt, pp);
      ch.push({ k: 'swing', label: `${bt.ko}에게 맡긴다`, hint: `${this._batLine(bt.id)}${m0 ? ` · ${this.handLabel(bt)} vs ${this.handLabel(pp)} ${m0.tag}` : ''} · 종합 ${this.ovr(bt)}` });
      const bench = this.hitters(t, true).filter(p => E.batById[p.id] && !g.L[us].includes(E.batById[p.id]) && !g.subs[us].some(s => s.out === E.batById[p.id]) && !this.isInj(p));
      const adj = p => this.ovr(p) + 30 * ((plat(p, pp) || { u: 0 }).u), ph = bench.sort((a, b) => adj(b) - adj(a))[0];
      if (ph && adj(ph) >= adj(bt) + 3) { const m = plat(ph, pp); ch.push({ k: 'ph', id: ph.id, label: `대타 ${ph.ko}`, hint: `${this._batLine(ph.id)}${m ? ` · ${this.handLabel(ph)} vs ${this.handLabel(pp)} ${m.tag}` : ''} · 종합 ${this.ovr(ph)} (현 타자 ${this.ovr(bt)})` }); }
      if (sp.outs === 0 && !sp.b[2] && (sp.b[0] || sp.b[1])) ch.push({ k: 'bunt', label: '희생번트', hint: '주자를 한 베이스씩 보내고 아웃 1개를 내준다(실패하면 선행 주자 아웃 위험)' });
      else if (sp.b[0] && !sp.b[1] && sp.outs < 2) { const rn = S.players[g.bases[0].id], spd = rn && this.sub ? this.sub(rn).주력 : 0; if (spd >= 55) ch.push({ k: 'steal', label: `1루 주자 ${rn.ko} 도루`, hint: `주력 ${Math.round(spd)} — 성공하면 2·3루, 실패하면 주자 소멸` }); }
      if (sp.b[0] && sp.outs < 2 && ch.length < 4) ch.push({ k: 'har', label: '히트 앤드 런', hint: '주자가 미리 뛰고 타자는 맞히는 데 집중(병살 위험↓, 헛스윙이면 주자 위험)' });
    } else {
      const f = g.pitchFatigue(us);
      ch.push({ k: 'keep', label: `${ro(pp.ko)} 간다`, hint: `상대한 타자 ${f.bf}명 / 한계 ${f.lim} · ${this._pitLine(pp.id)}` });
      const used = new Set([...g.staff[us].used]), bp = this.team(t).set.bullpen || {}, cands = this.pitchers(t, true).filter(p => E.pitById[p.id] && !used.has(E.pitById[p.id].name) && p.role !== 'SP' && !this.isInj(p));
      const rv = p => (this.restInfo ? this.restInfo(p).left : 100) * 0.5 + this.ovr(p) * 0.5 + (bp.closer === p.id ? 4 : 0) + ((plat(bt, p) || { u: 0 }).u <= -0.4 ? 5 : 0), rel = cands.sort((a, b) => rv(b) - rv(a))[0];
      if (rel) { const m = plat(bt, rel); ch.push({ k: 'pc', id: rel.id, label: `${rel.ko} 투입${bp.closer === rel.id ? '(마무리)' : ''}`, hint: `${this._pitLine(rel.id)} · 체력 ${this.restInfo ? Math.round(this.restInfo(rel).left) : '-'}${m ? ` · ${this.handLabel(bt)} 상대 ${this.handLabel(rel)} ${m.tag === '불리' ? '유리' : m.tag === '유리' ? '불리' : '보통'}` : ''}` }); }
      if (!sp.b[0] && sp.outs < 2) ch.push({ k: 'ibb', label: `${bt.ko} 고의사구`, hint: `상대 타자 ${this._batLine(bt.id)} — 1루를 채워 병살·포스 아웃을 노린다(주자 1명 추가)` });
      if (g.canVisit(us) && ch.length < 4) ch.push({ k: 'mv', label: '마운드 방문', hint: '투수를 진정시킨다(체력 소폭 회복, 경기당 3회까지)' });
    }
    return { head, bat: sp.bat, opp: oppT, batter: bt.ko, pitcher: pp.ko, choices: ch, def: sp.bat ? 'swing' : 'keep' };
  };
  /* 선택 실행 → 이 이닝 끝까지 진행해 결과를 보고 → 경기 끝까지 자동 진행·마감 */
  proto.clutchResolve = function (ctx, k) {
    const S = this.S, g = ctx.live, us = ctx.userSide, E = ctx.E, info = this.clutchInfo(ctx); if (!info) { this.playAuto(ctx); return { msg: '', res: this.finishUserGame(ctx) }; }
    const c = info.choices.find(x => x.k === k) || info.choices[0], opp = us === 'home' ? 'away' : 'home', side = g.batSide, inn = g.inning, top = g.top, s0 = this.liveScore(g)[side], l0 = g.log.length;
    ctx.clutchN = 1;
    if (c.k === 'ph') g.pinchHit(us, g.idx[us] % 9, E.batById[c.id]); else if (c.k === 'bunt') g.bunt(); else if (c.k === 'steal') g.steal(); else if (c.k === 'har') g.hitAndRun();
    else if (c.k === 'pc') g.changePitcher(us, E.pitById[c.id]); else if (c.k === 'ibb') g.ibb(); else if (c.k === 'mv') g.moundVisit(us);
    let guard = 0; while (!g.finished && g.inning === inn && g.top === top && guard++ < 40) { this._applyPlan(g, us); g.step(); }
    const runs = (g.finished ? this.liveScore(g)[side] : (side === 'home' ? g.score.home : g.score.away)) - s0;
    const pa = g.log.slice(l0).filter(x => x.k === 'PA'), first = pa[0], fp = first && S.players[first.b.id], ev = first ? (RESN[first.e] || first.e) : '';
    const run0 = !first ? g.log.slice(l0).find(x => x.k === 'CS' || x.k === 'PO') : null, rp = run0 && run0.b ? S.players[run0.b.id] : null;
    const good = info.bat ? runs > 0 : runs === 0;
    const what = first ? `${fp ? jo(fp.ko, '이', '가') + ' ' : ''}${ev}${first.runs ? `(${first.runs}점)` : ''}` : run0 ? `${rp ? rp.ko + ' ' : '주자 '}${run0.k === 'CS' ? '도루 실패' : '견제 아웃'}` : '';
    const half = info.bat ? (runs > 0 ? `이 이닝 ${runs}점!` : '이 이닝 무득점') : (runs === 0 ? '실점 없이 위기 탈출!' : `이 이닝 ${runs}실점`);
    this.playAuto(ctx); const ls = { away: g.score.away, home: g.score.home }, win = ls[us] > ls[opp] ? 'W' : ls[us] < ls[opp] ? 'L' : 'D';
    const res = this.finishUserGame(ctx);
    const L = S.clutchLog = S.clutchLog || []; L.unshift({ y: S.year, d: S.day - 1, opp: info.opp, head: info.head, k: c.k, label: c.label, what, runs, good, win, score: `${ls[us]}:${ls[opp]}` }); if (L.length > 80) L.length = 80;
    const fin = `${win === 'W' ? '승리' : win === 'L' ? '패배' : '무승부'} ${ls[us]}:${ls[opp]}`;
    return { ok: true, good, msg: `${c.label} → ${what ? what + ', ' : ''}${half} 경기 결과: ${fin}`, res, win };
  };
  /* 올해 승부처 기록 요약 */
  proto.clutchSummary = function () { const S = this.S, l = (S.clutchLog || []).filter(x => x.y === S.year); return { n: l.length, good: l.filter(x => x.good).length, w: l.filter(x => x.win === 'W').length, list: l }; };
});
