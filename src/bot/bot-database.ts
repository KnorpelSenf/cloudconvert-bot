import { MongoClient } from 'mongodb';

export default class BotDatabase {
    
    private db: MongoClient;
    
    constructor(dbUrl: string) {
        this.db = new MongoClient(dbUrl, { useNewUrlParser: true });
    }
    
    connect() {
        throw new Error("Method not implemented.");
    }
}