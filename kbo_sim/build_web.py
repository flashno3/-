"""엔진 검증용 데이터 생성(단독 시뮬레이터 화면은 제거됨).
  python3 build_web.py        -> web/src/data.json (web/tests 일치 검사와 포스트시즌 검사가 읽는다)
데이터는 엔진이 실제로 쓰는 필드만 추려 담는다(값은 원본 그대로, 반올림 없음 → 파이썬 엔진과 동일 결과)."""
import json,os,re
D=os.path.dirname(os.path.abspath(__file__))+'/'
J=lambda f:json.load(open(D+f,encoding='utf8'))
POSMAP={'포수':'C','1루수':'1B','2루수':'2B','유격수':'SS','3루수':'3B','좌익수':'LF','중견수':'CF','우익수':'RF'}
MODES={'forward':('ratings_forward_pk.json','blend','예측 모드 (2026·2025·2024 블렌딩)'),
       'replay':('ratings_replay_pk.json','y2026','재현 모드 (2026 시즌)')}
parks=J('parks.json');F=J('fielding.json');DEF=J('defense_parsed.json')['D'];POS=J('positions.json')
out={'modes':{},'shared':{}}
keys=set()
for m,(rf,pm,label) in MODES.items():
    R=J(rf)
    bats=[{'key':x['key'],'name':x['name'],'team':x['team'],'age':x['age'],'PA':x['PA'],'G':x['G'],'p':x['p']} for x in R['batters'] if POS[x['key']]!=['P']]
    keys|={b['key'] for b in bats}
    pits=[{'name':x['name'],'team':x['team'],'age':x['age'],'GS':x['GS'],'G':x['G'],'IP':x['IP'],'ip_per_start':x['ip_per_start'],'p':x['p']} for x in R['pitchers']]
    out['modes'][m]={'label':label,'park_mode':pm,'league_bat':R['league_bat'],'team_def':R['team_def'],'batters':bats,'pitchers':pits,
                     'pf':{t:parks[pm]['pf_by_team'][t] for t in parks[pm]['pf_by_team']}}
out['shared']['positions']={k:POS[k] for k in keys}
out['shared']['defense']={k:{POSMAP[p]:[r['outs'],r['GS']] for p,r in DEF.get(k,{}).items()} for k in keys}
out['shared']['fielding']={'players':{k:{p:{'range':v['range'],'err_reg':v['err_reg']} for p,v in F['players'][k].items()} for k in keys if k in F['players']},
    'catchers':{k:{'cs_reg':v['cs_reg']} for k,v in F['catchers'].items()},'team_avg_range':F['team_avg_range'],'lg':F['lg']}
os.makedirs(D+'web/src',exist_ok=True)
json.dump(out,open(D+'web/src/data.json','w',encoding='utf8'),ensure_ascii=False,separators=(',',':'))
print('data.json',os.path.getsize(D+'web/src/data.json')//1024,'KB')
