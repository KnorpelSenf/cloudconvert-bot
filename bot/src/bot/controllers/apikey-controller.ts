import d from 'debug'
import * as htmlUtils from '../helpers/html-escaper'
import * as cloudconvert from '../models/cloud-convert'
import TaskContext from '../models/task-context'
const debug = d('bot:contr:apikey')

export async function receivedApiKey(
    ctx: TaskContext,
    apiKey: string
): Promise<void> {
    debug('New key')
    if (ctx.message !== undefined && apiKey.length > 0) {
        const statusMessage = await ctx.reply(ctx.i18n.t('validatingApiKey'), {
            // eslint-disable-next-line @typescript-eslint/camelcase
            reply_to_message_id: ctx.message.message_id,
        })
        const username = await cloudconvert.validateApiKey(apiKey)
        const valid = username !== undefined
        if (valid) {
            // eslint-disable-next-line @typescript-eslint/camelcase
            ;(await ctx.session).api_key = apiKey
            await ctx.telegram.editMessageText(
                statusMessage.chat.id,
                statusMessage.message_id,
                undefined,
                '<b>' + username + '</b>\n' + ctx.i18n.t('apiKeyProvided'),
                {
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    reply_to_message_id: ctx.message.message_id,
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    parse_mode: 'HTML',
                }
            )
        } else {
            await ctx.telegram.editMessageText(
                statusMessage.chat.id,
                statusMessage.message_id,
                undefined,
                ctx.i18n.t('invalidApiKey') + htmlUtils.escapeHtmlTags(apiKey),
                {
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    reply_to_message_id: ctx.message.message_id,
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    parse_mode: 'HTML',
                }
            )
        }
    }
}

export async function handleTextMessage(
    ctx: TaskContext,
    next: (() => any) | undefined
): Promise<void> {
    if (
        ctx?.message?.text !== undefined &&
        ctx.message?.reply_to_message?.from?.id === ctx.botInfo.id &&
        ctx.message.reply_to_message?.text === ctx.i18n.t('sendApiKey')
    ) {
        debug('Handle API key')

        let apiKey = ctx.message.text

        // In the unlikely case that the user responds with /apikey before sending the actual API key
        if (apiKey.startsWith('/apikey')) {
            apiKey = apiKey.substring(7).trim()
            if (apiKey.startsWith('@') && ctx.botInfo.username !== undefined) {
                apiKey = apiKey
                    .substring(ctx.botInfo.username.length + 1)
                    .trim()
            }
        }

        await receivedApiKey(ctx, apiKey)
    } else if (next !== undefined) {
        return next()
    }
}
