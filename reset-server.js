// reset-server.js
// 서버의 모든 채널(카테고리 포함)과, @everyone/봇 자체 역할을 제외한 모든 역할을 삭제합니다.
// setup-server.js를 다시 실행하기 전에 깨끗한 상태로 되돌릴 때 씁니다.
// 실행: node reset-server.js

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error('BOT_TOKEN과 GUILD_ID를 .env 파일에 먼저 설정해주세요.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`로그인 완료: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`대상 서버: ${guild.name}`);
  console.log('5초 후 삭제를 시작합니다. 취소하려면 지금 Ctrl+C를 누르세요...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 1. 모든 채널 삭제 (일반 채널 먼저, 그다음 카테고리)
  const allChannels = await guild.channels.fetch();
  const nonCategoryChannels = allChannels.filter((c) => c && c.type !== 4); // 4 = GuildCategory
  const categoryChannels = allChannels.filter((c) => c && c.type === 4);

  for (const channel of nonCategoryChannels.values()) {
    try {
      await channel.delete('서버 리셋');
      console.log(`채널 삭제: ${channel.name}`);
    } catch (err) {
      console.log(`❌ ${channel.name} 삭제 실패: ${err.message}`);
    }
  }

  for (const category of categoryChannels.values()) {
    try {
      await category.delete('서버 리셋');
      console.log(`카테고리 삭제: ${category.name}`);
    } catch (err) {
      console.log(`❌ ${category.name} 삭제 실패: ${err.message}`);
    }
  }

  // 2. 모든 역할 삭제 (@everyone과 관리형 역할(봇 자체 역할, 부스트 역할 등)은 건드리지 않음)
  const allRoles = await guild.roles.fetch();
  for (const role of allRoles.values()) {
    if (role.name === '@everyone') continue;
    if (role.managed) continue; // 봇 전용 역할, Nitro 부스트 역할 등은 삭제 불가/불필요

    try {
      await role.delete('서버 리셋');
      console.log(`역할 삭제: ${role.name}`);
    } catch (err) {
      console.log(`❌ ${role.name} 삭제 실패(보통 봇보다 위 서열이면 발생): ${err.message}`);
    }
  }

  console.log('리셋 완료! 이제 node setup-server.js 를 다시 실행하세요.');
  process.exit(0);
});

client.login(TOKEN);
