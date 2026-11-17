import json,collections,os
P=json.load(open('parks_raw.json',encoding='utf8'));cols=P['cols'];TEAMS=list(P['teams'])
K={'runs':0.92,'hr':0.97,'b1':0.45,'b2':0.40,'b3':0.40}      # shrink = year-to-year reliability measured above
IDX={'runs':1,'b1':2,'b2':3,'b3':4,'hr':5}
B=json.load(open('batting_2026.json',encoding='utf8'));s1=sum(r['B1'] for r in B);s2=sum(r['B2'] for r in B);s3=sum(r['B3'] for r in B);tot=s1+s2+s3
SH={'b1':s1/tot,'b2':s2/tot,'b3':s3/tot}
def raw(mode):
    out={}
    for park in set(P['teams'].values()):
        r={}
        for f,i in IDX.items():
            num=den=0.0
            for y,w in ([('y2026',1.0)] if mode=='y2026' else [('y2026',5),('y2025',3),('y2024',2)]):
                v=P[y].get(park)
                if v is None: continue
                if park=='대전' and y=='y2025' and f!='runs': continue   # placeholder 1.000 in source
                num+=w*v[i]/1000;den+=w
            r[f]=num/den if den else 1.0
        out[park]=r
    return out
def build(mode):
    MM=json.load(open('resid.json')).get(mode,{}) if os.path.exists('resid.json') else {}
    rw=raw(mode);w={p:0.0 for p in rw}
    for t,p in P['teams'].items(): w[p]+=0.1
    pf={}
    for f in IDX:
        shr={p:1+K[f]*(rw[p][f]-1) for p in rw}
        if f in ('b1','b2','b3'): shr={p:shr[p]*MM.get(p,1.0) for p in rw}
        m=sum(w[p]*shr[p] for p in rw)
        for p in rw: pf.setdefault(p,{})[f]=shr[p]/m
    byteam={t:dict(pf[P['teams'][t]]) for t in TEAMS}
    env={}
    for t in TEAMS:
        others=[u for u in TEAMS if u!=t];e={}
        for f in IDX:
            road=sum(byteam[u][f] for u in others)/len(others);e[f]=0.5*byteam[t][f]+0.5*road
        e['nh']=sum(SH[x]*e[x] for x in SH);env[t]=e
    return {'pf_by_park':pf,'pf_by_team':byteam,'env':env}
out={'y2026':build('y2026'),'blend':build('blend'),'none':None}
json.dump(out,open('parks.json','w',encoding='utf8'),ensure_ascii=False)
KO={'Bears':'두산','Twins':'LG','Heroes':'키움','Landers':'SSG','Wiz':'KT','Eagles':'한화','Tigers':'KIA','Giants':'롯데','Dinos':'NC','Lions':'삼성'}
print("구장 | 모드 | 득점 홈런 단타 2루타 3루타 (1.00=중립, 보정·정규화 후)")
for p in ['잠실','고척','문학','수원','대전','광주','사직','창원','대구']:
    for m in ['y2026','blend']:
        v=out[m]['pf_by_park'][p];print(f" {p} | {m:5} | "+" ".join(f"{v[f]:.3f}" for f in ['runs','hr','b1','b2','b3']))
print("\n팀 환경(홈 절반+원정 절반) 홈런 / 안타(비홈런) — 선수 기록에서 걷어낼 값 (2026 모드)")
print(" ".join(f"{KO[t]} {out['y2026']['env'][t]['hr']:.3f}/{out['y2026']['env'][t]['nh']:.3f}" for t in TEAMS))
