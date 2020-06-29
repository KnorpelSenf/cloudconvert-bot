import d from 'debug'
import path from 'path'
import * as util from '../helpers/get-file-extension'
import {
    autoConversionReplyMarkup,
    cancelOperationReplyMarkup,
} from '../helpers/reply-markup-builder'
import { AutoFileConversion } from '../models/file-conversion'
import TaskContext from '../models/task-context'
import * as cloudconvert from './../models/cloud-convert'
import * as controllerUtils from './controller-utils'
const debug = d('bot:contr:file')

async function convertFile(
    ctx: TaskContext,
    fileId: string,
    targetFormat: string,
    fileName?: string
): Promise<void> {
    debug('Converting file to ', targetFormat, fileId, targetFormat)
    if (ctx.message !== undefined) {
        let fileUrl: string
        try {
            fileUrl = await ctx.telegram.getFileLink(fileId)
        } catch (e) {
            if (e.code === 400) {
                await ctx.reply(ctx.i18n.t('fileTooBig'))
            } else {
                d('err')(e)
                await ctx.reply(ctx.i18n.t('unknownError'))
            }
            return
        }

        // Get info and convert file, show :thinking_face: in the meantime
        const thinkingMessage = await ctx.reply(
            String.fromCodePoint(0x1f914) /* <- thinking face emoji */,
            {
                // eslint-disable-next-line @typescript-eslint/camelcase
                reply_to_message_id: ctx.message.message_id,
            }
        )

        fileName = fileName || path.basename(fileUrl)
        const extension = '.' + targetFormat
        if (!fileName.endsWith(extension)) {
            fileName += extension
        }

        const session = await ctx.session

        let stream: NodeJS.ReadableStream
        try {
            stream = await cloudconvert.convertFile(
                fileUrl,
                targetFormat,
                fileName,
                session.api_key
            )
        } catch (e) {
            if (e.code === undefined || typeof e.code !== 'number') {
                d('err')(e)
                await ctx.reply(ctx.i18n.t('unknownError'))
            } else {
                await ctx.reply(cloudconvert.describeErrorCode(ctx, e))
            }
            return
        } finally {
            if (thinkingMessage) {
                ctx.telegram.deleteMessage(
                    ctx.message.chat.id,
                    thinkingMessage.message_id
                )
            }
        }

        // Upload file, send chat action in the meantime
        ctx.replyWithChatAction('upload_document')
        const handle = setInterval(() => {
            ctx.replyWithChatAction('upload_document')
        }, 5000)
        const sourceFormat = util.ext(fileUrl)
        const conversion: AutoFileConversion = {
            from: sourceFormat,
            to: targetFormat,
            auto:
                session.auto !== undefined &&
                session.auto.some(
                    c => c.from === sourceFormat && c.to === targetFormat
                ),
        }
        try {
            await ctx.replyWithDocument(
                { source: stream, filename: fileName },
                {
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    reply_to_message_id: ctx.message.message_id,
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    reply_markup: autoConversionReplyMarkup(ctx, conversion),
                }
            )
        } catch (e) {
            if (e.code === 413) {
                await ctx.reply(ctx.i18n.t('resultFileTooBig'))
            } else {
                d('err')(e)
                await ctx.reply(ctx.i18n.t('unknownError'))
            }
            return
        } finally {
            clearInterval(handle)
        }
        ctx.db.collection('stats').add({
            ...conversion,
            // eslint-disable-next-line @typescript-eslint/camelcase
            chat_id: ctx.message.chat.id,
            date: new Date(),
        })
    }
}

export async function setSourceFile(
    ctx: TaskContext,
    fileId: string,
    fileName?: string
): Promise<void> {
    if (ctx.message !== undefined) {
        const session = await ctx.session
        // eslint-disable-next-line @typescript-eslint/camelcase
        session.task = { file_id: fileId }
        if (fileName !== undefined) {
            // eslint-disable-next-line @typescript-eslint/camelcase
            session.task.file_name = fileName
        }
        await controllerUtils.printPossibleConversions(ctx, fileId)
    }
}

async function handleFile(
    ctx: TaskContext,
    fileId: string,
    fileName?: string
): Promise<void> {
    if (ctx.message !== undefined) {
        // Do not try to convert file to format specified in reply
        // as this would be counter-intuitive.

        const session = await ctx.session

        const conversions: Array<Promise<void>> = []
        // Perform all auto-conversions
        if (session.auto !== undefined && session.auto.length > 0) {
            let fileUrl: string
            try {
                fileUrl = await ctx.telegram.getFileLink(fileId)
            } catch (e) {
                if (e.code === 400) {
                    await ctx.reply(ctx.i18n.t('fileTooBig'))
                } else {
                    d('err')(e)
                    await ctx.reply(ctx.i18n.t('unknownError'))
                }
                return
            }
            const ext = util.ext(fileUrl)
            conversions.push(
                ...session.auto
                    .filter(c => c.from === ext)
                    .map(c => convertFile(ctx, fileId, c.to, fileName))
            )
        }

        // Perform one-time conversion
        let performedOneTimeConversion = false
        if (ctx.command !== undefined) {
            // Try to convert file to format specified in caption
            const targetFormat = ctx.command.command
            conversions.push(convertFile(ctx, fileId, targetFormat, fileName))
            performedOneTimeConversion = true
        } else if (session.task?.target_format !== undefined) {
            // Try to convert file to format specified in db
            conversions.push(
                convertFile(ctx, fileId, session.task.target_format, fileName)
            )
            performedOneTimeConversion = true
        }
        if (performedOneTimeConversion) {
            // Clear the task if any of the two above were performed
            delete session.task
        }

        if (conversions.length > 0) {
            await Promise.all(conversions)
        } else if (ctx.message.chat.type === 'private') {
            // No target format yet, list conversion options
            await setSourceFile(ctx, fileId, fileName)
        }
    }
}

export async function handleTextMessage(
    ctx: TaskContext,
    next: (() => any) | undefined
): Promise<void> {
    if (ctx.message !== undefined && ctx.command !== undefined) {
        const session = await ctx.session

        const targetFormat = ctx.command.command.replace(/_/g, '.')

        // Try to convert file in reply
        const replyFile = await controllerUtils.getFileIdFromReply(ctx)
        if (replyFile !== undefined) {
            await convertFile(
                ctx,
                replyFile.file_id,
                targetFormat,
                replyFile.file_name
            )
            delete session.task
            return
        }

        // Try to convert file stored by id in db
        if (session.task?.file_id !== undefined) {
            await convertFile(
                ctx,
                session.task.file_id,
                targetFormat,
                session.task.file_name
            )
            delete session.task
            return
        }

        // No file yet, send instruction to send file
        // eslint-disable-next-line @typescript-eslint/camelcase
        session.task = { target_format: targetFormat }
        await ctx.replyWithHTML(
            ctx.i18n.t('helpmsgFile') + targetFormat + '!',
            {
                // eslint-disable-next-line @typescript-eslint/camelcase
                reply_markup: cancelOperationReplyMarkup(ctx),
            }
        )
    } else if (next !== undefined) {
        return next()
    }
}

export async function handleDocument(ctx: TaskContext): Promise<void> {
    if (ctx.message !== undefined) {
        const file: { file_id: string; file_name?: string } | undefined =
            ctx.message.audio ||
            ctx.message.animation ||
            ctx.message.document ||
            ctx.message.sticker ||
            ctx.message.video ||
            ctx.message.voice ||
            ctx.message.video_note
        if (file !== undefined) {
            await handleFile(ctx, file.file_id, file.file_name)
        }
    }
}

export async function handlePhoto(ctx: TaskContext): Promise<void> {
    if (ctx.message?.photo !== undefined && ctx.message.photo.length > 0) {
        const file = ctx.message.photo[ctx.message.photo.length - 1]
        await handleFile(ctx, file.file_id)
    }
}
