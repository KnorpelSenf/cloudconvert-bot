import d from 'debug'
import TaskContext from '../models/task-context'
const debug = d('bot:contr:cb')

export async function help(ctx: TaskContext): Promise<void> {
    debug('Fallback! Sending generic help message.')
    if (ctx.message?.chat.type === 'private') {
        const message =
            (await ctx.session).api_key === undefined
                ? ctx.i18n.t('helpmsgTextKeySuggestion')
                : ctx.i18n.t('helpmsgText')
        await ctx.reply(message)
    }
}
