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
    p.active = false; delete p.lockUntil; if (this._injAutoFix && this.injAuto() !== 'off') this._injAutoFix([p], []); this.repairSettings(S.userTeam); this.invalidate();
  };
  proto._arcLog = function (a, text, imp) { const S = this.S; a.log.push({ y: S.year, d: S.day, t: text }); this.story('arc', `[${a.title}] ${text}`, imp || 2); news(this, `[이야기] ${a.title}: ${text}`); };
  proto._arcEvent = function (a, o) {
    const e = this._evAdd({ type: 'arc', title: `📖 ${a.title} — ${o.title}`, ttl: o.ttl || 7, def: o.def, rec: o.rec, data: { arc: a.id, stage: a.stage }, text: o.text, choices: o.choices }); a.ev = e.id; a.wait = null; return e;
  };
  proto._arcGo = function (a, stage, days) { a.stage = stage; a.wait = this.S.day + Math.max(1, days); a.ev = null; };
  proto._arcEnd = function (a, text, tone) { a.status = 'done'; a.end = { y: this.S.year, d: this.S.day, tone: tone || 'ok', text }; a.wait = null; a.ev = null; this._arcLog(a, text, 3); };

  /* ================= 공통 도구 ================= */
  const pct = x => Math.round(x * 100) + '%';
  const voice = (L, p, m) => { const t = L.traitOf(p); return m[t] || m.def; };
  const addLoy = (L, p, key, v, text) => { if (!p) return; p.arcLoy = (p.arcLoy || []).filter(x => !(x.k === key && x.y === L.S.year && x.t === text)); p.arcLoy.push({ k: key, v, t: text, y: L.S.year }); };   // 재계약·FA 협상의 충성도에 몇 년간 반영(off_contract.loyalty)
  const pickMentor = (L, p) => L.players(L.S.userTeam).filter(x => x.id !== p.id && x.type === p.type && x.age >= 31 && !x.foreign).sort((a, b) => (b.pos === p.pos) - (a.pos === p.pos) || L.ovr(b) - L.ovr(a))[0] || null;

  /* ================= 정의 ================= */
  const SEV = {
    light: { label: '가벼운 염증 소견', rush: 0.2, rest: 12, shut: 40, relapse: 25 },
    mid: { label: '인대 부분 손상 의심', rush: 0.45, rest: 21, shut: 60, relapse: 45 },
    heavy: { label: '인대 손상 가능성 높음(수술 권유)', rush: 0.75, rest: 30, shut: 90, relapse: 80 }
  };
  const DEFS = {
    /* ---- 1) 에이스의 팔꿈치 ---- */
    ace: {
      title: '에이스의 팔꿈치', steps: 3,
      can(L) { const t = L.S.userTeam, sp = L.players(t).filter(p => p.active && p.type === 'P' && p.role === 'SP' && !L.isInj(p)).sort((a, b) => L.ovr(b) - L.ovr(a)).slice(0, 2); const p = sp[Math.floor(rngFor(L.S.seed, L.S.year, L.S.day, 9190).random() * sp.length)]; return p ? { pid: p.id } : null; },
      start(L, a) { L._arcGo(a, 'pain', 0); a.wait = L.S.day; },
      stages: {
        pain: {
          enter(L, a) {
            const p = P(L, a.pid), r = rngFor(L.S.seed, L.S.year, L.S.day, 9191), part = r.random() < 0.5 ? '팔꿈치' : '어깨', q = r.random(), sev = q < 0.45 ? 'light' : q < 0.85 ? 'mid' : 'heavy', S_ = SEV[sev];
            a.mem.part = part; a.mem.sev = sev; L._arcLog(a, `${p.ko}(OVR ${L.ovr(p)})이 등판 뒤 ${part} 불편함을 호소했습니다.`);
            const say = voice(L, p, { clutch: '"한 번만 더 던지게 해 주십시오. 지금 빠질 순 없습니다."', shy: '말없이 어깨를 문지르며 시선을 피합니다.', leader: '"팀이 급한 건 압니다. 그래도 제 몸은 제가 제일 잘 압니다."', model: '"트레이너님 소견을 그대로 따르겠습니다."', free: '"뭐, 던지라면 던지죠. 근데 좀 찜찜하긴 합니다."', def: '"조금 불편합니다."' });
            L._arcEvent(a, { title: '통증 호소', ttl: 6, def: sev === 'heavy' ? 'shut' : 'rest', rec: sev === 'heavy' ? 'shut' : sev === 'light' ? 'rest' : 'rest', text: `${p.ko}이(가) ${part} 불편함을 호소했습니다. ${say}\n정밀검사 결과: ${S_.label}. 선택에 따라 이후 이야기와 선수의 마음이 달라집니다.`, choices: [
              { k: 'rush', label: '그대로 등판 강행', hint: `재발 위험 ${pct(S_.rush)} · 재발 시 약 ${S_.relapse}일 이탈 · 넘겨도 컨디션 −1(30일)` }, { k: 'rest', label: `${S_.rest}일 휴식 후 복귀`, hint: `${S_.rest}일 이탈(선발 약 ${Math.ceil(S_.rest / 5)}회 공백) · 복귀 뒤 한 번 더 결정` }, { k: 'shut', label: `${S_.shut}일 본격 재활`, hint: `${S_.shut}일 이탈 · 완치 후 컨디션 +2(60일) · 충성도 +3` }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), S_ = SEV[a.mem.sev]; a.mem.choice = k;
            if (k === 'rush') { mood(L, p, 1, 5); L._arcGo(a, 'check', 5); return `${p.ko}이(가) ${a.mem.part} 통증을 안고 마운드에 오릅니다. 며칠 뒤 상태를 확인합니다.`; }
            if (k === 'shut') { L._arcInjure(p, S_.shut, `${a.mem.part} 본격 재활(이야기)`, a.id); addLoy(L, p, 'ace', 3, '큰 부상 때 감독이 쉬게 해 준 기억'); L._arcGo(a, 'return', S_.shut + 1); return `${p.ko}을(를) ${S_.shut}일간 재활시킵니다. 선수는 감독의 판단을 고맙게 여깁니다(충성도 +3, 재계약에 반영).`; }
            L._arcInjure(p, S_.rest, `${a.mem.part} 통증(이야기)`, a.id); addLoy(L, p, 'ace', 1, '통증 때 쉬게 해 준 기억'); L._arcGo(a, 'return', S_.rest + 1); return `${p.ko}을(를) ${S_.rest}일 쉬게 했습니다(충성도 +1). 복귀 시점에 다시 결정합니다.`;
          }
        },
        check: {
          enter(L, a) {
            const p = P(L, a.pid), S_ = SEV[a.mem.sev], r = rngFor(L.S.seed, L.S.year, L.S.day, 9192).random();
            if (r < S_.rush) { L._arcInjure(p, S_.relapse, `${a.mem.part} 손상(무리한 등판 후 재발)`, a.id); addLoy(L, p, 'ace', -5, '무리한 등판으로 다쳤던 기억'); a.mem.relapse = true; L._arcLog(a, `무리한 등판의 대가로 ${p.ko}이(가) ${a.mem.part}을 다쳤습니다(약 ${S_.relapse}일). 선수와의 신뢰가 크게 흔들립니다(충성도 −5, 재계약에 반영).`); L._arcGo(a, 'return', S_.relapse + 1); }
            else { mood(L, p, -1, 30); addLoy(L, p, 'ace', -1, '통증을 참고 던졌던 기억'); L._arcEnd(a, `${p.ko}이(가) 가까스로 버텨 냈습니다(재발 위험 ${pct(S_.rush)}를 넘김). 다만 후유증으로 컨디션 −1(30일), 마음 한구석엔 응어리가 남았습니다.`, 'mixed'); p.arcMem = Object.assign(p.arcMem || {}, { ace: { choice: 'rush', relapse: false, sev: a.mem.sev, y: L.S.year } }); }
          },
          resolve() { return ''; }
        },
        return: {
          enter(L, a) {
            const p = P(L, a.pid), risk = a.mem.relapse || a.mem.sev === 'heavy' ? 0.25 : 0.12; a.mem.risk = risk; L._arcLog(a, `${p.ko}이(가) 복귀 준비를 마쳤습니다.${a.mem.relapse ? ' 한 번 다친 만큼 조심스럽게 다뤄야 합니다.' : ''}`);
            L._arcEvent(a, { title: '복귀 계획', ttl: 8, def: 'step', rec: a.mem.relapse ? 'minor' : 'step', text: `${p.ko}이(가) 복귀할 수 있습니다. ${voice(L, p, { clutch: '"바로 선발 시켜 주십시오."', shy: '"…감독님 판단에 맡기겠습니다."', leader: '"팀이 원하는 대로 하겠습니다."', model: '"계획대로 하겠습니다."', free: '"빨리 던지고 싶네요."', def: '' })} 어떻게 복귀시킬까요?`, choices: [
              { k: 'full', label: '선발로 바로 복귀', hint: `재발 위험 ${pct(risk)}(재발 시 21일) · 성공하면 컨디션 +2(30일)` }, { k: 'step', label: '불펜·짧은 이닝으로 단계 복귀', hint: '안전 · 컨디션 +1(14일)' }, { k: 'minor', label: '2군 재활 등판 뒤 복귀', hint: '5일 더 걸림 · 컨디션 +2(40일) · 충성도 +1' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), r = rngFor(L.S.seed, L.S.year, L.S.day, 9193).random(); let txt, tone = 'ok', again = false;
            if (k === 'full') { if (r < a.mem.risk) { L._arcInjure(p, 21, `${a.mem.part} 재발(이야기)`, a.id); addLoy(L, p, 'ace', -3, '서두른 복귀로 다시 다쳤던 기억'); tone = 'bad'; again = true; txt = `서두른 복귀가 화근이 되어 ${p.ko}이(가) 다시 다쳤습니다(약 21일, 충성도 −3).`; } else { mood(L, p, 2, 30); txt = `${p.ko}이(가) 선발로 무사히 복귀했습니다(컨디션 +2, 30일).`; } }
            else if (k === 'minor') { L._arcInjure(p, 5, `${a.mem.part} 재활 등판(이야기)`, a.id); mood(L, p, 2, 40); addLoy(L, p, 'ace', 1, '꼼꼼한 재활 관리'); txt = `${p.ko}이(가) 2군에서 감각을 되찾고 돌아옵니다(컨디션 +2, 40일, 충성도 +1).`; }
            else { mood(L, p, 1, 14); txt = `${p.ko}이(가) 짧은 이닝부터 차근차근 복귀합니다(컨디션 +1, 14일).`; }
            p.arcMem = Object.assign(p.arcMem || {}, { ace: { choice: a.mem.choice, sev: a.mem.sev, ret: k, relapse: !!a.mem.relapse || again, y: L.S.year } });
            L.note(p, `이야기 「${a.title}」: ${({ rush: '강행', rest: '휴식', shut: '본격 재활' })[a.mem.choice]} → ${({ full: '즉시 복귀', minor: '2군 재활 후 복귀', step: '단계 복귀' })[k]}${a.mem.relapse || again ? ' (재발 있음)' : ''}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    },
    /* ---- 2) 배터리의 갈등 ---- */
    battery: {
      title: '배터리의 갈등', steps: 3,
      can(L) {
        const t = L.S.userTeam, set = L.S.teams[t].set, cs = L.players(t).filter(p => p.active && p.pos === 'C' && !L.isInj(p)).sort((a, b) => L.ovr(b) - L.ovr(a)), c = cs[0]; if (!c) return null;
        const sp = (set.rotation || []).slice(0, 4).map(id => P(L, id)).filter(p => p && p.active && !L.isInj(p)), p = sp[Math.floor(rngFor(L.S.seed, L.S.year, L.S.day, 9210).random() * sp.length)]; return p ? { pid: p.id, pid2: c.id } : null;
      },
      start(L, a) { L._arcGo(a, 'spat', 0); a.wait = L.S.day; },
      stages: {
        spat: {
          enter(L, a) {
            const p = P(L, a.pid), c = P(L, a.pid2), causes = ['볼배합', '승부구 선택', '투구 템포'], cause = causes[Math.floor(rngFor(L.S.seed, L.S.year, L.S.day, 9215).random() * 3)]; a.mem.cause = cause;
            const lead = (L.traitOf(p) === 'leader' || L.traitOf(c) === 'leader') ? 0.1 : 0, pr = clamp(0.5 + lead + (L.loyalty(p) ? L.loyalty(p).v : 40) / 500, 0.3, 0.8); a.mem.pr = pr;
            const pv = voice(L, p, { clutch: `"위기에서 제 공을 믿어 주질 않잖아요."`, shy: `"…사인이 자꾸 저랑 안 맞아서요."`, leader: `"팀을 위해서 하는 말입니다. ${cause}부터 다시 맞춰야 합니다."`, model: `"기록을 봐도 ${cause}는 바꿔야 합니다."`, free: `"그냥 제가 던지고 싶은 걸 던지면 안 됩니까?"`, def: `"${cause}가 안 맞습니다."` });
            const cv = voice(L, c, { clutch: `"결과가 말해 주잖습니까. 제 리드가 맞았습니다."`, shy: `"…저도 최선을 다했습니다."`, leader: `"투수가 흔들릴 때 잡아 주는 게 제 일입니다."`, model: `"데이터대로 한 겁니다."`, free: `"말로 안 되면 마운드에서 얘기하죠."`, def: `"제 리드에 문제 없습니다."` });
            L._arcLog(a, `${p.ko}이(가) ${c.ko}의 ${cause}를 두고 불만을 터뜨렸습니다.`);
            L._arcEvent(a, { title: '리드 논쟁', ttl: 7, def: 'wait', rec: 'talk', text: `${p.ko}(${TRAITS[L.traitOf(p)] || '-'}): ${pv}\n${c.ko}(${TRAITS[L.traitOf(c)] || '-'}): ${cv}\n두 선수의 사이가 틀어지면 배터리의 호흡이 무너집니다.`, choices: [
              { k: 'catcher', label: `${c.ko} 편들기`, hint: `${c.ko} 컨디션 +2(30일) · ${p.ko} −2(30일), 충성도 −3` }, { k: 'pitcher', label: `${p.ko} 편들기`, hint: `${p.ko} 컨디션 +2(30일) · ${c.ko} −2(30일), 충성도 −3` }, { k: 'talk', label: '두 선수 함께 면담(중재)', hint: `성공 ${pct(pr)}: 둘 다 +2(45일)·충성도 +3 / 실패: 둘 다 −1` }, { k: 'wait', label: '지켜본다', hint: '불씨가 남아 9일 뒤 크게 터질 수 있음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), c = P(L, a.pid2); a.mem.side = k;
            if (k === 'catcher') { mood(L, c, 2, 30); mood(L, p, -2, 30); addLoy(L, p, 'battery', -3, '리드 논쟁에서 외면받은 기억'); L._arcGo(a, 'after', 10); return `${c.ko}의 손을 들어 줬습니다(${c.ko} +2, ${p.ko} −2, 30일). ${p.ko}은(는) 서운해합니다(충성도 −3). 열흘 뒤 분위기를 살핍니다.`; }
            if (k === 'pitcher') { mood(L, p, 2, 30); mood(L, c, -2, 30); addLoy(L, c, 'battery', -3, '리드 논쟁에서 외면받은 기억'); L._arcGo(a, 'after', 10); return `${p.ko}의 의견을 받아들였습니다(${p.ko} +2, ${c.ko} −2, 30일). ${c.ko}은(는) 자존심이 상했습니다(충성도 −3). 열흘 뒤 분위기를 살핍니다.`; }
            if (k === 'talk') {
              if (rngFor(L.S.seed, L.S.year, L.S.day, 9211).random() < a.mem.pr) { mood(L, p, 2, 45); mood(L, c, 2, 45); addLoy(L, p, 'battery', 3, '갈등 때 중재해 준 기억'); addLoy(L, c, 'battery', 3, '갈등 때 중재해 준 기억'); L._bondShift && L._bondShift(p, 1, '갈등 해소'); p.arcMem = Object.assign(p.arcMem || {}, { battery: { result: 'talk', tone: 'ok', role: 'pitcher', other: c.id, y: L.S.year } }); L._arcEnd(a, `면담이 통했습니다. ${p.ko}과(와) ${c.ko}이(가) 서로의 방식을 맞춰 보기로 했습니다(둘 다 컨디션 +2, 45일, 충성도 +3).`, 'ok'); return a.end.text; }
              mood(L, p, -1, 10); mood(L, c, -1, 10); L._arcGo(a, 'after', 7); return `면담이 겉돌았습니다(성공 확률 ${pct(a.mem.pr)}를 못 넘김). 둘 다 표정이 굳었습니다(컨디션 −1, 10일). 일주일 뒤 다시 살핍니다.`;
            }
            L._arcGo(a, 'blow', 9); return `일단 지켜보기로 했습니다. 불씨가 남은 채로 시간이 흐릅니다.`;
          }
        },
        after: {
          enter(L, a) {
            const p = P(L, a.pid), c = P(L, a.pid2); L._arcLog(a, `${p.ko}과(와) ${c.ko} 사이의 냉기는 아직 완전히 가시지 않았습니다.`);
            L._arcEvent(a, { title: '다시 한 번', ttl: 8, def: 'let', rec: 'dinner', text: `갈등의 여진이 남아 있습니다. 배터리를 어떻게 정리할까요?`, choices: [
              { k: 'rotate', label: '백업 포수로 번갈아 기용', hint: `${p.ko} +2(30일) · ${c.ko} −1(30일) · 갈등은 일단 봉합` }, { k: 'dinner', label: '선수단 회식·모임(0.2억)', hint: '팀 컨디션 +1(14일) · 60%: 둘 다 +1(45일)·충성도 +2' }, { k: 'let', label: '그대로 둔다', hint: '50%: 불만이 다시 터짐(이적 요청)' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), c = P(L, a.pid2), f = L.S.fin && L.S.fin.teams[L.S.userTeam], r = rngFor(L.S.seed, L.S.year, L.S.day, 9212).random();
            const keep = (tone, who) => { p.arcMem = Object.assign(p.arcMem || {}, { battery: { result: k, tone, role: 'pitcher', other: c.id, y: L.S.year } }); c.arcMem = Object.assign(c.arcMem || {}, { battery: { result: k, tone, role: 'catcher', other: p.id, y: L.S.year } }); };
            if (k === 'rotate') { mood(L, p, 2, 30); mood(L, c, -1, 30); keep('mixed'); L._arcEnd(a, `백업 포수를 섞어 쓰자 ${p.ko}의 표정이 밝아졌습니다(+2). ${c.ko}은(는) 입맛이 씁니다(−1).`, 'mixed'); return a.end.text; }
            if (k === 'dinner') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.2) * 10) / 10; L.S.teamMood = { v: 1, until: L.S.day + 14 }; L.invalidate(); if (r < 0.6) { mood(L, p, 1, 45); mood(L, c, 1, 45); addLoy(L, p, 'battery', 2, '회식에서 풀렸던 앙금'); addLoy(L, c, 'battery', 2, '회식에서 풀렸던 앙금'); L._bondShift && L._bondShift(p, 1, '회식'); keep('ok'); L._arcEnd(a, `회식 자리에서 ${p.ko}과(와) ${c.ko}이(가) 술잔을 부딪쳤습니다. 라커룸 분위기가 풀렸습니다(팀 +1, 둘 다 +1, 충성도 +2).`, 'ok'); } else { keep('mixed'); L._arcEnd(a, `회식으로 분위기는 풀렸지만 둘의 앙금은 남았습니다(팀 컨디션 +1).`, 'mixed'); } return a.end.text; }
            if (r < 0.5) { L._arcGo(a, 'blow', 6); return '그대로 두었습니다. 그런데 불씨가 다시 살아납니다…'; }
            keep('mixed'); L._arcEnd(a, `그대로 두었는데 다행히 시간이 해결해 주었습니다.`, 'mixed'); return a.end.text;
          }
        },
        blow: {
          enter(L, a) {
            const who = a.mem.side === 'catcher' ? P(L, a.pid) : a.mem.side === 'pitcher' ? P(L, a.pid2) : (rngFor(L.S.seed, L.S.year, L.S.day, 9213).random() < 0.5 ? P(L, a.pid) : P(L, a.pid2)); a.mem.who = who.id;
            L._arcLog(a, `${who.ko}의 불만이 끝내 터졌습니다. 구단에 이적을 요청했다는 이야기가 돕니다.`, 3);
            L._arcEvent(a, { title: '터져 버린 불만', ttl: 8, def: 'stand', rec: 'meet', text: `${who.ko}이(가) 더는 같이 못 하겠다며 이적을 요청했습니다. ${voice(L, who, { clutch: '"여기선 제 가치를 인정받지 못하는 것 같습니다."', shy: '"…죄송합니다. 더는 힘들 것 같습니다."', leader: '"팀을 위해서도 제가 떠나는 게 낫습니다."', model: '"원칙대로 구단에 정식 요청드립니다."', free: '"그냥 다른 데서 던지고 싶어요."', def: '' })}`, choices: [
              { k: 'meet', label: '감독이 직접 면담', hint: '60%: 진정(컨디션 +2·30일, 충성도 +3) / 실패: 컨디션 −2, 충성도 −4' }, { k: 'market', label: '트레이드 시장에 내놓는다', hint: '충성도 +2 · 팀 컨디션 −1(14일) · 유대 ↓' }, { k: 'stand', label: '버티게 한다', hint: '충성도 −6 · 컨디션 −2(45일) — 재계약·FA에 크게 불리' }] });
          },
          resolve(L, a, k) {
            const w = P(L, a.mem.who), o = P(L, w.id === a.pid ? a.pid2 : a.pid), r = rngFor(L.S.seed, L.S.year, L.S.day, 9214).random(); let txt, tone = 'bad';
            if (k === 'meet') { if (r < 0.6) { mood(L, w, 2, 30); addLoy(L, w, 'battery', 3, '이적 요청 때 직접 면담해 준 기억'); tone = 'ok'; txt = `감독의 면담에 ${w.ko}이(가) 마음을 돌렸습니다(컨디션 +2, 충성도 +3).`; } else { mood(L, w, -2, 30); addLoy(L, w, 'battery', -4, '면담에도 풀리지 않았던 기억'); txt = `면담에도 ${w.ko}의 마음은 돌아서지 않았습니다(컨디션 −2, 충성도 −4).`; } }
            else if (k === 'market') { addLoy(L, w, 'battery', 2, '이적 요청을 받아 준 기억'); L.S.teamMood = { v: -1, until: L.S.day + 14 }; L.invalidate(); L._bondShift && L._bondShift(w, -1, '이적 요청'); tone = 'mixed'; txt = `${w.ko}을(를) 트레이드 시장에 내놓기로 했습니다(충성도 +2). 팀 분위기는 어수선합니다(팀 컨디션 −1, 14일).`; }
            else { mood(L, w, -2, 45); addLoy(L, w, 'battery', -6, '이적 요청을 외면당한 기억'); txt = `${w.ko}을(를) 버티게 했습니다. 선수의 마음이 크게 식었습니다(컨디션 −2, 충성도 −6).`; }
            w.arcMem = Object.assign(w.arcMem || {}, { battery: { result: k, tone, role: w.id === a.pid ? 'pitcher' : 'catcher', other: o.id, y: L.S.year } }); L.note(w, `이야기 「${a.title}」: ${k === 'meet' ? '직접 면담' : k === 'market' ? '이적 요청 수용' : '버티기'}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    },
    /* ---- 3) 떠오르는 유망주 ---- */
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
            const p = P(L, a.pid), f = L._arcForm(p) || 0, mt = pickMentor(L, p); a.mem.f0 = f; a.mem.mentor = mt ? mt.id : null; L._arcLog(a, `2군의 ${p.ko}(${p.age}세, OVR ${L.ovr(p)})이 최근 경기에서 눈에 띄는 활약을 펼치고 있습니다.`);
            const say = voice(L, p, { clutch: '"기회만 주시면 보여 드리겠습니다."', shy: '"…제가 1군에서 통할지 모르겠습니다."', leader: '"먼저 선배들께 배우겠습니다."', model: '"맡겨 주신 자리에서 최선을 다하겠습니다."', free: '"1군이요? 재밌겠는데요."', def: '' });
            L._arcEvent(a, { title: '2군의 신예', ttl: 9, def: 'wait', rec: 'callup', text: `${p.ko}(${TRAITS[L.traitOf(p)] || '-'})이(가) 2군에서 좋은 흐름을 이어 갑니다(최근 흐름 ▲${f.toFixed(1)}). ${say} 팬과 언론의 관심도 커졌습니다.`, choices: [
              { k: 'callup', label: '1군으로 콜업', hint: '같은 유형 가장 약한 1군 선수와 교체 · 컨디션 +2(30일) · 부진하면 부담' }, { k: 'mentor', label: mt ? `${mt.ko}(${mt.age}세)을 멘토로(0.3억)` : '멘토를 붙여 지켜본다(0.3억)', hint: `60%: 컨디션 +2(30일)${mt ? ` · ${mt.ko} 충성도 +1` : ''} · 실패해도 손해 없음` }, { k: 'wait', label: '2군에서 더 지켜본다', hint: '3주 뒤 다시 평가 · 변화 없음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), f = L.S.fin && L.S.fin.teams[L.S.userTeam], mt = a.mem.mentor ? P(L, a.mem.mentor) : null; a.mem.choice = k;
            if (k === 'callup') {
              const dn = L.downCandidates(p.id).filter(c => !c.block)[0], err = dn ? L.swapActive(p.id, dn.p.id) : L.moveActive(p.id, true);
              if (err) { L._arcGo(a, 'review', 21); a.mem.choice = 'wait'; return `콜업이 어렵습니다(${err}). 2군에서 더 지켜봅니다.`; }
              mood(L, p, 2, 30); L._arcGo(a, 'review', 18); return `${p.ko}을(를) 1군에 올렸습니다${dn ? '(' + dn.p.ko + ' 2군행)' : ''}(컨디션 +2, 30일). 프로 무대에서 어떤 모습을 보일까요?`;
            }
            if (k === 'mentor') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; if (mt) addLoy(L, mt, 'rising', 1, '후배 멘토 역할을 맡았던 기억'); const ok = rngFor(L.S.seed, L.S.year, L.S.day, 9230).random() < 0.6; L._arcGo(a, 'review', 21); if (ok) { mood(L, p, 2, 30); return `${mt ? mt.ko + '의' : '멘토의'} 조언이 효과를 봤습니다(${p.ko} 컨디션 +2, 30일).`; } return `멘토링은 큰 변화가 없었습니다. 3주 뒤 다시 평가합니다.`; }
            L._arcGo(a, 'review', 21); return `2군에서 더 지켜보기로 했습니다.`;
          }
        },
        review: {
          enter(L, a) {
            const p = P(L, a.pid), f = L._arcForm(p), good = f !== null && f >= 0.8, bad = f !== null && f <= -0.8; a.mem.f1 = f;
            const where = p.active ? '1군' : '2군', fs = f === null ? '' : `(최근 흐름 ${f >= 0 ? '▲' : '▼'}${Math.abs(f).toFixed(1)})`;
            if (good) { L._arcLog(a, `${p.ko}이(가) ${where}에서도 계속 좋은 모습을 이어 갑니다.`); L._arcEvent(a, { title: '그 기세 그대로', ttl: 9, def: 'keep', rec: 'keep', text: `${p.ko}의 상승세가 이어집니다${fs}.${p.rookie === L.S.year ? ' 신인왕 레이스 이야기까지 나옵니다.' : ''} 어떻게 이끌까요?`, choices: [{ k: 'keep', label: '계속 기회를 준다', hint: '컨디션 +2(40일) · 충성도 +3 · 서사 이어짐' }, { k: 'manage', label: '체력 관리를 위해 쉬게 한다', hint: '컨디션 +1(14일) · 무리하지 않음' }] }); a.mem.tone = 'good'; }
            else { L._arcLog(a, `${p.ko}${bad ? '이(가) 기대에 못 미쳐 부담을 느끼는 모습입니다.' : '의 활약은 평범한 수준에 머물렀습니다.'}`); L._arcEvent(a, { title: '기대와 부담 사이', ttl: 9, def: 'trust', rec: 'trust', text: `${p.ko}${bad ? '이(가) 부진합니다' : '의 기세가 한풀 꺾였습니다'}${fs}. ${voice(L, p, { shy: '"…죄송합니다. 기대에 못 미쳐서."', clutch: '"다음엔 반드시 보여 드리겠습니다."', def: '' })} 어떻게 할까요?`, choices: [{ k: 'trust', label: '믿고 계속 기용', hint: '50%: 컨디션 +2(30일)·충성도 +3 / 아니면 −2(30일)' }, { k: 'reset', label: '2군에서 재정비', hint: '컨디션 +2(40일) · 서사는 천천히' }] }); a.mem.tone = 'bad'; }
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), r = rngFor(L.S.seed, L.S.year, L.S.day, 9231).random(); let txt, tone = 'ok';
            if (a.mem.tone === 'good') { if (k === 'keep') { mood(L, p, 2, 40); addLoy(L, p, 'rising', 3, '기회를 믿고 맡겨 준 기억'); txt = `${p.ko}이(가) 기회를 살려 팀의 새 얼굴로 자리 잡아 갑니다(컨디션 +2, 충성도 +3).`; } else { mood(L, p, 1, 14); txt = `${p.ko}에게 휴식을 주며 길게 보기로 했습니다(컨디션 +1). 서두르지 않는 육성입니다.`; tone = 'mixed'; } }
            else if (k === 'trust') { if (r < 0.5) { mood(L, p, 2, 30); addLoy(L, p, 'rising', 3, '부진할 때 믿어 준 기억'); txt = `믿어 준 보람이 있었습니다. ${p.ko}이(가) 감을 되찾습니다(컨디션 +2, 충성도 +3).`; } else { mood(L, p, -2, 30); tone = 'bad'; txt = `기용을 이어 갔지만 ${p.ko}의 부진이 길어집니다(컨디션 −2, 30일). 좋은 경험으로 남기를 바랄 뿐입니다.`; } }
            else { mood(L, p, 2, 40); tone = 'mixed'; txt = `${p.ko}을(를) 2군에서 재정비시킵니다(컨디션 +2, 40일). 성장은 조금 천천히 가는 걸로.`; if (p.active) L.moveActive(p.id, false); }
            p.arcMem = Object.assign(p.arcMem || {}, { rising: { choice: a.mem.choice, tone: a.mem.tone, res: tone, y: L.S.year } }); L.note(p, `이야기 「${a.title}」: ${a.mem.choice === 'callup' ? '1군 콜업' : a.mem.choice === 'mentor' ? '멘토링' : '2군 관찰'} → ${a.mem.tone === 'good' ? '상승세' : '난관'}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    },
    /* ---- 5) 베테랑의 마지막 시즌(은퇴 갈림길) ---- */
    vet: {
      title: '베테랑의 마지막 시즌', steps: 3,
      can(L) {
        const t = L.S.userTeam, c = L.players(t).filter(p => !p.foreign && p.age >= 37 && !(p.arcMem && p.arcMem.vet && L.S.year - p.arcMem.vet.y < 2) && (L._cerTenure(p, t) >= 6 || L.legendBound(p, t))).sort((a, b) => L._cerTenure(b, t) - L._cerTenure(a, t) || b.age - a.age)[0];
        return c ? { pid: c.id } : null;
      },
      start(L, a) { L._arcGo(a, 'hint', 0); a.wait = L.S.day; },
      stages: {
        hint: {
          enter(L, a) {
            const p = P(L, a.pid), t = L.S.userTeam, yrs = L._cerTenure(p, t), lb = L.legendBound(p, t);
            L._arcLog(a, `${p.ko}(${p.age}세, 구단 ${yrs}시즌)이 은퇴를 입에 올렸습니다.`);
            const say = voice(L, p, { clutch: '"한 시즌만 더 던지고 싶은 마음과, 지금이 마지막이라는 마음이 싸웁니다."', shy: '"…제가 팀에 짐이 되는 건 아닌지 걱정입니다."', leader: '"후배들이 자리를 잡았다면 제가 물러날 때가 아닌가 싶습니다."', model: '"몸 상태를 보면 올해가 마지막일 수 있습니다."', free: '"뭐, 언제까지 할 수 있겠어요. 올해가 마지막일지도?"', def: '"올해가 마지막일지도 모르겠습니다."' });
            L._arcEvent(a, { title: '은퇴 갈림길', ttl: 8, def: 'wait', rec: lb ? 'honor' : 'urge', text: `${p.ko}${lb ? `(영구결번 후보, 구단 WAR ${lb.war.toFixed(1)})` : ''}이(가) 올 시즌을 마지막으로 생각하고 있습니다. ${say}`, choices: [
              { k: 'urge', label: '현역 연장을 설득', hint: '은퇴 가능성 크게 ↓(올 시즌 뒤 은퇴 확률 ×0.35) · 컨디션 +1(30일) · 충성도 +2' },
              { k: 'honor', label: '마지막 시즌으로 예우', hint: '은퇴 가능성 ↑(×2.5) · 컨디션 +1(40일) · 충성도 +3 · 은퇴식 때 성대한 행사 추천' },
              { k: 'wait', label: '본인 결정에 맡긴다', hint: '변화 없음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid); a.mem.choice = k;
            if (k === 'urge') { p.arcRet = { v: 'stay', y: L.S.year }; mood(L, p, 1, 30); adj(p, 2); L._arcGo(a, 'mentor', 20); return `${p.ko}을(를) 설득했습니다. 올 시즌 뒤 은퇴 가능성이 크게 낮아졌습니다(컨디션 +1, 충성도 +2).`; }
            if (k === 'honor') { p.arcRet = { v: 'go', y: L.S.year }; mood(L, p, 1, 40); adj(p, 3); addLoy(L, p, 'vet', 2, '마지막 시즌을 예우해 준 기억'); L._arcGo(a, 'mentor', 20); return `${p.ko}의 마지막 시즌을 예우하기로 했습니다(컨디션 +1, 충성도 +3). 은퇴 가능성이 높아졌습니다.`; }
            L._arcGo(a, 'mentor', 20); return `${p.ko}의 결정에 맡기기로 했습니다.`;
          }
        },
        mentor: {
          enter(L, a) {
            const p = P(L, a.pid), t = L.S.userTeam, y = L.players(t).filter(x => !x.foreign && x.id !== p.id && x.type === p.type && x.age <= 26).sort((a2, b) => L.ovr(b) - L.ovr(a2))[0]; a.mem.pupil = y ? y.id : null;
            L._arcLog(a, `${p.ko}이(가) 후배들 앞에서 말수가 늘었습니다.`);
            L._arcEvent(a, { title: '남기고 싶은 것', ttl: 8, def: 'none', rec: y ? 'mentor' : 'rest', text: `${p.ko}${y ? `이(가) ${y.ko}(${y.age}세)에게 자기 노하우를 전하고 싶어 합니다` : '의 몸 관리가 중요해졌습니다'}. 어떻게 할까요?`, choices: [
              ...(y ? [{ k: 'mentor', label: `${y.ko}에게 멘토 역할(0.3억)`, hint: `${y.ko} 컨디션 +2(40일) · ${p.ko} 충성도 +1` }] : []),
              { k: 'rest', label: '시즌 후반 관리 위주로', hint: `${p.ko} 컨디션 +1(30일) · 부담 줄임` },
              { k: 'none', label: '지금처럼', hint: '변화 없음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), y = a.mem.pupil ? P(L, a.mem.pupil) : null, f = L.S.fin && L.S.fin.teams[L.S.userTeam]; let txt = '';
            if (k === 'mentor' && y) { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; mood(L, y, 2, 40); adj(p, 1); a.mem.mentored = y.id; txt = `${p.ko}이(가) ${y.ko}에게 노하우를 전수합니다(${y.ko} 컨디션 +2, 40일).`; }
            else if (k === 'rest') { mood(L, p, 1, 30); txt = `${p.ko}의 부담을 줄였습니다(컨디션 +1).`; } else txt = '지금처럼 이어 갑니다.';
            L._arcGo(a, 'final', 30); return txt;
          }
        },
        final: {
          enter(L, a) {
            const p = P(L, a.pid), f = L._arcForm(p), good = f !== null && f >= 0.8, t = L.S.userTeam, c = a.mem.choice;
            p.arcMem = Object.assign(p.arcMem || {}, { vet: { choice: c, mentored: a.mem.mentored || null, y: L.S.year } }); L.note(p, `이야기 「${a.title}」: ${c === 'urge' ? '현역 연장 설득' : c === 'honor' ? '마지막 시즌 예우' : '본인 결정에 맡김'}`);
            L._arcEnd(a, `${p.ko}의 시즌은 ${good ? '노장의 품격을 보여 주는 호조로' : f !== null && f <= -0.8 ? '세월을 실감하는 부침 속에서' : '차분하게'} 이어집니다. ${c === 'honor' ? '시즌이 끝나면 아름다운 마무리가 기다립니다.' : c === 'urge' ? '다음 시즌에도 그의 이름을 볼 수 있을 것 같습니다.' : '은퇴 여부는 시즌 뒤에 정해집니다.'}`, good ? 'ok' : 'mixed');
          },
          resolve() { return ''; }
        }
      }
    },
    /* ---- 6) FA 앞둔 에이스(계약 마지막 해) ---- */
    contract: {
      title: 'FA 앞둔 에이스', steps: 3,
      can(L) {
        const t = L.S.userTeam, c = L.players(t).filter(p => !p.foreign && p.active && p.contract.years === 1 && p.age >= 26 && p.age <= 36 && L.war(p) >= 1.5 && !(p.arcMem && p.arcMem.contract && p.arcMem.contract.y === L.S.year)).sort((a, b) => L.war(b) - L.war(a))[0];
        return c ? { pid: c.id } : null;
      },
      start(L, a) { L._arcGo(a, 'rumor', 0); a.wait = L.S.day; },
      stages: {
        rumor: {
          enter(L, a) {
            const p = P(L, a.pid), t = L.S.userTeam, lb = L.legendBound(p, t), ask = L.resignAsk(p), cur = p.contract.salary;
            L._arcLog(a, `${p.ko}의 계약이 올해로 끝납니다. 타 구단의 관심 소문이 돕니다.`);
            L._arcEvent(a, { title: '계약 마지막 해', ttl: 9, def: 'wait', rec: 'early', text: `${p.ko}(WAR ${L.war(p).toFixed(1)}${lb ? ' · 영구결번 후보' : ''})의 계약이 올해 끝납니다(현재 ${cur.toFixed(1)}억, 예상 요구 ${ask.toFixed(1)}억). 타 구단이 관심을 보인다는 소문이 있습니다. ${voice(L, p, { clutch: '"여기서 끝까지 하고 싶지만, 저도 제 가치를 인정받고 싶습니다."', shy: '"…구단이 저를 어떻게 생각하시는지 궁금합니다."', leader: '"선수단과 팬이 좋아하는 이 팀에 남고 싶습니다."', model: '"제 기록이 저를 대변해 줄 겁니다."', free: '"시장이 어떤지 한번 보는 것도 나쁘지 않겠죠."', def: '' })}`, choices: [
              { k: 'early', label: '조기 재계약 의사 전달', hint: '시즌 뒤 재계약 요구액 −8% · 충성도 +3 (요구액에 반영, ⚠ 가정)' },
              { k: 'wait', label: '시즌 뒤 논의', hint: '변화 없음' },
              { k: 'cold', label: '구단 방침 고수(인상 불가)', hint: '재계약 요구액 +5% · 충성도 −3' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), y = L.S.year; a.mem.choice = k;
            if (k === 'early') { p.askMod = { v: 0.92, y }; adj(p, 3); addLoy(L, p, 'contract', 2, '일찍 재계약 의사를 밝혀 준 기억'); L._arcGo(a, 'deadline', 25); return `${p.ko}에게 일찍 재계약 의사를 전했습니다. 선수가 고마워합니다(충성도 +3, 시즌 뒤 요구액 −8%).`; }
            if (k === 'cold') { p.askMod = { v: 1.05, y }; adj(p, -3); L._arcGo(a, 'deadline', 25); return `${p.ko}에게 인상 불가 방침을 전했습니다. 선수의 표정이 굳었습니다(충성도 −3, 시즌 뒤 요구액 +5%).`; }
            L._arcGo(a, 'deadline', 25); return `재계약은 시즌 뒤에 논의하기로 했습니다.`;
          }
        },
        deadline: {
          enter(L, a) {
            const p = P(L, a.pid), l = L.loyalty(p, p.team), v = l ? l.v : 50; a.mem.v = v;
            L._arcLog(a, `트레이드 마감이 다가오자 ${p.ko}의 거취에 관심이 쏠립니다.`);
            L._arcEvent(a, { title: '마감 앞의 거취', ttl: 8, def: 'silent', rec: v >= 60 ? 'assure' : 'silent', text: `트레이드 마감을 앞두고 ${p.ko}이(가) 거취를 묻습니다(충성도 ${Math.round(v)}). 선수는 ${v >= 65 ? '이 팀에 남고 싶은 마음이 큽니다' : v >= 50 ? '마음이 반반입니다' : '시장의 평가가 궁금한 눈치입니다'}.`, choices: [
              { k: 'assure', label: '직접 만나 잔류 의사 확인', hint: `충성도에 따라 성공(현재 약 ${v >= 65 ? '높음' : v >= 50 ? '보통' : '낮음'}) · 성공하면 요구액 −5%·충성도 +2 / 실패하면 충성도 −1` },
              { k: 'silent', label: '말을 아낀다', hint: '변화 없음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), y = L.S.year, ok = k === 'assure' && rngFor(L.S.seed, y, L.S.day, 9260).random() < clamp(0.25 + (a.mem.v - 40) / 80, 0.15, 0.9); let txt;
            if (k === 'assure') { if (ok) { p.askMod = { v: (p.askMod && p.askMod.y === y ? p.askMod.v : 1) * 0.95, y }; adj(p, 2); txt = `${p.ko}이(가) 잔류 의사를 밝혔습니다(충성도 +2, 요구액 −5%).`; } else { adj(p, -1); txt = `${p.ko}은(는) 확답을 피했습니다(충성도 −1).`; } } else txt = '말을 아끼며 시즌을 이어 갑니다.';
            L._arcGo(a, 'close', 30); return txt;
          }
        },
        close: {
          enter(L, a) {
            const p = P(L, a.pid), m = p.askMod && p.askMod.y === L.S.year ? p.askMod.v : 1; p.arcMem = Object.assign(p.arcMem || {}, { contract: { choice: a.mem.choice, askMod: m, y: L.S.year } }); L.note(p, `이야기 「${a.title}」: ${a.mem.choice === 'early' ? '조기 재계약 의사' : a.mem.choice === 'cold' ? '구단 방침 고수' : '시즌 뒤 논의'}(요구액 ×${m.toFixed(2)})`);
            L._arcEnd(a, `${p.ko}의 재계약 협상은 시즌 뒤로 이어집니다. 요구액은 ${m < 1 ? Math.round((1 - m) * 100) + '% 낮아졌습니다' : m > 1 ? Math.round((m - 1) * 100) + '% 올랐습니다' : '변동이 없습니다'}.`, m < 1 ? 'ok' : m > 1 ? 'bad' : 'mixed');
          },
          resolve() { return ''; }
        }
      }
    },
    /* ---- 7) 외국인 선수의 적응 ---- */
    foreign: {
      title: '외국인 선수의 적응', steps: 3,
      can(L) {
        const t = L.S.userTeam, c = L.players(t).filter(p => p.foreign && !p.sub && !p.rehab && ((p.myFrom && p.myFrom.y === L.S.year) || L.S.year === 2027) && !(p.arcMem && p.arcMem.foreign && p.arcMem.foreign.y === L.S.year)).sort((a, b) => L.ovr(b) - L.ovr(a))[0];
        return c ? { pid: c.id } : null;
      },
      start(L, a) { L._arcGo(a, 'adapt', 0); a.wait = L.S.day; },
      stages: {
        adapt: {
          enter(L, a) {
            const p = P(L, a.pid); L._arcLog(a, `${p.ko}(외국인)의 한국 생활이 시작되었습니다.`);
            L._arcEvent(a, { title: '낯선 환경', ttl: 9, def: 'none', rec: 'support', text: `${p.ko}(${p.aq ? '아시아쿼터' : '외국인'}, OVR ${L.ovr(p)})이(가) 낯선 환경에 적응하는 중입니다. ${voice(L, p, { shy: '말수가 적고 팀 분위기에 아직 어색해합니다.', free: '여기저기 구경하며 즐거운 표정입니다.', leader: '동료들과 어울리려고 노력합니다.', clutch: '빨리 결과를 내고 싶은 눈치입니다.', model: '생활 패턴을 철저히 지키려 합니다.', def: '' })} 구단이 어떻게 도울까요?`, choices: [
              { k: 'support', label: '통역·생활 지원 강화(0.3억)', hint: '컨디션 +2(30일) · 구단 신뢰 ↑' },
              { k: 'dinner', label: '팀 식사로 어울리게(0.1억)', hint: '컨디션 +1(30일) · 유대 ↑' },
              { k: 'none', label: '알아서 적응하게 둔다', hint: '변화 없음' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), f = L.S.fin && L.S.fin.teams[L.S.userTeam]; a.mem.choice = k;
            if (k === 'support') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; mood(L, p, 2, 30); L._arcGo(a, 'review', 30); return `${p.ko}의 생활 지원을 강화했습니다(컨디션 +2, 30일).`; }
            if (k === 'dinner') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.1) * 10) / 10; mood(L, p, 1, 30); L._bondShift && L._bondShift(p, 1, '팀 식사'); L._arcGo(a, 'review', 30); return `팀 식사로 ${p.ko}이(가) 동료들과 가까워졌습니다(컨디션 +1, 30일).`; }
            L._arcGo(a, 'review', 30); return `${p.ko}이(가) 알아서 적응하도록 두었습니다.`;
          }
        },
        review: {
          enter(L, a) {
            const p = P(L, a.pid), f = L._arcForm(p), good = f !== null && f >= 0.8, bad = f !== null && f <= -0.8; a.mem.tone = good ? 'good' : bad ? 'bad' : 'mid';
            L._arcLog(a, `${p.ko}은(는) ${good ? '빠르게 팀에 녹아들었습니다' : bad ? '아직 적응에 어려움을 겪고 있습니다' : '무난하게 적응해 가고 있습니다'}.`);
            L._arcEvent(a, { title: '한 달 뒤', ttl: 9, def: 'keep', rec: bad ? 'adjust' : 'keep', text: `${p.ko}${f === null ? '' : `(최근 흐름 ${f >= 0 ? '▲' : '▼'}${Math.abs(f).toFixed(1)})`}의 한 달을 돌아봅니다. ${good ? '기대 이상입니다.' : bad ? '성적이 기대에 못 미칩니다.' : '평범한 출발입니다.'} 어떻게 할까요?`, choices: [
              { k: 'keep', label: '믿고 계속 기용', hint: bad ? '50%: 컨디션 +1(30일) / 아니면 −1' : '컨디션 +1(30일)' },
              { k: 'adjust', label: '한국 야구 적응 면담(0.2억)', hint: '컨디션 +2(30일) · 코치진이 약점을 짚어 줌' }] });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), f = L.S.fin && L.S.fin.teams[L.S.userTeam], r = rngFor(L.S.seed, L.S.year, L.S.day, 9261).random(); let txt, tone = 'ok';
            if (k === 'adjust') { if (f) f.evCost = Math.round(((f.evCost || 0) + 0.2) * 10) / 10; mood(L, p, 2, 30); tone = 'mixed'; txt = `적응 면담을 통해 ${p.ko}의 고민을 풀어 줬습니다(컨디션 +2, 30일).`; }
            else if (a.mem.tone === 'bad') { if (r < 0.5) { mood(L, p, 1, 30); txt = `믿어 준 보람이 있었습니다. ${p.ko}이(가) 감을 잡아 갑니다(컨디션 +1).`; } else { mood(L, p, -1, 30); tone = 'bad'; txt = `기용을 이어 갔지만 적응이 더딥니다(컨디션 −1, 30일).`; } }
            else { mood(L, p, 1, 30); txt = `${p.ko}이(가) 팀의 핵심 전력으로 자리 잡아 갑니다(컨디션 +1, 30일).`; }
            p.arcMem = Object.assign(p.arcMem || {}, { foreign: { choice: a.mem.choice, tone: a.mem.tone, res: tone, y: L.S.year } }); L.note(p, `이야기 「${a.title}」: ${({ support: '생활 지원', dinner: '팀 식사', none: '방임' })[a.mem.choice]} → ${({ good: '빠른 적응', bad: '적응 난항', mid: '무난' })[a.mem.tone]}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    },
    /* ---- 4) 그때의 일(후일담): 지난 이야기의 선택이 다음 시즌에 돌아온다 ---- */
    echo: {
      title: '그때의 일', steps: 2, followup: true,
      can(L) {
        const S = L.S, A = L.arcs(); for (const p of L.players(S.userTeam)) { const m = p.arcMem; if (!m) continue; for (const key of ['ace', 'battery', 'rising']) { const e = m[key]; if (!e || e.echoed || e.y >= S.year) continue; if (A.list.some(x => x.kind === 'echo' && x.status === 'active' && x.pid === p.id)) continue; if (key === 'battery' && !(e.other && P(L, e.other) && P(L, e.other).team === S.userTeam)) { e.echoed = true; continue; } return { pid: p.id, key }; } }
        return null;
      },
      start(L, a, ctx) { a.mem.key = ctx.key; L._arcGo(a, 'echo', 0); a.wait = L.S.day; },
      stages: {
        echo: {
          enter(L, a) {
            const p = P(L, a.pid), key = a.mem.key, m = p.arcMem[key], o = m.other ? P(L, m.other) : null, yr = L.S.year - m.y; let v;
            if (key === 'ace') {
              if (m.relapse || m.choice === 'rush') v = { cause: 'grudge', title: '그때의 등판', text: `${p.ko}이(가) 작년 일을 꺼냅니다. ${voice(L, p, { clutch: '"그때 무리해서 던진 거, 아직 팔이 기억합니다. 올해는 관리해 주실 거죠?"', shy: '"…작년처럼 되는 건 아니겠죠."', leader: '"작년 일, 선수단도 다 기억합니다."', model: '"작년 일을 감안해 올해 계획을 세워 주시길 부탁드립니다."', free: '"작년처럼 막 굴리진 않으시겠죠?"', def: '"작년 일이 마음에 걸립니다."' })}`, choices: [{ k: 'cap', label: '이닝 제한을 약속', hint: '컨디션 +1(60일) · 충성도 +4 · 에이스 부담 줄임' }, { k: 'thanks', label: '격려금 전달(0.3억)', hint: '컨디션 +1(45일) · 충성도 +3' }, { k: 'brush', label: '지난 일이라 넘긴다', hint: '50%: 충성도 −3(재계약 불리) · 나머지는 영향 없음' }], def: 'brush', rec: 'cap' };
              else v = { cause: 'grateful', title: '그때의 휴식', text: `${p.ko}이(가) 작년 재활 때를 떠올립니다. ${voice(L, p, { clutch: '"그때 쉬게 해 주신 덕에 올해 던질 수 있습니다. 보답하겠습니다."', shy: '"…그때 감사했습니다. 올해 잘 던지겠습니다."', leader: '"선수단 모두 감독님 판단을 보고 있었습니다."', model: '"작년 재활 계획 덕분입니다."', free: '"그때 안 쉬었으면 지금 없었을걸요?"', def: '"작년 일 고맙습니다."' })}`, choices: [{ k: 'ride', label: '올해 에이스로 확실히 맡긴다', hint: '컨디션 +2(45일) · 충성도 +2' }, { k: 'protect', label: '이닝 관리를 약속', hint: '컨디션 +1(60일) · 충성도 +3' }], def: 'ride', rec: 'ride' };
            } else if (key === 'battery') {
              if (m.tone === 'ok') v = { cause: 'rapport', title: '굳어진 호흡', text: `작년의 갈등을 푼 ${p.ko}과(와) ${o.ko}이(가) 올해는 눈빛만 봐도 통하는 사이가 됐습니다. 이 배터리를 어떻게 쓸까요?`, choices: [{ k: 'pair', label: '고정 배터리로 밀어 준다', hint: `${p.ko}·${o.ko} 컨디션 +2(45일)` }, { k: 'rotate', label: '유연하게 번갈아 쓴다', hint: '둘 다 +1(30일)' }], def: 'pair', rec: 'pair' };
              else v = { cause: 'grudge', title: '남은 앙금', text: `작년의 앙금이 ${p.ko}과(와) ${o.ko} 사이에 아직 남아 있습니다.`, choices: [{ k: 'meet', label: '둘을 불러 다시 이야기', hint: '55%: 둘 다 +1(45일)·충성도 +2 / 실패: 변화 없음' }, { k: 'ignore', label: '그냥 둔다', hint: '40%: 충성도 −3' }], def: 'ignore', rec: 'meet' };
            } else {
              if (m.res !== 'bad' && m.tone === 'good') v = { cause: 'second', title: '2년차의 시즌', text: `작년에 떠올랐던 ${p.ko}(${p.age}세, OVR ${L.ovr(p)})이 올해는 기대와 시선 속에서 시즌을 맞았습니다. ${voice(L, p, { clutch: '"올해가 진짜 승부입니다."', shy: '"작년만큼 할 수 있을지 걱정입니다."', leader: '"후배들 앞에서 부끄럽지 않게 하겠습니다."', model: '"꾸준함으로 보여 드리겠습니다."', free: '"작년처럼 신나게 해 볼게요."', def: '' })}`, choices: [{ k: 'starter', label: '주전 기회를 확실히 준다', hint: '컨디션 +2(45일) · 충성도 +2' }, { k: 'manage', label: '출전을 관리하며 키운다', hint: '컨디션 +1(30일)' }], def: 'starter', rec: 'starter' };
              else v = { cause: 'redo', title: '다시 한 번', text: `작년 시련을 겪었던 ${p.ko}(${p.age}세, OVR ${L.ovr(p)})이 재도전을 다짐합니다.`, choices: [{ k: 'trust', label: '믿고 기회를 준다', hint: '컨디션 +1(45일) · 충성도 +3' }, { k: 'camp', label: '2군에서 한 번 더 다듬는다', hint: '컨디션 +2(30일)' }], def: 'trust', rec: 'trust' };
            }
            a.mem.v = v.cause; L._arcLog(a, `${yr}년 전 이야기가 되살아났습니다: ${p.ko}${o ? '·' + o.ko : ''}.`);
            L._arcEvent(a, { title: v.title, ttl: 10, def: v.def, rec: v.rec, text: v.text, choices: v.choices });
          },
          resolve(L, a, k) {
            const p = P(L, a.pid), key = a.mem.key, m = p.arcMem[key], o = m.other ? P(L, m.other) : null, f = L.S.fin && L.S.fin.teams[L.S.userTeam], r = rngFor(L.S.seed, L.S.year, L.S.day, 9240).random(); let txt, tone = 'ok'; m.echoed = true; if (o && o.arcMem && o.arcMem[key]) o.arcMem[key].echoed = true;
            const both = (v, d) => { mood(L, p, v, d); if (o) mood(L, o, v, d); };
            switch (a.mem.v + ':' + k) {
              case 'grudge:cap': mood(L, p, 1, 60); addLoy(L, p, 'ace', 4, '작년 일을 기억하고 이닝을 관리해 준 약속'); txt = `이닝 제한을 약속했습니다. ${p.ko}의 표정이 한결 풀렸습니다(컨디션 +1, 충성도 +4).`; break;
              case 'grudge:thanks': if (f) f.evCost = Math.round(((f.evCost || 0) + 0.3) * 10) / 10; mood(L, p, 1, 45); addLoy(L, p, 'ace', 3, '작년 일 이후 받은 격려'); txt = `격려금을 전했습니다(컨디션 +1, 충성도 +3).`; break;
              case 'grudge:brush': if (key === 'ace') { if (r < 0.5) { addLoy(L, p, 'ace', -3, '작년 일을 대수롭지 않게 넘긴 기억'); tone = 'bad'; txt = `지난 일로 넘겼지만 ${p.ko}은(는) 서운해합니다(충성도 −3, 재계약에 불리).`; } else { tone = 'mixed'; txt = `지난 일로 넘겼고 별일 없이 지나갔습니다.`; } }
                else { if (r < 0.4) { addLoy(L, p, 'battery', -3, '앙금을 방치한 기억'); if (o) addLoy(L, o, 'battery', -3, '앙금을 방치한 기억'); tone = 'bad'; txt = `앙금을 방치하자 두 선수의 거리가 더 벌어졌습니다(충성도 −3).`; } else { tone = 'mixed'; txt = `앙금은 그대로 남았지만 큰 일은 없었습니다.`; } } break;
              case 'grudge:meet': if (r < 0.55) { both(1, 45); addLoy(L, p, 'battery', 2, '다시 마주 앉아 풀었던 기억'); if (o) addLoy(L, o, 'battery', 2, '다시 마주 앉아 풀었던 기억'); txt = `두 선수가 마침내 앙금을 풀었습니다(둘 다 컨디션 +1, 충성도 +2).`; } else { tone = 'mixed'; txt = `이야기를 나눴지만 앙금이 쉽게 풀리진 않았습니다.`; } break;
              case 'grudge:ignore': if (r < 0.4) { addLoy(L, p, 'battery', -3, '앙금을 방치한 기억'); tone = 'bad'; txt = `그냥 두자 ${p.ko}의 불만이 쌓였습니다(충성도 −3).`; } else { tone = 'mixed'; txt = `그냥 두었는데 큰 문제는 없었습니다.`; } break;
              case 'grateful:ride': mood(L, p, 2, 45); addLoy(L, p, 'ace', 2, '에이스로 믿고 맡겨 준 기억'); txt = `${p.ko}이(가) 에이스로서 시즌을 맞습니다(컨디션 +2, 충성도 +2).`; break;
              case 'grateful:protect': mood(L, p, 1, 60); addLoy(L, p, 'ace', 3, '이닝을 관리해 준 기억'); txt = `이닝 관리를 약속했습니다(컨디션 +1, 충성도 +3).`; break;
              case 'rapport:pair': both(2, 45); txt = `고정 배터리로 밀어 줍니다(${p.ko}·${o.ko} 컨디션 +2, 45일).`; break;
              case 'rapport:rotate': both(1, 30); tone = 'mixed'; txt = `유연하게 번갈아 기용합니다(둘 다 컨디션 +1).`; break;
              case 'second:starter': mood(L, p, 2, 45); addLoy(L, p, 'rising', 2, '2년차에 주전 기회를 준 기억'); txt = `${p.ko}에게 주전 기회를 확실히 줍니다(컨디션 +2, 충성도 +2).`; break;
              case 'second:manage': mood(L, p, 1, 30); tone = 'mixed'; txt = `${p.ko}을(를) 관리하며 키웁니다(컨디션 +1).`; break;
              case 'redo:trust': mood(L, p, 1, 45); addLoy(L, p, 'rising', 3, '다시 믿고 기회를 준 기억'); txt = `${p.ko}에게 다시 기회를 줍니다(컨디션 +1, 충성도 +3).`; break;
              default: mood(L, p, 2, 30); tone = 'mixed'; txt = `${p.ko}을(를) 2군에서 한 번 더 다듬습니다(컨디션 +2).`; if (p.active) L.moveActive(p.id, false);
            }
            L.note(p, `이야기 「그때의 일」(${({ ace: '에이스의 팔꿈치', battery: '배터리의 갈등', rising: '떠오르는 유망주' })[key]} 후일담): ${txt}`);
            L._arcEnd(a, txt, tone); return txt;
          }
        }
      }
    }
  };
  /* 이야기 선택이 실제 값에 닿는 두 지점(⚠ 가정): 은퇴 확률(베테랑 아크)·재계약 요구액(계약 아크). 올해(S.year) 값만 유효하다 */
  const _retireChance = proto.retireChance;
  proto.retireChance = function (p) { const c = _retireChance.call(this, p), m = p.arcRet && p.arcRet.y === this.S.year ? p.arcRet.v : null; if (m === 'stay') return Math.max(0.02, c * 0.35); if (m === 'go') return Math.min(0.97, Math.max(c * 2.5, 0.35)); return c; };
  const _resignAsk = proto.resignAsk;
  proto.resignAsk = function (p) { const v = _resignAsk.call(this, p), m = p.askMod && p.askMod.y === this.S.year ? p.askMod.v : 1; return m === 1 ? v : Math.max(this.minSal(), Math.round(v * m * 10) / 10); };
  proto._arcDefs = function () { return DEFS; };
  /* ================= 진행 ================= */
  proto.arcStart = function (kind, force) {
    const S = this.S, def = DEFS[kind], A = this.arcs(); if (!def) return null; const ctx = def.can(this); if (!ctx) return null;
    const a = { id: 'A' + (++A.seq), kind, title: def.title, status: 'active', y: S.year, d0: S.day, stage: null, wait: null, ev: null, pid: ctx.pid, pid2: ctx.pid2, mem: {}, log: [] }; A.list.unshift(a); A.last = S.day;
    if (A.list.length > 40) A.list.length = 40; def.start(this, a, ctx); return a;
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
    if (act.length < MAX_ACTIVE && d >= 8 && d <= 80 && !act.some(x => x.kind === 'echo') && rngFor(S.seed, S.year, d, 9101).random() < 0.2 && this.arcStart('echo')) return;   // 지난 시즌 이야기의 후일담이 먼저 돌아온다
    if (act.length >= MAX_ACTIVE || d < 14 || d > 118 || d - A.last < MIN_GAP) return;
    const r = rngFor(S.seed, S.year, d, 9100); if (r.random() > 0.07) return;
    const kinds = Object.keys(DEFS).filter(k => !DEFS[k].followup && !A.list.some(x => x.kind === k && x.y === S.year)).sort(() => r.random() - 0.5);   // 한 시즌에 같은 이야기는 한 번
    for (const k of kinds) if (this.arcStart(k)) return;
  };
  proto._arcResolve = function (e, k, auto) {
    const a = this.arcById(e.data.arc); if (!a || a.status !== 'active') return '이야기가 이미 끝났습니다.';
    const def = DEFS[a.kind], st = def.stages[a.stage]; if (!st) return ''; a.ev = null; const msg = st.resolve(this, a, k, auto);
    if (msg) a.log.push({ y: this.S.year, d: this.S.day, t: msg }); return msg;
  };
  proto._arcRollover = function () {   // 시즌이 바뀌어도 이야기는 이어진다: 대기 중인 단계는 다음 시즌 초에 진입
    for (const p of Object.values(this.S.players)) if (p.arcLoy) { p.arcLoy = p.arcLoy.filter(x => this.S.year - x.y < 3); if (!p.arcLoy.length) delete p.arcLoy; }   // 3년이 지난 이야기의 흔적은 정리
    for (const a of this.arcsActive()) { if (!a.ev) a.wait = 10; a.log.push({ y: this.S.year, d: 0, t: '시즌이 끝나고, 이야기는 다음 시즌으로 이어집니다.' }); }
  };
  proto.arcSummary = function () {
    const out = []; for (const a of this.arcs().list) { const p = P(this, a.pid), p2 = a.pid2 ? P(this, a.pid2) : null; out.push({ id: a.id, kind: a.kind, title: a.title, status: a.status, y: a.y, steps: DEFS[a.kind].steps, stage: a.stage, who: [p && p.ko, p2 && p2.ko].filter(Boolean).join(' · '), pid: a.pid, log: a.log.slice(), end: a.end || null, waiting: a.ev ? 'decide' : a.wait !== null && a.wait !== undefined ? 'wait' : '', days: a.wait !== null && a.wait !== undefined ? Math.max(0, a.wait - this.S.day) : null, progress: a.status === 'done' ? DEFS[a.kind].steps : Math.min(DEFS[a.kind].steps - 1, Object.keys(DEFS[a.kind].stages).indexOf(a.stage)) }); }
    return out;
  };
});
