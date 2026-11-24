// Reading the theme's colour tokens from a script, for drawings that cannot be coloured by a
// stylesheet rule: the forecast map's picture, and marks whose colour is a band of a scale.
//
// Raw colours live only in public/css/theme/tokens.css. A script that needs one asks for the
// token here and gets the numbers back, so a change of theme changes the drawings too.
// Browser only: these need a document to resolve a token against.

import { rampColour } from './mapLayers.js';

const tokenCache = new Map();

/** A colour token ("--color-text") as [r, g, b], or null if the page does not define it. */
export function tokenRgb(token) {
    if (!tokenCache.has(token)) {
        let rgb = null;
        // An undefined token would leave a probe at its inherited colour, which is a colour but
        // not the one asked for: check that the token exists before resolving it.
        if (getComputedStyle(document.documentElement).getPropertyValue(token).trim() !== '') {
            const probe = document.createElement('span');
            probe.hidden = true;
            probe.style.color = `var(${token})`;
            document.body.appendChild(probe);
            const parts = getComputedStyle(probe).color.match(/[\d.]+/g);
            probe.remove();
            if (parts && parts.length >= 3) rgb = parts.slice(0, 3).map(Number);
        }
        tokenCache.set(token, rgb);
    }
    return tokenCache.get(token);
}

const rampCache = new Map();

/**
 * A data-scale ramp's steps as [r, g, b], lightest first: --scale-<name>-1 to -5, or the
 * single --scale-freezing for the neutral band about 32 °F.
 */
export function rampSteps(name) {
    if (!rampCache.has(name)) {
        const tokens = name === 'freezing' ? ['--scale-freezing'] : [1, 2, 3, 4, 5].map((step) => `--scale-${name}-${step}`);
        rampCache.set(name, tokens.map(tokenRgb).filter(Boolean));
    }
    return rampCache.get(name);
}

/** The [r, g, b] of one band's colour (`{ ramp, t }` from mapLayers.js), or null for a clear band. */
export function bandRgb(colour) {
    return colour ? rampColour(rampSteps(colour.ramp), colour.t) : null;
}

/** The CSS colour for an [r, g, b], for a style property, or '' when there is no colour. */
export const cssRgb = (rgb) => (rgb ? `rgb(${rgb.join(', ')})` : '');
