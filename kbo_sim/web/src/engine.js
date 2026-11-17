/* KBO 시뮬레이션 엔진 (engine2.py 의 JavaScript 포팅 + 포스트시즌)
 * - 난수: Python random.Random(seed) 와 동일한 Mersenne Twister (random/choices/shuffle/gauss 동일 알고리즘)
 *   → 같은 시드·같은 데이터면 파이썬 엔진과 정규시즌 결과가 완전히 같다.
 * - 정규시즌 코드는 engine2.py 와 1:1 대응. 포스트시즌/추적(TRACK)은 웹용 추가분(난수 순서에 영향 없음).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KBOEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- Python 호환 난수 ---------------- */
  class PyRandom {
    constructor(seed) {
      this.mt = new Uint32Array(624); this.idx = 624; this.gaussNext = null;
      let a = Math.abs(Math.trunc(seed)); const key = [];
      if (a === 0) key.push(0);
      while (a > 0) { key.push(a % 4294967296); a = Math.floor(a / 4294967296); }
      this._initByArray(key);
    }
    _initGenrand(s) {
      const mt = this.mt; mt[0] = s >>> 0;
      for (let i = 1; i < 624; i++) { const p = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = (Math.imul(1812433253, p) + i) >>> 0; }
      this.idx = 624;
    }
    _initByArray(key) {
      this._initGenrand(19650218);
      const mt = this.mt; let i = 1, j = 0, k = Math.max(624, key.length);
      for (; k > 0; k--) {
        const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0;
        i++; j++; if (i >= 624) { mt[0] = mt[623]; i = 1; } if (j >= key.length) j = 0;
      }
      for (k = 623; k > 0; k--) {
        const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
        i++; if (i >= 624) { mt[0] = mt[623]; i = 1; }
      }
      mt[0] = 0x80000000; this.idx = 624;
    }
    _next32() {
      const mt = this.mt;
      if (this.idx >= 624) {
        for (let kk = 0; kk < 624; kk++) {
          const y = (mt[kk] & 0x80000000) | (mt[(kk + 1) % 624] & 0x7fffffff);
          mt[kk] = (mt[(kk + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0;
        }
        this.idx = 0;
      }
      let y = mt[this.idx++];
      y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
      return y >>> 0;
    }
    random() { const a = this._next32() >>> 5, b = this._next32() >>> 6; return (a * 67108864 + b) / 9007199254740992; }
    getrandbits(k) { return this._next32() >>> (32 - k); }
    randbelow(n) { const k = 32 - Math.clz32(n); let r = this.getrandbits(k); while (r >= n) r = this.getrandbits(k); return r; }
    shuffle(x) { for (let i = x.length - 1; i >= 1; i--) { const j = this.randbelow(i + 1); const t = x[i]; x[i] = x[j]; x[j] = t; } }
    gauss(mu, sigma) {
      let z = this.gaussNext; this.gaussNext = null;
      if (z === null) {
        const x2pi = this.random() * 6.283185307179586;
        const g2rad = Math.sqrt(-2.0 * Math.log(1.0 - this.random()));
        z = Math.cos(x2pi) * g2rad; this.gaussNext = Math.sin(x2pi) * g2rad;
      }
      return mu + z * sigma;
    }
    /* random.choices(population, weights)[0] */
    choice(pop, weights) {
      const n = pop.length, cum = new Array(n); let s = 0;
      for (let i = 0; i < n; i++) { s += weights[i]; cum[i] = s; }
      const total = s + 0.0; if (!(total > 0)) throw new Error('total of weights must be greater than zero');
      const x = this.random() * total; let lo = 0, hi = n - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
      return pop[lo];
    }
  }

  /* ---------------- 상수 ---------------- */
  const TEAMS = ['Bears', 'Dinos', 'Eagles', 'Giants', 'Heroes', 'Landers', 'Lions', 'Tigers', 'Twins', 'Wiz'];
  const PARKNAME = { Bears: '잠실', Twins: '잠실', Heroes: '고척', Landers: '문학', Wiz: '수원', Eagles: '대전', Tigers: '광주', Giants: '사직', Dinos: '창원', Lions: '대구' };
  const ORDER = ['C', 'SS', 'CF', '2B', '3B', '1B', 'LF', 'RF'];
  const WD = { '2B': .18, 'SS': .22, '3B': .16, '1B': .07, 'LF': .10, 'CF': .17, 'RF': .10 };
  const ENV = { gdp: 0.185, sf: 0.40, adv13: 0.33, sc2on1: 0.65, sc1on2: 0.48, roe: 0.032, wp: 0.0215, sb_mult: 1.6, prod: 0.30 };
  const K2 = 0.004, BOFF = -0.001;
  const STINT = {
    'Matt Davidson 데이비슨': [['Dinos', 1, 60, 0.93], ['Heroes', 61, 144, 0.81]],
    'Ju-suk Ha 하주석': [['Eagles', 1, 95, 0.25], ['Tigers', 96, 144, 0.96]],
    'Ah-seop Son 손아섭': [['Bears', 1, 144, 54 / 144]], 'Seung Min Ryu 류승민': [['Bears', 1, 144, 43 / 144]],
    'Jeong-bum Lee 이정범': [['Wiz', 1, 144, 9 / 144]]
  };
  const PMOVE = { 'Hyeong-beom Lee 이형범': [['Tigers', 1, 95], ['Eagles', 96, 144]] };
  const odds = p => p / (1 - p);
  const comb = (pb, pp, pl) => { const o = odds(pb) * odds(pp) / odds(pl); return o / (1 + o); };

  /* ---------------- 엔진 ---------------- */
  function createEngine(DATA, modeKey) {
    const M = DATA.modes[modeKey], SH = DATA.shared, F = SH.fielding;
    const LB = M.league_bat, TEAMDEF = M.team_def, ERRLG = F.lg.err, SHARE = F.lg.share, CSLG = F.lg.cs;
    const PFS = {}; for (const t of TEAMS) PFS[t] = M.pf[t];
    let CURPF = PFS.Bears;

    class Bat {
      constructor(x) {
        this.name = x.name; this.key = x.key; this.p = x.p; this.PA = x.PA; this.G = x.G;
        const p = this.p;
        this.obp = p.bb + p.hbp + p.hr + (1 - p.k - p.bb - p.hbp - p.hr) * p.babip * 0.97;
        this.slg = this.obp + 2 * p.hr + p.babip * p.xbh * 0.5;
        const dj = SH.defense[this.key] || {};
        this.gs = {}; let gsum = 0;
        for (const pos in dj) { this.gs[pos] = dj[pos][1]; gsum += dj[pos][1]; }
        const starts = Math.min(x.G, x.PA / 4.15);
        this.dh = Math.max(0.0, starts - gsum);
        this.fr = F.players[this.key] || {};
        const c = F.catchers[this.key]; this.cs = c ? c.cs_reg : CSLG;
        const st = STINT[this.name];
        this.stints = st ? st : [[x.team, 1, 144, Math.min(1.0, Math.min(x.G, x.PA / 4.15) / 144)]];
      }
    }
    class Pit {
      constructor(x) {
        this.name = x.name; this.p = x.p; this.GS = x.GS; this.G = x.G; this.IP = x.IP; this.team = x.team;
        this.ipgs = x.ip_per_start || 5.0; this.relief_ip = Math.max(x.IP - this.ipgs * x.GS, 0.0);
      }
    }
    const bats = M.batters.map(x => new Bat(x));
    const pits = M.pitchers.map(x => new Pit(x));
    const BYT = {}; for (const t of TEAMS) BYT[t] = [];
    for (const b of bats) for (const [t, a, z, pr] of b.stints) { (BYT[t] = BYT[t] || []).push([b, a, z, pr]); }

    function staff(team, g) {
      const S = pits.filter(p => p.team === team);
      for (const p of pits) for (const [t, a, z] of (PMOVE[p.name] || [])) if (t === team && a <= g && g <= z) S.push(p);
      return S;
    }

    function lineup(team, g, rng, post) {
      const cand = [];
      for (const [b, a, z, pr] of BYT[team]) {
        if (a <= g && g <= z && rng.random() < (post ? (pr >= 0.8 ? 1.0 : pr * 0.6) : pr)) cand.push(b);
      }
      if (cand.length < 10) {
        const pool = [];
        for (const [b, a, z, pr] of BYT[team]) if (a <= g && g <= z && !cand.includes(b)) pool.push([b, pr]);
        while (cand.length < 10 && pool.length) {
          const i = rng.choice(pool.map((_, k) => k), pool.map(q => Math.max(q[1], 0.02)));
          cand.push(pool.splice(i, 1)[0][0]);
        }
      }
      const used = new Set(); const assign = [];
      let el = cand.filter(b => b.dh > 0.5), dhb = null;
      if (el.length) { dhb = rng.choice(el, el.map(b => b.dh)); used.add(dhb.key); }
      for (const pos of ORDER) {
        let e2 = cand.filter(b => !used.has(b.key) && (b.gs[pos] || 0) > 0);
        if (!e2.length) e2 = cand.filter(b => !used.has(b.key));
        const w = e2.map(b => (b.gs[pos] || 0) + 0.3);
        const b = rng.choice(e2, w); used.add(b.key); assign.push([b, pos]);
      }
      if (dhb === null) {
        let e3 = cand.filter(b => !used.has(b.key)); if (!e3.length) e3 = assign.map(a => a[0]);
        dhb = rng.choice(e3, e3.map(x => x.PA));
      }
      const L = assign.map(a => a[0]).concat([dhb]);
      L.sort((x, y) => -(x.obp * 2 + x.slg) - -(y.obp * 2 + y.slg));
      return [[L[3], L[1], L[0], L[2], L[4], L[5], L[6], L[7], L[8]], assign];
    }

    function defMods(team, assign) {
      let s = 0.0, e = 0.0, wsum = 0.0, cs = CSLG;
      for (const [b, pos] of assign) {
        const fr = b.fr[pos];
        if (pos === 'C') cs = b.cs;
        if (pos in WD) {
          const rr = fr ? fr.range : 50, avg = (F.team_avg_range[team][pos] !== undefined ? F.team_avg_range[team][pos] : 50);
          s += WD[pos] * (rr - avg) / 10;
        }
        const er = fr ? fr.err_reg : ERRLG[pos];
        e += SHARE[pos] * er / ERRLG[pos]; wsum += SHARE[pos];
      }
      return [(TEAMDEF[team] !== undefined ? TEAMDEF[team] : 0.0) + K2 * s, e / wsum, cs];
    }

    function pa(b, p, rng, dm) {
      const bp = b.p, pp = p.p;
      const k = comb(bp.k, pp.k, LB.k), bb = comb(bp.bb, pp.bb, LB.bb), hbp = comb(bp.hbp, pp.hbp, LB.hbp), hr = comb(bp.hr, pp.hr, LB.hr) * CURPF.hr;
      let r = rng.random();
      if (r < k) return 'K'; r -= k;
      if (r < bb) return 'BB'; r -= bb;
      if (r < hbp) return 'HBP'; r -= hbp;
      if (r < hr) return 'HR';
      let babip = comb(bp.babip, pp.babip, LB.babip); babip = comb(babip, LB.babip + dm[0] + BOFF, LB.babip);
      const xb = bp.xbh, tr = bp.tri;
      const p1 = babip * (1 - xb) * CURPF.b1, p2 = babip * xb * (1 - tr) * CURPF.b2, p3 = babip * xb * tr * CURPF.b3, x = rng.random();
      if (x < p1) return '1B'; if (x < p1 + p2) return '2B'; if (x < p1 + p2 + p3) return '3B';
      if (rng.random() < ENV.roe * dm[1]) return 'ROE';
      return 'OUT';
    }

    class StaffState {
      constructor(S, rng, sp) {
        const st = S.filter(p => p.GS > 0); let rel = S.filter(p => p.relief_ip > 1); this.rel = rel.length ? rel : S;
        this.sp = sp || rng.choice(st, st.map(p => p.GS));
        this.sp_outs = Math.max(3, Math.trunc(rng.gauss(this.sp.ipgs * 3, 4)));
        this.cur = this.sp; this.o = 0; this.runs = 0; this.rng = rng; this.used = new Set([this.sp.name]);
      }
      endInning() {
        this.o += 3;
        if (this.cur === this.sp) { if (this.o >= this.sp_outs || this.runs >= 6) this.change(); }
        else if (this.o >= 3) this.change();
      }
      change() {
        let el = this.rel.filter(p => !this.used.has(p.name)); if (!el.length) el = this.rel;
        this.cur = this.rng.choice(el, el.map(p => p.relief_ip)); this.used.add(this.cur.name); this.o = 0;
      }
    }

    const newStats = () => ({ K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, ROE: 0, OUT: 0, PA: 0, SB: 0, CS: 0, WP: 0, GDP: 0, SF: 0 });
    let PLAYER = {};   // 선수별 누적 (웹 추가: 난수 무관)
    const track = (b, e) => { const c = PLAYER[b.key] || (PLAYER[b.key] = { PA: 0, K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, ROE: 0, OUT: 0, SF: 0 }); c.PA++; c[e]++; return c; };

    function half(L, idx, ss, rng, stats, dm, limit, lineLog) {
      let outs = 0; const bases = [null, null, null]; let runs = 0;
      while (outs < 3) {
        const p = ss.cur, b = L[idx % 9]; idx++;
        if (bases[0] && !bases[1] && outs < 2 && rng.random() < bases[0].p.sba * ENV.sb_mult) {
          if (rng.random() < comb(bases[0].p.sbp, 1 - dm[2], 1 - CSLG)) { bases[1] = bases[0]; bases[0] = null; stats.SB++; }
          else { bases[0] = null; outs++; stats.CS++; }
          if (outs >= 3) { idx--; break; }
        }
        if ((bases[0] || bases[1] || bases[2]) && rng.random() < ENV.wp) {
          stats.WP++;
          if (bases[2]) runs++;
          bases[2] = bases[1]; bases[1] = bases[0]; bases[0] = null;
        }
        const e = pa(b, p, rng, dm); stats.PA++; stats[e]++;
        const tc = track(b, e);
        if (e === 'K') outs++;
        else if (e === 'OUT') {
          if (bases[0] && outs < 2 && rng.random() < ENV.gdp) {
            bases[0] = null; outs += 2; stats.GDP++;
            if (outs >= 3) break;
            if (bases[2]) { runs++; bases[2] = null; }
            if (bases[1]) { bases[2] = bases[1]; bases[1] = null; }
            continue;
          }
          outs++;
          if (outs < 3 && bases[2] && rng.random() < ENV.sf) { runs++; bases[2] = null; stats.SF++; tc.SF++; }
          else {
            if (outs < 3 && bases[1] && !bases[2] && rng.random() < ENV.prod) { bases[2] = bases[1]; bases[1] = null; }
            if (outs < 3 && bases[0] && !bases[1] && rng.random() < ENV.prod * 0.7) { bases[1] = bases[0]; bases[0] = null; }
          }
        } else if (e === 'BB' || e === 'HBP') {
          if (bases[0]) { if (bases[1]) { if (bases[2]) runs++; bases[2] = bases[1]; } bases[1] = bases[0]; }
          bases[0] = b;
        } else if (e === 'HR') { runs += 1 + (bases[0] ? 1 : 0) + (bases[1] ? 1 : 0) + (bases[2] ? 1 : 0); bases[0] = bases[1] = bases[2] = null; }
        else if (e === '3B') { runs += (bases[0] ? 1 : 0) + (bases[1] ? 1 : 0) + (bases[2] ? 1 : 0); bases[0] = null; bases[1] = null; bases[2] = b; }
        else if (e === '2B') {
          runs += (bases[2] ? 1 : 0) + (bases[1] ? 1 : 0); let n3 = null;
          if (bases[0]) { if (rng.random() < ENV.sc1on2) runs++; else n3 = bases[0]; }
          bases[0] = null; bases[1] = b; bases[2] = n3;
        } else {
          if (bases[2]) runs++;
          let n3 = null, n2 = null;
          if (bases[1]) { if (rng.random() < ENV.sc2on1) runs++; else n3 = bases[1]; }
          if (bases[0]) { if (n3 === null && rng.random() < ENV.adv13) n3 = bases[0]; else n2 = bases[0]; }
          bases[0] = b; bases[1] = n2; bases[2] = n3;
        }
        if (limit !== null && runs > limit) break;
      }
      ss.runs += runs;
      return [runs, idx];
    }

    /* 한 경기. o: {maxInn, post, spH, spA}. 반환 [홈득점, 원정득점, {inn, lines}] */
    function game(home, away, gh, ga, rng, stats, o) {
      o = o || {}; const maxInn = o.maxInn || 11, post = !!o.post;
      CURPF = PFS[home];
      const [LH, AH] = lineup(home, gh, rng, post), [LA, AA] = lineup(away, ga, rng, post);
      const SHh = new StaffState(staff(home, gh), rng, o.spH), SAa = new StaffState(staff(away, ga), rng, o.spA);
      const dmH = defMods(home, AH), dmA = defMods(away, AA);
      let rh = 0, ra = 0, ih = 0, ia = 0; const inns = [];
      for (let inn = 1; inn <= maxInn; inn++) {
        let r; [r, ia] = half(LA, ia, SHh, rng, stats, dmH, null); ra += r; SHh.endInning();
        let h = null;
        if (inn >= 9 && rh > ra) { inns.push([r, null]); break; }
        const lim = inn >= 9 ? (ra - rh) : null;
        const away_r = r;
        [r, ih] = half(LH, ih, SAa, rng, stats, dmA, lim); rh += r; SAa.endInning();
        inns.push([away_r, r]);
        if (inn >= 9 && rh !== ra) break;
      }
      const pk = PARKNAME[home]; (PARKR[pk] = PARKR[pk] || [0, 0]); PARKR[pk][0] += rh + ra; PARKR[pk][1] += 1;
      return [rh, ra, { inns, spH: SHh.sp.name, spA: SAa.sp.name }];
    }
    let PARKR = {};

    /* ---------------- 시즌 ---------------- */
    class Season {
      constructor(seed) {
        this.seed = seed; this.rng = new PyRandom(seed);
        const sched = [];
        TEAMS.forEach((a, i) => { for (const b of TEAMS.slice(i + 1)) for (let k = 0; k < 16; k++) sched.push(k % 2 === 0 ? [a, b] : [b, a]); });
        this.rng.shuffle(sched); this.sched = sched; this.pos = 0;
        this.gn = {}; this.rec = {}; this.h2h = {};
        for (const t of TEAMS) { this.gn[t] = 0; this.rec[t] = [0, 0, 0, 0, 0]; this.h2h[t] = {}; for (const u of TEAMS) this.h2h[t][u] = [0, 0, 0]; }
        this.stats = newStats(); this.results = [];
        PLAYER = {}; PARKR = {};
      }
      get done() { return this.pos >= this.sched.length; }
      play(n) {
        const end = Math.min(this.sched.length, this.pos + n);
        for (; this.pos < end; this.pos++) {
          const [h, a] = this.sched[this.pos];
          this.gn[h]++; this.gn[a]++;
          const [rh, ra] = game(h, a, this.gn[h], this.gn[a], this.rng, this.stats, null);
          const R = this.rec; R[h][3] += rh; R[h][4] += ra; R[a][3] += ra; R[a][4] += rh;
          if (rh > ra) { R[h][0]++; R[a][1]++; this.h2h[h][a][0]++; this.h2h[a][h][1]++; }
          else if (ra > rh) { R[a][0]++; R[h][1]++; this.h2h[a][h][0]++; this.h2h[h][a][1]++; }
          else { R[h][2]++; R[a][2]++; this.h2h[h][a][2]++; this.h2h[a][h][2]++; }
          this.results.push([h, a, rh, ra]);
        }
        return this.done;
      }
      playAll() { return this.play(1e9); }
      /* 순위: 승률 → 상대전적 → 득실차 → (그래도 같으면 팀명 순) */
      standings() {
        const R = this.rec, pct = t => (R[t][0] + R[t][1]) ? R[t][0] / (R[t][0] + R[t][1]) : 0;
        const order = TEAMS.slice().sort((x, y) => {
          if (pct(y) !== pct(x)) return pct(y) - pct(x);
          const hx = this.h2h[x][y], hy = hx[0] + hx[1] ? hx[0] / (hx[0] + hx[1]) : 0.5;
          if (hy !== 0.5) return 0.5 - hy < 0 ? -1 : 1;
          const dx = R[x][3] - R[x][4], dy = R[y][3] - R[y][4];
          if (dx !== dy) return dy - dx;
          return x < y ? -1 : 1;
        });
        return order.map((t, i) => ({ rank: i + 1, team: t, w: R[t][0], l: R[t][1], d: R[t][2], pct: pct(t), rs: R[t][3], ra: R[t][4] }));
      }
    }

    /* ---------------- 포스트시즌 ---------------- */
    // 로테이션: 시즌 선발 이닝(GS×이닝/선발) 상위 4명. 라인업: 주전(출전확률 0.8↑)은 항상 출전.
    const ROT = {};
    function rotation(team) {
      if (!ROT[team]) ROT[team] = staff(team, 144).filter(p => p.GS > 0).sort((a, b) => b.GS * b.ipgs - a.GS * a.ipgs).slice(0, 4);
      return ROT[team];
    }
    function playPostGame(home, away, sp, rng, stats) {
      const spH = rotation(home)[sp[home]++ % 4], spA = rotation(away)[sp[away]++ % 4];
      const [rh, ra, info] = game(home, away, 144, 144, rng, stats, { maxInn: 15, post: true, spH, spA });
      return { home, away, rh, ra, inns: info.inns, spH: info.spH, spA: info.spA };
    }
    // hi: 상위 시드, lo: 하위 시드, need: 선승 수, pattern: 'H'=상위 시드 홈
    function playSeries(name, hi, lo, need, pattern, rng, stats) {
      const w = { [hi]: 0, [lo]: 0 }, sp = { [hi]: 0, [lo]: 0 }, games = []; let slot = 0, guard = 0;
      while (w[hi] < need && w[lo] < need && guard++ < 40) {
        const hiHome = pattern[slot % pattern.length] === 'H';
        const g = playPostGame(hiHome ? hi : lo, hiHome ? lo : hi, sp, rng, stats);
        if (g.rh === g.ra) { g.draw = true; games.push(g); continue; }      // 무승부: 승패 불인정, 같은 경기 재편성
        const winner = g.rh > g.ra ? g.home : g.away; w[winner]++; games.push(g); slot++;
      }
      return { name, hi, lo, need, games, wins: { [hi]: w[hi], [lo]: w[lo] }, winner: w[hi] >= need ? hi : lo };
    }
    // 와일드카드 결정전: 4위(hi)는 1승을 안고 시작, 최대 2경기(모두 4위 홈). 5위(lo)는 2연승해야 진출.
    function playWildcard(hi, lo, rng, stats) {
      const sp = { [hi]: 0, [lo]: 0 }, games = []; let loWins = 0, hiAdv = false;
      for (let i = 0; i < 2 && !hiAdv; i++) {
        const g = playPostGame(hi, lo, sp, rng, stats);
        if (g.rh === g.ra) g.draw = true; else if (g.rh > g.ra) hiAdv = true; else loWins++;
        games.push(g);
      }
      const winner = (hiAdv || loWins < 2) ? hi : lo;
      return { name: '와일드카드 결정전', hi, lo, need: 2, wcAdvantage: true, games, wins: { [hi]: 1 + (games.filter(g => !g.draw && g.rh > g.ra).length), [lo]: loWins }, winner };
    }
    function playPostseason(season) {
      const st = season.standings(), T = i => st[i].team, rng = season.rng, stats = newStats();
      const rounds = [];
      const wc = playWildcard(T(3), T(4), rng, stats); rounds.push(wc);
      const sf = playSeries('준플레이오프', T(2), wc.winner, 3, ['H', 'H', 'L', 'L', 'H'], rng, stats); rounds.push(sf);
      const po = playSeries('플레이오프', T(1), sf.winner, 3, ['H', 'H', 'L', 'L', 'H'], rng, stats); rounds.push(po);
      const ks = playSeries('한국시리즈', T(0), po.winner, 4, ['H', 'H', 'L', 'L', 'L', 'H', 'H'], rng, stats); rounds.push(ks);
      return { rounds, champion: ks.winner, runnerUp: ks.winner === ks.hi ? ks.lo : ks.hi, seeds: st.slice(0, 5).map(s => s.team) };
    }

    function leaders(season, minPAperG) {
      const g = 144, minPA = Math.round(3.1 * g * (minPAperG === undefined ? 1 : minPAperG)), out = [];
      for (const b of bats) {
        const c = PLAYER[b.key]; if (!c || !c.PA) continue;
        const ab = c.PA - c.BB - c.HBP - c.SF, h = c['1B'] + c['2B'] + c['3B'] + c.HR;
        const tb = c['1B'] + 2 * c['2B'] + 3 * c['3B'] + 4 * c.HR;
        const obp = (h + c.BB + c.HBP) / c.PA, slg = ab ? tb / ab : 0;
        out.push({ key: b.key, name: b.name.split(' ').pop(), team: b.stints[b.stints.length - 1][0], PA: c.PA, AB: ab, H: h, HR: c.HR, BB: c.BB, K: c.K, avg: ab ? h / ab : 0, obp, slg, ops: obp + slg, qualified: c.PA >= minPA });
      }
      return out;
    }

    return {
      TEAMS, PARKNAME, PyRandom, Season, playPostseason, leaders, game, newStats,
      parkRuns: () => PARKR, teamOf: t => t,
      bats: () => bats, pits: () => pits
    };
  }

  return { createEngine, PyRandom, TEAMS, PARKNAME };
});
