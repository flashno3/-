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
