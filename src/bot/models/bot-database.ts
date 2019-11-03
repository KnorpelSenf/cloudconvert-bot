import d from 'debug';
import { Collection, Db, MongoClient, UpdateWriteOpResult } from 'mongodb';
import { AutoFileConversion } from './file-conversion';
import Task from './task';
import { ApiKeyManager, ChatKey, ChatManager, TaskManager } from './task-context';
const debug = d('bot:database');

interface ChatFilter {
    _id: number;
}

export default class BotDatabase implements TaskManager, ChatManager, ApiKeyManager {

    private readonly dbName = 'cloudconvert-bot';
    private readonly mongo: MongoClient;

    private db?: Db;

    public constructor(dbUrl: string) {
        this.mongo = new MongoClient(dbUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    }

    public async connect() {
        await this.mongo.connect();
        this.db = this.mongo.db(this.dbName);
        const count = await this.db.collection('tasks').countDocuments();
        debug(count + ' tasks in database at startup.');
    }

    public async registerChat(chat: ChatKey): Promise<void> {
        const key = this.toDatabaseKey(chat);
        const collection = this.getCollection('tasks');
        await collection.deleteOne(key);
        await collection.insertOne({ _id: typeof chat === 'number' ? chat : chat.id });
    }

    public async unregisterChat(chat: ChatKey): Promise<void> {
        const key = this.toDatabaseKey(chat);
        const collection = this.getCollection('tasks');
        await collection.deleteOne(key);
    }

    public async saveApiKey(chat: ChatKey, apiKey: string): Promise<void> {
        const key = this.toDatabaseKey(chat);
        const update = { api_key: apiKey };
        await this.getCollection('tasks').updateOne(key, { $set: update });
    }

    public async getKey(chat: ChatKey): Promise<string | undefined> {
        return (await this.getTaskInformation(chat)).api_key;
    }

    public async getTaskInformation(chat: ChatKey): Promise<Partial<Task>> {
        const key = this.toDatabaseKey(chat);
        const collection = this.getCollection('tasks');
        const task: Partial<Task> = await collection.findOne(key) || {};
        if (typeof chat !== 'number') {
            task.chat = chat;
        }
        return task;
    }

    public async updateTaskInformation(chat: ChatKey, update: any): Promise<UpdateWriteOpResult> {
        const key = this.toDatabaseKey(chat);
        const collection = this.getCollection('tasks');
        return await collection.updateOne(key, update);
    }

    public async clearTask(chat: ChatKey): Promise<void> {
        const key = this.toDatabaseKey(chat);
        const update = { $unset: { task: '' } };
        await this.getCollection('tasks').updateOne(key, update);
    }

    public async logConversionPerformed(chat: ChatKey, conversion: AutoFileConversion): Promise<void> {
        const collection = this.getCollection('stats');
        await collection.insertOne({
            chat_id: this.toDatabaseKey(chat),
            conversion,
            completed: new Date(),
        });
    }

    private toDatabaseKey(chat: ChatKey): ChatFilter {
        return { _id: typeof chat === 'number' ? chat : chat.id };
    }

    private getCollection(name: string): Collection<any> {
        if (this.db === undefined) {
            throw new Error('Database not connected!');
        }
        return this.db.collection(name);
    }
}
