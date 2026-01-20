import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { getLastState, updateState } from './state/notificationState';

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
    price: number | null; // SOL per TEK
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
    lastTaxDistributionTime: number | null;
    lastDistributionCycleNumber: number | null;
    lastDistributionEpoch: string | null;
    lastDistributionEpochNumber: number | null;
    lastDistributionSolToHolders: string;
    lastDistributionSolToTreasury: string;
    lastSwapTx: string | null;
    lastDistributionTx: string | null;
    distributionCount: number;
  };
};

/**
 * Fetch rewards from the backend and return swap/distribution notification message
 * Only returns a message if a distribution occurred (uses lastTaxDistribution timestamp)
 * 
 * NOTE: Uses lastTaxDistribution instead of lastSwapTx to handle batch splitting correctly.
 * When batch splitting occurs, there are multiple swap transactions but only ONE distribution.
 * Tracking by timestamp ensures we notify once per distribution, not once per swap.
 */
async function fetchSwapDistributionNotification(
  backendUrl: string,
  lastKnownDistributionTime: number | null
): Promise<{ message: string | null; lastDistributionTime: number | null; distributionHash?: string }> {
  const response = await axios.get<RewardApiResponse>(`${backendUrl}/dashboard/rewards`, { timeout: 30000 });
  const rewards = response.data;

  // Check if tax data exists and has a distribution
  if (!rewards.tax || !rewards.tax.lastTaxDistribution) {
    return { message: null, lastDistributionTime: null };
  }

  const currentDistributionTime = typeof rewards.tax.lastTaxDistribution === 'string'
    ? new Date(rewards.tax.lastTaxDistribution).getTime()
    : Number(rewards.tax.lastTaxDistribution);
  
  // Round to nearest second to avoid millisecond precision issues
  const currentDistributionTimeRounded = Math.floor(currentDistributionTime / 1000) * 1000;
  const lastKnownDistributionTimeRounded = lastKnownDistributionTime 
    ? Math.floor(lastKnownDistributionTime / 1000) * 1000 
    : null;
  
  // Only notify if distribution time changed (new distribution occurred)
  // Using rounded timestamps to avoid precision issues
  if (currentDistributionTimeRounded === lastKnownDistributionTimeRounded) {
    return { message: null, lastDistributionTime: currentDistributionTime };
  }
  
  // Create a unique hash of the distribution data to detect true duplicates
  // This prevents notifying about the same distribution multiple times even if timestamp changes slightly
  const distributionHash = crypto.createHash('sha256')
    .update(`${rewards.tax.totalSolDistributed}-${rewards.tax.totalSolToTreasury}-${rewards.tax.distributionCount}`)
    .digest('hex')
    .substring(0, 16);
  
  // Check if we've already notified about this exact distribution
  const lastState = getLastState();
  if (lastState.lastDistributionHash === distributionHash) {
    console.log('[AutoRewards] Skipping notification - already notified about this distribution', {
      distributionHash,
      distributionTime: new Date(currentDistributionTime).toISOString(),
    });
    return { message: null, lastDistributionTime: currentDistributionTime };
  }

  // Format notification message for successful swap + distribution
  // Use LAST distribution amounts, not cumulative totals
  const solToHolders = BigInt(rewards.tax.lastDistributionSolToHolders || '0');
  const solToTreasury = BigInt(rewards.tax.lastDistributionSolToTreasury || '0');
  
  // Convert from lamports to SOL
  const solToHoldersFormatted = (Number(solToHolders) / 1e9).toFixed(6);
  const solToTreasuryFormatted = (Number(solToTreasury) / 1e9).toFixed(6);
  
  // Calculate total (holders + treasury)
  const totalSOL = Number(solToHolders) + Number(solToTreasury);
  const totalSOLFormatted = (totalSOL / 1e9).toFixed(6);
  
  // Fetch current cycle information
  let cycleInfo: { epoch: string; epochNumber: number; cycleNumber: number; cyclesPerEpoch: number } | null = null;
  try {
    const cycleResponse = await axios.get(`${backendUrl}/dashboard/cycles/current`, { timeout: 10000 });
    cycleInfo = cycleResponse.data;
  } catch (err) {
    console.error('[Notification] Failed to fetch cycle info:', err);
  }
  
  // Format distribution timestamp in CET (MM/DD/YYYY, HH:mm CET)
  const distributionTime = rewards.tax.lastTaxDistribution 
    ? (() => {
        const date = new Date(rewards.tax.lastTaxDistribution);
        // Convert to CET timezone using Intl.DateTimeFormat
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        const parts = formatter.formatToParts(date);
        const month = parts.find(p => p.type === 'month')?.value || '01';
        const day = parts.find(p => p.type === 'day')?.value || '01';
        const year = parts.find(p => p.type === 'year')?.value || '2026';
        const hours = parts.find(p => p.type === 'hour')?.value || '00';
        const minutes = parts.find(p => p.type === 'minute')?.value || '00';
        return `${month}/${day}/${year}, ${hours}:${minutes} CET`;
      })()
    : 'N/A';
  
  // Build message with TEK branding and spacing
  const messageLines = [
    '*🟢 TEK Distribution*',
    '',
    `*Total:* ${totalSOLFormatted} SOL`,
    `*Holders:* ${solToHoldersFormatted} SOL`,
    `*Treasury:* ${solToTreasuryFormatted} SOL`,
  ];

  // Add spacing before epoch/cycle section
  messageLines.push('');

  // Add epoch and cycle info if available
  if (cycleInfo) {
    // Use the stored cycle number from when distribution occurred, not current cycle
    const distributionCycleNumber = rewards.tax.lastDistributionCycleNumber || cycleInfo.cycleNumber;
    const distributionEpochNumber = rewards.tax.lastDistributionEpochNumber || cycleInfo.epochNumber;
    
    messageLines.push(`*Epoch:* ${distributionEpochNumber}`); // Use stored epoch number from distribution
    messageLines.push(`*Cycle:* ${distributionCycleNumber} / ${cycleInfo.cyclesPerEpoch}`); // Use stored cycle number from distribution
  }

  const message = messageLines.join('\n');

  return { message, lastDistributionTime: currentDistributionTime, distributionHash };
}

async function handleRewardsCommand(bot: TelegramBot, chatId: number, backendUrl: string): Promise<void> {
  try {
    // For manual /rewards command, show current status
    const response = await axios.get<RewardApiResponse>(`${backendUrl}/dashboard/rewards`, { timeout: 30000 });
    const rewards = response.data;

    if (!rewards.tax || !rewards.tax.totalSolDistributed) {
      await bot.sendMessage(chatId, 'No reward distributions yet. Check back later! 🚀');
      return;
    }

    // Fetch current cycle information
    let cycleInfo: { epoch: string; epochNumber: number; cycleNumber: number; cyclesPerEpoch: number } | null = null;
    try {
      const cycleResponse = await axios.get(`${backendUrl}/dashboard/cycles/current`, { timeout: 10000 });
      cycleInfo = cycleResponse.data;
    } catch (err) {
      console.error('[Command] Failed to fetch cycle info:', err);
    }

    // Format accumulated stats
    const totalDistributed = (parseInt(rewards.tax.totalSolDistributed) / 1e9).toFixed(6);
    const totalToHolders = rewards.tax.totalRewardAmount 
      ? (parseInt(rewards.tax.totalRewardAmount) / 1e9).toFixed(6)
      : '0';
    const totalToTreasury = rewards.tax.totalTreasuryAmount
      ? (parseInt(rewards.tax.totalTreasuryAmount) / 1e9).toFixed(6)
      : '0';

    const lastDistribution = rewards.tax.lastTaxDistribution 
      ? new Date(rewards.tax.lastTaxDistribution).toLocaleString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Europe/Paris', // CET timezone
          hour12: false 
        }) + ' CET'
      : 'N/A';

    const messageLines = [
      '*🟩 TEK Reward Statistics*',
      '',
      `*Total Distributed:* ${totalDistributed} SOL`,
      `*To Holders:* ${totalToHolders} SOL`,
      `*To Treasury:* ${totalToTreasury} SOL`,
      `*Distributions:* ${rewards.tax.distributionCount || 0}`,
      '',
    ];

    // Add cycle info if available
    if (cycleInfo) {
      messageLines.push(`*Current Epoch:* ${cycleInfo.epochNumber}`); // Use epochNumber instead of epoch date
      messageLines.push(`*Current Cycle:* ${cycleInfo.cycleNumber} / ${cycleInfo.cyclesPerEpoch}`);
    } else {
      messageLines.push('*Current Epoch:* N/A');
      messageLines.push('*Current Cycle:* N/A');
    }

    messageLines.push(`*Last Distribution:* ${lastDistribution}`);

    const message = messageLines.join('\n');

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
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
    // - Only sends notifications when a distribution occurred (lastTaxDistribution changed)
    // - Uses distribution timestamp instead of swap tx to handle batch splitting correctly
    // - Persists lastDistributionTime to disk to prevent duplicate notifications after bot restarts
    const initialState = getLastState();
    let lastKnownDistributionTime: number | null = initialState.lastDistributionTime || null;
    console.log('[Bot] Loaded last known distribution time from state:', 
      lastKnownDistributionTime ? new Date(lastKnownDistributionTime).toISOString() : 'none');

    const tickAutomaticRewards = async () => {
      try {
        const result = await fetchSwapDistributionNotification(backendUrl, lastKnownDistributionTime);
        
        if (!result.message) {
          // No new distribution detected
          return;
        }

        const { message, lastDistributionTime, distributionHash } = result;

        console.log('[AutoRewards] New distribution detected, broadcasting to authorized chats', {
          previousDistributionTime: lastKnownDistributionTime 
            ? new Date(lastKnownDistributionTime).toISOString() 
            : 'none',
          newDistributionTime: lastDistributionTime 
            ? new Date(lastDistributionTime).toISOString() 
            : 'unknown',
          distributionHash,
          authorizedChatIds,
        });

        for (const chatId of authorizedChatIds) {
          try {
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log('[AutoRewards] Sent distribution notification', { chatId });
          } catch (sendErr) {
            console.error('[AutoRewards] Failed to send notification', { chatId, error: sendErr });
          }
        }

        // Persist to disk to survive bot restarts
        lastKnownDistributionTime = lastDistributionTime;
        updateState({ 
          lastDistributionTime: lastDistributionTime ?? undefined,
          lastDistributionHash: distributionHash 
        });
        console.log('[AutoRewards] Updated persistent state', { 
          lastDistributionTime: lastDistributionTime ? new Date(lastDistributionTime).toISOString() : 'none',
          distributionHash,
        });
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
