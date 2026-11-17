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
json.dump(P,open(D+'pitching_2024.json','w',encoding='utf8'),ensure_ascii=False)
print(len(P))
