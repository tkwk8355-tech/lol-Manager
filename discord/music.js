const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const ffmpegPath = require('ffmpeg-static');

// distube v5: ffmpeg 경로를 환경변수로 지정
process.env.FFMPEG_PATH = ffmpegPath;
// PATH에도 ffmpeg 디렉토리 추가 (일부 환경에서 필요)
const path = require('path');
process.env.PATH = path.dirname(ffmpegPath) + path.delimiter + (process.env.PATH || '');

let distube = null;

function initDistube(client) {
  const path = require('path');
  const fs = require('fs');
  const cookiePath = path.resolve(__dirname, 'cookies.txt');
  const cookieExists = fs.existsSync(cookiePath) && fs.statSync(cookiePath).size > 100;

  distube = new DisTube(client, {
    plugins: [new YtDlpPlugin({
      update: false,
      ...(cookieExists ? { ytdlpOptions: { cookies: cookiePath } } : {}),
    })],
    emitNewSongOnly: true,
  });

  if (cookieExists) {
    console.log('[music] 쿠키 파일 적용됨:', cookiePath);
  } else {
    console.warn('[music] ⚠️ 쿠키 파일 없음 - YouTube 차단 시 오류 발생 가능');
  }

  distube.on('playSong', (queue, song) => {
    queue.textChannel?.send({ embeds: [trackEmbed('▶️ 재생 시작', song)] });
  });
  distube.on('addSong', (queue, song) => {
    queue.textChannel?.send({ embeds: [trackEmbed('📋 큐에 추가됨', song)] });
  });
  distube.on('error', (e, queue) => {
    console.error('[distube error]', e.message);
    queue?.textChannel?.send(`❌ 오류: \`${e.message}\``);
  });
  distube.on('finish', (queue) => {
    queue.textChannel?.send('✅ 큐가 끝났습니다.');
  });
}

async function searchWithYoutube(query) {
  const key = process.env.YOUTUBE_API_KEY;
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=3&key=${key}`;
  const searchRes = await fetch(searchUrl).then(r => r.json());
  const ids = searchRes.items.map(i => i.id.videoId).join(',');
  const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids}&key=${key}`;
  const videoRes = await fetch(videoUrl).then(r => r.json());
  return videoRes.items.map(item => ({
    title: item.snippet.title,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    durationRaw: parseDuration(item.contentDetails.duration),
    thumbnails: [{ url: item.snippet.thumbnails?.default?.url }]
  }));
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '??:??';
  const h = parseInt(m[1] ?? 0), min = parseInt(m[2] ?? 0), sec = parseInt(m[3] ?? 0);
  if (h > 0) return `${h}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${min}:${String(sec).padStart(2,'0')}`;
}

function trackEmbed(label, song) {
  return new EmbedBuilder()
    .setTitle(label)
    .setDescription(`**${song.name}** \`${song.formattedDuration}\``)
    .setThumbnail(song.thumbnail ?? null)
    .setColor(0x5383e8);
}

async function handlePlay(interaction) {
  const query = interaction.options.getString('검색어');
  const voiceChannel = interaction.member.voice?.channel;
  if (!voiceChannel) return interaction.reply({ content: '❌ 먼저 음성 채널에 입장해주세요.', flags: 64 });
  await interaction.deferReply();

  if (query.startsWith('http')) {
    try {
      await distube.play(voiceChannel, query, { textChannel: interaction.channel, member: interaction.member });
      return interaction.editReply('✅ 재생 준비 중...');
    } catch (e) {
      return interaction.editReply(`❌ URL 오류: \`${e.message}\``);
    }
  }

  let results;
  try {
    results = await searchWithYoutube(query);
  } catch (e) {
    console.error('[music] search error:', e);
    return interaction.editReply(`❌ 검색 오류: \`${e.message}\``);
  }
  if (!results || results.length === 0) return interaction.editReply('❌ 검색 결과가 없습니다.');

  const EMOJIS = ['1️⃣', '2️⃣', '3️⃣'];
  const embed = new EmbedBuilder()
    .setTitle('🔍 검색 결과')
    .setDescription(results.map((v, i) => `${EMOJIS[i]} **${v.title}**\n　⏱ \`${v.durationRaw}\`  🔗 [YouTube](${v.url})`).join('\n\n'))
    .setColor(0x5383e8);

  const row = new ActionRowBuilder().addComponents(
    ...results.map((_, i) => new ButtonBuilder().setCustomId(`music_select_${i}_${interaction.id}`).setEmoji(EMOJIS[i]).setLabel(['첫 번째', '두 번째', '세 번째'][i]).setStyle(ButtonStyle.Secondary)),
    new ButtonBuilder().setCustomId(`music_cancel_${interaction.id}`).setEmoji('❌').setLabel('취소').setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({ time: 30000 });

  collector.on('collect', async (btn) => {
    if (btn.user.id !== interaction.user.id) return btn.reply({ content: '명령어를 입력한 사람만 선택할 수 있습니다.', flags: 64 });
    collector.stop();
    if (btn.customId === `music_cancel_${interaction.id}`) return btn.update({ content: '취소되었습니다.', embeds: [], components: [] });
    const idx = parseInt(btn.customId.split('_')[2]);
    const v = results[idx];
    await btn.update({ content: `✅ **${v.title}** 재생 준비 중...`, embeds: [], components: [] });
    try {
      await distube.play(voiceChannel, v.url, { textChannel: interaction.channel, member: interaction.member });
    } catch (e) {
      interaction.followUp(`❌ 재생 오류: \`${e.message}\``);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') interaction.editReply({ content: '⏱️ 시간 초과로 취소되었습니다.', embeds: [], components: [] });
  });
}

async function handleSkip(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply('❌ 현재 재생 중인 곳이 없습니다.');
  try {
    await queue.skip();
    interaction.reply('⏭️ 스킵했습니다.');
  } catch (e) {
    interaction.reply('❌ 다음 곡이 없습니다.');
  }
}

async function handleStop(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply('❌ 재생 중이 아닙니다.');
  await queue.stop();
  interaction.reply('⏹️ 정지하고 채널에서 나갔습니다.');
}

async function handleQueue(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue || queue.songs.length === 0) return interaction.reply('📋 큐가 비어있습니다.');
  const lines = queue.songs.map((s, i) =>
    i === 0 ? `▶️ **${s.name}** \`${s.formattedDuration}\`` : `${i}. ${s.name} \`${s.formattedDuration}\``
  );
  interaction.reply({ embeds: [new EmbedBuilder().setTitle('📋 재생 큐').setDescription(lines.join('\n')).setColor(0x5383e8)] });
}

module.exports = { initDistube, handlePlay, handleSkip, handleStop, handleQueue };
