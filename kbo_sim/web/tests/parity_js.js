const ROOT=require('path').resolve(__dirname,'../..');
const fs=require('fs');const {createEngine}=require(ROOT+'/web/src/engine.js');
const DATA=JSON.parse(fs.readFileSync(ROOT+'/web/src/data.json','utf8'));
const mode=process.argv[2];const E=createEngine(DATA,mode);const out={};
for(const seed of [5000,5001,12345,7]){const s=new E.Season(seed);s.playAll();out[seed]={rec:s.rec,stats:s.stats,park:E.parkRuns()};}
fs.writeFileSync(process.argv[3],JSON.stringify(out));
