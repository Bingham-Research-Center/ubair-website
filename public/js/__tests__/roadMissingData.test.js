import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../roads/utils.js', import.meta.url), 'utf8'), context);
const average = vm.runInContext('averageReportedTemperature', context);

describe('route temperature summaries', () => {
    it('shows unavailable when no station reports a temperature', () => {
        expect(average([])).toBe('--');
        expect(average([{ airTemperature: null }, {}, { airTemperature: 'Unknown' }])).toBe('--');
    });

    it('excludes missing readings and keeps actual zero readings', () => {
        expect(average([{ airTemperature: '40' }, {}])).toBe(40);
        expect(average([{ airTemperature: '40' }, { airTemperature: 0 }])).toBe(20);
    });
});
