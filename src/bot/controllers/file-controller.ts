import d from 'debug';
import filesystem from 'fs';
import path from 'path';
import * as util from '../helpers/get-file-extension';
import { autoConversionReplyMarkup, cancelOperationReplyMarkup } from '../helpers/reply-markup-builder';
import { AutoFileConversion } from '../models/file-conversion';
import Task, { FileTask } from '../models/task';
import TaskContext from '../models/task-context';
import * as cloudconvert from './../models/cloud-convert';
import * as controllerUtils from './controller-utils';
const fs = filesystem.promises;
const debug = d('bot:contr:file');

export async function handleTextMessage(ctx: TaskContext, next: (() => any) | undefined): Promise<void> {
    if (ctx.message !== undefined
        && ctx.state.command !== undefined) {

        const targetFormat = ctx.state.command.command.replace(/_/g, '.');

        // Try to convert file in reply
        const replyFile = await controllerUtils.getFileIdFromReply(ctx);
        if (replyFile !== undefined) {
            await Promise.all([
                convertFile(ctx, replyFile.file_id, targetFormat, replyFile.file_name),
                ctx.db.clearTask(ctx.message.chat),
            ]);
            return;
        }

        // Try to convert file stored by id in db
        const task = (await ctx.db.getTaskInformation(ctx.message.chat)).task;
        if (task?.file_id !== undefined) {
            await Promise.all([
                convertFile(ctx, task.file_id, targetFormat, task.file_name),
                ctx.db.clearTask(ctx.message.chat),
            ]);
            return;
        }

        // No file yet, send instruction to send file
        const update = {
            $set: { task: { target_format: targetFormat } },
        };
        await Promise.all([
            ctx.replyWithHTML(ctx.i18n.t('helpmsgFile') + targetFormat + '!', {
                reply_markup: cancelOperationReplyMarkup(ctx),
            }),
            ctx.db.updateTaskInformation(ctx.message.chat, update),
        ]);
    } else if (next !== undefined) {
        return next();
    }
}

export async function handleDocument(ctx: TaskContext): Promise<void> {
    if (ctx.message !== undefined) {
        const file: { file_id: string, file_name?: string } | undefined
            = ctx.message.audio
            || ctx.message.animation
            || ctx.message.document
            || ctx.message.sticker
            || ctx.message.video
            || ctx.message.voice
            || ctx.message.video_note;
        if (file !== undefined) {
            await handleFile(ctx, file.file_id, file.file_name);
        }
    }
}

export async function handlePhoto(ctx: TaskContext): Promise<void> {
    if (ctx.message?.photo !== undefined
        && ctx.message.photo.length > 0) {
        const file = ctx.message.photo[ctx.message.photo.length - 1];
        await handleFile(ctx, file.file_id);
    }
}

async function handleFile(ctx: TaskContext, fileId: string, fileName?: string): Promise<void> {
    if (ctx.message !== undefined) {
        const task = await ctx.db.getTaskInformation(ctx.message.chat);

        // Do not try to convert file to format specified in reply
        // as this would be counter-intuitive.

        const conversions: Array<Promise<void>> = [];
        // Perform all auto-conversions
        if (task.auto !== undefined) {
            let fileUrl: string;
            try {
                fileUrl = await ctx.telegram.getFileLink(fileId);
            } catch (e) {
                if (e.code === 400) {
                    await ctx.reply(ctx.i18n.t('fileTooBig'));
                } else {
                    d('err')(e);
                    await ctx.reply(ctx.i18n.t('unknownError'));
                }
                return;
            }
            const ext = util.ext(fileUrl);
            conversions.push(
                ...task.auto
                    .filter(c => c.from === ext)
                    .map(c => convertFile(ctx, fileId, c.to, fileName)),
            );
        }

        // Perform one-time conversion
        let performedOneTimeConversion = false;
        if (ctx.state.command !== undefined) {
            // Try to convert file to format specified in caption
            const targetFormat = ctx.state.command.command;
            conversions.push(
                convertFile(ctx, fileId, targetFormat, fileName),
            );
            performedOneTimeConversion = true;
        } else if (task.task?.target_format !== undefined) {
            // Try to convert file to format specified in db
            conversions.push(
                convertFile(ctx, fileId, task.task.target_format, fileName),
            );
            performedOneTimeConversion = true;
        }
        if (performedOneTimeConversion) {
            // Clear the task if any of the two above were performed
            conversions.push(
                ctx.db.clearTask(ctx.message.chat),
            );
        }

        if (conversions.length > 0) {
            await Promise.all(conversions);
        } else if (ctx.message.chat.type === 'private') {
            // No target format yet, list conversion options
            await setSourceFile(ctx, fileId, fileName);
        }
    }
}

export async function setSourceFile(ctx: TaskContext, fileId: string, fileName?: string) {
    if (ctx.message !== undefined) {
        const task: FileTask = { file_id: fileId };
        if (fileName !== undefined) {
            task.file_name = fileName;
        }
        const update = { $set: { task } };
        await Promise.all([
            controllerUtils.printPossibleConversions(ctx, fileId),
            ctx.db.updateTaskInformation(ctx.message.chat, update),
        ]);
    }
}

async function convertFile(ctx: TaskContext, fileId: string, targetFormat: string, fileName?: string): Promise<void> {
    if (ctx.message !== undefined) {

        let fileUrl: string;
        try {
            fileUrl = await ctx.telegram.getFileLink(fileId);
        } catch (e) {
            if (e.code === 400) {
                await ctx.reply(ctx.i18n.t('fileTooBig'));
            } else {
                d('err')(e);
                await ctx.reply(ctx.i18n.t('unknownError'));
            }
            return;
        }

        let task: Partial<Task>;
        let stream: NodeJS.ReadableStream;

        // Get info and convert file, show :thinking_face: in the meantime
        let thinkingMessage;
        [thinkingMessage, task] = await Promise.all([
            ctx.reply(String.fromCodePoint(0x1f914) /* <- thinking face emoji */, {
                reply_to_message_id: ctx.message.message_id,
            }),
            ctx.db.getTaskInformation(ctx.message.chat.id),
        ]);

        fileName = fileName || path.basename(fileUrl);
        const extension = '.' + targetFormat;
        if (!fileName.endsWith(extension)) {
            fileName += extension;
        }

        try {
            stream = await cloudconvert.convertFile(fileUrl, targetFormat, fileName, task.api_key);
        } catch (e) {
            if (e.code === undefined || typeof e.code !== 'number') {
                d('err')(e);
                await ctx.reply(ctx.i18n.t('unknownError'));
            } else {
                await ctx.reply(cloudconvert.describeErrorCode(ctx, e));
            }
            return;
        } finally {
            if (thinkingMessage) {
                ctx.telegram.deleteMessage(ctx.message.chat.id, thinkingMessage.message_id);
            }
        }

        // Upload file, send chat action in the meantime
        ctx.replyWithChatAction('upload_document');
        const handle = setInterval(() => {
            ctx.replyWithChatAction('upload_document');
        }, 5000);
        const sourceFormat = util.ext(fileUrl);
        const conversion: AutoFileConversion = {
            from: sourceFormat,
            to: targetFormat,
            auto: task.auto !== undefined
                && task.auto.some(c => c.from === sourceFormat && c.to === targetFormat),
        };
        try {
            await ctx.replyWithDocument({ source: stream, filename: fileName }, {
                reply_to_message_id: ctx.message.message_id,
                reply_markup: autoConversionReplyMarkup(conversion),
            });
        } catch (e) {
            if (e.code === 400) {
                await ctx.reply(ctx.i18n.t('fileTooBig'));
            } else {
                d('err')(e);
                await ctx.reply(ctx.i18n.t('unknownError'));
            }
            return;
        } finally {
            clearInterval(handle);
        }
        await ctx.db.logConversionPerformed(ctx.message.chat, conversion);
    }
}
