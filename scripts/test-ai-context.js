#!/usr/bin/env node
/**
 * Practical Unit Test for AI Agent Files
 * Tests whether AI agents can correctly understand the current context
 * by checking their responses to standard queries.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Color codes for output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

class AIContextTester {
    constructor() {
        this.tests = [];
        this.results = [];
    }

    log(message, color = 'reset') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    /**
     * Define test scenarios for AI agent understanding
     */
    defineTests() {
        this.tests = [
            {
                name: 'Project Understanding',
                description: 'AI should understand this is a weather/air quality website',
                testPrompt: 'What is the main purpose of this project?',
                expectedKeywords: ['weather', 'air quality', 'uintah basin', 'monitoring'],
                section: 'Project Overview'
            },
            {
                name: 'Tech Stack Knowledge',
                description: 'AI should know the core technologies used',
                testPrompt: 'What are the main technologies used in this project?',
                expectedKeywords: ['node.js', 'express', 'leaflet', 'plotly', 'javascript'],
                section: 'Tech Stack'
            },
            {
                name: 'API Endpoints',
                description: 'AI should know about the API structure',
                testPrompt: 'What API endpoints are available?',
                expectedKeywords: ['/api/upload', '/api/static', '/api/live-observations'],
                section: 'API Endpoints'
            },
            {
                name: 'Data Pipeline',
                description: 'AI should understand the data flow',
                testPrompt: 'How does data flow from CHPC to the website?',
                expectedKeywords: ['chpc', 'post', 'upload', 'json', 'synoptic'],
                section: 'Data Pipeline'
            },
            {
                name: 'File Structure',
                description: 'AI should understand the file organization',
                testPrompt: 'How are the frontend files organized?',
                expectedKeywords: ['public', 'css', 'js', 'html', 'views'],
                section: 'File Structure'
            }
        ];
    }

    /**
     * Analyze AI context files for test coverage
     */
    analyzeContextFiles() {
        const aiFiles = this.findAIFiles();
        const contextCoverage = {};

        for (const file of aiFiles) {
            const content = fs.readFileSync(file, 'utf8').toLowerCase();
            const relativePath = path.relative(rootDir, file);
            contextCoverage[relativePath] = {};

            for (const test of this.tests) {
                const hasKeywords = test.expectedKeywords.some(keyword => 
                    content.includes(keyword.toLowerCase())
                );
                
                const hasSection = content.includes(test.section.toLowerCase());
                
                contextCoverage[relativePath][test.name] = {
                    hasKeywords,
                    hasSection,
                    coverage: hasKeywords && hasSection ? 'good' : hasKeywords ? 'partial' : 'missing'
                };
            }
        }

        return contextCoverage;
    }

    /**
     * Find AI agent files
     */
    findAIFiles() {
        const files = [];
        
        // Check root level
        const rootFiles = fs.readdirSync(rootDir);
        for (const file of rootFiles) {
            if (file.match(/^(CLAUDE|GEMINI|CODEX).*\.md$/i)) {
                files.push(path.join(rootDir, file));
            }
        }

        // Check docs directory
        const docsDir = path.join(rootDir, 'docs');
        if (fs.existsSync(docsDir)) {
            const docFiles = fs.readdirSync(docsDir);
            for (const file of docFiles) {
                if (file.match(/(CLAUDE|GEMINI|CODEX).*\.md$/i)) {
                    files.push(path.join(docsDir, file));
                }
            }
        }

        // Check references directory
        const referencesDir = path.join(rootDir, 'references');
        if (fs.existsSync(referencesDir)) {
            const refFiles = fs.readdirSync(referencesDir);
            for (const file of refFiles) {
                if (file.match(/(COPILOT|CLAUDE|GEMINI|CODEX).*\.md$/i)) {
                    files.push(path.join(referencesDir, file));
                }
            }
        }

        return files;
    }

    /**
     * Run the practical tests
     */
    runTests() {
        this.log('🧪 Running Practical AI Context Tests...', 'bold');
        this.log('');

        this.defineTests();
        const coverage = this.analyzeContextFiles();

        // Display coverage analysis
        this.log('📊 Context Coverage Analysis:', 'blue');
        this.log('');

        for (const [file, testResults] of Object.entries(coverage)) {
            this.log(`📄 ${file}:`, 'yellow');
            
            for (const [testName, result] of Object.entries(testResults)) {
                const icon = result.coverage === 'good' ? '✅' : 
                           result.coverage === 'partial' ? '⚠️' : '❌';
                this.log(`   ${icon} ${testName}: ${result.coverage}`);
            }
            this.log('');
        }

        // Generate test instructions
        this.generateTestInstructions();

        // Summary
        this.generateSummary(coverage);
    }

    /**
     * Generate instructions for manual AI testing
     */
    generateTestInstructions() {
        this.log('📋 Manual AI Agent Testing Instructions:', 'bold');
        this.log('');
        this.log('To verify AI agent understanding, ask your AI tool the following questions:');
        this.log('');

        for (let i = 0; i < this.tests.length; i++) {
            const test = this.tests[i];
            this.log(`${i + 1}. ${test.name}`, 'green');
            this.log(`   Question: "${test.testPrompt}"`);
            this.log(`   Expected keywords: ${test.expectedKeywords.join(', ')}`);
            this.log(`   ✅ Pass if: AI mentions most keywords and shows understanding`);
            this.log(`   ❌ Fail if: AI gives vague/incorrect response or misses key concepts`);
            this.log('');
        }

        this.log('💡 Pro Tips:', 'blue');
        this.log('   • Test with a fresh AI session (no prior context)');
        this.log('   • Ask follow-up questions to test depth of understanding');
        this.log('   • If AI fails a test, check if the context file needs updating');
        this.log('   • Run this after making significant changes to AI context files');
        this.log('');
    }

    /**
     * Generate summary report
     */
    generateSummary(coverage) {
        this.log('📈 Summary Report:', 'bold');
        this.log('');

        const fileCount = Object.keys(coverage).length;
        let totalTests = 0;
        let goodCoverage = 0;
        let partialCoverage = 0;
        let missingCoverage = 0;

        for (const fileResults of Object.values(coverage)) {
            for (const result of Object.values(fileResults)) {
                totalTests++;
                if (result.coverage === 'good') goodCoverage++;
                else if (result.coverage === 'partial') partialCoverage++;
                else missingCoverage++;
            }
        }

        this.log(`Files analyzed: ${fileCount}`);
        this.log(`Total test scenarios: ${totalTests}`);
        this.log(`Good coverage: ${goodCoverage} (${Math.round(goodCoverage/totalTests*100)}%)`, 'green');
        this.log(`Partial coverage: ${partialCoverage} (${Math.round(partialCoverage/totalTests*100)}%)`, 'yellow');
        this.log(`Missing coverage: ${missingCoverage} (${Math.round(missingCoverage/totalTests*100)}%)`, 'red');
        this.log('');

        // Recommendations
        if (missingCoverage > totalTests * 0.3) {
            this.log('⚠️  HIGH PRIORITY: Many test scenarios have missing coverage', 'red');
            this.log('   Consider updating AI context files with missing information');
        } else if (partialCoverage > totalTests * 0.4) {
            this.log('📝 MEDIUM PRIORITY: Several test scenarios need better coverage', 'yellow');
            this.log('   Review context files and add missing keywords/sections');
        } else {
            this.log('✅ GOOD: Most test scenarios have adequate coverage', 'green');
            this.log('   AI agents should perform well with current context');
        }

        this.log('');
        this.log('🚀 Next steps:');
        this.log('   1. Run manual tests with your AI agent');
        this.log('   2. Update context files based on test results');
        this.log('   3. Re-run this analysis after updates');
        this.log('   4. Add this to your team workflow before major releases');
    }
}

// CLI interface
async function main() {
    const tester = new AIContextTester();
    tester.runTests();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Test script failed:', error);
        process.exit(1);
    });
}

export default AIContextTester;