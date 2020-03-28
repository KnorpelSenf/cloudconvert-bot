import d from 'debug';
import TaskContext from '../models/task-context';
const debug = d('bot:contr:cb');

export async function help(ctx: TaskContext) {
    if (ctx.message?.chat.type === 'private') {
        const message = (await ctx.db.getTaskInformation(ctx.message.chat)).api_key === undefined
            ? ctx.i18n.t('helpmsgTextKeySuggestion')
            : ctx.i18n.t('helpmsgText');
        await ctx.reply(message);
    }
}
