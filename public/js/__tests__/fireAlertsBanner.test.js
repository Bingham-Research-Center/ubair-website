import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';

// The fire page's alert banner (issue #404). A hidden banner reads as "no Red Flag Warning",
// so it may be hidden only when the NWS actually said there are none.

const source = readFileSync(new URL('../fire/AlertsBanner.js', import.meta.url), 'utf8');

function browser() {
    const classes = new Set(['red-flag-banner', 'is-hidden']);
    const banner = {
        hidden: true,
        innerHTML: '',
        textContent: '',
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
        },
    };
    const context = vm.createContext({
        window: {},
        document: { getElementById: (id) => (id === 'red-flag-banner' ? banner : null) },
    });
    vm.runInContext(source, context);
    return { banner, classes, render: (alerts) => context.window.renderRedFlagBanner(alerts) };
}

const alert = {
    event: 'Red Flag Warning', areaDesc: 'Eastern Uintah Basin', headline: 'Red Flag Warning until 8 PM',
    description: 'Gusty winds and low humidity.', instruction: 'Avoid outdoor burning.', expires: '2026-07-04T02:00:00Z',
};

describe('fire alert banner', () => {
    it('stays hidden when the NWS reports no alerts', () => {
        const { banner, classes, render } = browser();
        render([]);
        expect(banner.hidden).toBe(true);
        expect(classes.has('is-hidden')).toBe(true);
        expect(classes.has('is-unavailable')).toBe(false);
    });

    it('shows each alert', () => {
        const { banner, classes, render } = browser();
        render([alert]);
        expect(banner.hidden).toBe(false);
        expect(classes.has('is-hidden')).toBe(false);
        expect(banner.innerHTML).toContain('Red Flag Warning');
        expect(banner.innerHTML).toContain('Eastern Uintah Basin');
    });

    it('says the alerts could not be checked when they are null, instead of hiding', () => {
        const { banner, classes, render } = browser();
        render(null);
        expect(banner.hidden).toBe(false);
        expect(classes.has('is-hidden')).toBe(false);
        expect(classes.has('is-unavailable')).toBe(true);
        expect(banner.textContent).toMatch(/could not be checked just now/);
        expect(banner.textContent).toMatch(/weather\.gov/);
    });

    it('goes back to alerts, or to hidden, once the NWS answers again', () => {
        const { banner, classes, render } = browser();
        render(null);
        render([alert]);
        expect(classes.has('is-unavailable')).toBe(false);
        expect(banner.innerHTML).toContain('Red Flag Warning');
        render(null);
        render([]);
        expect(banner.hidden).toBe(true);
        expect(classes.has('is-unavailable')).toBe(false);
    });
});
