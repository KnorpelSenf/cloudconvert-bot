import d from 'debug'
import { Middleware } from 'telegraf'
import TaskContext from '../models/task-context'
const debug = d('bot:mw:cargs')

// Loosely based on https://larsgraubner.com/telegraf-middleware-command-arguments/
export default (): Middleware<TaskContext> => (ctx, next) => {
    if (
        ctx.updateType === 'message' &&
        ctx.message !== undefined &&
        ((ctx.message.text !== undefined && ctx.message.text.startsWith('/')) ||
            (ctx.message.caption !== undefined &&
                ctx.message.caption.startsWith('/')))
    ) {
        const raw =
            ctx.message.text ||
            ctx.message.caption ||
            'this will never happen, but if it does, it will not match the regex'
        const match = raw.match(/^\/([^\s]+)\s?([\s\S]+)?/)
        if (match !== null) {
            // Require @ notation in groups, supergroups and channels
            if (
                ctx.message.chat.type === 'private' ||
                (match[1].includes('@') &&
                    match[1].split('@', 2)[1] === ctx.botInfo.username)
            ) {
                const command: string = match[1]
                    ? match[1].includes('@')
                        ? match[1].split('@', 2)[0]
                        : match[1]
                    : ''
                const args: string[] = match[2]
                    ? match[2].split(/\s/).filter(arg => !!arg)
                    : []
                ctx.command = { raw, command, args }
                debug(ctx.command)
            }
        }
    }
    if (next !== undefined) {
        return next()
    }
}
