import json,math,collections,statistics as st,os
SC=float(os.environ.get('REG_SCALE','1'))
OUT=os.environ.get('OUT','ratings_2026.json')
import sys
POS=json.load(open('positions.json'))
PARK=os.environ.get('PARK','y2026')
# SEASONS="2026:1,2025:0.6,2024:0.4" -> 첫 시즌이 기준(로스터·출전·리그환경), 나머지는 가중 합산. 기본은 2026 단일(재현용).
SEASONS=[(int(s.split(':')[0]),float(s.split(':')[1]) if ':' in s else 1.0) for s in os.environ.get('SEASONS','2026').split(',')]
PRIMARY=SEASONS[0][0];NORM=int(os.environ.get('NORM','1'))
if PARK!='none':
    _E=json.load(open('parks.json',encoding='utf8'))[PARK]['env']
    fac=lambda t,f:_E.get(t,{}).get(f,1.0)
NEUTRAL={(2024,'Eagles')}   # 2024 한화는 옛 대전구장(파크팩터 없음) -> 구장 효과 제거 없이 사용
def load(y):
    fac_=lambda t,f:1.0 if (y,t) in NEUTRAL else fac(t,f)
    def facr(row,f):   # 시즌 중 이적(split)이면 팀별 비중 가중 평균 환경
        sp=row.get('split')
        if sp: return sum(v*fac_(t,f) for t,v in sp.items())/sum(sp.values())
        return fac_(row['team'],f)
    B=json.load(open(f'batting_{y}.json',encoding='utf8'));PT=json.load(open(f'pitching_{y}.json',encoding='utf8'))
    if PARK!='none':
        _B=[]
        for r in B:
            q=dict(r);q['H0']=r['H'];q['HR0']=r['HR']
            q['B1']=r['B1']/facr(r,'b1');q['B2']=r['B2']/facr(r,'b2');q['B3']=r['B3']/facr(r,'b3');q['HR']=r['HR']/facr(r,'hr')
            q['H']=q['B1']+q['B2']+q['B3']+q['HR'];_B.append(q)
        B=_B;_P=[]
        for r in PT:
            q=dict(r);nh=(r['H']-r['HR'])/facr(r,'nh');q['HR']=r['HR']/facr(r,'hr');q['H']=nh+q['HR'];_P.append(q)
        PT=_P
    return B,PT
key=lambda r:f"{r['name']}|{r['team']}|{r['age']}"
def league_bat(B):
    L=collections.Counter()
    for r in B:
        for c in "PA AB H B1 B2 B3 HR BB IBB SO HBP SF SH SB CS".split(): L[c]+=r[c]
    return {
     'k':L['SO']/L['PA'],'bb':(L['BB']-L['IBB'])/L['PA'],'hbp':L['HBP']/L['PA'],'hr':L['HR']/L['PA'],
     'babip':(L['H']-L['HR'])/(L['AB']-L['SO']-L['HR']+L['SF']),
     'xbh':(L['B2']+L['B3'])/(L['H']-L['HR']),'tri':L['B3']/(L['B2']+L['B3']),
     'sba':(L['SB']+L['CS'])/(L['B1']+L['BB']+L['HBP']),'sbp':L['SB']/(L['SB']+L['CS'])}
DEFSHARE=float(os.environ.get('DEFSHARE','0.6'));DEFADJ=int(os.environ.get('DEFADJ','1'))
def league_pit(PT):
    P2=collections.Counter()
    for r in PT:
        for c in "TBF H HR BB IBB HBP SO outs GS G".split(): P2[c]+=r[c]
    lgp={'k':P2['SO']/P2['TBF'],'bb':(P2['BB']-P2['IBB'])/P2['TBF'],'hbp':P2['HBP']/P2['TBF'],'hr':P2['HR']/P2['TBF'],
         'babip':(P2['H']-P2['HR'])/(P2['TBF']-P2['SO']-P2['BB']-P2['HBP']-P2['HR'])}
    tb=collections.defaultdict(lambda:[0,0])
    for r in PT:
        sp=r.get('split') or ({r['team']:1} if r['team']!='---' else {})
        tot=sum(sp.values())
        for t,v in sp.items():
            tb[t][0]+=(r['H']-r['HR'])*v/tot; tb[t][1]+=(r['TBF']-r['SO']-r['BB']-r['HBP']-r['HR'])*v/tot
    return lgp,{t:DEFSHARE*(v[0]/v[1]-lgp['babip']) for t,v in tb.items()}
# stabilization constants (sample size at which observed ≈ 50% signal)
N={'k':60,'bb':120,'hbp':240,'hr':170,'babip':820,'xbh':400,'tri':300,'sba':150,'sbp':60}
NP={'k':70,'bb':170,'hbp':300,'hr':1300,'babip':2000}
def reg(x,n,m,c): c=c*SC; return (x+m*c)/(n+c)
def bat_counts(r):
    pa=r['PA']; bip=r['AB']-r['SO']-r['HR']+r['SF']; nh=r['H']-r['HR']
    opp=r['B1']+r['BB']+r['HBP']; xb=r['B2']+r['B3']; att=r['SB']+r['CS']
    return {'k':(r['SO'],pa),'bb':(r['BB']-r['IBB'],pa),'hbp':(r['HBP'],pa),'hr':(r['HR'],pa),'babip':(nh,bip),
            'xbh':(xb,nh),'tri':(r['B3'],xb),'sba':(att,opp),'sbp':(r['SB'],att)}
def dteam_of(r,Dteam):
    sp=r.get('split')
    if sp: return sum(v*Dteam.get(t,0) for t,v in sp.items())/sum(sp.values())
    return Dteam.get(r['team'],0)
def pit_counts(r,Dteam):
    t=r['TBF']; bip=max(t-r['SO']-r['BB']-r['HBP']-r['HR'],0)
    return {'k':(r['SO'],t),'bb':(r['BB']-r['IBB'],t),'hbp':(r['HBP'],t),'hr':(r['HR'],t),
            'babip':((r['H']-r['HR'])-(dteam_of(r,Dteam)*bip if DEFADJ else 0),bip)}
# ---------- 시즌 로드·환경 정규화 ----------
D={};LGB={};LGP={};DT={}
for y,w in SEASONS:
    D[y]=load(y);LGB[y]=league_bat(D[y][0]);LGP[y],DT[y]=league_pit(D[y][1])
lg=LGB[PRIMARY];lgp=LGP[PRIMARY];Dteam=DT[PRIMARY]
FB={y:{k:(lg[k]/LGB[y][k] if NORM else 1.0) for k in lg} for y,_ in SEASONS}
FP={y:{k:(lgp[k]/LGP[y][k] if NORM else 1.0) for k in lgp} for y,_ in SEASONS}
# ---------- 동일 선수 연결 (이름 + 나이 +1) ----------
def kor(n): return n.split()[-1]
def link(prow,cands,used,dy=1):
    """기준 시즌 행 -> 과거 시즌 행. 영문명+한글명 일치 & 나이차 정확히 1, 없으면 한글명 일치(미사용 중 유일) & 나이차 1."""
    try: a=int(prow['age'])
    except: a=None
    def okage(c):
        try: return a is not None and int(c['age'])==a-dy
        except: return False
    ex=[c for c in cands.get(kor(prow['name']),[]) if id(c) not in used and c['name']==prow['name'] and (okage(c) or not c['age'] or a is None)]
    if len(ex)==1: return ex[0]
    ko=[c for c in cands.get(kor(prow['name']),[]) if id(c) not in used and okage(c)]
    return ko[0] if len(ko)==1 else None
def index(rows):
    d=collections.defaultdict(list)
    for r in rows: d[kor(r['name'])].append(r)
    return d
LINK=collections.Counter()
def gather(prow,idx,which):
    """[(season_weight, row)] 기준 시즌 + 연결된 과거 시즌 행"""
    out=[(SEASONS[0][1],PRIMARY,prow)]
    for y,w in SEASONS[1:]:
        c=link(prow,idx[y][which],USED[y][which],PRIMARY-y)
        if c is not None: USED[y][which].add(id(c));out.append((w,y,c));LINK[(y,which)]+=1
    return out
IDX={y:{'b':index(D[y][0]),'p':index(D[y][1])} for y,_ in SEASONS[1:]}
USED={y:{'b':set(),'p':set()} for y,_ in SEASONS[1:]}
def blend(parts,cnt,F,consts):
    num=collections.Counter();den=collections.Counter()
    for w,y,r in parts:
        for k,(n_,d_) in cnt(r,y).items(): num[k]+=w*F[y][k]*n_;den[k]+=w*d_
    return num,den
# ---------- batters ----------
bat=[]
for r in D[PRIMARY][0]:
    if r['PA']==0: continue
    pa=r['PA']
    parts=gather(r,IDX,'b') if len(SEASONS)>1 else [(1.0,PRIMARY,r)]
    num,den=blend(parts,lambda x,y:bat_counts(x),FB,N)
    p={k:reg(num[k],den[k],lg[k],N[k]) for k in N}
    bat.append({'key':key(r),'name':r['name'],'team':r['team'],'age':r['age'],'pos':POS[key(r)],'PA':pa,'G':r['G'],'R':r['R'],'H':r.get('H0',r['H']),'HR':r.get('HR0',r['HR']),'BB':r['BB'],'SO':r['SO'],'p':p,'seasons':[y for _,y,_ in parts]})
B=D[PRIMARY][0];PT=D[PRIMARY][1]
# ---------- 20-80 scale vs regulars (PA>=300), lower-is-better flipped ----------
def scale(rows,field,sign,ref,w):
    vals=[x['p'][field] for x in ref]; wts=[w(x) for x in ref]
    mu=sum(v*t for v,t in zip(vals,wts))/sum(wts)
    sd=math.sqrt(sum(t*(v-mu)**2 for v,t in zip(vals,wts))/sum(wts))
    for x in rows:
        z=sign*(x['p'][field]-mu)/sd
        x.setdefault('r',{})[field]=max(20,min(80,round(50+10*z)))
    return mu,sd
regB=[x for x in bat if x['PA']>=300]
spec={'k':-1,'bb':1,'hr':1,'babip':1,'xbh':1,'sba':1}
for f,s in spec.items(): scale(bat,f,s,regB,lambda x:x['PA'])
names={'k':'contact','bb':'eye','hr':'power','babip':'hit','xbh':'gap','sba':'speed'}
for x in bat: x['r']={names[k]:v for k,v in x['r'].items()}
# ---------- pitchers ----------
pit=[]
for r in PT:
    t=r['TBF']
    parts=gather(r,IDX,'p') if len(SEASONS)>1 else [(1.0,PRIMARY,r)]
    num,den=blend(parts,lambda x,y:pit_counts(x,DT[y]),FP,NP)
    p={k:reg(num[k],den[k],lgp[k],NP[k]) for k in NP}
    role='SP' if r['GS']>=0.5*r['G'] and r['GS']>=3 else 'RP'
    ipgs=None
    if r['GS']>0:
        # outs per start approx: assume relief outings ~1 IP each
        relief=r['G']-r['GS']; so=max(r['outs']-relief*3,0)
        ipgs=so/3/r['GS']
    pit.append({'key':f"{r['name']}|{r['team']}|{r['age']}",'name':r['name'],'team':r['team'],'age':r['age'],
                'TBF':t,'IP':r['outs']/3,'G':r['G'],'GS':r['GS'],'role':role,'ip_per_start':ipgs,'p':p,
                'flag':r.get('fixed',''),'seasons':[y for _,y,_ in parts]})
regP=[x for x in pit if x['TBF']>=200]
for f,s in {'k':1,'bb':-1,'hr':-1,'babip':-1}.items(): scale(pit,f,s,regP,lambda x:x['TBF'])
pn={'k':'stuff','bb':'control','hr':'hr_suppress','babip':'contact_mgmt'}
for x in pit:
    x['r']={pn[k]:v for k,v in x['r'].items()}
    if x['role']=='SP': x['r']['stamina']=max(20,min(80,round(50+10*((x['ip_per_start'] or 5)-5.3)/0.6)))
    else: x['r']['stamina']=max(20,min(80,round(30+10*(x['IP']/x['G']-1.0)/0.3)))
json.dump({'league_bat':lg,'league_pit':lgp,'team_def':Dteam,'batters':bat,'pitchers':pit},open(OUT,'w',encoding='utf8'),ensure_ascii=False)
print("batters",len(bat),"pitchers",len(pit))
print("league bat",{k:round(v,3) for k,v in lg.items()})
print("league pit",{k:round(v,3) for k,v in lgp.items()})
# sanity: mean rating of regulars ~50
for f in names.values():
    print(f, round(st.mean(x['r'][f] for x in regB),1), "range",min(x['r'][f] for x in bat),max(x['r'][f] for x in bat))
if len(SEASONS)>1:
    print("seasons",SEASONS,"| 연결 선수 수",{f"{y}-{'타자' if w=='b' else '투수'}":v for (y,w),v in sorted(LINK.items())})
    print("환경 정규화 계수(타자, 기준 대비)",{y:{k:round(v,3) for k,v in FB[y].items()} for y,_ in SEASONS[1:]})
