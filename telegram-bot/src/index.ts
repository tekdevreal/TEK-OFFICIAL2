import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function getWebhookUrl(): string {
  const explicit = process.env.TELEGRAM_WEBHOOK_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const railwayUrl = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (!railwayUrl) {
    throw new Error('TELEGRAM_WEBHOOK_URL or RAILWAY_STATIC_URL/RAILWAY_PUBLIC_DOMAIN must be set for webhooks');
  }
  const normalized = railwayUrl.startsWith('http') ? railwayUrl : `https://${railwayUrl}`;
  return normalized.replace(/\/+$/, '');
}

function isAuthorizedChat(chatIdEnv: string, msgChatId: number, msgUsername?: string): boolean {
  if (!chatIdEnv) return true;
  const normalizedEnv = chatIdEnv.trim();
  if (normalizedEnv === String(msgChatId)) return true;
  if (msgUsername && normalizedEnv === `@${msgUsername}`) return true;
  return false;
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
    const notificationChatId = requireEnv('TELEGRAM_CHAT_ID');
    const backendUrl = requireEnv('BACKEND_URL');
    const nodeEnv = process.env.NODE_ENV || 'production';
    const port = Number(process.env.PORT || 3000);
    const webhookBase = getWebhookUrl();
    const webhookPath = '/telegram/webhook';
    const webhookUrl = `${webhookBase}${webhookPath}`;

    const bot = new TelegramBot(token, {
      polling: false,
      webHook: {
        port: 0, // disable internal HTTP server; we'll use Express
      },
    });

    console.log('[Bot] Setting Telegram webhook to:', webhookUrl);
    bot
      .setWebHook(webhookUrl)
      .then(() => {
        console.log('[Bot] Webhook registered successfully');
      })
      .catch((err) => {
        // Do NOT exit the process; keep Express listening so Railway doesn't 502.
        console.error('[Bot] Failed to set webhook. Bot will keep running but may not receive updates:', err);
      });

    const app = express();
    // JSON body parser must be registered before the webhook route
    app.use(express.json());

    app.get('/health', (_req: Request, res: Response) => {
      res.status(200).send('OK');
    });

    app.post(webhookPath, (req: Request, res: Response) => {
      try {
        console.log('[Bot] Incoming update:', JSON.stringify(req.body));
        // For node-telegram-bot-api, processUpdate forwards the update to handlers.
        bot.processUpdate(req.body as any);
      } catch (err) {
        console.error('[Bot] Error handling update:', err);
        // Intentionally fall through – we still return 200 to stop Telegram retries.
      }
      // Always respond 200 so Telegram does not retry and Railway does not 502.
      res.sendStatus(200);
    });

    bot.on('message', async (msg) => {
      console.log('[Bot] message update', {
        chatId: msg.chat.id,
        chatType: msg.chat.type,
        from: msg.from?.username,
        text: msg.text,
      });
    });

    bot.on('channel_post', async (msg) => {
      console.log('[Bot] channel_post update', {
        chatId: msg.chat.id,
        chatTitle: msg.chat.title,
        chatUsername: (msg.chat as any).username,
        text: msg.text,
      });
    });

    // /start: only for private chats
    bot.onText(/\/start/, async (msg) => {
      if (msg.chat.type !== 'private') {
        // ignore /start in channels or groups
        return;
      }
      await bot.sendMessage(
        msg.chat.id,
        'Hello! Bot is online and ready. Use /rewards to view the latest rewards summary in the configured channel.'
      );
    });

    // /rewards: allowed for authorized private chats and the configured channel
    bot.onText(/\/rewards/, async (msg) => {
      const isChannel = msg.chat.type === 'channel';
      const allowed = isChannel
        ? isAuthorizedChat(notificationChatId, msg.chat.id, (msg.chat as any).username)
        : isAuthorizedChat(notificationChatId, msg.chat.id, msg.chat.username || undefined);

      if (!allowed) {
        await bot.sendMessage(msg.chat.id, 'Unauthorized chat ID');
        return;
      }

      await handleRewardsCommand(bot, msg.chat.id, backendUrl);
    });

    app.listen(port, () => {
      console.log('[Bot] Express server listening', {
        port,
        env: nodeEnv,
        webhookUrl,
        backendUrl,
      });
    });
  } catch (error) {
    console.error('[Bot] Failed to start bot:', error);
    process.exit(1);
  }
}

main();
