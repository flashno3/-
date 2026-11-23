"""감독 모드 빌드: python3 build_game_data.py && python3 build_game.py -> game/index.html (단일 파일), game/artifact.html (게시용 본문)"""
import os
D=os.path.dirname(os.path.abspath(__file__))+'/';S=D+'game/src/'
rd=lambda p:open(p,encoding='utf8').read()
t=rd(S+'template.html')
parts={'/*__STYLE__*/':rd(S+'style.css'),'/*__DATA__*/':'const KBO_BASE='+rd(S+'gamedata.json')+';','/*__LOGOS__*/':'const KBO_LOGOS='+rd(S+'logos.json')+';','/*__ENGINE__*/':rd(D+'web/src/engine.js'),'/*__LEAGUE__*/':rd(S+'league.js'),'/*__OFFSEASON__*/':'\n'.join(rd(S+f+'.js') for f in ['off_common','off_growth','off_rookies','off_contract','off_draft','off_fa','off_rules','off_events','off_goals','off_advance','off_rival','off_season','off_finance','off_injury','off_salary','club_history','arcs','legends','ceremony']),'/*__NEGOTIATE__*/':rd(S+'negotiate.js'),'/*__WORLD__*/':rd(S+'world.js'),'/*__TRAINING__*/':rd(S+'training.js'),'/*__SCOUT__*/':rd(S+'scout.js'),'/*__INVEST__*/':rd(S+'invest.js'),'/*__APP__*/':rd(S+'app.js')}
for k,v in parts.items():
    assert k in t,k
    t=t.replace(k,v)
shell=('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>\n</head>\n<body>\n')
open(D+'game/index.html','w',encoding='utf8').write(shell+t+'\n</body>\n</html>\n')
open(D+'game/artifact.html','w',encoding='utf8').write(t)
print('game/index.html',os.path.getsize(D+'game/index.html')//1024,'KB')
