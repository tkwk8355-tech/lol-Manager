require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('티켓패널')
    .setDescription('티켓 생성 버튼을 이 채널에 배치합니다.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('재생')
    .setDescription('유튜브에서 음악을 검색하거나 URL로 재생합니다.')
    .addStringOption(o => o.setName('검색어').setDescription('검색어 또는 유튜브 URL').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('스킵')
    .setDescription('현재 곡을 스킵합니다.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('정지')
    .setDescription('재생을 멈추고 채널에서 나갑니다.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('큐')
    .setDescription('현재 재생 큐를 확인합니다.')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  console.log('슬래시 명령어 등록 중...');
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ 명령어 등록 완료!');
})();
