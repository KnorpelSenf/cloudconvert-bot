// enable environment vars
import d from 'debug';
import { config } from 'dotenv';
import Bot from './bot/bot';
config();

const debug = d('app');


const bot = new Bot();
try {
    (async () => {
        await bot.start();
    })();
    debug('Bot started.');
} catch (e) {
    debug('Failed to start: ' + e);
}
