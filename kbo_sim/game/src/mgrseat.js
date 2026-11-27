/* 감독 자리(47단계): 사용자가 고른 구단의 감독이 된다. 원래 감독(실존 인물)은 퇴임 처리해 우리 구단에서 빼고 감독 후보 명단으로 옮긴다
 *  (사용자의 기용·결정이 실존 감독 이름 아래 기록되지 않도록). 구단을 옮기면 새 구단 감독은 후보로, 원래 구단은 후보 중에서 새 감독을 맞는다.
 *  ⚠ 게임 설정: 시즌 뒤 AI 구단 감독 교체(최하위 50%·9위 25%), 후임은 후보 명단 → 없으면 가상 인물. 단장·사장 업무는 "구단이 신임 감독에게 운영 전권을 맡겼다"는 설정. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) factory(require('./league.js'));
  else factory(root.KBOLeague);
})(typeof self !== 'undefined' ? self : this, function (LG) {
  'use strict';
  const { proto, rngFor, TEAMS, KO0 } = LG.OFFC;
  const jo = (n, a, b) => { const c = String(n).charCodeAt(String(n).length - 1); return n + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b); };
  const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'], GIV = ['성훈', '재원', '동현', '민수', '현우', '정호', '승민', '태영', '준혁', '상철', '기태', '영수'];
  proto.mgrName = function () { return (this.S.mgrName || '나').slice(0, 10); };
  proto._mgrPool = function () { const C = this.S.coach; return C ? (C.pool = C.pool || []) : []; };
  proto._mgrNew = function (salt) { const r = rngFor(this.S.seed, this.S.year, 7700 + (salt || 0)); return { name: SUR[Math.floor(r.random() * SUR.length)] + GIV[Math.floor(r.random() * GIV.length)], src: '', virtual: true }; };
  /* 우리 구단 감독 = 사용자. 원래 감독은 퇴임 → 후보 명단. 이미 사용자면 이름만 맞춘다 */
  proto._mgrSeat = function () {
    const S = this.S, C = S.coach, t = S.userTeam; if (!C || !C.mgr) return;
    const cur = C.mgr[t]; if (cur && cur.user) { cur.name = this.mgrName(); return; }
    if (cur) { this._mgrPool().push(Object.assign({}, cur, { from: t, y: S.year, why: '퇴임' })); }
    C.mgr[t] = { name: this.mgrName(), user: true, since: S.year };
    if (this.lgNews && cur) { const it = this.lgNews('감독', `${KO0[t]}, 새 사령탑 체제 — ${cur.name} 감독 퇴임`, '', { teams: [t], imp: 3 }); it.intro = { team: t, old: cur.name }; this._mgrIntroBody(it); }
  };
  proto._mgrIntroBody = function (it) { it.body = `${jo(KO0[it.intro.team], '이', '가')} ${it.intro.old} 감독의 후임으로 ${this.mgrName()} 신임 감독을 선임했습니다. 구단은 신임 감독에게 선수단 구성과 운영 전권을 맡기기로 했습니다.`; };
  proto.setMgrName = function (n) { const S = this.S; S.mgrName = String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 10) || '나'; const C = S.coach; if (C && C.mgr && C.mgr[S.userTeam] && C.mgr[S.userTeam].user) C.mgr[S.userTeam].name = S.mgrName; for (const it of S.lgnews || []) if (it.intro) this._mgrIntroBody(it); return S.mgrName; };
  /* 구단 이동: off_goals.takeOverTeam 을 감싼다 */
  const _take = proto.takeOverTeam;
  proto.takeOverTeam = function (t) {
    const S = this.S, old = S.userTeam, C = S.coach, prev = C && C.mgr ? C.mgr[t] : null;
    const ok = _take.call(this, t); if (!ok || !C || !C.mgr) return ok;
    const pool = this._mgrPool(), nx = pool.length ? pool.shift() : this._mgrNew(TEAMS.indexOf(old));
    C.mgr[old] = { name: nx.name, src: nx.src || '', virtual: !!nx.virtual, since: S.year };
    if (prev && !prev.user) pool.push(Object.assign({}, prev, { from: t, y: S.year, why: '경질' }));
    C.mgr[t] = { name: this.mgrName(), user: true, since: S.year };
    if (this.lgNews) { this.lgNews('감독', `${this.mgrName()} 감독, ${KO0[t]} 지휘봉 잡는다`, `${jo(KO0[old], '을', '를')} 떠난 ${this.mgrName()} 감독이 ${KO0[t]}의 새 사령탑이 됐습니다.${prev ? ` 전임 ${prev.name} 감독은 물러났습니다.` : ''} ${jo(KO0[old], '은', '는')} ${nx.name} 감독을 선임했습니다.`, { teams: [t, old], imp: 3 }); }
    return ok;
  };
  /* 시즌 뒤 AI 구단 감독 교체 */
  proto._mgrOffseason = function () {
    const S = this.S, C = S.coach; if (!C || !C.mgr) return; const st = this.standings();
    for (const x of st) { if (x.team === S.userTeam) continue; const p = x.rank === 10 ? 0.5 : x.rank === 9 ? 0.25 : 0; if (!p) continue;
      if (rngFor(S.seed, S.year, 7600 + TEAMS.indexOf(x.team)).random() >= p) continue;
      const old = C.mgr[x.team], pool = this._mgrPool(), i = pool.findIndex(m => m.from !== x.team), nx = i >= 0 ? pool.splice(i, 1)[0] : this._mgrNew(TEAMS.indexOf(x.team));
      if (old) pool.push(Object.assign({}, old, { from: x.team, y: S.year, why: '경질' })); C.mgr[x.team] = { name: nx.name, src: nx.src || '', virtual: !!nx.virtual, since: S.year + 1 };
      if (S.mgrStyle) delete S.mgrStyle[x.team];   // 새 감독은 성향도 새로
      if (this.lgNews) this.lgNews('감독', `${KO0[x.team]}, ${old ? old.name + ' 감독 경질' : '감독 교체'} — 후임 ${nx.name}`, `${x.rank}위(${x.w}승 ${x.l}패)로 시즌을 마친 ${jo(KO0[x.team], '이', '가')} 사령탑을 바꿨습니다.${nx.from ? ` 신임 ${nx.name} 감독은 ${jo(KO0[nx.from], '을', '를')} 이끈 경험이 있습니다.` : ''}`, { teams: [x.team], imp: 2 });
    }
  };
});
