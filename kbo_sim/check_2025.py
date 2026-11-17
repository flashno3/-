import os
import json,collections as C
B=json.load(open(os.path.dirname(os.path.abspath(__file__))+'/batting_2025.json'));P=json.load(open(os.path.dirname(os.path.abspath(__file__))+'/pitching_2025.json'))
print('순번 연속', [r['no'] for r in B]==list(range(1,301)), [r['no'] for r in P]==list(range(1,282)))
bad=0
for r in B:
    e=[]
    if r['H']!=r['B1']+r['B2']+r['B3']+r['HR']: e.append('H!=1B+2B+3B+HR')
    if r['AB']+r['BB']+r['HBP']+r['SF']+r['SH']!=r['PA']: e.append(f"PA불일치 {r['AB']+r['BB']+r['HBP']+r['SF']+r['SH']} vs {r['PA']}")
    if r['AB'] and abs(r['H']/r['AB']-float(r['AVG']))>0.0006: e.append('AVG')
    if r['IBB']>r['BB']: e.append('IBB>BB')
    if e: bad+=1;print('B',r['no'],r['name'],e)
for r in P:
    e=[]
    ip=r['outs']/3
    if ip and abs(r['ER']*9/ip-float(r['ERA']))>0.011: e.append(f"ERA {r['ER']*9/ip:.2f} vs {r['ERA']}")
    if r['GS']>r['G']: e.append('GS>G')
    if r['HR']>r['H']: e.append('HR>H')
    if r['TBF']<r['outs']*0+ r['H']+r['BB']+r['HBP']+r['outs']-0 -0 and False: pass
    # TBF >= outs + H + BB + HBP (roe/ints can add) -> allow shortfall only if tiny
    mn=r['outs']+r['H']+r['BB']+r['HBP']
    if r['TBF']<mn: e.append(f"TBF<최소 {r['TBF']}<{mn}")
    if r['SO']>r['outs']+0 and False: pass
    if e: bad+=1;print('P',r['no'],r['name'],r['team'],e)
print('이상 건수',bad)
print('중복(이름+팀+나이) 타자',[k for k,v in C.Counter((r['name'],r['team'],r['age']) for r in B).items() if v>1])
print('중복 투수',[k for k,v in C.Counter((r['name'],r['team'],r['age']) for r in P).items() if v>1])
print('팀 분포 타자',dict(C.Counter(r['team'] for r in B)));print('팀 분포 투수',dict(C.Counter(r['team'] for r in P)))
print('미상 팀 타자',[(r['name'],r['G'],r['PA']) for r in B if r['team']=='---'])
print('미상 팀 투수',[(r['name'],r['G'],r['IP']) for r in P if r['team']=='---'])
print('나이공란',[r['name'] for r in B+P if not r['age']])
# 리그 교차검증: 타자 합 vs 투수 합
s=lambda L,k:sum(r[k] for r in L)
print('\n교차검증 (타자 vs 투수)')
for kb,kp in [('H','H'),('HR','HR'),('BB','BB'),('SO','SO'),('HBP','HBP'),('PA','TBF')]:
    print(f'{kb:4} 타자 {s(B,kb):6} 투수 {s(P,kp):6} 차 {s(B,kb)-s(P,kp):+d}')
print('투수 outs',s(P,'outs'),'IP',s(P,'outs')/3)
print('총 경기수(투수 GS 합)',s(P,'GS'),'(기대 720 = 144*10/2... 정규 720경기)')
# 팀별 GS 합
tg=C.Counter();
for r in P: tg[r['team']]+=r['GS']
print('팀별 GS',dict(tg))
# 동명이인 / 이름변경 후보: 25에는 있으나 26에는 없는 이름 등은 후속
