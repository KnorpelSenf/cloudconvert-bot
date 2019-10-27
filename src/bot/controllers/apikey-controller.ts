import d from 'debug';
import * as strings from '../../strings';
import { validateApiKey } from '../models/cloud-convert';
import TaskContext from '../models/task-context';
const debug = d('bot:contr:apikey');

export async function handleTextMessage(ctx: TaskContext, next: (() => any) | undefined): Promise<void> {
    if (ctx.message !== undefined
        && ctx.message.text !== undefined
        && ctx.message.reply_to_message !== undefined
        && ctx.message.reply_to_message.from !== undefined
        && ctx.message.reply_to_message.from.id === ctx.state.bot_info.bot_id
        && ctx.message.reply_to_message.text === strings.sendApiKey) {
        debug('Handle API key');

        let apiKey = ctx.message.text;

        // In the unlikely case that the user responds with /apikey before sending the actual API key
        if (apiKey.startsWith('/apikey')) {
            apiKey = apiKey.substring(7).trim();
            if (apiKey.startsWith('@')) {
                apiKey = apiKey.substring(ctx.state.bot_info.bot_name.length + 1);
            }
        }

        await receivedApiKey(ctx, apiKey);
    } else if (next !== undefined) {
        return next();
    }
}
export async function receivedApiKey(ctx: TaskContext, apiKey: string) {
    debug('New key');
    if (ctx.message !== undefined && apiKey.length > 0) {
        debug('Check passed, validating message sending');
        const statusMessage = await ctx.reply(strings.validatingApiKey, {
            reply_to_message_id: ctx.message.message_id,
        });
        debug(statusMessage);
        debug('Validating');
        const username = await validateApiKey(apiKey);
        debug(username);
        // TODO: don't send more messages, edit existing ones. Need response from
        // https://github.com/telegraf/telegraf/issues/784
        const valid = username !== undefined;
        if (valid) {
            debug('Saving key');
            await ctx.db.saveApiKey(ctx.message.chat, apiKey);
            debug('Editing message to success');
            await ctx.replyWithHTML('<b>' + username + '</b>\n' + strings.apiKeyProvided);
            debug('Done.');
        } else {
            debug('Editing message to failure.');
            await ctx.replyWithHTML(strings.invalidApiKey + apiKey);
        }
    }
}
