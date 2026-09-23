import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env first.');
  process.exit(1);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${cmd}" exited with code ${code}`));
    });
  });
}

async function waitForDatabase(timeoutMs = 60_000) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 2000,
  });
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw new Error(
    `Database did not become ready within ${timeoutMs / 1000}s.` +
      (lastError ? ` Last error: ${lastError.message}` : ''),
  );
}

try {
  await run('docker', ['compose', 'up', '-d', 'db']);
} catch (error) {
  console.warn('Could not start the database container via Docker Compose.');
  console.warn('Assuming Postgres is already running; verifying connection...');
}

await waitForDatabase();
console.log('Database is ready.');