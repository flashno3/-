import csv,json,os
D=os.path.dirname(os.path.abspath(__file__))+'/'
INTS="G AB PA H B1 B2 B3 HR R RBI BB IBB SO HBP SF SH GDP SB CS".split()
rows=list(csv.reader(open(D+'raw24/kbo_2024_batting_top300.csv',encoding='utf-8-sig')))
hdr=rows[0];assert hdr[:4]==['#','Name','Team','Age'],hdr
cols=['no','name','team','age','G','AB','PA','H','B1','B2','B3','HR','R','RBI','BB','IBB','SO','HBP','SF','SH','GDP','SB','CS','AVG']
assert len(hdr)==len(cols)
B=[]
for r in rows[1:]:
    if not r or not r[0].strip(): continue
    assert len(r)==len(cols),r
    q=dict(zip(cols,r));q['no']=int(q['no'])
    for c in INTS: q[c]=int(q[c])
    t=q['team'].replace(' (KBO)','').strip();q['team']='---' if t=='- - -' else t
    B.append(q)
json.dump(B,open(D+'batting_2024.json','w',encoding='utf8'),ensure_ascii=False)
print(len(B))
# ---- 투수 ----
PC=['no','name','team','age','W','L','ERA','G','GS','CG','ShO','SV','BS','HLD','IP','TBF','H','R','ER','HR','BB','IBB','HBP','WP','BK','SO']
PI="W L G GS CG ShO SV BS HLD TBF H R ER HR BB IBB HBP WP BK SO".split()
rows=list(csv.reader(open(D+'raw24/kbo_2024_pitching_all289.csv',encoding='utf-8-sig')))
assert rows[0][:4]==['#','Name','Team','Age'] and len(rows[0])==len(PC)
P=[]
for r in rows[1:]:
    if not r or not r[0].strip(): continue
    assert len(r)==len(PC),r
    q=dict(zip(PC,r));q['no']=int(q['no'])
    for c in PI: q[c]=int(q[c])
    a,b=(q['IP'].split('.')+['0'])[:2];q['outs']=int(a)*3+int(b)
    t=q['team'].replace(' (KBO)','').strip();q['team']='---' if t=='- - -' else t
    P.append(q)
# FanGraphs 2배 집계 보정 (2026 대니엘·보스와 동일 유형). 근거: GS 38은 불가능(최대 약 33), 전 항목이 짝수, 절반 적용 시 한화 GS 합이 정확히 144
HALVE={'Jaime Barria 바리아'}
CNT="W L G GS CG ShO SV BS HLD TBF H R ER HR BB IBB HBP WP BK SO".split()
for q in P:
    if q['name'] in HALVE:
        assert all(q[c]%2==0 for c in CNT) and q['outs']%2==0,q
        for c in CNT: q[c]//=2
        q['outs']//=2;q['IP']=f"{q['outs']//3}.{q['outs']%3}";q['fixed']='FG 2배 집계 보정(÷2)'

# ---- 시즌 중 팀을 옮긴 선수(FG는 ---로 합산) 팀별 비중: 구장 효과·팀 수비 집계에 사용 (사용자 확인값)
SPLIT={'Keisho Shirakawa 시라카와':{'Bears':7,'Landers':5}}   # 경기 수 기준 (베어스 7경기, 랜더스 5경기)
for q in P:
    if q['name'] in SPLIT: q['split']=SPLIT[q['name']]
# ---- KBO 기록실(삼성 2024)에만 있는 투수: FanGraphs 목록 누락분 ----
# 코너(시볼드): KBO 기록실 기본기록만 있음. 없는 항목은 추정/0 처리하고 fixed 에 명시(한재승 선례).
#  - GS=28 : G=28, SV=HLD=0, 평균 5.7이닝/경기 -> 전 경기 선발. 라이온즈 선발 합이 정확히 144가 되는 값
#  - TBF   : 아웃+피안타+볼넷+사구 의 하한값에 2024 리그 평균 비율(TBF/하한)을 곱해 추정 (약 ±1%)
#  - CG, ShO, BS, IBB, WP, BK 는 미확인 -> 0
import re,statistics
def _outs(t):
    w=f=0
    for x in t.split():
        if '/' in x: f=int(x[0])
        else: w=int(x)
    return w*3+f
_ratio=statistics.mean(r['TBF']/(r['outs']+r['H']+r['BB']+r['HBP']) for r in P if r['outs']>=300 and r['team']!='---')
for ln in open(D+'raw24/kbo_samsung_2024_pitching.txt',encoding='utf8'):
    k=ln.rstrip('\n').split('\t')
    if len(k)<19 or k[1]!='코너': continue
    o=_outs(k[10]);H,BB,HBP=int(k[11]),int(k[13]),int(k[14])
    P.append({'no':len(P)+1,'name':'코너','team':'Lions','age':'','W':int(k[5]),'L':int(k[6]),'ERA':k[3],'G':int(k[4]),'GS':int(k[4]),
      'CG':0,'ShO':0,'SV':int(k[7]),'BS':0,'HLD':int(k[8]),'IP':f"{o//3}.{o%3}",'TBF':round(_ratio*(o+H+BB+HBP)),'H':H,'R':int(k[16]),'ER':int(k[17]),
      'HR':int(k[12]),'BB':BB,'IBB':0,'HBP':HBP,'WP':0,'BK':0,'SO':int(k[15]),'outs':o,
      'fixed':'KBO 기록실 입력(FG에 없음). GS=G로 추정, TBF 추정(리그 비율), CG·ShO·BS·IBB·WP·BK 미확인=0'})
json.dump(P,open(D+'pitching_2024.json','w',encoding='utf8'),ensure_ascii=False)
print(len(P))
