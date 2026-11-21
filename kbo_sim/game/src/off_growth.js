(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 선수 성장·노화·육성 방향 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, clamp, gauss } = LG.OFFC;
  /* ---------------- 선수 성장 / 노화 ---------------- */
  const AGING_SCALE = 0.7;
  const BCURVE = { 18: .32, 19: .30, 20: .28, 21: .26, 22: .22, 23: .18, 24: .13, 25: .08, 26: .04, 27: .01, 28: -.02, 29: -.04, 30: -.06, 31: -.08, 32: -.11, 33: -.14, 34: -.18, 35: -.22 };
  const PCURVE = { 18: .30, 19: .28, 20: .26, 21: .22, 22: .18, 23: .14, 24: .10, 25: .06, 26: .03, 27: .0, 28: -.02, 29: -.04, 30: -.06, 31: -.09, 32: -.12, 33: -.16, 34: -.2, 35: -.25 };
  /* 올 시즌 출전 비율(0~1): 1군 기록 + 0.8×2군 기록을 풀타임 기준(타자 450타석, 선발 550·불펜 200타자)과 비교 */
  proto.playShare = function (p) {
    if (p.team === 'MIL') return 0.7;   // 상무에서 꾸준히 출전한다고 가정
    const S = this.S, a = S.stats, b = S.stats2 || { bat: {}, pit: {} };
    if (p.type === 'B') { const w = ((a.bat[p.id] || {}).PA || 0) + 0.8 * ((b.bat[p.id] || {}).PA || 0); return clamp(w / 450, 0, 1); }
    const w = ((a.pit[p.id] || {}).BF || 0) + 0.8 * ((b.pit[p.id] || {}).BF || 0); return clamp(w / (p.role === 'SP' ? 550 : 200), 0, 1);
  };
  proto.progress = function (p, r, play) {   // play: 0~1 출전 비율(젊은 선수 성장에 반영)
    const sc = this.S.calib.scale[p.type], lb = this.S.calib.lb, old = this.ovr(p), a = p.age + 1;
    p.age = a;
    const curve = (p.type === 'B' ? BCURVE : PCURVE)[clamp(a, 18, 35)] !== undefined ? (p.type === 'B' ? BCURVE : PCURVE)[clamp(a, 18, 35)] : -.3;
    let gain = (a > 35 ? -.24 : curve) + gauss(r, 0, 0.09);
    if (gain < 0) gain *= AGING_SCALE;   // 노화 하락 완화(체감 하락폭 조정): 30~32세 약 −0.7, 33~35세 약 −2, 36세+ 약 −3 OVR/년
    if (a >= 33 && gain < 0) gain *= 1 - 0.4 * clamp((old - 55) / 20, 0, 1);   // 상위권 선수는 에이징 하락이 최대 40% 완만(류현진·양의지·최정 등)
    const pf = play === undefined ? 1 : 0.55 + 0.45 * clamp(play, 0, 1);   // 경기에 못 나온 젊은 선수는 성장이 더딘다(최대 -45%)
    if (a <= 26 && gain > 0 && p.peak === undefined) gain *= pf;
    if (p.peak !== undefined) {
      if (a <= 27) {   // 드래프트 신인: 정점을 향해 해마다 격차를 좁힌다(해마다 정점 자체도 흔들림: 대성장·정체 가능)
        p.peak = clamp(p.peak + gauss(r, 0, 1.8) + (r.random() < 0.05 ? (r.random() < 0.5 ? 5 : -5) : 0), 25, 85);
        const yrs = Math.max(1, 28 - a), g0 = clamp(((p.peak - old) / yrs) / 14 * (1 + gauss(r, 0, 0.3)) + gauss(r, 0, 0.04), -0.15, 0.7);
        gain = g0 > 0 ? g0 * pf : g0;
        p.scout.ceil = clamp(0.6 * p.scout.ceil + 0.4 * (p.peak + gauss(r, 0, 3)), 25, 85);   // 스카우트 평가가 시간이 지나며 정확해진다
      } else { delete p.peak; delete p.pot; }
    } else if (a <= 26 && p.pot > 0) { const g2 = Math.min(p.pot, 0.4) * (0.6 + 0.8 * r.random()) * pf; gain = Math.max(gain, g2); p.pot = Math.max(0, p.pot - Math.max(0, g2)); }
    const dv = a <= 28 && this.S.coach ? this._devEffects(p) : null;   // 육성 방향·코치진 효과(28세 이하)
    if (dv && gain > 0) gain *= dv.mul;
    const te = p.team === this.S.userTeam && this._trainEff ? this._trainEff(p) : { mult: 1, w: {}, speed: 0, range: 0, stamina: 0 };   // 시즌 중 훈련(팀·개별·캠프) 누적 효과
    if (gain > 0) gain *= te.mult; const tw = gain > 0 ? te.w : {};
    const shift = f => gain * 0.75 * (dv ? dv.w[f] || 1 : 1) * (tw[f] || 1) + gauss(r, 0, 0.07);
    const set = (f, dir, lo, hi, s) => { p.p[f] = clamp(p.p[f] + dir * s * sc[f][1], lo, hi); };
    if (p.type === 'B') {
      set('k', -1, 0.06, 0.45, shift('k')); set('bb', 1, 0.015, 0.20, shift('bb')); set('hr', 1, 0.002, 0.07, shift('hr')); set('babip', 1, 0.24, 0.39, shift('babip')); set('xbh', 1, 0.10, 0.32, shift('xbh'));
      const sp = (a <= 24 ? 0.04 : a <= 28 ? -0.05 : -0.2) + (dv ? dv.speed : 0) + (gain > 0 ? te.speed : 0) + gauss(r, 0, 0.08); set('sba', 1, 0.005, 0.25, sp); p.p.tri = clamp(p.p.tri * (1 + sp * 0.25), 0.01, 0.2);
      if (a >= 31) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range - 1.1 * r.random() * 1.6, 25, 80);
      else if (a <= 24) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range + 0.8 * r.random() * 1.6 + (dv ? dv.range : 0) + (gain > 0 ? te.range : 0), 25, 80);
      if (a > 24 && a < 31 && (dv && dv.range || gain > 0 && te.range)) for (const pos in p.fr) p.fr[pos].range = clamp(p.fr[pos].range + (dv ? dv.range : 0) + (gain > 0 ? te.range : 0), 25, 80);
    } else {
      set('k', 1, 0.08, 0.40, shift('k')); set('bb', -1, 0.02, 0.18, shift('bb')); set('hr', -1, 0.004, 0.06, shift('hr')); set('babip', -1, 0.25, 0.37, shift('babip'));
      p.stamina = clamp(p.stamina + (a <= 25 ? 1.2 : a >= 33 ? -1.5 : 0) + (dv ? dv.stamina : 0) + (gain > 0 ? te.stamina : 0) + gauss(r, 0, 1.2), 25, 75);
      if (dv) this._devRole(p, dv.plan);
    }
    { const sb = p.team === this.S.userTeam && this._skillApply ? this._skillApply(p) : null;   // 기술 습득 프로젝트 보너스(일회성·영구)
      if (sb) { const dir = p.type === 'B' ? { k: -1, bb: 1, hr: 1, babip: 1, xbh: 1 } : { k: 1, bb: -1, hr: -1, babip: -1 }, rg = p.type === 'B' ? { k: [0.06, 0.45], bb: [0.015, 0.20], hr: [0.002, 0.07], babip: [0.24, 0.39], xbh: [0.10, 0.32] } : { k: [0.08, 0.40], bb: [0.02, 0.18], hr: [0.004, 0.06], babip: [0.25, 0.37] };
        for (const f of Object.keys(sb)) if (dir[f] && rg[f]) set(f, dir[f], rg[f][0], rg[f][1], sb[f]); } }
    if (p.peak !== undefined) p.pot = clamp((p.peak - this.ovr(p)) / 30, 0, 1.4);
    return this.ovr(p) - old;
  };
  /* 은퇴 확률: 나이 + 능력치. 에이징 구간에서도 능력치가 높은 선수는 오래 뛴다(42세 일괄 은퇴 폐지) */
  proto.retireChance = function (p) {
    const o = this.ovr(p), a = p.age; if (a >= 48) return 1; if (a < 35) return 0;
    let c = a >= 42 ? 0.35 + 0.1 * (a - 42) : 0.07 * (a - 34);
    c += o < 45 ? 0.25 : o < 50 ? 0.1 : 0;
    c -= o >= 70 ? 0.4 : o >= 65 ? 0.3 : o >= 60 ? 0.2 : o >= 55 ? 0.1 : 0;
    return clamp(c, 0.02, 0.97);
  };

});
