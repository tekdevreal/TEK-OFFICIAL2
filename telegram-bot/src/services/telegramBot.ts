import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger';
import { loadConfig } from '../config/env';
import { backendClient } from './backendClient';

const config = loadConfig();

export class TelegramBotService {
  private bot: TelegramBot;
  private chatId: string;

  constructor() {
    this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
    this.chatId = config.TELEGRAM_CHAT_ID;

    this.setupEventHandlers();
    this.setupCommands();
  }

  private setupEventHandlers(): void {
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error', { error: error.message });
    });

    this.bot.on('error', (error) => {
      logger.error('Telegram bot error', { error: error.message });
    });

    logger.info('Telegram bot initialized', {
      chatId: this.chatId,
    });
  }

  private setupCommands(): void {
    // /help command
    this.bot.onText(/\/help/, async (msg) => {
      const helpText = `
🤖 TEK Rewards Audit Bot Commands

/help - Show this help message
/summary - Get current reward cycle summary
/latest_report - Download latest Excel export file

Automatic Notifications
The bot automatically sends reward cycle summaries every ${config.POLLING_INTERVAL_MS / 60000} minutes.
      `;

      try {
        await this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
        logger.info('Help command executed', { chatId: msg.chat.id });
      } catch (error) {
        logger.error('Error sending help message', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // /summary command - placeholder
    this.bot.onText(/\/summary/, async (msg) => {
      try {
        await this.bot.sendMessage(msg.chat.id, '📊 Fetching reward summary...');

        // TODO: Implement actual summary fetching
        const rewardStatus = await backendClient.getRewardStatus();
        const exportSummary = await backendClient.getExportSummary().catch(() => null);

        // TODO: Format and send summary message
        const summaryText = `📊 *Reward Summary*\n\nPlaceholder - implement summary formatting`;
        
        await this.bot.sendMessage(msg.chat.id, summaryText, { parse_mode: 'Markdown' });
        logger.info('Summary command executed', { chatId: msg.chat.id });
      } catch (error) {
        logger.error('Error sending summary', {
          error: error instanceof Error ? error.message : String(error),
        });
        await this.bot.sendMessage(
          msg.chat.id,
          '❌ Failed to fetch summary. Please try again later.'
        );
      }
    });

    // /latest_report command - placeholder
    this.bot.onText(/\/latest_report/, async (msg) => {
      try {
        await this.bot.sendMessage(msg.chat.id, '📥 Downloading latest export file...');

        // TODO: Implement actual file download
        const fileBuffer = await backendClient.downloadLatestExport();

        if (!fileBuffer) {
          await this.bot.sendMessage(
            msg.chat.id,
            '❌ No export file available yet. Wait for the next reward cycle to complete.'
          );
          return;
        }

        // TODO: Send file to Telegram
        await this.bot.sendDocument(msg.chat.id, fileBuffer, {
          caption: '📊 Latest reward cycles and payouts export',
        });

        logger.info('Latest report command executed', { chatId: msg.chat.id });
      } catch (error) {
        logger.error('Error sending latest report', {
          error: error instanceof Error ? error.message : String(error),
        });
        await this.bot.sendMessage(
          msg.chat.id,
          '❌ Failed to download export file. Please try again later.'
        );
      }
    });
  }

  /**
   * Send notification to configured chat
   */
  async sendNotification(message: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown',
      });
      logger.info('Notification sent', { chatId: this.chatId });
    } catch (error) {
      logger.error('Error sending notification', {
        error: error instanceof Error ? error.message : String(error),
        chatId: this.chatId,
      });
    }
  }

  /**
   * Get bot instance (for advanced usage)
   */
  getBot(): TelegramBot {
    return this.bot;
  }
}
