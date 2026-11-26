/* 기념의 순간: 스포츠신문 1면(S.front)과 선수 카드(S.cards). 모두 실제로 일어난 일(경기 기록·순위·시상·계약·영구결번)에서만 만든다.
 *  1면: 끝내기 승리(내 경기)·가을야구 진출 확정·우승·대형 FA 영입(총액 50억 이상)·영구결번 지정.
 *  카드(내 구단, 시즌 종료 때): MVP·신인왕(홀로그램/금)·골든글러브(은)·30홈런·100타점·3할(400타석)·150탈삼진·규정 이닝 RA9 3.50 이하·WAR 5 이상, 영구결번(홀로그램). ⚠ 기준선은 게임 설정 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, KO0 } = LG.OFFC;
  proto._front = function (kind, o) {
    const S = this.S; S.frontSeq = (S.frontSeq || 0) + 1; const f = Object.assign({ id: S.frontSeq, y: S.year, d: S.day, kind }, o);
    (S.front = S.front || []).unshift(f); if (S.front.length > 40) S.front.length = 40; return f;
  };
  proto.frontUnseen = function () { const S = this.S; return (S.front || []).filter(f => f.id > (S.frontSeen || 0)).slice(-1)[0] || null; };   // 가장 오래된 안 본 1면부터
  proto.frontSeenUpTo = function (id) { this.S.frontSeen = Math.max(this.S.frontSeen || 0, id); };
  /* 끝내기: 내가 홈이고, 9회 이후 말 공격 마지막 타석에서 득점해 이긴 경기 */
  proto._frontWalkoff = function (ctx) {
    const S = this.S, g = ctx.live, t = S.userTeam; if (ctx.userSide !== 'home' || !(g.score.home > g.score.away) || g.inning < 9) return null;
    const last = g.log.filter(e => e.k === 'PA').pop(); if (!last || !(last.runs > 0) || last.b == null) return null; const bp = S.players[last.b.id]; if (!bp || bp.team !== t) return null;
    const what = { HR: '끝내기 홈런', '1B': '끝내기 안타', '2B': '끝내기 2루타', '3B': '끝내기 3루타', BB: '끝내기 볼넷', HBP: '끝내기 몸에 맞는 공', SF: '끝내기 희생플라이' }[last.e] || '끝내기';
    const opp = KO0[ctx.g[1]] || ctx.g[1];
    return this._front('walkoff', { head: `${bp.ko}, ${what}!`, sub: `${KO0[t]} ${g.score.home}-${g.score.away} ${opp} · ${g.inning}회말`, pid: bp.id, facts: [`${g.inning}회말 ${what}`, `최종 ${g.score.home}:${g.score.away}`] });
  };
  /* 시즌 종료(시즌 리포트 때): 우승 1면 + 내 구단 카드 */
  const RAR = { holo: 4, gold: 3, silver: 2, common: 1 };
  proto._card = function (p, title, rarity, line) { const S = this.S; S.cardSeq = (S.cardSeq || 0) + 1; const c = { id: S.cardSeq, pid: p.id, ko: p.ko, team: p.team in S.teams ? p.team : S.userTeam, y: S.year, title, rarity, line, pos: p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos, age: p.age }; (S.cards = S.cards || []).push(c); return c; };
  proto._seasonMoments = function (aw) {
    const S = this.S, t = S.userTeam, out = [], st = S.stats || { bat: {}, pit: {} };
    if (S.post && S.post.champion === t) { const me = this.standings().find(x => x.team === t); const best = this.players(t).filter(p => !p.foreign || true).sort((a, b) => this.war(b) - this.war(a))[0]; this._front('champ', { head: `${KO0[t]}, ${S.year} 한국시리즈 우승!`, sub: `정규시즌 ${me.w}승 ${me.l}패${me.d ? ' ' + me.d + '무' : ''} · ${me.rank}위`, pid: best ? best.id : null, facts: [`상대 ${KO0[S.post.runnerUp] || S.post.runnerUp}`, best ? `팀 최고 WAR ${best.ko} ${this.war(best).toFixed(1)}` : ''] }); }
    for (const a of (aw || []).filter(x => x.team === t && S.players[x.id])) { const p = S.players[a.id], r = a.label === 'MVP' ? 'holo' : a.label === '신인왕' ? 'gold' : 'silver'; out.push(this._card(p, `${S.year} ${a.label}`, r, a.text || '')); }
    for (const p of this.players(t)) {
      if (p.type === 'B') { const b = st.bat[p.id]; if (!b || !b.PA) continue; const H = (b['1B'] || 0) + (b['2B'] || 0) + (b['3B'] || 0) + (b.HR || 0), AB = b.PA - (b.BB || 0) - (b.HBP || 0) - (b.SF || 0), avg = AB ? H / AB : 0, line = `${b.PA}타석 · 타율 ${avg.toFixed(3).replace(/^0/, '')} · ${b.HR || 0}홈런 · ${b.RBI || 0}타점`;
        if ((b.HR || 0) >= 30) out.push(this._card(p, `${S.year} ${b.HR}홈런`, 'gold', line)); if ((b.RBI || 0) >= 100) out.push(this._card(p, `${S.year} ${b.RBI}타점`, 'gold', line)); if (b.PA >= 400 && avg >= 0.3) out.push(this._card(p, `${S.year} 3할 타자`, 'silver', line)); }
      else { const q = st.pit[p.id]; if (!q || !q.outs) continue; const ip = q.outs / 3, ra9 = q.R * 9 / ip, line = `${Math.floor(ip)}이닝 · RA9 ${ra9.toFixed(2)} · ${q.K}탈삼진`;
        if (q.K >= 150) out.push(this._card(p, `${S.year} ${q.K}탈삼진`, 'gold', line)); if (ip >= 144 && ra9 <= 3.5) out.push(this._card(p, `${S.year} 에이스`, 'gold', line)); }
      if (this.war(p) >= 5) out.push(this._card(p, `${S.year} WAR ${this.war(p).toFixed(1)}`, 'holo', `시즌 WAR ${this.war(p).toFixed(1)}`));
    }
    S.cardNew = (S.cardNew || []).concat(out.map(c => c.id)); return out;
  };
  proto.cardRarityRank = r => RAR[r] || 0;
});
