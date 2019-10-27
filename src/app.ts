// enable environment vars
import { config } from 'dotenv-flow';
config();

import d from 'debug';
const debug = d('app');

import Bot from './bot/bot';

const bot = new Bot();
try {
    (async () => {
        await bot.start();
    })();
    debug('Bot started.');
} catch (e) {
    debug('Failed to start: ' + e);
}
