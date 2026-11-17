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
        this.name = x.name; this.key = x.key; this.id = x.id !== undefined ? x.id : x.key; this.p = x.p; this.PA = x.PA; this.G = x.G; this.team = x.team;
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
        const st = M.noStint ? null : STINT[this.name];
        this.stints = st ? st : [[x.team, 1, 144, Math.min(1.0, Math.min(x.G, x.PA / 4.15) / 144)]];
      }
    }
    class Pit {
      constructor(x) {
        this.name = x.name; this.id = x.id !== undefined ? x.id : x.name; this.p = x.p; this.GS = x.GS; this.G = x.G; this.IP = x.IP; this.team = x.team; this.stamina = x.stamina;
        this.ipgs = x.ip_per_start || 5.0; this.relief_ip = Math.max(x.IP - this.ipgs * x.GS, 0.0);
      }
    }
    const bats = M.batters.map(x => new Bat(x));
    const pits = M.pitchers.map(x => new Pit(x));
    const batById = {}, pitById = {}; for (const b of bats) batById[b.id] = b; for (const p of pits) pitById[p.id] = p;
    const BYT = {}; for (const t of TEAMS) BYT[t] = [];
    for (const b of bats) for (const [t, a, z, pr] of b.stints) { (BYT[t] = BYT[t] || []).push([b, a, z, pr]); }

    function staff(team, g) {
      const S = pits.filter(p => p.team === team);
      for (const p of pits) if (!M.noStint) for (const [t, a, z] of (PMOVE[p.name] || [])) if (t === team && a <= g && g <= z) S.push(p);
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

    function defMods(team, assign, penal) {
      let s = 0.0, e = 0.0, wsum = 0.0, cs = CSLG;
      for (const [b, pos] of assign) {
        let fr = b.fr[pos];
        if (penal && !fr && !((b.gs[pos] || 0) > 0)) { const PR = { SS: 22, '2B': 26, '3B': 28, CF: 24, LF: 36, RF: 36, '1B': 44, C: 40 }, PE = { SS: 2.2, '2B': 2.2, '3B': 2.2, CF: 1.8, LF: 1.5, RF: 1.5, '1B': 1.2, C: 1.6 }; fr = { range: PR[pos] || 40, err_reg: ERRLG[pos] * (PE[pos] || 1.6), pen: true }; }
        if (pos === 'C') cs = (penal && fr && fr.pen) ? CSLG * 0.55 : b.cs;
        if (pos in WD) {
          const rr = fr ? fr.range : 50, avg = (F.team_avg_range[team][pos] !== undefined ? F.team_avg_range[team][pos] : 50);
          s += WD[pos] * (rr - avg) / 10;
        }
        const er = fr ? fr.err_reg : ERRLG[pos];
        e += SHARE[pos] * er / ERRLG[pos]; wsum += SHARE[pos];
      }
      return [(TEAMDEF[team] !== undefined ? TEAMDEF[team] : 0.0) - K2 * s, e / wsum, cs];
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
    let PLAYER = {}, PITCH = {};   // 선수별 누적 (난수와 무관)
    const track = (b, e) => { const c = PLAYER[b.id] || (PLAYER[b.id] = { PA: 0, K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, ROE: 0, OUT: 0, SF: 0, RBI: 0, SB: 0, CS: 0 }); c.PA++; c[e]++; return c; };
    const trackRun = (b, k) => { const c = PLAYER[b.id] || (PLAYER[b.id] = { PA: 0, K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, ROE: 0, OUT: 0, SF: 0, RBI: 0, SB: 0, CS: 0 }); c[k]++; };
    const trackP = (p, e, outs, runs) => {
      const c = PITCH[p.id] || (PITCH[p.id] = { BF: 0, K: 0, BB: 0, HBP: 0, H: 0, HR: 0, outs: 0, R: 0 });
      if (e) { c.BF++; if (e === 'K') c.K++; else if (e === 'BB') c.BB++; else if (e === 'HBP') c.HBP++; else if (e === 'HR') { c.H++; c.HR++; } else if (e === '1B' || e === '2B' || e === '3B') c.H++; }
      c.outs += outs; c.R += runs;
    };

    /* 한 타석의 결과를 주자·아웃·득점에 반영. 반환: 'END'(이닝 종료) | 'CONT'(병살: 득점 한도 검사 생략) | null */
    function applyEvent(h, e, b, rng, stats, tc) {
      const bases = h.bases;
      if (e === 'K') h.outs++;
      else if (e === 'OUT') {
        if (bases[0] && h.outs < 2 && rng.random() < ENV.gdp) {
          bases[0] = null; h.outs += 2; stats.GDP++;
          if (h.outs >= 3) return 'END';
          if (bases[2]) { h.runs++; bases[2] = null; }
          if (bases[1]) { bases[2] = bases[1]; bases[1] = null; }
          return 'CONT';
        }
        h.outs++;
        if (h.outs < 3 && bases[2] && rng.random() < ENV.sf) { h.runs++; bases[2] = null; stats.SF++; tc.SF++; }
        else {
          if (h.outs < 3 && bases[1] && !bases[2] && rng.random() < ENV.prod) { bases[2] = bases[1]; bases[1] = null; }
          if (h.outs < 3 && bases[0] && !bases[1] && rng.random() < ENV.prod * 0.7) { bases[1] = bases[0]; bases[0] = null; }
        }
      } else if (e === 'BB' || e === 'HBP') {
        if (bases[0]) { if (bases[1]) { if (bases[2]) h.runs++; bases[2] = bases[1]; } bases[1] = bases[0]; }
        bases[0] = b;
      } else if (e === 'HR') { h.runs += 1 + (bases[0] ? 1 : 0) + (bases[1] ? 1 : 0) + (bases[2] ? 1 : 0); bases[0] = bases[1] = bases[2] = null; }
      else if (e === '3B') { h.runs += (bases[0] ? 1 : 0) + (bases[1] ? 1 : 0) + (bases[2] ? 1 : 0); bases[0] = null; bases[1] = null; bases[2] = b; }
      else if (e === '2B') {
        h.runs += (bases[2] ? 1 : 0) + (bases[1] ? 1 : 0); let n3 = null;
        if (bases[0]) { if (rng.random() < ENV.sc1on2) h.runs++; else n3 = bases[0]; }
        bases[0] = null; bases[1] = b; bases[2] = n3;
      } else {
        if (bases[2]) h.runs++;
        let n3 = null, n2 = null;
        if (bases[1]) { if (rng.random() < ENV.sc2on1) h.runs++; else n3 = bases[1]; }
        if (bases[0]) { if (n3 === null && rng.random() < ENV.adv13) n3 = bases[0]; else n2 = bases[0]; }
        bases[0] = b; bases[1] = n2; bases[2] = n3;
      }
      return null;
    }

    /* 반 이닝의 한 반복(도루/폭투 + 타석 1회). 반환 true 면 반 이닝 종료. h: {L, idx, outs, bases, runs, limit, log} */
    function advance(h, ss, rng, stats, dm) {
      const p = ss.cur, b = h.L[h.idx % 9], bases = h.bases, r0 = h.runs, o0 = h.outs; h.idx++;
      if (bases[0] && !bases[1] && h.outs < 2 && rng.random() < bases[0].p.sba * ENV.sb_mult) {
        const runner = bases[0];
        if (rng.random() < comb(runner.p.sbp, 1 - dm[2], 1 - CSLG)) { bases[1] = runner; bases[0] = null; stats.SB++; trackRun(runner, 'SB'); if (h.log) h.log.push({ k: 'SB', b: runner }); }
        else { bases[0] = null; h.outs++; stats.CS++; trackRun(runner, 'CS'); if (h.log) h.log.push({ k: 'CS', b: runner }); }
        if (h.outs >= 3) { h.idx--; trackP(p, null, h.outs - o0, h.runs - r0); return true; }
      }
      if ((bases[0] || bases[1] || bases[2]) && rng.random() < ENV.wp) {
        stats.WP++;
        if (bases[2]) h.runs++;
        bases[2] = bases[1]; bases[1] = bases[0]; bases[0] = null;
        if (h.log) h.log.push({ k: 'WP' });
      }
      const e = pa(b, p, rng, dm); stats.PA++; stats[e]++;
      const tc = track(b, e), rb = h.runs, oa = h.outs;
      const sig = applyEvent(h, e, b, rng, stats, tc);
      if (e !== 'ROE' && sig !== 'CONT') tc.RBI += h.runs - rb;
      trackP(p, e, h.outs - o0, h.runs - r0);
      if (h.log) h.log.push({ k: 'PA', b, p, e, runs: h.runs - rb, outs: h.outs, dout: h.outs - oa });
      if (sig === 'END') return true;
      if (sig === 'CONT') return false;
      return h.limit !== null && h.runs > h.limit;
    }

    function half(L, idx, ss, rng, stats, dm, limit) {
      const h = { L, idx, outs: 0, bases: [null, null, null], runs: 0, limit, log: null };
      while (h.outs < 3) { if (advance(h, ss, rng, stats, dm)) break; }
      ss.runs += h.runs;
      return [h.runs, h.idx];
    }

    /* 한 경기. o: {maxInn, post, spH, spA}. 반환 [홈득점, 원정득점, {inns, spH, spA}] */
    function game(home, away, gh, ga, rng, stats, o) {
      o = o || {}; const maxInn = o.maxInn || 11, post = !!o.post;
      CURPF = PFS[home];
      const [LH, AH] = lineup(home, gh, rng, post), [LA, AA] = lineup(away, ga, rng, post);
      const SHh = new StaffState(staff(home, gh), rng, o.spH), SAa = new StaffState(staff(away, ga), rng, o.spA);
      const dmH = defMods(home, AH), dmA = defMods(away, AA);
      let rh = 0, ra = 0, ih = 0, ia = 0; const inns = [];
      for (let inn = 1; inn <= maxInn; inn++) {
        let r; [r, ia] = half(LA, ia, SHh, rng, stats, dmH, null); ra += r; SHh.endInning();
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

    /* ---------------- 타석 단위 경기 (감독 모드) ----------------
     * o: {home, away, lineups:{home:{L,assign}, away:{...}}, staff:{home,away}(StaffState), rng, maxInn, post,
     *     hook:{home,away}(이닝 종료 시 투수 교체 결정 함수, 없으면 StaffState.endInning), penal:{home,away}(낯선 포지션 페널티) }
     * 난수 호출 순서는 game() 과 같아서, 같은 입력이면 같은 결과가 나온다(테스트로 확인). */
    class LiveGame {
      constructor(o) {
        this.home = o.home; this.away = o.away; this.rng = o.rng; this.maxInn = o.maxInn || 11; this.hook = o.hook || {}; this.penal = o.penal || {};
        this.L = { home: o.lineups.home.L.slice(), away: o.lineups.away.L.slice() };
        this.assign = { home: o.lineups.home.assign.map(x => x.slice()), away: o.lineups.away.assign.map(x => x.slice()) };
        this.staff = { home: o.staff.home, away: o.staff.away };
        this.idx = { home: 0, away: 0 }; this.score = { home: 0, away: 0 }; this.inns = []; this.inning = 1; this.top = true;
        this.finished = false; this.stats = newStats(); this.log = []; this.curInn = null; this.subs = { home: [], away: [] };
        this._dm();
        this._startHalf();
      }
      _dm() { this.dm = { home: defMods(this.home, this.assign.home, this.penal.home), away: defMods(this.away, this.assign.away, this.penal.away) }; }
      get batSide() { return this.top ? 'away' : 'home'; }
      get fldSide() { return this.top ? 'home' : 'away'; }
      get batter() { return this.L[this.batSide][this.idx[this.batSide] % 9]; }
      get pitcher() { return this.staff[this.fldSide].cur; }
      get outs() { return this.h.outs; }
      get bases() { return this.h.bases; }
      _startHalf() {
        const bat = this.batSide;
        this.h = { L: this.L[bat], idx: this.idx[bat], outs: 0, bases: [null, null, null], runs: 0, limit: (!this.top && this.inning >= 9) ? this.score.away - this.score.home : null, log: [] };
      }
      _flush() { const l = this.h.log; this.h.log = []; this.log.push(...l); return l; }
      _endHalf() {
        const bat = this.batSide, fld = this.fldSide, ss = this.staff[fld], r = this.h.runs;
        ss.runs += r; this.score[bat] += r; this.idx[bat] = this.h.idx;
        if (this.top) this.curInn = [r, null]; else { this.curInn[1] = r; this.inns.push(this.curInn); }
        if (this.hook[fld]) this.hook[fld](this, ss); else ss.endInning();
        if (this.top) {
          if (this.inning >= 9 && this.score.home > this.score.away) { this.inns.push(this.curInn); this.finished = true; return; }
          this.top = false;
        } else {
          if (this.inning >= 9 && this.score.home !== this.score.away) { this.finished = true; return; }
          if (this.inning >= this.maxInn) { this.finished = true; return; }
          this.inning++; this.top = true;
        }
        this._startHalf();
      }
      _after(ended) { this.idx[this.batSide] = this.h.idx; if (ended || this.h.outs >= 3) this._endHalf(); return this._flush(); }
      /* 한 타석 진행 */
      _pre() { const fld = this.fldSide; if (!this.h.preDone) { this.h.preDone = true; if (this.pre && this.pre[fld]) this.pre[fld](this, this.staff[fld]); } }
      step() {
        if (this.finished) return [];
        this._pre(); CURPF = PFS[this.home];
        const ended = advance(this.h, this.staff[this.fldSide], this.rng, this.stats, this.dm[this.fldSide]);
        return this._after(ended);
      }
      playInning() { const s = this.inning, t = this.top, out = []; while (!this.finished && this.inning === s && this.top === t) out.push(...this.step()); return out; }
      playToEnd() { const out = []; while (!this.finished) out.push(...this.step()); return out; }
      /* ---- 감독 개입 ---- */
      changePitcher(side, pit) { if (side === this.fldSide) this.h.preDone = true; const ss = this.staff[side]; ss.cur = pit; ss.used.add(pit.name); ss.o = 0; this.log.push({ k: 'PC', side, p: pit }); return [{ k: 'PC', side, p: pit }]; }
      pinchHit(side, slot, nb) {   // 타순 slot(0~8) 선수를 nb 로 교체. 수비 위치도 nb 가 이어받는다.
        const old = this.L[side][slot]; this.L[side][slot] = nb;
        const as = this.assign[side].find(x => x[0] === old); if (as) as[0] = nb;
        if (side === this.batSide) this.h.L = this.L[side];
        this.subs[side].push({ out: old, in: nb, slot }); this._dm(); const e = { k: 'PH', side, out: old, in: nb }; this.log.push(e); return [e];
      }
      swapField(side, slot, nb, pos) {   // 수비 교체(타순 slot 선수를 nb 가 pos 에서 대신)
        return this.pinchHit(side, slot, nb);
      }
      _finishTactic() { return this._after(false); }
      ibb() {
        this._pre(); CURPF = PFS[this.home]; const h = this.h, b = this.batter, ss = this.staff[this.fldSide], r0 = h.runs; h.idx++;
        this.stats.PA++; this.stats.BB++; const tc = track(b, 'BB'); applyEvent(h, 'BB', b, this.rng, this.stats, tc); tc.RBI += h.runs - r0;
        trackP(ss.cur, 'BB', 0, h.runs - r0); h.log.push({ k: 'PA', b, p: ss.cur, e: 'IBB', runs: h.runs - r0, outs: h.outs });
        return this._after(h.limit !== null && h.runs > h.limit);
      }
      steal() {   // 선두 주자 도루 시도
        this._pre();
        const h = this.h, bs = h.bases, ss = this.staff[this.fldSide], dm = this.dm[this.fldSide], o0 = h.outs;
        let from = -1; if (bs[1] && !bs[2]) from = 1; else if (bs[0] && !bs[1]) from = 0; if (from < 0 || h.outs >= 2) return [];
        const runner = bs[from], pen = from === 1 ? 0.12 : 0;
        const ok = this.rng.random() < Math.max(0.05, comb(runner.p.sbp, 1 - dm[2], 1 - CSLG) - pen);
        if (ok) { bs[from + 1] = runner; bs[from] = null; this.stats.SB++; trackRun(runner, 'SB'); h.log.push({ k: 'SB', b: runner }); }
        else { bs[from] = null; h.outs++; this.stats.CS++; trackRun(runner, 'CS'); trackP(ss.cur, null, 1, 0); h.log.push({ k: 'CS', b: runner }); }
        return this._after(false);
      }
      bunt() {    // 희생번트(주자 있고 2사 미만)
        this._pre(); CURPF = PFS[this.home]; const h = this.h, bs = h.bases, b = this.batter, ss = this.staff[this.fldSide], r0 = h.runs, o0 = h.outs;
        if (!(bs[0] || bs[1] || bs[2]) || h.outs >= 2) return [];
        const x = this.rng.random(); h.idx++; this.stats.PA++;
        let res;
        if (x < 0.66) {   // 성공: 타자 아웃, 주자 한 베이스씩
          res = 'SH'; h.outs++; if (bs[2]) { h.runs++; bs[2] = null; } if (bs[1]) { bs[2] = bs[1]; bs[1] = null; } if (bs[0]) { bs[1] = bs[0]; bs[0] = null; }
        } else if (x < 0.82) { res = 'OUT'; h.outs++; }                                   // 실패: 타자만 아웃
        else if (x < 0.92) { res = 'FC'; const lead = bs[2] ? 2 : (bs[1] ? 1 : 0); bs[lead] = null; h.outs++; bs[0] = b; } // 야수선택: 선두 주자 아웃
        else { res = '1B'; const e = '1B'; this.stats['1B']++; const tc = track(b, e); applyEvent(h, e, b, this.rng, this.stats, tc); tc.RBI += h.runs - r0; }
        if (res !== '1B') { const c = PLAYER[b.id] || (PLAYER[b.id] = { PA: 0, K: 0, BB: 0, HBP: 0, HR: 0, '1B': 0, '2B': 0, '3B': 0, ROE: 0, OUT: 0, SF: 0, RBI: 0, SB: 0, CS: 0 }); c.PA++; if (res === 'SH') c.SF++; else c.OUT++; }
        trackP(ss.cur, res === '1B' ? '1B' : null, h.outs - o0, h.runs - r0);
        h.log.push({ k: 'PA', b, p: ss.cur, e: res === 'SH' ? '번트' : (res === '1B' ? '번트안타' : (res === 'FC' ? '번트(선택)' : '번트실패')), runs: h.runs - r0, outs: h.outs });
        return this._after(h.limit !== null && h.runs > h.limit);
      }
    }
    // 감독 모드의 AI 경기: game() 과 같은 순서로 라인업·투수를 만든 LiveGame
    function liveAI(home, away, gh, ga, rng, o) {
      o = o || {}; const post = !!o.post;
      const lh = lineup(home, gh, rng, post), la = lineup(away, ga, rng, post);
      const sh = new StaffState(staff(home, gh), rng, o.spH), sa = new StaffState(staff(away, ga), rng, o.spA);
      return new LiveGame({ home, away, lineups: { home: { L: lh[0], assign: lh[1] }, away: { L: la[0], assign: la[1] } }, staff: { home: sh, away: sa }, rng, maxInn: o.maxInn || 11 });
    }
    function makeLineup(spec) {   // spec: [{id,pos}]*9 (타순 순서, pos: 'C','1B',…,'DH')
      const L = [], assign = [];
      for (const s of spec) { const b = batById[s.id]; if (!b) throw new Error('선수 없음 ' + s.id); L.push(b); if (s.pos !== 'DH') assign.push([b, s.pos]); }
      return { L, assign };
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
        PLAYER = {}; PITCH = {}; PARKR = {};
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
        const c = PLAYER[b.id]; if (!c || !c.PA) continue;
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
      bats: () => bats, pits: () => pits,
      LiveGame, StaffState, liveAI, makeLineup, defMods, staff, lineup, batById, pitById, pfs: PFS,
      tracking: () => ({ bat: PLAYER, pit: PITCH }), resetTracking: () => { PLAYER = {}; PITCH = {}; }
    };
  }

  return { createEngine, PyRandom, TEAMS, PARKNAME };
});
