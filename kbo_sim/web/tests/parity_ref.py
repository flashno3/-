import sys,json,os
ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'));sys.path.insert(0,ROOT);os.chdir(ROOT)
import engine2 as e
out={}
for seed in [5000,5001,12345,7]:
    rec,st=e.season(seed);out[str(seed)]={'rec':rec,'stats':dict(st),'park':{k:v for k,v in e.PARKR.items()}}
    e.PARKR.clear()
json.dump(out,open(sys.argv[1],'w'))
