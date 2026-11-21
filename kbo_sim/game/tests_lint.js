/* 소스 점검: 같은 줄에서 '//' 주석 뒤에 코드가 이어지면 그 코드는 실행되지 않는다(과거에 기준 관중 갱신·계약 정리가 이렇게 사라진 적이 있다) */
const fs=require('fs'),assert=require('assert');let n=0,bad=[];
for(const f of ['league.js','offseason.js','off_common.js','off_growth.js','off_rookies.js','off_contract.js','off_draft.js','off_fa.js','off_rules.js','off_events.js','off_goals.js','off_advance.js','off_rival.js','off_season.js','off_finance.js','off_injury.js','club_history.js','negotiate.js','world.js','training.js','scout.js','invest.js','app.js']){
 fs.readFileSync(__dirname+'/src/'+f,'utf8').split('\n').forEach((ln,i)=>{n++;let from=0;for(;;){const k=ln.indexOf('//',from);if(k<0)break;from=k+2;const pre=ln.slice(0,k);if((pre.split("'").length-1)%2||(pre.split('"').length-1)%2||(pre.split('`').length-1)%2)continue;if(/https?:$/.test(pre))continue;
  const post=ln.slice(k+2);if(/[;}]\s+(?:if|for|const|let|S|f|this|p|o|e|L)[\w.$\[\]]*\s*(=[^=]|\()/.test(post)||/\)\s*\{\s*[a-zA-Z_.]+\s*[=(]/.test(post)){bad.push(f+':'+(i+1)+' '+post.trim().slice(0,100));break}}})}
assert.strictEqual(bad.length,0,'주석 뒤에 코드가 있는 줄: '+bad.join(' | '));
console.log('lint tests ok '+n+'줄');
