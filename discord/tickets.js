const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const ADMIN_ROLE_ID2 = process.env.ADMIN_ROLE_ID2;

async function handleTicket(interaction) {
  // /티켓패널 명령어
  if (interaction.isChatInputCommand() && interaction.commandName === '티켓패널') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '관리자만 사용 가능합니다.', flags: 64 });
    }

    const embed = new EmbedBuilder()
      .setTitle('또간집')
      .setDescription('이벤트 신청서 열기')
      .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('이벤트 신청서 열기')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫')
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // 티켓 생성 버튼
  if (interaction.isButton() && interaction.customId === 'create_ticket') {
    const guild = interaction.guild;
    const member = interaction.member;

    const permissionOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ];

    const role1 = guild.roles.cache.get(ADMIN_ROLE_ID);
    const role2 = guild.roles.cache.get(ADMIN_ROLE_ID2);
    if (role1) permissionOverwrites.push({ id: role1.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    if (role2) permissionOverwrites.push({ id: role2.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

    const channel = await guild.channels.create({
      name: `내전_또간집_신청서`,
      type: ChannelType.GuildText,
      parent: '1535867748528431124',
      permissionOverwrites,
    });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('티켓 닫기')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒')
    );

    const ticketEmbed = new EmbedBuilder()
      .setTitle('또간집 신청서가 발급되었습니다')
      .setDescription(`${member.displayName}\n신청라인과 주챔 5개를 작성해주세요!\n작성은 1번만 가능하며, 추후 수정이 불가합니다.\n-☎️추가 문의: 롤또간집 운영진-`)
      .setColor(0x57F287);

    await channel.send({ embeds: [ticketEmbed], components: [closeRow] });
    return interaction.reply({ content: `티켓이 생성되었어요! ${channel}`, flags: 64 });
  }

  // 티켓 닫기 버튼
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const isAdmin = (ADMIN_ROLE_ID && interaction.member.roles.cache.has(ADMIN_ROLE_ID)) ||
                    (ADMIN_ROLE_ID2 && interaction.member.roles.cache.has(ADMIN_ROLE_ID2)) ||
                    interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isAdmin) {
      return interaction.reply({ content: '운영자만 티켓을 닫을 수 있습니다.', flags: 64 });
    }

    await interaction.reply({ content: '3초 후 채널이 삭제됩니다...' });
    setTimeout(() => interaction.channel.delete(), 3000);
  }
}

module.exports = { handleTicket };
