// public/js/utils.js

/**
 * createElement
 * Creates a DOM element with specified attributes and children.
 *
 * @param {string} tag - The HTML tag name.
 * @param {Object} attributes - Key-value pairs of attributes.
 * @param  {...any} children - Child nodes or text content.
 * @returns {HTMLElement} The created DOM element.
 */
export const createElement = (tag, attributes = {}, ...children) => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        // Event listeners (e.g., onClick)
        if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.substring(2).toLowerCase(), value);
        }
        // Styles
        else if (key === 'style') {
            Object.assign(element.style, value);
        }
        // Data attributes
        else if (key === 'dataset') {
            for (const [dataKey, dataValue] of Object.entries(value)) {
                element.dataset[dataKey] = dataValue;
            }
        }
        // Regular attributes
        else {
            element.setAttribute(key, value);
        }
    }
    // Append children
    children.forEach(child => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    });
    return element;
};

export async function loadVariableMapping(path = '/reference/variable_mapping.txt') {
    const mapping = {};
    const res     = await fetch(path);
    const text    = await res.text();
    text.split('\n').forEach(line => {
        line = line.trim().replace(/,$/, '');
        if (!line || line.startsWith('#')) return;
        const [key, val] = line.split(/=(.+)/);
        mapping[key] = val;
    });
    return mapping;
}

export function rawToPretty(key, mapping) {
    return mapping[key] || key;
}

export function prettyToRaw(pretty, mapping) {
    const inv = Object.fromEntries(
        Object.entries(mapping).map(([k,v]) => [v,k])
    );
    return inv[pretty] || pretty;
}

