import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

function getWebhookUrl(): string {
  const explicit = process.env.TELEGRAM_WEBHOOK_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const railwayUrl = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (!railwayUrl) throw new Error('TELEGRAM_WEBHOOK_URL or RAILWAY_STATIC_URL/RAILWAY_PUBLIC_DOMAIN must be set');
  const normalized = railwayUrl.startsWith('http') ? railwayUrl : `https://${railwayUrl}`;
  return normalized.replace(/\/+$/, '');
}

function parseAuthorizedChatIds(raw: string): string[] {
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

function isAuthorizedMessage(allowedIds: string[], msg: TelegramBot.Message): boolean {
  const chatId = msg.chat?.id;
  const fwdChatId = msg.forward_from_chat?.id;

  const directAllowed = chatId !== undefined && allowedIds.includes(String(chatId));
  const forwardAllowed = fwdChatId !== undefined && allowedIds.includes(String(fwdChatId));

  console.log('[Auth] check', { allowedIds, chatId, forwardChatId: fwdChatId, directAllowed, forwardAllowed });
  return directAllowed || forwardAllowed;
}

async function handleRewardsCommand(bot: TelegramBot, chatId: number, backendUrl: string): Promise<void> {
  try {
    const response = await axios.get(`${backendUrl}/dashboard/rewards`, { timeout: 30000 });
    const rewards = response.data as {
      lastRun: string | null;
      nextRun: string | null;
      isRunning: boolean;
      statistics: { totalHolders: number; eligibleHolders: number; pendingPayouts: number; totalSOLDistributed: number };
      tokenPrice: { usd: number };
    };

    const lastRun = rewards.lastRun ? new Date(rewards.lastRun).toLocaleString() : 'Never';
    const nextRun = rewards.nextRun ? new Date(rewards.nextRun).toLocaleString() : 'N/A';

    const message = [
      '📊 Reward System Status',
      '',
      `Last Run: ${lastRun}`,
      `Next Run: ${nextRun}`,
      `Status: ${rewards.isRunning ? 'Running' : 'Idle'}`,
      '',
      'Statistics:',
      `• Total Holders: ${rewards.statistics.totalHolders}`,
      `• Eligible Holders: ${rewards.statistics.eligibleHolders}`,
      `• Pending Payouts: ${rewards.statistics.pendingPayouts}`,
      `• Total SOL Distributed: ${rewards.statistics.totalSOLDistributed.toFixed(6)}`,
      `• Token Price (USD): ${rewards.tokenPrice.usd.toFixed(4)}`,
    ].join('\n');

    await bot.sendMessage(chatId, message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await bot.sendMessage(chatId, `Failed to fetch rewards: ${reason}`);
  }
}

function main(): void {
  try {
    const token = requireEnv('TELEGRAM_BOT_TOKEN');
    const chatIdsEnv = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;
    if (!chatIdsEnv?.trim()) throw new Error('TELEGRAM_CHAT_IDS (or TELEGRAM_CHAT_ID) is required');
    const authorizedChatIds = parseAuthorizedChatIds(chatIdsEnv);
    const backendUrl = requireEnv('BACKEND_URL');
    const port = Number(process.env.PORT || 3000);
    const webhookUrl = `${getWebhookUrl()}/telegram/webhook`;

    const bot = new TelegramBot(token, { polling: false, webHook: { port: 0 } });

    bot.setWebHook(webhookUrl)
      .then(() => console.log('[Bot] Webhook registered successfully'))
      .catch((err) => console.error('[Bot] Failed to set webhook:', err));

    const app = express();
    app.use(express.json());

    app.get('/health', (_req: Request, res: Response) => res.status(200).send('OK'));

    app.post('/telegram/webhook', (req: Request, res: Response) => {
      try {
        console.log('[Bot] Incoming update:', JSON.stringify(req.body));
        bot.processUpdate(req.body as any);
      } catch (err) {
        console.error('[Bot] Error processing update:', err);
      }
      res.sendStatus(200);
    });

    // Unified handler for messages and channel posts
    const handleIncomingMessage = async (msg: TelegramBot.Message) => {
      console.log('[Bot] Incoming message', { chatId: msg.chat.id, chatType: msg.chat.type, text: msg.text });
      if (!msg.text) return;

      const allowed = isAuthorizedMessage(authorizedChatIds, msg);

      if (msg.text.startsWith('/start') && msg.chat.type === 'private') {
        if (!allowed) return await bot.sendMessage(msg.chat.id, 'Unauthorized chat ID');
        return await bot.sendMessage(msg.chat.id, 'Hello! Bot is online. Use /rewards to see rewards.');
      }

      if (msg.text.startsWith('/rewards')) {
        if (!allowed) return await bot.sendMessage(msg.chat.id, 'Unauthorized chat ID');
        await handleRewardsCommand(bot, msg.chat.id, backendUrl);
      }
    };

    bot.on('message', handleIncomingMessage);
    bot.on('channel_post', handleIncomingMessage);

    app.listen(port, () => {
      console.log('[Bot] Express server listening', { port, webhookUrl, backendUrl });
    });
  } catch (error) {
    console.error('[Bot] Failed to start:', error);
    process.exit(1);
  }
}

main();
