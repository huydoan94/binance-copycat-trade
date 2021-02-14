import { Pool as DbClient } from 'pg';

const dbUrl = process.env.DATABASE_URL;

const dbClient = new DbClient({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

export default dbClient;
