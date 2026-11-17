import json,collections,math,csv
J=json.load(open('defense_parsed.json',encoding='utf8'));D=J['D']
KT={'두산':'Bears','NC':'Dinos','한화':'Eagles','롯데':'Giants','키움':'Heroes','SSG':'Landers','삼성':'Lions','KIA':'Tigers','LG':'Twins','KT':'Wiz'}
POSMAP={'포수':'C','1루수':'1B','2루수':'2B','유격수':'SS','3루수':'3B','좌익수':'LF','중견수':'CF','우익수':'RF'}
CE={'C':150,'1B':150,'2B':120,'SS':120,'3B':120,'LF':100,'CF':100,'RF':100}; CR={'2B':450,'SS':450,'3B':450,'LF':600,'CF':600,'RF':600}
W={'2B':.18,'SS':.22,'3B':.16,'1B':.07,'LF':.10,'CF':.17,'RF':.10}
lgE=collections.Counter();lgC=collections.Counter();tp=collections.defaultdict(lambda:[0,0])
for k,pp in D.items():
    for kp,r in pp.items():
        pos=POSMAP[kp];lgE[pos]+=r['E'];lgC[pos]+=r['PO']+r['A']+r['E'];tp[(KT[r['team']],pos)][0]+=r['PO']+r['A'];tp[(KT[r['team']],pos)][1]+=r['outs']
err_lg={p:lgE[p]/lgC[p] for p in lgE};share={p:lgC[p]/sum(lgC.values()) for p in lgC}
rec=[]
for k,pp in D.items():
    for kp,r in pp.items():
        pos=POSMAP[kp];ip=r['outs']/3;ch=r['PO']+r['A']+r['E']
        er=(r['E']+err_lg[pos]*CE[pos])/(ch+CE[pos])
        ratio=None
        if pos in CR:
            a=tp[(KT[r['team']],pos)];avg=a[0]/a[1]*27 if a[1] else 0
            if avg>0 and r['outs']>0:
                x=(r['PO']+r['A'])/r['outs']*27/avg; ratio=(x*ip+CR[pos])/(ip+CR[pos])
        rec.append(dict(key=k,kpos=kp,pos=pos,team=KT[r['team']],ip=ip,er=er,ratio=ratio,G=r['G'],E=r['E'],ch=ch,PB=r['PB'],SB=r['SB'],CS=r['CS']))
def zr(vals,sign):
    reg=[(v,w) for v,w in vals];sw=sum(w for _,w in reg);mu=sum(v*w for v,w in reg)/sw
    sd=math.sqrt(sum(w*(v-mu)**2 for v,w in reg)/sw) or 0.01
    return mu,sd
rate={}
for pos in POSMAP.values():
    reg=[x for x in rec if x['pos']==pos and x['ip']>=250]
    mu_e,sd_e=zr([(x['er'],x['ip']) for x in reg],1)
    if pos in CR: mu_r,sd_r=zr([(x['ratio'],x['ip']) for x in reg if x['ratio']],1)
    for x in rec:
        if x['pos']!=pos: continue
        x['err_rating']=max(20,min(80,round(50-10*(x['er']-mu_e)/sd_e)))
        x['range_rating']=max(20,min(80,round(50+10*(x['ratio']-mu_r)/sd_r))) if (pos in CR and x['ratio']) else 50
# catchers
cat=[x for x in rec if x['pos']=='C'];att=sum(x['SB']+x['CS'] for x in cat);cs_lg=sum(x['CS'] for x in cat)/att
ipt=sum(x['ip'] for x in cat);pb_lg=sum(x['PB'] for x in cat)/ipt
catd={}
for x in cat:
    a=x['SB']+x['CS'];cs=(x['CS']+cs_lg*45)/(a+45);pb=(x['PB']+pb_lg*300)/(x['ip']+300)
    catd[x['key']]={'cs_reg':cs,'pb_reg':pb*9,'att':a,'ip':x['ip']}
regc=[v for v in catd.values() if v['ip']>=300]
mc=sum(v['cs_reg'] for v in regc)/len(regc);sc=math.sqrt(sum((v['cs_reg']-mc)**2 for v in regc)/len(regc))
mp=sum(v['pb_reg'] for v in regc)/len(regc);sp=math.sqrt(sum((v['pb_reg']-mp)**2 for v in regc)/len(regc))
for v in catd.values():
    v['arm']=max(20,min(80,round(50+10*(v['cs_reg']-mc)/sc)));v['block']=max(20,min(80,round(50-10*(v['pb_reg']-mp)/sp)))
players=collections.defaultdict(dict)
for x in rec: players[x['key']][x['pos']]={'ip':round(x['ip'],1),'range':x['range_rating'],'err':x['err_rating'],'err_reg':x['er'],'G':x['G']}
tavg=collections.defaultdict(dict)
for pos in POSMAP.values():
    for t in set(KT.values()):
        r=[x for x in rec if x['pos']==pos and x['team']==t]
        sw=sum(x['ip'] for x in r)
        if sw: tavg[t][pos]=sum(x['range_rating']*x['ip'] for x in r)/sw
json.dump({'players':players,'catchers':catd,'team_avg_range':tavg,'lg':{'err':err_lg,'share':share,'cs':cs_lg,'pb9':pb_lg*9}},open('fielding.json','w',encoding='utf8'),ensure_ascii=False)
# diagnostics
R=json.load(open('ratings_replay.json',encoding='utf8'));td=R['team_def']
xs=[];ys=[]
for t in KT.values():
    xs.append(sum(W[p]*tavg[t].get(p,50) for p in W)/sum(W.values()));ys.append(td[t])
mx=sum(xs)/10;my=sum(ys)/10
r=sum((a-mx)*(b-my) for a,b in zip(xs,ys))/math.sqrt(sum((a-mx)**2 for a in xs)*sum((b-my)**2 for b in ys))
print(f"선수×포지션 {len(rec)}행 | 리그 실책률 { {p:round(v,3) for p,v in err_lg.items()} }")
print(f"포수 도루저지율 {cs_lg*100:.1f}% | 포일 {pb_lg*9:.3f}/9이닝")
print(f"팀 평균 범위 등급 vs 팀 피BABIP 보정치 상관계수 r={r:.2f} (음수일수록 범위 등급이 실제 수비 성과와 일치)")
def top(pos,key,n=3,rev=True):
    c=[x for x in rec if x['pos']==pos and x['ip']>=500];c.sort(key=lambda x:-x[key] if rev else x[key])
    return [(x['key'].split('|')[0].split()[-1],x[key]) for x in c[:n]]
for pos in ['SS','2B','3B','CF']: print(pos,"범위 상위:",top(pos,'range_rating'),"하위:",top(pos,'range_rating',rev=False))
print("포수 어깨 상위:",sorted([(k.split('|')[0].split()[-1],v['arm']) for k,v in catd.items() if v['ip']>=500],key=lambda x:-x[1])[:3],"하위:",sorted([(k.split('|')[0].split()[-1],v['arm']) for k,v in catd.items() if v['ip']>=500],key=lambda x:x[1])[:3])
with open('/mnt/user-data/outputs/kbo_2026_fielding_ratings.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f);w.writerow(['선수','팀','포지션','수비이닝','G','범위','실책(보정 실책률)','보정실책률','포수어깨','포수블로킹','보정도루저지','보정포일/9'])
    B=json.load(open('batting_2026.json',encoding='utf8'));bk={f"{r['name']}|{r['team']}|{r['age']}":r for r in B}
    tk={'Bears':'두산','Dinos':'NC','Eagles':'한화','Giants':'롯데','Heroes':'키움','Landers':'SSG','Lions':'삼성','Tigers':'KIA','Twins':'LG','Wiz':'KT'}
    for k,pp in sorted(players.items(),key=lambda kv:-sum(p['ip'] for p in kv[1].values())):
        for pos,v in sorted(pp.items(),key=lambda kv:-kv[1]['ip']):
            c=catd.get(k) if pos=='C' else None
            w.writerow([k.split('|')[0].split()[-1],tk.get(bk[k]['team'],'복수팀'),pos,v['ip'],v['G'],v['range'] if pos not in('C','1B') else '',v['err'],round(v['err_reg'],4),c['arm'] if c else '',c['block'] if c else '',round(c['cs_reg'],3) if c else '',round(c['pb_reg'],3) if c else ''])
