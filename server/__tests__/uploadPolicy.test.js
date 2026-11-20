import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import app from '../server.js';
import {
    DEFAULT_ALLOWED_HOSTS,
    UPLOAD_DATA_TYPES,
    extensionAllowed,
    isAllowedHost,
    isKnownDataType,
    parseAllowedHosts,
} from '../uploadPolicy.js';
import { _resetUploadAttemptsForTests, getRecentUploadAttempts } from '../monitoring/uploadAttempts.js';
import { llmForecastFilename } from '../../public/js/llmForecast.js';

// Who may upload, to which dataTypes, with which files (issue #402). The API key is the
// authentication; the hostname list is a filter that keeps a misconfigured producer out.

describe('dataType list', () => {
    test('holds the seven existing dataTypes and the two new ones', () => {
        expect(UPLOAD_DATA_TYPES).toEqual([
            'observations', 'metadata', 'outlooks', 'llm_outlooks', 'images', 'forecasts',
            'road-forecast', 'llm_forecasts', 'aircraft',
        ]);
    });

    test('knows its own names and nothing else', () => {
        expect(isKnownDataType('observations')).toBe(true);
        expect(isKnownDataType('aircraft')).toBe(true);
        for (const bad of ['adsb', 'Observations', '', '..', '../../views', 'forecasts/..', undefined, null]) {
            expect(isKnownDataType(bad)).toBe(false);
        }
        // Names inherited from Object.prototype are not dataTypes.
        expect(isKnownDataType('constructor')).toBe(false);
        expect(isKnownDataType('__proto__')).toBe(false);
    });
});

describe('allowed hosts', () => {
    test('defaults to the CHPC suffix when the variable is unset or blank', () => {
        expect(DEFAULT_ALLOWED_HOSTS).toBe('.chpc.utah.edu');
        for (const unset of [undefined, null, '', '  ', ',']) {
            const rules = parseAllowedHosts(unset);
            expect(isAllowedHost('notchpeak1.int.chpc.utah.edu', rules)).toBe(true);
            expect(isAllowedHost('hub.example.org', rules)).toBe(false);
        }
    });

    test('a leading dot is a suffix on a label boundary; anything else is an exact name', () => {
        const rules = parseAllowedHosts('.chpc.utah.edu, hub.example.org');
        expect(isAllowedHost('notchpeak1.int.chpc.utah.edu', rules)).toBe(true);
        expect(isAllowedHost('chpc.utah.edu', rules)).toBe(true);
        expect(isAllowedHost('hub.example.org', rules)).toBe(true);
        // The old endsWith('chpc.utah.edu') let this one in.
        expect(isAllowedHost('evilchpc.utah.edu', rules)).toBe(false);
        expect(isAllowedHost('sub.hub.example.org', rules)).toBe(false);
        expect(isAllowedHost('hub.example.org.attacker.net', rules)).toBe(false);
    });

    test('ignores case, a trailing dot and surrounding space; accepts spaces as separators', () => {
        const rules = parseAllowedHosts(' .CHPC.Utah.edu   Hub.Example.org ');
        expect(isAllowedHost('Notchpeak1.CHPC.UTAH.EDU.', rules)).toBe(true);
        expect(isAllowedHost(' hub.example.org ', rules)).toBe(true);
    });

    test('nothing that is not a hostname gets through', () => {
        const rules = parseAllowedHosts('.chpc.utah.edu');
        for (const bad of [undefined, null, '', 42, {}, ['a.chpc.utah.edu'], '.chpc.utah.edu']) {
            expect(isAllowedHost(bad, rules)).toBe(false);
        }
    });

    test('a bare dot or wildcard entry cannot open the list to everyone', () => {
        const rules = parseAllowedHosts('., *, .*, *.chpc.utah.edu');
        expect(isAllowedHost('anything.example.org', rules)).toBe(false);
        // "*.x" is read as the suffix ".x", which is what whoever wrote it meant.
        expect(isAllowedHost('notchpeak1.chpc.utah.edu', rules)).toBe(true);
    });
});

describe('extensions per dataType', () => {
    test('existing dataTypes keep the five extensions they always took', () => {
        for (const ext of ['.json', '.md', '.txt', '.png', '.pdf']) {
            expect(extensionAllowed('forecasts', ext)).toBe(true);
            expect(extensionAllowed('llm_outlooks', ext)).toBe(true);
        }
        expect(extensionAllowed('forecasts', '.html')).toBe(false);
    });

    test('llm_forecasts is JSON only, so a PDF there cannot take over the ozone button', () => {
        expect(extensionAllowed('llm_forecasts', '.json')).toBe(true);
        for (const ext of ['.pdf', '.md', '.png', '.txt']) {
            expect(extensionAllowed('llm_forecasts', ext)).toBe(false);
        }
    });

    test('aircraft takes JSON and PNG', () => {
        expect(extensionAllowed('aircraft', '.json')).toBe(true);
        expect(extensionAllowed('aircraft', '.png')).toBe(true);
        expect(extensionAllowed('aircraft', '.pdf')).toBe(false);
    });
});

describe('upload route', () => {
    const originalCwd = process.cwd();
    const saved = {
        key: process.env.DATA_UPLOAD_API_KEY,
        hosts: process.env.UPLOAD_ALLOWED_HOSTS,
    };
    let root;
    let staticRoot;

    beforeEach(() => {
        // The route resolves public/api/static against the working directory, so a scratch
        // cwd is a scratch box.
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-policy-'));
        staticRoot = path.join(root, 'public', 'api', 'static');
        fs.mkdirSync(path.join(staticRoot, 'observations'), { recursive: true });
        process.chdir(root);
        process.env.DATA_UPLOAD_API_KEY = 'k';
        delete process.env.UPLOAD_ALLOWED_HOSTS;
        _resetUploadAttemptsForTests();
    });

    afterEach(() => {
        process.chdir(originalCwd);
        for (const [name, envName] of [['key', 'DATA_UPLOAD_API_KEY'], ['hosts', 'UPLOAD_ALLOWED_HOSTS']]) {
            if (saved[name] === undefined) delete process.env[envName];
            else process.env[envName] = saved[name];
        }
    });

    const post = (dataType, { host = 'notchpeak1.int.chpc.utah.edu', name = 'probe_20261120_0000Z.json',
        body = '{"ok":true}' } = {}) => {
        const req = request(app).post(`/api/upload/${dataType}`).set('x-api-key', 'k');
        if (host) req.set('x-client-hostname', host);
        return req.attach('file', Buffer.from(body), name);
    };

    // Every file under the scratch box, relative to it.
    const filesWritten = (dir = root) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? filesWritten(full) : [path.relative(root, full)];
    });

    test('CHPC still uploads to an existing dataType', async () => {
        const res = await post('forecasts').expect(200);
        expect(res.body).toMatchObject({ success: true, filename: 'probe_20261120_0000Z.json' });
        expect(fs.existsSync(path.join(staticRoot, 'forecasts', 'probe_20261120_0000Z.json'))).toBe(true);
    });

    test('an unknown host is still 403 and writes nothing', async () => {
        const res = await post('forecasts', { host: 'hub.example.org' }).expect(403);
        expect(res.body.success).toBe(false);
        expect(filesWritten()).toEqual([]);
        expect(getRecentUploadAttempts(1)[0]).toMatchObject({ status: 403, hostname: 'hub.example.org' });
    });

    test('a host named in UPLOAD_ALLOWED_HOSTS is accepted, and CHPC only if it is listed too', async () => {
        process.env.UPLOAD_ALLOWED_HOSTS = 'hub.example.org';
        await post('aircraft', { host: 'hub.example.org', name: 'aircraft_profile_20261120_0000Z.json' }).expect(200);
        await post('forecasts').expect(403);

        process.env.UPLOAD_ALLOWED_HOSTS = '.chpc.utah.edu,hub.example.org';
        await post('forecasts').expect(200);
    });

    test('a lookalike of the CHPC suffix is refused', async () => {
        await post('forecasts', { host: 'evilchpc.utah.edu' }).expect(403);
    });

    test('an unknown dataType is 400, creates no directory and is logged as an attempt', async () => {
        const res = await post('adsb').expect(400);
        expect(res.body.message).toMatch(/Unknown dataType/);
        expect(res.body.supported).toEqual(UPLOAD_DATA_TYPES);
        expect(fs.existsSync(path.join(staticRoot, 'adsb'))).toBe(false);
        expect(getRecentUploadAttempts(1)[0]).toMatchObject({ status: 400, detail: 'unknown dataType' });
    });

    test('a dataType that climbs out of the upload root writes nothing anywhere', async () => {
        // Express decodes %2F inside a route parameter, so this arrives as "../../..": the
        // box's own root, where a file named package.json would replace the real one.
        await post('..%2F..%2F..', { name: 'package.json' }).expect(400);
        await post('forecasts%2F..%2F..%2F..%2F..', { name: 'package.json' }).expect(400);
        expect(filesWritten()).toEqual([]);
    });

    test('the new dataTypes get their own directories', async () => {
        await post('aircraft', { name: 'aircraft_profile_20261120_0000Z.json' }).expect(200);
        expect(fs.existsSync(path.join(staticRoot, 'aircraft', 'aircraft_profile_20261120_0000Z.json'))).toBe(true);
    });

    test('a file type the dataType does not take is 400 and is not left on disk', async () => {
        const res = await post('aircraft', { name: 'report.pdf', body: '%PDF-1.4' }).expect(400);
        expect(res.body.message).toBe('Invalid file type: aircraft takes .json, .png');
        expect(fs.existsSync(path.join(staticRoot, 'aircraft', 'report.pdf'))).toBe(false);
    });

    test('a filename cannot carry a path with it', async () => {
        await post('forecasts', { name: '../../../escaped.json' });
        // Whatever the answer, nothing lands outside the dataType's own directory.
        expect(filesWritten().filter((file) => !file.startsWith(path.join('public', 'api', 'static', 'forecasts'))))
            .toEqual([path.join('public', 'api', 'static', 'observations', 'filelist.json')]);
    });
});

describe('llm_forecasts uploads', () => {
    const originalCwd = process.cwd();
    const savedKey = process.env.DATA_UPLOAD_API_KEY;
    const fixture = JSON.parse(fs.readFileSync(new URL(
        '../../public/js/__tests__/fixtures/llm_forecasts/llm_forecast_ffion_20261203_1210Z.json', import.meta.url
    ), 'utf8'));
    let dir;

    beforeEach(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-llm-'));
        dir = path.join(root, 'public', 'api', 'static', 'llm_forecasts');
        fs.mkdirSync(path.join(root, 'public', 'api', 'static', 'observations'), { recursive: true });
        process.chdir(root);
        process.env.DATA_UPLOAD_API_KEY = 'k';
        delete process.env.UPLOAD_ALLOWED_HOSTS;
        _resetUploadAttemptsForTests();
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (savedKey === undefined) delete process.env.DATA_UPLOAD_API_KEY;
        else process.env.DATA_UPLOAD_API_KEY = savedKey;
    });

    // The sample file, re-issued `minutesAgo` minutes before now so it is not "in the future".
    const run = (minutesAgo, edit = () => {}) => {
        const issuedMs = Math.floor(Date.now() / 60000) * 60000 - minutesAgo * 60000;
        const doc = structuredClone(fixture);
        doc.issued = new Date(issuedMs).toISOString().replace('.000Z', 'Z');
        doc.valid_until = new Date(issuedMs + 12 * 3600000).toISOString().replace('.000Z', 'Z');
        edit(doc);
        return { doc, name: llmForecastFilename('ffion', issuedMs) };
    };

    const post = ({ doc, name }) => request(app).post('/api/upload/llm_forecasts')
        .set('x-api-key', 'k')
        .set('x-client-hostname', 'notchpeak1.int.chpc.utah.edu')
        .attach('file', Buffer.from(JSON.stringify(doc)), name);

    const latest = () => JSON.parse(fs.readFileSync(path.join(dir, 'latest_ffion.json'), 'utf8'));

    test('a file that meets the contract is stored and becomes latest_<persona>.json', async () => {
        const upload = run(5);
        const res = await post(upload).expect(200);
        expect(res.body.path).toBe(`/api/static/llm_forecasts/${upload.name}`);
        expect(fs.readdirSync(dir).sort()).toEqual(['latest_ffion.json', upload.name].sort());
        expect(latest()).toEqual(upload.doc);
    });

    test('a file that breaks the contract is refused with every reason and leaves nothing behind', async () => {
        const upload = run(5, (doc) => {
            doc.placements['home.summary'].public = Array.from({ length: 60 }, () => 'word').join(' ');
            doc.sources = [];
        });
        const res = await post(upload).expect(400);
        expect(res.body).toEqual({
            success: false,
            message: 'The file does not meet the llm_forecast/1 contract',
            errors: [
                '"sources" must list 1 to 30 short strings saying what the text was built from.',
                '"home.summary" public is 60 words; the budget is about 35 and the limit is 53.',
            ],
        });
        expect(fs.readdirSync(dir)).toEqual([]);
        expect(getRecentUploadAttempts(1)[0]).toMatchObject({
            status: 400,
            filename: upload.name,
            detail: 'llm_forecast refused: "sources" must list 1 to 30 short strings saying what the text was built from.',
        });
    });

    test('a refused file does not displace the last good one', async () => {
        const good = run(30);
        await post(good).expect(200);
        await post(run(5, (doc) => { doc.persona = 'gwen'; })).expect(400);
        expect(latest()).toEqual(good.doc);
    });

    test('an older run uploaded late is stored but does not become the latest', async () => {
        const newer = run(5);
        const older = run(365);
        await post(newer).expect(200);
        await post(older).expect(200);
        expect(fs.readdirSync(dir).sort()).toEqual(['latest_ffion.json', newer.name, older.name].sort());
        expect(latest()).toEqual(newer.doc);
    });

    test('a name that does not match the file, or a file issued in the future, is refused', async () => {
        const upload = run(5);
        const wrongName = await post({ doc: upload.doc, name: 'latest_ffion.json' }).expect(400);
        expect(wrongName.body.errors).toEqual(['The filename must look like llm_forecast_<persona>_YYYYMMDD_HHMMZ.json.']);

        const future = await post(run(-120)).expect(400);
        expect(future.body.errors).toEqual(['"issued" is in the future.']);
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('only JSON is taken', async () => {
        const res = await request(app).post('/api/upload/llm_forecasts')
            .set('x-api-key', 'k')
            .set('x-client-hostname', 'notchpeak1.int.chpc.utah.edu')
            .attach('file', Buffer.from('%PDF-1.4'), 'LLM-WX-20261203_1210Z.pdf')
            .expect(400);
        expect(res.body.message).toBe('Invalid file type: llm_forecasts takes .json');
        expect(fs.readdirSync(dir)).toEqual([]);
    });
});
