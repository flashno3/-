/* 리그 뉴스(47단계): 리그 전체의 주요 사건을 분류·제목·본문이 있는 기사로 쌓는다(S.lgnews, 최근 300건).
 *  매일: 선두 변화 · 연승·연패(5·8·10) · 기록 달성(홈런 20·30·40, 안타 150·200, 타점 100, 도루 30·50, 탈삼진 150·200) · 주전급 장기 부상 · 7일마다 파워랭킹 · 28일마다 수상 레이스.
 *  사건 훅: 구단 간 트레이드 · FA 계약 · 감독 교체 · 가을야구 확정·탈락 · 포스트시즌 시리즈·우승 · 국제대회. 기사 문장은 게임 기록으로 만든 가상 기사. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, TEAMS, KO0 } = LG.OFFC;
  const ro = n => { const c = String(n).charCodeAt(String(n).length - 1), j = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 : 0; return n + (j === 0 || j === 8 ? '로' : '으로'); };   // 받침 없음·ㄹ받침 → 로
  const jo = (n, a, b) => { const c = String(n).charCodeAt(String(n).length - 1); return n + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b); };
  proto.lgNews = function (cat, head, body, o) {
    const S = this.S, o2 = o || {}, L = S.lgnews = S.lgnews || [], last = L[0]; if (last && last.head === head && last.y === S.year) return last;
    const it = { id: (S.lgnewsSeq = (S.lgnewsSeq || 0) + 1), y: S.year, d: S.day, ph: S.phase, cat, head, body: body || '', teams: o2.teams || [], pid: o2.pid || null, imp: o2.imp || 1 };
    L.unshift(it); if (L.length > 300) L.length = 300; return it;
  };
  proto.lgNewsList = function (f) { const S = this.S, me = S.userTeam; return (S.lgnews || []).filter(x => (!f || !f.cat || x.cat === f.cat) && (!f || !f.mine || x.teams.includes(me))); };
  const statB = (S, id) => S.stats.bat[id] || {}, hits = b => (b['1B'] || 0) + (b['2B'] || 0) + (b['3B'] || 0) + (b.HR || 0);
  const MILE = [['HR', [20, 30, 40, 50], '홈런'], ['H', [150, 200], '안타'], ['RBI', [100, 120], '타점'], ['SB', [30, 50], '도루']], PMILE = [['K', [150, 200], '탈삼진']];
  proto._lgNewsDay = function (d) {
    const S = this.S; if (S.phase !== 'regular') return; const st = this.standings(), M = S.lgMem = S.lgMem && S.lgMem.y === S.year ? S.lgMem : { y: S.year, lead: null, streak: {}, mile: {}, inj: {} };
    // 선두 변화
    const top = st[0]; if (d >= 10 && top.w + top.l > 0 && M.lead && M.lead !== top.team) this.lgNews('순위', `${KO0[top.team]}, 선두 탈환`, `${jo(KO0[top.team], '이', '가')} ${top.w}승 ${top.l}패로 ${jo(KO0[M.lead], '을', '를')} 끌어내리고 1위에 올랐습니다. 2위와 ${((top.w - top.l) - (st[1].w - st[1].l)) / 2}경기 차.`, { teams: [top.team, M.lead], imp: 2 }); M.lead = top.team;
    // 연승·연패
    for (const t of TEAMS) { const g = S.results.filter(x => x.home === t || x.away === t); let n = 0, w = null; for (let i = g.length - 1; i >= 0; i--) { const x = g[i], win = x.home === t ? x.rh > x.ra : x.ra > x.rh, draw = x.rh === x.ra; if (draw) break; if (w === null) w = win; if (win !== w) break; n++; }
      const key = (w ? 'W' : 'L') + n, prev = M.streak[t] || 0; if ([5, 8, 10, 12].includes(n) && prev !== key) { M.streak[t] = key; this.lgNews('연승·연패', w ? `${KO0[t]}, 파죽의 ${n}연승` : `${KO0[t]}, ${n}연패 수렁`, w ? `${jo(KO0[t], '이', '가')} ${n}경기 연속 승리를 거두며 순위를 끌어올리고 있습니다(현재 ${st.find(x => x.team === t).rank}위).` : `${jo(KO0[t], '이', '가')} ${n}경기 연속 패배에 빠졌습니다(현재 ${st.find(x => x.team === t).rank}위). 반등의 계기가 필요합니다.`, { teams: [t], imp: n >= 8 ? 2 : 1 }); } }
    // 기록 달성
    for (const [id, b] of Object.entries(S.stats.bat)) { const p = S.players[id]; if (!p || !(p.team in S.teams)) continue; const v = { HR: b.HR || 0, H: hits(b), RBI: b.RBI || 0, SB: b.SB || 0 };
      for (const [k, th, nm] of MILE) for (const x of th) if (v[k] >= x && !M.mile[id + k + x]) { M.mile[id + k + x] = 1; if (th.indexOf(x) === 0 && v[k] > x + 3) continue; this.lgNews('기록', `${KO0[p.team]} ${p.ko}, 시즌 ${x}${nm}`, `${jo(p.ko, '이', '가')} ${this.dateStr(Math.min(S.day, 143))} 경기에서 시즌 ${x}${nm}${jo(nm, '을', '를').slice(nm.length)} 기록했습니다.${k === 'HR' && x >= 40 ? ' 홈런왕 경쟁에 불이 붙었습니다.' : ''}`, { teams: [p.team], pid: id, imp: x >= th[th.length - 1] ? 2 : 1 }); } }
    for (const [id, s] of Object.entries(S.stats.pit)) { const p = S.players[id]; if (!p || !(p.team in S.teams)) continue; const v = { K: s.K || 0 };
      for (const [k, th, nm] of PMILE) for (const x of th) if (v[k] >= x && !M.mile[id + k + x]) { M.mile[id + k + x] = 1; this.lgNews('기록', `${KO0[p.team]} ${p.ko}, 시즌 ${x}${nm}`, `${jo(p.ko, '이', '가')} 시즌 ${x}번째 삼진을 잡았습니다.`, { teams: [p.team], pid: id, imp: 1 }); } }
    // 주전급 장기 부상(OVR 58 이상, 20일 이상)
    for (const t of TEAMS) for (const p of this.players(t)) if (p.inj && p.inj.generated && this.isInj(p) && this.injLeft(p) >= 20 && this.ovr(p) >= 58) { const k = p.id + ':' + p.inj.since; if (M.inj[k]) continue; M.inj[k] = 1; this.lgNews('부상', `${KO0[t]} ${p.ko}, ${ro(p.inj.dx)} 이탈`, `${KO0[t]}의 핵심 ${p.type === 'P' ? '투수' : '타자'} ${jo(p.ko, '이', '가')} ${ro(p.inj.dx)} 약 ${this.injLeft(p)}일 동안 나서지 못합니다(복귀 예정 ${this.injDateStr(p)}).`, { teams: [t], pid: p.id, imp: 2 }); }
    // 4주마다 수상 레이스(48단계): awardRace = 시즌 뒤 시상과 같은 계산
    if (d >= 28 && d % 28 === 0 && this.awardRace) { const R = this.awardRace(), m = R.mvp.slice(0, 3), tm = x => (KO0[x.p.team] ? KO0[x.p.team] + ' ' : '');
      if (m.length) { const a = m[0].x, chg = M.mvp && M.mvp !== a.p.id, rk = R.rookie[0]; M.mvp = a.p.id;
        this.lgNews('수상 레이스', `MVP 레이스 — ${tm(a)}${a.p.ko} ${chg ? '선두 등극' : '선두'}`, `현재 MVP 레이스 순위는 ${m.map((y, i) => `${i + 1}. ${tm(y.x)}${y.x.p.ko}(${y.x.ops !== undefined ? `OPS ${y.x.ops.toFixed(3)} ${y.x.HR}홈런` : `RA9 ${y.x.ra9.toFixed(2)} ${Math.floor(y.x.outs / 3)}이닝`})`).join(' · ')}입니다.${rk ? ` 신인왕 레이스는 ${tm(rk.x)}${jo(rk.x.p.ko, '이', '가')} 앞서 있습니다.` : ''}`, { teams: [...new Set(m.map(y => y.x.p.team).concat(rk ? [rk.x.p.team] : []).filter(t => t in S.teams))], pid: a.p.id, imp: 2 }); } }
    // 주간 파워랭킹
    if (d > 0 && d % 7 === 0) { const pr = st.map(x => { const g = S.results.filter(y => y.home === x.team || y.away === x.team).slice(-7), w = g.filter(y => (y.home === x.team ? y.rh > y.ra : y.ra > y.rh)).length; return { t: x.team, rank: x.rank, w7: w, n7: g.length }; });
      const hot = pr.slice().sort((a, b) => b.w7 - a.w7)[0], cold = pr.slice().sort((a, b) => a.w7 - b.w7)[0];
      this.lgNews('파워랭킹', hot.t === st[0].team ? `주간 파워랭킹 — ${KO0[st[0].team]} 독주` : `주간 파워랭킹 — 1위 ${KO0[st[0].team]}, 상승세 ${KO0[hot.t]}`, `${st.slice(0, 5).map(x => `${x.rank}. ${KO0[x.team]}(${x.w}-${x.l})`).join(' · ')}. 최근 7경기 최고는 ${KO0[hot.t]}(${hot.w7}승), 가장 부진한 팀은 ${KO0[cold.t]}(${cold.w7}승)입니다.`, { teams: [st[0].team, hot.t, cold.t], imp: 1 }); }
  };
  /* ---- 사건 훅: 기존 함수를 감싸 기사 추가 ---- */
  const wrap = (name, fn) => { const orig = proto[name]; if (!orig) return; proto[name] = function (...a) { const r = orig.apply(this, a); try { fn.call(this, r, a); } catch (e) { /* 기사 실패는 게임 진행에 영향 없음 */ } return r; }; };
  wrap('_aiSwap', function (rec) { if (rec) this.lgNews('트레이드', `${KO0[rec.a]}·${KO0[rec.b]} 트레이드 — ${rec.pa.ko} ↔ ${rec.pb.ko}`, `${jo(KO0[rec.a], '이', '가')} ${rec.pa.ko}(${rec.pa.pos}·${rec.pa.age}세)${jo(rec.pa.ko, '을', '를').slice(rec.pa.ko.length)} 내주고 ${KO0[rec.b]}의 ${rec.pb.ko}(${rec.pb.pos}·${rec.pb.age}세)${jo(rec.pb.ko, '을', '를').slice(rec.pb.ko.length)} 받았습니다.`, { teams: [rec.a, rec.b], imp: 2 }); });
  wrap('executeTrade', function (ev, a) { if (ev && ev.ok) { const S = this.S, give = a[1].map(id => S.players[id].ko), get = a[2].map(id => S.players[id].ko); this.lgNews('트레이드', `${KO0[S.userTeam]}·${KO0[a[0]]} 트레이드 — ${give.join('·')} ↔ ${get.join('·')}`, `${jo(KO0[S.userTeam], '이', '가')} ${jo(give.join(', '), '을', '를')} 내주고 ${KO0[a[0]]}의 ${jo(get.join(', '), '을', '를')} 영입했습니다.`, { teams: [S.userTeam, a[0]], imp: 2 }); } });
  wrap('_aiSign', function (ok, a) { if (!ok) return; const [t, p, per, y] = a; if (!p || this.war(p) < 1.5) return; this.lgNews('FA', `FA ${p.ko}, ${KO0[t]}행 — ${y}년 총 ${(per * y).toFixed(1)}억`, `${jo(p.ko, '이', '가')} ${jo(KO0[t], '과', '와')} ${y}년 총 ${(per * y).toFixed(1)}억 원에 계약했습니다.`, { teams: [t], pid: p.id, imp: per * y >= 50 ? 3 : 2 }); });
  wrap('postRecord', function (ended) { const P = this.S.post; if (!ended || !P) return; if (P.done) this.lgNews('포스트시즌', `${KO0[P.champion]}, ${this.S.year} 한국시리즈 우승!`, `${jo(KO0[P.champion], '이', '가')} ${jo(KO0[P.runnerUp], '을', '를')} 꺾고 정상에 올랐습니다.`, { teams: [P.champion, P.runnerUp], imp: 3 });
    else { const prev = P.rounds.filter(Boolean).filter(s => s.winner && s !== P.cur).slice(-1)[0]; if (prev) this.lgNews('포스트시즌', `${KO0[prev.winner]}, ${prev.name} 통과`, `${jo(KO0[prev.winner], '이', '가')} ${prev.name}에서 ${jo(KO0[prev.winner === prev.hi ? prev.lo : prev.hi], '을', '를')} 꺾고 ${P.cur.name}에 진출했습니다.`, { teams: [prev.hi, prev.lo], imp: 2 }); } });
  wrap('_intlRun', function (h) { if (!h) return; this.lgNews('국제대회', h.out ? `한국 야구, ${h.name} 본선 진출 실패` : `${h.name}: 한국 ${h.res || h.medal || h.place + '위'}`, h.out ? h.note : `${h.games.filter(g => g.ks > g.os).length}승 ${h.games.filter(g => g.ks < g.os).length}패${h.note ? ' · ' + h.note : ''}${h.exempt && h.exempt.length ? ` · 병역 특례 ${h.exempt.length}명` : ''}`, { imp: h.medal ? 3 : 2 }); });
  wrap('_clinchDay', function () { const S = this.S, C = S.clinch || {}; for (const t of TEAMS) { const k = this.postClinch ? this.postClinch(t) : null; const M = S.lgCl = S.lgCl && S.lgCl.y === S.year ? S.lgCl : { y: S.year, cl: {} }; if (!k || M.cl[t] === k) continue; M.cl[t] = k; if (k === 'in') this.lgNews('순위', `${KO0[t]}, 가을야구 확정`, `${jo(KO0[t], '이', '가')} 포스트시즌 진출을 확정했습니다.`, { teams: [t], imp: 2 }); else if (k === 'out') this.lgNews('순위', `${KO0[t]}, 가을야구 탈락 확정`, `${KO0[t]}의 포스트시즌 진출이 좌절됐습니다.`, { teams: [t], imp: 1 }); } });
});
