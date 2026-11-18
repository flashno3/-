"""감독 모드용 선수 데이터 생성: ratings_forward_pk.json(3시즌 블렌딩) + 수비·포지션 → game/src/gamedata.json
시작 시점은 2027 시즌 직전(나이 +1). 값은 원본 그대로 두고 필요한 필드만 추린다."""
import json,os,math
D=os.path.dirname(os.path.abspath(__file__))+'/'
J=lambda f:json.load(open(D+f,encoding='utf8'))
R=J('ratings_forward_pk.json');F=J('fielding.json');DEF=J('defense_parsed.json')['D'];POS=J('positions.json');PK=J('parks.json')['blend']
POSMAP={'포수':'C','1루수':'1B','2루수':'2B','유격수':'SS','3루수':'3B','좌익수':'LF','중견수':'CF','우익수':'RF'}
LAST={'Matt Davidson 데이비슨':'Heroes','Ju-suk Ha 하주석':'Tigers','Ah-seop Son 손아섭':'Bears','Seung Min Ryu 류승민':'Bears','Jeong-bum Lee 이정범':'Wiz','Hyeong-beom Lee 이형범':'Eagles'}
TEAMS=['Bears','Dinos','Eagles','Giants','Heroes','Landers','Lions','Tigers','Twins','Wiz']
KOFIX={'Ariel Jurado':'후라도'}   # 영문 표기 → 한글 표기 보정
kor=lambda n:KOFIX.get(n,n.split()[-1])
NOAGE=[]
def age27(x):
    try: return int(x['age'])+1
    except ValueError:
        NOAGE.append(x['name']); return 28   # 원본 나이 공란: 2026 기준 27세로 가정 -> 2027 시즌 28세
players=[];bnames=set()
for x in R['batters']:
    if POS[x['key']]==['P']: continue
    d=DEF.get(x['key'],{});gs={POSMAP[k]:v['GS'] for k,v in d.items() if k in POSMAP}
    outs={POSMAP[k]:v['outs'] for k,v in d.items() if k in POSMAP}
    if outs: pos=max(outs,key=outs.get)
    else:
        pl=[q for q in POS[x['key']] if q not in('P','DH')]
        pos={'OF':'LF'}.get(pl[0],pl[0]) if pl else 'DH'
    starts=x['PA']/4.15
    if gs and sum(gs.values())<0.35*starts: pos='DH'        # 수비 출전이 거의 없는 지명타자형(예: 최형우 좌익수 6경기)
    fr={k:{'range':v['range'],'err_reg':v['err_reg']} for k,v in F['players'].get(x['key'],{}).items() if gs.get(k,0)>=15 or k==pos}   # 출전 0~소수 경기의 자리표시 값 제외
    cs=F['catchers'].get(x['key'],{}).get('cs_reg')
    team=LAST.get(x['name'],x['team']);assert team in TEAMS,(x['name'],team)
    bnames.add(x['name'])
    players.append({'id':'B%d'%(len(players)+1),'type':'B','name':x['name'],'ko':kor(x['name']),'team':team,'age':age27(x),'p':x['p'],'pos':pos,'gs':gs,'fr':fr,'cs':cs,'PA':x['PA'],'G':x['G']})
for x in R['pitchers']:
    if x['name'] in bnames and x['IP']<5: continue          # 투수로 잠깐 나온 야수
    team=LAST.get(x['name'],x['team']);assert team in TEAMS,(x['name'],team)
    players.append({'id':'P%d'%(len(players)+1),'type':'P','name':x['name'],'ko':kor(x['name']),'team':team,'age':age27(x),'p':x['p'],
        'GS':x['GS'],'G':x['G'],'IP':x['IP'],'ipgs':x['ip_per_start'],'role':x['role'],'stamina':x['r'].get('stamina',40)})

# 실제 투타 정보: 퓨처스 선수등록 명단(사용자 제공)에서 이름+포지션군(투수/타자)+나이(±1)로 매칭. 소속이 다르면 건너뛴다.
def load_hands():
    f=D+'game/data/futures_roster_2026.txt'
    if not os.path.exists(f): return 0,[],[]
    TM={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','히어로즈':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    hit=0;skip=[];miss=[]
    for l in open(f,encoding='utf8'):
        if not l.strip() or l.startswith('#'): continue
        t,g,n,h,b,_,_=l.strip().split('|');ty='P' if g=='P' else 'B';y=int(b[:4])
        c=[p for p in players if p['ko']==n and p['type']==ty and abs((2026-y)-p['age'])<=1]
        if len(c)>1 and t in TM: c=[p for p in c if p['team']==TM[t]] or c
        if not c: miss.append((t,n));continue
        if len(c)>1 or (t in TM and c[0]['team']!=TM[t]): skip.append((t,n,[p['team'] for p in c]));continue
        p=c[0];p['throws']={'우':'R','좌':'L'}[h[0]];p['bats']={'우':'R','좌':'L','양':'S'}[h[2]];hit+=1
    return hit,skip,miss
HITS,SKIP,MISS=load_hands()

# ---------------------------------------------------------------------------
# 퓨처스 타자: 2026 퓨처스 기록(사용자 제공)을 1군 능력치 척도로 환산해 2군 선수로 추가.
# 환산: 1군 레이팅이 있는 겹치는 선수(PA>=40)로 'rating ~ 퓨처스 수축 비율' 회귀(PA 가중)를 구해 적용한다.
#  - 퓨처스 비율은 1군과 같은 사전 표본(ratings.py의 N)으로 퓨처스 리그 평균 쪽으로 수축
#  - 상무·울산 소속 선수는 원소속 구단을 몰라 게임에 넣지 않고 별도 파일에 보관
#  - 포지션 세부(1B/2B/3B/SS, LF/CF/RF)·수비 능력·나이(명단에 없는 경우)는 데이터가 없어 추정값(posEst/ageEst)
MILORG={}   # 이름 -> (원소속 한글, 입대 yyyy-mm, 전역 예정 연월 인덱스)
def load_mil():
    f=D+'game/data/military_2026.txt'
    if not os.path.exists(f): return
    for l in open(f,encoding='utf8'):
        if not l.strip() or l.startswith('#'): continue
        n,t,enl,_,_=l.strip().split('|');y,m=map(int,enl.split('.'));ym=y*12+(m-1)+18   # 18개월 복무
        MILORG[n]=({'히어로즈':'고양','키움':'고양'}.get(t,t),enl,ym)   # ym = 연*12+(월-1): 전역 월
DISCH={}   # 2026.11 전역해 원소속에 복귀한 선수: 이름 -> 원소속(한글)
for l in (open(D+'game/data/military_discharged_2026.txt',encoding='utf8') if os.path.exists(D+'game/data/military_discharged_2026.txt') else []):
    if l.strip() and not l.startswith('#'):
        n,t,_=l.strip().split('|');DISCH[n]={'히어로즈':'고양','키움':'고양'}.get(t,t)
load_mil()
FUT_TM={'울산':'Whales','한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','고양':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
FNs={'k':60,'bb':120,'hbp':240,'hr':170,'babip':820,'xbh':400,'sba':150}
def eff_team(r):   # 상무 선수는 원소속(알려진 경우)으로 매칭
    if r['team']=='상무':
        if r['name'] in MILORG: return MILORG[r['name']][0]
        if r['name'] in DISCH: return DISCH[r['name']]
    return r['team']
def mark_mil(p,r):
    t,enl,ym=MILORG[r['name']];p['milTeam']=FUT_TM[t];p['milReturn']=ym;p['milFrom']=enl;p['team']='MIL'
# 퓨처스 → 1군 레이팅 보강: 24~26 1군 합계 표본이 작은 선수(타자 150타석·투수 100이닝 미만)에 한해 퓨처스 환산값을 정보량 가중으로 섞는다.
#  - 합계는 2026·2025·2024 1군 기록(이름·나이로 연결, 모호하면 제외). 레이팅의 1군 정보량 = 시즌 가중(1·0.6·0.4) 표본 + 사전 표본(N)
#  - 퓨처스 정보량 = 0.5 × 퓨처스 표본(리그 수준 차이 할인), 환산값은 겹치는 선수 회귀(기울기 감쇠)로 1군 척도에 맞춘 값
#  - 기준선에서 비중이 0이 되도록 (1 − 합계/기준) 테이퍼. 최소 퓨처스 표본: 타자 50타석·투수 60타자(≈15이닝). 투수는 삼진·볼넷만(나머지는 퓨처스 예측력 없음)
BLEND={'B':[],'P':[]}
FUT_EFF=0.5
def _career_idx(pit):
    d={}
    for y in (2026,2025,2024):
        ix={}
        for r in J(('pitching_' if pit else 'batting_')+str(y)+'.json'): ix.setdefault(r['name'],[]).append(r)
        d[y]=ix
    return d
def _career(m,pit,idx):
    try: a26=int(m['age'])-1
    except (ValueError,TypeError): return None
    tot=0.0;wn=0.0
    for y,w in ((2026,1.0),(2025,0.6),(2024,0.4)):
        c=[r for r in idx[y].get(m['name'],[]) if str(r['age'])==str(a26-(2026-y))]
        if len(c)>1: return None
        if c:
            v=(c[0]['outs']/3.0,c[0]['TBF']) if pit else (c[0]['PA'],c[0]['PA'])
            tot+=v[0];wn+=w*v[1]
    return tot,wn
def blend_fut(ov,fit,shr,pit):
    idx=_career_idx(pit);th=100 if pit else 150;mn=60 if pit else 50;Ns=FPNs if pit else FNs
    for r in ov:
        m=r['m'];cr=_career(m,pit,idx);fs=r['BF'] if pit else r['PA']
        if not cr or cr[0]>=th or fs<mn: continue
        taper=1-cr[0]/th;ch={}
        for s in (['k','bb'] if pit else list(fit)):
            pf=fit[s]['my']+fit[s]['b']*(shr(r,s)-fit[s]['mx']);lam=taper*FUT_EFF*fs/(FUT_EFF*fs+cr[1]+Ns[s])
            new=(1-lam)*m['p'][s]+lam*pf;ch[s]=(m['p'][s],new);m['p'][s]=new
        BLEND['P' if pit else 'B'].append((m['ko'],m['team'],round(cr[0],1),fs,{s:(round(a,4),round(c,4)) for s,(a,c) in ch.items()}))
def futures_hitters(players):
    f=D+'game/data/futures_bat_2026.txt'
    if not os.path.exists(f): return None
    rows=[]
    for l in open(f,encoding='utf8'):
        if l.startswith('#') or not l.strip(): continue
        t=l.split();team,g,pid,name=t[:4];v=[float(x) if '.' in x else int(x) for x in t[4:]]
        _,G,PA,AB,_r,H,B2,B3,HR,RBI,SB,BB,HBP,SO,_,_=v
        rows.append(dict(team=team,g=g,pid=pid,name=name,G=G,PA=PA,AB=AB,H=H,B2=B2,B3=B3,HR=HR,SB=SB,BB=BB,HBP=HBP,SO=SO))
    # 명단(생년·투타)
    ros={}
    rf=D+'game/data/futures_roster_2026.txt'
    for l in open(rf,encoding='utf8'):
        if not l.strip() or l.startswith('#'): continue
        t,g,n,h,b,_,_=l.strip().split('|');ros[(('고양' if t=='히어로즈' else t),n,'P' if g=='P' else g)]=(b,h)
    def obs(r):
        bip=r['AB']-r['SO']-r['HR'];hnh=r['H']-r['HR'];b1=r['H']-r['B2']-r['B3']-r['HR']
        return {'k':(r['SO'],r['PA']),'bb':(r['BB'],r['PA']),'hbp':(r['HBP'],r['PA']),'hr':(r['HR'],r['PA']),'babip':(hnh,bip),'xbh':(r['B2']+r['B3'],hnh),'sba':(r['SB']/0.745,b1+r['BB']+r['HBP'])}
    lg={s:sum(obs(r)[s][0] for r in rows)/sum(obs(r)[s][1] for r in rows) for s in FNs}
    shr=lambda r,s:(obs(r)[s][0]+lg[s]*FNs[s])/(obs(r)[s][1]+FNs[s])
    # 1군 선수와 매칭(이름+같은 소속팀). 겹치는 선수는 1군 레이팅을 그대로 쓴다.
    byname={}
    for p in players:
        if p['type']=='B': byname.setdefault(p['ko'],[]).append(p)
    used=set();ov=[];new=[];unassigned=[]
    for r in rows:
        c=[p for p in byname.get(r['name'],[]) if p['team']==FUT_TM.get(eff_team(r)) and p['id'] not in used]
        if c:
            used.add(c[0]['id']);r['m']=c[0];ov.append(r)
            if r['team']=='상무' and r['name'] in MILORG: mark_mil(c[0],r)
        elif eff_team(r) in FUT_TM: new.append(r)
        else: unassigned.append(r)
    fit={}
    for s in ['k','bb','hr','babip','xbh','sba']:
        pts=[(shr(r,s),r['m']['p'][s],r['PA']) for r in ov if r['PA']>=40]
        W=sum(w for _,_,w in pts);mx=sum(w*x for x,_,w in pts)/W;my=sum(w*y for _,y,w in pts)/W
        sxx=sum(w*(x-mx)**2 for x,_,w in pts);sxy=sum(w*(x-mx)*(y-my) for x,y,w in pts)
        fit[s]=dict(mx=mx,my=my,b=sxy/sxx,n=len(pts))
    blend_fut(ov,fit,shr,False)
    lgB=R['league_bat']
    out=[]
    import hashlib
    def h01(key):
        return int(hashlib.md5(key.encode()).hexdigest()[:8],16)/0xffffffff
    for r in new:
        p={s:fit[s]['my']+fit[s]['b']*(shr(r,s)-fit[s]['mx']) for s in fit}
        p['hbp']=shr(r,'hbp')*lgB['hbp']/lg['hbp'];p['tri']=lgB['tri'];p['sbp']=lgB['sbp']
        p['k']=min(max(p['k'],0.06),0.45);p['bb']=min(max(p['bb'],0.015),0.20);p['hr']=min(max(p['hr'],0.002),0.07);p['babip']=min(max(p['babip'],0.24),0.39);p['xbh']=min(max(p['xbh'],0.10),0.32);p['sba']=min(max(p['sba'],0.005),0.25)
        info=ros.get((r['team'],r['name'],r['g']))
        age=2026-int(info[0][:4])+1 if info else None   # 2027 시즌 기준(기존 데이터와 같은 기준)
        u=h01(r['pid'])
        if r['g']=='C': pos='C'
        elif r['g']=='IF': pos='1B' if u<0.15 else '2B' if u<0.40 else '3B' if u<0.65 else 'SS'
        else: pos='LF' if u<0.33 else 'CF' if u<0.67 else 'RF'
        grp={'C':['C'],'IF':['1B','2B','3B','SS'],'OF':['LF','CF','RF']}[r['g']]
        gs={pos:50};[gs.__setitem__(q,8) for q in grp if q!=pos]
        fr={pos:{'range':50,'err_reg':F['lg']['err'][pos]}}
        q=dict(id='B%d'%(len(players)+len(out)+1),type='B',name=r['name'],ko=r['name'],team=FUT_TM[eff_team(r)],age=age or 24,p=p,pos=pos,gs=gs,fr=fr,cs=None,PA=0,G=0,src='F',fpid=r['pid'],posEst=True)
        if not age: q['ageEst']=True
        if r['team']=='상무' and r['name'] in MILORG: mark_mil(q,r)
        if info:
            h=info[1];q['throws']={'우':'R','좌':'L'}[h[0]];q['bats']={'우':'R','좌':'L','양':'S'}[h[2]]
        out.append(q)
    return out,fit,[(r['team'],r['name'],r['pid']) for r in unassigned],len(ov)

# 퓨처스 투수: 타자와 같은 방식(수축 → 겹치는 1군 투수로 회귀 환산). 투구수·선발 여부(GS)가 없어 타자 상대 수(BF)=아웃+피안타+볼넷+사구로 추정,
# 선발/구원은 경기당 이닝(≥3.5 & 25이닝 이상이면 선발)로 추정하고 체력은 ratings.py의 공식(선발: 경기당 이닝, 구원: 이닝/경기)을 그대로 적용.
FPNs={'k':70,'bb':170,'hbp':300,'hr':1300,'babip':2000}
def futures_pitchers(players,nb):
    f=D+'game/data/futures_pit_2026.txt'
    if not os.path.exists(f): return None
    rows=[]
    for l in open(f,encoding='utf8'):
        if l.startswith('#') or not l.strip(): continue
        t=l.split();team,pid,name=t[:3];v=t[3:]
        w,fr=v[6].split('.');outs=int(w)*3+int(fr)
        H,HR,BB,HBP,SO,Rr,ER=map(int,v[7:])
        rows.append(dict(team=team,pid=pid,name=name,G=int(v[1]),outs=outs,H=H,HR=HR,BB=BB,HBP=HBP,SO=SO,R=Rr,ER=ER))
    for r in rows:
        r['BF']=r['outs']+r['H']+r['BB']+r['HBP']
    def obs(r):
        bip=r['BF']-r['SO']-r['BB']-r['HBP']-r['HR']
        return {'k':(r['SO'],r['BF']),'bb':(r['BB'],r['BF']),'hbp':(r['HBP'],r['BF']),'hr':(r['HR'],r['BF']),'babip':(r['H']-r['HR'],max(bip,1))}
    lg={s:sum(obs(r)[s][0] for r in rows)/sum(obs(r)[s][1] for r in rows) for s in FPNs}
    shr=lambda r,s:(obs(r)[s][0]+lg[s]*FPNs[s])/(obs(r)[s][1]+FPNs[s])
    by={}
    for p in players:
        if p['type']=='P': by.setdefault(p['ko'],[]).append(p)
    used=set();ov=[];new=[];unassigned=[]
    for r in rows:
        c=[p for p in by.get(r['name'],[]) if p['team']==FUT_TM.get(eff_team(r)) and p['id'] not in used]
        if c:
            used.add(c[0]['id']);r['m']=c[0];ov.append(r)
            if r['team']=='상무' and r['name'] in MILORG: mark_mil(c[0],r)
        elif eff_team(r) in FUT_TM: new.append(r)
        else: unassigned.append(r)
    fit={}
    for s in ['k','bb','hr','babip']:
        pts=[(shr(r,s),r['m']['p'][s],r['BF']) for r in ov if r['BF']>=40]
        W=sum(w for _,_,w in pts);mx=sum(w*x for x,_,w in pts)/W;my=sum(w*y for _,y,w in pts)/W
        sxx=sum(w*(x-mx)**2 for x,_,w in pts);sxy=sum(w*(x-mx)*(y-my) for x,y,w in pts);syy=sum(w*(y-my)**2 for _,y,w in pts)
        fit[s]=dict(mx=mx,my=my,b=max(0.0,sxy/sxx),n=len(pts),corr=sxy/(sxx*syy)**.5)   # 음의 기울기는 0(예측력 없음)으로
    blend_fut(ov,fit,shr,True)
    lgB=R['league_bat'];ros={}
    for l in open(D+'game/data/futures_roster_2026.txt',encoding='utf8'):
        if not l.strip() or l.startswith('#'): continue
        t,g,n,h,b,_,_=l.strip().split('|')
        if g=='P': ros[(('고양' if t=='히어로즈' else t),n)]=(b,h)
    out=[]
    for r in new:
        p={s:fit[s]['my']+fit[s]['b']*(shr(r,s)-fit[s]['mx']) for s in fit}
        p['hbp']=shr(r,'hbp')*lgB['hbp']/lg['hbp']
        p['k']=min(max(p['k'],0.08),0.40);p['bb']=min(max(p['bb'],0.02),0.18);p['hr']=min(max(p['hr'],0.004),0.06);p['babip']=min(max(p['babip'],0.25),0.37)
        ipg=(r['outs']/3)/max(r['G'],1);sp=ipg>=3.5 and r['outs']>=75
        if sp: ipgs=ipg;stam=max(20,min(80,round(50+10*(ipgs-5.3)/0.6)))
        else: ipgs=None;stam=max(20,min(80,round(30+10*(ipg-1.0)/0.3)))
        info=ros.get((r['team'],r['name']))
        age=2026-int(info[0][:4])+1 if info else None
        q=dict(id='P%d'%(len(players)+nb+len(out)+1),type='P',name=r['name'],ko=r['name'],team=FUT_TM[eff_team(r)],age=age or 24,p=p,GS=0,G=0,IP=0,ipgs=ipgs,role='SP' if sp else 'RP',stamina=stam,src='F',fpid=r['pid'],roleEst=True)
        if not age: q['ageEst']=True
        if r['team']=='상무' and r['name'] in MILORG: mark_mil(q,r)
        if info: q['throws']={'우':'R','좌':'L'}[info[1][0]]
        out.append(q)
    return out,fit,[(r['team'],r['name'],r['pid']) for r in unassigned],len(ov)
FUT=futures_hitters(players)
if FUT:
    players.extend(FUT[0])
FUTP=futures_pitchers(players,0)
if FUTP:
    players.extend(FUTP[0])

# 2026 연봉·외국인 구분(사용자 제공 CSV): 이름+소속팀(군 복무 선수는 원소속)으로 유일하게 매칭되는 선수에만 반영.
# 팀 내 동명이인(Y)이거나 같은 이름·팀 선수가 2명 이상이면 구분할 수 없어 건너뛴다(추정 연봉 유지).
# 2026 기록이 없는 선수(장기 부상으로 전 시즌 결장 등): 2026 연봉표에는 있고 위 명단에는 없으며 2025·2024 기록이 있으면 그 기록(ratings_prev25.json)으로 추가
def add_prev_season():
    import csv
    f=D+'game/data/salary_2026.csv'
    if not os.path.exists(f) or not os.path.exists(D+'ratings_prev25.json'): return []
    TM4={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    have={(p['ko'],p['team']) for p in players}
    sal={}
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        if r['구단'] in TM4: sal[(r['선수명'],TM4[r['구단']])]=r
    inj=set()
    fi=D+'game/data/injuries_2026.csv'
    if os.path.exists(fi):
        for r in csv.DictReader(open(fi,encoding='utf-8-sig')):
            if r['반영']!='미반영': inj.add((r['선수명'],TM4[r['팀']]))
    PR=J('ratings_prev25.json');out=[]
    for x in PR['pitchers']:
        ko=kor(x['name'])
        for (n,t),r in sal.items():
            if n!=ko or (ko,t) in have or (ko,t) not in inj or x['team']!=t or x['IP']<20 or r.get('외국인구분'): continue
            try: age=int(x['age'])+2
            except ValueError: continue
            players.append({'id':'P%d'%(len(players)+1),'type':'P','name':x['name'],'ko':ko,'team':t,'age':age,'p':x['p'],'GS':x['GS'],'G':x['G'],'IP':x['IP'],'ipgs':x['ip_per_start'],'role':x['role'],'stamina':x['r'].get('stamina',40),'prev':2025})
            out.append((ko,t,x['IP']));have.add((ko,t))
    return out
PREVADD=add_prev_season()
print('2026 기록 없음 → 2025·2024 기록으로 추가',PREVADD)
def load_injuries(players):
    import csv
    f=D+'game/data/injuries_2026.csv'
    if not os.path.exists(f): return {'ok':0,'skip':[]}
    TM4={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    st={'ok':0,'skip':[]}
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        if r['반영']=='미반영': st['skip'].append(r['선수명']);continue
        ty='P' if r['포지션']=='투수' else 'B'
        c=[p for p in players if p['ko']==r['선수명'] and p['team']==TM4[r['팀']] and p['type']==ty]
        if r.get('나이(2027)'): c=[p for p in c if p['age']==int(r['나이(2027)'])]
        if len(c)!=1: st['skip'].append((r['선수명'],len(c)));continue
        c[0]['inj']={'dx':r['진단'],'since':r['발생·수술일'],'ret':r['복귀예상일'],'basis':r['근거(보도/추정)'],'apply':r['반영']=='적용'};st['ok']+=1
    return st
INJ=load_injuries(players)
def load_evals(players):
    import csv
    f=D+'game/data/player_evals.csv'
    if not os.path.exists(f): return 0
    TM4={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    n=0
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        c=[p for p in players if p['ko']==r['선수명'] and p['team']==TM4[r['팀']] and p['type']=='P' and p['age']==int(r['나이(2027)'])]
        assert len(c)==1,(r['선수명'],len(c))
        c[0]['eval']={'text':r['평가'],'role':r['보직'],'floor':r['잠재력하한'],'plan':r['육성방향'],'src':r['근거']};n+=1
    return n
EVN=load_evals(players)
print('선수 평가 반영',EVN)
print('부상 반영',INJ)

def load_salary(players):
    import csv
    f=D+'game/data/salary_2026.csv'
    if not os.path.exists(f): return 0,[],[]
    TM2={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    by={}
    for p in players: by.setdefault((p['ko'],p.get('milTeam') or p['team']),[]).append(p)
    ok=0;skip=[];miss=[]
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        c=by.get((r['선수명'],TM2[r['구단']]),[])
        if not c: miss.append((r['구단'],r['선수명'],int(r['연봉_만원'])));continue
        if len(c)>1 or r['동명이인_팀내']=='Y': skip.append((r['구단'],r['선수명']));continue
        c[0]['sal']=int(r['연봉_만원'])/10000;c[0]['foreign']=bool(r['외국인구분']);c[0]['aq']='(AQ)' in r['비고']   # 아시아쿼터 여부(별첨 성명의 (AQ) 표기);ok+=1
    return ok,skip,miss
SALOK,SALSKIP,SALMISS=load_salary(players)

# 2026.10 1군 등록 명단(사용자 제공 CSV): 생년월일·투타·언더핸드 → 나이(2027 시즌 기준 = 2027-출생연도), 투타, 1군 등록 여부(reg1)
def load_roster1(players):
    import csv
    f=D+'game/data/roster_1군_2026.csv'
    if not os.path.exists(f): return {}
    TM3={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    by={}
    for p in players: by.setdefault((p['ko'],p['team'],p['type']),[]).append(p)
    st={'ok':0,'amb':[],'miss':[],'agefix':0,'reg1':0}
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        ty='P' if r['포지션']=='투수' else 'B';y=int(r['생년월일'][:4])
        c=by.get((r['선수명'],TM3[r['구단']],ty),[])
        if len(c)>1: c=[p for p in c if abs(p['age']-(2027-y))<=1]
        if len(c)!=1: (st['amb'] if len(c)>1 else st['miss']).append((r['구단'],r['선수명']));continue
        p=c[0];st['ok']+=1
        if p['age']!=2027-y: st['agefix']+=1
        p['age']=2027-y;p['birth']=r['생년월일'];p.pop('ageEst',None)
        p['throws']={'우':'R','좌':'L'}[r['투구손']];p['bats']={'우':'R','좌':'L','양':'S'}[r['타석']]
        if r['언더핸드']=='Y': p['under']=True
        if '등록명단 외' not in r['비고']: p['reg1']=True;st['reg1']+=1
    return st
R1=load_roster1(players)

# 2027 신인 드래프트 지명 결과(사용자 제공)
def load_draft():
    f=D+'game/data/draft_2027.txt';out=[]
    if not os.path.exists(f): return out
    TMD={'키움':'Heroes','두산':'Bears','KIA':'Tigers','롯데':'Giants','KT':'Wiz','NC':'Dinos','삼성':'Lions','SSG':'Landers','한화':'Eagles','LG':'Twins'}
    for l in open(f,encoding='utf8'):
        if not l.strip() or l.startswith('#'): continue
        r,t,n,sch,pos,by,bonus=l.strip().split('|')
        out.append(dict(round=int(r),team=TMD[t],name=n,school=sch,pos=pos,birthYear=None if by=='-' else int(by),bonus=None if bonus=='-' else float(bonus)))
    return out
DRAFT=load_draft()

# FA 계약 정보(사용자 제공 CSV): 잔여 계약 연수·총액·계약금·옵션 → p['ct']. 상태가 '유효'이거나 연수를 확정할 수 있는 행만 적용.
SAL27={'노시환':10,'양현종':10,'나성범':10}   # 2026 공시 연봉 유지(2027 연봉 미확정)
def load_fa(players):
    import csv,re
    f=D+'game/data/fa_contracts_2026.csv'
    if not os.path.exists(f): return {'ok':0,'skip':[],'fa':[]}
    TM4={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    st={'ok':0,'skip':[],'fa':[]}
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        status=r['상태'];name=re.sub(r'\(.*\)','',r['선수명']);hint=(re.findall(r'\((.*)\)',r['선수명']) or [''])[0]
        ty='P' if r['포지션']=='투수' else 'B'
        if status=='대체됨': continue
        c=[p for p in players if p['ko']==name and p['team']==TM4[r['2026소속']] and p['type']==ty]
        if len(c)>1 and name=='김태훈': c=[p for p in c if p.get('birth','').startswith('1992')]
        if len(c)>1 and hint=='우완': c=[p for p in c if p.get('throws')!='L' and p['age']>=33]
        if len(c)!=1: st['skip'].append((r['선수명'],r['2026소속'],len(c)));continue
        p=c[0]
        if r['계약구단'] and TM4.get(r['계약구단'])!=TM4[r['2026소속']] and r['계약구단'] in TM4:
            if r['시작시즌']!='2027': st['skip'].append((r['선수명'],r['2026소속'],'계약구단 '+r['계약구단']+' ≠ 2026 소속(이후 이적·방출, 계약 승계 미확인)'));continue   # 안치홍(한화 계약→2025 방출 후 키움)·임기영: 현 소속 유지, 옛 계약 미적용
            p['team']=TM4[r['계약구단']];p['moved']=True   # 2027 이적 계약(손아섭 두산→NC)
        if status=='종료':   # 옵트아웃으로 시장에 나온 선수(함덕주)
            p['faStart']=True;st['fa'].append(name);continue
        rem=r['2026말_잔여시즌']
        if rem=='' and r['종료시즌_보장']: rem=str(int(r['종료시즌_보장'])-2026)
        years=int(rem) if rem!='' else None
        if status=='확인필요': years=1 if years is None else years
        g=int(re.match(r'(\d+)',r['계약구조']).group(1))
        total=float(r['총액_억']) if r['총액_억'] else None
        optseg=re.search(r'(\d+(?:\.\d+)?)억',r['옵션구간'] or '')
        guaranteed=(total-float(optseg.group(1))) if (total and optseg) else total
        ct={'years':years,'total':total,'bonus':float(r['계약금_억']) if r['계약금_억'] else None,'from':int(r['시작시즌']),'end':int(r['종료시즌_보장']) if r['종료시즌_보장'] else None,'opt':r['옵션구간'] or None,'est':status=='확인필요','nonfa':r['FA연도'].startswith('비FA')}
        if r['시작시즌']=='2027' and r['연봉합계_억']: ct['salary']=round(float(r['연봉합계_억'])/g,2)   # 2027 시즌부터 시작하는 새 계약(양의지·오태곤)은 새 연봉 적용
        if guaranteed and status!='확인필요': ct['cbt']=round(guaranteed/g,2)   # 경쟁균형세 반영 연평균 보수(보장 총액/보장 연수)
        if '[AAV]' in (r['비고'] or '') and total: ct['cbt']=round(total/sum(int(x) for x in re.findall(r'\d+',r['계약구조'].split('년')[0])),2)   # 연평균 보수(AAV) = 옵션 포함 총액/전체 연수(박민우 5+3년 140억)
        if name in SAL27: ct['salary']=SAL27[name]   # 2027 연봉은 계약 전이므로 2026 공시 연봉 유지
        p['ct']=ct;st['ok']+=1
    return st
FAC=load_fa(players)
# KBO 2027 FA 자격 유보선수 9명(2026-11 공시): 비FA 다년·옵션 등으로 자격은 충족했으나 계약 기간이 남아 FA 신청 불가(계약 만료 시점까지 자격 유지)
HOLD=[('고영표','Wiz'),('나성범','Tigers'),('김광현','Landers'),('김재환','Landers'),('박세웅','Giants'),('박건우','Dinos'),('박민우','Dinos'),('노시환','Eagles'),('김재현','Heroes')]
for ko,tm in HOLD:
    c=[p for p in players if p['ko']==ko and p['team']==tm and (ko!='김재현' or p['type']=='B' and p.get('pos')=='C')]
    assert len(c)==1,(ko,tm,len(c));c[0]['hold']=True
RETIRED=[('황재균','Wiz')]   # 2026 시즌 후 은퇴(사용자 확인) → 게임에서 제외
players[:]=[p for p in players if (p['ko'],p['team']) not in RETIRED]

# 2002~2027 신인 드래프트 정리 파일(사용자 제공): 입단 연도·고졸/대졸·지명 순번·1군 데뷔·통산 출전 → p['dh']
MANUAL_DH={('박준영','Eagles',24):'1라운드',('박준영','Eagles',25):'육성선수'}
def load_drafthist(players):
    import csv,re
    f=D+'game/data/draft_2002_2027.csv'
    if not os.path.exists(f): return {'ok':0,'amb':[],'miss':0}
    ALI={'SK':'Landers','SSG':'Landers','넥센':'Heroes','키움':'Heroes','히어로즈':'Heroes','우리':'Heroes','두산':'Bears','LG':'Twins','KT':'Wiz','kt':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers','해태':'Tigers','한화':'Eagles','현대':'Heroes'}
    TWO=re.compile(r'과학|전문|영동|산업|관광|디지털|사이버|국제대')
    by={}
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        toks=r['이력'].split('-');r['_teams']=[ALI[t] for t in toks if t in ALI];r['_toks']=toks
        nm=r['선수'];names={re.sub(r'\s*\(.*\)','',nm)}|set(re.findall(r'\((.*?)\)',nm))
        for n in names: by.setdefault(n.strip(),[]).append(r)
    st={'ok':0,'amb':[],'miss':0}
    for p in players:
        if p.get('foreign') or p['ko'] not in by: st['miss']+=1;continue
        team=p.get('milTeam') or (p['team'] if p['team'] in ('Bears','Twins','Wiz','Dinos','Giants','Lions','Tigers','Eagles','Landers','Heroes') else None)
        isP=p['type']=='P'
        allc=by[p['ko']]
        if team: allc=[r for r in allc if team in r['_teams']]
        c=[r for r in allc if ((('투수' in r['포지션'] or r['포지션']=='투타겸업') if isP else (r['포지션']!='투수' )))]
        if not c: c=allc   # 자료의 포지션 표기가 다른 경우(예: 최정이 투수로 표기)는 이름·팀·나이로만 매칭
        def birth(r):
            y=int(r['연도']);univ=any(re.search(r'대$',t) and t not in ALI for t in r['_toks'])
            return y-(21 if any(TWO.search(t) for t in r['_toks']) else 23) if univ else y-19
        cur=2027-p['age']
        tol=2 if p.get('birth') else 5
        c=[r for r in c if abs(birth(r)-cur)<=tol and int(r['연도'])<=2027]
        if len(c)>1:
            c.sort(key=lambda r:abs(birth(r)-cur))
            if abs(birth(c[0])-cur)==abs(birth(c[1])-cur):
                man=MANUAL_DH.get((p['ko'],p.get('team'),p['age']))   # 동명이인 수동 확정(사용자 지정): 한화 박준영 — 어린 쪽(24세)=2022 1라운드 전체 1순위, 다른 쪽=2026 육성선수
                cm=[r for r in c if man and r['갈래']==man]
                if len(cm)==1: c=cm
                else: st['amb'].append(p['ko']);continue
        if len(c)!=1: st['miss']+=1;continue
        r=c[0];toks=r['_toks']
        univ=any(re.search(r'대$',t) and t not in ALI for t in toks) and not any('중퇴' in t for t in toks)
        rnd=re.match(r'(\d+)라운드',r['갈래']);pick=re.search(r'(\d+)',r['자리'] or '')
        p['dh']={'y':int(r['연도']),'univ':univ,'two':any(TWO.search(t) for t in toks),'deb':int(r['데뷔']) if r['데뷔'] else None,'ss':int(r['시즌']) if r['시즌'] else 0,
                 'g':int(r['통산 경기']) if r['통산 경기'] else 0,'pa':int(r['타석']) if r['타석'] else 0,'ip':float(r['이닝'].split('.')[0]) if r['이닝'] else 0,
                 'one':bool(team) and bool(r['_teams']) and set(r['_teams'])=={team},
                 'dt':ALI.get(r['지명 구단']),'first':r['갈래']=='1차','kind':r['갈래'],'round':int(rnd.group(1)) if rnd else None,'pick':int(pick.group(1)) if pick else None,'school':toks[0]}
        if p.get('ageEst'):   # 생년월일을 모르는 선수는 입단 연도·학력으로 나이를 다시 추정
            p['age']=2027-birth(r);p['ageEstDraft']=True
        st['ok']+=1
    return st
DHS=load_drafthist(players)

# FA 이력(사용자 제공 CSV): FA 행사 여부·등급·행사 횟수 → p['fah'](목록). 후보는 나이 27세 이상(FA 자격 연수 때문에), 동명이인은 FA 계약 CSV 매칭(p['ct'])·출전량으로 선택.
def load_fahist(players):
    import csv,re
    f=D+'game/data/fa_history.csv'
    if not os.path.exists(f): return {'ok':0,'miss':[]}
    by={}
    for p in players:
        if not p.get('foreign') and p.get('team')!='RET': by.setdefault(p['ko'],[]).append(p)
    st={'ok':0,'miss':[]}
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        name=re.sub(r'\s*\(.*\)','',r['선수명']);hint=(re.findall(r'\((.*)\)',r['선수명']) or [''])[0]
        c=[p for p in by.get(name,[]) if p['age']>=27]
        if hint=='투수': c=[p for p in c if p['type']=='P']
        elif hint=='외야수': c=[p for p in c if p['type']=='B']
        c.sort(key=lambda p:(-(1 if p.get('ct') else 0),-((p.get('PA') or 0)+1.5*(p.get('IP') or 0))))
        if not c: st['miss'].append((r['선수명'],r['자격시즌']));continue
        p=c[0]
        g=r['등급'].split()[0] if r['등급'] and r['등급'].split()[0] in ('A','B','C') else None
        cnt=re.match(r'(\d+)',r['FA행사횟수_확인분'] or '');used=int(cnt.group(1)) if cnt else (1 if '두 번째 FA 자격' in (r['FA행사횟수_확인분'] or '') else None)
        pg=re.search(r'(\d{4}) ([ABC])',r['직전FA등급'] or '')
        p.setdefault('fah',[]).append({'y':int(r['자격시즌']),'g':g,'st':r['자격상태'].split()[0],'used':used,'prev':pg.group(2) if pg else None})
        st['ok']+=1
    return st
FAH=load_fahist(players)

# 2027 시즌 외국인 선수 계약(뉴스 검색으로 확정이 확인된 것만, game/data/foreign_2027.csv)
def load_foreign27():
    import csv
    f=D+'game/data/foreign_2027.csv'
    if not os.path.exists(f): return []
    TMF={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    out=[]
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        out.append(dict(team=TMF[r['팀']],name=r['선수명'],aq=r['구분']=='AQ',type='P' if r['포지션']=='투수' else 'B',status=r['상태'],total=int(r['총액_달러']) if r['총액_달러'] else None,
                        bonus=int(r['계약금_달러']) if r['계약금_달러'] else None,opt=int(r['옵션_달러']) if r['옵션_달러'] else None,term=r['기간'],date=r['확정일']))
    return out
FOREIGN27=load_foreign27()

# 2027 FA 승인 선수 22명(KBO 2026-11-16 공시). 상태 '계약'(양의지·오태곤)은 FA 계약 CSV로 이미 반영, '미계약'은 시장에서 시작
def load_faclass():
    import csv
    f=D+'game/data/fa_class_2027.csv'
    if not os.path.exists(f): return []
    TMC={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    return [dict(team=TMC[r['팀']],name=r['선수명'],type='P' if r['포지션']=='투수' else 'B',pos=r['포지션'],signed=r['상태']=='계약',note=r['계약']) for r in csv.DictReader(open(f,encoding='utf-8-sig'))]
FACLASS=load_faclass()
# 2025 구단 재무(감사보고서·언론 보도 종합, finance_2025.csv) + 2026 평균 관중·구장 수용인원 → 입장 수입 모델의 입력
def load_finance():
    import csv
    f=D+'game/data/finance_2025.csv'
    if not os.path.exists(f): return {}
    TMC={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    fl=lambda v: float(v) if v not in ('',None) else None
    aud={}
    fa=D+'game/data/finance_audit_2025.csv'
    if os.path.exists(fa):
        for r in csv.DictReader(open(fa,encoding='utf-8-sig')): aud.setdefault(TMC[r['팀']],[]).append([r['구분'],r['항목'],fl(r['금액_억']),r['비고']])
    cst={}
    fc=D+'game/data/finance_cost_2025.csv'
    if os.path.exists(fc):
        for r in csv.DictReader(open(fc,encoding='utf-8-sig')): cst[TMC[r['팀']]]=dict(team=fl(r['선수단운영비_억']),staff=fl(r['직원급여_억']),game=fl(r['경기진행_억']),biz=fl(r['사업·구장원가_억']),unsplit=fl(r['선수단+사업 미분리_억']),other=fl(r['기타(감가·수수료·협회비 등)_억']),total=fl(r['영업비용_억']),note=r['분류 근거'])
    return {TMC[r['팀']]:dict(costs=cst.get(TMC[r['팀']]),audit=aud.get(TMC[r['팀']],[]),rev=fl(r['매출_억']),cost=fl(r['영업비용_억']),op=fl(r['영업이익_억']),gate=fl(r['입장수입_억']),md=fl(r['사업(MD)수입_억']),att=int(r['2026평균관중']),att25=int(r['2025평균관중']),g26=int(r['2026홈경기수']),tot26=int(r['2026총관중']),gate26=fl(r['2026입장수입_억']),tot25=int(r['2025총관중']),park=r['구장'],cap=int(r['수용인원']),capsrc=r['수용인원_근거'],par=fl(r['모기업의존도_%']),parsrc=r['의존도_근거'],capchg=[[int(x.split(':')[0]),int(x.split(':')[1])] for x in r['수용인원_변경'].split(';') if x],chgsrc=r['변경_근거'],note=r['비고']) for r in csv.DictReader(open(f,encoding='utf-8-sig'))}
FINANCE=load_finance()
# 코칭스태프: ① 사용자 제공 1군 감독·코치(coaches_managers_2026.csv, 2026-10 기준) + 퓨처스 감독·코치(coaches_futures_2026.csv, 2026 기준) ② 2027 보도 변동(coaches_2027.csv: 감독 교체·코치 이동·신규)
# 코치 보직은 명단에 없어 선수 시절 포지션(드래프트 자료)으로 추정, 자료 없음은 게임에서 부족한 보직으로 배정. 능력치는 모두 가상.
def load_coaches():
    import csv,re
    TMC={'한화':'Eagles','LG':'Twins','SSG':'Landers','두산':'Bears','키움':'Heroes','KT':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers'}
    out=[];f=D+'game/data/coaches_2027.csv'
    news=list(csv.DictReader(open(f,encoding='utf-8-sig'))) if os.path.exists(f) else []
    # 1군 감독: 사용자 제공(2026-10) → 2027 보도 감독 교체(한화 류지현·롯데 이동욱)로 덮어씀
    mg={}
    fm=D+'game/data/coaches_managers_2026.csv'
    cm=list(csv.DictReader(open(fm,encoding='utf-8-sig'))) if os.path.exists(fm) else []
    for r in cm:
        if r['구분']=='감독': mg[TMC[r['구단']]]=dict(team=TMC[r['구단']],name=r['이름'],role='감독',level='1군',src='사용자 제공 1군 감독·코치 명단(2026-10 기준)',birth=r['생년월일'])
    for r in news:
        if r['보직']=='감독' and r['이름']!='(미확인)':
            t=TMC[r['팀']]
            if t not in mg or mg[t]['name']!=r['이름']: mg[t]=dict(team=t,name=r['이름'],role='감독',level='1군',src=r['근거'],birth=None)
    out+=list(mg.values())
    ALI={'SK':'Landers','SSG':'Landers','넥센':'Heroes','키움':'Heroes','히어로즈':'Heroes','우리':'Heroes','두산':'Bears','OB':'Bears','LG':'Twins','MBC':'Twins','KT':'Wiz','kt':'Wiz','NC':'Dinos','롯데':'Giants','삼성':'Lions','KIA':'Tigers','해태':'Tigers','한화':'Eagles','빙그레':'Eagles','현대':'Heroes','쌍방울':'Landers'}
    TWO=re.compile(r'과학|전문|영동|산업|관광|디지털|사이버|국제대')
    dr=[]
    for r in csv.DictReader(open(D+'game/data/draft_2002_2027.csv',encoding='utf-8-sig')):
        toks=r['이력'].split('-');univ=any(re.search(r'대$',t) and t not in ALI for t in toks)
        by=int(r['연도'])-(21 if any(TWO.search(t) for t in toks) else 23) if univ else int(r['연도'])-19
        dr.append((re.sub(r'\s*\(.*\)','',r['선수']),by,r['포지션'],[ALI[t] for t in toks if t in ALI]))
    staff=[]   # (팀,이름,생년월일,구분,src)
    for r in cm:
        if r['구분']=='코치': staff.append((TMC[r['구단']],r['이름'],r['생년월일'],'1군','사용자 제공 1군 코치 명단(2026-10 기준)'))
    ff=D+'game/data/coaches_futures_2026.csv'
    if os.path.exists(ff):
        for r in csv.DictReader(open(ff,encoding='utf-8-sig')):
            if r['팀'] not in TMC: continue
            staff.append((TMC[r['팀']],r['이름'],r['생년월일'],'퓨처스 감독' if r['구분']=='감독' else '퓨처스','사용자 제공 퓨처스 선수등록 명단(2026 기준)'))
    # 2027 변동(보도): 한화 재계약 불발 코치 제외, 롯데 퓨처스 감독 박승민(전 한화 코치로 추정)·SSG 퓨처스 감독 박재상, 신규 영입
    GONE={('Eagles','양승관'),('Eagles','김재걸'),('Eagles','김민호'),('Eagles','박승민'),('Landers','박정권'),('Giants','김용희')}
    staff=[x for x in staff if (x[0],x[1]) not in GONE]
    for r in news:
        if r['보직']=='감독': continue
        role=r['보직'];t=TMC[r['팀']]
        if r['이름'] in ('박재상','박승민') or role=='퓨처스 감독': lv='퓨처스 감독'
        else: lv=r['구분']
        if any(x[0]==t and (x[1]==r['이름'] or x[1].startswith(r['이름']) or r['이름'].startswith(x[1])) for x in staff): continue
        staff.append((t,r['이름'],None,lv,'2027 보도: '+r['근거']))
    seen=set();inf={};alt={}
    for t,nm,bd,lv,src in staff:
        if (t,nm,bd) in seen: continue
        seen.add((t,nm,bd))
    for t,nm,bd,lv,src in staff:
        if lv=='퓨처스 감독' or not bd: continue
        b=int(bd[:4]);c=[x for x in dr if x[0]==nm and abs(x[1]-b)<=3];c.sort(key=lambda x:(t not in x[3],abs(x[1]-b)))
        pos=c[0][2] if c else None;role=None
        if pos:
            if '투수' in pos and pos!='투수,내야수': role='투수코치'
            elif pos=='포수': role='수비코치'
            else: alt[t]=alt.get(t,0)+1;role=['타격코치','수비코치'][alt[t]%2]
        inf[(t,nm,bd)]=role
    done=set()
    for t,nm,bd,lv,src in staff:
        if (t,nm,bd) in done: continue
        done.add((t,nm,bd))
        if lv=='퓨처스 감독': role='퓨처스 감독'
        else:
            # 2027 보도에 보직이 있으면 우선(전 투수코치 등)
            nr=[r['보직'] for r in news if TMC[r['팀']]==t and r['이름']==nm and r['보직'] not in('감독','퓨처스 감독')]
            role=nr[0] if nr else (inf.get((t,nm,bd)) or '보직 미상')
        out.append(dict(team=t,name=nm,role=role,level=lv,src=src,birth=bd))
    return out
COACHES=load_coaches()
# 능력치 척도(20-80): ratings.py 와 같은 방식(규정 타자 PA≥300 / 규정 투수 TBF≥200 가중 평균·표준편차)
def scale(rows,fields,w):
    out={}
    for f in fields:
        v=[r['p'][f] for r in rows];t=[w(r) for r in rows];mu=sum(a*b for a,b in zip(v,t))/sum(t);sd=math.sqrt(sum(b*(a-mu)**2 for a,b in zip(v,t))/sum(t));out[f]=[mu,sd]
    return out
regB=[b for b in R['batters'] if b['PA']>=300];regP=[p for p in R['pitchers'] if p['TBF']>=200]
# 고교 → 연고 구단(사용자 제공 지역 연고 학교 표): 선수 DB의 약칭(유신고·선린인고 등)과 맞추기 위해 도시 접두어를 뗀 별칭도 등록
def load_school_home():
    import csv
    f=D+'game/data/school_home.csv'
    if not os.path.exists(f): return {}
    TMC={'두산':'Bears','LG':'Twins','키움':'Heroes','SSG':'Landers','KT':'Wiz','한화':'Eagles','KIA':'Tigers','삼성':'Lions','롯데':'Giants','NC':'Dinos'}
    CITY=['수원','안양','안산','시흥','의정부','평택','천안','순천','정읍','나주','대구','포항','속초','구미','부산','마산','양산','파주','동두천','부천','구리','경기','광주','서울','인천','청주']
    EXTRA={'광주일고':'광주제일고','포철고':'포항제철고','선린인고':'선린인터넷고','동산고':'인천동산고'}
    sh={}
    for r in csv.DictReader(open(f,encoding='utf-8-sig')):
        tm=[TMC[x] for x in r['구단'].split('|')];n=r['학교']
        names={n}
        for c in sorted(CITY,key=len,reverse=True):
            if n.startswith(c) and len(n)-len(c)>=3 and n not in ('서울동산고',): names.add(n[len(c):])
        for a in names: sh.setdefault(a,[]).append((tm,n))
    out={}
    for a,v in sh.items():
        full={n for _,n in v}
        if len(full)>1 and a not in EXTRA: continue   # 모호한 약칭은 제외
        out[a]=v[0][0]
    for a,full in EXTRA.items():
        for _,vv in sh.items():
            for tm,n in vv:
                if n==full: out[a]=tm
    return out
SCHOOLHOME=load_school_home()
def load_awards():   # 실제 KBO 신인왕·골든글러브 2020~2025(사용자 제공, 2026 시상 예정: 신인왕 11/26·골든글러브 12/8)
    import csv
    f=D+'game/data/awards_2020_2025.csv'
    return [dict(y=int(r['연도']),k=r['구분'],pos=r['포지션'],name=r['선수'],team=r['팀'],note=r['비고']) for r in csv.DictReader(open(f,encoding='utf-8-sig'))] if os.path.exists(f) else []
AWARDS=load_awards()
out={'awards':AWARDS,'schoolHome':SCHOOLHOME,'coaches':COACHES,'finance':FINANCE,'faclass2027':FACLASS,'foreign2027':FOREIGN27,'draft2027':DRAFT,'teams':TEAMS,'players':players,'league_bat':R['league_bat'],'team_def':R['team_def'],'pf':PK['pf_by_team'],
 'fielding':{'lg':F['lg'],'team_avg_range':F['team_avg_range']},
 'scale':{'B':scale(regB,['k','bb','hr','babip','xbh','sba'],lambda r:r['PA']),'P':scale(regP,['k','bb','hr','babip'],lambda r:r['TBF'])}}
os.makedirs(D+'game/src',exist_ok=True)
json.dump(out,open(D+'game/src/gamedata.json','w',encoding='utf8'),ensure_ascii=False,separators=(',',':'))
from collections import Counter
print('선수',len(players),Counter(p['type'] for p in players),'팀별',Counter(p['team'] for p in players).most_common(3),'| KB',os.path.getsize(D+'game/src/gamedata.json')//1024)
print('나이 공란(28세 가정):',NOAGE)
print('주 포지션 분포',Counter(p['pos'] for p in players if p['type']=='B'))

print('투타 매칭',HITS,'| 건너뜀(소속 불일치/모호)',SKIP,'| 1군 데이터에 없는 2군 선수',len(MISS))

if FUT:
    print('퓨처스 타자: 1군 선수와 매칭',FUT[3],'| 신규 2군 타자',len(FUT[0]),'| 소속 미정(상무·울산)',len(FUT[2]))
    print('환산식',{k:{a:round(b,4) for a,b in v.items()} for k,v in FUT[1].items()})

if FUTP:
    print('퓨처스 투수: 1군 선수와 매칭',FUTP[3],'| 신규 2군 투수',len(FUTP[0]),'(선발 추정 %d)'%sum(1 for p in FUTP[0] if p['role']=='SP'),'| 소속 미정(상무·울산)',len(FUTP[2]))
    print('투수 환산식',{k:{a:round(b,4) for a,b in v.items()} for k,v in FUTP[1].items()})

print('군 복무(상무) 반영:',sum(1 for p in players if p.get('team')=='MIL'),'명 (기존 1군 데이터 %d, 신규 %d)'%(sum(1 for p in players if p.get('team')=='MIL' and p.get('src')!='F'),sum(1 for p in players if p.get('team')=='MIL' and p.get('src')=='F')))

print('연봉 반영',SALOK,'명 | 동명이인 등으로 건너뜀',len(SALSKIP),'| 선수 데이터에 없음',len(SALMISS),'| 외국인',sum(1 for p in players if p.get('foreign')))

print('1군 명단(생년월일·투타): 매칭',R1['ok'],'| 나이 정정',R1['agefix'],'| 1군 등록',R1['reg1'],'| 모호',R1['amb'],'| 미매칭',R1['miss'])

print('2027 드래프트 지명',len(DRAFT),'명')

print('FA 계약 반영',FAC['ok'],'| 시장 진출',FAC['fa'],'| 매칭 실패',FAC['skip'])

print('드래프트 이력 매칭',DHS['ok'],'| 모호',DHS['amb'],'| 미매칭',DHS['miss'],'| 나이 재추정',sum(1 for p in players if p.get('ageEstDraft')))

print('FA 이력 반영',FAH['ok'],'행 | 미매칭(은퇴·자료 없음)',FAH['miss'])

print('2027 외국인 확정 계약',len(FOREIGN27),'건')

print('2027 FA 승인 선수',len(FACLASS),'명 (계약 확정 %d)'%sum(1 for x in FACLASS if x['signed']))
