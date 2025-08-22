# JavaScript Patterns & Common Gotchas

## Overview
This guide helps developers unfamiliar with JavaScript understand the patterns used in this codebase, especially modern JavaScript features and web-specific APIs.

## Array Methods (Functional Programming)

### `.map()` - Transform each element
```javascript
// Python equivalent: [x * 2 for x in numbers]
const doubled = numbers.map(x => x * 2);

// Real example from codebase: Transform station data
const markers = stations.map(station => ({
    lat: station.latitude,
    lon: station.longitude,
    value: station.ozone
}));
```

### `.filter()` - Keep elements that match condition
```javascript
// Python equivalent: [x for x in numbers if x > 5]
const filtered = numbers.filter(x => x > 5);

// Real example: Filter valid observations
const validObs = observations.filter(obs => obs.value !== null);
```

### `.reduce()` - Combine all elements into single value
```javascript
// Python equivalent: sum(numbers) or functools.reduce()
const sum = numbers.reduce((total, num) => total + num, 0);

// Real example: Calculate average
const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
```

### `.forEach()` - Do something with each element (no return)
```javascript
// Python equivalent: for item in items:
items.forEach(item => console.log(item));

// Real example: Add markers to map
stations.forEach(station => {
    L.marker([station.lat, station.lon]).addTo(map);
});
```

### `.find()` - Get first matching element
```javascript
// Python equivalent: next((x for x in items if condition), None)
const found = items.find(item => item.id === 'target');

// Real example: Find station by ID
const station = stations.find(s => s.stid === 'BUNUT');
```

## Async/Await Pattern

### Basic Pattern
```javascript
// Python equivalent: async/await (Python 3.7+)
async function fetchData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed:', error);
    }
}
```

### Common Gotcha: Forgetting await
```javascript
// WRONG - returns Promise, not data
const data = fetch('/api/data');  

// RIGHT - waits for data
const data = await fetch('/api/data');
```

### Parallel Requests
```javascript
// Fetch multiple endpoints simultaneously
const [obs, meta] = await Promise.all([
    fetch('/api/observations').then(r => r.json()),
    fetch('/api/metadata').then(r => r.json())
]);
```

## Spread Operator (`...`)

### Array Spreading
```javascript
// Python equivalent: *args
const arr1 = [1, 2, 3];
const arr2 = [...arr1, 4, 5];  // [1, 2, 3, 4, 5]

// Combining arrays
const combined = [...array1, ...array2];
```

### Object Spreading
```javascript
// Python equivalent: {**dict1, **dict2}
const obj1 = { a: 1, b: 2 };
const obj2 = { ...obj1, c: 3 };  // { a: 1, b: 2, c: 3 }

// Override properties
const updated = { ...oldData, value: newValue };
```

## Destructuring

### Array Destructuring
```javascript
// Python equivalent: a, b = [1, 2]
const [first, second] = [1, 2];

// Skip elements
const [, , third] = [1, 2, 3];  // third = 3
```

### Object Destructuring
```javascript
// Extract properties
const { lat, lon } = station;  // Same as: lat = station.lat; lon = station.lon

// With renaming
const { latitude: lat, longitude: lon } = station;
```

## Arrow Functions

### Basic Syntax
```javascript
// Traditional function
function add(a, b) {
    return a + b;
}

// Arrow function
const add = (a, b) => a + b;

// Single parameter (no parentheses needed)
const double = x => x * 2;

// No parameters
const getRandom = () => Math.random();
```

### Common Gotcha: `this` binding
```javascript
// Arrow functions don't have their own 'this'
element.addEventListener('click', () => {
    this.doSomething();  // 'this' refers to outer scope
});
```

## Template Literals

```javascript
// Python equivalent: f-strings
const name = 'Station';
const id = 'BUNUT';

// Instead of: 'Name: ' + name + ', ID: ' + id
const message = `Name: ${name}, ID: ${id}`;

// Multi-line strings
const html = `
    <div>
        <h1>${title}</h1>
        <p>${content}</p>
    </div>
`;
```

## Optional Chaining (`?.`)

```javascript
// Python equivalent: getattr with default
// Safely access nested properties
const value = data?.station?.temperature;  // undefined if any part is null

// Method calls
const result = obj.method?.();  // Only calls if method exists

// Array access
const first = arr?.[0];  // undefined if arr is null
```

## Nullish Coalescing (`??`)

```javascript
// Python equivalent: value or default (but more precise)
// Only uses default for null/undefined (not 0, '', false)
const port = config.port ?? 3000;

// Different from ||
const value1 = 0 || 5;     // 5 (0 is falsy)
const value2 = 0 ?? 5;     // 0 (0 is not null/undefined)
```

## Common Web APIs

### Fetch API
```javascript
// GET request
const response = await fetch('/api/data');
const data = await response.json();

// POST request
const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
    },
    body: JSON.stringify(data)
});
```

### DOM Manipulation
```javascript
// Get element
const element = document.getElementById('map');
const elements = document.querySelectorAll('.station');

// Modify content
element.innerHTML = '<p>New content</p>';
element.textContent = 'Plain text';

// Add event listener
element.addEventListener('click', (event) => {
    console.log('Clicked:', event.target);
});
```

### Local Storage
```javascript
// Store data (persists after page reload)
localStorage.setItem('apiKey', 'abc123');
const apiKey = localStorage.getItem('apiKey');
localStorage.removeItem('apiKey');

// Store objects (must serialize)
localStorage.setItem('data', JSON.stringify(object));
const object = JSON.parse(localStorage.getItem('data'));
```

## Leaflet Map Patterns

### Initialize Map
```javascript
const map = L.map('mapDiv').setView([40.5, -110.0], 8);

// Add tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
```

### Add Markers
```javascript
// Simple marker
L.marker([lat, lon]).addTo(map);

// Circle marker with style
L.circleMarker([lat, lon], {
    radius: 8,
    fillColor: getColor(value),
    fillOpacity: 0.8
}).addTo(map);

// With popup
L.marker([lat, lon])
    .bindPopup(`<b>${name}</b><br>Value: ${value}`)
    .addTo(map);
```

## Common Gotchas

### 1. Floating Point Precision
```javascript
0.1 + 0.2 === 0.3  // false! (0.30000000000000004)

// Solution: Round or use tolerance
Math.abs((0.1 + 0.2) - 0.3) < 0.0001  // true
```

### 2. Array/Object References
```javascript
const arr1 = [1, 2, 3];
const arr2 = arr1;  // Reference, not copy!
arr2.push(4);        // arr1 is now [1, 2, 3, 4]

// Make actual copy
const arr2 = [...arr1];  // Shallow copy
const arr2 = JSON.parse(JSON.stringify(arr1));  // Deep copy
```

### 3. Truthy/Falsy Values
```javascript
// Falsy values: false, 0, '', null, undefined, NaN
if (value) {  // Fails for 0, empty string
    // ...
}

// Be explicit when needed
if (value !== null && value !== undefined) {
    // ...
}
```

### 4. Async in Loops
```javascript
// WRONG - doesn't wait
array.forEach(async (item) => {
    await processItem(item);  // Doesn't wait!
});

// RIGHT - use for...of
for (const item of array) {
    await processItem(item);  // Waits for each
}

// Or Promise.all for parallel
await Promise.all(array.map(item => processItem(item)));
```

### 5. Date/Time Handling
```javascript
// JavaScript months are 0-based!
new Date(2025, 0, 31);  // January 31, 2025

// Parse ISO string
const date = new Date('2025-01-31T10:30:00Z');

// Format for display
date.toLocaleString('en-US');  // "1/31/2025, 10:30:00 AM"
date.toISOString();            // "2025-01-31T10:30:00.000Z"
```

## Debugging Tips

### Console Methods
```javascript
console.log('Basic output');
console.error('Error message');
console.warn('Warning');
console.table(arrayOfObjects);  // Tabular display
console.time('operation');      // Start timer
console.timeEnd('operation');   // End timer

// Group related logs
console.group('Processing');
console.log('Step 1');
console.log('Step 2');
console.groupEnd();
```

### Browser DevTools
- `debugger;` statement pauses execution
- Network tab shows API calls
- Console for interactive testing
- Sources tab for breakpoints

## Testing Patterns

### Check if Variable Exists
```javascript
// Check if defined
if (typeof variable !== 'undefined') {
    // Use variable
}

// Check if property exists
if ('property' in object) {
    // Use object.property
}

// Check if method exists
if (typeof object.method === 'function') {
    object.method();
}
```

### Type Checking
```javascript
Array.isArray(value)           // Is array?
typeof value === 'string'      // Is string?
typeof value === 'number'      // Is number?
value instanceof Date          // Is Date object?
```

## Module Patterns (ES6)

### Export/Import
```javascript
// Named exports (utils.js)
export const formatDate = (date) => { /* ... */ };
export const parseValue = (val) => { /* ... */ };

// Import named
import { formatDate, parseValue } from './utils.js';

// Default export
export default class DataProcessor { /* ... */ }

// Import default
import DataProcessor from './DataProcessor.js';
```

Remember: This codebase primarily uses script tags and global scope rather than modules, but understanding modules helps with modern JavaScript.