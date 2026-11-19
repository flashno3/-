/* KBO 감독 모드: 구단 투자 센터 (장기 시설 투자)
 *
 * 원칙: 투자하지 않으면(기본) 모든 규칙과 결과가 이전과 똑같다. 투자 효과는 기존 장치의 '곱셈 보정'으로만 들어가며 아래 수치는 모두 ⚠ 가정값이다
 * (실제 구단 투자 규모·효과 근거 데이터가 없으므로 게임 균형용 가정).
 *
 *  프로젝트 5개 × 3단계. 한 번에 한 단계씩 착공 → 다음 시즌 개막 때 완공(효과 시작).
 *   훈련 시설      훈련으로 얻는 성장 보정(_trainEff) ×1.05 / ×1.10 / ×1.15
 *   의무·재활 센터  내 선수 부상 복귀 기간 ×0.95 / ×0.90 / ×0.85, 부상 발생 확률 ×0.96 / ×0.92 / ×0.88
 *   스카우팅·데이터  스카우트 고용 한도 +1 / +2 / +2(그리고 3단계는 스카우트 주간 관찰 +1건)
 *   육성 시설      내 선수 성장 계산의 '출전 비중'에 +0.04 / +0.08 / +0.12 (경기에 못 나온 젊은 선수의 성장 둔화를 완화), 완공 후 1·2년차 0%, 3년차 40%, 4년차 70%, 5년차부터 100%(시차 T+3 이후 점진 발현)
 *   팬 경험(구장·마케팅) 시즌 기본 관중 +0.7% / +1.4% / +2.2% (구장 수용 한계까지만 반영)
 *  비용(억): 훈련·의무·스카우팅·육성 8/16/28, 팬 경험 10/20/34 — 착공 시 한 번에 올해 행사 비용(evCost)으로 계상 → 구단 손익(목표·이사회 평가)에 반영.
 *  연 유지비: 완공된 단계에 낸 누적 투자액의 5%를 매 시즌 개막 때 행사 비용으로 계상.
 *  투자 예산: 한 재정 연도에 쓸 수 있는 착공 비용은 '손실 허용 한도(이사회 승인 가능한 적자)'의 80%까지.
 * 선수 연봉·경쟁균형세·FA 여유자금(선수단 예산)은 직접 바꾸지 않는다(투자 비용은 손익에만 들어감). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { League, clamp } = LG;
  const proto = League.prototype;
  const r1 = v => Math.round(v * 10) / 10;
  const MAXLV = 3, UPKEEP = 0.05, BUDGET_K = 0.8;
  const PROJ = {
    train: { n: '훈련 시설', icon: '🏋️', cost: [8, 16, 28], desc: '훈련 센터의 효과를 키웁니다. 훈련으로 얻는 연말 성장 보정이 커집니다.', eff: ['없음', '훈련 효과 ×1.05', '훈련 효과 ×1.10', '훈련 효과 ×1.15'] },
    med: { n: '의무·재활 센터', icon: '🩺', cost: [8, 16, 28], desc: '전용 재활·치료 시설로 부상 복귀 기간을 줄이고 재발·신규 부상 확률을 낮춥니다.', eff: ['없음', '복귀 기간 −5% · 부상 확률 −4%', '복귀 기간 −10% · 부상 확률 −8%', '복귀 기간 −15% · 부상 확률 −12%'] },
    scout: { n: '스카우팅·데이터 센터', icon: '🔭', cost: [8, 16, 28], desc: '스카우트를 더 많이 둘 수 있고, 3단계에서는 스카우트당 주간 관찰이 늘어납니다.', eff: ['없음', '스카우트 한도 +1', '스카우트 한도 +2', '스카우트 한도 +2 · 주간 관찰 +1건'] },
    farm: { n: '육성 시설(2군·유소년)', icon: '🌱', cost: [8, 16, 28], desc: '경기에 못 나온 젊은 선수의 성장 둔화를 완화합니다. 실제 사례처럼 효과가 늦게 나타납니다(완공 후 1·2년차 0%, 3년차 40%, 4년차 70%, 5년차부터 100%).', eff: ['없음', '출전 비중 +0.04', '출전 비중 +0.08', '출전 비중 +0.12'] },
    fan: { n: '팬 경험(구장·마케팅)', icon: '🏟️', cost: [10, 20, 34], desc: '시즌 기본 관중을 늘립니다. 구장이 이미 꽉 차 있으면 효과가 줄어듭니다.', eff: ['없음', '기본 관중 +0.7%', '기본 관중 +1.4%', '기본 관중 +2.2%'] },
  };
  const ORDER = ['train', 'med', 'scout', 'farm', 'fan'], MULT = { train: [1, 1.05, 1.10, 1.15], med: [1, 0.96, 0.92, 0.88] }, DUR = [1, 0.95, 0.90, 0.85], RAMP = [0, 0, 0.4, 0.7, 1], FARM = [0, 0.04, 0.08, 0.12], FAN = [0, 0.007, 0.014, 0.022], SLOTS = [0, 1, 2, 2];
  proto.investProjects = function () { return PROJ; };
  proto._inv = function (create) { const S = this.S; if (!S.invest && create) S.invest = { eff: {}, queue: {}, paid: {}, spent: {}, log: [] }; return S.invest || null; };
  proto.investLv = function (k) { const I = this._inv(false); return I && I.eff[k] ? I.eff[k] : 0; };
  proto.investMult = function (k) { return MULT[k] ? MULT[k][this.investLv(k)] : 1; };
  proto.investDur = function () { return DUR[this.investLv('med')]; };
  proto.investRamp = function (k) { const I = this._inv(false); if (!I || !I.eff[k]) return 0; const since = I.since && I.since[k]; if (since === undefined) return 1; const s = Math.max(1, this.S.year - since + 1); return RAMP[Math.min(s, 5) - 1]; };   // 완공 후 몇 번째 시즌인지에 따른 도달률(육성 시설)
  proto.investFarm = function () { return FARM[this.investLv('farm')] * this.investRamp('farm'); };
  proto.investSlots = function () { return SLOTS[this.investLv('scout')]; };
  proto.investObs = function () { return this.investLv('scout') >= 3 ? 1 : 0; };
  proto.investFan = function () { return FAN[this.investLv('fan')]; };
  proto.investBudget = function () { const S = this.S, t = S.userTeam; return this.finReady() ? r1(BUDGET_K * this.finAllowed(t)) : 0; };
  proto.investSpent = function () { const I = this._inv(false); return I ? r1(I.spent[this._finYear()] || 0) : 0; };
  proto.investUpkeep = function () { const I = this._inv(false); if (!I) return 0; let s = 0; for (const k of ORDER) if (I.eff[k]) s += I.paid[k] || 0; return r1(s * UPKEEP); };   // 완공된 단계에 낸 누적 투자액의 5%
  proto.investRows = function () {
    const I = this._inv(false), budget = this.investBudget(), left = r1(budget - this.investSpent());
    return ORDER.map(k => { const lv = this.investLv(k), pend = I && I.queue[k] ? I.queue[k] : null, base = lv, nextLv = (pend || lv) + 1, cost = nextLv <= MAXLV ? PROJ[k].cost[nextLv - 1] : null; return { key: k, n: PROJ[k].n, icon: PROJ[k].icon, desc: PROJ[k].desc, lv, pend, effNow: PROJ[k].eff[lv], effNext: nextLv <= MAXLV ? PROJ[k].eff[nextLv] : null, cost: pend ? null : cost, canBuy: !pend && lv < MAXLV, paid: I ? r1(I.paid[k] || 0) : 0, left }; });
  };
  proto.investEstimate = function (k, lv) {   // 단계 효과의 규모를 현재 상태로 추정(표시용, 읽기 전용)
    const S = this.S, t = S.userTeam;
    if (k === 'fan' && this.finReady()) { const f = S.fin.teams[t], pv = this.finPreview(t), att = pv.att, cap = pv.cap, pct = FAN[lv], room = Math.max(0, cap / Math.max(1, att) - 1), eff = Math.min(pct, room); return `현재 평균 관중 ${att.toLocaleString()}명 / 수용 ${cap.toLocaleString()}명 → 실제 반영 약 +${(eff * 100).toFixed(1)}% (시즌 입장 수입 약 +${r1(pv.gate * eff)}억)`; }
    return '';
  };
  proto.investCheck = function (k) {
    const S = this.S, t = S.userTeam, P = PROJ[k]; if (!P) return '알 수 없는 프로젝트입니다.'; if (!this.finReady()) return '재정 정보가 없습니다.';
    if (S.phase === 'post') return '포스트시즌 중에는 착공할 수 없습니다.';
    const I = this._inv(false), lv = this.investLv(k); if (I && I.queue[k]) return '이미 공사 중입니다. 다음 시즌 개막 때 완공됩니다.'; if (lv >= MAXLV) return '이미 최고 단계입니다.';
    const cost = P.cost[lv], left = r1(this.investBudget() - this.investSpent()); if (cost > left + 1e-9) return `올해 투자 예산이 부족합니다(필요 ${cost}억 · 남은 예산 ${left}억).`; return null;
  };
  proto.investBuy = function (k) {
    const bl = this.investCheck(k); if (bl) return bl; const S = this.S, t = S.userTeam, f = S.fin.teams[t], I = this._inv(true), lv = this.investLv(k), cost = PROJ[k].cost[lv], y = this._finYear();
    f.evCost = r1((f.evCost || 0) + cost); I.queue[k] = lv + 1; I.paid[k] = r1((I.paid[k] || 0) + cost); I.spent[y] = r1((I.spent[y] || 0) + cost);
    I.log.unshift({ y: S.year, d: S.day, ph: S.phase, text: `${PROJ[k].n} ${lv + 1}단계 착공 (${cost}억)` }); if (I.log.length > 20) I.log.length = 20;
    this._news(`구단 투자: ${PROJ[k].n} ${lv + 1}단계 착공 — ${cost}억(올해 손익에 반영), 다음 시즌 개막 때 완공`); this.invalidate(); return null;
  };
  proto._investApply = function () {   // 새 시즌 개막: 공사 완료 + 연 유지비 + 팬 경험(관중 보정)
    const S = this.S, I = this._inv(false); if (!I) return; const f = S.fin && S.fin.teams && S.fin.teams[S.userTeam], done = [];
    I.since = I.since || {}; for (const k of Object.keys(I.queue)) { if (!I.eff[k]) I.since[k] = S.year; I.eff[k] = I.queue[k]; done.push(`${PROJ[k].n} ${I.eff[k]}단계`); delete I.queue[k]; }
    if (f) { const up = this.investUpkeep(); if (up > 0) f.evCost = r1((f.evCost || 0) + up); const fan = this.investFan(); if (fan > 0) f.attMult = (f.attMult || 1) * (1 + fan); }
    if (done.length) { I.log.unshift({ y: S.year, d: 0, ph: 'preseason', text: `완공: ${done.join(', ')}` }); this._news(`구단 투자 완공: ${done.join(', ')} — 이번 시즌부터 효과가 적용됩니다`); }
    this.invalidate();
  };
  proto._investReset = function () { this.S.invest = null; };   // 다른 구단으로 옮기면 투자 기록은 이전 구단 것이라 초기화

  /* 참고 자료(사용자 제공, ⚠ 원출처 대조 전): 구단별 2군·재활 훈련 시설과 리그 관중 추이. 게임 규칙에는 쓰지 않고 화면 안내에만 쓴다. */
  const FAC = {
    Twins: ['LG 챔피언스파크(경기 이천)', '약 1,200억 원', '국내 최대 규모 복합 육성 단지, 실내 돔 연습장, 재활센터, 숙소'],
    Landers: ['SSG 퓨처스필드(인천 강화)', '약 450억 원(부지+공사)', '1군 문학구장과 같은 규격·흙의 내야 연습장, 실내 훈련장, 숙소 2개 동'],
    Eagles: ['서산 전용연습구장(충남 서산)', '약 360억 원 이상(초기 260억 + 제2구장 100억)', '정규 구장 2면, 야간 조명, 실내 연습장, 3군(육성군)·재활군 분리 운영'],
    Lions: ['경산 볼파크(경북 경산)', '약 300억 원대(초기 건립 및 수차례 리모델링)', '국내 최초 현대식 2군 합숙·훈련 시설, BB아크(육성 프로그램)·재활 시스템'],
    Tigers: ['함평 기아 챌린저스 필드(전남 함평)', '약 250억 원(이후 야간조명·제2구장 추가)', '주경기장·보조경기장 2면, 50m×50m 대형 실내연습장, 재활 트레이닝실'],
    Giants: ['상동 야구장(경남 김해)', '약 250억 원', '주경기장, 실내연습장, 경기운영관, 숙소 및 웨이트·재활 시설'],
    Bears: ['이천 베어스파크', '수십~수백억 원대(리모델링·첨단 트래킹 장비)', ''],
    Dinos: ['마산구장 리모델링 활용', '수십~수백억 원대(리모델링·첨단 트래킹 장비)', ''],
    Wiz: ['익산 국가대표 야구훈련장(지자체 협약)', '수십~수백억 원대(리모델링·첨단 트래킹 장비)', ''],
    Heroes: ['고양 국가대표 야구훈련장(임대)', '수십~수백억 원대(리모델링·첨단 트래킹 장비)', ''],
  };
  const LEAGUE_ATT = [['총 관중', '약 1,088만 명', '1,231만 2,519명', '1,277만 551명'], ['경기당 평균 관중', '약 15,122명', '17,101명', '17,737명'], ['공식 좌석 점유율', '약 81.4%', '약 83.2%', '85.4%'], ['총 매진 경기', '221경기', '331경기', '345경기']];
  proto.investFacilities = function () { const out = {}; for (const t of Object.keys(FAC)) out[t] = { name: FAC[t][0], cost: FAC[t][1], note: FAC[t][2] }; return out; };
  proto.investLeagueAtt = function () {
    const S = this.S, t = S.userTeam, f = S.fin && S.fin.teams && S.fin.teams[t];
    return { table: LEAGUE_ATT, mine: f ? { att: f.att0, cap: this.finCap(t), occ: Math.round(f.att0 / this.finCap(t) * 1000) / 10 } : null };
  };
});
