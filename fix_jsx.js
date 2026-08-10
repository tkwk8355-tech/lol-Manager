const fs = require('fs');
const lines = fs.readFileSync('app/userInfo/page.tsx', 'utf8').split('\n');
lines[592] = '  const MODE_KO: Record<string,string> = { aram:"\uce7c\ubc14\ub78c", normal:"\uc77c\ubc18\ud611\uace1", flex:"\uc790\uc720\ub799\ud06c", solo:"\uc194\ub85c\ub799\ud06c", scrim:"\ub0b4\uc804" };\r';
fs.writeFileSync('app/userInfo/page.tsx', lines.join('\n'), 'utf8');
process.stderr.write('done\n');
