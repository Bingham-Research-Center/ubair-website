#!/usr/bin/env node
/**
 * AI Agent File Validation Script
 * Validates CLAUDE*, GEMINI*, COPILOT*, and other AI context files
 * for consistency, completeness, and accuracy.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Configuration
const AI_FILE_PATTERNS = [
    'CLAUDE*.md',
    'GEMINI*.md', 
    'CODEX*.md',
    'docs/*CLAUDE*.md',
    'references/*COPILOT*.md'
];

const REQUIRED_SECTIONS = [
    'Project Overview',
    'Tech Stack',
    'Team Notes'
];

const STALE_INDICATORS = [
    'TODO:',
    'FIXME:',
    'PLACEHOLDER',
    'coming soon',
    'to be added'
];

// Color codes for output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

class AIFileValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.files = [];
    }

    log(message, color = 'reset') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    error(message) {
        this.errors.push(message);
        this.log(`❌ ERROR: ${message}`, 'red');
    }

    warning(message) {
        this.warnings.push(message);
        this.log(`⚠️  WARNING: ${message}`, 'yellow');
    }

    success(message) {
        this.log(`✅ ${message}`, 'green');
    }

    info(message) {
        this.log(`ℹ️  ${message}`, 'blue');
    }

    /**
     * Find all AI-related files in the repository
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
     * Validate individual file content
     */
    validateFile(filePath) {
        const relativePath = path.relative(rootDir, filePath);
        this.info(`Validating ${relativePath}...`);

        if (!fs.existsSync(filePath)) {
            this.error(`File not found: ${relativePath}`);
            return false;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        let isValid = true;

        // Check file size (too small or too large)
        if (content.length < 100) {
            this.warning(`File ${relativePath} is very short (${content.length} chars). May be incomplete.`);
        }
        if (content.length > 50000) {
            this.warning(`File ${relativePath} is very large (${content.length} chars). Consider breaking it up.`);
        }

        // Check for required sections
        const lines = content.split('\n');
        const headers = lines.filter(line => line.startsWith('#')).map(line => line.replace(/^#+\s*/, ''));
        
        for (const required of REQUIRED_SECTIONS) {
            const found = headers.some(header => 
                header.toLowerCase().includes(required.toLowerCase())
            );
            if (!found) {
                this.warning(`Missing recommended section: "${required}" in ${relativePath}`);
            }
        }

        // Check for stale content
        for (const indicator of STALE_INDICATORS) {
            if (content.toLowerCase().includes(indicator.toLowerCase())) {
                this.warning(`Possible stale content in ${relativePath}: contains "${indicator}"`);
            }
        }

        // Check for sensitive information (but ignore obvious placeholders)
        const sensitivePatterns = [
            /api[_-]?key[_-]?[=:]\s*[a-zA-Z0-9]{20,}/i,  // Real API keys (long alphanumeric)
            /password[_-]?[=:]\s*[^\s"']{8,}/i,           // Real passwords (not placeholder text)
            /secret[_-]?[=:]\s*[a-zA-Z0-9]{16,}/i,        // Real secrets
            /token[_-]?[=:]\s*[a-zA-Z0-9]{20,}/i          // Real tokens
        ];

        const safePlaceholders = [
            'your_token_here',
            'your_key_here', 
            'stored_securely',
            'env_or_file',
            'placeholder',
            'example.com',
            'test-key'
        ];

        for (const pattern of sensitivePatterns) {
            const matches = content.match(pattern);
            if (matches) {
                const match = matches[0];
                const isSafePlaceholder = safePlaceholders.some(placeholder => 
                    match.toLowerCase().includes(placeholder)
                );
                if (!isSafePlaceholder) {
                    this.error(`Potential sensitive information in ${relativePath}: ${match.substring(0, 20)}...`);
                    isValid = false;
                }
            }
        }

        // Check for broken markdown
        const brokenMarkdown = [
            /\[([^\]]+)\]\([^)]*$/m,  // Unclosed links
            /```[^`]*$/m,             // Unclosed code blocks
            /^#{7,}/m                 // Too many header levels
        ];

        for (const pattern of brokenMarkdown) {
            if (pattern.test(content)) {
                this.warning(`Possible markdown syntax issue in ${relativePath}`);
            }
        }

        // Check for outdated technology references
        const outdatedTech = [
            'jquery',
            'bower',
            'gulp',
            'grunt',
            'node.js 12',
            'node.js 14'
        ];

        for (const tech of outdatedTech) {
            if (content.toLowerCase().includes(tech)) {
                this.warning(`Potentially outdated technology reference in ${relativePath}: ${tech}`);
            }
        }

        return isValid;
    }

    /**
     * Cross-validate consistency between files
     */
    validateConsistency() {
        this.info('Checking cross-file consistency...');

        const fileContents = {};
        for (const file of this.files) {
            if (fs.existsSync(file)) {
                fileContents[file] = fs.readFileSync(file, 'utf8');
            }
        }

        // Check for consistent project description
        const projectDescriptions = [];
        for (const [file, content] of Object.entries(fileContents)) {
            const overviewMatch = content.match(/## Project Overview\s*([\s\S]*?)(?=\n##|\n$)/);
            if (overviewMatch) {
                projectDescriptions.push({
                    file: path.relative(rootDir, file),
                    description: overviewMatch[1].trim().substring(0, 200)
                });
            }
        }

        // Check for consistent API endpoint information
        const apiEndpoints = [];
        for (const [file, content] of Object.entries(fileContents)) {
            const apiMatches = content.match(/\/api\/[a-zA-Z0-9\-_\/]+/g);
            if (apiMatches) {
                apiEndpoints.push({
                    file: path.relative(rootDir, file),
                    endpoints: [...new Set(apiMatches)]
                });
            }
        }

        // Validate endpoint consistency
        if (apiEndpoints.length > 1) {
            const allEndpoints = new Set();
            apiEndpoints.forEach(item => {
                item.endpoints.forEach(endpoint => allEndpoints.add(endpoint));
            });

            for (const item of apiEndpoints) {
                const missing = [...allEndpoints].filter(endpoint => 
                    !item.endpoints.includes(endpoint)
                );
                if (missing.length > 0) {
                    this.warning(`File ${item.file} may be missing API endpoints: ${missing.join(', ')}`);
                }
            }
        }
    }

    /**
     * Generate improvement suggestions
     */
    generateSuggestions() {
        this.info('Generating improvement suggestions...');

        const suggestions = [];

        if (this.files.length === 0) {
            suggestions.push('Consider creating CLAUDE.md for better AI agent context');
        }

        if (this.files.length === 1) {
            suggestions.push('Consider creating agent-specific files (GEMINI.md, COPILOT-README.md) for multi-tool teams');
        }

        if (this.warnings.length > 5) {
            suggestions.push('Many warnings detected. Consider a comprehensive review and cleanup');
        }

        if (suggestions.length > 0) {
            this.info('💡 Suggestions:');
            suggestions.forEach(suggestion => {
                this.log(`   • ${suggestion}`, 'blue');
            });
        }
    }

    /**
     * Main validation routine
     */
    async validate() {
        this.log('🚀 Starting AI Agent File Validation...', 'bold');
        
        // Find all AI files
        this.files = this.findAIFiles();
        
        if (this.files.length === 0) {
            this.warning('No AI agent files found. Consider creating CLAUDE.md or other agent context files.');
            return false;
        }

        this.info(`Found ${this.files.length} AI agent files`);

        // Validate each file
        let allValid = true;
        for (const file of this.files) {
            const valid = this.validateFile(file);
            if (!valid) allValid = false;
        }

        // Cross-validate
        this.validateConsistency();

        // Generate suggestions
        this.generateSuggestions();

        // Summary
        this.log('\n📊 Validation Summary:', 'bold');
        this.log(`Files checked: ${this.files.length}`);
        this.log(`Errors: ${this.errors.length}`, this.errors.length > 0 ? 'red' : 'green');
        this.log(`Warnings: ${this.warnings.length}`, this.warnings.length > 0 ? 'yellow' : 'green');

        if (this.errors.length === 0 && this.warnings.length === 0) {
            this.success('🎉 All AI agent files are valid!');
            return true;
        } else if (this.errors.length === 0) {
            this.log('✅ No critical errors found, but please review warnings', 'yellow');
            return true;
        } else {
            this.log('❌ Validation failed. Please fix errors before proceeding', 'red');
            return false;
        }
    }
}

// CLI interface
async function main() {
    const validator = new AIFileValidator();
    const isValid = await validator.validate();
    process.exit(isValid ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Validation script failed:', error);
        process.exit(1);
    });
}

export default AIFileValidator;