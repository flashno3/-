(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  /* 오프시즌 모듈 공용 상수·헬퍼(분할된 off_*.js 가 LG.OFFC 로 공유) */
  const { League, ORDER, ACTIVE_MAX, ROSTER_MAX, ROSTER_MIN, rngFor, clamp } = LG;
  const { TEAMS } = Engine;
  const SURN = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남'];
  const GIV = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준우', '현우', '도현', '건우', '우진', '승현', '민재', '재원', '태양', '성민', '동현', '진우', '유찬', '지훈', '수호', '현준', '재윤', '정우', '시윤', '은우', '준혁', '태윤', '민성', '승우', '하린', '찬영', '다온', '규민', '원준', '세훈', '상원'];
  const POSW = [['C', 10], ['1B', 8], ['2B', 11], ['3B', 11], ['SS', 12], ['LF', 14], ['CF', 12], ['RF', 14], ['DH', 8]];
  const gauss = (r, m, s) => r.gauss(m, s);
  const KO0 = { Bears: '두산', Twins: 'LG', Heroes: '키움', Landers: 'SSG', Wiz: 'KT', Eagles: '한화', Tigers: 'KIA', Giants: '롯데', Dinos: 'NC', Lions: '삼성' };
  const LIM_DEADLINE = 110;   // 트레이드 마감(일차)
  const proto = League.prototype;
  const news = (L, text) => { const S = L.S; S.news.unshift({ year: S.year, day: S.day, text }); if (S.news.length > 120) S.news.length = 120; if (L._storyFromNews) L._storyFromNews(text); };
  const TIERS = [   // [이름, 확률, 정점 OVR 범위]
    ['슈퍼스타', 0.025, 68, 80], ['확실한 주전', 0.12, 57, 67.9], ['준주전', 0.25, 48, 56.9], ['후보', 0.38, 38, 47.9], ['육성', 0.225, 28, 37.9]
  ];
  const SLOT_PRIOR = { '1차': [0.124, 0.124, 0.143, 0.248, 0.362], 'R1top3': [0.083, 0.312, 0.25, 0.229, 0.125], 'R1': [0.098, 0.174, 0.174, 0.196, 0.359], 'R2': [0.058, 0.094, 0.174, 0.283, 0.391], 'R3': [0.036, 0.087, 0.116, 0.174, 0.587], 'R4': [0.007, 0.029, 0.109, 0.159, 0.696], 'R5': [0.008, 0.028, 0.044, 0.111, 0.809], '육성': [0.039, 0.039, 0.109, 0.305, 0.508] };
  /* 1군 미데뷔 보정: 2002~2017 신인 1,528명 중 'A세 시즌 시작 때까지 1군 데뷔가 없던' 선수의 최종 등급 분포 ÷ 같은 나이 풀 전체 분포(가능도비, 평활 k=20).
   * hs 고졸(지명 시즌 19세)·col 대졸(23세)·all 구분 불명. 등급은 통산 타석·이닝 기준이라 남은 경력 길이 효과가 섞여 있다(⚠ 재능 차이를 다소 과대평가할 수 있음) */
  const UNDEB_LR = { hs: { 20: [0.352, 0.471, 0.626, 0.785, 1.211], 21: [0.147, 0.241, 0.342, 0.653, 1.325], 22: [0.163, 0.175, 0.285, 0.483, 1.379], 23: [0.083, 0.136, 0.199, 0.421, 1.417], 24: [0.088, 0.118, 0.169, 0.325, 1.445], 25: [0.044, 0.129, 0.067, 0.162, 1.499] },
    col: { 24: [0.638, 0.608, 0.776, 0.63, 1.218], 25: [0.259, 0.285, 0.619, 0.465, 1.345] },
    all: { 20: [0.352, 0.471, 0.626, 0.785, 1.211], 21: [0.147, 0.241, 0.342, 0.653, 1.325], 22: [0.163, 0.175, 0.285, 0.483, 1.379], 23: [0.343, 0.465, 0.653, 0.819, 1.199], 24: [0.202, 0.255, 0.428, 0.473, 1.36], 25: [0.07, 0.153, 0.271, 0.281, 1.456] } };
  const undebLR = (p, dh) => {   // 1군 미데뷔: 지명 이력이 있으면 데뷔 연도 없음/2027 이후, 없으면 2026 1군 기록 없이 퓨처스 기록만 있는 선수(⚠ 2025 이전 1군 출전 여부는 모름)
    const und = dh ? (dh.deb == null || dh.deb > 2026) : p.src === 'F'; if (!und) return null;
    const g = dh ? (dh.univ ? 'col' : 'hs') : 'all'; return (UNDEB_LR[g] && UNDEB_LR[g][p.age]) || null;
  };
  const slotPrior = dh => {
    let k = 'R5'; if (dh) { if (dh.kind === '1차') k = '1차'; else if (dh.kind === '육성선수') k = '육성'; else if (dh.kind === '해외') k = 'R1'; else if (dh.round) k = dh.round === 1 ? (dh.pick && dh.pick <= 3 ? 'R1top3' : 'R1') : 'R' + Math.min(dh.round, 5); }
    return SLOT_PRIOR[k].map((v, i) => 0.85 * v + 0.15 * TIERS[i][1]);
  };
  const BONUS_SHARE = 0.35;   // 실제 FA 계약 26건의 계약금 비중 평균 36%(12~73%)
  const FA_END = 75, FA_REG_DAYS = 145, EXT_LIMIT = 3, FOREIGN_NEW = { gen: 14, aq: 2.8 }, FOREIGN_RAISE = { gen: 7, aq: 1.4 };
  const TRAITS = { clutch: '승부사', model: '모범생', free: '자유분방', leader: '리더형', shy: '소심형' };
  LG.OFFC = { League, ORDER, ACTIVE_MAX, ROSTER_MAX, ROSTER_MIN, rngFor, clamp, TEAMS, SURN, GIV, POSW, gauss, KO0, LIM_DEADLINE, proto, news, TIERS, SLOT_PRIOR, slotPrior, undebLR, BONUS_SHARE, FA_END, FA_REG_DAYS, EXT_LIMIT, FOREIGN_NEW, FOREIGN_RAISE, TRAITS };
});
