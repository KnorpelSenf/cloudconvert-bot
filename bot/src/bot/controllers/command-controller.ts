import { ProcessData } from 'cloudconvert'
import d from 'debug'
import treeify from 'treeify'
import * as htmlUtils from '../helpers/html-escaper'
import { selectLanguageReplyMarkup } from '../helpers/reply-markup-builder'
import * as cloudconvert from '../models/cloud-convert'
import TaskContext from '../models/task-context'
import * as controllerUtils from './apikey-controller'
import * as utils from './controller-utils'
import * as files from './file-controller'
const debug = d('bot:contr:command')

// We always check the ctx.command property because it does better filtering,
// i.e. it is only set if the command is actually meant for us (our middleware does this)

export async function start(ctx: TaskContext): Promise<void> {
    if (ctx.chat !== undefined && ctx.command?.command === 'start') {
        debug('/start')
        const response =
            ctx.chat.type === 'private'
                ? ctx.i18n.t('helpmsgStartPrivate')
                : ctx.i18n.t('helpmsgStartGroups')
        await ctx.replyWithHTML(response)
        await ctx.db.collection('userstats').doc(ctx.chat.id.toString()).set({
            type: ctx.chat.type,
        })
    }
}

export async function help(ctx: TaskContext): Promise<void> {
    debug('/help')
    if (ctx.chat !== undefined && ctx.command?.command === 'help') {
        const response =
            ctx.chat.type === 'private'
                ? ctx.i18n.t('helpmsgPrivate')
                : ctx.i18n.t('helpmsgGroups')
        await ctx.replyWithHTML(response)
    }
}

export async function reset(ctx: TaskContext): Promise<void> {
    debug('/reset')
    if (ctx.chat !== undefined && ctx.command?.command === 'reset') {
        ctx.session = {}
        await ctx.reply(ctx.i18n.t('reset'))
    }
}

export async function cancel(ctx: TaskContext): Promise<void> {
    debug('/cancel')
    if (ctx.chat !== undefined && ctx.command?.command === 'cancel') {
        delete (await ctx.session).task
        await ctx.reply(ctx.i18n.t('operationCancelled'))
    }
}

export async function balance(ctx: TaskContext): Promise<void> {
    debug('/balance')
    if (ctx.chat !== undefined && ctx.command?.command === 'balance') {
        const minutes = await cloudconvert.getBalance(
            (await ctx.session).api_key
        )
        await ctx.replyWithHTML(
            ctx.i18n.t('remainingConversions') +
                ': <b>' +
                minutes +
                '</b>\n\n' +
                ctx.i18n.t('customApiKeyInstruction')
        )
    }
}

export async function contribute(ctx: TaskContext): Promise<void> {
    debug('/contribute')
    if (
        ctx.chat !== undefined &&
        (ctx.command?.command === 'contribute' ||
            ctx.command?.command === 'the_more_the_merrier')
    ) {
        const session = await ctx.session
        const response =
            session.api_key === undefined
                ? ctx.i18n.t('helpmsgSetUpAccount')
                : ctx.i18n.t('helpmsgBalanceWithApiKey') +
                  '\n<pre>' +
                  session.api_key +
                  '</pre>\n\n' +
                  ctx.i18n.t('helpmsgBuyMinutes')
        await ctx.replyWithHTML(response)
    }
}

export async function feedback(ctx: TaskContext): Promise<void> {
    debug('/feedback')
    if (ctx.command?.command === 'feedback') {
        await ctx.replyWithHTML(ctx.i18n.t('helpmsgFeedback'))
    }
}

export async function limitations(ctx: TaskContext): Promise<void> {
    debug('/limitations')
    if (ctx.command?.command === 'limitations') {
        await ctx.replyWithHTML(ctx.i18n.t('helpmsgLimitations'))
    }
}

export async function apiKey(ctx: TaskContext): Promise<void> {
    debug('/apikey')
    if (ctx.message !== undefined && ctx.command?.command === 'apikey') {
        if (ctx.command?.args?.[0] !== undefined) {
            const key = ctx.command.args[0]
            await controllerUtils.receivedApiKey(ctx, key)
        } else {
            await ctx.replyWithHTML(ctx.i18n.t('sendApiKey'), {
                // eslint-disable-next-line @typescript-eslint/camelcase
                reply_to_message_id: ctx.message.message_id,
                // eslint-disable-next-line @typescript-eslint/camelcase
                reply_markup: { force_reply: true, selective: true },
            })
        }
    }
}

export async function language(ctx: TaskContext): Promise<void> {
    debug('/language')
    if (ctx.message !== undefined && ctx.command?.command === 'language') {
        await ctx.replyWithHTML(ctx.i18n.t('pickLanguage'), {
            // eslint-disable-next-line @typescript-eslint/camelcase
            reply_markup: selectLanguageReplyMarkup(ctx),
            // eslint-disable-next-line @typescript-eslint/camelcase
            disable_web_page_preview: true,
        })
    }
}

export async function info(ctx: TaskContext): Promise<void> {
    debug('/info')
    if (ctx.command?.command === 'info') {
        const file = await utils.getFileIdFromReply(
            ctx,
            ctx.i18n.t('helpmsgInfo')
        )
        if (ctx.message !== undefined && file !== undefined) {
            let fileInfo: ProcessData | undefined
            let url: string
            try {
                url = await ctx.telegram.getFileLink(file.file_id)
            } catch (e) {
                if (e.code === 400) {
                    await ctx.reply(ctx.i18n.t('fileTooBig'))
                } else {
                    d('err')(e)
                    await ctx.reply(ctx.i18n.t('unknownError'))
                }
                return
            }
            try {
                fileInfo = await cloudconvert.getFileInfo(
                    url,
                    (await ctx.session).api_key
                )
            } catch (e) {
                if (e.code === undefined || typeof e.code !== 'number') {
                    d('err')(e)
                    await ctx.reply(ctx.i18n.t('unknownError'))
                } else {
                    await ctx.reply(cloudconvert.describeErrorCode(ctx, e))
                }
                return
            }

            let msg: string
            if (fileInfo?.info !== undefined) {
                const tree = treeify.asTree(fileInfo.info, true, true)
                // WHY THE FUCK ARE THERE NULL CHARACTERS IN THIS STRING?!
                const clean = tree.replace(/\0/g, '')
                const escaped = htmlUtils.escapeHtmlTags(clean)
                msg = ctx.i18n.t('fileInfo') + '\n<pre>' + escaped + '</pre>'
            } else {
                msg = ctx.i18n.t('noFileInfo')
            }

            await ctx.replyWithHTML(msg, {
                // eslint-disable-next-line @typescript-eslint/camelcase
                reply_to_message_id: ctx.message.message_id,
            })
        }
    }
}

export async function convert(ctx: TaskContext): Promise<void> {
    debug('/convert')
    if (ctx.command?.command === 'convert') {
        const file = await utils.getFileIdFromReply(
            ctx,
            ctx.i18n.t('helpmsgConvert')
        )
        if (file !== undefined) {
            await files.setSourceFile(ctx, file.file_id)
        }
    }
}
