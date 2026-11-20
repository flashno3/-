import json,random,collections,math,os,sys,time
RAT=os.environ.get('RAT','ratings_replay.json'); K2=float(os.environ.get('K2','0.004')); TRACK=int(os.environ.get('TRACK','0'))
USE_FIELD=int(os.environ.get('FIELD','1'));PARKMODE=os.environ.get('PARK','y2026');BOFF=float(os.environ.get('BOFF','0.003'))
R=json.load(open(RAT,encoding='utf8'));F=json.load(open('fielding.json',encoding='utf8'))
DEFJ=json.load(open('defense_parsed.json',encoding='utf8'))['D'];POSL=json.load(open('positions.json'))
LB=R['league_bat'];TEAMDEF=R['team_def']
TEAMS=['Bears','Dinos','Eagles','Giants','Heroes','Landers','Lions','Tigers','Twins','Wiz']
_PK=json.load(open('parks.json',encoding='utf8'))
PFS=({t:_PK[PARKMODE]['pf_by_team'][t] for t in TEAMS} if PARKMODE!='none' else {t:{'hr':1.0,'b1':1.0,'b2':1.0,'b3':1.0,'runs':1.0} for t in TEAMS})
PARKNAME={'Bears':'잠실','Twins':'잠실','Heroes':'고척','Landers':'문학','Wiz':'수원','Eagles':'대전','Tigers':'광주','Giants':'사직','Dinos':'창원','Lions':'대구'}
CURPF=PFS['Bears'];PARKR=collections.defaultdict(lambda:[0,0])
POSMAP={'포수':'C','1루수':'1B','2루수':'2B','유격수':'SS','3루수':'3B','좌익수':'LF','중견수':'CF','우익수':'RF'}
WD={'2B':.18,'SS':.22,'3B':.16,'1B':.07,'LF':.10,'CF':.17,'RF':.10}
ERRLG=F['lg']['err'];SHARE=F['lg']['share'];CSLG=F['lg']['cs']
# stints: (team, first_game, last_game, prob of playing on a given day)
STINT={'Matt Davidson 데이비슨':[('Dinos',1,60,0.93),('Heroes',61,144,0.81)],
       'Ju-suk Ha 하주석':[('Eagles',1,95,0.25),('Tigers',96,144,0.96)],
       'Ah-seop Son 손아섭':[('Bears',1,144,54/144)],'Seung Min Ryu 류승민':[('Bears',1,144,43/144)],
       'Jeong-bum Lee 이정범':[('Wiz',1,144,9/144)]}
PMOVE={'Hyeong-beom Lee 이형범':[('Tigers',1,95),('Eagles',96,144)]}
ENV={'gdp':0.185,'sf':0.40,'adv13':0.33,'sc2on1':0.65,'sc1on2':0.48,'roe':0.016,'hrs':0.88,'wp':0.0215,'sb_mult':1.6,'prod':0.30}
odds=lambda p:p/(1-p)
def comb(pb,pp,pl):
    o=odds(pb)*odds(pp)/odds(pl);return o/(1+o)
class Bat:
    def __init__(s,x):
        s.name=x['name'];s.key=x['key'];s.p=x['p'];s.PA=x['PA'];s.G=x['G']
        p=s.p;s.obp=p['bb']+p['hbp']+p['hr']+(1-p['k']-p['bb']-p['hbp']-p['hr'])*p['babip']*0.97
        s.slg=s.obp+2*p['hr']+p['babip']*p['xbh']*0.5
        s.ip={POSMAP[kp]:r['outs']/3 for kp,r in DEFJ.get(s.key,{}).items()}
        s.gs={POSMAP[kp]:r['GS'] for kp,r in DEFJ.get(s.key,{}).items()}
        starts=min(x['G'],x['PA']/4.15);s.dh=max(0.0,starts-sum(s.gs.values()))
        s.fr=F['players'].get(s.key,{});c=F['catchers'].get(s.key);s.cs=c['cs_reg'] if c else CSLG
        st=STINT.get(s.name);s.stints=st if st else [(x['team'],1,144,min(1.0,min(x['G'],x['PA']/4.15)/144))]
class Pit:
    def __init__(s,x):
        s.name=x['name'];s.p=x['p'];s.GS=x['GS'];s.G=x['G'];s.IP=x['IP'];s.team=x['team']
        s.ipgs=x['ip_per_start'] or 5.0;s.relief_ip=max(x['IP']-s.ipgs*s.GS,0.0)
bats=[Bat(x) for x in R['batters'] if POSL[x['key']]!=['P']]
pits=[Pit(x) for x in R['pitchers']]
BYT=collections.defaultdict(list)
for b in bats:
    for t,a,z,pr in b.stints: BYT[t].append((b,a,z,pr))
def staff(team,g):
    S=[p for p in pits if p.team==team]
    for p in pits:
        for t,a,z in PMOVE.get(p.name,[]):
            if t==team and a<=g<=z: S.append(p)
    return S
ORDER=['C','SS','CF','2B','3B','1B','LF','RF']
PLAYER=collections.defaultdict(collections.Counter)
def lineup(team,g,rng):
    cand=[b for b,a,z,pr in BYT[team] if a<=g<=z and rng.random()<pr]
    if len(cand)<10:
        pool=[(b,pr) for b,a,z,pr in BYT[team] if a<=g<=z and b not in cand]
        while len(cand)<10 and pool:
            i=rng.choices(range(len(pool)),[max(pr,0.02) for _,pr in pool])[0];cand.append(pool.pop(i)[0])
    used=set();assign=[]
    el=[b for b in cand if b.dh>0.5]
    if el: dhb=rng.choices(el,[b.dh for b in el])[0];used.add(dhb.key)
    else: dhb=None
    for pos in ORDER:
        el=[b for b in cand if b.key not in used and b.gs.get(pos,0)>0] or [b for b in cand if b.key not in used]
        w=[b.gs.get(pos,0)+0.3 for b in el];b=rng.choices(el,w)[0];used.add(b.key);assign.append((b,pos))
    if dhb is None:
        el=[b for b in cand if b.key not in used] or [b for b,_ in assign]
        dhb=rng.choices(el,[x.PA for x in el])[0]
    b=dhb
    L=[a[0] for a in assign]+[b]
    L.sort(key=lambda x:-(x.obp*2+x.slg))
    return [L[3],L[1],L[0],L[2],L[4],L[5],L[6],L[7],L[8]],assign
def def_mods(team,assign):
    if not USE_FIELD: return TEAMDEF.get(team,0.0),1.0,CSLG
    s=0.0;e=0.0;wsum=0.0;cs=CSLG
    for b,pos in assign:
        fr=b.fr.get(pos)
        if pos=='C': cs=b.cs
        if pos in WD:
            rr=fr['range'] if fr else 50;avg=F['team_avg_range'][team].get(pos,50);s+=WD[pos]*(rr-avg)/10
        er=fr['err_reg'] if fr else ERRLG[pos];e+=SHARE[pos]*er/ERRLG[pos];wsum+=SHARE[pos]
    return TEAMDEF.get(team,0.0)-K2*s,e/wsum,cs
def pa(b,p,rng,dm):
    bp,pp=b.p,p.p
    k=comb(bp['k'],pp['k'],LB['k']);bb=comb(bp['bb'],pp['bb'],LB['bb']);hbp=comb(bp['hbp'],pp['hbp'],LB['hbp']);hr=comb(bp['hr'],pp['hr'],LB['hr'])*CURPF['hr']*ENV['hrs']
    r=rng.random()
    if r<k: return 'K'
    r-=k
    if r<bb: return 'BB'
    r-=bb
    if r<hbp: return 'HBP'
    r-=hbp
    if r<hr: return 'HR'
    babip=comb(bp['babip'],pp['babip'],LB['babip']);babip=comb(babip,LB['babip']+dm[0]+BOFF,LB['babip'])
    xb=bp['xbh'];tr=bp['tri']
    p1=babip*(1-xb)*CURPF['b1'];p2=babip*xb*(1-tr)*CURPF['b2'];p3=babip*xb*tr*CURPF['b3'];x=rng.random()
    if x<p1: return '1B'
    if x<p1+p2: return '2B'
    if x<p1+p2+p3: return '3B'
    if rng.random()<ENV['roe']*dm[1]: return 'ROE'
    return 'OUT'
class StaffState:
    def __init__(s,S,rng):
        st=[p for p in S if p.GS>0];s.rel=[p for p in S if p.relief_ip>1] or S
        s.sp=rng.choices(st,[p.GS for p in st])[0];s.sp_outs=max(3,int(rng.gauss(s.sp.ipgs*3,4)))
        s.cur=s.sp;s.o=0;s.runs=0;s.rng=rng;s.used={s.sp.name}
    def end_inning(s):
        s.o+=3
        if s.cur is s.sp:
            if s.o>=s.sp_outs or s.runs>=6: s.change()
        elif s.o>=3: s.change()
    def change(s):
        el=[p for p in s.rel if p.name not in s.used] or s.rel
        s.cur=s.rng.choices(el,[p.relief_ip for p in el])[0];s.used.add(s.cur.name);s.o=0
def half(L,idx,ss,rng,stats,dm,limit=None):
    outs=0;bases=[None,None,None];runs=0
    while outs<3:
        p=ss.cur;b=L[idx%9];idx+=1
        if bases[0] and not bases[1] and outs<2 and rng.random()<bases[0].p['sba']*ENV['sb_mult']:
            if rng.random()<comb(bases[0].p['sbp'],1-dm[2],1-CSLG): bases[1]=bases[0];bases[0]=None;stats['SB']+=1
            else: bases[0]=None;outs+=1;stats['CS']+=1
            if outs>=3: idx-=1;break
        if any(bases) and rng.random()<ENV['wp']:
            stats['WP']+=1
            if bases[2]: runs+=1
            bases=[None,bases[0],bases[1]]
        e=pa(b,p,rng,dm);stats['PA']+=1;stats[e]+=1
        if TRACK:
            c=PLAYER[b.key];c['PA']+=1;c[e]+=1
        if e=='K': outs+=1
        elif e=='OUT':
            if bases[0] and outs<2 and rng.random()<ENV['gdp']:
                bases[0]=None;outs+=2;stats['GDP']+=1
                if outs>=3: break
                if bases[2]: runs+=1;bases[2]=None
                if bases[1]: bases[2]=bases[1];bases[1]=None
                continue
            outs+=1
            if outs<3 and bases[2] and rng.random()<ENV['sf']: runs+=1;bases[2]=None;stats['SF']+=1
            else:
                if outs<3 and bases[1] and not bases[2] and rng.random()<ENV['prod']: bases[2]=bases[1];bases[1]=None
                if outs<3 and bases[0] and not bases[1] and rng.random()<ENV['prod']*0.7: bases[1]=bases[0];bases[0]=None
        elif e in('BB','HBP'):
            if bases[0]:
                if bases[1]:
                    if bases[2]: runs+=1
                    bases[2]=bases[1]
                bases[1]=bases[0]
            bases[0]=b
        elif e=='HR': runs+=1+sum(1 for x in bases if x);bases=[None,None,None]
        elif e=='3B': runs+=sum(1 for x in bases if x);bases=[None,None,b]
        elif e=='2B':
            runs+=(1 if bases[2] else 0)+(1 if bases[1] else 0);n3=None
            if bases[0]:
                if rng.random()<ENV['sc1on2']: runs+=1
                else: n3=bases[0]
            bases=[None,b,n3]
        else:
            if bases[2]: runs+=1
            n3=None;n2=None
            if bases[1]:
                if rng.random()<ENV['sc2on1']: runs+=1
                else: n3=bases[1]
            if bases[0]:
                if n3 is None and rng.random()<ENV['adv13']: n3=bases[0]
                else: n2=bases[0]
            bases=[b,n2,n3]
        if limit is not None and runs>limit: break
    ss.runs+=runs
    return runs,idx
def game(home,away,gh,ga,rng,stats):
    global CURPF
    CURPF=PFS[home]
    LH,AH=lineup(home,gh,rng);LA,AA=lineup(away,ga,rng)
    SH=StaffState(staff(home,gh),rng);SA=StaffState(staff(away,ga),rng)
    dmH=def_mods(home,AH);dmA=def_mods(away,AA)
    rh=ra=0;ih=ia=0
    for inn in range(1,12):
        r,ia=half(LA,ia,SH,rng,stats,dmH);ra+=r;SH.end_inning()
        if inn>=9 and rh>ra: break
        lim=(ra-rh) if inn>=9 else None
        r,ih=half(LH,ih,SA,rng,stats,dmA,limit=lim);rh+=r;SA.end_inning()
        if inn>=9 and rh!=ra: break
    PARKR[PARKNAME[home]][0]+=rh+ra;PARKR[PARKNAME[home]][1]+=1
    return rh,ra
def season(seed):
    rng=random.Random(seed);pairs=[(a,b) for i,a in enumerate(TEAMS) for b in TEAMS[i+1:]];sched=[]
    for a,b in pairs:
        for k in range(16): sched.append((a,b) if k%2==0 else (b,a))
    rng.shuffle(sched);gn=collections.Counter();rec={t:[0,0,0,0,0] for t in TEAMS};stats=collections.Counter()
    for h,a in sched:
        gn[h]+=1;gn[a]+=1;rh,ra=game(h,a,gn[h],gn[a],rng,stats)
        rec[h][3]+=rh;rec[h][4]+=ra;rec[a][3]+=ra;rec[a][4]+=rh
        if rh>ra: rec[h][0]+=1;rec[a][1]+=1
        elif ra>rh: rec[a][0]+=1;rec[h][1]+=1
        else: rec[h][2]+=1;rec[a][2]+=1
    return rec,stats
if __name__=='__main__':
    n=int(sys.argv[1]);out=sys.argv[2];t0=time.time();Rr=[];S=collections.Counter()
    for i in range(n):
        rec,st=season(5000+i);Rr.append(rec);S+=st
    json.dump({'recs':Rr,'stats':dict(S),'n':n,'player':{k:dict(v) for k,v in PLAYER.items()},'park':{k:v for k,v in PARKR.items()}},open(out,'w'))
    g=1440*n;rs=sum(v[3] for r in Rr for v in r.values())/g
    pa_=S['PA'];ab=pa_-S['BB']-S['HBP']-S['SF'];h=S['1B']+S['2B']+S['3B']+S['HR']
    print(f"{n}시즌 {time.time()-t0:.0f}초 | R/G {rs:.2f} AVG {h/ab:.3f} K% {S['K']/pa_:.3f} BB% {S['BB']/pa_:.3f} HR/PA {S['HR']/pa_:.4f} | GDP {S['GDP']/g:.2f} SB {S['SB']/g:.2f} CS {S['CS']/g:.2f} ROE {S['ROE']/g:.2f} WP {S['WP']/g:.2f}")
