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

type RewardApiResponse = {
  lastRun: string | null;
  nextRun: string | null;
  isRunning: boolean;
  statistics: {
    totalHolders: number;
    eligibleHolders: number;
    pendingPayouts: number;
    totalSOLDistributed: number;
  };
  tokenPrice: {
    sol: number | null;
    usd: number | null;
    source?: 'raydium' | null;
  };
  dex?: {
    name: string;
    price: number | null; // SOL per NUKE
    source: string;
    updatedAt: string;
  } | null;
  tax?: {
    totalTaxCollected: string;
    totalNukeHarvested: string;
    totalNukeSold: string;
    totalRewardAmount: string;
    totalTreasuryAmount: string;
    totalSolDistributed: string;
    totalSolToTreasury: string;
    lastTaxDistribution: string | null;
    lastSwapTx: string | null;
    lastDistributionTx: string | null;
    distributionCount: number;
  };
};

/**
 * Fetch rewards from the backend and return swap/distribution notification message
 * Only returns a message if a swap + distribution occurred (lastSwapTx changed)
 */
async function fetchSwapDistributionNotification(
  backendUrl: string,
  lastKnownSwapTx: string | null
): Promise<{ message: string | null; lastSwapTx: string | null }> {
  const response = await axios.get<RewardApiResponse>(`${backendUrl}/dashboard/rewards`, { timeout: 30000 });
  const rewards = response.data;

  // Check if tax data exists and has a swap transaction
  if (!rewards.tax || !rewards.tax.lastSwapTx) {
    return { message: null, lastSwapTx: null };
  }

  const currentSwapTx = rewards.tax.lastSwapTx;
  
  // Only notify if swap transaction changed (new swap occurred)
  if (currentSwapTx === lastKnownSwapTx) {
    return { message: null, lastSwapTx: currentSwapTx };
  }

  // Format notification message for successful swap + distribution
  const solToHolders = BigInt(rewards.tax.totalSolDistributed || '0');
  const solToTreasury = BigInt(rewards.tax.totalSolToTreasury || '0');
  
  // Convert from lamports to SOL
  const solToHoldersFormatted = (Number(solToHolders) / 1e9).toFixed(6);
  const solToTreasuryFormatted = (Number(solToTreasury) / 1e9).toFixed(6);
  
  // Calculate total (holders + treasury)
  const totalSOL = Number(solToHolders) + Number(solToTreasury);
  const totalSOLFormatted = (totalSOL / 1e9).toFixed(6);
  
  // Get distribution count (holders paid)
  const holdersPaid = rewards.tax.distributionCount || 0;
  
  // Get epoch timestamp (use lastTaxDistribution or lastRun)
  const epochTimestamp = rewards.tax.lastTaxDistribution || rewards.lastRun;
  let epochFormatted = 'N/A';
  if (epochTimestamp) {
    try {
      const epochDate = new Date(epochTimestamp);
      epochFormatted = epochDate.toISOString().replace('T', ' ').substring(0, 19);
    } catch {
      epochFormatted = epochTimestamp;
    }
  }
  
  const messageLines = [
    '💰 NUKE Rewards Distributed',
    '',
    `• Total: ${totalSOLFormatted} SOL`,
    `• Holders: ${solToHoldersFormatted} SOL`,
    `• Treasury: ${solToTreasuryFormatted} SOL`,
    `• Epoch: ${epochFormatted}`,
  ];

  const message = messageLines.join('\n');

  return { message, lastSwapTx: currentSwapTx };
}

async function handleRewardsCommand(bot: TelegramBot, chatId: number, backendUrl: string): Promise<void> {
  try {
    // For manual /rewards command, show current status
    const response = await axios.get<RewardApiResponse>(`${backendUrl}/dashboard/rewards`, { timeout: 30000 });
    const rewards = response.data;

    const messageLines = [
      '📊 Reward System Status',
      '',
    ];

    if (rewards.tax) {
      const nukeSold = BigInt(rewards.tax.totalNukeSold || '0');
      const solToHolders = BigInt(rewards.tax.totalSolDistributed || '0');
      const solToTreasury = BigInt(rewards.tax.totalSolToTreasury || '0');
      
      const decimals = 6;
      const nukeSoldFormatted = (Number(nukeSold) / Math.pow(10, decimals)).toFixed(2);
      const solToHoldersFormatted = (Number(solToHolders) / 1e9).toFixed(6);
      const solToTreasuryFormatted = (Number(solToTreasury) / 1e9).toFixed(6);
      
      messageLines.push(
        'Recent Distribution:',
        `• NUKE Sold: ${nukeSoldFormatted}`,
        `• SOL to Holders: ${solToHoldersFormatted}`,
        `• SOL to Treasury: ${solToTreasuryFormatted}`,
        `• Distributions: ${rewards.tax.distributionCount}`,
      );
    } else {
      messageLines.push('No distributions yet.');
    }

    await bot.sendMessage(chatId, messageLines.join('\n'));
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
    const pollingIntervalMs = Number(process.env.POLLING_INTERVAL_MS || '60000');
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

    // Unified handler for messages and channel posts (webhook-driven)
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

    // Automatic reward notifications loop:
    // - Runs every POLLING_INTERVAL_MS (default 60000ms)
    // - Only sends notifications when a swap + distribution occurred (lastSwapTx changed)
    let lastKnownSwapTx: string | null = null;

    const tickAutomaticRewards = async () => {
      try {
        const { message, lastSwapTx } = await fetchSwapDistributionNotification(backendUrl, lastKnownSwapTx);
        
        if (!message) {
          // No new swap/distribution detected
          return;
        }

        console.log('[AutoRewards] New swap + distribution detected, broadcasting to authorized chats', {
          lastSwapTx,
          authorizedChatIds,
        });

        for (const chatId of authorizedChatIds) {
          try {
            await bot.sendMessage(chatId, message);
            console.log('[AutoRewards] Sent swap/distribution notification', { chatId });
          } catch (sendErr) {
            console.error('[AutoRewards] Failed to send notification', { chatId, error: sendErr });
          }
        }

        lastKnownSwapTx = lastSwapTx;
      } catch (err) {
        console.error('[AutoRewards] Error while fetching or broadcasting notifications:', err);
      }
    };

    // Start periodic automatic rewards polling (does not interfere with webhook handlers)
    setInterval(tickAutomaticRewards, pollingIntervalMs);

    app.listen(port, () => {
      console.log('[Bot] Express server listening', { port, webhookUrl, backendUrl, pollingIntervalMs });
    });
  } catch (error) {
    console.error('[Bot] Failed to start:', error);
    process.exit(1);
  }
}

main();
