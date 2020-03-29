import d from 'debug';
import { Middleware } from 'telegraf';
import TaskContext from '../models/task-context';
const debug = d('bot:database');

export default (collection: FirebaseFirestore.CollectionReference): Middleware<TaskContext> =>
    async (ctx, next) => {
        if (next !== undefined) {
            await next();
        }
        if (ctx.performedConversion !== undefined) {
            debug('Conversion performed.', ctx.performedConversion);
            collection.add(ctx.performedConversion);
        }
    };
