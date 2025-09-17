#!/usr/bin/env node
/**
 * Git Pre-commit Hook for AI Agent Files
 * Automatically validates AI context files before commits
 * 
 * To install: npm run install-git-hooks
 * To uninstall: npm run uninstall-git-hooks
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Color codes
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Check if any AI files are being committed
 */
function getAIFilesInCommit() {
    try {
        const output = execSync('git diff --cached --name-only', { 
            encoding: 'utf8',
            cwd: rootDir 
        });
        
        const files = output.split('\n').filter(f => f.trim());
        const aiFiles = files.filter(file => 
            file.match(/(CLAUDE|GEMINI|CODEX|COPILOT).*\.md$/i) ||
            file.includes('AI-AGENT-MANAGEMENT.md') ||
            file.includes('AI-WORKFLOW-CHECKLIST.md')
        );
        
        return aiFiles;
    } catch (error) {
        return [];
    }
}

/**
 * Pre-commit hook implementation
 */
function preCommitHook() {
    log('🔍 Checking for AI agent file changes...', 'blue');
    
    const aiFiles = getAIFilesInCommit();
    
    if (aiFiles.length === 0) {
        log('✅ No AI agent files changed, skipping validation', 'green');
        return true;
    }
    
    log(`📝 Found ${aiFiles.length} AI agent files in commit:`, 'yellow');
    aiFiles.forEach(file => log(`   • ${file}`));
    
    log('\n🚀 Running AI file validation...', 'blue');
    
    try {
        execSync('npm run validate-ai-files', { 
            stdio: 'inherit',
            cwd: rootDir 
        });
        
        log('\n✅ AI file validation passed!', 'green');
        log('💡 Tip: Run "npm run test-ai-context" to verify AI understanding', 'blue');
        return true;
        
    } catch (error) {
        log('\n❌ AI file validation failed!', 'red');
        log('🔧 Please fix validation errors before committing', 'yellow');
        log('   Run: npm run validate-ai-files', 'yellow');
        return false;
    }
}

/**
 * Install git hooks
 */
function installHooks() {
    const gitHooksDir = path.join(rootDir, '.git', 'hooks');
    const preCommitHookPath = path.join(gitHooksDir, 'pre-commit');
    
    if (!fs.existsSync(gitHooksDir)) {
        log('❌ Not a git repository or .git/hooks directory not found', 'red');
        return false;
    }
    
    const hookScript = `#!/bin/sh
# AI Agent File Validation Hook
node scripts/git-hook-ai-validation.js
`;
    
    try {
        fs.writeFileSync(preCommitHookPath, hookScript, { mode: 0o755 });
        log('✅ Git pre-commit hook installed successfully!', 'green');
        log('🔧 AI files will be automatically validated before commits', 'blue');
        return true;
    } catch (error) {
        log(`❌ Failed to install git hook: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Uninstall git hooks
 */
function uninstallHooks() {
    const preCommitHookPath = path.join(rootDir, '.git', 'hooks', 'pre-commit');
    
    if (!fs.existsSync(preCommitHookPath)) {
        log('ℹ️  No pre-commit hook found to remove', 'blue');
        return true;
    }
    
    try {
        fs.unlinkSync(preCommitHookPath);
        log('✅ Git pre-commit hook removed successfully!', 'green');
        return true;
    } catch (error) {
        log(`❌ Failed to remove git hook: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Main function
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'install':
            return installHooks() ? 0 : 1;
            
        case 'uninstall':
            return uninstallHooks() ? 0 : 1;
            
        case 'test':
            log('🧪 Testing pre-commit hook...', 'blue');
            return preCommitHook() ? 0 : 1;
            
        default:
            // Default behavior - run as pre-commit hook
            return preCommitHook() ? 0 : 1;
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const exitCode = main();
    process.exit(exitCode);
}