/* 선수단 피로도(49단계): 공격적인 결정(총력전·계속 기용·조기 복귀·특타·기술 캠프)이 쌓이는 대가.
 *  이전에는 공격적 선택의 대가가 그 자리 확률로 끝나 '항상 공격적'(73.4승)이 '추천대로'(73.3승)와 같았다(12시즌 측정).
 *  피로도(0~100)는 결정마다 오르내리고 하루 0.6씩 저절로 풀린다. 35를 넘으면 10마다 우리 팀 능력치 보정 −0.07(결정 보정과 같은 척도),
 *  20을 넘으면 부상 위험 ×(1 + (피로도−20)/60). ⚠ 게임 설정: 수치는 '공격 일변도는 손해, 피로도를 보며 골라 쓰면 이득'이 되도록 맞춘 값. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, clamp } = LG.OFFC;
  const WEAR = { allin: { allin: 8 }, rest: { play: 3, rest: -4 }, ret: { now: 3, extra: -2 }, mood: { drill: 5, dinner: -1 }, camp: { skill: 4, fit: -8 } };
  const DECAY = 0.6, PEN_FROM = 35, PEN_STEP = 0.07, INJ_FROM = 20, INJ_DIV = 60;
  proto.wearDelta = function (kind, k) { return (WEAR[kind] || {})[k] || 0; };
  proto.wear = function () { const D = this.S.dec; return D && D.wear ? D.wear : 0; };
  proto.wearTier = function () { return Math.floor(Math.max(0, this.wear() - PEN_FROM) / 10 + (this.wear() > PEN_FROM ? 1 : 0)); };
  proto.wearInfo = function () {
    const w = Math.round(this.wear()), tier = this.wearTier(), inj = this._wearInj();
    return { v: w, tier, lv: w >= 65 ? '위험' : w >= PEN_FROM ? '높음' : w >= INJ_FROM ? '보통' : '양호', pen: tier * PEN_STEP, inj: Math.round((inj - 1) * 100),
      txt: `${tier ? `경기력 −${tier}단계` : '경기력 영향 없음'} · 부상 위험 ${inj > 1 ? '+' + Math.round((inj - 1) * 100) + '%' : '평소'}` };
  };
  proto._wearInj = function () { return 1 + Math.max(0, this.wear() - INJ_FROM) / INJ_DIV; };
  proto._wearShift = function (p) { const S = this.S; if (!S.dec || p.team !== S.userTeam) return 0; return -this.wearTier() * PEN_STEP; };
  const setW = (L, v) => { const D = L._dec(), t0 = L.wearTier(); D.wear = clamp(Math.round(v * 10) / 10, 0, 100); if (L.wearTier() !== t0) { L._engDirty = true; L.invalidate(); } };
  proto._wearAdd = function (v) { if (v) setW(this, this.wear() + v); };
  /* 결정 처리 뒤 피로도 반영 */
  const _res = proto._decResolve;
  proto._decResolve = function (e, k) { const r = _res.call(this, e, k), dv = this.wearDelta(e.data && e.data.kind, k); if (dv) { this._wearAdd(dv); if (typeof r === 'string') return `${r} (선수단 피로도 ${dv > 0 ? '+' : ''}${dv} → ${Math.round(this.wear())})`; } return r; };
  /* 매일 회복 */
  const _day = proto._decDay;
  proto._decDay = function (d) { const S = this.S; if ((S.phase === 'regular' || S.phase === 'preseason') && this.wear() > 0) setW(this, this.wear() - DECAY); return _day.call(this, d); };
});
