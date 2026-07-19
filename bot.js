// bot.js
// 상시 실행되는 봇 본체입니다. 24시간 켜져 있어야 인증 버튼이 정상 작동합니다.
// 봇이 켜지면 "인증" 채널을 자동으로 찾아서 인증 버튼 메시지를 스스로 게시합니다.
// (이미 게시되어 있으면 중복으로 또 올리지 않습니다)
// 실행: node bot.js

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.error('BOT_TOKEN을 .env 파일에 먼저 설정해주세요.');
  process.exit(1);
}

// template.json에서 쓴 이름과 반드시 동일해야 합니다.
const VERIFIED_ROLE_NAME = '✅ 인증됨';
const VERIFY_CHANNEL_KEYWORD = '인증'; // 채널 이름에 이 단어가 들어있으면 인증 채널로 인식
const VERIFY_BUTTON_ID = 'verify_click';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

function buildVerifyMessage() {
  const embed = new EmbedBuilder()
    .setTitle('✅ 서버 인증')
    .setDescription('아래 버튼을 눌러 인증을 완료하면 서버의 모든 채널을 볼 수 있어요!')
    .setColor(0x57f287);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_BUTTON_ID)
      .setLabel('인증하기')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );

  return { embeds: [embed], components: [row] };
}

async function ensureVerifyMessage(guild) {
  // 이름에 "인증"이 들어간 일반 텍스트 채널을 찾음 (카테고리 제외)
  const channels = await guild.channels.fetch();
  const verifyChannel = channels.find(
    (c) =>
      c &&
      c.type === ChannelType.GuildText &&
      c.name.includes(VERIFY_CHANNEL_KEYWORD)
  );

  if (!verifyChannel) {
    console.log(`⚠️ ${guild.name}: "${VERIFY_CHANNEL_KEYWORD}" 채널을 찾지 못했어요.`);
    return;
  }

  // 이미 봇이 인증 버튼 메시지를 올려놨는지 확인 (중복 게시 방지)
  const recentMessages = await verifyChannel.messages.fetch({ limit: 20 });
  const alreadyPosted = recentMessages.some(
    (m) =>
      m.author.id === client.user.id &&
      m.components.length > 0 &&
      m.components[0].components.some((c) => c.customId === VERIFY_BUTTON_ID)
  );

  if (alreadyPosted) {
    console.log(`${guild.name}: 인증 메시지가 이미 있어서 건너뜀`);
    return;
  }

  await verifyChannel.send(buildVerifyMessage());
  console.log(`${guild.name}: #${verifyChannel.name} 에 인증 메시지 게시 완료`);
}

client.once('ready', async () => {
  console.log(`봇 로그인 완료: ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await ensureVerifyMessage(guild);
  }

  console.log('상시 대기 중... (이 창을 닫으면 봇이 꺼집니다)');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() || interaction.customId !== VERIFY_BUTTON_ID) return;

  const guild = interaction.guild;
  const role = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);

  if (!role) {
    await interaction.reply({
      content: `'${VERIFIED_ROLE_NAME}' 역할을 서버에서 찾을 수 없어요. setup-server.js를 먼저 실행했는지 확인해주세요.`,
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member;

  if (member.roles.cache.has(role.id)) {
    await interaction.reply({ content: '이미 인증되어 있어요!', ephemeral: true });
    return;
  }

  try {
    await member.roles.add(role);
    await interaction.reply({
      content: '인증 완료! 이제 서버를 자유롭게 둘러보세요 🎉',
      ephemeral: true,
    });
  } catch (err) {
    console.error('역할 부여 실패:', err);
    await interaction.reply({
      content: '역할 부여 중 문제가 발생했어요. 봇 권한(역할 관리)을 확인해주세요.',
      ephemeral: true,
    });
  }
});

client.login(TOKEN);
