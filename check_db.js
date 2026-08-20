const http = require('http');
function req(options, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: d}));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
async function main() {
  const login = await req(
    {host:'localhost',port:8355,path:'/api/auth/login',method:'POST',headers:{'Content-Type':'application/json'}},
    JSON.stringify({username:'cmjeon',password:'1234'})
  );
  const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
  console.log('login:', login.status, cookie);

  const party = await req(
    {host:'localhost',port:8355,path:'/api/party?mode=all',method:'GET',headers:{Cookie: cookie}}
  );
  console.log('party status:', party.status);
  const data = JSON.parse(party.body);
  (data.parties||[]).forEach(p => console.log(p.id, p.mode, 'startAt='+p.startAt, 'createdAt='+p.createdAt));
}
main().catch(e => console.error(e.message));
