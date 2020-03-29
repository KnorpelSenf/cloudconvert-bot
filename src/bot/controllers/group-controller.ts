import TaskContext from '../models/task-context';

export async function addedToGroup(ctx: TaskContext): Promise<void> {
    if (ctx.message?.new_chat_members !== undefined
        && ctx.message.new_chat_members.some(user => user.id === ctx.bot_info.bot_id)) {
        await ctx.replyWithHTML(ctx.i18n.t('helpmsgStartGroups'));
    }
}

export async function removedFromGroup(ctx: TaskContext): Promise<void> {
    if (ctx.message?.left_chat_member?.id === ctx.bot_info.bot_id) {
        ctx.session = {};
    }
}
