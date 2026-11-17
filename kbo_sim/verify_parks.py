import os;os.chdir(os.path.dirname(os.path.abspath(__file__)))
import csv,json
rows=list(csv.reader(open('kbo_park_factors_2024_2026.csv',encoding='utf-8-sig')))[1:]
P=json.load(open('parks_raw.json'));PJ=json.load(open('parks.json'))
bad=0
for r in rows:
    if not r or not r[0]: continue
    park,mode=r[0],r[1]
    f=lambda x:float(x) if x else None
    if '원자료' in mode:
        y='y'+mode[:4];v=P[y].get(park)
        csvv=[f(x) for x in r[2:9]]
        if v is None:
            print('raw 없음',park,y,csvv[:2]);continue
        if any(a is None or abs(a-b)>1e-9 for a,b in zip(csvv,v)): print('RAW 불일치',park,y,csvv,v);bad+=1
    else:
        m='y2026' if '재현' in mode else 'blend'
        pf=PJ[m]['pf_by_park'][park];exp=[f(x) for x in r[3:8]]
        got=[pf[k]*1000 for k in ['runs','b1','b2','b3','hr']]
        d=[round(g-e,1) for g,e in zip(got,exp)]
        flag=max(abs(x) for x in d)>1.0
        bad+=flag
        print(('!!' if flag else 'ok'),park,m,'diff(runs,b1,b2,b3,hr)=',d)
print('불일치 건수',bad)
