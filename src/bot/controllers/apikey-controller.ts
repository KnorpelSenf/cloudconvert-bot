import d from 'debug';
import * as htmlUtils from '../helpers/html-escaper';
import * as cloudconvert from '../models/cloud-convert';
import TaskContext from '../models/task-context';
const debug = d('bot:contr:apikey');

export async function handleTextMessage(ctx: TaskContext, next: (() => any) | undefined): Promise<void> {
    if (ctx?.message?.text !== undefined
        && ctx.message?.reply_to_message?.from?.id === ctx.bot_info.bot_id
        && ctx.message.reply_to_message?.text === ctx.i18n.t('sendApiKey')) {
        debug('Handle API key');

        let apiKey = ctx.message.text;

        // In the unlikely case that the user responds with /apikey before sending the actual API key
        if (apiKey.startsWith('/apikey')) {
            apiKey = apiKey.substring(7).trim();
            if (apiKey.startsWith('@')) {
                apiKey = apiKey.substring(ctx.bot_info.bot_name.length + 1).trim();
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
        const statusMessage = await ctx.reply(ctx.i18n.t('validatingApiKey'), {
            reply_to_message_id: ctx.message.message_id,
        });
        debug(statusMessage);
        debug('Validating');
        const username = await cloudconvert.validateApiKey(apiKey);
        debug(username);
        const valid = username !== undefined;
        if (valid) {
            debug('Saving key');
            ctx.session.api_key = apiKey;
            debug('Editing message to success');
            await ctx.telegram.editMessageText(statusMessage.chat.id,
                statusMessage.message_id,
                undefined,
                '<b>' + username + '</b>\n' + ctx.i18n.t('apiKeyProvided'), {
                reply_to_message_id: ctx.message.message_id,
                parse_mode: 'HTML',
            });
            debug('Done.');
        } else {
            debug('Editing message to failure.');
            await ctx.telegram.editMessageText(statusMessage.chat.id,
                statusMessage.message_id,
                undefined,
                ctx.i18n.t('invalidApiKey') + htmlUtils.escapeHtmlTags(apiKey), {
                reply_to_message_id: ctx.message.message_id,
                parse_mode: 'HTML',
            });
        }
    }
}
