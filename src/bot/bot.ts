import Slimbot from 'slimbot';
import BotDatabase from './bot-database';

export default class Bot {

    private db: BotDatabase;
    private slimbot: Slimbot;

    private botId?: number;
    private botName?: string;
    private isDevBot?: boolean;

    constructor() {
        let mongoDbUrl = 'mongodb://bot:' + process.env.MONGO_DB_PASSWORD + '@ds255403.mlab.com:55403/cloudconvert-bot';
        let botApiToken = process.env.BOT_API_TOKEN;
        this.db = new BotDatabase(mongoDbUrl);
        this.slimbot = new Slimbot(botApiToken);
    }

    async start() {
        this.db.connect();
        let response = await this.slimbot.getMe();
        let result = response.result;
        this.botId = result.id;
        this.botName = result.username;
        this.isDevBot = result.username.indexOf('dev') >= 0;
        await this.slimbot.startPolling();
    }

}
