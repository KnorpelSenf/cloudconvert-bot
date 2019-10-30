import d from 'debug';
import filesystem from 'fs';
import path from 'path';
import * as strings from '../../strings';
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
        // Solely rely on command as it captures both texts and captions
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
        if (task !== undefined && task.file_id !== undefined) {
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
            ctx.replyWithHTML(strings.helpmsgFile + targetFormat + '!', {
                reply_markup: cancelOperationReplyMarkup,
            }),
            ctx.db.updateTaskInformation(ctx.message.chat, update),
        ]);
    } else if (next !== undefined) {
        return next();
    }
}

export async function handleDocument(ctx: TaskContext): Promise<void> {
    if (ctx.message !== undefined) {
        const file: { file_id: string } | undefined
            = ctx.message.audio
            || ctx.message.animation
            || ctx.message.document
            || ctx.message.sticker
            || ctx.message.video
            || ctx.message.voice
            || ctx.message.video_note;
        const fileName: string | undefined
            = ctx.message.animation !== undefined
                ? ctx.message.animation.file_name
                : ctx.message.document !== undefined
                    ? ctx.message.document.file_name
                    : undefined;
        if (file !== undefined) {
            await handleFile(ctx, file.file_id, fileName);
        }
    }
}

export async function handlePhoto(ctx: TaskContext): Promise<void> {
    if (ctx.message !== undefined
        && ctx.message.photo !== undefined
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
                    await ctx.reply(strings.fileTooBig);
                } else {
                    d('err')(e);
                    await ctx.reply(strings.unknownError);
                }
                return;
            }
            const ext = util.ext(fileUrl);
            conversions.push(...task.auto
                .filter(c => c.from === ext)
                .map(c => convertFile(ctx, fileId, c.to, fileName)));
        }

        // Try to convert file to format specified in db
        if (task.task !== undefined && task.task.target_format !== undefined) {
            conversions.push(
                convertFile(ctx, fileId, task.task.target_format, fileName),
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
                await ctx.reply(strings.fileTooBig);
            } else {
                d('err')(e);
                await ctx.reply(strings.unknownError);
            }
            return;
        }

        let task: Partial<Task>;
        let file: string;

        // Get info and convert file, show :thinking_face: in the meantime
        let thinkingMessage;
        [thinkingMessage, task] = await Promise.all([
            ctx.reply(String.fromCodePoint(0x1f914) /* <- thinking face emoji */, {
                reply_to_message_id: ctx.message.message_id,
            }),
            ctx.db.getTaskInformation(ctx.message.chat.id),
        ]);
        try {
            file = await cloudconvert.convertFile(fileUrl, targetFormat, fileName, task.api_key);
        } catch (e) {
            if (e.code === undefined || typeof e.code !== 'number') {
                d('err')(e);
                await ctx.reply(strings.unknownError);
            } else {
                await ctx.reply(cloudconvert.describeErrorCode(e));
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
            await ctx.replyWithDocument({ source: file }, {
                reply_to_message_id: ctx.message.message_id,
                reply_markup: autoConversionReplyMarkup(conversion),
            });
            const dir = path.dirname(file); // temporary directory of file created for download
            fs.unlink(file).then(() => fs.rmdir(dir));
        } catch (e) {
            if (e.error_code === 400) {
                await ctx.reply(strings.fileTooBig);
            } else {
                d('err')(e);
                await ctx.reply(strings.unknownError);
            }
            return;
        } finally {
            clearInterval(handle);
        }
    }
}
