/* KBO 감독 모드: 협상 테이블 · 선수 면담 · 시즌 스토리 · 언론·팬 반응
 * 계산(요구액·경쟁 입찰·예산·계약 규칙)은 기존 엔진 값을 그대로 쓰고, 이 모듈은 그 값을 대화·호감도·약속으로 풀어낸다.
 * 호감도는 협상 중에만 선수의 요구 연봉을 ±7% 안에서 움직이며(분위기 보정), 계약 규칙·예산·경쟁 입찰은 건드리지 않는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { League, KO, ACTIVE_MAX, ROSTER_MAX, rngFor, clamp } = LG;
  const proto = League.prototype;
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const idn = id => parseInt(String(id).replace(/\D/g, '')) || 0;
  const TRAIT_KO = { clutch: '승부사', model: '모범생', free: '자유분방', leader: '리더형', shy: '소심형' };

  /* ---------------- 대사 ----------------
     {I}=저는/OO 선수는, {my}=제/OO 선수의, {me}=저를/OO 선수를, {n}=선수 이름, {team}=우리 구단, {opp}=경쟁 구단,
     {lo}{hi}=기대 연봉 범위, {pref}=희망 기간, {yrs}{per}{tot}{sal}{bon}=제시 조건, {gap}=부족 금액, {rank}=지난 시즌 순위, {tn}=근속, {role}=약속한 역할 */
  const TONE = {
    clutch: ['솔직히 말씀드리겠습니다. ', '큰 경기에서 보여드리는 선수입니다. ', '결과로 증명해 왔다고 생각합니다. ', ''],
    model: ['먼저 자리를 마련해 주셔서 감사합니다. ', '구단의 배려에 늘 감사드립니다. ', '성실하게 말씀드리겠습니다. ', ''],
    free: ['편하게 얘기하죠. ', '돌려 말하진 않겠습니다. ', '어차피 말할 건 말해야죠. ', ''],
    leader: ['동료들 생각도 하면서 말씀드리겠습니다. ', '팀 분위기도 같이 봐야 하니까요. ', '후배들 보기에도 부끄럽지 않아야 합니다. ', ''],
    shy: ['저… 말씀드리기가 조심스럽습니다만, ', '잘 말씀드릴 수 있을지 모르겠지만, ', '많이 고민하고 왔습니다. ', '']
  };
  const AG_TONE = { hard: ['에이전트로서 분명히 말씀드립니다. ', '선수 측 입장은 확고합니다. ', '숫자 얘기부터 하겠습니다. '], fair: ['서로 합리적인 선에서 얘기하죠. ', '시장 상황을 같이 보시죠. ', ''], warm: ['좋은 분위기에서 대화할 수 있어 다행입니다. ', '선수도 구단을 존중하고 있습니다. ', ''] };
  const KIND_OPEN = {
    fa: ['FA 시장에 나온 만큼 여러 구단의 이야기를 듣고 있습니다. ', '시장 반응을 보고 있는 중에 연락을 주셨네요. ', '열린 마음으로 앉았습니다. '],
    resign: ['재계약 얘기를 하게 됐네요. ', '이 팀에서 한 해를 더 이어갈 수 있을지 이야기해 보죠. ', '올 시즌을 돌아보며 말씀드리겠습니다. '],
    extend: ['구단이 먼저 장기 계획을 말씀해 주셔서 감사합니다. ', '비FA 다년계약 제안은 처음이라 신중하게 보고 있습니다. ', '앞으로 몇 해를 같이할 수 있을지 이야기해 보죠. '],
    foreign: ['한국에서의 시즌을 어떻게 이어갈지 생각해 왔습니다. ', '선수와 가족 모두 한국 생활에 관심이 큽니다. ', '리그 적응 여부를 포함해 판단하고 있습니다. ']
  };
  const OPEN = {
    money: ['{I} 시장에서 평가받는 가치를 기준으로 생각합니다. 연 {lo}~{hi}억 선이면 대화가 됩니다.', '숫자부터 솔직히 말씀드리면 연 {lo}억 아래는 어렵고 {hi}억이면 마음이 움직입니다.', '{I} 지난 성적과 나이를 감안해 연 {lo}~{hi}억 정도를 생각하고 있습니다.', '금액이 전부는 아니지만 연 {hi}억 근처가 아니면 검토하기 어렵습니다.', '비슷한 급 선수들의 계약을 확인했습니다. 연 {lo}~{hi}억 범위를 기대합니다.'],
    years: ['금액만큼 중요한 게 기간입니다. {pref}년 안팎의 안정적인 계약을 원하고, 연 {lo}~{hi}억 선을 생각합니다.', '{I} 오래 뛸 수 있는 환경이 필요합니다. {pref}년 정도 보장해 주시면 연 {lo}~{hi}억도 고려하겠습니다.', '짧은 계약은 불안합니다. {pref}년 계약에 연 {lo}~{hi}억을 생각합니다.', '몸 관리는 자신 있지만 시장은 냉정하니까요. {pref}년 보장과 연 {lo}~{hi}억을 바랍니다.'],
    role: ['{I} 경기에 나갈 수 있는지가 가장 중요합니다. 역할이 분명하다면 연 {lo}~{hi}억 선에서 말씀드리겠습니다.', '벤치에 앉으려고 계약하는 건 아닙니다. 어떤 역할을 맡는지부터 듣고 싶고, 금액은 연 {lo}~{hi}억 정도입니다.', '{my} 자리가 어디인지 알고 싶습니다. 그게 정해지면 연 {lo}~{hi}억에서 얘기가 쉬울 겁니다.'],
    win: ['{I} 우승에 도전하는 팀에서 뛰고 싶습니다. {team}의 올해 구상을 듣고 싶고, 금액은 연 {lo}~{hi}억 선입니다.', '이기는 팀에서 커리어를 마무리하고 싶습니다. 조건은 연 {lo}~{hi}억 정도를 생각합니다.', '가을야구를 할 수 있는 팀인지가 중요합니다. 그 전제라면 연 {lo}~{hi}억도 열려 있습니다.'],
    loyal: ['{team}에서 보낸 시간이 있어서 쉽게 떠나고 싶지 않습니다. 그래도 연 {lo}~{hi}억 선은 지켜주셨으면 합니다.', '{team}에 애정이 큽니다. 서로 좋은 마무리가 됐으면 하고, 금액은 연 {lo}~{hi}억을 생각합니다.', '돈만 보고 움직이는 선수는 아닙니다. 그렇다고 아무 조건이나 받을 순 없고, 연 {lo}~{hi}억 선입니다.'],
    bonus: ['{I} 계약금 비중을 어느 정도 가져가는 구조를 선호합니다. 총액 기준으로 연 {lo}~{hi}억 선입니다.', '계약 구조도 중요합니다. 계약금을 충분히 반영해 주신다면 연 {lo}~{hi}억에서 얘기하겠습니다.'],
    respect: ['{I} 구단이 선수를 존중하는지를 봅니다. 연 {lo}~{hi}억 정도면 서로 무리 없는 선이라고 생각합니다.', '결국 사람 대 사람의 일이라고 생각합니다. 존중해 주신다면 연 {lo}~{hi}억 선에서 풀 수 있습니다.']
  };
  const REACT = {
    insult: ['이 금액은… 솔직히 협상 테이블에 올릴 수준이 아닙니다.', '제안을 잘못 들은 줄 알았습니다. 이 금액으로는 대화를 이어가기 어렵습니다.', '{I} 존중받지 못하고 있다는 느낌이 듭니다. 이 금액은 받아들일 수 없습니다.', '농담이시죠? 시장 가치와 너무 차이가 납니다.', '이런 제안을 받으니 오히려 마음이 멀어지네요.'],
    far: ['요구 수준과 차이가 큽니다. 이 금액에서는 어렵습니다.', '생각하던 범위와 꽤 멀어요. 다시 검토해 주세요.', '구단 사정은 이해하지만 이 조건은 받아들이기 어렵습니다.', '아직 간격이 큽니다. 조금 더 진지한 제안을 기다리겠습니다.', '이 정도면 다른 구단 얘기를 먼저 듣는 게 낫겠다는 생각이 듭니다.'],
    low: ['방향은 맞지만 조금 부족합니다.', '거의 근접했지만 아직 마음이 움직이진 않네요.', '성의는 느껴집니다. 다만 한 걸음 더 필요합니다.', '이 정도면 다른 제안과 비교하게 됩니다. 조금만 더 올려주세요.', '나쁘지 않습니다. 하지만 사인하기엔 아직 이릅니다.'],
    close: ['아주 근접했습니다. 조금만 더 맞춰 주시면 사인하겠습니다.', '거의 다 왔어요. 마지막 한 걸음만 부탁드립니다.', '이 정도면 마음이 많이 기울었습니다. 약간의 조정만 있으면 됩니다.', '한 번만 더 고민해 주시면 합의할 수 있을 것 같습니다.']
  };
  const REASON = {
    money: ['{I} 금액을 가장 우선하는 만큼, 조금 더 올려주셨으면 합니다.', '결국 숫자가 중요합니다. 연봉 쪽에서 더 성의를 보여주세요.'],
    yearsShort: ['기간이 짧습니다. {pref}년은 보장해 주셨으면 합니다.', '1~2년 뒤에 다시 시장에 서는 건 부담입니다. {pref}년 정도를 원합니다.'],
    yearsLong: ['그렇게 길게 묶이는 것도 부담입니다. {pref}년 정도가 적당합니다.', '긴 계약이 꼭 좋은 건 아닙니다. {pref}년이 서로에게 편할 것 같습니다.'],
    role: ['역할에 대한 확답이 없어서 불안합니다. 어떤 자리를 맡게 되는지 말씀해 주세요.', '출전 계획을 듣지 못했습니다. 제 자리가 어디인지가 궁금합니다.'],
    win: ['팀이 어디를 향하는지 아직 와닿지 않습니다. 구단의 비전을 듣고 싶습니다.', '이 팀이 이길 수 있는 팀이라는 확신이 필요합니다.'],
    loyal: ['{team}과의 인연을 생각하면 이 조건은 아쉽습니다. 구단이 어떻게 생각하는지 듣고 싶습니다.', '함께한 시간이 있는데, 조건에서는 그 부분이 보이지 않네요.'],
    bonus: ['계약금 비중이 낮습니다. 구조를 조금 바꿔 주실 수 있을까요?', '연봉만 있는 구조는 선호하지 않습니다. 계약금 쪽을 검토해 주세요.'],
    respect: ['{I} 협상 과정에서 존중받고 있다는 느낌이 부족합니다.', '조건보다도 대하는 방식이 마음에 걸립니다.']
  };
  const COUNTER = ['이 조건이면 사인하겠습니다: {yrs}년, 연 {per}억(총 {tot}억).', '서로 한 발씩 양보하죠. {yrs}년에 연 {per}억이면 하겠습니다.', '{I} 이렇게 정리하면 어떨까 합니다: {yrs}년, 총액 {tot}억.', '이 선이라면 더 끌지 않겠습니다. {yrs}년, 연평균 {per}억입니다.'];
  const ACCEPT = { base: ['좋습니다. 사인하겠습니다. {team}에서 최선을 다하겠습니다.', '합의됐네요. 앞으로 잘 부탁드립니다.', '이 조건이라면 기쁜 마음으로 하겠습니다.', '고민 끝에 결정했습니다. 팬들께 좋은 모습 보여드리겠습니다.'], clutch: ['큰 경기에서 보답하겠습니다.', '가을에 증명하겠습니다. 사인하죠.'], model: ['믿어주셔서 감사합니다. 성실하게 하겠습니다.'], free: ['오케이, 좋습니다. 재밌게 해보죠.', '깔끔하네요. 사인합시다.'], leader: ['동료들과 좋은 분위기 만들겠습니다.', '후배들에게 모범이 되겠습니다. 사인하겠습니다.'], shy: ['열심히… 하겠습니다. 감사합니다.', '믿어주셔서 정말 감사합니다.'], foreign: ['서명하겠습니다. 한국에서 좋은 시즌을 만들겠습니다.', '조건에 만족합니다. 팬들과 좋은 시즌을 보내고 싶습니다.'] };
  const BREAK = { timeout: ['시간을 더 드리기 어렵습니다. 오늘은 여기까지 하죠.', '더 이상 좁혀지지 않네요. 다른 선택지를 알아보겠습니다.', '조건이 맞지 않아 협상을 여기서 마무리하겠습니다.'], walk: ['이런 대화는 의미가 없습니다. 이만 일어나겠습니다.', '존중받지 못하는 자리에서는 더 이야기하지 않겠습니다.'], leave: ['알겠습니다. 좋은 결과가 있길 바랍니다.', '서로의 길이 다르다면 어쩔 수 없죠. 건승을 빕니다.'], hard: ['우리 측은 다른 구단과 이야기를 진행하겠습니다.', '다른 구단들과의 협상 결과를 보고 연락드리겠습니다.'], gone: ['협상이 길어지는 사이 {opp}과(와) 계약했습니다.', '이미 {opp}과(와) 합의했습니다. 죄송합니다.'] };
  const CARD = {
    ask: { me: ['{n} 선수가 무엇을 가장 중요하게 생각하는지 먼저 듣고 싶습니다.', '조건 얘기 전에 선수의 우선순위부터 들어보고 싶습니다.', '이번 계약에서 꼭 지켜져야 할 게 무엇인지 말씀해 주세요.'],
      money: ['솔직히 금액입니다. 가족과 미래를 생각하면 숫자가 가장 중요합니다.', '연봉입니다. 시장 가치만큼은 받아야 한다고 생각합니다.'], years: ['안정이 가장 중요합니다. 몇 년을 믿고 뛸 수 있는지가 핵심입니다.', '기간입니다. 불안 없이 뛰고 싶습니다.'], role: ['출전 기회입니다. 어떤 역할을 맡는지가 {my} 선택을 좌우합니다.', '역할입니다. 경기에 나서는 선수로 대우받고 싶습니다.'], win: ['우승입니다. 이기는 팀인지가 가장 큽니다.', '이기는 야구를 할 수 있는 팀인지 보고 있습니다.'], loyal: ['의리와 인연입니다. 사람 대하는 방식을 봅니다.', '{team}과의 시간을 어떻게 평가해 주시는지가 중요합니다.'], bonus: ['계약 구조입니다. 계약금을 어떻게 가져가는지가 중요합니다.'], respect: ['존중입니다. 선수를 어떻게 대하는 구단인지를 보고 있습니다.'] },
    vision: { me: ['지난 시즌 {rank}위, 올해는 더 높은 곳을 봅니다. 마운드와 타선 구성, 육성 계획을 설명드리겠습니다.', '{team}이 어디로 가는지 말씀드리겠습니다. 올해 목표는 가을야구 이상입니다.', '우리 팀의 방향은 분명합니다. 지난해 {rank}위에서 한 단계 더 올라서려 합니다.'],
      good: ['{team}의 방향이 마음에 듭니다. 같이 해볼 만하다고 생각합니다.', '구체적인 그림을 들으니 확신이 생깁니다.', '이런 팀이라면 한번 승부를 걸어보고 싶습니다.'], meh: ['비전은 이해하지만 아직 확신이 서지는 않습니다.', '말씀은 좋은데, 실제로 어떻게 될지는 지켜봐야죠.'], bad: ['솔직히 지난 성적을 보면 설득력이 약하네요.', '목표는 좋은데 현실적인 근거가 더 필요합니다.'] },
    role: { me: ['{n} 선수를 {role}로 기용할 계획입니다.', '올 시즌 {role} 자리를 맡길 생각입니다. 구단의 약속입니다.', '{role}로 쓸 구상입니다. 이 부분은 분명하게 약속드리겠습니다.'],
      good: ['그렇게 믿어주신다면 큰 힘이 됩니다. 약속은 꼭 지켜주세요.', '역할이 분명해져서 마음이 놓입니다.', '좋습니다. 그 자리에 어울리는 결과로 보답하겠습니다.'], meh: ['알겠습니다. 참고하겠습니다.', '그 부분은 알겠습니다. 다만 결정은 조건 전체를 보고 하겠습니다.'] },
    loyal: { me: ['{team}에서 함께한 시간을 구단은 잊지 않았습니다.', '{n} 선수는 우리 팀의 일원입니다. 이번 협상도 그 마음으로 임하고 있습니다.', '오래 함께한 선수에 대한 예우를 다하겠습니다.'],
      good: ['그렇게 말씀해 주시니 마음이 움직입니다.', '구단이 기억해 준다는 것만으로도 큰 위로가 됩니다.'], cold: ['감정만으로 계약할 순 없습니다.', '고마운 말씀이지만 협상은 협상입니다.'] },
    respect: { me: ['선수의 이야기를 충분히 듣고 있다는 점을 알아주셨으면 합니다.', '서두르지 않겠습니다. 편하게 말씀해 주세요.', '구단은 선수의 입장을 존중합니다. 끝까지 대화로 풀겠습니다.'], good: ['그렇게 말씀해 주시니 대화가 한결 편해집니다.', '존중해 주셔서 감사합니다.'], meh: ['말씀은 감사하지만 조건이 더 중요합니다.'] },
    perk: { me: ['코치진과 훈련 환경을 적극 지원하겠습니다. 성장 계획도 함께 짜겠습니다.', '재활·훈련 시설과 코칭 스태프를 소개해 드리겠습니다.'], good: ['성장을 도와주신다니 믿음이 갑니다.', '환경이 좋다는 건 큰 장점이네요.'], meh: ['시설도 중요하지만 선택의 결정적 이유는 아닙니다.'] },
    adapt: { me: ['통역·숙소·가족 정착을 구단이 전담해서 돕겠습니다.', '가족이 불편하지 않도록 생활 전반을 지원하겠습니다.'], good: ['가족 걱정이 가장 컸는데 큰 도움이 됩니다.', '그렇게까지 배려해 주시다니 감사합니다.'], meh: ['지원은 고맙지만 계약 조건이 먼저입니다.'] },
    time: { me: ['생각할 시간을 드리겠습니다. 내일 다시 이야기하죠.', '서두를 일은 아닙니다. 하루 더 고민해 보세요.'], good: ['배려에 감사드립니다. 내일 다시 뵙겠습니다.', '시간을 주셔서 정리할 수 있었습니다.'] },
    leave: { me: ['오늘은 여기까지 하겠습니다.', '조건이 맞지 않는 것 같습니다. 이만 마무리하죠.'] },
    counterNo: { me: ['역제안은 받아들이기 어렵습니다. 조건을 다시 조율하겠습니다.'], p: ['알겠습니다. 다시 말씀해 주세요.', '그럼 다른 조건을 기다리겠습니다.'] }
  };
  const OFFER_ME = ['{yrs}년, 연봉 {sal}억 + 계약금 {bon}억(총 {tot}억, 연평균 {per}억)을 제안합니다.', '{yrs}년 총 {tot}억, 연평균 {per}억 구조로 제안드립니다.', '이렇게 제안합니다: {yrs}년, 연봉 {sal}억{bonTxt}.'];
  /* 면담 */
  const MEET_OPEN = {
    grievance: { clutch: ['감독님, 제가 왜 아직 2군에 있어야 하는지 설명해 주십시오.', '기회만 주시면 결과로 보여드리겠습니다. 그런데 기회가 오지 않습니다.'], model: ['감독님, 불평은 아니지만 제 자리가 어디인지 알고 싶습니다.', '준비는 계속하고 있는데, 1군에서 뛸 수 있을지 궁금합니다.'], free: ['솔직히 답답해요. 2군에서 계속 이럴 순 없잖아요.', '전 더 할 수 있다고 생각하는데, 왜 안 쓰시는지 모르겠습니다.'], leader: ['후배들 보기에도 제 처지가 어정쩡합니다. 방향을 말씀해 주십시오.'], shy: ['저… 이런 말씀 드려도 될지 모르겠지만, 출전 기회가 걱정됩니다.', '말하기 어려웠는데 용기를 냈습니다. 제 상황이 궁금합니다.'] },
    request: { clutch: ['더 큰 무대가 필요하다고 느낍니다. 다른 팀에서 도전하고 싶습니다.'], model: ['죄송한 말씀이지만 이적을 생각하고 있습니다. 이유를 말씀드리겠습니다.'], free: ['여기선 더 이상 재미가 없어요. 팀을 옮기고 싶습니다.'], leader: ['팀에 누가 되고 싶진 않지만, 이적을 진지하게 고민 중입니다.'], shy: ['어렵게 말씀드립니다… 팀을 옮기는 걸 생각하고 있습니다.'] },
    slump: { clutch: ['요즘 결과가 안 나와서 스스로에게 화가 납니다.'], model: ['감독님, 요즘 부진해서 죄송합니다. 원인을 같이 찾고 싶습니다.'], free: ['뭘 해도 안 풀리네요. 머리가 복잡합니다.'], leader: ['팀에 도움이 못 돼서 마음이 무겁습니다.'], shy: ['자신감이 많이 떨어졌습니다. 어떻게 해야 할지 모르겠습니다.'] },
    checkin: { clutch: ['부르셨다고 들었습니다. 무슨 일이신가요?'], model: ['감독님, 불러주셔서 감사합니다. 어떤 말씀이신가요?'], free: ['무슨 일이에요? 좋은 소식이면 좋겠는데요.'], leader: ['말씀하세요, 감독님. 팀 얘기인가요?'], shy: ['저를 부르셨다고요…? 제가 뭘 잘못했나요?'] }
  };
  const MEET_CARD = {
    listen: { me: ['먼저 선수의 이야기를 충분히 들어보겠습니다.', '편하게 말해 주세요. 끝까지 듣겠습니다.'], good: ['들어주셔서 마음이 한결 가벼워졌습니다.', '이렇게 이야기를 나눌 수 있어 좋네요.'], meh: ['듣는 것만으로는 부족합니다. 답을 듣고 싶습니다.'] },
    promise: { me: ['{role} 기회를 줄 생각입니다. 분명하게 약속하겠습니다.', '일정 기간 {role}로 기회를 주겠습니다.'], good: ['약속해 주셔서 고맙습니다. 꼭 증명하겠습니다.', '그렇게 말씀해 주시니 힘이 납니다.'], meh: ['알겠습니다. 지켜보겠습니다.'] },
    honest: { me: ['지금 평가를 솔직하게 말하겠습니다. 부족한 점과 기대하는 점을 같이 이야기합시다.', '숨기지 않고 말하겠습니다. 현재 위치와 앞으로 필요한 점입니다.'], good: ['솔직하게 말씀해 주셔서 오히려 신뢰가 갑니다.', '아프지만 맞는 말씀입니다. 받아들이겠습니다.'], bad: ['그런 평가는 받아들이기 어렵습니다.', '너무 냉정하시네요…'] },
    praise: { me: ['요즘 준비하는 모습을 높게 평가하고 있습니다.', '훈련 태도와 성실함은 코치진 모두 인정합니다.'], good: ['알아봐 주셔서 감사합니다.', '인정받으니 힘이 납니다.'], meh: ['칭찬은 감사하지만 실제 기회가 중요합니다.'] },
    rest: { me: ['며칠 쉬면서 몸과 마음을 정리하세요. 훈련 강도도 조절해 주겠습니다.', '무리하지 말고 재정비 시간을 갖죠.'], good: ['배려해 주셔서 감사합니다. 재정비하고 돌아오겠습니다.', '그동안 쉬지 못했는데 도움이 됩니다.'], meh: ['쉬는 것보다 뛰고 싶은 마음이 큽니다.'] },
    discipline: { me: ['지금은 변명이 필요한 때가 아닙니다. 기준을 분명히 하겠습니다.', '팀 규율은 모두에게 같습니다. 냉정하게 말하겠습니다.'], good: ['맞습니다. 더 단단하게 하겠습니다.', '따끔한 말씀이 필요했습니다.'], bad: ['그렇게까지 말씀하셔야 합니까…', '이런 식이라면 대화가 안 됩니다.'] },
    captain: { me: ['{cap} 주장도 같이 이야기를 나누고 싶어 합니다.', '주장이 옆에서 도와주겠다고 합니다.'], good: ['주장님이 신경 써 주신다니 든든합니다.', '동료가 같이 해준다니 마음이 놓입니다.'], meh: ['주장님 마음은 고맙지만 제 문제는 제가 풀겠습니다.'] },
    close: { me: ['오늘 이야기는 여기까지 하겠습니다.', '충분히 이야기를 나눴으니 정리하겠습니다.'] }
  };
  const MEET_END = { ok: ['오늘 얘기해 주셔서 감사합니다. 마음이 정리됐습니다.', '말씀 마음에 새기고 다시 준비하겠습니다.', '믿고 다시 해보겠습니다.'], mid: ['완전히 풀리진 않았지만 이야기해 주셔서 감사합니다.', '시간을 두고 지켜보겠습니다.'], bad: ['이야기를 해도 달라지는 건 없는 것 같네요.', '답답함이 풀리지 않습니다. 이만 가보겠습니다.'] };
  const TOPIC_KO = { grievance: '출전 기회 불만', request: '이적 요청', slump: '부진 상담', checkin: '일반 면담' };

  /* ---------------- 보조 ---------------- */
  const fill = (s, c) => String(s).replace(/\{(\w+)\}/g, (m, k) => c[k] !== undefined ? c[k] : m);
  proto._nRng = function (neg, salt) { return rngFor(this.S.seed, idn(neg.id), neg.seq * 37 + (neg.log ? neg.log.length : 0) * 11, 6300 + (salt || 0)); };
  proto._nPick = function (neg, key, pool) {   // 같은 협상에서 같은 문장이 반복되지 않게 고른다
    neg.used = neg.used || []; const free = pool.map((s, i) => i).filter(i => !neg.used.includes(key + ':' + i)), arr = free.length ? free : pool.map((s, i) => i);
    const i = arr[Math.floor(this._nRng(neg, key.length).random() * arr.length)]; neg.used.push(key + ':' + i); if (neg.used.length > 160) neg.used.shift(); return pool[i];
  };
  proto._nCtx = function (neg, extra) {
    this._negRangeSync(neg);
    const S = this.S, p = S.players[neg.id], sp = neg.speaker === 'ag', n = p ? p.ko : '', lo = neg.range ? neg.range[0] : 0, hi = neg.range ? neg.range[1] : 0;
    const last = (S.history || []).slice(-1)[0], loy = p ? this.loyalty(p, S.userTeam) : null;
    return Object.assign({ n, I: sp ? n + ' 선수는' : '저는', my: sp ? n + ' 선수의' : '제', me: sp ? n + ' 선수를' : '저를', team: KO[S.userTeam] || '', lo: lo.toFixed(1), hi: hi.toFixed(1), pref: neg.pref, rank: last ? last.userRank : '-', tn: p && p.tnTeam === S.userTeam ? p.tn || 0 : (loy && loy.items[0] ? loy.items[0][0] : 0), opp: neg.opp ? KO[neg.opp] : '다른 구단' }, extra || {});
  };
  proto._nSay = function (neg, who, text) { neg.log.push({ who, text, r: neg.round }); if (neg.log.length > 80) neg.log.shift(); };
  proto._nP = function (neg, intent, pool, extra) {   // 선수/에이전트 대사: 성격 어조 + 문장
    const p = this.S.players[neg.id], c = this._nCtx(neg, extra), tr = this.traitOf(p) || 'model', r = this._nRng(neg, 3).random();
    const tonePool = neg.speaker === 'ag' ? (AG_TONE[neg.agent] || ['']) : (TONE[tr] || ['']);
    const pre = r < 0.5 && neg.kind !== 'meeting' ? tonePool[Math.floor(this._nRng(neg, 5).random() * tonePool.length)] : '';
    const s = fill(this._nPick(neg, intent, pool), c); this._nSay(neg, neg.speaker, pre + s); return s;
  };
  proto._nMe = function (neg, pool, extra, key) { const s = fill(this._nPick(neg, key || 'me' + pool[0].slice(0, 4), pool), this._nCtx(neg, extra)); this._nSay(neg, 'me', s); return s; };
  proto._nSys = function (neg, text, kind) { neg.log.push({ who: 'sys', text, k: kind || '', r: neg.round }); };

  /* ---------------- 협상 조건 ---------------- */
  proto._negStamp = function () { return String(this._negClock()); };
  proto._negLive = function (p, t) { const S = this.S, n = S.neg; return !!(n && n.id === p.id && (n.state === 'open') && n.stamp === this._negStamp() && t === S.userTeam && n.kind !== 'meeting'); };
  proto._negAdj = function (p, t) { return this._negLive(p, t) ? 1 - clamp((this.S.neg.mood - 50) / 50, -1, 1) * 0.07 : 1; };   // 호감도 100 → 요구액 −7%, 0 → +7%
  proto._extPref = function (p) { return p.age <= 26 ? 4 : p.age <= 30 ? 3 : p.age <= 33 ? 2 : 1; };
  const shape = (pref, y) => (1 + 0.04 * Math.max(0, pref - y)) * (1 - 0.02 * Math.max(0, y - pref));
  proto._negTerms = function (p, kind) {
    const S = this.S, t = S.userTeam;
    if (kind === 'fa') { const tm = this.faTerms(p, t, true); return { minY: 1, maxY: tm.maxYears, pref: tm.pref, graded: tm.graded, bonusOK: tm.graded, req: tm.req, label: 'FA 계약' }; }
    if (kind === 'foreign') { const ask = Math.max(this.minSal(), this.askSalary(p)), cap = this.foreignCap(p, t); return { minY: 1, maxY: 1, pref: 1, graded: false, bonusOK: false, req: () => r2(ask), cap, label: p.aq ? '아시아쿼터 계약' : '외국인 계약' }; }
    if (kind === 'resign') { const base = this.resignAsk(p), multi = !p.foreign && !this.faEligible(p), pref = multi ? this._extPref(p) : 1; return { minY: 1, maxY: multi ? 4 : 1, pref, graded: false, bonusOK: multi, multi, req: y => r2(base * (multi ? shape(pref, y) * (p.age <= 27 && y >= 3 ? 1.04 : 1) : 1)), cap: p.foreign ? this.foreignCap(p, t) : null, label: multi ? '재계약(비FA 다년 가능)' : '재계약(1년)' }; }
    const pref = this._extPref(p), base = Math.max(p.contract.salary + (p.contract.amort || 0), this.askSalary(p)) * (p.age <= 27 ? 1.06 : p.age >= 33 ? 0.97 : 1);   // 비FA 다년계약: 성장 프리미엄(≤27세 +6%)·고령 안정 할인(≥33세 −3%) 가정
    return { minY: 1, maxY: 5, pref, graded: false, bonusOK: true, multi: true, req: y => r2(base * shape(pref, y)), cap: null, label: '비FA 다년계약' };
  };
  proto._negEval = function (p, offer, kind) {
    const t = this.S.userTeam;
    if (kind === 'fa') return this.faEvaluate(p, offer, t);
    const tm = this._negTerms(p, kind), y = Math.round(offer.years), sal = +offer.salary, bon = +offer.bonus || 0;
    if (!(y >= tm.minY && y <= tm.maxY)) return { ok: false, msg: `계약 기간은 ${tm.minY}~${tm.maxY}년이어야 합니다.` };
    if (!(sal >= this.minSal() - 1e-9)) return { ok: false, msg: `연봉은 최소 ${this.minSal()}억입니다.` };
    if (bon < 0 || (bon > 0 && !(tm.bonusOK && y >= 2))) return { ok: false, msg: tm.bonusOK ? '계약금은 2년 이상 계약에만 줄 수 있습니다.' : '이 계약에는 계약금을 줄 수 없습니다.' };
    const per = (bon + sal * y) / y, req = tm.req(y) * this._negAdj(p, t);
    if (bon > 0.7 * (bon + sal * y)) return { ok: false, msg: '계약금은 총액의 70%를 넘을 수 없습니다.', per, req };
    if (tm.cap && sal > tm.cap + 1e-9) return { ok: false, msg: `외국인 신규·재계약 상한(연봉 ${tm.cap}억)을 넘을 수 없습니다.`, per, req };
    if (tm.cap && req > tm.cap + 1e-9) return { ok: false, msg: `선수 요구액이 상한(${tm.cap}억)을 넘어 계약할 수 없습니다. 호감도를 높여 요구액을 낮춰야 합니다.`, per, req, over: true };
    if (per + 1e-9 < req) return { ok: false, msg: `제시 연평균 ${per.toFixed(1)}억이 요구액 ${req.toFixed(1)}억에 못 미칩니다.`, per, req };
    return { ok: true, per, req, y, sal, bon };
  };
  /* 선수 기대 연봉 범위(추정): 호감도가 오르내리면 요구액도 따라 변하므로 현재 호감도 기준으로 다시 계산한다(시작 때 값으로 고정되어 '호감도를 올려도 안 내려가는 것처럼' 보이던 문제 수정) */
  proto._negRangeSync = function (neg) {
    const S = this.S, p = S.players[neg.id]; if (!p || neg.kind === 'meeting' || neg.rj === undefined) return;
    const tm = this._negTerms(p, neg.kind), j = neg.rj, adj = 1 - clamp((neg.mood - 50) / 50, -1, 1) * 0.07, req = tm.req(tm.pref) * adj;
    neg.range = [Math.floor(req * (0.93 + 0.03 * j) * 10) / 10, Math.ceil(req * (1.03 + 0.03 * (1 - j)) * 10) / 10];
    if (neg.agent === 'hard') neg.range[0] = Math.floor(req * 0.99 * 10) / 10;
  };
  proto._negMin = function (p, kind, years, shareBonus) {   // 요구액을 충족하는 최소 제시(계약금 비율은 현재 구조 유지)
    const tm = this._negTerms(p, kind), t = this.S.userTeam, y = clamp(years || tm.pref, tm.minY, tm.maxY), req = tm.req(y) * this._negAdj(p, t), total = req * y;
    if (!(tm.bonusOK && y >= 2)) { const cap = tm.cap || 1e9; return { years: y, salary: Math.min(cap, req <= this.minSal() + 1e-9 ? this.minSal() : Math.ceil(req * 10 - 1e-9) / 10), bonus: 0 }; }
    const bonus = Math.round(total * (shareBonus === undefined ? 0.35 : shareBonus) * 10) / 10, salary = Math.ceil(((total - bonus) / y) * 10 - 1e-9) / 10; return { years: y, salary: Math.max(0.3, salary), bonus };
  };

  /* ---------------- 우선순위 · 에이전트 · 호감도 ---------------- */
  const PRIO_KO = { money: '연봉', years: '계약 기간', role: '역할·출전', win: '우승 도전', loyal: '의리·인연', bonus: '계약금 구조', respect: '존중' };
  proto.negPrioName = function (k) { return PRIO_KO[k] || k; };
  proto._negPrios = function (p, kind, r) {
    const S = this.S, t = S.userTeam, tr = this.traitOf(p) || 'model', loy = this.loyalty(p, t), noise = () => r.random() * 0.5, sc = { money: 1.0 + noise(), years: 0.3 + noise(), role: 0.4 + noise(), win: 0.3 + noise(), loyal: 0.1 + noise(), bonus: 0.15 + noise(), respect: 0.15 + noise() };
    if (tr === 'free') { sc.money += 0.2; sc.respect += 0.3; } if (tr === 'clutch') sc.win += 0.7; if (tr === 'model') sc.role += 0.2; if (tr === 'leader') { sc.loyal += 0.3; sc.win += 0.2; } if (tr === 'shy') { sc.respect += 0.5; sc.years += 0.2; }
    if (p.age >= 33) { sc.years += 0.9; sc.win += 0.3; } else if (p.age <= 25) { sc.bonus += 0.2; sc.role += 0.3; }
    if (p.inj || (p.injHist && p.injHist.length)) sc.years += 0.5;
    if (loy && loy.v >= 60 && kind !== 'foreign') sc.loyal += 0.9; if (kind === 'foreign') { sc.loyal = 0; sc.money += 0.3; sc.respect += 0.2; }
    const peers = this.players(t).filter(x => x.type === p.type && x.id !== p.id), better = peers.filter(x => this.ovr(x) > this.ovr(p)).length; if (better <= (p.type === 'B' ? 8 : 4)) sc.role += 0.4; else sc.role += 0.1;
    if (kind === 'resign' || kind === 'extend') sc.loyal += 0.2;
    return Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
  };
  proto._negMood = function (p, kind, agent) {
    const S = this.S, t = S.userTeam, f = [], loy = this.loyalty(p, t); let v = 45;
    const add = (label, x) => { x = Math.round(x * 10) / 10; if (Math.abs(x) >= 0.5) { f.push([label, x]); v += x; } };
    if (loy && kind !== 'foreign') add('충성도·연고', clamp((loy.v - 40) / 4, -6, 12));
    add('최근 컨디션·분위기', 2 * clamp(this.moodOf(p), -3, 3));
    add('최근 대우(면담·출전)', 0.7 * (p.loyAdj || 0));
    const last = (S.history || []).slice(-1)[0]; if (last) add('팀 성적(지난 시즌 ' + last.userRank + '위)', clamp((5.5 - last.userRank) * 1.2, -5, 5));
    if (p.brokenP) add('깨진 약속', -8 * Math.min(2, p.brokenP)); if (p.keptP) add('지킨 약속', 3 * Math.min(3, p.keptP));
    if (S.captain === p.id) add('주장 예우', 2);
    { const rp = this.reputation ? this.reputation() : null; if (rp) add('감독 평판(' + rp.tag + ')', clamp((rp.score - 50) / 8, -5, 5)); }
    { const bl = this.bonds ? this.bonds(p) : []; const hp = bl.map(b => S.players[b.id]).filter(Boolean).reduce((a, q) => a + (q.loyAdj || 0), 0); if (bl.length) add('친한 동료들의 분위기', clamp(hp / 6, -3, 3)); }
    if ((kind === 'fa' || kind === 'foreign') && p.faInfo && p.faInfo.from === t) add('원소속 구단', 3);
    add('에이전트 성향(' + ({ hard: '강경', fair: '합리', warm: '온건' })[agent] + ')', agent === 'hard' ? -3 : agent === 'warm' ? 3 : 0);
    return { v: clamp(Math.round(v), 15, 80), factors: f };
  };

  /* ---------------- 협상 시작 ---------------- */
  proto.negBlock = function (id, kind, rep) {   // 협상 불가 사유(없으면 null)
    const S = this.S, p = S.players[id], t = S.userTeam; if (!p) return '선수를 찾을 수 없습니다.';
    if (kind !== 'meeting' && p.negLock && p.negLock.until > this._negClock() && p.negLock.team === t) return `${p.ko}은(는) 방금 협상이 결렬되어 ${p.negLock.until - this._negClock()}일 뒤에 다시 협상할 수 있습니다.`;
    if (kind === 'fa' || kind === 'foreign') { if (p.team !== 'FA') return '이미 계약된 선수입니다.'; if (!!p.foreign !== (kind === 'foreign')) return '계약 종류가 맞지 않습니다.'; if (S.teams[t].ids.length >= ROSTER_MAX) return `보유 선수 ${ROSTER_MAX}명 제한입니다.`; }
    if (kind === 'fa') { const info = p.faInfo, ext = info && info.grade && info.from !== t; if (ext && this._faCount(t) >= this.faExtLimit()) return `외부 FA는 올해 FA 권리 행사자 수에 따라 ${this.faExtLimit()}명까지만 영입할 수 있습니다(규약 제173조).`; }
    if (kind === 'foreign') {
      if (rep) { const r = S.players[rep]; if (!r || r.team !== t || !r.foreign) return '교체할 외국인 선수를 찾을 수 없습니다.'; }
      if (this.fSwapBlock && this.fSwapBlock()) return this.fSwapBlock();
      this._replacing = rep || null; const okSlot = this.foreignOK(t, p); this._replacing = null;
      if (!okSlot) return p.aq ? '아시아쿼터 선수는 구단당 1명입니다. 보유 한도가 찼으니 기존 아시아쿼터 선수와 교체해야 합니다.' : '일반 외국인 선수는 3명까지이고 같은 포지션 3명은 안 됩니다. 보유 한도가 찼으니 기존 선수와 교체해야 합니다.';
    }
    if (kind === 'resign') { const off = S.off; if (!off || !off.rep.expiring.includes(id)) return '재계약 대상이 아닙니다.'; }
    if (kind === 'extend') { if (p.team !== t) return '우리 팀 선수가 아닙니다.'; if (p.foreign) return '외국인은 비FA 다년계약 대상이 아닙니다.'; if (p.rookie === S.year) return '이번 시즌 입단한 신인은 대상이 아닙니다.'; if (p.contract.years > 2) return `계약이 ${p.contract.years}년 남아 있어 아직 연장 대상이 아닙니다(잔여 2년 이하부터).`; if (S.off && S.off.rep.expiring.includes(id)) return '재계약 협상으로 진행하세요.'; if (p.extAt && p.extAt.y === S.year) return '올해 이미 연장 계약을 맺었습니다.'; }
    if (kind === 'meeting' && p.team !== t) return '우리 팀 선수만 면담할 수 있습니다.';
    return null;
  };
  proto._negClock = function () { const S = this.S, m = S.faMkt && !S.faMkt.closed ? S.faMkt.day : null; return S.year * 1000 + (S.phase === 'offseason' ? 500 + (m || 0) : m !== null ? m : 100 + (S.day || 0)); };   // 연도·국면을 포함한 절대 시각(FA 시장 일수와 시즌 일수가 섞이지 않게)
  proto.negStart = function (id, kind, opts) {
    const S = this.S, p = S.players[id], t = S.userTeam; opts = opts || {};
    const bl = this.negBlock(id, kind, opts.replace); if (bl) return { ok: false, msg: bl };
    S.negSeq = (S.negSeq || 0) + 1;
    const r = rngFor(S.seed, idn(id), S.negSeq, 6200), tr = this.traitOf(p) || 'model';
    const agent = kind === 'foreign' ? (r.random() < 0.45 ? 'hard' : r.random() < 0.6 ? 'fair' : 'warm') : (p.agent || (p.agent = r.random() < 0.28 ? 'hard' : r.random() < 0.72 ? 'fair' : 'warm'));
    const neg = { id, kind, seq: S.negSeq, round: 0, state: 'open', log: [], used: [], cards: {}, agent, speaker: kind === 'foreign' || agent === 'hard' ? 'ag' : 'p', stamp: this._negStamp(), day: S.day, prios: [], revealed: [], topic: opts.topic || null, evId: opts.evId || null, replace: kind === 'foreign' && opts.replace ? opts.replace : null };
    if (kind === 'meeting') return this._meetStart(neg, p, r, opts);
    const tm = this._negTerms(p, kind); neg.pref = tm.pref; neg.prios = this._negPrios(p, kind, r);
    const m = this._negMood(p, kind, agent); neg.mood = m.v; neg.mood0 = m.v; neg.factors = m.factors;
    const bids = S.faMkt && kind === 'fa' ? (S.faMkt.bids[id] || []) : [];
    neg.max = clamp(6 + (agent === 'hard' ? -1 : agent === 'warm' ? 1 : 0) + (kind === 'resign' || kind === 'extend' ? 1 : 0) - (bids.length >= 2 ? 1 : 0), 4, 8);
    S.neg = neg; const req = tm.req(tm.pref) * this._negAdj(p, t), j = r.random();
    neg.rj = j; this._negRangeSync(neg);
    const ko = KIND_OPEN[kind] || [''], kp = ko[Math.floor(r.random() * ko.length)];
    const pr = neg.prios[0], pool = OPEN[pr] || OPEN.money, c = this._nCtx(neg), tonePool = neg.speaker === 'ag' ? AG_TONE[agent] : TONE[tr], pre = tonePool[Math.floor(r.random() * tonePool.length)];
    this._nSay(neg, neg.speaker, (kind === 'foreign' ? '' : kp) + (r.random() < 0.6 ? pre : '') + fill(this._nPick(neg, 'open', pool), c));
    if (kind === 'resign' && !p.foreign && this.salaryReview) { const rv = this.salaryReview(p); this._nSys(neg, `전년 연봉 ${rv.prev}억 → 요구 ${rv.ask}억(${rv.pct > 0 ? '+' : ''}${Math.round(rv.pct * 100)}%) · ${rv.reasons.join(' · ')}`); }
    if (kind === 'extend' || kind === 'resign') this._nSys(neg, tm.multi ? `${p.ko}의 희망 계약은 ${tm.pref}년 안팎입니다. 비FA 다년계약은 1~${tm.maxY}년까지 가능합니다.` : `${tm.label}입니다. FA 자격이 있거나 외국인은 1년 계약만 가능합니다.`);
    if (neg.replace) { const old = S.players[neg.replace], rc = this.releaseCost(neg.replace); this._nSys(neg, `교체 계약: 합의되면 ${old.ko}와의 계약을 해지(방출)합니다(위약금 ${rc.total}억).`, 'warn'); }
    if (kind === 'foreign') this._nSys(neg, `외국인 연봉 상한 ${tm.cap >= 999 ? '없음(재계약 — 합산 상한만)' : tm.cap + '억(약 ' + Math.round(tm.cap / 0.014) + '만$)'}. 호감도가 낮아 요구액이 상한을 넘으면 계약할 수 없습니다.`);
    if (bids.length) this._nSys(neg, `경쟁 구단 ${bids.length}곳이 입찰 중입니다. 협상이 길어지면 다른 구단과 계약할 수 있습니다.`, 'warn');
    return { ok: true, neg };
  };
  proto.negBest = function (id) {   // 지금 요구액을 충족하는 최소 제안(화면의 기본값)
    const n = this.S.neg; if (!n || n.id !== id) return null; const p = this.S.players[id]; return this._negMin(p, n.kind, n.pref);
  };
  proto.negClose = function () { const n = this.S.neg; if (!n) return; if (n.state === 'open' && n.kind !== 'meeting') n.state = 'paused'; this.S.negHist = this.S.negHist || []; this.S.negHist.unshift({ id: n.id, kind: n.kind, state: n.state, day: this.S.day, year: this.S.year }); if (this.S.negHist.length > 30) this.S.negHist.pop(); if (n.kind === 'meeting' && n.state === 'open') this._meetFinish(n); this.S.neg = null; this.invalidate(); };

  /* ---------------- 협상 진행 ---------------- */
  proto._negRound = function (neg) {
    neg.round++; const p = this.S.players[neg.id];
    if (neg.round >= neg.max && neg.state === 'open') { this._negBreak(neg, 'timeout'); return true; }
    if (neg.mood <= 8 && neg.state === 'open') { this._negBreak(neg, 'walk'); return true; }
    return false;
  };
  proto._negBreak = function (neg, why) {
    const S = this.S, p = S.players[neg.id], t = S.userTeam; neg.state = 'broke';
    const pool = why === 'walk' ? BREAK.walk : why === 'leave' ? BREAK.leave : (neg.agent === 'hard' ? BREAK.hard : BREAK.timeout);
    this._nP(neg, 'break' + why, pool); this._nSys(neg, `${p.ko}과(와)의 협상이 결렬되었습니다.${neg.kind === 'fa' || neg.kind === 'foreign' ? ' 선수는 시장에 남아 있으며 며칠 뒤 다시 협상할 수 있습니다.' : ''}`, 'bad');
    this._repBump('negBroke'); this.note(p, `${({ fa: 'FA 계약', foreign: neg.aqLabel || '외국인 영입', resign: '재계약', extend: '비FA 다년계약' })[neg.kind]} 협상 결렬`);
    p.negLock = { until: this._negClock() + (neg.kind === 'fa' || neg.kind === 'foreign' ? 3 : 10), team: t };
    if (neg.kind !== 'foreign' && p.team === t) p.loyAdj = clamp((p.loyAdj || 0) - (why === 'walk' ? 3 : 1), -15, 15);
    this.story('neg', `${p.ko}과(와) ${({ fa: 'FA 계약', foreign: p.aq ? '아시아쿼터 영입' : '외국인 영입', resign: '재계약', extend: '비FA 다년계약' })[neg.kind]} 협상 결렬`, 2);
    this._press('break', { p, neg });
    this.invalidate();
  };
  proto._negReactLine = function (neg, p, ev, offer) {
    const r = ev.per && ev.req ? ev.per / ev.req : 0, tm = this._negTerms(p, neg.kind), cat = r < 0.75 ? 'insult' : r < 0.88 ? 'far' : r < 0.96 ? 'low' : 'close', gapAmt = Math.max(0, ev.req - ev.per), gap = (Math.ceil(gapAmt * 10) / 10).toFixed(1);
    const base = this._nP(neg, 'react' + cat, REACT[cat], { gap });
    let why = null; const pr = neg.prios;
    const y = Math.round(offer.years), share = (offer.bonus || 0) / Math.max(0.01, (offer.bonus || 0) + offer.salary * y);
    for (const k of pr) { if (k === 'years' && tm.maxY > 1 && y < tm.pref) { why = ['yearsShort', k]; break; } if (k === 'years' && y > tm.pref + 1) { why = ['yearsLong', k]; break; } if (k === 'role' && !neg.cards.role) { why = ['role', k]; break; } if (k === 'win' && !neg.cards.vision) { why = ['win', k]; break; } if (k === 'loyal' && !neg.cards.loyal && neg.kind !== 'foreign') { why = ['loyal', k]; break; } if (k === 'bonus' && tm.bonusOK && share < 0.2) { why = ['bonus', k]; break; } if (k === 'respect' && !neg.cards.respect) { why = ['respect', k]; break; } if (k === 'money') { why = ['money', k]; break; } }
    if (why && cat !== 'insult') { this._nP(neg, 'why' + why[0], REASON[why[0]]); if (!neg.revealed.includes(why[1])) neg.revealed.push(why[1]); }
    return { cat, r, why: why && why[1] };
  };
  const MOOD_D = { insult: -12, far: -6, low: -2, close: 2 };
  proto.negOffer = function (offer) {
    const S = this.S, neg = S.neg; if (!neg || neg.state !== 'open') return { ok: false, msg: '진행 중인 협상이 없습니다.' };
    const p = S.players[neg.id], t = S.userTeam; if (neg.stamp !== this._negStamp()) { neg.stamp = this._negStamp(); }
    offer = { years: Math.round(+offer.years), salary: r1(+offer.salary), bonus: r1(+offer.bonus || 0) };
    const ev = this._negEval(p, offer, neg.kind);
    if (!ev.ok && (ev.per === undefined || ev.req === undefined || /계약금/.test(ev.msg) || ev.over)) return { ok: false, msg: ev.msg };   // 형식 오류·상한 초과는 라운드를 쓰지 않는다
    const tot = r1(offer.bonus + offer.salary * offer.years), per = r2(tot / offer.years), me = fill(this._nPick(neg, 'offer', OFFER_ME), Object.assign(this._nCtx(neg), { yrs: offer.years, sal: offer.salary, bon: offer.bonus, tot, per, bonTxt: offer.bonus ? ` + 계약금 ${offer.bonus}억` : '' }));
    this._nSay(neg, 'me', me); neg.offer = offer;
    if (ev.ok) {
      if (neg.replace) { const old = S.players[neg.replace]; if (old && old.team === t) { const rel = this.releasePlayer(neg.replace); if (!rel.ok) { this._nSys(neg, rel.msg, 'warn'); return { ok: false, msg: rel.msg }; } this._nSys(neg, `${old.ko} 방출(위약금 ${rel.cost.total}억)`, 'warn'); } neg.replace = null; }
      const res = neg.kind === 'fa' || neg.kind === 'foreign' ? this.signFA(neg.id, offer) : neg.kind === 'resign' ? this.resignDeal(neg.id, offer) : this.extendDeal(neg.id, offer);
      if (res) { this._nSys(neg, res, 'warn'); neg.budgetOffer = /^예산 부족/.test(res) && neg.kind === 'fa' ? offer : null; if (/^보류/.test(res)) { const rb = this._negRound(neg); return { ok: false, pending: true, msg: res, ended: rb }; } return { ok: false, msg: res }; }   // 예산 부족 등은 라운드를 쓰지 않는다
      neg.state = 'signed'; neg.final = offer; this._nP(neg, 'accept', (ACCEPT[this.traitOf(p)] || []).concat(neg.kind === 'foreign' ? ACCEPT.foreign : []).concat(ACCEPT.base));
      this._nSys(neg, `계약 체결: ${offer.years}년 총 ${tot}억(연평균 ${per}억)`, 'good');
      this._negSigned(neg, p, offer); return { ok: true, signed: true };
    }
    const rc = this._negReactLine(neg, p, ev, offer);
    neg.mood = clamp(neg.mood + MOOD_D[rc.cat] + (neg.agent === 'warm' ? 1 : neg.agent === 'hard' ? -1 : 0), 0, 100);
    neg.counter = null;
    if (rc.cat !== 'insult' && neg.mood >= 52 && rc.r >= 0.9) { const m = this._negMin(p, neg.kind, offer.years, offer.years >= 2 ? (offer.bonus || 0) / Math.max(0.01, offer.bonus + offer.salary * offer.years) : 0), em = this._negEval(p, m, neg.kind); if (em.ok) { neg.counter = m; this._nP(neg, 'counter', COUNTER, { yrs: m.years, per: r2((m.bonus + m.salary * m.years) / m.years), tot: r1(m.bonus + m.salary * m.years) }); } }
    const ended = this._negRound(neg); return { ok: false, rejected: true, cat: rc.cat, msg: ev.msg, ended };
  };
  proto.negBoard = function () {   // 예산 초과 시 이사회 설득(기존 규칙 그대로)
    const S = this.S, neg = S.neg; if (!neg || neg.state !== 'open' || !neg.budgetOffer) return { ok: false, msg: '설득할 제안이 없습니다.' };
    const p = S.players[neg.id], offer = neg.budgetOffer, r = this.persuadeBoard(neg.id, offer); if (!r.ok) { this._nSys(neg, r.msg, 'warn'); return r; }
    neg.budgetOffer = null;
    if (r.success) { neg.state = 'signed'; neg.final = offer; this._nSys(neg, `이사회가 승인했습니다(추가 예산 ${r.need.toFixed(1)}억, 신뢰도 −${r.drop.toFixed(1)}).`, 'good'); this._nP(neg, 'accept', ACCEPT.base); this._negSigned(neg, p, offer); }
    else this._nSys(neg, r.msg, 'bad');
    return r;
  };
  proto.negCounter = function () {
    const neg = this.S.neg; if (!neg || neg.state !== 'open' || !neg.counter) return { ok: false, msg: '선수의 역제안이 없습니다.' };
    const c = neg.counter; neg.counter = null; return this.negOffer(c);
  };
  proto._negSigned = function (neg, p, offer) {
    const S = this.S, t = S.userTeam, tot = r1(offer.bonus + offer.salary * offer.years);
    this._repBump('negOk'); if (neg.kind === 'extend') this._repBump('ext'); if (neg.kind !== 'foreign') p.loyAdj = clamp((p.loyAdj || 0) + clamp(Math.round((neg.mood - 50) / 12), -1, 3), -15, 15);
    this.note(p, `${({ fa: 'FA 영입', foreign: p.aq ? '아시아쿼터 영입' : '외국인 영입', resign: '재계약', extend: '비FA 다년계약' })[neg.kind]}: ${offer.years}년 총 ${tot}억(호감도 ${Math.round(neg.mood)})`);
    if (neg.promises && neg.promises.length) p.promise = neg.promises[neg.promises.length - 1];
    { const txt = `${p.ko} ${({ fa: 'FA 영입', foreign: p.aq ? '아시아쿼터 영입' : '외국인 영입', resign: '재계약', extend: '비FA 다년계약' })[neg.kind]} — ${offer.years}년 총 ${tot}억`, imp = offer.years >= 3 || tot >= 30 ? 3 : 2, top = (S.story || [])[0];
      if (top && top.kind === 'deal' && top.d === S.day && top.text.includes(p.ko)) { top.text = txt; top.imp = Math.max(top.imp, imp); } else this.story('deal', txt, imp); }   // 같은 계약의 뉴스 기반 항목이 있으면 합친다
    if (neg.kind === 'fa') { const sm = this.signSummary(neg.id); if (sm && sm.comp) neg.evMsg = (neg.evMsg ? neg.evMsg + ' ' : '') + `FA 보상(${KO[sm.comp.from] || sm.comp.from}): ${sm.comp.text}`; }   // 원소속 구단이 가져간 보상을 결과 카드에 표시
    this._press(neg.kind === 'fa' ? 'sign' : neg.kind, { p, offer, tot, neg });
    if (neg.kind === 'fa' && tot >= 50 && this._front) this._front('sign', { head: `${p.ko}, ${KO[this.S.userTeam] || ''} 유니폼 입는다`, sub: `FA ${offer.years}년 총 ${Math.round(tot * 10) / 10}억`, pid: p.id, facts: [] });   // 대형 FA 영입 1면(moments.js)
    this.invalidate();
  };

  /* ---------------- 카드 ---------------- */
  const CARD_NAME = { ask: '의중 묻기', vision: '구단 비전', role: '역할 약속', loyal: '의리 호소', respect: '존중 표현', perk: '육성·훈련 환경', adapt: '정착 지원', time: '하루 숙고' };
  proto.negCardName = function (k) { return CARD_NAME[k] || k; };
  proto._roleOptions = function (p) {
    const t = this.S.userTeam, peers = this.players(t).filter(x => x.type === p.type && x.id !== p.id && !x.foreign === !p.foreign || (x.type === p.type && x.id !== p.id)), better = peers.filter(x => this.ovr(x) > this.ovr(p)).length, out = [];
    if (p.type === 'B') { if (better < 9) out.push(['starter', '주전 타자']); }
    else if (p.role === 'SP' || p.stamina >= 45) { const sps = peers.filter(x => x.role === 'SP' && this.ovr(x) > this.ovr(p)).length; if (sps < 5 && (p.role === 'SP')) out.push(['rotation', '선발 로테이션']); }
    if (p.type === 'P' && p.role !== 'SP') { const rps = peers.filter(x => x.role !== 'SP' && this.ovr(x) > this.ovr(p)).length; if (rps < 1) out.push(['closer', '마무리']); if (rps < 3) out.push(['setup', '셋업맨']); }
    return out;
  };
  proto.negCards = function () {
    const S = this.S, neg = S.neg; if (!neg || neg.state !== 'open') return [];
    const p = S.players[neg.id], t = S.userTeam, kind = neg.kind, out = [], used = neg.cards, loy = this.loyalty(p, t);
    const add = (k, label, hint, dis) => out.push({ k, label, hint, disabled: dis || (used[k] && k !== 'respect' ? '이미 사용했습니다' : used[k] >= 2 ? '더는 효과가 없습니다' : '') });
    add('ask', '의중 묻기', '선수가 가장 중요하게 보는 조건을 알아냅니다(1라운드 소모)');
    add('vision', '구단 비전', `지난 시즌 성적과 올해 목표로 설득합니다. 우승 도전을 중시하는 선수에게 효과가 큽니다`);
    if (this._roleOptions(p).length) add('role', '역할 약속', '주전·선발·마무리 같은 역할을 약속합니다. 지키지 못하면 불만 이벤트와 신뢰 하락이 생깁니다'); else out.push({ k: 'role', label: '역할 약속', hint: '현재 전력상 약속할 수 있는 역할이 없습니다', disabled: '약속할 역할 없음' });
    if (kind !== 'foreign') add('loyal', '의리 호소', loy && loy.v >= 50 ? '함께한 시간과 연고를 내세웁니다. 강경한 에이전트에게는 잘 통하지 않습니다' : '충성도·연고가 높지 않아 효과가 작습니다');
    add('respect', '존중 표현', '선수의 입장을 존중한다는 점을 전합니다. 소심형·자유분방형에 효과적이며 2번까지 쓸 수 있습니다');
    if (kind !== 'foreign' && p.age <= 29) add('perk', '육성·훈련 환경', '코치진 능력과 시설로 성장 계획을 설명합니다. 젊은 선수에게 효과적입니다');
    if (kind === 'foreign') add('adapt', '정착 지원', '통역·숙소·가족 지원을 약속합니다');
    if (kind === 'fa' && S.faMkt && !S.faMkt.closed) add('time', '하루 숙고', '선수에게 하루를 줍니다. 호감도는 오르지만 시장이 하루 진행되어 다른 구단이 계약할 수 있습니다');
    return out;
  };
  proto.negCard = function (k, arg) {
    const S = this.S, neg = S.neg; if (!neg || neg.state !== 'open') return { ok: false, msg: '진행 중인 협상이 없습니다.' };
    const c = this.negCards().find(x => x.k === k); if (!c) return { ok: false, msg: '사용할 수 없는 카드입니다.' }; if (c.disabled) return { ok: false, msg: c.disabled };
    const p = S.players[neg.id], t = S.userTeam, tr = this.traitOf(p) || 'model', prio = x => neg.prios.includes(x), loy = this.loyalty(p, t), last = (S.history || []).slice(-1)[0], rank = last ? last.userRank : 6;
    let d = 0, pool = CARD[k], good = true, ctx = {}, extra = null;
    neg.cards[k] = (neg.cards[k] || 0) + 1;
    if (k === 'ask') { const hid = neg.prios.find(x => !neg.revealed.includes(x)) || neg.prios[0]; this._nMe(neg, CARD.ask.me, ctx, 'ask'); this._nP(neg, 'askr', CARD.ask[hid] || CARD.ask.money); if (!neg.revealed.includes(hid)) neg.revealed.push(hid); d = (tr === 'shy' || tr === 'free' ? 4 : 2); neg.cards.ask = 1; this._nSys(neg, `선수의 우선순위: ${PRIO_KO[hid]}`, 'info'); }
    else if (k === 'vision') { const base = rank <= 3 ? 9 : rank <= 5 ? 6 : rank <= 7 ? 2 : -3; d = Math.round(base * (prio('win') ? 1.5 : 1) * (tr === 'shy' ? 0.8 : 1) + (tr === 'clutch' ? 2 : 0)); good = d >= 5; const sl = d >= 5 ? CARD.vision.good : d >= 1 ? CARD.vision.meh : CARD.vision.bad; this._nMe(neg, CARD.vision.me, { rank }, 'vis'); this._nP(neg, 'vis' + (d >= 5 ? 'g' : d >= 1 ? 'm' : 'b'), sl); }
    else if (k === 'role') { const opts = this._roleOptions(p), pick = arg && opts.find(o => o[0] === arg) ? opts.find(o => o[0] === arg) : opts[0]; d = Math.round(8 * (prio('role') ? 1.6 : 0.6)); this._nMe(neg, CARD.role.me, { role: pick[1] }, 'role'); this._nP(neg, 'role' + (prio('role') ? 'g' : 'm'), prio('role') ? CARD.role.good : CARD.role.meh); neg.promises = neg.promises || []; neg.promises.push({ kind: pick[0], label: pick[1], y: S.year, day: S.day }); this._nSys(neg, `${pick[1]} 약속을 했습니다. 계약 후에도 지켜야 합니다.`, 'warn'); }
    else if (k === 'loyal') { const lv = loy ? loy.v : 40, base = clamp((lv - 40) / 6, 1, 10) * (prio('loyal') ? 1.6 : 1) * (neg.agent === 'hard' ? 0.5 : 1); d = Math.round(base); good = d >= 4; this._nMe(neg, CARD.loyal.me, { tn: p.tnTeam === t ? p.tn : '' }, 'loy'); this._nP(neg, 'loy' + (good ? 'g' : 'c'), good ? CARD.loyal.good : CARD.loyal.cold); }
    else if (k === 'respect') { const n = neg.cards.respect; d = (tr === 'shy' || tr === 'free' || prio('respect') ? 5 : 2) - (n > 1 ? 3 : 0); good = d >= 3; this._nMe(neg, CARD.respect.me, ctx, 'res'); this._nP(neg, 'res' + (good ? 'g' : 'm'), good ? CARD.respect.good : CARD.respect.meh); }
    else if (k === 'perk') { const cr = (this.coachRating(t, 'stuff') + this.coachRating(t, 'contact')) / 2; d = Math.round(clamp((cr - 45) / 6, 0, 7) + (p.age <= 25 ? 2 : 0)); good = d >= 4; this._nMe(neg, CARD.perk.me, ctx, 'perk'); this._nP(neg, 'perk' + (good ? 'g' : 'm'), good ? CARD.perk.good : CARD.perk.meh); }
    else if (k === 'adapt') { d = prio('respect') || prio('years') ? 9 : 6; this._nMe(neg, CARD.adapt.me, ctx, 'adapt'); this._nP(neg, 'adapt', CARD.adapt.good); }
    else if (k === 'time') {
      this._nMe(neg, CARD.time.me, ctx, 'time'); this._nP(neg, 'timeg', CARD.time.good); d = 3; neg.mood = clamp(neg.mood + d, 0, 100);
      const bids0 = (S.faMkt.bids[neg.id] || []).length; this.faAdvance(1); neg.stamp = this._negStamp();
      if (p.team !== 'FA') { neg.state = 'broke'; neg.opp = p.team; this._nP(neg, 'gone', BREAK.gone); this._nSys(neg, `${p.ko}은(는) ${KO[p.team] || '다른 구단'}과(와) 계약했습니다.`, 'bad'); this.story('neg', `${p.ko}, ${KO[p.team] || '타 구단'}과 계약 — 협상 중 놓침`, 2); this._press('lost', { p, neg }); return { ok: true, gone: true }; }
      const bids1 = (S.faMkt.bids[neg.id] || []).length; if (bids1 > bids0) this._nSys(neg, `하루 사이 경쟁 구단 입찰이 ${bids1 - bids0}곳 늘었습니다.`, 'warn');
      const r = this._negRound(neg); return { ok: true, ended: r };
    }
    neg.mood = clamp(neg.mood + d, 0, 100);
    this._nSys(neg, `호감도 ${d >= 0 ? '+' : ''}${d} → ${Math.round(neg.mood)}`, d >= 0 ? 'good' : 'bad');
    const r = this._negRound(neg); return { ok: true, ended: r, d };
  };
  proto.negLeave = function () { const neg = this.S.neg; if (!neg || neg.state !== 'open') return; this._nMe(neg, CARD.leave.me, {}, 'leave'); this._negBreak(neg, 'leave'); };
  proto.negEnded = function () { const n = this.S.neg; return !!n && n.state !== 'open'; };

  /* ---------------- 재계약·연장 실행 ---------------- */
  proto._dealBudget = function (p, offer, replace) {
    const t = this.S.userTeam, newAnnual = offer.salary + (offer.bonus || 0) / offer.years, oldAnnual = replace ? p.contract.salary + (p.contract.amort || 0) : 0, room = this.faRoom(t);
    if (room + oldAnnual < newAnnual - 1e-9) return `예산 부족: 연간 비용 ${newAnnual.toFixed(1)}억이 FA 여유자금 ${(room + oldAnnual).toFixed(1)}억(기존 계약 포함)을 넘습니다.`; return null;
  };
  proto.resignDeal = function (id, offer) {
    const S = this.S, p = S.players[id], off = S.off; if (!off || !off.rep.expiring.includes(id)) return '재계약 대상이 아닙니다.';
    const ev = this._negEval(p, offer, 'resign'); if (!ev.ok) return ev.msg;
    if (ev.y >= 2) { const b = this._dealBudget(p, { salary: ev.sal, bonus: ev.bon, years: ev.y }, false); if (b) return b; }
    p.contract = this._newContract(p, ev.sal, ev.y, ev.bon); p.salHist = (p.salHist || []).slice(-2).concat([r2(ev.per)]); off.rep.expiring = off.rep.expiring.filter(x => x !== id);
    p.myExt = { y: S.year, how: '재계약' }; this._contractNote(p, '재계약'); this._bondShift(p, 1, '재계약'); this._news(`${p.ko} 재계약 (${ev.y}년 총 ${r1(ev.per * ev.y)}억${ev.bon ? ' = 계약금 ' + ev.bon + ' + 연봉 ' + ev.sal + '×' + ev.y : ''})`); this.invalidate(); return null;
  };
  proto.extendDeal = function (id, offer) {
    const S = this.S, p = S.players[id]; const bl = this.negBlock(id, 'extend'); if (bl && !/방금 협상/.test(bl)) return bl;
    const ev = this._negEval(p, offer, 'extend'); if (!ev.ok) return ev.msg;
    const b = this._dealBudget(p, { salary: ev.sal, bonus: ev.bon, years: ev.y }, true); if (b) return b;
    p.contract = this._newContract(p, ev.sal, ev.y, ev.bon); p.salHist = (p.salHist || []).slice(-2).concat([r2(ev.per)]); p.extAt = { y: S.year, day: S.day }; this._contractNote(p, '비FA 다년'); this._bondShift(p, 1, '비FA 다년계약');
    this._news(`${p.ko} 비FA 다년계약 (${ev.y}년 총 ${r1(ev.per * ev.y)}억${ev.bon ? ' = 계약금 ' + ev.bon + ' + 연봉 ' + ev.sal + '×' + ev.y : ''})`); this.invalidate(); return null;
  };
  proto._news = function (text) { const S = this.S; S.news.unshift({ year: S.year, day: S.day, text }); if (S.news.length > 120) S.news.length = 120; this._storyFromNews(text); };

  /* ---------------- 약속 점검 (매일 호출) ---------------- */
  proto._promiseTick = function (d) {
    const S = this.S, t = S.userTeam; if (d % 5 !== 0) return;
    for (const p of this.players(t)) {
      const pr = p.promise; if (!pr) continue; if (pr.y < S.year - 1 || (pr.y === S.year - 1 && S.phase === 'regular' && d > 60)) { p.promise = undefined; this._bondShift(p, 1, '약속 이행'); this._repBump('kept'); this.note(p, `${pr.label} 약속을 지킴`); p.keptP = (p.keptP || 0) + 1; p.loyAdj = clamp((p.loyAdj || 0) + 2, -15, 15); this.story('promise', `${p.ko}에게 한 ${pr.label} 약속을 지켰습니다`, 2); continue; }
      if (S.phase !== 'regular' || d - (pr.y === S.year ? pr.day : 0) < 25 || this.isInj(p)) continue;
      const set = S.teams[t].set; let kept = true;
      if (pr.kind === 'starter') kept = p.active && set.lineup.some(x => x.id === p.id); else if (pr.kind === 'rotation') kept = set.rotation.includes(p.id); else if (pr.kind === 'closer') kept = set.bullpen.closer === p.id; else if (pr.kind === 'setup') kept = (set.bullpen.setup || []).includes(p.id) || set.bullpen.closer === p.id;
      if (!kept) { this._repBump('broken'); this._bondShift(p, -1, '약속 불이행'); this.note(p, `${pr.label} 약속이 지켜지지 않음`); p.brokenP = (p.brokenP || 0) + 1; p.loyAdj = clamp((p.loyAdj || 0) - 6, -15, 15); p.mood = { v: -2, until: S.day + 20 }; p.promise = undefined; this.invalidate();
        this.story('promise', `${p.ko}에게 한 ${pr.label} 약속이 깨졌습니다 — 신뢰 하락`, 3); this._news(`약속 불이행: ${p.ko} (${pr.label}) — 충성도 −6, 컨디션 −2(20일)`); }
    }
  };

  /* ---------------- 면담 ---------------- */
  proto._meetStart = function (neg, p, r, opts) {
    const S = this.S, tr = this.traitOf(p) || 'model', topic = neg.topic = opts.topic || 'checkin', pool = (MEET_OPEN[topic] || MEET_OPEN.checkin)[tr] || MEET_OPEN.checkin.model;
    neg.speaker = 'p'; neg.max = topic === 'checkin' ? 3 : 4; neg.prios = []; neg.pref = 0; neg.range = [0, 0];
    const m = this._negMood(p, 'meeting', neg.agent); neg.mood = clamp(m.v - (topic === 'request' ? 12 : topic === 'grievance' ? 8 : topic === 'slump' ? 6 : 0), 10, 75); neg.mood0 = neg.mood; neg.factors = m.factors;
    neg.stamp = this._negStamp(); S.neg = neg; this._nSay(neg, 'p', pool[Math.floor(r.random() * pool.length)]);
    this._nSys(neg, `${TOPIC_KO[topic] || '면담'} — ${neg.max}번의 대화로 마음을 풀어 보세요. 호감도 ${Math.round(neg.mood)}에서 시작합니다.`);
    return { ok: true, neg };
  };
  proto.meetCards = function () {
    const S = this.S, neg = S.neg; if (!neg || neg.kind !== 'meeting' || neg.state !== 'open') return [];
    const p = S.players[neg.id], used = neg.cards, cap = this.captain(), out = [];
    const add = (k, label, hint, dis) => out.push({ k, label, hint, disabled: dis || (used[k] ? '이미 사용했습니다' : '') });
    add('listen', '경청', '충분히 들어줍니다. 소심형·자유분방형에게 효과가 큽니다');
    const ro = this._roleOptions(p); if (neg.topic === 'grievance' || neg.topic === 'request' || neg.topic === 'checkin') add('promise', '기회 약속', ro.length ? '역할을 약속합니다(지키지 못하면 신뢰 하락)' : '현재 전력으로는 약속할 수 있는 역할이 없습니다', ro.length ? '' : '약속할 역할 없음');
    add('honest', '솔직한 평가', '현재 위치를 솔직히 전합니다. 모범생·리더형은 받아들이지만 감정적인 선수는 반발할 수 있습니다');
    add('praise', '칭찬·격려', '노력과 태도를 인정합니다');
    if (neg.topic === 'slump' || neg.topic === 'checkin') add('rest', '휴식·재정비', '훈련 강도 조절을 약속합니다');
    add('discipline', '엄격한 기준 제시', '기준을 분명히 합니다. 리더형·모범생에게는 통하지만 소심형·자유분방형은 상처받을 수 있습니다');
    if (cap && cap.id !== p.id) add('captain', `주장(${cap.ko}) 동석`, '주장이 함께 이야기합니다. 리더형 주장이면 효과가 큽니다');
    return out;
  };
  proto.meetCard = function (k, arg) {
    const S = this.S, neg = S.neg; if (!neg || neg.kind !== 'meeting' || neg.state !== 'open') return { ok: false, msg: '진행 중인 면담이 없습니다.' };
    const c = this.meetCards().find(x => x.k === k); if (!c) return { ok: false, msg: '사용할 수 없는 카드입니다.' }; if (c.disabled) return { ok: false, msg: c.disabled };
    const p = S.players[neg.id], tr = this.traitOf(p) || 'model', cap = this.captain(); let d = 0, good = true; const pool = MEET_CARD[k]; neg.cards[k] = 1;
    if (k === 'listen') { d = tr === 'shy' || tr === 'free' ? 8 : 5; }
    else if (k === 'promise') { const ro = this._roleOptions(p), pick = arg && ro.find(o => o[0] === arg) || ro[0]; d = neg.topic === 'grievance' ? 10 : 7; neg.promises = (neg.promises || []).concat([{ kind: pick[0], label: pick[1], y: S.year, day: S.day }]); this._nMe(neg, pool.me, { role: pick[1] }, 'mp'); this._nP(neg, 'mpg', pool.good); this._nSys(neg, `${pick[1]} 약속을 했습니다.`, 'warn'); }
    else if (k === 'honest') { const deserved = this.ovr(p) >= (this.players(S.userTeam).filter(x => x.type === p.type && x.active).map(x => this.ovr(x)).sort((a, b) => a - b)[2] || 0); d = (tr === 'model' || tr === 'leader') ? 6 : tr === 'clutch' ? 1 : -4; if (neg.topic === 'grievance' && deserved) d -= 3; good = d >= 2; }
    else if (k === 'praise') { d = tr === 'shy' ? 6 : tr === 'model' ? 5 : 4; if (neg.topic === 'request') d -= 2; }
    else if (k === 'rest') { d = neg.topic === 'slump' ? 7 : 4; good = d >= 4; }
    else if (k === 'discipline') { d = tr === 'leader' || tr === 'model' ? 5 : tr === 'clutch' ? 1 : -6; good = d >= 2; }
    else if (k === 'captain') { const ct = this.traitOf(cap) || 'model'; d = ct === 'leader' ? 9 : 5; }
    if (k !== 'promise') { this._nMe(neg, pool.me, { cap: cap ? cap.ko : '' }, 'm' + k); this._nP(neg, 'm' + k + (good ? 'g' : 'b'), good ? pool.good : (pool.bad || pool.meh || pool.good)); }
    neg.mood = clamp(neg.mood + d, 0, 100); this._nSys(neg, `호감도 ${d >= 0 ? '+' : ''}${d} → ${Math.round(neg.mood)}`, d >= 0 ? 'good' : 'bad');
    neg.round++; if (neg.round >= neg.max) return { ok: true, finished: this._meetFinish(neg) }; return { ok: true };
  };
  proto._meetFinish = function (neg) {
    if (neg.state !== 'open' && neg.state !== 'paused') return neg.outcome;
    const S = this.S, p = S.players[neg.id], t = S.userTeam, v = neg.mood, out = v >= 62 ? 'ok' : v <= 38 ? 'bad' : 'mid'; neg.state = 'done'; neg.outcome = out;
    const pool = MEET_END[out]; this._nP(neg, 'end' + out, pool);
    const adj = (x) => { p.loyAdj = clamp((p.loyAdj || 0) + x, -15, 15); }, mood = (v2, days) => { p.mood = { v: v2, until: S.day + days }; };
    if (out === 'ok') { adj(neg.topic === 'request' ? 5 : 2); mood(1, 15); } else if (out === 'mid') { adj(0); mood(0, 5); } else { adj(neg.topic === 'request' ? -2 : -4); mood(-2, 20); }
    if (neg.promises && neg.promises.length && out !== 'bad') p.promise = neg.promises[neg.promises.length - 1];
    neg.msg = { ok: `면담이 잘 풀렸습니다. ${p.ko} 충성도 ${neg.topic === 'request' ? '+5' : '+2'}, 컨디션 +1(15일).`, mid: `면담이 끝났습니다. 뚜렷한 변화는 없지만 대화가 이어졌습니다.`, bad: `면담이 좋지 않게 끝났습니다. ${p.ko} 충성도 ${neg.topic === 'request' ? '−2' : '−4'}, 컨디션 −2(20일).` }[out];
    this._nSys(neg, neg.msg, out === 'ok' ? 'good' : out === 'bad' ? 'bad' : 'info');
    p.meetAt = S.day; this._repBump(out === 'ok' ? 'meetOk' : out === 'bad' ? 'meetBad' : 'meetMid'); this.note(p, `면담(${TOPIC_KO[neg.topic] || '면담'}): ${out === 'ok' ? '마음을 풀었음' : out === 'bad' ? '앙금이 남음' : '대화를 이어감'}`); if (out !== 'mid') this._bondShift(p, out === 'ok' ? 1 : -1, '면담');
    this.story('meet', `${p.ko}과(와) ${TOPIC_KO[neg.topic]} — ${out === 'ok' ? '마음을 풀었습니다' : out === 'bad' ? '앙금이 남았습니다' : '대화를 이어갔습니다'}`, out === 'ok' ? 2 : 1);
    if (neg.evId) { const e = ((S.events || {}).list || []).find(x => x.id === neg.evId); if (e && e.status === 'open') { const r = this.resolveEvent(neg.evId, 'talk', true, { talk: out === 'ok' ? true : out === 'bad' ? false : v >= 50 }); neg.evMsg = r.msg; } }
    this.invalidate(); return out;
  };
  proto.meetBlock = function (id) { const S = this.S, p = S.players[id]; if (!p || p.team !== S.userTeam) return '우리 팀 선수만 면담할 수 있습니다.'; if (p.meetAt !== undefined && S.day - p.meetAt < 20 && p.meetAt <= S.day) return `최근 면담한 선수입니다(${20 - (S.day - p.meetAt)}일 뒤 가능).`; return null; };

  /* ---------------- 시즌 스토리 · 언론·팬 반응 ---------------- */
  proto.story = function (kind, text, imp) {
    const S = this.S; S.story = S.story || []; const last = S.story[0]; if (last && last.text === text && last.d === S.day) return;
    S.story.unshift({ y: S.year, d: S.day, ph: S.phase, kind, text, imp: imp || 1 }); if (S.story.length > 400) S.story.length = 400;
  };
  proto._storyFromNews = function (text) {
    const rules = [[/^FA .+영입/, 'deal', 3], [/^\S+ 재계약 \(|^\S+ 비FA 다년계약 \(/, 'deal', 2], [/^트레이드/, 'trade', 3], [/^방출/, 'release', 2], [/^부상:/, 'injury', 2], [/^부상 복귀/, 'return', 1], [/연승|연패/, 'streak', 2], [/^기록 달성/, 'record', 1], [/주장 임명|주장 해임/, 'captain', 2], [/은퇴/, 'retire', 2], [/드래프트/, 'draft', 1], [/감독 해임|감독 취임/, 'coach', 3], [/팀 MVP/, 'mvp', 2], [/시즌 목표 평가/, 'goal', 3], [/코치 영입|코치 해임/, 'staff', 1], [/약속 불이행/, 'promise', 0], [/이사회/, 'board', 2], [/전역/, 'mil', 1]];
    { const sm = text.match(/\((\d+)(연승|연패)\)/); if (sm) { const c = +sm[1]; if (![5, 8, 10, 12, 15, 20].includes(c)) return; } }   // 연승·연패는 굵직한 단계만 기록
    for (const [re, k, imp] of rules) if (re.test(text)) { if (imp > 0) { let v = imp; if (k === 'record') { const m = text.match(/시즌 (\d+)(홈런|타점|도루|탈삼진)/); if (m) { const x = +m[1], u = m[2]; if ((u === '홈런' && x >= 30) || (u === '타점' && x >= 100) || (u === '도루' && x >= 40) || (u === '탈삼진' && x >= 150)) v = 2; if ((u === '홈런' && x >= 40) || (u === '타점' && x >= 120) || (u === '탈삼진' && x >= 200)) v = 3; } } if (/^부상:/.test(text)) { const m = text.match(/약 (\d+)일/); if (m && +m[1] >= 30) v = 3; } this.story(k, text, v); } if (k === 'trade' || k === 'release') this._press(k, { text }); return; }
  };
  proto.storyYear = function (y) { const S = this.S; return (S.story || []).filter(e => e.y === y).slice().reverse(); };
  proto.storyTop = function (y, n) { const l = this.storyYear(y), top = l.slice().sort((a, b) => b.imp - a.imp || a.d - b.d).slice(0, n || 6); return top.sort((a, b) => (a.ph === 'offseason' ? 0 : 1) - (b.ph === 'offseason' ? 0 : 1) || a.d - b.d); };
  const HEAD = {
    sign: ['{team}, {p} 영입…{tot}억 승부수', '{p}, {team} 유니폼 입는다 — {yrs}년 총 {tot}억', '{team}이 선택한 {p}, 계약 완료', '[FA] {p} 새 둥지는 {team}…{yrs}년 계약'],
    foreign: ['{team}, 새 외국인 {p}와 계약', '{p}, {team}과 계약…KBO 도전', '{team} 외국인 {p} 합류 — 연봉 {sal}억'],
    resign: ['{team}, {p}와 재계약', '{p} 잔류…{yrs}년 총 {tot}억', '{team}이 붙잡았다, {p}'],
    extend: ['{team}, {p}와 비FA 다년계약…{yrs}년 총 {tot}억', '{p}, {team}에 {yrs}년 더 남는다', '{team}의 장기 투자 — {p} 다년계약'],
    break: ['{p}, {team}과 협상 결렬', '{team}-{p} 협상 평행선…결국 불발', '{p} 협상 무산, {team}의 선택은?'],
    lost: ['{p}, 협상 중 {opp} 유니폼…{team} 놓쳤다', '{team}, {p} 영입 경쟁서 밀려'],
    trade: ['{text}'], release: ['{text}'], race: ['{text}']
  };
  const FAN = {
    big: ['커뮤니티: "너무 비싼 거 아니냐" vs "이 정도는 써야 한다"로 갈립니다.', '팬 반응: 기대와 우려가 반반입니다. 성적으로 증명해야 합니다.', '팬들은 "구단이 확실히 베팅했다"는 반응입니다.'],
    fair: ['팬 반응: 합리적인 계약이라는 평가가 많습니다.', '커뮤니티: "적정선", "믿고 간다"는 반응이 나옵니다.', '팬들은 큰 이견 없이 환영하는 분위기입니다.'],
    cheap: ['팬 반응: "이 가격이면 대성공"이라는 평가입니다.', '커뮤니티: "프런트가 일을 잘했다"는 칭찬이 이어집니다.'],
    bad: ['팬 반응: 아쉬움을 표하는 목소리가 큽니다.', '커뮤니티: "협상 과정이 아쉽다"는 반응입니다.'],
    neutral: ['팬 반응: 지켜보자는 분위기입니다.']
  };
  proto._press = function (kind, c) {
    const S = this.S, p = c.p, t = KO[S.userTeam] || '', r = rngFor(S.seed, S.year, S.day, 6400 + (S.press || []).length), pool = HEAD[kind]; if (!pool) return;
    let fan = 'neutral', x = { team: t, p: p ? p.ko : '', text: c.text || '', opp: c.neg && c.neg.opp ? KO[c.neg.opp] : '', yrs: c.offer ? c.offer.years : '', tot: c.tot || '', sal: c.offer ? c.offer.salary : '' };
    if (p && c.offer && ['sign', 'resign', 'extend', 'foreign'].includes(kind)) { const mv = Math.max(0.3, this.marketValue ? this.marketValue(p) : 1), per = (c.offer.bonus + c.offer.salary * c.offer.years) / c.offer.years, q = per / mv; fan = q > 1.25 ? 'big' : q < 0.9 ? 'cheap' : 'fair'; }
    else if (kind === 'break' || kind === 'lost') fan = 'bad';
    else if (kind === 'trade' || kind === 'release') fan = 'neutral';
    const head = fill(pool[Math.floor(r.random() * pool.length)], x), fl = FAN[fan];
    S.press = S.press || []; S.press.unshift({ y: S.year, d: S.day, kind, head, fan: c.fan !== undefined ? c.fan : kind === 'trade' || kind === 'release' ? '' : fl[Math.floor(r.random() * fl.length)] });   // c.fan: 경기·순위 소식의 팬 반응(실제 일어난 일에서 고른 문장) if (S.press.length > 40) S.press.length = 40;
  };
});
