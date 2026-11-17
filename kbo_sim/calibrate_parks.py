import subprocess,json,os
PK=['잠실','고척','문학','수원','대전','광주','사직','창원','대구']
MODES={'y2026':('ratings_replay_pk.json','0.03'),'blend':('ratings_forward_pk.json','1.0')}
SEAS={'y2026':'2026','blend':os.environ.get('BLEND_SEASONS','2026:1,2025:0.6')}  # 예측 모드: 2026 + 2025(가중 0.6). 2024 추가 시 '2026:1,2025:0.6,2024:0.4'
resid={m:{p:1.0 for p in PK} for m in MODES}
def run(cmd,**env): return subprocess.run(cmd,env=dict(os.environ,**env),capture_output=True,text=True)
for it in range(1,5):
    json.dump(resid,open('resid.json','w'));run(['python3','parks.py']);pj=json.load(open('parks.json'))
    for m,(out,sc) in MODES.items():
        run(['python3','ratings.py'],REG_SCALE=sc,PARK=m,OUT=out,SEASONS=SEAS[m])
        run(['python3','engine2.py','40',f'sim_cal_{m}.json'],PARK=m,RAT=out)
        S=json.load(open(f'sim_cal_{m}.json'));pk=S['park'];tot=sum(v[0] for v in pk.values())/sum(v[1] for v in pk.values())
        errs=[]
        for p in PK:
            sim=(pk[p][0]/pk[p][1])/tot;tgt=pj[m]['pf_by_park'][p]['runs'];errs.append(abs(sim-tgt))
            resid[m][p]*=(tgt/sim)**0.6
        print(f"반복 {it} [{m}] 득점 파크팩터 평균 절대오차 {sum(errs)/9:.3f} 최대 {max(errs):.3f}",flush=True)
json.dump(resid,open('resid.json','w'));run(['python3','parks.py'])
for m,(out,sc) in MODES.items(): run(['python3','ratings.py'],REG_SCALE=sc,PARK=m,OUT=out,SEASONS=SEAS[m])
print("보정 계수(비홈런 안타 배수):",{p:round(resid['y2026'][p],3) for p in PK})
