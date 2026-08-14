#!/usr/bin/env node
/**
 * Outlook authoring helper: generate, validate, publish.
 *
 * Usage:
 *   node scripts/new-outlook.js [YYYYMMDD] [HHMM]   Generate draft
 *   node scripts/new-outlook.js --validate <file>    Validate draft
 *   node scripts/new-outlook.js --publish  <file>    Validate + go live
 */

const fs = require('fs');
const path = require('path');

const OUTLOOKS_DIR = path.join(__dirname, '..', 'public', 'api', 'static', 'outlooks');
const TEMPLATE = path.join(OUTLOOKS_DIR, 'template-2025-2026.md');

const VALID_RISK = [
    'NO RISK OF ELEVATED OZONE',
    'LOW RISK OF ELEVATED OZONE',
    'SOME RISK OF ELEVATED OZONE',
    'MODERATE RISK OF ELEVATED OZONE',
    'HIGH RISK OF ELEVATED OZONE',
];
const VALID_CONFIDENCE = [
    'LOW CONFIDENCE',
    'MEDIUM CONFIDENCE',
    'MODERATE CONFIDENCE',
    'HIGH CONFIDENCE',
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

// ── helpers ──────────────────────────────────────────────────────────

function fmtShort(d) {
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function fmtTime(h, m) {
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}.${String(m).padStart(2, '0')}${ampm}`;
}

function parseFilenameDate(stamp, time) {
    const y = parseInt(stamp.slice(0, 4));
    const mo = parseInt(stamp.slice(4, 6)) - 1;
    const d = parseInt(stamp.slice(6, 8));
    const h = parseInt(time.slice(0, 2));
    const mi = parseInt(time.slice(2, 4));
    return new Date(y, mo, d, h, mi);
}

// ── generate ─────────────────────────────────────────────────────────

function generate(dateStamp, timeStamp) {
    const now = new Date();
    const ds = dateStamp || `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const ts = timeStamp || `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const issued = parseFilenameDate(ds, ts);

    const day0 = new Date(issued.getFullYear(), issued.getMonth(), issued.getDate());
    const ranges = [
        { label: '1–5',   start: day0,            end: addDays(day0, 4)  },
        { label: '6–10',  start: addDays(day0, 5), end: addDays(day0, 9)  },
        { label: '11–15', start: addDays(day0, 10), end: addDays(day0, 14) },
    ];

    const issuedStr = `${fmtTime(issued.getHours(), issued.getMinutes())} Mountain Time, ${issued.getDate()} ${MONTHS_FULL[issued.getMonth()]} ${issued.getFullYear()}`;

    let body = `## Uintah Basin Winter Ozone: **Official Outlook**
### **Two-Week Overview**: [SUMMARY]
Issued: ${issuedStr} 
`;

    for (const r of ranges) {
        body += `
### Day ${r.label} (${fmtShort(r.start)} -- ${fmtShort(r.end)}):
[NO/LOW/SOME/MODERATE/HIGH] RISK OF ELEVATED OZONE

[LOW/MEDIUM/HIGH] CONFIDENCE

[DISCUSSION]
`;
    }

    body += `
----

### Extended discussion

- [EXTENDED DISCUSSION]

---- 

#### Forecasters: [NAMES]

# Further Resources
#### How to reduce emissions
> The Utah Petroleum Association has prepared a great summary of actions that can be taken to reduce emissions, which [you can find here](https://www.usu.edu/binghamresearch/images/latchthehatch.jpg).

#### Resources from **Bingham Research Center**
> If you would like additional information about Uinta Basin air quality, please [contact us](https://www.usu.edu/binghamresearch/contact-us). We have produced a [short fact sheet about ozone in the Uinta Basin](https://www.usu.edu/binghamresearch/files/2-pagehandoutUBairquality.pdf), and you can view [real-time air quality data for the entire Basin here](http://ubair.usu.edu/index.html) and our new [BasinWx forecast website here](https://www.basinwx.com). Finally, [our research group's website](https://www.usu.edu/binghamresearch) has a large number of reports, papers, and other resources to help you understand the issue.

![Bingham Research Center](/api/static/outlooks/UB_01_UStateLeft_Gray.png)
`;

    const outFile = path.join(OUTLOOKS_DIR, `draft_${ds}_${ts}.md`);
    fs.writeFileSync(outFile, body);
    console.log(`✓ Created ${path.basename(outFile)}`);
    console.log(`  Edit it, then: node scripts/new-outlook.cjs --publish ${path.basename(outFile)}`);
}

// ── validate ─────────────────────────────────────────────────────────

function validate(filename) {
    const filepath = path.join(OUTLOOKS_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.error(`✗ File not found: ${filename}`);
        return false;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');
    const errors = [];
    const warnings = [];

    // Check for leftover placeholders
    const placeholders = content.match(/\[[A-Z/ ]{3,}\]/g) || [];
    for (const p of placeholders) {
        errors.push(`Unfilled placeholder: ${p}`);
    }

    // Check issued line
    if (!lines.some(l => /^Issued:\s*.+Mountain Time/i.test(l))) {
        errors.push('Missing or malformed "Issued:" line');
    }

    // Check three day-range sections
    const dayHeaders = lines.filter(l => /^### Day \d+–\d+/.test(l));
    if (dayHeaders.length < 3) {
        errors.push(`Expected 3 day-range sections, found ${dayHeaders.length}`);
    }

    // Check risk lines (one per section)
    const riskLines = lines.filter(l => /RISK OF ELEVATED OZONE/i.test(l.trim()));
    if (riskLines.length < 3) {
        errors.push(`Expected 3 risk lines, found ${riskLines.length}`);
    }
    for (const rl of riskLines) {
        const trimmed = rl.trim();
        if (!VALID_RISK.includes(trimmed)) {
            errors.push(`Invalid risk line: "${trimmed}"`);
        }
    }

    // Check confidence lines
    const confLines = lines.filter(l => /CONFIDENCE\s*$/i.test(l.trim()) && l.trim().length < 30);
    if (confLines.length < 3) {
        errors.push(`Expected 3 confidence lines, found ${confLines.length}`);
    }
    for (const cl of confLines) {
        const trimmed = cl.trim();
        if (!VALID_CONFIDENCE.includes(trimmed)) {
            errors.push(`Invalid confidence line: "${trimmed}"`);
        }
    }

    // Check forecasters
    if (!lines.some(l => /Forecasters:/i.test(l))) {
        warnings.push('No "Forecasters:" line found');
    }

    // Report
    if (warnings.length) {
        for (const w of warnings) console.log(`  ⚠ ${w}`);
    }
    if (errors.length) {
        for (const e of errors) console.log(`  ✗ ${e}`);
        console.log(`\n✗ ${filename}: ${errors.length} error(s)`);
        return false;
    }
    console.log(`✓ ${filename}: valid`);
    return true;
}

// ── publish ──────────────────────────────────────────────────────────

function publish(filename) {
    if (!filename.startsWith('draft_')) {
        console.error(`✗ Expected a draft_ file, got: ${filename}`);
        return;
    }

    if (!validate(filename)) {
        console.error('\n✗ Fix errors before publishing.');
        return;
    }

    const liveFile = filename.replace(/^draft_/, 'outlook_');
    const src = path.join(OUTLOOKS_DIR, filename);
    const dst = path.join(OUTLOOKS_DIR, liveFile);

    if (fs.existsSync(dst)) {
        console.error(`✗ ${liveFile} already exists. Remove it first if you want to overwrite.`);
        return;
    }

    fs.renameSync(src, dst);
    console.log(`✓ Published: ${liveFile}`);
    console.log('  It will appear on basinwx.com within 5 minutes.');
}

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === '--validate') {
    validate(args[1]);
} else if (args[0] === '--publish') {
    publish(args[1]);
} else if (args[0] === '--help' || args[0] === '-h') {
    console.log(`Outlook helper — generate, validate, publish.

  node scripts/new-outlook.cjs [YYYYMMDD] [HHMM]   Create a draft
  node scripts/new-outlook.cjs --validate <file>    Check format
  node scripts/new-outlook.cjs --publish  <file>    Validate + go live
`);
} else {
    generate(args[0], args[1]);
}
