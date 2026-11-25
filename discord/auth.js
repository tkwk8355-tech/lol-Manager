const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TOKEN_PATH = path.join(__dirname, 'token.json');

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:3000/callback'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.readonly'],
  prompt: 'consent',
});

console.log('브라우저에서 아래 URL을 열어주세요:\n', authUrl);

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  if (pathname !== '/callback') return;
  const { tokens } = await oauth2Client.getToken(query.code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  res.end('인증 완료! 이 창을 닫아도 됩니다.');
  console.log('token.json 저장 완료!');
  server.close();
}).listen(3000);
