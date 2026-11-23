/* 시상식·은퇴식: 시즌 시상과 은퇴를 '내가 고르는 행사'로 만든다(내 구단 선수 기준).
 *  - 시상식: 시즌 종료 직후, 내 구단 선수가 MVP·신인왕·골든글러브·타이틀을 받았을 때 보너스/만찬/축하 중 선택. 효과는 충성도(p.loyAdj)와 행사 비용(evCost)뿐.
 *    수상이 재계약 요구액에 미치는 영향은 이미 성적(WAR) 기반 시장가에 들어 있어 따로 가산하지 않는다(이중 반영 방지).
 *  - 은퇴식: 내 구단에서 오래 뛴(8시즌+) 선수나 영구결번 후보가 은퇴할 때 규모(간소/보통/성대) 선택. 영구결번 후보면 은퇴식 뒤에 영구결번 심의가 이어진다.
 * 효과 크기(이사회 신뢰도 +1~2, 충성도 +1~4, 비용 0~1억)는 ⚠ 가정이며 경기·재정 계산(손익에 행사 비용만 반영)은 건드리지 않는다. 결정하지 않으면 시즌 전환 때 기본 선택으로 처리된다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, clamp, news } = LG.OFFC;
  const MIN_TENURE = 8;
  const cost = (L, c) => { const f = L.S.fin && L.S.fin.teams[L.S.userTeam]; if (f && c > 0) f.evCost = Math.round(((f.evCost || 0) + c) * 10) / 10; };
  const adj = (p, v) => { if (p) p.loyAdj = clamp((p.loyAdj || 0) + v, -15, 15); };
  const trust = (L, d) => { const f = L.S.fin && L.S.fin.teams[L.S.userTeam]; if (f) f.trust = clamp(Math.round(((f.trust === undefined ? 70 : f.trust) + d) * 10) / 10, 0, 100); };
  proto._cerLog = function (o) { const S = this.S; (S.ceremonies = S.ceremonies || []).unshift(Object.assign({ y: S.year }, o)); if (S.ceremonies.length > 60) S.ceremonies.length = 60; };

  /* ---- 시상식 ---- */
  proto._awardCeremony = function (aw) {
    const S = this.S, t = S.userTeam, mine = (aw || []).filter(x => x.team === t && S.players[x.id]);
    if (!mine.length) return null; if (this.eventsOpen().some(e => e.type === 'awards' && e.data.year === S.year)) return null;
    const mvp = aw.find(x => x.label === 'MVP'), rk = aw.find(x => x.label === '신인왕'), big = mine.some(x => x.label === 'MVP' || x.label === '신인왕');
    const head = [mvp ? `MVP ${mvp.name}(${KO(mvp.team)}) ${mvp.txt}` : '', rk ? `신인왕 ${rk.name}(${KO(rk.team)})` : ''].filter(Boolean).join(' · ');
    const mineTxt = mine.map(x => `${x.name}(${x.label})`).join(', '), n = mine.length, bonus = Math.min(1.5, Math.round(n * 3) / 10);
    return this._evAdd({ type: 'awards', title: `🏆 ${S.year} 시즌 시상식`, ttl: 1e9, def: 'cheer', rec: big ? 'bonus' : 'party', data: { year: S.year, ids: mine.map(x => x.id), labels: mine.map(x => x.label) },
      text: `${head ? head + '. ' : ''}우리 구단 수상: ${mineTxt}. 시상식을 어떻게 챙길까요?`, choices: [
        { k: 'bonus', label: `수상 보너스 지급(${bonus.toFixed(1)}억)`, hint: `수상자 충성도 +${big ? 4 : 3} · 선수단 전체 +1(재계약·FA 협상에 반영, 시간이 지나며 사라짐) · 비용 ${bonus.toFixed(1)}억` },
        { k: 'party', label: '축하 만찬(0.1억)', hint: '수상자 충성도 +2 · 선수단 전체 +1 · 비용 0.1억' },
        { k: 'cheer', label: '축하 메시지만', hint: '수상자 충성도 +1 · 비용 없음' }] });
  };
  const KO = t => (LG.OFFC.KO0 && LG.OFFC.KO0[t]) || t;

  /* ---- 은퇴식 ---- */
  proto._cerTenure = function (p, t) {
    if (this._legendOneClub && this._legendOneClub(p, t)) return this._legendYears(p);
    return Math.max((p.seasons || []).filter(x => x.t === t && !x.farmOnly).length, p.tnTeam === t ? (p.tn || 0) : 0);
  };
  proto._retireCeremony = function (p) {
    const S = this.S, t = S.userTeam; if (p.foreign || p.team !== t) return null;
    const yrs = this._cerTenure(p, t), ev = this._legendEval ? this._legendEval(p, t) : { tier: null }, aw = []; for (const h of S.awardsHist || []) for (const a of h.awards) if (a.id === p.id) aw.push(a.label);
    if (yrs < MIN_TENURE && !ev.tier) return null;
    const pos = p.type === 'P' ? (p.role === 'SP' ? '선발' : '구원') : p.pos, last = (p.seasons || []).filter(x => x.t === t && !x.farmOnly).slice(-1)[0];
    const line = last ? (last.k === 'B' ? `마지막 시즌 ${last.PA}타석 타율 ${last.avg.toFixed(3).slice(1)} ${last.HR}홈런` : `마지막 시즌 ${Math.floor(last.outs / 3)}이닝 RA9 ${last.ra9.toFixed(2)}`) : '';
    const legend = ev.tier ? ` 구단 WAR ${ev.war.toFixed(1)}으로 영구결번 후보입니다(${ev.tier === 'sure' ? '확실' : '회색'}) — 은퇴식 뒤 영구결번 심의가 이어집니다.` : '';
    return this._evAdd({ type: 'retcer', title: `🎖 ${p.ko} 은퇴식`, ttl: 1e9, def: 'simple', rec: ev.tier === 'sure' || yrs >= 15 ? 'grand' : yrs >= 12 || ev.tier ? 'normal' : 'simple', data: { pid: p.id, name: p.ko, pos, yrs, tier: ev.tier || null },
      text: `${p.ko}(${pos}, ${p.age}세)이(가) 우리 구단에서 ${yrs}시즌을 뛰고 은퇴합니다.${aw.length ? ` 수상 ${aw.length}회(${[...new Set(aw)].slice(0, 3).join('·')}).` : ''}${line ? ' ' + line + '.' : ''}${legend} 은퇴식을 어떻게 치를까요?`, choices: [
        { k: 'grand', label: '성대한 은퇴식(1.0억)', hint: '이사회 신뢰도 +2 · 선수단 전체 충성도 +2 · 비용 1.0억' },
        { k: 'normal', label: '보통 은퇴식(0.3억)', hint: '이사회 신뢰도 +1 · 선수단 전체 충성도 +1 · 비용 0.3억' },
        { k: 'simple', label: '간소하게(소식만)', hint: '비용 없음 · 변화 없음' }] });
  };

  proto._cerResolve = function (e, k) {
    const S = this.S, t = S.userTeam, team = this.players(t);
    if (e.type === 'awards') {
      const ids = new Set(e.data.ids), big = e.data.labels.some(l => l === 'MVP' || l === '신인왕'), n = e.data.ids.length, bonus = Math.min(1.5, Math.round(n * 3) / 10);
      let a = 1, all = 0, c = 0; if (k === 'bonus') { a = big ? 4 : 3; all = 1; c = bonus; } else if (k === 'party') { a = 2; all = 1; c = 0.1; }
      for (const p of team) { if (ids.has(p.id)) adj(p, a); else if (all) adj(p, all); }
      cost(this, c); this._cerLog({ kind: 'awards', size: k, n, labels: e.data.labels.slice(0, 4) });
      return `${S.year} 시즌 시상식: ${k === 'bonus' ? `수상 보너스 ${c.toFixed(1)}억을 지급했습니다` : k === 'party' ? '축하 만찬을 열었습니다(0.1억)' : '축하 메시지를 전했습니다'}. 수상자 충성도 +${a}${all ? ', 선수단 +1' : ''}.`;
    }
    const d = e.data; let tr = 0, all = 0, c = 0; if (k === 'grand') { tr = 2; all = 2; c = 1.0; } else if (k === 'normal') { tr = 1; all = 1; c = 0.3; }
    if (all) for (const p of team) if (p.id !== d.pid) adj(p, all); if (tr) trust(this, tr); cost(this, c);
    this._cerLog({ kind: 'retire', name: d.name, pos: d.pos, yrs: d.yrs, size: k });
    if (k !== 'simple') { this.story('ceremony', `${d.name} 은퇴식(${d.pos}, ${d.yrs}시즌) — ${k === 'grand' ? '성대하게' : '보통 규모로'} 치렀습니다`, k === 'grand' ? 3 : 2); news(this, `${d.name} 은퇴식을 ${k === 'grand' ? '성대하게' : '열어'} 마쳤습니다.`); }
    e.status = 'done';   // 심의 대기 판정이 이 행사를 '진행 중'으로 보지 않게 먼저 닫는다
    if (this._legendProcess) this._legendProcess();   // 영구결번 후보라면 은퇴식 뒤에 심의 이벤트가 이어진다
    return `${d.name} 은퇴식: ${k === 'grand' ? '성대한 은퇴식을 치렀습니다(이사회 신뢰도 +2, 선수단 +2, 1.0억)' : k === 'normal' ? '보통 규모의 은퇴식을 열었습니다(이사회 신뢰도 +1, 선수단 +1, 0.3억)' : '간소하게 마무리했습니다'}.`;
  };
});
