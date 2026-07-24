// setup-server.js
// template.json의 역할/카테고리/채널을 지정한 서버에 실제로 생성하는 스크립트입니다.
// 실행: node setup-server.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error('BOT_TOKEN과 GUILD_ID를 .env 파일에 먼저 설정해주세요.');
  process.exit(1);
}

const template = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'template.json'), 'utf-8')
);

// template.json의 채널 type 문자열 -> discord.js ChannelType 매핑
const CHANNEL_TYPE_MAP = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
};

// template.json의 permissions 문자열 -> discord.js 권한 플래그 매핑
const PERMISSION_FLAG_MAP = {
  ADMINISTRATOR: PermissionsBitField.Flags.Administrator,
  MANAGE_GUILD: PermissionsBitField.Flags.ManageGuild,
  MANAGE_ROLES: PermissionsBitField.Flags.ManageRoles,
  MANAGE_CHANNELS: PermissionsBitField.Flags.ManageChannels,
  KICK_MEMBERS: PermissionsBitField.Flags.KickMembers,
  BAN_MEMBERS: PermissionsBitField.Flags.BanMembers,
  MANAGE_MESSAGES: PermissionsBitField.Flags.ManageMessages,
  VIEW_CHANNEL: PermissionsBitField.Flags.ViewChannel,
  SEND_MESSAGES: PermissionsBitField.Flags.SendMessages,
  CONNECT: PermissionsBitField.Flags.Connect,
  SPEAK: PermissionsBitField.Flags.Speak,
  ADD_REACTIONS: PermissionsBitField.Flags.AddReactions,
  EMBED_LINKS: PermissionsBitField.Flags.EmbedLinks,
  ATTACH_FILES: PermissionsBitField.Flags.AttachFiles,
  USE_EXTERNAL_EMOJIS: PermissionsBitField.Flags.UseExternalEmojis,
};

function toPermissionBits(permissionNames) {
  return permissionNames
    .map((name) => PERMISSION_FLAG_MAP[name])
    .filter(Boolean);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`로그인 완료: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`대상 서버: ${guild.name}`);

  // 1. 역할 생성 (JSON에 적힌 순서의 역순으로 만들어야 위쪽 역할이 실제로 더 높은 서열이 됩니다)
  const createdRoles = {}; // name -> Role 객체
  const rolesToCreate = [...template.roles].reverse();

  for (const roleData of rolesToCreate) {
    const existing = guild.roles.cache.find((r) => r.name === roleData.name);
    if (existing) {
      console.log(`이미 존재하는 역할, 건너뜀: ${roleData.name}`);
      createdRoles[roleData.name] = existing;
      continue;
    }

    const role = await guild.roles.create({
      name: roleData.name,
      color: roleData.color,
      hoist: roleData.hoist,
      mentionable: roleData.mentionable,
      permissions: toPermissionBits(roleData.permissions || []),
    });
    createdRoles[roleData.name] = role;
    console.log(`역할 생성: ${roleData.name}`);
  }

  // gate 종류별로 참조할 역할 이름 (template.json의 role 이름과 일치해야 함)
  const ROLE_OWNER = '👑 개못난이';
  const ROLE_ADMIN = '🛡️ 관리자';
  const ROLE_VERIFIED = '✅ 인증됨';

  // 2. gate 값에 따른 채널 권한 오버라이트 생성 함수
  function buildOverwrites(gate) {
    const everyoneId = guild.roles.everyone.id;

    if (gate === 'verify') {
      // 인증 전 채널: 누구나 볼 수 있지만 메시지는 못 보냄 (인증 버튼 등은 봇이 따로 처리)
      return [
        {
          id: everyoneId,
          allow: [PermissionsBitField.Flags.ViewChannel],
          deny: [PermissionsBitField.Flags.SendMessages],
        },
      ];
    }

    if (gate === 'staff') {
      // 관리 채널: 서버장/관리자만 볼 수 있음
      const overwrites = [
        { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
      ];
      if (createdRoles[ROLE_ADMIN]) {
        overwrites.push({
          id: createdRoles[ROLE_ADMIN].id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        });
      }
      if (createdRoles[ROLE_OWNER]) {
        overwrites.push({
          id: createdRoles[ROLE_OWNER].id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        });
      }
      return overwrites;
    }

    // gate === 'main': 인증된 사람만 볼 수 있음
    const overwrites = [
      { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
    ];
    if (createdRoles[ROLE_VERIFIED]) {
      overwrites.push({
        id: createdRoles[ROLE_VERIFIED].id,
        allow: [PermissionsBitField.Flags.ViewChannel],
      });
    }
    return overwrites;
  }

  // 3. 카테고리 + 채널 생성
  let systemChannelId = null;

  for (const categoryData of template.categories) {
    const category = await guild.channels.create({
      name: categoryData.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: buildOverwrites(categoryData.gate),
    });
    console.log(`카테고리 생성: ${categoryData.name}`);

    for (const channelData of categoryData.channels) {
      const channelType =
        CHANNEL_TYPE_MAP[channelData.type] ?? ChannelType.GuildText;

      const channel = await guild.channels.create({
        name: channelData.name,
        type: channelType,
        parent: category.id,
        topic: channelData.topic,
      });
      console.log(`  채널 생성: ${channelData.name}`);

      if (channelData.name === template.server.systemChannelName) {
        systemChannelId = channel.id;
      }
    }
  }

  // 4. 서버 자체 설정 적용
  const guildEditPayload = {
    verificationLevel: template.server.verificationLevel,
    defaultMessageNotifications: template.server.defaultNotifications,
    explicitContentFilter: template.server.explicitContentFilter,
  };
  if (systemChannelId) {
    guildEditPayload.systemChannel = systemChannelId;
  }
  await guild.edit(guildEditPayload);

  console.log('서버 세팅 완료!');
  process.exit(0);
});

client.login(TOKEN);
