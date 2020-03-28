import TaskContext from '../models/task-context';

export async function addedToGroup(ctx: TaskContext): Promise<void> {
    if (ctx.message?.new_chat_members !== undefined
        && ctx.message.new_chat_members.some(user => user.id === ctx.state.bot_info.bot_id)) {
        let apiKey: string | undefined;
        let message = ctx.i18n.t('helpmsgStartGroups');
        if (ctx.message.from !== undefined) {
            const info = await ctx.db.getTaskInformation(ctx.message.from.id);
            apiKey = info.api_key;
            if (apiKey !== undefined) {
                message += '\n\n' + ctx.i18n.t('personalApiKeyInUse');
            }
        }
        await Promise.all([
            ctx.db.registerChat(ctx.message.chat, apiKey),
            ctx.replyWithHTML(message),
        ]);
    }
}

export async function removedFromGroup(ctx: TaskContext): Promise<void> {
    if (ctx.message?.left_chat_member?.id === ctx.state.bot_info.bot_id) {
        await ctx.db.unregisterChat(ctx.message.chat);
    }
}
