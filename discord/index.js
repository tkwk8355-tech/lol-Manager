require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { handleTicket } = require('./tickets');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.once('clientReady', () => {
  console.log(`✅ ${client.user.tag} 봇 온라인!`);
});

client.on('interactionCreate', async interaction => {
  await handleTicket(interaction);
});

client.login(process.env.TOKEN);

const express = require('express');
const app = express();
app.use(express.json());

const LINE_KO = { TOP: '탑', JG: '정글', MID: '미드', ADC: '원딜', SUP: '서폿' };
const LINE_ORDER = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

app.post('/send-team', async (req, res) => {
  try {
    const { team1, team2, sum1, sum2, diff } = req.body;
    const channel = await client.channels.fetch(process.env.TEAM_CHANNEL_ID);

    const formatTeam = (team) =>
      LINE_ORDER.map(line => {
        const p = team.find(x => x.line === line);
        return p ? `${LINE_KO[line] ?? line}: **${p.name}**` : null;
      }).filter(Boolean).join('\n');

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('⚔️ 내전 팀 생성 결과')
      .addFields(
        { name: `🔵 블루팀 (${sum1}점)`, value: formatTeam(team1), inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: `🔴 레드팀 (${sum2}점)`, value: formatTeam(team2), inline: true },
      )
      .setFooter({ text: `점수 차이: ${diff}` })
      .setColor(0x5383e8)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(8354, () => console.log('HTTP server listening on port 8354'));
