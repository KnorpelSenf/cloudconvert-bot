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
    if (ctx.message !== undefined && apiKey.length > 0) {
        const statusMessage = await ctx.replyWithHTML(strings.validatingApiKey, {
            reply_to_message_id: ctx.message.message_id,
        });
        const username = await validateApiKey(apiKey);
        const valid = username !== undefined;
        if (valid) {
            await ctx.db.saveApiKey(ctx.message.chat, apiKey);
            await ctx.telegram.editMessageText(statusMessage.chat.id,
                statusMessage.message_id,
                undefined,
                '<b>' + username + '</b>\n' + strings.apiKeyProvided,
                { parse_mode: 'HTML' });
        } else {
            await ctx.telegram.editMessageText(statusMessage.chat.id,
                statusMessage.message_id,
                undefined,
                strings.invalidApiKey + apiKey);
        }
    }
}
