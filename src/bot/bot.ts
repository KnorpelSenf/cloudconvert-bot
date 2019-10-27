import d from 'debug';
import express from 'express';
import Telegraf from 'telegraf';
import * as apiKeys from './controllers/apikey-controller';
import * as callbacks from './controllers/callback-controller';
import * as commands from './controllers/command-controller';
import * as fallbacks from './controllers/fallback-controller';
import * as files from './controllers/file-controller';
import * as groups from './controllers/group-controller';
import commandArgs from './middlewares/command-args';
import BotDatabase from './models/bot-database';
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

    private db: BotDatabase;
    private bot: Telegraf<TaskContext>;

    private botInfo?: BotInfo;

    public constructor() {
        const mongoDbUrl = 'mongodb://bot:'
            + process.env.MONGO_DB_PASSWORD + '@ds255403.mlab.com:55403/cloudconvert-bot';
        this.db = new BotDatabase(mongoDbUrl);

        // Init bot with bot token
        const token = process.env.BOT_API_TOKEN;
        if (token === undefined) {
            throw new Error('No API token provided in environ var BOT_API_TOKEN!');
        }
        this.bot = new Telegraf(token);

        // Add database to context object
        this.bot.context.db = this.db;

        // Make arg parsing available
        this.bot.use(commandArgs);

        // TODO: use middleware to add a function to the context
        // that can easily query the db for the cc key and cache a cc instance.
        // Make the function return a promise to hide away the potential db call
        // and the caching. Replace all calls alike:
        // await ctx.db.getKey(ctx.message.chat.id)
        //
        // This might boost performance for contributors (users who provided a cc key)
        // if some actions needs to be performed that does not rely on the API key,
        // especially if said action takes longer than a few CPU cycles (networking).

        debug('Bot initialized.');
    }

    public async start() {
        const [me] = await Promise.all([
            this.bot.telegram.getMe(),
            this.db.connect(),
        ]);
        const botId = me.id;
        const botName = me.username || '';
        const isDevBot = botName.includes('dev');
        this.botInfo = { bot_id: botId, bot_name: botName, is_dev_bot: isDevBot };

        this.bot.options.username = botName;
        // Listeners (esp. for commands) can only be registered now that the bot name is known
        this.registerListeners();

        this.bot.context.state = { bot_info: this.botInfo };

        if (isDevBot) {
            await this.bot.telegram.deleteWebhook();
            this.bot.startPolling();
            debug('Bot @' + botName + ' started using long polling at ' + new Date());
        } else {
            const port = process.env.PORT || 8080;
            const url = 'https://cloudconvert-bot.appspot.com:80/' + this.bot.token;
            const app = express();
            app.use(this.bot.webhookCallback('/' + this.bot.token));
            await this.bot.telegram.setWebhook(url);
            app.listen(port);
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
