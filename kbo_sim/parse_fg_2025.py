import re,json,sys,os
D0=os.path.dirname(os.path.abspath(__file__))+'/';D=D0+'raw25/'
BC="no name team age G AB PA H B1 B2 B3 HR R RBI BB IBB SO HBP SF SH GDP SB CS AVG".split()
PC="no name team age W L ERA G GS CG ShO SV BS HLD IP TBF H R ER HR BB IBB HBP WP BK SO".split()
INTS=set("G AB PA H B1 B2 B3 HR R RBI BB IBB SO HBP SF SH GDP SB CS W L GS CG ShO SV BS HLD TBF ER BK WP".split())
def parse(prefix,cols):
    rows=[]
    for k in range(1,7):
        seen_hdr=0
        for ln in open(f'{D}{prefix}{k}.txt',encoding='utf-8'):
            ln=ln.rstrip('\n')
            if ln.startswith('#\tName\tTeam'):
                seen_hdr+=1
                if seen_hdr==1 and 'Age' in ln: continue
                if seen_hdr>=2: break   # second list is a name-only copy
                continue
            f=ln.split('\t')
            if len(f)==len(cols) and f[0].isdigit():
                r=dict(zip(cols,f));rows.append(r)
    return rows
def conv(r):
    r=dict(r);r['no']=int(r['no']);t=r['team'].replace(' (KBO)','').strip();r['team']='---' if t=='- - -' else t
    for c in INTS&set(r): r[c]=int(r[c])
    if 'IP' in r:
        a,b=(r['IP'].split('.')+['0'])[:2];r['outs']=int(a)*3+int(b)
    return r
B=[conv(r) for r in parse('bat',BC)];P=[conv(r) for r in parse('pit',PC)]
json.dump(B,open(D0+'batting_2025.json','w',encoding='utf8'),ensure_ascii=False)
json.dump(P,open(D0+'pitching_2025.json','w',encoding='utf8'),ensure_ascii=False)
print(len(B),len(P))
