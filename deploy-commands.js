// deploy-commands.js
// 슬래시 명령어(/이벤트시작)를 서버에 등록합니다. 명령어 내용을 바꿀 때마다 다시 실행하면 됩니다.
// 실행: node deploy-commands.js

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('BOT_TOKEN, CLIENT_ID, GUILD_ID를 .env 파일에 먼저 설정해주세요.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('이벤트시작')
    .setDescription('참여 버튼이 달린 이벤트(래플)를 시작합니다. (관리자 전용)')
    .addStringOption((opt) =>
      opt.setName('상품').setDescription('당첨 상품/내용').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('시간')
        .setDescription('참여 마감까지 걸리는 시간(분)')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('당첨자수')
        .setDescription('뽑을 당첨자 수 (기본 1명)')
        .setRequired(false)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('이벤트종료')
    .setDescription('진행 중인 이벤트를 지금 바로 종료하고 당첨자를 뽑습니다. (관리자 전용)')
    .addStringOption((opt) =>
      opt
        .setName('메시지id')
        .setDescription('종료할 이벤트 메시지의 ID (모르면 이벤트 메시지 우클릭 > ID 복사)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('슬래시 명령어 등록 중...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log('등록 완료! /이벤트시작, /이벤트종료 를 사용할 수 있어요.');
  } catch (err) {
    console.error('등록 실패:', err);
  }
})();
