// A few helpers for the page's hand-drawn SVG charts. No chart library: each chart is a few
// dozen elements, and drawing them directly keeps them light and lets the stylesheet colour
// them from the theme tokens.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes and children. A null or false child is skipped. */
export function svg(tag, attributes = {}, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
        if (value !== null && value !== undefined && value !== false) el.setAttribute(name, String(value));
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child);
    }
    return el;
}

/** A text element. */
export const svgText = (text, attributes = {}) => svg('text', attributes, String(text));

/** A straight-line map from a data range onto a pixel range. */
export function linear(domainLow, domainHigh, rangeLow, rangeHigh) {
    const span = domainHigh - domainLow;
    return (value) => (span === 0 ? (rangeLow + rangeHigh) / 2 : rangeLow + ((value - domainLow) / span) * (rangeHigh - rangeLow));
}

/** Round numbers from at or below `low` to at or above `high`, `step` apart. */
export function ticksBetween(low, high, step) {
    const first = Math.floor(low / step) * step;
    const last = Math.ceil(high / step) * step;
    const ticks = [];
    for (let tick = first; tick <= last + step / 1e6; tick += step) ticks.push(Number(tick.toFixed(6)));
    return ticks;
}

/**
 * Redraw when the element's width changes (a rotated phone, a resized window), and once now.
 * The charts are drawn at the size they are shown, so their text stays the size of the page's.
 */
export function drawAtWidth(element, draw) {
    let lastWidth = -1;
    const redraw = () => {
        const width = Math.round(element.clientWidth);
        if (width > 0 && width !== lastWidth) {
            lastWidth = width;
            draw(width);
        }
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(redraw).observe(element);
    redraw();
    return () => { lastWidth = -1; redraw(); };
}
