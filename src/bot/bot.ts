import { Firestore } from '@google-cloud/firestore';
import d from 'debug';
import express from 'express';
import path from 'path';
import Telegraf from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';
import firestoreSession from 'telegraf-session-firestore';
import * as apiKeys from './controllers/apikey-controller';
import * as callbacks from './controllers/callback-controller';
import * as commands from './controllers/command-controller';
import * as fallbacks from './controllers/fallback-controller';
import * as files from './controllers/file-controller';
import * as groups from './controllers/group-controller';
import commandArgs from './middlewares/command-args';
import TaskContext from './models/task-context';
const debug = d('bot:main');

// ID of the dev's dedicated debug log channel
const adminId = process.env.ADMIN_ID;

export interface BotInfo {
    bot_id: number;
    bot_name: string;
    is_dev_bot: boolean;
}

export default class Bot {

    private bot: Telegraf<TaskContext>;
    private botInfo?: BotInfo;

    public constructor() {
        // Init bot with bot token
        const token = process.env.BOT_API_TOKEN;
        if (token === undefined) {
            throw new Error('No API token provided in environ var BOT_API_TOKEN!');
        }
        this.bot = new Telegraf(token, { telegram: { webhookReply: false } });

        // Make session data available
        const db = new Firestore({
            projectId: 'cloudconvert-bot-257814',
            keyFilename: 'firestore-keyfile.json',
        });
        this.bot.use(firestoreSession(db.collection('sessions'), {
            getSessionKey: (ctx: TaskContext) => ctx.chat?.id.toString(),
        }));

        // Make internationalization available
        const i18n = new TelegrafI18n({
            defaultLanguage: 'en',
            directory: path.resolve(__dirname, 'locales'),
        });
        this.bot.use(i18n.middleware());

        // Make arg parsing available
        this.bot.use(commandArgs());

        debug('Available locales are', i18n.availableLocales());
        debug('Bot initialized.');
    }

    public async start() {
        const me = await this.bot.telegram.getMe();
        const botId = me.id;
        const botName = me.username || '';
        const isDevBot = botName.includes('dev');
        this.botInfo = { bot_id: botId, bot_name: botName, is_dev_bot: isDevBot };

        this.bot.options.username = botName;
        // Listeners (esp. for commands) can only be registered now that the bot name is known
        this.registerListeners();

        this.bot.context.bot_info = this.botInfo;

        if (isDevBot) {
            await this.bot.telegram.deleteWebhook();
            this.bot.startPolling();
            debug('Bot @' + botName + ' started using long polling at ' + new Date());
        } else {
            const port = process.env.PORT || 8080;
            const url = 'https://cloudconvert-bot-257814.appspot.com:443/' + this.bot.token;
            const app = express();
            app.use(this.bot.webhookCallback('/' + this.bot.token));
            app.listen(port);
            await this.bot.telegram.setWebhook(url);
            debug('Bot @' + botName + ' started using a webhook at ' + new Date() + ' for URL ' + url);
        }
    }

    private registerListeners() {
        // Group support
        this.bot.on(['new_chat_members'], groups.addedToGroup);
        this.bot.on(['left_chat_member'], groups.removedFromGroup);

        // Special handling for photos as they don't simply have a file_id
        this.bot.on(['photo'], files.handlePhoto);

        // Files
        this.bot.on(['audio',
            'document',
            'sticker',
            'video',
            'voice',
            'video_note'], files.handleDocument);

        // Commands
        this.bot.command('start', commands.start);
        this.bot.command('help', commands.help);
        this.bot.command('cancel', commands.cancel);
        this.bot.command('reset', commands.reset);
        this.bot.command('balance', commands.balance);
        this.bot.command(['contribute', 'the_more_the_merrier'], commands.contribute);
        this.bot.command('feedback', commands.feedback);
        this.bot.command('limitations', commands.limitations);
        this.bot.command('apikey', commands.apiKey);
        this.bot.command('info', commands.info);
        this.bot.command('convert', commands.convert);

        // Text messages are used for every file format command (like /mp4) and when providing an API key
        this.bot.on(['text'], files.handleTextMessage, apiKeys.handleTextMessage, fallbacks.help);

        // Respond to callback queries
        this.bot.on('callback_query', callbacks.handleCallbackQuery);

        // Log all errors to dedicated channel
        this.bot.catch((err: any) => this.report(err));
    }

    private report(err: any) {
        if (adminId !== undefined) { // <- the dev's debug log channel id
            const log = 'Error:\n' + JSON.stringify(err, null, 2)
                + '\nTrace:\n' + new Error().stack;
            this.bot.telegram.sendMessage(adminId, log);
            if (this.botInfo !== undefined && this.botInfo.is_dev_bot) {
                debug(log);
            }
        }
    }

}
