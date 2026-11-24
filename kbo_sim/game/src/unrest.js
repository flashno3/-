/* 선수 불만 에스컬레이션(내 구단 + AI 구단): 불만 게이지가 쌓이면 면담 요구 → 이적 요청 → (거부 시) 태업 → 무단이탈 → 구단 대응(제한선수·자격정지·시정 촉구 후 계약 해지·임의해지).
 * 규정 근거(원문 확인): KBO 규약 제31조 임의해지선수(연봉 지급 중단·복귀 1년 제한)·제32조 출장정지선수·제33조 제한선수(개인 사유 참가활동 중지)·제34조 자격정지선수(계약·규약 위반)·
 *   제36조 규제선수 특례(규제 기간 일수 × 연봉 1/300 감액)·제47조·통일계약서 제24조 계약 해지(14일 이상 시정 촉구, 총재 승인, 선수 귀책 해지는 잔여 연봉 미지급)·통일계약서 제21조 트레이드 거부.
 * 규정에 없는 것(⚠ 게임 설정): 불만 게이지·단계 임계값·태업(컨디션 −3)·무단이탈 판정(연속 불참)·제한/자격정지 최소 기간(20·30일)·복귀 허가 기준·AI 구단의 판단 확률.
 * 단계: grumble(40+, 표시만) · meeting(60+) · request(75+) · refused(거부 후) · slack(태업) · awol(무단이탈) · notice(시정 촉구 14일) · restr(제한/자격정지). 외국인·올해 신인·상무·FA 선수는 제외. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TEAMS, KO0, TRAITS, news } = LG.OFFC;
  const TH = { grumble: 40, meeting: 50, request: 62 }, TRAIT_K = { free: 1.3, clutch: 1.1, shy: 0.7, leader: 0.8, model: 0.8 };
  const r1 = x => Math.round(x * 10) / 10;
  const STAGE_TXT = { grumble: '불만', meeting: '면담 요구', request: '이적 요청', refused: '요청 거부', slack: '태업', awol: '무단이탈', notice: '시정 촉구', restr: '활동 정지' };
  proto.unrestStageName = s => STAGE_TXT[s] || '';
  proto._grv = function (p) { return p.grv || 0; };
  proto._unrestPlayers = function (t) { return this.players(t).filter(p => !p.foreign && p.team === t && p.team !== 'MIL' && p.rookie !== this.S.year); };
  /* 불만이 쌓이는 속도(하루): 벤치·2군의 스타, 나쁜 대우(충성도 보정), 부진한 컨디션 / 줄어드는 속도: 기본 회복, 팀 호성적 */
  proto._grvRate = function (p, t, ctx) {
    const S = this.S, set = S.teams[t].set, tr = TRAIT_K[this.traitOf(p)] || 1; let up = 0;
    const star = ctx.star.has(p.id), core = ctx.core.has(p.id);
    if (star && !p.active && !this.isInj(p)) up += 0.55; else if (star && p.active && !core && p.type === 'B') up += 0.35; else if (star && p.active && !core && p.role === 'SP') up += 0.35;
    else if (!p.active && !this.isInj(p) && this.ovr(p) >= ctx.minAct + 4) up += 0.3;
    if ((p.loyAdj || 0) <= -2) up += (-(p.loyAdj || 0) - 1) * 0.06;
    if (t === S.userTeam && this.moodOf(p) <= -2) up += 0.15;
    return up * tr - 0.12 - (ctx.win ? 0.1 : 0);
  };
  proto._unrestCtx = function (t) {
    const S = this.S, set = S.teams[t].set, ps = this._unrestPlayers(t), byOvr = ps.slice().sort((a, b) => this.ovr(b) - this.ovr(a)), r = S.rec[t] || [0, 0, 0];
    const act = ps.filter(p => p.active && !this.isInj(p)), minAct = act.length ? Math.min(...act.map(p => this.ovr(p))) : 0;
    const core = new Set([...(set.lineup || []).map(x => x.id || x), ...(set.rotation || []), set.bullpen && set.bullpen.closer, ...((set.bullpen && set.bullpen.setup) || [])].filter(Boolean));
    return { star: new Set(byOvr.slice(0, 14).map(p => p.id)), core, minAct, win: (r[0] + r[1] + r[2]) >= 20 && r[0] / Math.max(1, r[0] + r[1]) >= 0.55 };
  };
  const cause = (L, p, t) => { const ctx = L._unrestCtx(t); if (ctx.star.has(p.id) && !p.active) return '주전급 기량인데 1군에서 뛰지 못하는 것'; if (ctx.star.has(p.id) && !ctx.core.has(p.id)) return '주전급 기량에 걸맞은 출전 기회를 받지 못하는 것'; if ((p.loyAdj || 0) <= -3) return '최근 구단의 대우에 대한 서운함'; return '개인적인 사정과 팀 분위기'; };
  const rrp = (L, p, salt, d) => rngFor(L.S.seed, L.S.year, d === undefined ? L.S.day : d, 8900 + salt + (parseInt(String(p.id).slice(1)) || 0) % 997).random();
  /* ---- 일일 처리 ---- */
  proto._unrestDay = function (d) {
    const S = this.S; if (S.phase !== 'regular') return;
    for (const t of TEAMS) {
      const ctx = this._unrestCtx(t);
      for (const p of this._unrestPlayers(t)) {
        if (p.unrest) { this._unrestStage(p, t, d); continue; }
        let v = p.grv || 0; v += this._grvRate(p, t, ctx);
        if (rrp(this, p, 1, d) < 0.0004) v += 15 + 10 * rrp(this, p, 2, d);   // 개인 사정·언론 보도 같은 돌발 불만
        v = clamp(v, 0, 100); if (v <= 0) delete p.grv; else p.grv = r1(v);
        if (!(p.unrestCool && d < p.unrestCool)) { const n = p.unrestYear === S.year ? (p.unrestN || 0) : 0; if (v >= TH.request && n >= 1) this._unrestEnter(p, t, d, 'request'); else if (v >= TH.meeting && n < 3) this._unrestEnter(p, t, d, 'meeting'); }
      }
    }
  };
  proto._unrestEnter = function (p, t, d, stage) {
    const S = this.S; p.unrest = { stage, since: d, y: S.year, t }; if (p.unrestYear !== S.year) { p.unrestYear = S.year; p.unrestN = 0; } if (stage === 'meeting') p.unrestN = (p.unrestN || 0) + 1;
    if (t === S.userTeam) return this._unrestEvent(p, t, stage); this._unrestAI(p, t, d, stage);
  };
  proto._unrestCool = function (p, d, days) { p.unrestCool = d + (days || 45); delete p.unrest; };
  proto._unrestLog = function (p, t, text, imp) { const S = this.S; (S.unrestLog = S.unrestLog || []).unshift({ y: S.year, d: S.day, t, id: p.id, ko: p.ko, text }); if (S.unrestLog.length > 40) S.unrestLog.length = 40; if (t === S.userTeam) this.story('unrest', text, imp || 2); else this._lnews(`${KO0[t] || t} ${text}`); };
  /* ---- 단계 진행(진행 중인 선수) ---- */
  proto._unrestStage = function (p, t, d) {
    const S = this.S, u = p.unrest, user = t === S.userTeam, age = d - u.since;
    if (p.team !== t || (u.t !== undefined && u.t !== t)) { delete p.unrest; return; } if (u.t === undefined) u.t = t;   // 다른 구단으로 옮기면 진행 중이던 단계는 사라진다
    if (u.stage === 'refused') {   // 요청 거부 뒤: 불만이 가라앉지 않으면 8일 뒤 태업
      p.grv = r1(clamp((p.grv || 0) + 0.4, 0, 100)); if (user) p.mood = { v: -2, until: d + 3 };
      if (p.grv < 50) { this._unrestCool(p, d, 40); return; }
      if (age >= 8 && p.grv >= 70) { u.stage = 'slack'; u.since = d; this._unrestLog(p, t, `${p.ko}이(가) 이적 요청이 거부되자 훈련·경기에서 소극적인 태업에 들어갔습니다`, 3); if (user) this._unrestEvent(p, t, 'slack'); else this._unrestAI(p, t, d, 'slack'); }
    } else if (u.stage === 'slack') {
      p.grv = r1(clamp((p.grv || 0) + 0.2, 0, 100)); if (user) p.mood = { v: -3, until: d + 3 };
      if (p.grv < 55) { this._unrestLog(p, t, `${p.ko}이(가) 마음을 가다듬고 태업을 그쳤습니다`, 2); this._unrestCool(p, d, 60); return; }
      if (age >= 20 && p.grv >= 76 && rrp(this, p, 5, d) < 0.03) this._unrestAwol(p, t, d);
    } else if (u.stage === 'notice') {
      if (user) this._unrestPay(p, t); if (age >= 14) this._unrestNoticeEnd(p, t, d);
    } else if (u.stage === 'awol') { if (user) this._unrestPay(p, t); if (!user && age >= 5) this._unrestAI(p, t, d, 'awol2'); }
    else if (u.stage === 'restr') { if (user) this._unrestPay(p, t); if (age >= u.min) { if (user) { if (!u.asked) { u.asked = true; this._unrestEvent(p, t, 'return'); } } else this._unrestAI(p, t, d, 'return'); } }
    else if (u.stage === 'meeting' || u.stage === 'request') {   // 내 구단: 이벤트를 방치하면 기본 선택으로 처리(이벤트 만료 시 resolveEvent가 호출). AI: 즉시 처리됨
      if (user && age > 12 && !this.eventsOpen().some(e => e.type === 'unrest' && e.data.pid === p.id)) { this._unrestEnter2(p, t, d, u.stage === 'meeting' ? 'ignore' : 'refuse'); }
    }
  };
  proto._unrestEnter2 = function (p, t, d, k) { const msg = this._unrestApply(p, t, k, p.unrest ? p.unrest.stage : 'meeting'); return msg; };
  proto._unrestPay = function (p, t) { const f = this.S.fin && this.S.fin.teams[t]; if (f && p.contract) f.evRev = r1((f.evRev || 0) + p.contract.salary / 300); };   // 규제·이탈 기간 일수 × 연봉 1/300 감액(제36조·통일계약서 제27조)
  proto._unrestAwol = function (p, t, d) {
    const S = this.S, user = t === S.userTeam; p.unrest = { stage: 'awol', since: d, y: S.year };
    p.active = false; p.inj = { dx: '무단이탈', since: `${S.year} 발생`, ret: '2099-12-31', retN: 1e9, basis: '선수 불만 에스컬레이션', apply: true, generated: false, unrest: true };
    this._unrestLog(p, t, `${p.ko}이(가) 팀을 무단이탈했습니다(연락 두절)`, 3);
    if (user) { if (this._injAutoFix && this.injAuto() !== 'off') this._injAutoFix([p], []); this.repairSettings(t); this._unrestEvent(p, t, 'awol'); } else { this.refreshTeam(t); }
    this.invalidate();
  };
  proto._unrestReturn = function (p, t, d, how) {
    delete p.inj; delete p.unrest; p.grv = r1(Math.max(15, (p.grv || 0) - 30)); p.unrestCool = d + 60; p.lockUntil = 0; p.active = false; this.invalidate(); if (t === this.S.userTeam) this.repairSettings(t); else this.refreshTeam(t);
    this._unrestLog(p, t, `${p.ko}이(가) ${how}로 팀에 복귀했습니다`, 2);
  };
  proto._unrestRelease = function (p, t, text, voluntary) {
    const S = this.S, d = S.day; this._unrestLog(p, t, text, 3); delete p.inj; delete p.unrest; delete p.grv; p.active = false; if (voluntary) p.volRet = { team: t, y: S.year + 1 };
    this.release(t, p.id); if (t === S.userTeam) this.repairSettings(t); else this.refreshTeam(t); this.invalidate();
  };
  proto._unrestNoticeEnd = function (p, t, d) {   // 14일 시정 촉구 종료: 복귀하지 않으면 계약 해지가 가능해진다
    const user = t === this.S.userTeam, back = (p.grv || 0) <= 72 && rrp(this, p, 7, d) < 0.6;
    if (back) { this._unrestReturn(p, t, d, '시정 촉구에 응해'); return; }
    p.unrest.stage = 'awol'; p.unrest.since = d; p.unrest.noticed = true;
    this._unrestLog(p, t, `${p.ko}이(가) 시정 촉구 14일이 지나도 복귀하지 않았습니다`, 3);
    if (user) this._unrestEvent(p, t, 'awol'); else this._unrestAI(p, t, d, 'awol2');
  };
  /* ---- AI 구단의 자동 판단 ---- */
  proto._unrestAI = function (p, t, d, stage) {
    const S = this.S, r = rrp(this, p, 11, d), loy = this.loyalty(p, t), lv = loy ? loy.v : 45;
    if (stage === 'meeting') {
      if (r < clamp(0.3 + lv / 300, 0.25, 0.6)) { p.grv = r1(Math.max(0, (p.grv || 0) - 28)); this._unrestCool(p, d, 45); this._unrestLog(p, t, `${p.ko}과(와) 면담으로 불만을 풀었습니다`, 1); }
      else { p.grv = r1(Math.min(100, (p.grv || 0) + 8)); delete p.unrest; p.unrestCool = d + 8; }   // 풀지 못하면 8일 뒤 다시(불만이 66을 넘으면 이적 요청)
      return;
    }
    if (stage === 'request') {
      this._unrestLog(p, t, `${p.ko}이(가) 구단에 이적을 요청했습니다`, 2);
      if (this.canTrade() && r < 0.45 && this._unrestAITrade(p, t, d)) return;
      p.unrest = { stage: 'refused', since: d, y: S.year }; p.loyAdj = clamp((p.loyAdj || 0) - 3, -15, 15); return;
    }
    if (stage === 'slack') { if (r < 0.5 && this.canTrade() && this._unrestAITrade(p, t, d)) return; if (r < 0.75) { p.grv = r1(Math.max(0, (p.grv || 0) - 22)); } return; }
    if (stage === 'awol2') {   // 무단이탈 5일째: 복귀 45% / 제한선수 지정 25% / 계약 해지 20% / 임의해지 10%
      if (r < 0.45) { this._unrestReturn(p, t, d, '복귀 설득에 응해'); return; }
      if (r < 0.7) { p.unrest = { stage: 'restr', since: d, min: 20, kind: '제한선수', y: S.year }; this._unrestLog(p, t, `${p.ko}을(를) 제한선수로 지정했습니다`, 2); return; }
      if (r < 0.9) { this._unrestRelease(p, t, `${p.ko}과(와) 14일 시정 촉구 뒤 계약을 해지했습니다(선수 귀책)`, false); return; }
      this._unrestRelease(p, t, `${p.ko}과(와) 임의해지로 합의했습니다(1년 복귀 제한)`, true); return;
    }
    if (stage === 'return') { if ((p.grv || 0) <= 55 && r < 0.7) this._unrestReturn(p, t, d, `${p.unrest.kind} 해제`); else this._unrestRelease(p, t, `${p.ko}의 ${p.unrest.kind}이(가) 끝났지만 복귀를 허가하지 않고 계약을 해지했습니다`, false); }
  };
  proto._unrestAITrade = function (p, A, d) {   // 같은 유형·가치 ±20%(불만 선수는 10% 할인)의 맞교환
    const S = this.S, mv = this.marketValue(p) * 0.9, r = rngFor(S.seed, S.year, d, 8999 + (parseInt(String(p.id).slice(1)) || 0) % 977);
    const teams = TEAMS.filter(x => x !== A && x !== S.userTeam).sort(() => r.random() - 0.5);
    for (const B of teams) { const cand = this.players(B).filter(q => this._aiTradeOk(q) && q.type === p.type && (p.type === 'P' ? (p.role === 'SP') === (q.role === 'SP') : (p.pos === 'C') === (q.pos === 'C')) && !this._aiCore(B).has(q.id) && this.marketValue(q) / mv >= 0.8 && this.marketValue(q) / mv <= 1.2).sort((a, b) => Math.abs(this.marketValue(a) / mv - 1) - Math.abs(this.marketValue(b) / mv - 1))[0];
      if (cand && this._aiTradeOk(p)) { delete p.unrest; p.grv = 20; const rec = this._aiSwap(A, B, p, cand, `${p.ko}의 이적 요청을 받아들였습니다`); if (rec) rec.unrest = true; p.unrestCool = d + 90; return true; } }
    return false;
  };
  /* ---- 내 구단: 이벤트 ---- */
  proto._unrestEvent = function (p, t, stage) {
    const S = this.S, v = Math.round(p.grv || 0), loy = this.loyalty(p, t), lv = loy ? loy.v : 45, c = cause(this, p, t), cap = this.captain && this.captain();
    const prTalk = base => clamp(base + lv / 250 + (cap ? 0.1 : 0) - v / 400 + (this.traitOf(p) === 'leader' ? 0.08 : this.traitOf(p) === 'free' ? -0.08 : 0), 0.15, 0.85), pct = x => Math.round(x * 100) + '%';
    const T = TRAITS[this.traitOf(p)] || '-', ctx = this._unrestCtx(t), benched = !p.active && !this.isInj(p), core = ctx.core.has(p.id);
    const E = { type: 'unrest', ttl: 8, data: { pid: p.id, stage } };
    if (stage === 'meeting') return this._evAdd(Object.assign(E, { title: `${p.ko} 면담 요구`, def: 'ignore', rec: benched ? 'play' : 'talk', text: `${p.ko}(${T}, OVR ${this.ovr(p)})이(가) 면담을 요청했습니다. 불만 ${v}/100 — ${c}. 방치하면 이적 요청으로 번질 수 있습니다.`, choices: [
      { k: 'talk', label: '면담으로 달랜다', hint: `성공 ${pct(prTalk(0.35))}: 불만 −30·충성도 +2 / 실패: 불만 +6·충성도 −1` },
      ...(core ? [] : [{ k: 'play', label: p.active ? '출전 기회를 늘려 준다' : '1군에 올려 기회를 준다', hint: '불만 −25 · 충성도 +1(1군에 올릴 수 있을 때)' }]),
      { k: 'raise', label: '대우 개선 약속(0.3억)', hint: '불만 −15 · 충성도 +3' }, { k: 'ignore', label: '그대로 둔다', hint: '불만 +5' }] }));
    if (stage === 'request') return this._evAdd(Object.assign(E, { title: `${p.ko} 이적 요청`, def: 'refuse', rec: 'talk', text: `${p.ko}이(가) 구단에 공식적으로 이적을 요청했습니다(불만 ${v}/100 — ${c}). 규약상 선수에게 이적을 요구할 권리는 없지만, 거부하면 태업이나 무단이탈로 번질 위험이 있습니다.`, choices: [
      { k: 'trade', label: '요청 수락 — 맞교환 트레이드 추진', hint: '조건에 맞는 팀이 있으면 즉시 트레이드(없으면 불만 −10)' },
      { k: 'talk', label: '설득해 마음을 돌린다', hint: `성공 ${pct(prTalk(0.25))}: 불만 −35 / 실패: 불만 +8` },
      { k: 'refuse', label: '요청 거부(보류권 유지)', hint: '충성도 −3 · 불만이 안 풀리면 8일 뒤 태업' }] }));
    if (stage === 'slack') return this._evAdd(Object.assign(E, { title: `${p.ko} 태업`, def: 'ignore', rec: 'meet', text: `${p.ko}이(가) 이적 요청이 거부된 뒤 훈련과 경기에서 소극적입니다(컨디션 −3). 불만 ${v}/100. 14일 안에 풀지 못하면 무단이탈로 이어질 수 있습니다.`, choices: [
      { k: 'meet', label: '감독이 직접 면담', hint: `성공 ${pct(prTalk(0.2))}: 불만 −30(태업 해소) / 실패: 불만 +5` },
      { k: 'bench', label: '2군으로 내려 징계', hint: '1군에서 제외 · 불만 +8 · 충성도 −2(태업 영향 차단)' },
      { k: 'trade', label: '맞교환 트레이드 추진', hint: '조건에 맞는 팀이 있으면 즉시 트레이드' }, { k: 'ignore', label: '그대로 둔다', hint: '컨디션 −3 지속' }] }));
    if (stage === 'awol') { const u = p.unrest, noticed = !!u.noticed; return this._evAdd(Object.assign(E, { title: `${p.ko} 무단이탈`, ttl: 6, def: noticed ? 'restrict' : 'notice', rec: noticed ? 'release' : 'notice', text: `${p.ko}이(가) 연락 두절 상태로 팀을 이탈했습니다(불만 ${v}/100). 이탈 기간에는 일수 × 연봉 1/300이 감액됩니다. ${noticed ? '14일 시정 촉구에도 복귀하지 않았습니다.' : ''} 규약에 따라 대응하세요.`, choices: [
      ...(noticed ? [] : [{ k: 'notice', label: '14일 시정 촉구', hint: '14일 뒤 복귀하지 않으면 계약 해지 가능(복귀 가능성 약 60%, 불만이 낮을수록 높음)' }]),
      { k: 'restrict', label: '제한선수 지정 요청(제33조)', hint: '개인 사유로 참가활동 중지 · 최소 20일 정지 후 복귀 판단 · 정지 기간 연봉 1/300 감액' },
      { k: 'suspend', label: '자격정지선수 지정 요청(제34조)', hint: '계약 위반 · 최소 30일 정지 후 복귀 판단 · 정지 기간 연봉 1/300 감액' },
      { k: 'release', label: '계약 해지(제47조·통일계약서 제24조)', req: noticed ? null : '먼저 14일 시정 촉구가 필요', hint: '총재 승인 · 선수 귀책이라 잔여 연봉 지급 없음 · 선수는 자유계약선수가 됨' },
      { k: 'voluntary', label: '임의해지 협의(제31조)', hint: '연봉 지급 중단 · 1년 복귀 제한 · 원소속 구단과만 복귀 가능' }] })); }
    if (stage === 'return') return this._evAdd(Object.assign(E, { title: `${p.ko} 복귀 신청`, ttl: 8, def: 'extend', rec: (p.grv || 0) <= 50 ? 'allow' : 'extend', text: `${p.ko}의 ${p.unrest.kind} 최소 기간이 지났습니다. 복귀를 신청했습니다(불만 ${v}/100).`, choices: [
      { k: 'allow', label: '복귀 허가', hint: '불만 −30 · 1군 복귀는 2군 조정 뒤' }, { k: 'extend', label: '정지 14일 연장', hint: '연봉 감액 계속 · 불만 +3' },
      { k: 'release', label: '계약 해지', hint: '선수 귀책 해지(총재 승인)' }] }));
  };
  proto._unrestApply = function (p, t, k, stage) {
    const S = this.S, d = S.day, u = p.unrest || {}, f = S.fin && S.fin.teams[t], cost = c => { if (f && c > 0) f.evCost = r1((f.evCost || 0) + c); };
    const adj = v => { p.loyAdj = clamp((p.loyAdj || 0) + v, -15, 15); }, down = v => { p.grv = r1(Math.max(0, (p.grv || 0) - v)); }, up = v => { p.grv = r1(Math.min(100, (p.grv || 0) + v)); };
    const loy = this.loyalty(p, t), lv = loy ? loy.v : 45, cap = this.captain && this.captain(), v0 = p.grv || 0;
    const talk = base => rrp(this, p, 21, d) < clamp(base + lv / 250 + (cap ? 0.1 : 0) - v0 / 400 + (this.traitOf(p) === 'leader' ? 0.08 : this.traitOf(p) === 'free' ? -0.08 : 0), 0.15, 0.85);
    const tradeNow = () => { const off = this._offerFor ? this._offerFor(p, rngFor(S.seed, S.year, d, 9300 + (parseInt(String(p.id).slice(1)) || 0))) : null; if (!off) return false; const ev = this.executeTrade(off.t, [p.id], [off.y.id]); if (!ev.ok) return false; delete p.unrest; delete p.grv; p.unrestCool = d + 90; this._unrestLog(p, t, `${p.ko}의 요청을 받아들여 ${KO0[off.t]}와 트레이드했습니다(${off.y.ko} 영입)`, 3); return true; };
    if (stage === 'meeting') {
      if (k === 'talk') { if (talk(0.35)) { down(30); adj(2); this._unrestCool(p, d, 45); return `${p.ko}과(와) 면담으로 불만을 풀었습니다(불만 −30, 충성도 +2).`; } up(6); adj(-1); delete p.unrest; p.unrestCool = d + 12; return `면담이 겉돌았습니다(불만 +6, 충성도 −1).`; }
      if (k === 'play') { let ok = true; if (!p.active && !this.isInj(p)) ok = !this.moveActive(p.id, true); if (ok) { down(25); adj(1); this._unrestCool(p, d, 45); return `${p.ko}에게 출전 기회를 주기로 했습니다(불만 −25, 충성도 +1).`; } up(3); delete p.unrest; p.unrestCool = d + 12; return `지금은 1군에 올릴 수 없어 기회를 약속하지 못했습니다(불만 +3).`; }
      if (k === 'raise') { cost(0.3); down(15); adj(3); this._unrestCool(p, d, 45); return `대우 개선을 약속했습니다(불만 −15, 충성도 +3, 0.3억).`; }
      up(5); delete p.unrest; p.unrestCool = d + 12; return `그대로 두었습니다(불만 +5).`;
    }
    if (stage === 'request') {
      if (k === 'trade') { if (tradeNow()) return `요청을 받아들여 트레이드를 성사시켰습니다.`; down(10); p.unrest = { stage: 'refused', since: d, y: S.year }; return `조건에 맞는 맞교환 상대를 찾지 못했습니다(불만 −10). 이적 요청은 보류 상태입니다.`; }
      if (k === 'talk') { if (talk(0.25)) { down(35); adj(2); this._unrestCool(p, d, 60); return `${p.ko}을(를) 설득했습니다(불만 −35, 충성도 +2).`; } up(8); p.unrest = { stage: 'refused', since: d, y: S.year }; adj(-2); return `설득이 통하지 않았습니다(불만 +8, 충성도 −2).`; }
      adj(-3); p.mood = { v: -1, until: d + 10 }; p.unrest = { stage: 'refused', since: d, y: S.year }; this.invalidate(); return `이적 요청을 거부했습니다(충성도 −3). 불만이 풀리지 않으면 태업으로 번질 수 있습니다.`;
    }
    if (stage === 'slack') {
      if (k === 'meet') { if (talk(0.2)) { down(30); this._unrestCool(p, d, 60); this._unrestLog(p, t, `${p.ko}이(가) 감독 면담 뒤 태업을 풀었습니다`, 2); return `감독 면담으로 ${p.ko}의 태업을 풀었습니다(불만 −30).`; } up(5); return `면담이 통하지 않았습니다(불만 +5).`; }
      if (k === 'bench') { p.active = false; p.lockUntil = d + 10; up(8); adj(-2); if (this._injAutoFix && this.injAuto() !== 'off') this._injAutoFix([p], []); this.repairSettings(t); this.invalidate(); return `${p.ko}을(를) 2군으로 내려 징계했습니다(불만 +8, 충성도 −2).`; }
      if (k === 'trade') { if (tradeNow()) return `맞교환 트레이드로 ${p.ko}을(를) 내보냈습니다.`; return `조건에 맞는 맞교환 상대를 찾지 못했습니다.`; }
      return `그대로 두었습니다(컨디션 −3 지속).`;
    }
    if (stage === 'awol') {
      if (k === 'notice') { u.stage = 'notice'; u.since = d; return `${p.ko}에게 14일 시정 촉구서를 보냈습니다(규약상 계약 해지의 전 단계).`; }
      if (k === 'restrict') { p.unrest = { stage: 'restr', since: d, min: 20, kind: '제한선수', y: S.year }; return `${p.ko}을(를) 제한선수로 지정 요청했습니다(최소 20일, 정지 기간 연봉 1/300 감액).`; }
      if (k === 'suspend') { p.unrest = { stage: 'restr', since: d, min: 30, kind: '자격정지선수', y: S.year }; return `${p.ko}을(를) 자격정지선수로 지정 요청했습니다(최소 30일, 정지 기간 연봉 1/300 감액).`; }
      if (k === 'release') { this._unrestRelease(p, t, `${p.ko}과(와) 14일 시정 촉구 뒤 계약을 해지했습니다(선수 귀책, 총재 승인)`, false); return `${p.ko}의 계약을 해지했습니다(잔여 연봉 미지급).`; }
      this._unrestRelease(p, t, `${p.ko}과(와) 임의해지로 합의했습니다(1년 복귀 제한)`, true); return `${p.ko}과(와) 임의해지로 합의했습니다(연봉 지급 중단, 1년 복귀 제한).`;
    }
    if (stage === 'return') {
      if (k === 'allow') { this._unrestReturn(p, t, d, `${u.kind} 해제`); return `${p.ko}의 복귀를 허가했습니다.`; }
      if (k === 'release') { this._unrestRelease(p, t, `${p.ko}의 ${u.kind} 뒤 계약을 해지했습니다(선수 귀책)`, false); return `${p.ko}의 계약을 해지했습니다.`; }
      u.min = (u.min || 20) + 14; u.asked = false; up(3); return `${p.ko}의 정지를 14일 연장했습니다.`;
    }
    return '';
  };
  proto._unrestResolve = function (e, k) {
    const S = this.S, p = S.players[e.data.pid], t = S.userTeam; if (!p || p.team !== t || !p.unrest) return '이미 정리된 일입니다.';
    return this._unrestApply(p, t, k, e.data.stage);
  };
  /* ---- 화면용 ---- */
  proto.unrestInfo = function (t) {
    t = t || this.S.userTeam; return this._unrestPlayers(t).filter(p => (p.grv || 0) >= 30 || p.unrest).map(p => ({ id: p.id, ko: p.ko, v: Math.round(p.grv || 0), stage: p.unrest ? p.unrest.stage : (p.grv >= TH.grumble ? 'grumble' : ''), kind: p.unrest && p.unrest.kind || '', cause: cause(this, p, t) })).sort((a, b) => b.v - a.v);
  };
  proto._unrestRollover = function () { for (const p of Object.values(this.S.players)) { if (p.unrest) { if (p.unrest.stage === 'meeting') delete p.unrest; else p.unrest.since = 0; } delete p.unrestCool; if (p.grv) p.grv = r1(p.grv * 0.5); if (!p.grv) delete p.grv; } };   // 시즌이 바뀌면 불만의 절반이 가라앉는다
});
