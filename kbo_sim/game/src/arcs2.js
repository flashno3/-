/* 이야기 엔진 2.0: 분기 그래프 아크. 막(node) 단위로 이야기가 이어지고, 선택·관계 게이지·이전 선택(mem)에 따라 다음 막과 선택지가 달라진다.
 *  - node: { act(막 번호), title(막 제목), text(상황), choices:[{k,label,hint,req(잠금 사유),fx(결과)}] } 또는 자동 막 { run(L,a) → 결과 }
 *  - 결과: { msg, g:{게이지 변화}, mem:{기록}, next(다음 막), wait(대기 일수), end:{tone,text} }
 *  - 게이지(a.g)는 0~100: 선택마다 쌓이고 화면에 보이며, 면담 성공률·결말 분기에 쓰인다. 효과 크기는 모두 ⚠ 가정(컨디션·충성도 같은 기존 값에만 반영).
 * 기존 3막 직선 아크(arcs.js)와 같은 목록(S.arcs)을 쓰므로 이벤트·후일담·요약이 그대로 이어진다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'), require('../../web/src/engine.js'));
  else factory(root.KBOLeague, root.KBOEngine);
})(typeof self !== 'undefined' ? self : this, function (LG, Engine) {
  'use strict';
  const { proto, rngFor, clamp, TRAITS } = LG.OFFC;
  const P = (L, id) => L.S.players[id], cl100 = v => Math.max(0, Math.min(100, v)), pct = x => Math.round(x * 100) + '%';
  const mood = (L, p, v, days) => { if (p) { p.mood = { v, until: L.S.day + days }; L.invalidate(); } }, adj = (p, v) => { if (p) p.loyAdj = clamp((p.loyAdj || 0) + v, -15, 15); };
  const addLoy = (L, p, key, v, text) => { if (!p) return; p.arcLoy = (p.arcLoy || []).filter(x => !(x.k === key && x.y === L.S.year && x.t === text)); p.arcLoy.push({ k: key, v, t: text, y: L.S.year }); };
  const cost = (L, c) => { const f = L.S.fin && L.S.fin.teams[L.S.userTeam]; if (f && c > 0) f.evCost = Math.round(((f.evCost || 0) + c) * 10) / 10; };
  const voice = (L, p, m) => m[L.traitOf(p)] || m.def;
  const rr = (L, a, salt) => rngFor(L.S.seed, L.S.year, L.S.day, 9300 + salt * 7 + a.id.length * 13 + (parseInt(String(a.id).slice(1)) || 0)).random();
  const fn = (v, L, a) => typeof v === 'function' ? v(L, a) : v;

  /* 그래프 정의 → 기존 아크 엔진이 쓰는 {stages, start} 로 변환 */
  function graph(def) {
    const stages = {};
    const apply = (L, a, n, c, r) => {
      r = r || {};
      if (r.g) for (const k of Object.keys(r.g)) a.g[k] = cl100((a.g[k] === undefined ? 50 : a.g[k]) + r.g[k]);
      if (r.mem) Object.assign(a.mem, r.mem);
      if (c) (a.hist = a.hist || []).push({ n: n.title, c: fn(c.label, L, a), y: L.S.year, d: L.S.day });
      if (r.end) { a.epi = r.end.epi || null; L._arcEnd(a, r.end.text, r.end.tone); } else if (r.next) L._arcGo(a, r.next, r.wait || 3);
      return r.msg || '';
    };
    for (const id of Object.keys(def.nodes)) {
      const n = def.nodes[id];
      stages[id] = {
        enter(L, a) {
          if (!a.g) { a.g = Object.assign({}, def.init(L, a)); a.hist = a.hist || []; }   // 이전 판에서 시작한 같은 이름의 아크도 이어 갈 수 있게
          if (n.run) { const msg = apply(L, a, n, null, n.run(L, a)); if (msg) L._arcLog(a, msg); return; }
          const all = (n.choices || []).map(c => ({ c, lock: c.req ? c.req(L, a) : null })), open = all.filter(x => !x.lock), locked = all.filter(x => x.lock);
          L._arcLog(a, fn(n.log, L, a) || n.title);
          const defK = (open.find(x => x.c.k === n.def) || open[0]).c.k, rec = typeof n.rec === 'function' ? n.rec(L, a) : n.rec;
          L._arcEvent(a, { title: n.title, ttl: n.ttl || 8, def: defK, rec: open.some(x => x.c.k === rec) ? rec : defK, text: fn(n.text, L, a) + (locked.length ? `\n🔒 지금은 어려운 선택: ${locked.map(x => `${fn(x.c.label, L, a)}(${x.lock})`).join(' · ')}` : ''),
            choices: open.map(x => ({ k: x.c.k, label: fn(x.c.label, L, a), hint: fn(x.c.hint, L, a) })) });
        },
        resolve(L, a, k) { if (!a.g) { a.g = Object.assign({}, def.init(L, a)); a.hist = a.hist || []; } const c = n.choices.find(x => x.k === k) || n.choices.find(x => x.k === n.def) || n.choices[0]; return apply(L, a, n, c, c.fx(L, a)); }
      };
    }
    return { title: def.title, steps: def.acts, acts: def.acts, gauges: def.gauges, nodes: def.nodes, can: def.can, trig: def.trig, stages,
      start(L, a, ctx) { a.g = Object.assign({}, def.init(L, a, ctx)); a.hist = []; L._arcGo(a, def.first, 0); a.wait = L.S.day; } };
  }
  proto._arcGraph = graph;

  /* ============ 배터리의 갈등 (5막·분기 3갈래) ============ */
  const hasBackupC = (L, a) => L.players(L.S.userTeam).some(x => x.pos === 'C' && x.id !== a.pid2 && !L.isInj(x));
  const lead = (L, a) => L.traitOf(P(L, a.pid)) === 'leader' || L.traitOf(P(L, a.pid2)) === 'leader';
  const finB = (L, a, tone, res, text, fxp, fxc) => {
    const p = P(L, a.pid), c = P(L, a.pid2), S = L.S;
    for (const [x, role, o] of [[p, 'pitcher', c], [c, 'catcher', p]]) { x.arcMem = Object.assign(x.arcMem || {}, { battery: { result: res, tone, role, other: o.id, y: S.year } }); L.note(x, `이야기 「배터리의 갈등」: ${text}`); }
    if (fxp) fxp(p); if (fxc) fxc(c);
    return { end: { tone, text }, msg: '' };
  };
  const battery = {
    kind: 'battery', title: '배터리의 갈등', acts: 5, first: 'spat',
    gauges: [{ k: 'trust', label: '신뢰', good: 'high' }, { k: 'tension', label: '갈등', good: 'low' }],
    can(L) {
      const t = L.S.userTeam, set = L.S.teams[t].set, cs = L.players(t).filter(p => p.active && p.pos === 'C' && !L.isInj(p)).sort((a, b) => L.ovr(b) - L.ovr(a)), c = cs[0]; if (!c) return null;
      const sp = (set.rotation || []).slice(0, 4).map(id => P(L, id)).filter(p => p && p.active && !L.isInj(p)), p = sp[Math.floor(rngFor(L.S.seed, L.S.year, L.S.day, 9210).random() * sp.length)]; return p ? { pid: p.id, pid2: c.id } : null;
    },
    trig(L) {   // 반응형: 최근 내 경기 3연패
      const S = L.S, t = S.userTeam, g = (S.results || []).filter(x => x.home === t || x.away === t).slice(-3); if (g.length < 3) return null;
      return g.every(x => (x.home === t ? x.rh < x.ra : x.ra < x.rh)) ? this.can(L) : null;
    },
    init(L, a) { const p = P(L, a.pid), l = L.loyalty(p), lv = l ? l.v : 40; return { trust: clamp(Math.round(45 + (lead(L, a) ? 8 : 0) + (lv - 40) / 5), 25, 72), tension: 35 }; },
    nodes: {
      spat: {
        act: 1, title: '리드 논쟁', ttl: 7, def: 'wait', rec: 'talk',
        text(L, a) {
          const p = P(L, a.pid), c = P(L, a.pid2), cause = a.mem.cause = a.mem.cause || ['볼배합', '승부구 선택', '투구 템포'][Math.floor(rr(L, a, 1) * 3)];
          const pv = voice(L, p, { clutch: '"위기에서 제 공을 믿어 주질 않잖아요."', shy: '"…사인이 자꾸 저랑 안 맞아서요."', leader: `"팀을 위해서 하는 말입니다. ${cause}부터 다시 맞춰야 합니다."`, model: `"기록을 봐도 ${cause}는 바꿔야 합니다."`, free: '"그냥 제가 던지고 싶은 걸 던지면 안 됩니까?"', def: `"${cause}가 안 맞습니다."` });
          const cv = voice(L, c, { clutch: '"결과가 말해 주잖습니까. 제 리드가 맞았습니다."', shy: '"…저도 최선을 다했습니다."', leader: '"투수가 흔들릴 때 잡아 주는 게 제 일입니다."', model: '"데이터대로 한 겁니다."', free: '"말로 안 되면 마운드에서 얘기하죠."', def: '"제 리드에 문제 없습니다."' });
          return `연패 속에서 ${p.ko}이(가) ${c.ko}의 ${cause}를 두고 불만을 터뜨렸습니다.\n${p.ko}(${TRAITS[L.traitOf(p)] || '-'}): ${pv}\n${c.ko}(${TRAITS[L.traitOf(c)] || '-'}): ${cv}`;
        },
        choices: [
          { k: 'catcher', label: (L, a) => `${P(L, a.pid2).ko} 편들기`, hint: (L, a) => `${P(L, a.pid2).ko} 컨디션 +2·${P(L, a.pid).ko} −2(30일) · 신뢰 −8·갈등 +10`, fx(L, a) { const p = P(L, a.pid), c = P(L, a.pid2); mood(L, c, 2, 30); mood(L, p, -2, 30); addLoy(L, p, 'battery', -3, '리드 논쟁에서 외면받은 기억'); return { g: { trust: -8, tension: 10 }, mem: { side: 'catcher' }, next: 'rift', wait: 8, msg: `${c.ko}의 손을 들어 줬습니다. ${p.ko}은(는) 서운해합니다.` }; } },
          { k: 'pitcher', label: (L, a) => `${P(L, a.pid).ko} 편들기`, hint: (L, a) => `${P(L, a.pid).ko} 컨디션 +2·${P(L, a.pid2).ko} −2(30일) · 신뢰 −8·갈등 +10`, fx(L, a) { const p = P(L, a.pid), c = P(L, a.pid2); mood(L, p, 2, 30); mood(L, c, -2, 30); addLoy(L, c, 'battery', -3, '리드 논쟁에서 외면받은 기억'); return { g: { trust: -8, tension: 10 }, mem: { side: 'pitcher' }, next: 'rift', wait: 8, msg: `${p.ko}의 의견을 받아들였습니다. ${c.ko}은(는) 자존심이 상했습니다.` }; } },
          { k: 'talk', label: '두 선수 함께 면담(중재)', hint: (L, a) => `성공 ${pct(clamp(0.2 + a.g.trust / 100 * 0.55 + (lead(L, a) ? 0.1 : 0) - a.g.tension / 400, 0.2, 0.85))}(신뢰·성향 반영) → 휴전 / 실패 → 냉각기`,
            fx(L, a) { const p = P(L, a.pid), c = P(L, a.pid2), pr = clamp(0.2 + a.g.trust / 100 * 0.55 + (lead(L, a) ? 0.1 : 0) - a.g.tension / 400, 0.2, 0.85);
              if (rr(L, a, 2) < pr) { mood(L, p, 1, 20); mood(L, c, 1, 20); return { g: { trust: 12, tension: -15 }, mem: { side: 'talk' }, next: 'truce', wait: 6, msg: '면담이 통했습니다. 두 선수가 서로의 방식을 맞춰 보기로 했습니다.' }; }
              mood(L, p, -1, 10); mood(L, c, -1, 10); return { g: { trust: -6, tension: 8 }, mem: { side: 'talkfail' }, next: 'rift', wait: 7, msg: '면담이 겉돌았습니다. 둘 다 표정이 굳었습니다.' }; } },
          { k: 'wait', label: '지켜본다', hint: '갈등 +12 · 불씨가 번져 기사로 나올 수 있음', fx(L, a) { return { g: { tension: 12 }, mem: { side: 'wait' }, next: 'rumor', wait: 6, msg: '일단 지켜보기로 했습니다. 불씨가 남은 채 시간이 흐릅니다.' }; } }
        ]
      },
      rift: {
        act: 2, title: '냉각기', ttl: 8, def: 'let', rec: 'dinner',
        text(L, a) { const p = P(L, a.pid), c = P(L, a.pid2), s = a.mem.side; return `${p.ko}과(와) ${c.ko} 사이의 냉기가 가시지 않습니다${s === 'catcher' ? ` (${c.ko} 편을 든 뒤라 ${p.ko}의 불만이 큽니다)` : s === 'pitcher' ? ` (${p.ko} 편을 든 뒤라 ${c.ko}의 자존심이 상해 있습니다)` : ''}. 신뢰 ${Math.round(a.g.trust)} · 갈등 ${Math.round(a.g.tension)}. 어떻게 풀까요?`; },
        choices: [
          { k: 'rotate', label: '백업 포수를 섞어 기용', req: (L, a) => hasBackupC(L, a) ? null : '쓸 만한 백업 포수가 없음', hint: (L, a) => `${P(L, a.pid).ko} 컨디션 +2·${P(L, a.pid2).ko} −1(30일) · 갈등 −8`, fx(L, a) { mood(L, P(L, a.pid), 2, 30); mood(L, P(L, a.pid2), -1, 30); return { g: { tension: -8 }, next: 'rumor', wait: 6, msg: '백업 포수를 섞어 쓰자 투수의 표정이 밝아졌습니다.' }; } },
          { k: 'dinner', label: '선수단 회식·모임(0.2억)', hint: '신뢰 +8·갈등 −6 · 팀 컨디션 +1(14일)', fx(L, a) { cost(L, 0.2); L.S.teamMood = { v: 1, until: L.S.day + 14 }; L.invalidate(); L._bondShift && L._bondShift(P(L, a.pid), 1, '회식'); return { g: { trust: 8, tension: -6 }, next: 'rumor', wait: 5, msg: '회식 자리에서 분위기가 조금 풀렸습니다.' }; } },
          { k: 'separate', label: (L, a) => `${P(L, a.pid).ko}의 등판은 다른 포수와`, req: (L, a) => hasBackupC(L, a) ? null : '쓸 만한 백업 포수가 없음', hint: '배터리를 분리 · 갈등 −20·신뢰 −5 · 두 선수 사이는 멀어짐', fx(L, a) { mood(L, P(L, a.pid2), -1, 30); return { g: { tension: -20, trust: -5 }, mem: { separated: true }, next: 'turn', wait: 8, msg: '배터리를 갈라놓았습니다. 당장의 갈등은 줄었지만 둘 사이의 거리는 그대로입니다.' }; } },
          { k: 'let', label: '그대로 둔다', hint: '갈등 +8 · 기사가 나올 수 있음', fx(L, a) { return { g: { tension: 8 }, next: 'rumor', wait: 5, msg: '그대로 두었습니다. 냉기가 더 깊어집니다.' }; } }
        ]
      },
      truce: {
        act: 2, title: '휴전', ttl: 8, def: 'rotate', rec: 'pair',
        text(L, a) { const p = P(L, a.pid), c = P(L, a.pid2); return `면담 이후 ${p.ko}과(와) ${c.ko}이(가) 서로 맞춰 보는 중입니다. 신뢰 ${Math.round(a.g.trust)}. 이 흐름을 어떻게 이어 갈까요?`; },
        choices: [
          { k: 'pair', label: '고정 배터리로 밀어 준다', hint: '두 선수 컨디션 +1(45일) · 신뢰 +8 (다시 어긋나면 갈등 +10)', fx(L, a) { mood(L, P(L, a.pid), 1, 45); mood(L, P(L, a.pid2), 1, 45); return { g: { trust: 8 }, mem: { pair: true }, next: 'rumor', wait: 8, msg: '고정 배터리로 밀어 주기로 했습니다.' }; } },
          { k: 'rotate', label: '유연하게 번갈아 쓴다', hint: '신뢰 +2 · 부담 없음', fx(L, a) { return { g: { trust: 2 }, next: 'rumor', wait: 8, msg: '유연하게 번갈아 기용합니다.' }; } }
        ]
      },
      rumor: {
        act: 3, title: '소문', run(L, a) {
          const hot = a.g.tension >= 45 || rr(L, a, 3) < 0.3;
          return hot ? { next: 'press', wait: 2, msg: `${P(L, a.pid).ko}-${P(L, a.pid2).ko} 불화설이 기사로 나왔습니다.` } : { next: 'turn', wait: 4, msg: '다행히 밖으로 새어 나가지 않았습니다.' };
        }
      },
      press: {
        act: 3, title: '언론의 시선', ttl: 6, def: 'silent', rec: 'official',
        text(L, a) { return `"${P(L, a.pid).ko}-${P(L, a.pid2).ko} 배터리, 불화설"이라는 기사가 나왔습니다. 갈등 ${Math.round(a.g.tension)} — ${a.g.tension >= 65 ? '해명이 먹히기 어려운 분위기입니다' : '아직 수습할 여지가 있습니다'}.`; },
        choices: [
          { k: 'official', label: '구단 공식 입장으로 해명', hint: (L, a) => a.g.tension >= 65 ? '갈등이 깊어 해명이 먹히기 어려움(갈등 −2)' : '갈등 −8·신뢰 +3', fx(L, a) { return a.g.tension >= 65 ? { g: { tension: -2 }, next: 'turn', wait: 8, msg: '해명했지만 분위기는 가라앉지 않았습니다.' } : { g: { tension: -8, trust: 3 }, next: 'turn', wait: 8, msg: '공식 해명으로 논란이 가라앉았습니다.' }; } },
          { k: 'silent', label: '대응하지 않는다', hint: '갈등 +6', fx(L, a) { return { g: { tension: 6 }, next: 'turn', wait: 8, msg: '대응하지 않았고 기사는 한동안 회자되었습니다.' }; } },
          { k: 'gag', label: '선수단에 함구령', hint: '갈등 −3·신뢰 −4(선수들이 입을 막는다고 느낌)', fx(L, a) { return { g: { tension: -3, trust: -4 }, next: 'turn', wait: 8, msg: '선수단에 함구령을 내렸습니다.' }; } }
        ]
      },
      turn: {
        act: 4, title: '전환점', run(L, a) {
          const t = a.g.tension, s = a.g.trust;
          if (t >= 62) return { next: 'blow', wait: 3, msg: '쌓여 온 불만이 더는 감춰지지 않습니다.' };
          if (s >= 62 && t <= 40) return { next: 'rapport', wait: 3, msg: '두 선수 사이에 눈에 띄는 변화가 생겼습니다.' };
          return { next: 'standoff', wait: 3, msg: '어느 쪽으로도 기울지 못한 채 시간이 흘렀습니다.' };
        }
      },
      rapport: {
        act: 5, title: '화해', run(L, a) {
          return finB(L, a, 'ok', a.mem.pair ? 'pair' : 'talk', `${P(L, a.pid).ko}과(와) ${P(L, a.pid2).ko}이(가) 서로의 방식을 받아들였습니다. 배터리의 호흡이 눈에 띄게 좋아졌습니다(둘 다 컨디션 +2, 60일, 충성도 +3).`,
            p => { mood(L, p, 2, 60); addLoy(L, p, 'battery', 3, '갈등을 풀고 호흡을 맞췄던 기억'); L._bondShift && L._bondShift(p, 1, '갈등 해소'); }, c => { mood(L, c, 2, 60); addLoy(L, c, 'battery', 3, '갈등을 풀고 호흡을 맞췄던 기억'); });
        }
      },
      standoff: {
        act: 5, title: '교착', ttl: 8, def: 'accept', rec: 'coach',
        text(L, a) { return `갈등은 크게 번지지 않았지만 풀리지도 않았습니다(신뢰 ${Math.round(a.g.trust)} · 갈등 ${Math.round(a.g.tension)}). ${a.mem.separated ? '배터리를 분리한 채라 근본 해결은 아닙니다. ' : ''}마지막으로 어떻게 정리할까요?`; },
        choices: [
          { k: 'coach', label: '코치진 조율(0.3억)', hint: '갈등 −15 → 45 미만이면 화해에 가까운 결말 / 아니면 어정쩡하게 봉합', fx(L, a) { cost(L, 0.3); const t = a.g.tension - 15; return t < 45 ? finB(L, a, 'ok', 'coach', `코치진의 조율로 두 선수가 한발씩 물러섰습니다(둘 다 컨디션 +1, 45일).`, p => mood(L, p, 1, 45), c => mood(L, c, 1, 45)) : finB(L, a, 'mixed', 'coach', '코치진이 중재했지만 앙금은 남았습니다.'); } },
          { k: 'accept', label: '서로 다르다는 걸 인정하고 공존', hint: '결말: 어정쩡한 봉합 · 변화 없음', fx(L, a) { return finB(L, a, 'mixed', 'accept', `서로 다른 스타일을 인정한 채 시즌을 이어 갑니다.`); } }
        ]
      },
      blow: {
        act: 5, title: '터져 버린 불만', ttl: 8, def: 'stand', rec: 'meet',
        text(L, a) {
          const who = a.mem.who = a.mem.who || (a.mem.side === 'catcher' ? a.pid : a.mem.side === 'pitcher' ? a.pid2 : (rr(L, a, 5) < 0.5 ? a.pid : a.pid2)), w = P(L, who);
          return `${w.ko}이(가) 더는 같이 못 하겠다며 이적을 요청했습니다(신뢰 ${Math.round(a.g.trust)} · 갈등 ${Math.round(a.g.tension)}). ${voice(L, w, { clutch: '"여기선 제 가치를 인정받지 못하는 것 같습니다."', shy: '"…죄송합니다. 더는 힘들 것 같습니다."', leader: '"팀을 위해서도 제가 떠나는 게 낫다고 생각합니다."', model: '"원칙대로 구단에 정식 요청드립니다."', free: '"그냥 다른 데서 던지고 싶어요."', def: '' })}`;
        },
        choices: [
          { k: 'meet', label: '감독이 직접 면담', hint: (L, a) => `성공 ${pct(clamp(0.35 + a.g.trust / 200, 0.3, 0.8))}(신뢰 반영): 진정 · 실패: 충성도 −4`, fx(L, a) { const w = P(L, a.mem.who), pr = clamp(0.35 + a.g.trust / 200, 0.3, 0.8);
            if (rr(L, a, 6) < pr) { mood(L, w, 2, 30); addLoy(L, w, 'battery', 3, '이적 요청 때 직접 면담해 준 기억'); return finB(L, a, 'ok', 'meet', `감독의 면담에 ${w.ko}이(가) 마음을 돌렸습니다(컨디션 +2·30일, 충성도 +3).`); }
            mood(L, w, -2, 30); addLoy(L, w, 'battery', -4, '면담에도 풀리지 않았던 기억'); return finB(L, a, 'bad', 'meetfail', `면담에도 ${w.ko}의 마음은 돌아서지 않았습니다(컨디션 −2, 충성도 −4).`); } },
          { k: 'market', label: '트레이드 시장에 내놓는다', hint: '충성도 +2 · 팀 컨디션 −1(14일) · 유대 ↓', fx(L, a) { const w = P(L, a.mem.who); addLoy(L, w, 'battery', 2, '이적 요청을 받아 준 기억'); L.S.teamMood = { v: -1, until: L.S.day + 14 }; L.invalidate(); L._bondShift && L._bondShift(w, -1, '이적 요청'); return finB(L, a, 'mixed', 'market', `${w.ko}을(를) 트레이드 시장에 내놓기로 했습니다. 팀 분위기는 어수선합니다.`); } },
          { k: 'stand', label: '버티게 한다', hint: '충성도 −6 · 컨디션 −2(45일) — 재계약·FA에 크게 불리', fx(L, a) { const w = P(L, a.mem.who); mood(L, w, -2, 45); addLoy(L, w, 'battery', -6, '이적 요청을 외면당한 기억'); return finB(L, a, 'bad', 'stand', `${w.ko}을(를) 버티게 했습니다. 선수의 마음이 크게 식었습니다.`); } }
        ]
      }
    }
  };

  /* ============ 베테랑의 마지막 시즌 (4막·의지/유대 게이지) ============ */
  const pupilOf = (L, a) => { const p = P(L, a.pid); return L.players(L.S.userTeam).filter(x => !x.foreign && x.id !== p.id && x.type === p.type && x.age <= 26).sort((u, v) => L.ovr(v) - L.ovr(u))[0] || null; };
  const finV = (L, a, tone, choice, text, mut) => { const p = P(L, a.pid); p.arcMem = Object.assign(p.arcMem || {}, { vet: { choice, mentored: a.mem.mentored || null, y: L.S.year } }); if (mut) mut(p); L.note(p, `이야기 「베테랑의 마지막 시즌」: ${text}`); return { end: { tone, text }, msg: '' }; };
  const vet = {
    kind: 'vet', title: '베테랑의 마지막 시즌', acts: 4, first: 'hint',
    gauges: [{ k: 'will', label: '현역 의지', good: 'high' }, { k: 'bond', label: '팀 유대', good: 'high' }],
    can(L) {
      const t = L.S.userTeam, c = L.players(t).filter(p => !p.foreign && p.age >= 37 && !(p.arcMem && p.arcMem.vet && L.S.year - p.arcMem.vet.y < 2) && (L._cerTenure(p, t) >= 6 || L.legendBound(p, t))).sort((a, b) => L._cerTenure(b, t) - L._cerTenure(a, t) || b.age - a.age)[0];
      return c ? { pid: c.id } : null;
    },
    trig(L) {   // 반응형: 노장이 부진하거나 부상 중일 때
      const ctx = this.can(L); if (!ctx) return null; const p = P(L, ctx.pid), f = L._arcForm(p); return L.isInj(p) || (f !== null && f <= -0.8) ? ctx : null;
    },
    init(L, a) { const p = P(L, a.pid), t = L.S.userTeam, yrs = L._cerTenure(p, t); return { will: clamp(72 - (p.age - 36) * 5, 20, 72), bond: clamp(40 + yrs * 2, 30, 85) }; },
    nodes: {
      hint: {
        act: 1, title: '은퇴 갈림길', ttl: 8, def: 'wait', rec: 'urge',
        text(L, a) {
          const p = P(L, a.pid), t = L.S.userTeam, lb = L.legendBound(p, t);
          return `${p.ko}(${p.age}세, 구단 ${L._cerTenure(p, t)}시즌${lb ? ` · 영구결번 후보 구단 WAR ${lb.war.toFixed(1)}` : ''})이(가) 올 시즌을 마지막으로 생각하고 있습니다. ${voice(L, p, { clutch: '"한 시즌만 더 던지고 싶은 마음과, 지금이 마지막이라는 마음이 싸웁니다."', shy: '"…제가 팀에 짐이 되는 건 아닌지 걱정입니다."', leader: '"후배들이 자리를 잡았다면 제가 물러날 때가 아닌가 싶습니다."', model: '"몸 상태를 보면 올해가 마지막일 수 있습니다."', free: '"뭐, 언제까지 할 수 있겠어요. 올해가 마지막일지도?"', def: '"올해가 마지막일지도 모르겠습니다."' })}`;
        },
        choices: [
          { k: 'urge', label: '현역 연장을 설득', req: (L, a) => P(L, a.pid).age >= 45 ? '나이가 너무 많아 설득이 어려움' : null, hint: '현역 의지 +15 · 컨디션 +1(30일) · 충성도 +2', fx(L, a) { const p = P(L, a.pid); mood(L, p, 1, 30); adj(p, 2); return { g: { will: 15 }, mem: { first: 'urge' }, next: 'season', wait: 25, msg: `${p.ko}을(를) 설득했습니다. 현역 의지가 살아났습니다.` }; } },
          { k: 'honor', label: '마지막 시즌으로 예우', hint: '현역 의지 −15 · 팀 유대 +8 · 컨디션 +1(40일) · 충성도 +3', fx(L, a) { const p = P(L, a.pid); mood(L, p, 1, 40); adj(p, 3); addLoy(L, p, 'vet', 2, '마지막 시즌을 예우해 준 기억'); return { g: { will: -15, bond: 8 }, mem: { first: 'honor' }, next: 'season', wait: 25, msg: `${p.ko}의 마지막 시즌을 예우하기로 했습니다.` }; } },
          { k: 'wait', label: '본인 결정에 맡긴다', hint: '변화 없음', fx(L, a) { return { mem: { first: 'wait' }, next: 'season', wait: 25, msg: `${P(L, a.pid).ko}의 결정에 맡기기로 했습니다.` }; } }
        ]
      },
      season: {
        act: 2, title: '시즌의 시간', run(L, a) {
          const p = P(L, a.pid), f = L._arcForm(p), inj = L.isInj(p);
          if (inj) return { g: { will: -10 }, next: 'inner', wait: 8, msg: `${p.ko}이(가) 부상으로 빠져 있습니다. 몸이 예전 같지 않다는 생각이 깊어집니다.` };
          if (f !== null && f >= 0.8) return { g: { will: 12, bond: 3 }, next: 'inner', wait: 8, msg: `${p.ko}이(가) 노장의 품격을 보여 주고 있습니다. 은퇴 생각이 흔들립니다.` };
          if (f !== null && f <= -0.8) return { g: { will: -12 }, next: 'inner', wait: 8, msg: `${p.ko}의 기록이 내려앉았습니다. 세월을 실감하는 눈치입니다.` };
          return { next: 'inner', wait: 8, msg: `${p.ko}은(는) 담담하게 시즌을 이어 갑니다.` };
        }
      },
      inner: {
        act: 3, title: '남기고 싶은 것', ttl: 8, def: 'rest', rec: 'talk',
        text(L, a) { const p = P(L, a.pid), y = pupilOf(L, a); a.mem.pupil = y ? y.id : null; return `${p.ko}의 마음이 오락가락합니다(현역 의지 ${Math.round(a.g.will)} · 팀 유대 ${Math.round(a.g.bond)}). ${y ? `${y.ko}(${y.age}세)에게 자기 노하우를 전하고 싶어 하기도 합니다.` : ''} 어떻게 할까요?`; },
        choices: [
          { k: 'mentor', label: (L, a) => `${(P(L, a.mem.pupil) || {}).ko || '후배'}에게 멘토 역할(0.3억)`, req: (L, a) => pupilOf(L, a) ? null : '멘토를 맡길 만한 젊은 선수가 없음', hint: '후배 컨디션 +2(40일) · 팀 유대 +10·현역 의지 +5', fx(L, a) { const y = pupilOf(L, a); cost(L, 0.3); mood(L, y, 2, 40); adj(P(L, a.pid), 1); return { g: { bond: 10, will: 5 }, mem: { mentored: y.id }, next: 'decide', wait: 30, msg: `${P(L, a.pid).ko}이(가) ${y.ko}에게 노하우를 전수합니다.` }; } },
          { k: 'talk', label: '직접 마주 앉아 속마음 듣기', hint: '팀 유대 +6 · 현역 의지는 본인의 마음 쪽으로(높으면 +5, 낮으면 −5)', fx(L, a) { return { g: { bond: 6, will: a.g.will >= 50 ? 5 : -5 }, next: 'decide', wait: 30, msg: `${P(L, a.pid).ko}이(가) 속마음을 털어놓았습니다.` }; } },
          { k: 'rest', label: '후반 관리 위주로', hint: '컨디션 +1(30일) · 현역 의지 +3(몸 부담 ↓)', fx(L, a) { mood(L, P(L, a.pid), 1, 30); return { g: { will: 3 }, next: 'decide', wait: 30, msg: `${P(L, a.pid).ko}의 부담을 줄였습니다.` }; } }
        ]
      },
      decide: {
        act: 4, title: '시즌 말 결단', ttl: 10, def: 'delay',
        text(L, a) { const p = P(L, a.pid), w = a.g.will; return `시즌이 끝나 갑니다. ${p.ko}의 현역 의지는 ${Math.round(w)}, 팀 유대는 ${Math.round(a.g.bond)}입니다. ${w >= 60 ? '본인은 더 뛰고 싶어 합니다.' : w <= 40 ? '본인은 이제 내려놓고 싶어 합니다.' : '본인도 아직 마음을 정하지 못했습니다.'} 어떻게 마무리할까요?`; },
        rec(L, a) { return a.g.will >= 60 ? 'stay' : a.g.will <= 40 ? 'announce' : 'delay'; },
        choices: [
          { k: 'stay', label: '내년도 함께 — 현역 연장', req: (L, a) => a.g.will >= 45 ? null : '본인의 의욕이 낮아 설득이 어려움', hint: '올 시즌 뒤 은퇴 확률 ×0.35(⚠) · 충성도 +2', fx(L, a) { return finV(L, a, 'ok', 'stay', `${P(L, a.pid).ko}이(가) 한 시즌 더 함께하기로 했습니다(올 시즌 뒤 은퇴 확률 크게 낮아짐).`, p => { p.arcRet = { v: 'stay', y: L.S.year }; adj(p, 2); }); } },
          { k: 'announce', label: '예우 속에 은퇴를 발표', hint: '은퇴 확률 ↑(×2.5, 최소 35%) · 은퇴식 때 성대한 행사 추천 · 충성도 +3', fx(L, a) { return finV(L, a, 'ok', 'announce', `${P(L, a.pid).ko}이(가) 이번 시즌을 마지막으로 은퇴하기로 했습니다. 아름다운 마무리가 기다립니다.`, p => { p.arcRet = { v: 'go', y: L.S.year }; adj(p, 3); addLoy(L, p, 'vet', 2, '마지막을 함께해 준 기억'); }); } },
          { k: 'delay', label: '결정을 오프시즌으로 미룬다', hint: '변화 없음 · 은퇴 여부는 시즌 뒤 통상 확률로 정해짐', fx(L, a) { return finV(L, a, 'mixed', 'delay', `${P(L, a.pid).ko}의 거취는 시즌 뒤로 미뤄졌습니다.`); } }
        ]
      }
    }
  };
  proto._arcRegister('battery', graph(battery));
  proto._arcRegister('vet', graph(vet));
});
