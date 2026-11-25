(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* [오프시즌 분할] 선수 성장·노화·육성 방향 — 원본 offseason.js 순서 그대로. 공용 심볼은 off_common.js(LG.OFFC). */
  const { proto, clamp, gauss, TEAMS, KO0, TRAITS } = LG.OFFC;
  /* ---------------- 선수 성장 / 노화 ---------------- */
  const AGING_SCALE = 0.7;
  const TRAIN_PEAK = 3;   // 훈련 보정(배율−1) 1당 정점 +3 OVR/년(⚠ 가정)
  const BCURVE = { 18: .32, 19: .30, 20: .28, 21: .26, 22: .22, 23: .18, 24: .13, 25: .08, 26: .04, 27: .01, 28: -.02, 29: -.04, 30: -.06, 31: -.08, 32: -.11, 33: -.14, 34: -.18, 35: -.22 };
  const PCURVE = { 18: .30, 19: .28, 20: .26, 21: .22, 22: .18, 23: .14, 24: .10, 25: .06, 26: .03, 27: .0, 28: -.02, 29: -.04, 30: -.06, 31: -.09, 32: -.12, 33: -.16, 34: -.2, 35: -.25 };
  /* 올 시즌 출전 비율(0~1): 1군 기록 + 0.8×2군 기록을 풀타임 기준(타자 450타석, 선발 550·불펜 200타자)과 비교 */
  proto.playShare = function (p) {
    if (p.team === 'MIL') return 0.7;   // 상무에서 꾸준히 출전한다고 가정
    const S = this.S, a = S.stats, b = S.stats2 || { bat: {}, pit: {} };
    if (p.type === 'B') { const w = ((a.bat[p.id] || {}).PA || 0) + 0.8 * ((b.bat[p.id] || {}).PA || 0); return clamp(w / 450, 0, 1); }
    const w = ((a.pit[p.id] || {}).BF || 0) + 0.8 * ((b.pit[p.id] || {}).BF || 0); return clamp(w / (p.role === 'SP' ? 550 : 200), 0, 1);
  };
  /* ---------------- 시즌 중 성장 서사: 각성 / 벽 ----------------
   *  30~110일차, 숨은 정점이 있는 25세 이하 유망주(정점 − 현재 OVR ≥ 6)에게 하루 각성 0.11% · 벽 0.11%(선수당 시즌 1회, 리그 전체 평균이 변하지 않게 대칭). 모든 구단에 같은 규칙.
   *  각성: 정점 +2~4 / 벽: 정점 −2~4. 스카우트 추정치도 같은 만큼 움직인다(눈에 보이는 변화). 내 구단은 이벤트로 대응을 고른다. ⚠ 확률·크기는 가정 */
  const GR = { from: 30, to: 110, up: 0.0011, down: 0.0011, gap: 6 };
  const grr = (S, p, d, salt) => LG.OFFC.rngFor(S.seed, S.year, d, 7300 + salt + (parseInt(String(p.id).slice(1)) || 0) % 991).random();
  proto._peakAdj = function (p, v) { p.peak = clamp(Math.round((p.peak + v) * 10) / 10, 25, 85); if (p.scout) p.scout.ceil = clamp(Math.round((p.scout.ceil + v) * 10) / 10, 25, 85); };
  proto._growDay = function (d) {
    const S = this.S; if (S.phase !== 'regular' || d < GR.from || d > GR.to) return;
    for (const t of TEAMS) for (const p of this.players(t)) {
      if (p.peak === undefined || p.age > 25 || p.foreign || p.grEv === S.year || this.isInj(p)) continue; const gap = p.peak - this.ovr(p); if (gap < GR.gap) continue;
      const x = grr(S, p, d, 1); let kind = null; if (x < GR.up) kind = 'up'; else if (x < GR.up + GR.down) kind = 'down'; if (!kind) continue;
      p.grEv = S.year; const v = kind === 'up' ? Math.round((2 + 2 * grr(S, p, d, 2)) * 10) / 10 : -Math.round((2 + 2 * grr(S, p, d, 3)) * 10) / 10; this._peakAdj(p, v);
      (p.devLog = p.devLog || []).push({ y: S.year, d, v, why: kind === 'up' ? '시즌 중 각성' : '시즌 중 벽' }); if (p.devLog.length > 8) p.devLog.shift();
      if (t === S.userTeam) this._growEvent(p, kind, v); else if (kind === 'up' && this.ovr(p) >= 45) this._lnews(`${KO0[t] || t} 유망주 ${p.ko}(${p.age}세)이(가) 한 단계 올라섰다는 평가를 받습니다`);
    }
  };
  proto._growEvent = function (p, kind, v) {
    const S = this.S, T = TRAITS[this.traitOf(p)] || '-', est = p.scout ? Math.round(p.scout.ceil) : null, where = p.active ? '1군' : '2군';
    if (kind === 'up') return this._evAdd({ type: 'grow', ttl: 8, def: 'watch', rec: p.active ? 'drill' : 'up', data: { pid: p.id, kind }, title: `${p.ko} 각성의 조짐`,
      text: `${where}의 ${p.ko}(${p.age}세, ${T}, OVR ${this.ovr(p)})이(가) 최근 눈에 띄게 달라졌습니다. 스카우트가 성장 상한 추정치를 올렸습니다(+${v}${est ? ', 추정 ' + est : ''}). 이 흐름을 어떻게 살릴까요?`, choices: [
        ...(p.active ? [] : [{ k: 'up', label: '1군에서 기회를 준다', hint: '1군 등록(가능할 때) · 컨디션 +2(30일) · 성장 상한 +1' }]),
        { k: 'drill', label: '개별 특훈을 붙인다', hint: '개별 훈련 슬롯에 추가(자리가 있을 때) · 성장 상한 +1 · 훈련 부상 위험은 슬롯 설정대로' },
        { k: 'watch', label: '지켜본다', hint: '추가 효과 없음' }] });
    return this._evAdd({ type: 'grow', ttl: 8, def: 'leave', rec: 'mental', data: { pid: p.id, kind }, title: `${p.ko} 성장의 벽`,
      text: `${p.ko}(${p.age}세, ${T}, OVR ${this.ovr(p)})이(가) 벽에 부딪혔다는 보고입니다. 스카우트가 성장 상한 추정치를 낮췄습니다(${v}${est ? ', 추정 ' + est : ''}). 어떻게 도울까요?`, choices: [
        { k: 'mental', label: '멘탈 코칭(0.2억)', hint: '60%: 성장 상한 +2 회복 / 아니면 효과 없음' },
        { k: 'reset', label: p.active ? '2군에서 재정비' : '2군에서 차분히 재정비', hint: '50%: 성장 상한 +1.5 회복 · 컨디션 +1(30일)' + (p.active ? ' · 1군 말소' : '') },
        { k: 'leave', label: '그대로 둔다', hint: '추가 효과 없음' }] });
  };
  proto._growResolve = function (e, k) {
    const S = this.S, p = S.players[e.data.pid], d = S.day; if (!p || p.team !== S.userTeam || p.peak === undefined) return '이미 지난 일입니다.';
    const f = S.fin && S.fin.teams[S.userTeam], log = (v, why) => { this._peakAdj(p, v); (p.devLog = p.devLog || []).push({ y: S.year, d, v, why }); if (p.devLog.length > 8) p.devLog.shift(); };
    if (e.data.kind === 'up') {
      if (k === 'up') { const err = p.active ? null : this.moveActive(p.id, true); if (err) return `지금은 1군에 올릴 수 없습니다(${err}). 지켜보기로 합니다.`; p.mood = { v: 2, until: d + 30 }; log(1, '각성 뒤 1군 기회'); this.invalidate(); return `${p.ko}에게 1군 기회를 줍니다(컨디션 +2, 성장 상한 +1).`; }
      if (k === 'drill') { const err = this.slotAdd ? this.slotAdd(p.id) : '개별 훈련 기능 없음'; if (err) return `개별 특훈을 붙이지 못했습니다(${err}). 지켜보기로 합니다.`; log(1, '각성 뒤 개별 특훈'); return `${p.ko}에게 개별 특훈을 붙였습니다(성장 상한 +1).`; }
      return `${p.ko}의 흐름을 지켜봅니다.`;
    }
    if (k === 'mental') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.2) * 10) / 10; if (grr(S, p, d, 5) < 0.6) { log(2, '멘탈 코칭'); return `멘탈 코칭이 효과를 봤습니다(성장 상한 +2).`; } return `멘탈 코칭을 했지만 아직 달라진 게 없습니다(0.2억).`; }
    if (k === 'reset') { if (p.active) this.moveActive(p.id, false); p.mood = { v: 1, until: d + 30 }; this.invalidate(); if (grr(S, p, d, 6) < 0.5) { log(1.5, '2군 재정비'); return `2군 재정비로 ${p.ko}이(가) 다시 감을 잡았습니다(성장 상한 +1.5, 컨디션 +1).`; } return `${p.ko}을(를) 2군에서 재정비시킵니다(컨디션 +1).`; }
    return `${p.ko}을(를) 그대로 둡니다.`;
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
        const jmp = r.random() < 0.05 ? (r.random() < 0.5 ? 5 : -5) : 0; p.peak = clamp(p.peak + gauss(r, 0, 1.8) + jmp, 25, 85);   // (난수 소비 순서는 기존과 같다)
        if (jmp && p.team === this.S.userTeam && this.S.players[p.id] === p && this.story) {   // 예측용 복제본(devForecast)에는 기록하지 않는다
          this.story('train', jmp > 0 ? `겨울 사이 ${p.ko}(${a}세)이(가) 한 단계 올라섰다는 스카우트 보고(성장 상한 ↑)` : `${p.ko}(${a}세)이(가) 겨울 동안 정체됐다는 스카우트 보고(성장 상한 ↓)`, 2); (p.devLog = p.devLog || []).push({ y: this.S.year, v: jmp, why: jmp > 0 ? '겨울 사이 도약' : '겨울 사이 정체' }); if (p.devLog.length > 8) p.devLog.shift(); }
        const yrs = Math.max(1, 28 - a), g0 = clamp(((p.peak - old) / yrs) / 14 * (1 + gauss(r, 0, 0.3)) + gauss(r, 0, 0.04), -0.15, 0.7);
        gain = g0 > 0 ? g0 * pf : g0;
        p.scout.ceil = clamp(0.6 * p.scout.ceil + 0.4 * (p.peak + gauss(r, 0, 3)), 25, 85);   // 스카우트 평가가 시간이 지나며 정확해진다
      } else { delete p.peak; delete p.pot; }
    } else if (a <= 26 && p.pot > 0) { const g2 = Math.min(p.pot, 0.4) * (0.6 + 0.8 * r.random()) * pf; gain = Math.max(gain, g2); p.pot = Math.max(0, p.pot - Math.max(0, g2)); }
    const dv = a <= 28 && this.S.coach ? this._devEffects(p) : null;   // 육성 방향·코치진 효과(28세 이하)
    if (dv && gain > 0) gain *= dv.mul;
    const te = p.team === this.S.userTeam && this._trainEff ? this._trainEff(p) : { mult: 1, w: {}, speed: 0, range: 0, stamina: 0 };   // 시즌 중 훈련(팀·개별·캠프) 누적 효과
    if (gain > 0) gain *= te.mult; const tw = gain > 0 ? te.w : {};
    if (te.mult > 1 && p.peak !== undefined && a <= 25) p.peak = clamp(p.peak + TRAIN_PEAK * (te.mult - 1), 25, 85);   // 25세 이하 유망주: 꾸준한 훈련은 성장 속도뿐 아니라 정점도 조금 끌어올린다(⚠ 계수 가정)
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
