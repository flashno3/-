/* 스토리 아크: 단계가 이어지고, 내 선택에 따라 분기하며, 결과가 선수에게 기억으로 남는 이어지는 이야기.
 * S.arcs = { seq, last, list: [{ id, kind, title, status:'active'|'done', y, d0, stage, wait, ev, pid, pid2, mem, log:[{y,d,t}], end }] }
 * 각 단계는 (1) 이벤트(내가 고름) 또는 (2) 자동 진행(결과 소식)으로 이어지고, 선택은 컨디션·충성도·유대·휴식 부상 위험 같은 기존 값에만 작게 반영된다 — 경기 엔진·재정 계산은 건드리지 않는다.
 * 소재는 게임 안에서 일어난 사실(선수·기록·부상)뿐이며 실제 인물·사건을 지어내지 않는다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TRAITS, news } = LG.OFFC;
  const MAX_ACTIVE = 2, MIN_GAP = 12;
  proto.arcs = function () { const S = this.S; return S.arcs = S.arcs || { seq: 0, last: -99, list: [] }; };
  proto.arcById = function (id) { return this.arcs().list.find(a => a.id === id); };
  proto.arcsActive = function () { return this.arcs().list.filter(a => a.status === 'active'); };
  const mood = (L, p, v, days) => { p.mood = { v, until: L.S.day + days }; L.invalidate(); }, adj = (p, v) => { p.loyAdj = clamp((p.loyAdj || 0) + v, -15, 15); };
  const P = (L, id) => L.S.players[id];
  /* 최근 경기 폼 점수(화면의 ▲▼와 같은 식): 타자 OPS, 투수 RA9 기준 −3~+3 */
  proto._arcForm = function (p) {
    const r = (this.S.recent[p.id] || []); if (!r.length) return null;
    if (p.type === 'B') { let ab = 0, h = 0, tb = 0, bb = 0; for (const e of r) { ab += e[1]; h += e[2]; tb += e[3]; bb += e[4]; } const ops = ab + bb ? (h + bb) / (ab + bb) + (ab ? tb / ab : 0) : 0; return ab >= 15 ? clamp((ops - 0.72) * 12, -3, 3) : null; }
    let o = 0, R = 0; for (const e of r) { o += e[1]; R += e[2]; } const ra9 = o ? R * 27 / o : 0; return o >= 9 ? clamp((4.8 - ra9) * 0.8, -3, 3) : null;
  };
  proto._arcInjure = function (p, days, dx, arcId) {
    const S = this.S, now = this.todayN(), retN = now + days, rd = new Date(retN * 864e5), sd = new Date(now * 864e5);
    p.inj = { dx, since: `${S.year}-${String(sd.getUTCMonth() + 1).padStart(2, '0')}-${String(sd.getUTCDate()).padStart(2, '0')} 발생`, ret: rd.toISOString().slice(0, 10), retN, basis: '이야기 진행(스토리 아크)', apply: true, generated: true, arc: arcId };
    p.active = false; delete p.lockUntil; this.repairSettings(S.userTeam); this.invalidate();
  };
  proto._arcLog = function (a, text, imp) { const S = this.S; a.log.push({ y: S.year, d: S.day, t: text }); this.story('arc', `[${a.title}] ${text}`, imp || 2); news(this, `[이야기] ${a.title}: ${text}`); };
  proto._arcEvent = function (a, o) {
    const e = this._evAdd({ type: 'arc', title: `📖 ${a.title} — ${o.title}`, ttl: o.ttl || 7, def: o.def, rec: o.rec, data: { arc: a.id, stage: a.stage }, text: o.text, choices: o.choices }); a.ev = e.id; a.wait = null; return e;
  };
  proto._arcGo = function (a, stage, days) { a.stage = stage; a.wait = this.S.day + Math.max(1, days); a.ev = null; };
  proto._arcEnd = function (a, text, tone) { a.status = 'done'; a.end = { y: this.S.year, d: this.S.day, tone: tone || 'ok', text }; a.wait = null; a.ev = null; this._arcLog(a, text, 3); };

  /* ================= 정의 ================= */
  const DEFS = {
    /* ---- 1) 에이스의 팔꿈치(부상 아크) ---- */
    ace: {
      title: '에이스의 팔꿈치', steps: 3,
      can(L) { const t = L.S.userTeam, sp = L.players(t).filter(p => p.active && p.type === 'P' && p.role === 'SP' && !L.isInj(p)).sort((a, b) => L.ovr(b) - L.ovr(a)).slice(0, 2); const p = sp[Math.floor(rngFor(L.S.seed, L.S.year, L.S.day, 9190).random() * sp.length)]; return p ? { pid: p.id } : null; },
      start(L, a) { L._arcGo(a, 'pain', 0); a.wait = L.S.day; },
      stages: {
        pain: {
          enter(L, a) {
            const p = P(L, a.pid), part = rngFor(L.S.seed, L.S.year, L.S.day, 9191).random() < 0.5 ? '팔꿈치' : '어깨';
            a.mem.part = part; L._arcLog(a, `${p.ko}(OVR ${L.ovr(p)})이 등판 뒤 ${part} 불편함을 호소했습니다.`);
            L._arcEvent(a, { title: '통증 호소', ttl: 6, def: 'rest', rec: 'rest', text: `${p.ko}이(가) ${part} 불편함을 느낀다며 말을 아꼈습니다. 이번 로테이션을 어떻게 할까요? 선택에 따라 이후 이야기가 달라집니다.`, choices: [
              { k: 'rush', label: '그대로 등판 강행', hint: '정상 등판 · 며칠 뒤 재발 여부 판정(위험 높음)' }, { k: 'rest', label: '2주 휴식 후 복귀', hint: '부상자 명단 14일 · 복귀 뒤 한 번 더 결정' }, { k: 'shut', label: '시즌 아웃급 재활(70일)', hint: '확실히 치료 · 장기 이탈 · 신뢰 크게 ↑' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid); a.mem.choice = k;
            if (k === 'rush') { mood(L, p, 1, 7); adj(p, 0); L._arcGo(a, 'check', 5); return `${p.ko}이(가) ${a.mem.part} 통증을 안고 마운드에 오릅니다. 며칠 뒤 상태를 확인합니다.`; }
            if (k === 'shut') { L._arcInjure(p, 70, `${a.mem.part} 재활(이야기)`, a.id); adj(p, 4); L._arcGo(a, 'return', 70); return `${p.ko}을(를) 70일간 재활시키기로 했습니다. 선수는 감독의 판단을 고맙게 여깁니다(충성도 +4).`; }
            L._arcInjure(p, 14, `${a.mem.part} 통증(이야기)`, a.id); adj(p, 2); L._arcGo(a, 'return', 14); return `${p.ko}을(를) 2주 쉬게 했습니다(충성도 +2). 복귀 시점에 다시 결정합니다.`;
          }
        },
        check: {   // 강행 후 재발 판정(자동)
          enter(L, a) {
            const p = P(L, a.pid), r = rngFor(L.S.seed, L.S.year, L.S.day, 9192).random();
            if (r < 0.42) { L._arcInjure(p, 45, `${a.mem.part} 손상(무리한 등판 후 재발)`, a.id); adj(p, -3); a.mem.relapse = true; L._arcLog(a, `무리한 등판의 대가로 ${p.ko}이(가) ${a.mem.part}을 다쳤습니다(약 45일). 선수와의 신뢰가 흔들립니다(충성도 −3).`); L._arcGo(a, 'return', 45); }
            else { mood(L, p, 1, 14); L._arcEnd(a, `${p.ko}이(가) 아슬아슬하게 버텨 냈습니다. 통증은 가라앉았고 팀은 한숨을 돌렸습니다(컨디션 +1, 14일).`, 'ok'); P(L, a.pid).arcMem = Object.assign(p.arcMem || {}, { ace: { choice: 'rush', relapse: false, y: L.S.year } }); }
          },
          resolve() { return ''; }
        },
        return: {
          enter(L, a) {
            const p = P(L, a.pid); L._arcLog(a, `${p.ko}이(가) 복귀 준비를 마쳤습니다.${a.mem.relapse ? ' 한 번 다친 만큼 조심스럽게 다뤄야 합니다.' : ''}`);
            L._arcEvent(a, { title: '복귀 계획', ttl: 8, def: 'step', rec: 'minor', text: `${p.ko}이(가) 복귀할 수 있습니다. 어떻게 복귀시킬까요?${a.mem.choice === 'shut' ? ' 충분히 쉰 만큼 몸 상태는 좋습니다.' : ''}`, choices: [
              { k: 'full', label: '선발로 바로 복귀', hint: '컨디션 +1 · 재발 위험 15%' }, { k: 'step', label: '불펜·짧은 이닝으로 단계 복귀', hint: '안전 · 컨디션 보통' }, { k: 'minor', label: '2군 재활 등판 뒤 복귀', hint: '컨디션 +2(20일) · 복귀가 조금 늦음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), r = rngFor(L.S.seed, L.S.year, L.S.day, 9193).random(); let txt, tone = 'ok';
            if (k === 'full') { if (r < 0.15) { L._arcInjure(p, 21, `${a.mem.part} 재발(이야기)`, a.id); adj(p, -2); tone = 'bad'; txt = `서두른 복귀가 화근이 되어 ${p.ko}이(가) 다시 다쳤습니다(약 21일, 충성도 −2).`; } else { mood(L, p, 1, 20); txt = `${p.ko}이(가) 선발로 무사히 복귀했습니다(컨디션 +1, 20일).`; } }
            else if (k === 'minor') { mood(L, p, 2, 20); adj(p, 1); txt = `${p.ko}이(가) 2군에서 감각을 되찾고 돌아옵니다(컨디션 +2, 20일, 충성도 +1).`; }
            else { mood(L, p, 0, 10); txt = `${p.ko}이(가) 짧은 이닝부터 차근차근 복귀합니다.`; }
            p.arcMem = Object.assign(p.arcMem || {}, { ace: { choice: a.mem.choice, ret: k, relapse: !!a.mem.relapse || tone === 'bad', y: L.S.year } });
            L.note(p, `이야기 「${a.title}」: ${a.mem.choice === 'rush' ? '강행' : a.mem.choice === 'shut' ? '장기 재활' : '휴식'} → ${k === 'full' ? '즉시 복귀' : k === 'minor' ? '2군 재활 후 복귀' : '단계 복귀'}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    },
    /* ---- 2) 배터리의 갈등(라커룸 아크) ---- */
    battery: {
      title: '배터리의 갈등', steps: 3,
      can(L) {
        const t = L.S.userTeam, set = L.S.teams[t].set, cs = L.players(t).filter(p => p.active && p.pos === 'C' && !L.isInj(p)).sort((a, b) => L.ovr(b) - L.ovr(a)); const c = cs[0]; if (!c) return null;
        const sp = (set.rotation || []).slice(0, 4).map(id => P(L, id)).filter(p => p && p.active && !L.isInj(p)), p = sp[Math.floor(rngFor(L.S.seed, L.S.year, L.S.day, 9210).random() * sp.length)]; return p ? { pid: p.id, pid2: c.id } : null;
      },
      start(L, a) { L._arcGo(a, 'spat', 0); a.wait = L.S.day; },
      stages: {
        spat: {
          enter(L, a) {
            const p = P(L, a.pid), c = P(L, a.pid2); L._arcLog(a, `${p.ko}이(가) ${c.ko}의 리드를 두고 불만을 터뜨렸습니다.`);
            L._arcEvent(a, { title: '리드 논쟁', ttl: 7, def: 'wait', rec: 'talk', text: `${p.ko}(${TRAITS[L.traitOf(p)] || '-'})이(가) 등판 뒤 "${c.ko}의 볼 배합이 맞지 않는다"며 불만을 드러냈습니다. ${c.ko}(${TRAITS[L.traitOf(c)] || '-'})도 물러서지 않습니다.`, choices: [
              { k: 'catcher', label: `${c.ko} 편들기`, hint: `${c.ko} 컨디션 +1 · ${p.ko} −1` }, { k: 'pitcher', label: `${p.ko} 편들기`, hint: `${p.ko} 컨디션 +1 · ${c.ko} −1` }, { k: 'talk', label: '두 선수 함께 면담(중재)', hint: '성공하면 유대 ↑ · 실패하면 둘 다 −1' }, { k: 'wait', label: '지켜본다', hint: '시간이 지나면 더 커질 수 있음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), c = P(L, a.pid2); a.mem.side = k;
            if (k === 'catcher') { mood(L, c, 1, 14); mood(L, p, -1, 14); adj(p, -2); L._arcGo(a, 'after', 10); return `${c.ko}의 손을 들어 줬습니다. ${p.ko}은(는) 서운해합니다(충성도 −2). 열흘 뒤 분위기를 살핍니다.`; }
            if (k === 'pitcher') { mood(L, p, 1, 14); mood(L, c, -1, 14); adj(c, -2); L._arcGo(a, 'after', 10); return `${p.ko}의 의견을 받아들였습니다. ${c.ko}은(는) 자존심이 상했습니다(충성도 −2). 열흘 뒤 분위기를 살핍니다.`; }
            if (k === 'talk') {
              const lead = (L.traitOf(p) === 'leader' || L.traitOf(c) === 'leader') ? 0.1 : 0, pr = clamp(0.55 + lead + (L.loyalty(p) ? L.loyalty(p).v : 40) / 400, 0.3, 0.8);
              if (rngFor(L.S.seed, L.S.year, L.S.day, 9211).random() < pr) { mood(L, p, 1, 14); mood(L, c, 1, 14); L._bondShift && L._bondShift(p, 1, '갈등 해소'); L._arcEnd(a, `면담이 통했습니다. ${p.ko}과(와) ${c.ko}이(가) 서로의 방식을 맞춰 보기로 했습니다(둘 다 컨디션 +1, 유대 ↑).`, 'ok'); return a.end.text; }
              mood(L, p, -1, 10); mood(L, c, -1, 10); L._arcGo(a, 'after', 7); return `면담이 겉돌았습니다. 둘 다 표정이 굳었습니다(컨디션 −1, 10일). 일주일 뒤 다시 살핍니다.`;
            }
            L._arcGo(a, 'blow', 9); return `일단 지켜보기로 했습니다. 불씨가 남은 채로 시간이 흐릅니다.`;
          }
        },
        after: {
          enter(L, a) {
            const p = P(L, a.pid), c = P(L, a.pid2); L._arcLog(a, `${p.ko}과(와) ${c.ko} 사이의 냉기는 아직 완전히 가시지 않았습니다.`);
            L._arcEvent(a, { title: '다시 한 번', ttl: 8, def: 'let', rec: 'dinner', text: `갈등의 여진이 남아 있습니다. 배터리를 어떻게 정리할까요?`, choices: [
              { k: 'rotate', label: '백업 포수로 번갈아 기용', hint: `${p.ko} 컨디션 +2(14일) · ${c.ko} −1` }, { k: 'dinner', label: '선수단 회식·모임 마련(0.2억)', hint: '팀 컨디션 +1(10일) · 60% 확률로 유대 ↑' }, { k: 'let', label: '그대로 둔다', hint: '50% 확률로 불만이 다시 터짐' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), c = P(L, a.pid2), f = L.S.fin && L.S.fin.teams[L.S.userTeam], r = rngFor(L.S.seed, L.S.year, L.S.day, 9212).random();
            if (k === 'rotate') { mood(L, p, 2, 14); mood(L, c, -1, 14); L._arcEnd(a, `백업 포수를 섞어 쓰자 ${p.ko}의 표정이 밝아졌습니다. ${c.ko}은(는) 입맛이 씁니다.`, 'mixed'); return a.end.text; }
            if (k === 'dinner') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.2) * 10) / 10; L.S.teamMood = { v: 1, until: L.S.day + 10 }; L.invalidate(); if (r < 0.6) { L._bondShift && L._bondShift(p, 1, '회식'); L._arcEnd(a, `회식 자리에서 ${p.ko}과(와) ${c.ko}이(가) 술잔을 부딪쳤습니다. 라커룸 분위기가 풀렸습니다(팀 컨디션 +1, 유대 ↑).`, 'ok'); } else L._arcEnd(a, `회식으로 분위기는 풀렸지만 둘의 앙금은 남았습니다(팀 컨디션 +1).`, 'mixed'); return a.end.text; }
            if (r < 0.5) { L._arcGo(a, 'blow', 6); return '그대로 두었습니다. 그런데 불씨가 다시 살아납니다…'; }
            L._arcEnd(a, `그대로 두었는데 다행히 시간이 해결해 주었습니다.`, 'mixed'); return a.end.text;
          }
        },
        blow: {
          enter(L, a) {
            const who = a.mem.side === 'catcher' ? P(L, a.pid) : a.mem.side === 'pitcher' ? P(L, a.pid2) : (rngFor(L.S.seed, L.S.year, L.S.day, 9213).random() < 0.5 ? P(L, a.pid) : P(L, a.pid2)); a.mem.who = who.id;
            L._arcLog(a, `${who.ko}의 불만이 끝내 터졌습니다. 구단에 이적을 요청했다는 이야기가 돕니다.`, 3);
            L._arcEvent(a, { title: '터져 버린 불만', ttl: 8, def: 'stand', rec: 'meet', text: `${who.ko}이(가) 더는 같이 못 하겠다며 이적을 요청했습니다. 어떻게 대응할까요?`, choices: [
              { k: 'meet', label: '감독이 직접 면담', hint: '60% 확률로 진정(충성도 +2) · 실패하면 −3' }, { k: 'market', label: '트레이드 시장에 내놓는다', hint: '불만 해소(충성도 +3) · 대신 신뢰 일부 상실' }, { k: 'stand', label: '버티게 한다', hint: '충성도 −5(FA·재계약에 영향)' }] });
          },
          resolve(L, a, k) {
            const w = P(L, a.mem.who), r = rngFor(L.S.seed, L.S.year, L.S.day, 9214).random(); let txt, tone = 'bad';
            if (k === 'meet') { if (r < 0.6) { adj(w, 2); mood(L, w, 1, 14); tone = 'ok'; txt = `감독의 면담에 ${w.ko}이(가) 마음을 돌렸습니다(충성도 +2).`; } else { adj(w, -3); mood(L, w, -1, 20); txt = `면담에도 ${w.ko}의 마음은 돌아서지 않았습니다(충성도 −3).`; } }
            else if (k === 'market') { adj(w, 3); tone = 'mixed'; L._bondShift && L._bondShift(w, -1, '이적 요청'); txt = `${w.ko}을(를) 트레이드 시장에 내놓기로 했습니다(충성도 +3). 팀 분위기는 어수선합니다.`; }
            else { adj(w, -5); mood(L, w, -1, 30); txt = `${w.ko}을(를) 버티게 했습니다. 선수의 마음이 크게 식었습니다(충성도 −5).`; }
            w.arcMem = Object.assign(w.arcMem || {}, { battery: { result: k, tone, y: L.S.year } }); L.note(w, `이야기 「${a.title}」: ${k === 'meet' ? '직접 면담' : k === 'market' ? '이적 요청 수용' : '버티기'}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    },
    /* ---- 3) 떠오르는 유망주(성장 아크) ---- */
    prospect: {
      title: '떠오르는 유망주', steps: 3,
      can(L) {
        const t = L.S.userTeam, c = L.players(t).filter(p => !p.active && !L.isInj(p) && !p.foreign && p.age <= 24).map(p => ({ p, f: L._arcForm(p) })).filter(x => x.f !== null && x.f >= 1.2).sort((a, b) => b.f - a.f)[0];
        return c ? { pid: c.p.id } : null;
      },
      start(L, a) { L._arcGo(a, 'buzz', 0); a.wait = L.S.day; },
      stages: {
        buzz: {
          enter(L, a) {
            const p = P(L, a.pid), f = L._arcForm(p) || 0; a.mem.f0 = f; L._arcLog(a, `2군의 ${p.ko}(${p.age}세, OVR ${L.ovr(p)})이 최근 경기에서 눈에 띄는 활약을 펼치고 있습니다.`);
            L._arcEvent(a, { title: '2군의 신예', ttl: 9, def: 'wait', rec: 'callup', text: `${p.ko}${p.rookie === L.S.year ? '(올해 입단 신인)' : ''}이(가) 2군에서 좋은 흐름을 이어 갑니다. 팬과 언론의 관심도 커졌습니다. 어떻게 할까요?`, choices: [
              { k: 'callup', label: '1군으로 콜업', hint: '같은 유형 가장 약한 1군 선수와 교체 · 컨디션 +1(10일)' }, { k: 'mentor', label: '베테랑 멘토를 붙여 지켜본다(0.3억)', hint: '60% 확률로 컨디션 +2(20일)' }, { k: 'wait', label: '2군에서 더 지켜본다', hint: '3주 뒤 다시 평가' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), f = L.S.fin && L.S.fin.teams[L.S.userTeam]; a.mem.choice = k;
            if (k === 'callup') {
              const dn = L.downCandidates(p.id).filter(c => !c.block)[0], err = dn ? L.swapActive(p.id, dn.p.id) : L.moveActive(p.id, true);
              if (err) { L._arcGo(a, 'review', 21); a.mem.choice = 'wait'; return `콜업이 어렵습니다(${err}). 2군에서 더 지켜봅니다.`; }
              mood(L, p, 1, 10); L._arcGo(a, 'review', 18); return `${p.ko}을(를) 1군에 올렸습니다${dn ? '(' + dn.p.ko + ' 2군행)' : ''}. 프로 무대에서 어떤 모습을 보일까요?`;
            }
            if (k === 'mentor') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; if (rngFor(L.S.seed, L.S.year, L.S.day, 9230).random() < 0.6) { mood(L, p, 2, 20); L._arcGo(a, 'review', 21); return `멘토의 조언이 효과를 봤습니다(${p.ko} 컨디션 +2, 20일).`; } L._arcGo(a, 'review', 21); return `멘토링은 큰 변화가 없었습니다. 3주 뒤 다시 평가합니다.`; }
            L._arcGo(a, 'review', 21); return `2군에서 더 지켜보기로 했습니다.`;
          }
        },
        review: {
          enter(L, a) {
            const p = P(L, a.pid), f = L._arcForm(p), good = f !== null && f >= 0.8, bad = f !== null && f <= -0.8; a.mem.f1 = f;
            if (!p || p.team !== L.S.userTeam) { L._arcEnd(a, `${p ? p.ko : '유망주'}은(는) 팀을 떠났고 이야기는 거기서 끝났습니다.`, 'mixed'); return; }
            const where = p.active ? '1군' : '2군';
            if (good) { L._arcLog(a, `${p.ko}이(가) ${where}에서도 계속 좋은 모습을 이어 갑니다.`); L._arcEvent(a, { title: '그 기세 그대로', ttl: 9, def: 'keep', rec: 'keep', text: `${p.ko}의 상승세가 이어집니다.${p.rookie === L.S.year ? ' 신인왕 레이스 이야기까지 나옵니다.' : ''} 어떻게 이끌까요?`, choices: [{ k: 'keep', label: '계속 기회를 준다', hint: '컨디션 +1(14일) · 성장 서사 이어짐' }, { k: 'manage', label: '체력 관리를 위해 쉬게 한다', hint: '휴식 · 무리하지 않음' }] }); a.mem.tone = 'good'; }
            else { L._arcLog(a, `${p.ko}${bad ? '이(가) 기대에 못 미쳐 부담을 느끼는 모습입니다.' : '의 활약은 평범한 수준에 머물렀습니다.'}`); L._arcEvent(a, { title: '기대와 부담 사이', ttl: 9, def: 'trust', rec: 'trust', text: `${p.ko}${bad ? '이(가) 부진합니다. 어려 보이는 얼굴에 부담이 역력합니다.' : '의 기세가 한풀 꺾였습니다.'} 어떻게 할까요?`, choices: [{ k: 'trust', label: '믿고 계속 기용', hint: '50% 확률로 컨디션 +1 · 아니면 −1' }, { k: 'reset', label: '2군에서 재정비', hint: '컨디션 +2(20일) · 서사는 천천히' }] }); a.mem.tone = 'bad'; }
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), r = rngFor(L.S.seed, L.S.year, L.S.day, 9231).random(); let txt, tone = 'ok';
            if (a.mem.tone === 'good') { if (k === 'keep') { mood(L, p, 1, 14); txt = `${p.ko}이(가) 기회를 살려 팀의 새 얼굴로 자리 잡아 갑니다.`; } else { mood(L, p, 0, 10); txt = `${p.ko}에게 휴식을 주며 길게 보기로 했습니다. 서두르지 않는 육성입니다.`; tone = 'mixed'; } }
            else if (k === 'trust') { if (r < 0.5) { mood(L, p, 1, 14); txt = `믿어 준 보람이 있었습니다. ${p.ko}이(가) 조금씩 감을 되찾습니다(컨디션 +1).`; } else { mood(L, p, -1, 14); tone = 'bad'; txt = `기용을 이어 갔지만 ${p.ko}의 부진이 길어집니다(컨디션 −1). 좋은 경험으로 남기를 바랄 뿐입니다.`; } }
            else { mood(L, p, 2, 20); tone = 'mixed'; txt = `${p.ko}을(를) 2군에서 재정비시킵니다(컨디션 +2, 20일). 성장은 조금 천천히 가는 걸로.`; if (p.active) L.moveActive(p.id, false); }
            p.arcMem = Object.assign(p.arcMem || {}, { rising: { choice: a.mem.choice, tone: a.mem.tone, y: L.S.year } }); L.note(p, `이야기 「${a.title}」: ${a.mem.choice === 'callup' ? '1군 콜업' : a.mem.choice === 'mentor' ? '멘토링' : '2군 관찰'} → ${a.mem.tone === 'good' ? '상승세' : '난관'}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    }
  };
  proto._arcDefs = function () { return DEFS; };
  /* ================= 진행 ================= */
  proto.arcStart = function (kind, force) {
    const S = this.S, def = DEFS[kind], A = this.arcs(); if (!def) return null; const ctx = def.can(this); if (!ctx) return null;
    const a = { id: 'A' + (++A.seq), kind, title: def.title, status: 'active', y: S.year, d0: S.day, stage: null, wait: null, ev: null, pid: ctx.pid, pid2: ctx.pid2, mem: {}, log: [] }; A.list.unshift(a); A.last = S.day;
    if (A.list.length > 40) A.list.length = 40; def.start(this, a); return a;
  };
  proto._arcDay = function (d) {
    const S = this.S; if (S.phase !== 'regular') return; const A = this.arcs();
    for (const a of A.list.filter(x => x.status === 'active')) {   // 대기 중인 단계 진입
      const pa = P(this, a.pid), pb = a.pid2 ? P(this, a.pid2) : null;
      if (!pa || pa.team !== S.userTeam || (a.pid2 && (!pb || pb.team !== S.userTeam))) { this._arcEnd(a, `${!pa || pa.team !== S.userTeam ? (pa ? pa.ko : '선수') : pb.ko}이(가) 팀을 떠나면서 이야기는 거기서 막을 내렸습니다.`, 'mixed'); continue; }
      if (a.ev) { const ev = this.eventsOpen().find(e => e.id === a.ev); if (!ev) { a.ev = null; a.wait = d + 3; } }   // 이벤트가 외부 요인으로 종결되면 단계를 다시 연다
      if (a.wait !== null && a.wait !== undefined && d >= a.wait && !a.ev) { const st = DEFS[a.kind].stages[a.stage]; if (st) st.enter(this, a); }
    }
    const act = A.list.filter(x => x.status === 'active');
    if (act.length >= MAX_ACTIVE || d < 14 || d > 118 || d - A.last < MIN_GAP) return;
    const r = rngFor(S.seed, S.year, d, 9100); if (r.random() > 0.07) return;
    const kinds = Object.keys(DEFS).filter(k => !A.list.some(x => x.kind === k && x.y === S.year)).sort(() => r.random() - 0.5);   // 한 시즌에 같은 이야기는 한 번
    for (const k of kinds) if (this.arcStart(k)) return;
  };
  proto._arcResolve = function (e, k, auto) {
    const a = this.arcById(e.data.arc); if (!a || a.status !== 'active') return '이야기가 이미 끝났습니다.';
    const def = DEFS[a.kind], st = def.stages[a.stage]; if (!st) return ''; a.ev = null; const msg = st.resolve(this, a, k, auto);
    if (msg) a.log.push({ y: this.S.year, d: this.S.day, t: msg }); return msg;
  };
  proto._arcRollover = function () {   // 시즌이 바뀌어도 이야기는 이어진다: 대기 중인 단계는 다음 시즌 초에 진입
    for (const a of this.arcsActive()) { if (!a.ev) a.wait = 10; a.log.push({ y: this.S.year, d: 0, t: '시즌이 끝나고, 이야기는 다음 시즌으로 이어집니다.' }); }
  };
  proto.arcSummary = function () {
    const out = []; for (const a of this.arcs().list) { const p = P(this, a.pid), p2 = a.pid2 ? P(this, a.pid2) : null; out.push({ id: a.id, kind: a.kind, title: a.title, status: a.status, y: a.y, steps: DEFS[a.kind].steps, stage: a.stage, who: [p && p.ko, p2 && p2.ko].filter(Boolean).join(' · '), pid: a.pid, log: a.log.slice(), end: a.end || null, waiting: a.ev ? 'decide' : a.wait !== null && a.wait !== undefined ? 'wait' : '', days: a.wait !== null && a.wait !== undefined ? Math.max(0, a.wait - this.S.day) : null, progress: a.status === 'done' ? DEFS[a.kind].steps : Math.min(DEFS[a.kind].steps - 1, Object.keys(DEFS[a.kind].stages).indexOf(a.stage)) }); }
    return out;
  };
});
