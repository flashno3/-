/* 구단 역사(1층: 확인된 개괄 정보 · 2층: 역사에서 만들어지는 서사 문구).
 * 1층 데이터는 보도·위키 검색으로 확인한 값(창단·명칭 변천·한국시리즈 우승 횟수·영구결번)이며, 연도 목록 중 검색에서 직접 확인되지 않은 것은 yv:false 로 표시한다(우승 횟수와는 대조함).
 * 2층은 이 데이터와 게임 안에서 쌓인 기록(S.history)으로 문구만 만든다 — 난수·경기 결과·재정에 영향 없음. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { League } = LG, { TEAMS } = Engine, proto = League.prototype;
  /* founded: 프랜차이즈 출범(1군) 연도 · lineage: [연도, 명칭] · titles: 한국시리즈 우승 연도(2026 가을까지) · yv: 우승 연도 목록이 검색으로 확인됐는지 · ret: 영구결번 [번호, 선수, 연도]
   * runner: 확인된 준우승 연도(전부는 아님) · src: 근거 요약 */
  const CLUBS = {
    Bears: { founded: 1982, city: '서울', lineage: [[1982, 'OB 베어스'], [1999, '두산 베어스']], note: '1982년 KBO 원년 구단. 대전·충청 연고로 출범해 이후 서울로 이전.', titles: [1982, 1995, 2001, 2015, 2016, 2019], yv: true, runner: [], ret: [[54, '김영신', 1986], [21, '박철순', null]], retNote: '54번은 KBO 최초의 영구결번.', src: '뉴시스(2020)·위키백과' },
    Twins: { founded: 1982, city: '서울', lineage: [[1982, 'MBC 청룡'], [1990, 'LG 트윈스']], note: 'MBC 청룡을 1990년 LG가 인수해 LG 트윈스로 재출범.', titles: [1990, 1994, 2023, 2025], yv: false, runner: [], ret: [[41, '김용수', 1999], [9, '이병규', 2017], [33, '박용택', 2022]], retNote: '', src: '뉴시스(2025 우승 통산 4회)·OSEN' },
    Heroes: { founded: 2008, city: '서울', lineage: [[2008, '우리 히어로즈'], [2010, '넥센 히어로즈'], [2019, '키움 히어로즈']], note: '2008년 현대 유니콘스 해체 뒤 센테니얼 인베스트먼트가 창단(현대 유니콘스의 우승 기록은 별도 구단).', titles: [], yv: true, runner: [2014, 2019, 2022], ret: [], retNote: '', src: '위키백과·보도' },
    Landers: { founded: 2000, city: '인천', lineage: [[2000, 'SK 와이번스'], [2021, 'SSG 랜더스']], note: '2000년 SK 와이번스로 창단, 2021년 신세계그룹이 인수해 SSG 랜더스로 출범.', titles: [2007, 2008, 2010, 2018, 2022], yv: false, runner: [], ret: [[26, '박경완', 2014]], retNote: '', src: '위키백과·OSEN(박경완 영구결번)·보도(통산 5회)' },
    Wiz: { founded: 2013, city: '수원', lineage: [[2013, 'kt wiz']], note: '2013년 창단, 2014년 퓨처스리그를 거쳐 2015년 1군에 합류한 10번째 구단.', titles: [2021], yv: false, runner: [2026], ret: [], retNote: '', src: '위키백과·보도(2026 한국시리즈)' },
    Eagles: { founded: 1986, city: '대전', lineage: [[1986, '빙그레 이글스'], [1994, '한화 이글스']], note: '1986년 빙그레 이글스로 7번째 구단 출범, 1994년 한화가 인수.', titles: [1999], yv: false, runner: [2025], ret: [[35, '장종훈', null], [21, '송진우', null], [23, '정민철', null], [52, '김태균', 2021]], retNote: '', src: 'OSEN·데일리안(김태균 4번째 영구결번)' },
    Tigers: { founded: 1982, city: '광주', lineage: [[1982, '해태 타이거즈'], [2001, 'KIA 타이거즈']], note: '1982년 원년 구단 해태 타이거즈. 2001년 현대·기아차그룹이 인수해 KIA로 개명(같은 프랜차이즈).', titles: [1983, 1986, 1987, 1988, 1989, 1991, 1993, 1996, 1997, 2009, 2017, 2024], yv: false, runner: [], ret: [[18, '선동열', 1996], [7, '이종범', null]], retNote: '해태 9회·KIA 3회(2009·2017·2024)로 통산 12회.', src: '한국일보 계열 보도(2026.7)·OSEN' },
    Giants: { founded: 1982, city: '부산', lineage: [[1982, '롯데 자이언츠']], note: '1982년 원년 구단. 구단명이 바뀐 적 없는 두 구단 중 하나(다른 하나는 삼성).', titles: [1984, 1992], yv: true, runner: [], ret: [[11, '최동원', 2011], [10, '이대호', 2022]], retNote: '', src: '경향신문·이투데이·위키' },
    Dinos: { founded: 2011, city: '창원', lineage: [[2011, 'NC 다이노스']], note: '2011년 9번째 구단으로 창단, 2013년부터 1군 참가.', titles: [2020], yv: true, runner: [], ret: [], retNote: '', src: '위키백과·인터뷰 보도(2020.11.24)' },
    Lions: { founded: 1982, city: '대구', lineage: [[1982, '삼성 라이온즈']], note: '1982년 원년 구단. 구단명이 바뀐 적 없다.', titles: [1985, 2002, 2005, 2006, 2011, 2012, 2013, 2014, 2026], yv: false, runner: [1982], ret: [[22, '이만수', null], [10, '양준혁', 2010], [36, '이승엽', 2017], [21, '오승환', 2025]], retNote: '오승환 21번은 구단 4번째·투수 첫 영구결번.', src: '매일신문·뉴시스(오승환)·보도(2026 통산 9번째 우승)' }
  };
  LG.CLUBS = CLUBS;
  const sumTitles = (L, t) => { const c = CLUBS[t]; return { real: c ? c.titles.slice() : [], game: (L.S.history || []).filter(h => h.champion === t).map(h => h.year) }; };
  proto.clubTitleYears = function (t) { const x = sumTitles(this, t); return x.real.concat(x.game.filter(y => !x.real.includes(y))).sort((a, b) => a - b); };
  proto.clubProfile = function (t) {
    t = t || this.S.userTeam; const c = CLUBS[t]; if (!c) return null; const S = this.S, ys = this.clubTitleYears(t), all = TEAMS.map(x => [x, this.clubTitleYears(x).length]).sort((a, b) => b[1] - a[1]);
    const rank = 1 + all.filter(x => x[1] > ys.length).length, ref = S.phase === 'offseason' ? S.year : S.year - 1, last = ys.length ? ys[ys.length - 1] : null;
    return { t, c, titles: ys, count: ys.length, rank, last, gap: last === null ? null : Math.max(0, ref - last), ref, ret: c.ret.slice(), gameTitles: sumTitles(this, t).game };
  };
  /* 2층: 역사에서 만들어지는 문구(사실 주장은 1층 데이터와 게임 기록으로만 구성) */
  proto.clubNarrative = function (t) {
    const P = this.clubProfile(t); if (!P) return []; const c = P.c, out = [];
    if (!P.count) out.push(`창단 이래 한국시리즈 우승이 없습니다${c.runner.length ? ` (준우승 ${c.runner.length}회: ${c.runner.join('·')}년)` : ''}. 첫 우승이 구단의 숙원입니다.`);
    else if (P.gap === 0) out.push(`${P.last}년 우승 — 디펜딩 챔피언입니다. 통산 ${P.count}회, 타이틀 방어에 대한 기대가 큽니다.`);
    else if (P.gap <= 3) out.push(`${P.last}년 우승 이후 ${P.gap}년. 통산 ${P.count}회로 정상 탈환을 노릴 시점입니다.`);
    else if (P.gap < 10) out.push(`마지막 우승은 ${P.last}년 — ${P.gap}년째 정상에서 멀어져 있습니다(통산 ${P.count}회).`);
    else out.push(`마지막 우승은 ${P.last}년 — ${P.gap}년째 우승 갈증입니다(통산 ${P.count}회). 팬들의 인내가 한계에 가깝습니다.`);
    if (P.count && P.rank <= 3) out.push(`통산 우승 ${P.rank === 1 ? '리그 최다' : '리그 ' + P.rank + '위'} — ${c.founded < 1990 ? '명문의' : '구단 역사의'} 무게가 따릅니다.`);
    if (P.ret.length) out.push(`영구결번 ${P.ret.length}명: ${P.ret.map(r => `${r[1]}(${r[0]}번)`).join(' · ')}.`);
    if (P.gameTitles.length) out.push(`이 게임에서 만든 우승 ${P.gameTitles.length}회(${P.gameTitles.join('·')}년)가 구단 역사에 이어졌습니다.`);
    return out;
  };
  /* 시즌 목표 카드·시즌 개막 소식에 쓰는 한 줄 기대감(이사회·팬 분위기) */
  proto.clubGoalNote = function (t) {
    const P = this.clubProfile(t); if (!P) return '';
    if (!P.count) return '창단 첫 우승을 바라는 팬들의 기대가 이사회에도 전해집니다.';
    if (P.gap === 0) return '디펜딩 챔피언 — 이사회는 정상 방어를 기대합니다.';
    if (P.gap >= 10) return `${P.gap}년 우승 갈증 — 이사회와 팬 모두 결과를 원합니다.`;
    if (P.gap <= 3) return '최근 정상을 경험한 구단 — 가을야구는 기본, 한국시리즈를 바랍니다.';
    return P.c.founded < 1990 ? '명문의 자존심이 걸린 시즌 — 이사회는 가을야구 복귀를 기대합니다.' : '구단의 도약이 걸린 시즌 — 이사회는 가을야구 진출을 기대합니다.';
  };
  proto._clubStory = function () {   // 시즌 개막 때 한 번: 구단 이야기 소식(난수·결과와 무관)
    const S = this.S; if (S.clubStoryY === S.year) return; S.clubStoryY = S.year; const t = S.userTeam, n = this.clubNarrative(t); if (!n.length) return;
    this._lnews(`[구단 이야기] ${n[0]}`);
  };
});
