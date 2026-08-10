const fs = require('fs');
const l = fs.readFileSync('app/userInfo/page.tsx', 'utf8').split('\n');
for (let i = 711; i < 721; i++) {
  process.stderr.write((i+1) + ': ' + l[i].trim() + '\n');
}
