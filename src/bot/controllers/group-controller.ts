import d from 'debug'
import TaskContext from '../models/task-context'
const debug = d('bot:contr:group')

export async function addedToGroup(ctx: TaskContext): Promise<void> {
    if (
        ctx.message?.new_chat_members !== undefined &&
        ctx.message.new_chat_members.some(user => user.id === ctx.botInfo.id)
    ) {
        debug('Added to group')
        let message = ctx.i18n.t('helpmsgStartGroups')
        // Re-use potentially existing API from the user who invited us
        if (ctx.message.from?.id !== undefined) {
            const doc = await ctx.db
                .collection('sessions')
                .doc(ctx.message.from.id.toString())
                .get()
            if (doc.exists) {
                const fromSession = doc.data()
                if (fromSession?.api_key !== undefined) {
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    ;(await ctx.session).api_key = fromSession.api_key
                    message += '\n' + ctx.i18n.t('personalApiKeyInUse')
                }
            }
        }
        await ctx.replyWithHTML(message)
    }
}

export async function removedFromGroup(ctx: TaskContext): Promise<void> {
    if (ctx.message?.left_chat_member?.id === ctx.botInfo.id) {
        debug('Removed from group')
        ctx.session = {}
    }
}
