import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from '@jest/globals';

describe('corridor table stylesheet', () => {
    it('exposes table, scrolling, status and accessible-label rules outside map markers', () => {
        const css = postcss.parse(readFileSync(new URL('../../css/roads.css', import.meta.url), 'utf8'));
        for (const selector of [
            'body[data-page-type="roads"] .corridor-summary', '.corridor-table-scroll',
            '.corridor-table', '.corridor-status-dot', '.corridor-sr-only'
        ]) {
            const matches = [];
            css.walkRules(selector, rule => matches.push(rule));
            expect(matches.length).toBeGreaterThan(0);
            expect(matches.some(rule => rule.parent.type === 'root')).toBe(true);
        }
    });
});
