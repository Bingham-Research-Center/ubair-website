import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { PERSONAS } from '../../public/js/llmForecast.js';

// GET /api/llm-forecasts/latest: the newest LLM forecast file from each persona, in one answer.
//
// The pages that can show LLM text ask this on every load. Until a producer has sent a file,
// which is the state of both sites today, the honest answer is "none yet", and that is an
// ordinary 200 with a null in it. Asking for latest_<persona>.json directly would be a 404 in
// every visitor's console for a file that was never promised to exist.
//
// The files are passed through as stored: the upload route checked them against the
// llm_forecast/1 contract when they arrived, and the page applies the stale and mismatch
// guards (public/js/llmForecast.js) to whatever it is given.

const router = express.Router();

const latestPath = (persona) => path.resolve(process.cwd(), 'public', 'api', 'static', 'llm_forecasts', `latest_${persona}.json`);

async function readLatest(persona) {
    try {
        return JSON.parse(await fs.readFile(latestPath(persona), 'utf8'));
    } catch (error) {
        // No file yet is the normal case. Anything else is worth one line in the log, and the
        // page still gets "none": a block that cannot be read is not drawn.
        if (error.code !== 'ENOENT') console.warn(`llm forecasts: latest_${persona}.json could not be read (${error.message})`);
        return null;
    }
}

router.get('/llm-forecasts/latest', async (req, res) => {
    const personas = Object.keys(PERSONAS);
    const docs = await Promise.all(personas.map(readLatest));
    res.set('Cache-Control', 'no-store').json({
        status: 'ok',
        files: Object.fromEntries(personas.map((persona, i) => [persona, docs[i]])),
    });
});

export default router;
