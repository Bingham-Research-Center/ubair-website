#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Generate a secure random API key
function generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

// Save API key to a secure file
function saveApiKey(key, keyName = 'data_upload') {
    const keyFile = path.join(process.cwd(), 'server', 'keys', `${keyName}.key`);

    // Create directory if it doesn't exist
    const keyDir = path.dirname(keyFile);
    if (!fs.existsSync(keyDir)) {
        fs.mkdirSync(keyDir, { recursive: true });
    }

    // Write key to file with restricted permissions
    fs.writeFileSync(keyFile, key, { mode: 0o600 });
    console.log(`API key saved to: ${keyFile}`);
    console.log(`API key: ${key}`);

    return keyFile;
}

// Main function
function main() {
    const keyName = process.argv[2] || 'data_upload';
    const apiKey = generateApiKey();

    console.log('Generating new API key...');
    saveApiKey(apiKey, keyName);

    console.log('\nNext steps:');
    console.log('1. Add this key to your server environment variables');
    console.log('2. Share the key securely with your CHPC server');
    console.log('3. Never commit this key to version control!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}