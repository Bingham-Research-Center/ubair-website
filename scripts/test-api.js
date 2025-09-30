#!/usr/bin/env node
// Local API Testing Script

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

// Environment variables loaded via NODE_OPTIONS='-r dotenv/config'
const API_KEY = process.env.DATA_UPLOAD_API_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!API_KEY) {
    console.error('❌ ERROR: DATA_UPLOAD_API_KEY not set in .env file');
    console.error('   Copy .env.example to .env and set your API key');
    process.exit(1);
}

// Test data upload
async function testUpload() {
    console.log('🔄 Testing data upload...');
    
    const testData = [
        {
            "stid": "TEST01",
            "variable": "air_temp", 
            "value": 15.5,
            "date_time": new Date().toISOString(),
            "units": "Celsius"
        }
    ];
    
    // Create temporary test file
    const testFile = 'test_obs.json';
    fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));
    
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(testFile));
        
        const response = await fetch(`${BASE_URL}/api/upload/observations`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'x-client-hostname': 'test.chpc.utah.edu'
            },
            body: form
        });
        
        const result = await response.json();
        console.log('✅ Upload result:', result);
        
        // Cleanup
        fs.unlinkSync(testFile);
        
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        fs.unlinkSync(testFile);
    }
}

// Test data fetch
async function testFetch() {
    console.log('🔄 Testing data fetch...');
    
    try {
        const response = await fetch(`${BASE_URL}/api/filelist.json`);
        const files = await response.json();
        console.log('✅ Available files:', files);
        
        if (files.length > 0) {
            const dataResponse = await fetch(`${BASE_URL}/api/static/${files[0]}`);
            const data = await dataResponse.json();
            console.log('✅ Sample data:', data.slice(0, 3));
        }
        
    } catch (error) {
        console.error('❌ Fetch failed:', error.message);
    }
}

// Health check
async function healthCheck() {
    console.log('🔄 Health check...');
    
    try {
        const response = await fetch(`${BASE_URL}/api/health`);
        const result = await response.json();
        console.log('✅ Server health:', result);
        
    } catch (error) {
        console.error('❌ Server not running. Start with: npm run dev');
    }
}

// Run all tests
async function runTests() {
    console.log('🚀 Starting API tests...\n');
    
    await healthCheck();
    await testFetch();
    await testUpload();
    
    console.log('\n✨ Tests complete!');
}

runTests();