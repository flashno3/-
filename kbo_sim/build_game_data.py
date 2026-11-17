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
