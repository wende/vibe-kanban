#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const checkMode = process.argv.includes('--check');

console.log(checkMode ? 'Checking SQLx prepared queries...' : 'Preparing database for SQLx...');

const rootDir = path.join(__dirname, '..');
const dbCrateDir = path.join(rootDir, 'crates/db');
const serverCrateDir = path.join(rootDir, 'crates/server');
const rootSqlxDir = path.join(rootDir, '.sqlx');

// Crates that use SQLx with SQLite
const sqliteCrates = [dbCrateDir, serverCrateDir];

// Create temporary database file
const dbFile = path.join(dbCrateDir, 'prepare_db.sqlite');
fs.writeFileSync(dbFile, '');

try {
  // Get absolute path (cross-platform)
  const dbPath = path.resolve(dbFile);
  const databaseUrl = `sqlite:${dbPath}`;

  console.log(`Using database: ${databaseUrl}`);

  // Run migrations from db crate
  console.log('Running migrations...');
  process.chdir(dbCrateDir);
  execSync('cargo sqlx migrate run', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  // Prepare queries for each SQLite crate
  for (const crateDir of sqliteCrates) {
    const crateName = path.basename(crateDir);
    process.chdir(crateDir);

    const sqlxCommand = checkMode ? 'cargo sqlx prepare --check' : 'cargo sqlx prepare';
    console.log(checkMode ? `Checking ${crateName} queries...` : `Preparing ${crateName} queries...`);
    execSync(sqlxCommand, {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl }
    });

    // Copy .sqlx files to workspace root
    if (!checkMode) {
      const crateSqlxDir = path.join(crateDir, '.sqlx');
      if (fs.existsSync(crateSqlxDir)) {
        if (!fs.existsSync(rootSqlxDir)) {
          fs.mkdirSync(rootSqlxDir);
        }
        const files = fs.readdirSync(crateSqlxDir);
        for (const file of files) {
          fs.copyFileSync(
            path.join(crateSqlxDir, file),
            path.join(rootSqlxDir, file)
          );
        }
        console.log(`Copied ${files.length} query files from ${crateName} to workspace root`);
      }
    }
  }

  console.log(checkMode ? 'SQLx check complete!' : 'Database preparation complete!');

} finally {
  // Clean up temporary file
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
  }
}