// bot.js
// 상시 실행되는 봇 본체입니다. 24시간 켜져 있어야 모든 기능이 정상 작동합니다.
// 실행: node bot.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN을 .env 파일에 먼저 설정해주세요.');
  process.exit(1);
}

// ── 공통 설정 (template.json에서 쓴 이름과 반드시 동일해야 합니다) ──────────
const VERIFIED_ROLE_NAME = '✅ 인증됨';
const VERIFY_CHANNEL_KEYWORD = '인증';
const ATTENDANCE_CHANNEL_KEYWORD = '출석체크';
const ROLE_PICKER_CHANNEL_KEYWORD = '역할-선택';
const WELCOME_CHANNEL_KEYWORD = '가입-인사';
const TICKET_CHANNEL_KEYWORD = '건의사항';
const TICKET_OPEN_BUTTON_ID = 'ticket_open';
const TICKET_CLOSE_BUTTON_ID = 'ticket_close';

// 이벤트(기브어웨이) 명령어를 사용할 수 있는 역할 (template.json의 역할 이름과 동일해야 함)
const EVENT_MANAGER_ROLE_NAMES = ['🛡️ 관리자', '👑 개못난이'];

function hasEventPermission(member) {
  return member.roles.cache.some((r) => EVENT_MANAGER_ROLE_NAMES.includes(r.name));
}

const VERIFY_BUTTON_ID = 'verify_click';
const ROLE_TOGGLE_PREFIX = 'role_toggle_';
const GIVEAWAY_BUTTON_PREFIX = 'giveaway_join_'; // + 메시지 ID
const GIVEAWAY_LIST_BUTTON_PREFIX = 'giveaway_list_'; // + 메시지 ID

// ── 파일 기반 저장소 (재시작해도 데이터 유지) ──────────────────────────────
const DATA_DIR = __dirname;
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
const GIVEAWAY_FILE = path.join(DATA_DIR, 'giveaways.json');
const SELF_ROLES_FILE = path.join(DATA_DIR, 'self-roles.json');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const selfRolesConfig = readJson(SELF_ROLES_FILE, []);

function todayKST() {
  return new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ── 1. 인증 기능 ──────────────────────────────────────────────────────────
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

async function handleVerifyClick(interaction) {
  const guild = interaction.guild;
  const role = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  if (!role) {
    return interaction.reply({
      content: `'${VERIFIED_ROLE_NAME}' 역할을 찾을 수 없어요. setup-server.js를 먼저 실행했는지 확인해주세요.`,
      ephemeral: true,
    });
  }
  if (interaction.member.roles.cache.has(role.id)) {
    return interaction.reply({ content: '이미 인증되어 있어요!', ephemeral: true });
  }
  try {
    await interaction.member.roles.add(role);
    await interaction.reply({ content: '인증 완료! 이제 서버를 자유롭게 둘러보세요 🎉', ephemeral: true });
  } catch (err) {
    console.error('역할 부여 실패:', err);
    await interaction.reply({ content: '역할 부여 중 문제가 발생했어요. 봇 권한을 확인해주세요.', ephemeral: true });
  }
}

// ── 2. 출석체크 & 랭킹 기능 (슬래시 명령어 기반) ─────────────────────────
async function handleAttendanceCommand(interaction) {
  const data = readJson(ATTENDANCE_FILE, {});
  const key = `${interaction.guildId}_${interaction.user.id}`;
  const today = todayKST();
  const existing = data[key] || {};
  const record = {
    lastDate: existing.lastDate || null,
    streak: Number.isFinite(existing.streak) ? existing.streak : 0,
    total: Number.isFinite(existing.total) ? existing.total : 0,
  };

  if (record.lastDate === today) {
    return interaction.reply({
      content: `오늘은 이미 출석했어요! (연속 ${record.streak}일째, 누적 ${record.total}회)`,
      ephemeral: true,
    });
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
  });
  record.streak = record.lastDate === yesterday ? record.streak + 1 : 1;
  record.total += 1;
  record.lastDate = today;
  data[key] = record;
  writeJson(ATTENDANCE_FILE, data);

  await interaction.reply({
    content: `📅 출석 완료! 연속 ${record.streak}일째 · 누적 ${record.total}회`,
    ephemeral: false,
  });
}

async function handleRankingCommand(interaction) {
  const data = readJson(ATTENDANCE_FILE, {});
  const prefix = `${interaction.guildId}_`;

  const entries = Object.entries(data)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, record]) => ({
      userId: key.slice(prefix.length),
      total: Number.isFinite(record.total) ? record.total : 0,
      streak: Number.isFinite(record.streak) ? record.streak : 0,
    }))
    .sort((a, b) => b.total - a.total || b.streak - a.streak)
    .slice(0, 10);

  if (entries.length === 0) {
    return interaction.reply({ content: '아직 출석 기록이 없어요. `/출석체크`로 첫 기록을 남겨보세요!', ephemeral: true });
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = entries.map((e, i) => {
    const rank = medals[i] || `${i + 1}.`;
    return `${rank} <@${e.userId}> — 누적 ${e.total}회 (연속 ${e.streak}일)`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 출석 랭킹 Top 10')
    .setDescription(lines.join('\n'))
    .setColor(0xf1c40f);

  await interaction.reply({ embeds: [embed] });
}

// ── 3. 역할 선택 기능 ─────────────────────────────────────────────────────
async function ensureSelfRolesExist(guild) {
  for (const entry of selfRolesConfig) {
    const existing = guild.roles.cache.find((r) => r.name === entry.roleName);
    if (!existing) {
      await guild.roles.create({
        name: entry.roleName,
        color: entry.color,
        mentionable: true,
      });
      console.log(`자율 역할 생성: ${entry.roleName}`);
    }
  }
}

async function ensureRolePickerMessage(guild) {
  const channels = await guild.channels.fetch();
  const channel = channels.find(
    (c) => c && c.type === ChannelType.GuildText && c.name.includes(ROLE_PICKER_CHANNEL_KEYWORD)
  );
  if (!channel) {
    console.log(`⚠️ ${guild.name}: "${ROLE_PICKER_CHANNEL_KEYWORD}" 채널을 찾지 못했어요.`);
    return;
  }

  const recent = await channel.messages.fetch({ limit: 20 });
  const existing = recent.find(
    (m) =>
      m.author.id === client.user.id &&
      m.components.length > 0 &&
      m.components[0].components.some((c) => c.customId && c.customId.startsWith(ROLE_TOGGLE_PREFIX))
  );

  const payload = buildRolePickerMessage();

  if (existing) {
    await existing.edit(payload);
    console.log(`${guild.name}: 역할 선택 메시지를 최신 설정으로 갱신 완료`);
  } else {
    await channel.send(payload);
    console.log(`${guild.name}: #${channel.name} 에 역할 선택 메시지 게시 완료`);
  }
}

function buildRolePickerMessage() {
  const embed = new EmbedBuilder()
    .setTitle('🎭 역할 선택')
    .setDescription('버튼을 누르면 그 역할이 켜지고, 다시 누르면 꺼져요. (각자 독립적으로 작동해요)')
    .setColor(0x9b59b6)
    .addFields(
      selfRolesConfig.map((entry) => ({
        name: entry.label,
        value: entry.description || '설명 없음',
        inline: true,
      }))
    );

  const rows = [];
  let currentRow = new ActionRowBuilder();

  selfRolesConfig.forEach((entry, index) => {
    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ROLE_TOGGLE_PREFIX}${index}`)
        .setLabel(entry.label)
        .setStyle(ButtonStyle.Secondary)
    );
  });
  if (currentRow.components.length > 0) rows.push(currentRow);

  return { embeds: [embed], components: rows };
}

async function handleRoleToggle(interaction, index) {
  const entry = selfRolesConfig[index];
  if (!entry) {
    return interaction.reply({ content: '이 버튼에 연결된 역할 설정을 찾을 수 없어요.', ephemeral: true });
  }

  const guild = interaction.guild;
  const role = guild.roles.cache.find((r) => r.name === entry.roleName);
  if (!role) {
    return interaction.reply({
      content: `'${entry.roleName}' 역할을 서버에서 찾을 수 없어요.`,
      ephemeral: true,
    });
  }

  const member = interaction.member;
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role);
    await interaction.reply({ content: `${entry.label} 역할을 제거했어요.`, ephemeral: true });
  } else {
    await member.roles.add(role);
    await interaction.reply({ content: `${entry.label} 역할을 추가했어요.`, ephemeral: true });
  }
}

async function ensureAttendanceInfoMessage(guild) {
  const channels = await guild.channels.fetch();
  const channel = channels.find(
    (c) => c && c.type === ChannelType.GuildText && c.name.includes(ATTENDANCE_CHANNEL_KEYWORD)
  );
  if (!channel) {
    console.log(`⚠️ ${guild.name}: "${ATTENDANCE_CHANNEL_KEYWORD}" 채널을 찾지 못했어요.`);
    return;
  }
  const recent = await channel.messages.fetch({ limit: 20 });
  const alreadyPosted = recent.some(
    (m) => m.author.id === client.user.id && m.embeds[0]?.title === '📅 출석체크 안내'
  );
  if (alreadyPosted) {
    console.log(`${guild.name}: 출석체크 안내 메시지가 이미 있어서 건너뜀`);
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('📅 출석체크 안내')
    .setDescription('`/출석체크` 명령어로 하루 한 번 출석할 수 있어요.\n`/랭킹` 명령어로 누적 출석 순위를 볼 수 있어요!')
    .setColor(0xf1c40f);
  await channel.send({ embeds: [embed] });
  console.log(`${guild.name}: #${channel.name} 에 출석체크 안내 게시 완료`);
}

// ── 4. 이벤트(기브어웨이) 기능 ────────────────────────────────────────────
function buildGiveawayButtons(messageId, ended) {
  const joinButton = new ButtonBuilder()
    .setCustomId(`${GIVEAWAY_BUTTON_PREFIX}${messageId}`)
    .setLabel('참여하기')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🎉')
    .setDisabled(ended);

  const listButton = new ButtonBuilder()
    .setCustomId(`${GIVEAWAY_LIST_BUTTON_PREFIX}${messageId}`)
    .setLabel('참여자 목록')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📋');

  return new ActionRowBuilder().addComponents(joinButton, listButton);
}

function buildGiveawayMessage({ prize, winnerCount, endTime, participantCount, ended, messageId }) {
  const embed = new EmbedBuilder()
    .setTitle(ended ? '🎉 이벤트 종료' : '🎉 이벤트 참여')
    .setDescription(
      `**상품:** ${prize}\n**당첨자 수:** ${winnerCount}명\n**참여자 수:** ${participantCount}명\n` +
        (ended
          ? '이벤트가 종료되었어요.'
          : `<t:${Math.floor(endTime / 1000)}:R> 에 마감돼요. 아래 버튼을 눌러 참여하세요!`)
    )
    .setColor(ended ? 0x99aab5 : 0xe91e63);

  return {
    embeds: [embed],
    components: [buildGiveawayButtons(messageId || 'placeholder', ended)],
  };
}

async function startGiveaway(interaction) {
  if (!hasEventPermission(interaction.member)) {
    return interaction.reply({
      content: `이벤트는 ${EVENT_MANAGER_ROLE_NAMES.join(' 또는 ')} 역할이 있어야 시작할 수 있어요.`,
      ephemeral: true,
    });
  }

  const prize = interaction.options.getString('상품');
  const minutes = interaction.options.getInteger('시간');
  const winnerCount = interaction.options.getInteger('당첨자수') || 1;
  const endTime = Date.now() + minutes * 60 * 1000;

  const payload = buildGiveawayMessage({ prize, winnerCount, endTime, participantCount: 0, ended: false });
  await interaction.reply({ content: '이벤트를 시작할게요!', ephemeral: true });
  const message = await interaction.channel.send(payload);

  // 버튼 customId에 실제 메시지 ID를 넣어서 재생성
  await message.edit({ components: [buildGiveawayButtons(message.id, false)] });

  const giveaways = readJson(GIVEAWAY_FILE, {});
  giveaways[message.id] = {
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    prize,
    winnerCount,
    endTime,
    participants: [],
    ended: false,
  };
  writeJson(GIVEAWAY_FILE, giveaways);
}

async function handleGiveawayJoin(interaction, messageId) {
  const giveaways = readJson(GIVEAWAY_FILE, {});
  const giveaway = giveaways[messageId];
  if (!giveaway || giveaway.ended) {
    return interaction.reply({ content: '이미 종료된 이벤트예요.', ephemeral: true });
  }
  if (giveaway.participants.includes(interaction.user.id)) {
    return interaction.reply({ content: '이미 참여했어요!', ephemeral: true });
  }
  giveaway.participants.push(interaction.user.id);
  writeJson(GIVEAWAY_FILE, giveaways);

  await interaction.reply({ content: '참여 완료! 결과를 기다려주세요 🎉', ephemeral: true });

  // 참여자 수 갱신을 위해 원본 메시지 임베드 업데이트
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);
    const payload = buildGiveawayMessage({
      prize: giveaway.prize,
      winnerCount: giveaway.winnerCount,
      endTime: giveaway.endTime,
      participantCount: giveaway.participants.length,
      ended: false,
      messageId,
    });
    await message.edit({ embeds: payload.embeds });
  } catch (err) {
    console.error('이벤트 메시지 갱신 실패:', err);
  }
}

async function handleGiveawayList(interaction, messageId) {
  const giveaways = readJson(GIVEAWAY_FILE, {});
  const giveaway = giveaways[messageId];
  if (!giveaway) {
    return interaction.reply({ content: '이벤트 정보를 찾을 수 없어요.', ephemeral: true });
  }
  if (giveaway.participants.length === 0) {
    return interaction.reply({ content: '아직 참여자가 없어요.', ephemeral: true });
  }

  const MAX_SHOWN = 50;
  const shown = giveaway.participants.slice(0, MAX_SHOWN);
  let description = shown.map((id, i) => `${i + 1}. <@${id}>`).join('\n');
  if (giveaway.participants.length > MAX_SHOWN) {
    description += `\n...외 ${giveaway.participants.length - MAX_SHOWN}명`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎉 참여자 목록 (${giveaway.participants.length}명)`)
    .setDescription(description)
    .setColor(0xe91e63);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function finishGiveaway(messageId, winnerCountOverride) {
  const giveaways = readJson(GIVEAWAY_FILE, {});
  const giveaway = giveaways[messageId];
  if (!giveaway || giveaway.ended) return;

  if (Number.isInteger(winnerCountOverride) && winnerCountOverride > 0) {
    giveaway.winnerCount = winnerCountOverride;
  }
  giveaway.ended = true;
  writeJson(GIVEAWAY_FILE, giveaways);

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);

    const payload = buildGiveawayMessage({
      prize: giveaway.prize,
      winnerCount: giveaway.winnerCount,
      endTime: giveaway.endTime,
      participantCount: giveaway.participants.length,
      ended: true,
      messageId,
    });
    await message.edit(payload);

    const shuffled = [...giveaway.participants].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, giveaway.winnerCount);

    if (winners.length === 0) {
      await channel.send(`🎉 **${giveaway.prize}** 이벤트가 종료됐지만, 참여자가 없어서 당첨자가 없어요.`);
    } else {
      const mentions = winners.map((id) => `<@${id}>`).join(', ');
      await channel.send(`🎉 축하합니다! ${mentions} 님이 **${giveaway.prize}**에 당첨되셨어요!`);
    }
  } catch (err) {
    console.error('이벤트 종료 처리 실패:', err);
  }
}

// 주기적으로 마감 시간이 지난 이벤트를 확인해서 자동 종료
setInterval(() => {
  const giveaways = readJson(GIVEAWAY_FILE, {});
  const now = Date.now();
  for (const [messageId, g] of Object.entries(giveaways)) {
    if (!g.ended && g.endTime <= now) {
      finishGiveaway(messageId);
    }
  }
}, 15 * 1000);

// ── 5. 청소(메시지 일괄 삭제) 기능 ────────────────────────────────────────
async function handlePurge(interaction) {
  const amount = interaction.options.getInteger('개수');
  const targetUser = interaction.options.getUser('대상유저');

  await interaction.deferReply({ ephemeral: true });

  const fetched = await interaction.channel.messages.fetch({ limit: 100 });
  let candidates = [...fetched.values()];
  if (targetUser) {
    candidates = candidates.filter((m) => m.author.id === targetUser.id);
  }
  candidates = candidates.slice(0, amount);

  if (candidates.length === 0) {
    return interaction.editReply('삭제할 메시지가 없어요.');
  }

  try {
    // 두 번째 인자 true: 14일이 지난 메시지는 자동으로 건너뜀 (디스코드 API 제한)
    const deleted = await interaction.channel.bulkDelete(candidates, true);
    await interaction.editReply(`🧹 메시지 ${deleted.size}개를 삭제했어요.`);
  } catch (err) {
    console.error('메시지 삭제 실패:', err);
    await interaction.editReply('메시지 삭제 중 오류가 발생했어요. (14일 지난 메시지는 삭제할 수 없어요)');
  }
}

// ── 6. 건의사항 티켓 기능 ─────────────────────────────────────────────────
function buildTicketBoardMessage() {
  const embed = new EmbedBuilder()
    .setTitle('📩 건의사항 접수')
    .setDescription('아래 버튼을 누르면 나만 볼 수 있는 비공개 채널이 열려요. 거기에 건의사항을 자유롭게 작성해주세요!')
    .setColor(0x3498db);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_OPEN_BUTTON_ID)
      .setLabel('티켓 열기')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📩')
  );
  return { embeds: [embed], components: [row] };
}

async function handleTicketOpen(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;

  const channels = await guild.channels.fetch();

  // 이미 열려있는 티켓이 있으면 새로 안 만들고 안내
  const existing = channels.find(
    (c) => c && c.type === ChannelType.GuildText && c.topic === `ticket-owner:${member.id}`
  );
  if (existing) {
    return interaction.reply({ content: `이미 열려있는 티켓이 있어요: ${existing}`, ephemeral: true });
  }

  const suggestionChannel = channels.find(
    (c) => c && c.type === ChannelType.GuildText && c.name.includes(TICKET_CHANNEL_KEYWORD)
  );

  const safeName =
    `건의-${member.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣-]/g, '')
      .slice(0, 90) || `건의-${member.id}`;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];
  for (const roleName of EVENT_MANAGER_ROLE_NAMES) {
    const role = guild.roles.cache.find((r) => r.name === roleName);
    if (role) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      });
    }
  }

  const ticketChannel = await guild.channels.create({
    name: safeName,
    type: ChannelType.GuildText,
    parent: suggestionChannel ? suggestionChannel.parentId : undefined,
    topic: `ticket-owner:${member.id}`,
    permissionOverwrites: overwrites,
  });

  const embed = new EmbedBuilder()
    .setTitle('📩 건의사항 티켓')
    .setDescription(
      `${member} 님, 여기에 건의하고 싶은 내용을 자유롭게 작성해주세요.\n다 작성하셨으면 아래 버튼으로 티켓을 닫을 수 있어요.`
    )
    .setColor(0x3498db);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_BUTTON_ID)
      .setLabel('티켓 닫기')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );
  await ticketChannel.send({ content: `${member}`, embeds: [embed], components: [row] });

  await interaction.reply({ content: `티켓을 열었어요: ${ticketChannel}`, ephemeral: true });
}

async function handleTicketClose(interaction) {
  const channel = interaction.channel;
  const topic = channel.topic || '';
  const ownerId = topic.startsWith('ticket-owner:') ? topic.slice('ticket-owner:'.length) : null;

  const isOwner = ownerId === interaction.user.id;
  const isStaff = hasEventPermission(interaction.member);

  if (!isOwner && !isStaff) {
    return interaction.reply({ content: '티켓을 닫을 권한이 없어요.', ephemeral: true });
  }

  await interaction.reply('🔒 5초 후 이 티켓을 닫을게요...');
  setTimeout(() => {
    channel.delete('티켓 종료').catch((err) => console.error('티켓 삭제 실패:', err));
  }, 5000);
}

// ── 채널 자동 세팅 (봇이 켜질 때 한 번) ─────────────────────────────────────
async function ensureButtonMessage(guild, keyword, checkComponentId, buildMessage) {
  const channels = await guild.channels.fetch();
  const channel = channels.find(
    (c) => c && c.type === ChannelType.GuildText && c.name.includes(keyword)
  );
  if (!channel) {
    console.log(`⚠️ ${guild.name}: "${keyword}" 채널을 찾지 못했어요.`);
    return;
  }
  const recent = await channel.messages.fetch({ limit: 20 });
  const alreadyPosted = recent.some(
    (m) =>
      m.author.id === client.user.id &&
      m.components.length > 0 &&
      m.components[0].components.some((c) => c.customId && c.customId.startsWith(checkComponentId))
  );
  if (alreadyPosted) {
    console.log(`${guild.name}: "${keyword}" 메시지가 이미 있어서 건너뜀`);
    return;
  }
  await channel.send(buildMessage());
  console.log(`${guild.name}: #${channel.name} 에 메시지 게시 완료`);
}

const TEXT_PURGE_PREFIX = '?purge';

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.toLowerCase().startsWith(TEXT_PURGE_PREFIX)) return;

  const sendTemp = async (text) => {
    const notice = await message.channel.send(text);
    setTimeout(() => notice.delete().catch(() => {}), 5000);
  };

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return sendTemp('메시지 관리 권한이 있어야 이 명령어를 쓸 수 있어요.');
  }

  const args = message.content
    .slice(TEXT_PURGE_PREFIX.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const amount = parseInt(args[0], 10);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return sendTemp('사용법: `?purge 개수` (1~100). 예: `?purge 20` / 특정 유저만 지우려면 `?purge 20 @유저`');
  }

  const targetUser = message.mentions.users.first();

  try {
    const fetched = await message.channel.messages.fetch({ limit: 100 });
    let candidates = [...fetched.values()];
    if (targetUser) {
      candidates = candidates.filter((m) => m.author.id === targetUser.id);
    }
    // amount + 1: 명령어로 친 "?purge ..." 메시지 자신도 함께 삭제
    candidates = candidates.slice(0, amount + 1);

    const deleted = await message.channel.bulkDelete(candidates, true);
    const deletedCount = Math.max(deleted.size - 1, 0); // 명령어 메시지 자신은 개수에서 제외하고 안내
    await sendTemp(`🧹 메시지 ${deletedCount}개를 삭제했어요.`);
  } catch (err) {
    console.error('텍스트 청소 실패:', err);
    await sendTemp('메시지 삭제 중 오류가 발생했어요. (14일 지난 메시지는 삭제할 수 없어요)');
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    const channels = await member.guild.channels.fetch();
    const channel = channels.find(
      (c) => c && c.type === ChannelType.GuildText && c.name.includes(WELCOME_CHANNEL_KEYWORD)
    );
    if (!channel) {
      console.log(`⚠️ ${member.guild.name}: "${WELCOME_CHANNEL_KEYWORD}" 채널을 찾지 못했어요.`);
      return;
    }
    await channel.send(
      `🎉 ${member}님, 못난이수용소에 오신 것을 환영합니다! 인증 채널에서 인증부터 해주시면 서버를 자유롭게 이용하실 수 있어요.`
    );
  } catch (err) {
    console.error('가입 인사 메시지 전송 실패:', err);
  }
});

client.once('ready', async () => {
  console.log(`봇 로그인 완료: ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await ensureSelfRolesExist(guild);
    await ensureButtonMessage(guild, VERIFY_CHANNEL_KEYWORD, VERIFY_BUTTON_ID, buildVerifyMessage);
    await ensureButtonMessage(guild, TICKET_CHANNEL_KEYWORD, TICKET_OPEN_BUTTON_ID, buildTicketBoardMessage);
    await ensureAttendanceInfoMessage(guild);
    await ensureRolePickerMessage(guild);
  }

  console.log('상시 대기 중... (이 창을 닫으면 봇이 꺼집니다)');
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === '이벤트시작') {
      return startGiveaway(interaction);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === '이벤트종료') {
      if (!hasEventPermission(interaction.member)) {
        return interaction.reply({
          content: `이벤트는 ${EVENT_MANAGER_ROLE_NAMES.join(' 또는 ')} 역할이 있어야 종료할 수 있어요.`,
          ephemeral: true,
        });
      }
      const messageId = interaction.options.getString('메시지id');
      const winnerCountOverride = interaction.options.getInteger('당첨자수');
      await interaction.reply({ content: '이벤트를 종료할게요.', ephemeral: true });
      return finishGiveaway(messageId, winnerCountOverride);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === '청소') {
      return handlePurge(interaction);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === '출석체크') {
      return handleAttendanceCommand(interaction);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === '랭킹') {
      return handleRankingCommand(interaction);
    }
    if (interaction.isButton() && interaction.customId === TICKET_OPEN_BUTTON_ID) {
      return handleTicketOpen(interaction);
    }
    if (interaction.isButton() && interaction.customId === TICKET_CLOSE_BUTTON_ID) {
      return handleTicketClose(interaction);
    }
    if (interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID) {
      return handleVerifyClick(interaction);
    }
    if (interaction.isButton() && interaction.customId.startsWith(GIVEAWAY_LIST_BUTTON_PREFIX)) {
      const messageId = interaction.customId.slice(GIVEAWAY_LIST_BUTTON_PREFIX.length);
      return handleGiveawayList(interaction, messageId);
    }
    if (interaction.isButton() && interaction.customId.startsWith(GIVEAWAY_BUTTON_PREFIX)) {
      const messageId = interaction.customId.slice(GIVEAWAY_BUTTON_PREFIX.length);
      return handleGiveawayJoin(interaction, messageId);
    }
    if (interaction.isButton() && interaction.customId.startsWith(ROLE_TOGGLE_PREFIX)) {
      const index = parseInt(interaction.customId.slice(ROLE_TOGGLE_PREFIX.length), 10);
      return handleRoleToggle(interaction, index);
    }
  } catch (err) {
    console.error('interaction 처리 중 오류:', err);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: '처리 중 오류가 발생했어요.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);