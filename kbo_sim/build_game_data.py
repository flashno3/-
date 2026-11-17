"""감독 모드용 선수 데이터 생성: ratings_forward_pk.json(3시즌 블렌딩) + 수비·포지션 → game/src/gamedata.json
시작 시점은 2027 시즌 직전(나이 +1). 값은 원본 그대로 두고 필요한 필드만 추린다."""
import json,os,math
D=os.path.dirname(os.path.abspath(__file__))+'/'
J=lambda f:json.load(open(D+f,encoding='utf8'))
R=J('ratings_forward_pk.json');F=J('fielding.json');DEF=J('defense_parsed.json')['D'];POS=J('positions.json');PK=J('parks.json')['blend']
POSMAP={'포수':'C','1루수':'1B','2루수':'2B','유격수':'SS','3루수':'3B','좌익수':'LF','중견수':'CF','우익수':'RF'}
LAST={'Matt Davidson 데이비슨':'Heroes','Ju-suk Ha 하주석':'Tigers','Ah-seop Son 손아섭':'Bears','Seung Min Ryu 류승민':'Bears','Jeong-bum Lee 이정범':'Wiz','Hyeong-beom Lee 이형범':'Eagles'}
TEAMS=['Bears','Dinos','Eagles','Giants','Heroes','Landers','Lions','Tigers','Twins','Wiz']
kor=lambda n:n.split()[-1]
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
        c[0]['sal']=int(r['연봉_만원'])/10000;c[0]['foreign']=bool(r['외국인구분']);ok+=1
    return ok,skip,miss
SALOK,SALSKIP,SALMISS=load_salary(players)
# 능력치 척도(20-80): ratings.py 와 같은 방식(규정 타자 PA≥300 / 규정 투수 TBF≥200 가중 평균·표준편차)
def scale(rows,fields,w):
    out={}
    for f in fields:
        v=[r['p'][f] for r in rows];t=[w(r) for r in rows];mu=sum(a*b for a,b in zip(v,t))/sum(t);sd=math.sqrt(sum(b*(a-mu)**2 for a,b in zip(v,t))/sum(t));out[f]=[mu,sd]
    return out
regB=[b for b in R['batters'] if b['PA']>=300];regP=[p for p in R['pitchers'] if p['TBF']>=200]
out={'teams':TEAMS,'players':players,'league_bat':R['league_bat'],'team_def':R['team_def'],'pf':PK['pf_by_team'],
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
