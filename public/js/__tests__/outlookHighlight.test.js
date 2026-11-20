import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';

// The risk pills and confidence words on the outlook pages. Their colours are tokens set in
// outlooks.css (--risk-*, --status-*); the script only names the class.

const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../outlook-highlight.js', import.meta.url), 'utf8'), context);
const highlight = context.window.highlightRiskWords;

describe('highlightRiskWords', () => {
    it('gives each of the five risk words its own pill class', () => {
        const html = highlight('<p>NO RISK. LOW RISK. SOME RISK. MODERATE RISK. MEDIUM RISK. HIGH RISK.</p>');
        const classes = [...html.matchAll(/class="risk-indicator (risk-[a-z]+)">([A-Z ]+)</g)].map((m) => `${m[1]}: ${m[2]}`);
        expect(classes).toEqual([
            'risk-no: NO RISK', 'risk-low: LOW RISK', 'risk-some: SOME RISK',
            'risk-moderate: MODERATE RISK', 'risk-moderate: MODERATE RISK', 'risk-high: HIGH RISK',
        ]);
    });

    it('marks confidence with a class, not an inline colour', () => {
        const html = highlight('<p>HIGH CONFIDENCE</p><p>Medium confidence</p><p>MODERATE CONFIDENCE</p><p>LOW CONFIDENCE</p>');
        expect([...html.matchAll(/class="outlook-confidence (outlook-confidence-[a-z]+)">([A-Z ]+)</g)].map((m) => `${m[1]}: ${m[2]}`)).toEqual([
            'outlook-confidence-high: HIGH CONFIDENCE', 'outlook-confidence-medium: MEDIUM CONFIDENCE',
            'outlook-confidence-medium: MODERATE CONFIDENCE', 'outlook-confidence-low: LOW CONFIDENCE',
        ]);
        expect(html).not.toMatch(/style=/);
    });

    it('leaves ordinary text alone', () => {
        const text = '<p>Snow gauges on the Basin floor report bare ground.</p>';
        expect(highlight(text)).toBe(text);
    });
});
