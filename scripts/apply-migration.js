// Apply Spring schema migration
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const client = new Client({
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.mefsiztbcwknpoqglwmw',
    password: 'aQgdj6E31B7wVOKI',
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    const migrationPath = path.join(__dirname, '../supabase/migrations/020_spring_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration: 020_spring_schema.sql');
    await client.query(sql);
    console.log('Migration applied successfully!');

  } catch (error) {
    console.error('Migration error:', error.message);
    if (error.message.includes('already exists')) {
      console.log('Tables may already exist. Checking...');
    }
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration();
