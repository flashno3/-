import json,math,collections,statistics as st,os
SC=float(os.environ.get('REG_SCALE','1'))
OUT=os.environ.get('OUT','ratings_2026.json')
B=json.load(open('batting_2026.json',encoding='utf8'))
PT=json.load(open('pitching_2026.json',encoding='utf8'))
POS=json.load(open('positions.json'))
PARK=os.environ.get('PARK','y2026')
if PARK!='none':
    _E=json.load(open('parks.json',encoding='utf8'))[PARK]['env']
    fac=lambda t,f:_E.get(t,{}).get(f,1.0)
    _B=[]
    for r in B:
        q=dict(r);t=r['team'];q['H0']=r['H'];q['HR0']=r['HR']
        q['B1']=r['B1']/fac(t,'b1');q['B2']=r['B2']/fac(t,'b2');q['B3']=r['B3']/fac(t,'b3');q['HR']=r['HR']/fac(t,'hr')
        q['H']=q['B1']+q['B2']+q['B3']+q['HR'];_B.append(q)
    B=_B
    _P=[]
    for r in PT:
        q=dict(r);t=r['team'];nh=(r['H']-r['HR'])/fac(t,'nh');q['HR']=r['HR']/fac(t,'hr');q['H']=nh+q['HR'];_P.append(q)
    PT=_P
key=lambda r:f"{r['name']}|{r['team']}|{r['age']}"
# ---------- league baselines (all batters) ----------
L=collections.Counter()
for r in B:
    for c in "PA AB H B1 B2 B3 HR BB IBB SO HBP SF SH SB CS".split(): L[c]+=r[c]
L_uBB=L['BB']-L['IBB']
lg={
 'k':L['SO']/L['PA'],'bb':L_uBB/L['PA'],'hbp':L['HBP']/L['PA'],'hr':L['HR']/L['PA'],
 'babip':(L['H']-L['HR'])/(L['AB']-L['SO']-L['HR']+L['SF']),
 'xbh':(L['B2']+L['B3'])/(L['H']-L['HR']),'tri':L['B3']/(L['B2']+L['B3']),
 'sba':(L['SB']+L['CS'])/(L['B1']+L['BB']+L['HBP']),'sbp':L['SB']/(L['SB']+L['CS']),
}
# stabilization constants (sample size at which observed ≈ 50% signal)
N={'k':60,'bb':120,'hbp':240,'hr':170,'babip':820,'xbh':400,'tri':300,'sba':150,'sbp':60}
def reg(x,n,m,c): c=c*SC; return (x+m*c)/(n+c)
bat=[]
for r in B:
    if r['PA']==0: continue
    pa=r['PA']; bip=r['AB']-r['SO']-r['HR']+r['SF']; nh=r['H']-r['HR']
    opp=r['B1']+r['BB']+r['HBP']; xb=r['B2']+r['B3']; att=r['SB']+r['CS']
    p={
     'k':reg(r['SO'],pa,lg['k'],N['k']),
     'bb':reg(r['BB']-r['IBB'],pa,lg['bb'],N['bb']),
     'hbp':reg(r['HBP'],pa,lg['hbp'],N['hbp']),
     'hr':reg(r['HR'],pa,lg['hr'],N['hr']),
     'babip':reg(nh,bip,lg['babip'],N['babip']),
     'xbh':reg(xb,nh,lg['xbh'],N['xbh']),
     'tri':reg(r['B3'],xb,lg['tri'],N['tri']),
     'sba':reg(att,opp,lg['sba'],N['sba']),
     'sbp':reg(r['SB'],att,lg['sbp'],N['sbp']),
    }
    bat.append({'key':key(r),'name':r['name'],'team':r['team'],'age':r['age'],'pos':POS[key(r)],'PA':pa,'G':r['G'],'R':r['R'],'H':r.get('H0',r['H']),'HR':r.get('HR0',r['HR']),'BB':r['BB'],'SO':r['SO'],'p':p})
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
P2=collections.Counter()
for r in PT:
    for c in "TBF H HR BB IBB HBP SO outs GS G".split(): P2[c]+=r[c]
lgp={'k':P2['SO']/P2['TBF'],'bb':(P2['BB']-P2['IBB'])/P2['TBF'],'hbp':P2['HBP']/P2['TBF'],'hr':P2['HR']/P2['TBF'],
     'babip':(P2['H']-P2['HR'])/(P2['TBF']-P2['SO']-P2['BB']-P2['HBP']-P2['HR'])}
NP={'k':70,'bb':170,'hbp':300,'hr':1300,'babip':2000}
DEFSHARE=float(os.environ.get('DEFSHARE','0.6'));DEFADJ=int(os.environ.get('DEFADJ','1'))
tb=collections.defaultdict(lambda:[0,0])
for r in PT:
    if r['team']=='---': continue
    tb[r['team']][0]+=r['H']-r['HR']; tb[r['team']][1]+=r['TBF']-r['SO']-r['BB']-r['HBP']-r['HR']
Dteam={t:DEFSHARE*(v[0]/v[1]-lgp['babip']) for t,v in tb.items()}
pit=[]
for r in PT:
    t=r['TBF']; bip=t-r['SO']-r['BB']-r['HBP']-r['HR']
    p={'k':reg(r['SO'],t,lgp['k'],NP['k']),'bb':reg(r['BB']-r['IBB'],t,lgp['bb'],NP['bb']),
       'hbp':reg(r['HBP'],t,lgp['hbp'],NP['hbp']),'hr':reg(r['HR'],t,lgp['hr'],NP['hr']),
       'babip':reg((r['H']-r['HR'])-(Dteam.get(r['team'],0)*max(bip,0) if DEFADJ else 0),max(bip,0),lgp['babip'],NP['babip'])}
    role='SP' if r['GS']>=0.5*r['G'] and r['GS']>=3 else 'RP'
    ipgs=None
    if r['GS']>0:
        # outs per start approx: assume relief outings ~1 IP each
        relief=r['G']-r['GS']; so=max(r['outs']-relief*3,0)
        ipgs=so/3/r['GS']
    pit.append({'key':f"{r['name']}|{r['team']}|{r['age']}",'name':r['name'],'team':r['team'],'age':r['age'],
                'TBF':t,'IP':r['outs']/3,'G':r['G'],'GS':r['GS'],'role':role,'ip_per_start':ipgs,'p':p,
                'flag':r.get('fixed','')})
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
