/**
 * Retry utility with exponential backoff for resilient API calls
 * Implements the architecture best practice from the UDOT caching proxy document
 */

/**
 * Executes an async function with retry logic and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds (default: 10000)
 * @param {Function} options.shouldRetry - Function to determine if error should trigger retry
 * @param {string} options.operationName - Name of operation for logging
 * @returns {Promise<any>} Result from successful function execution
 * @throws {Error} Last error if all retries exhausted
 */
export async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelayMs = 1000,
        maxDelayMs = 10000,
        shouldRetry = () => true,
        operationName = 'API call'
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Execute the function
            const result = await fn();

            // Success - log if this wasn't the first attempt
            if (attempt > 0) {
                console.log(`✓ ${operationName} succeeded on attempt ${attempt + 1}/${maxRetries + 1}`);
            }

            return result;
        } catch (error) {
            lastError = error;

            // Check if we should retry this error
            if (!shouldRetry(error)) {
                console.error(`✗ ${operationName} failed with non-retryable error:`, error.message);
                throw error;
            }

            // If this was the last attempt, throw the error
            if (attempt === maxRetries) {
                console.error(`✗ ${operationName} failed after ${maxRetries + 1} attempts:`, error.message);
                throw error;
            }

            // Calculate delay with exponential backoff: delay = initialDelay * 2^attempt
            const delayMs = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);

            console.warn(
                `⚠ ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}. ` +
                `Retrying in ${delayMs}ms...`
            );

            // Wait before next attempt
            await sleep(delayMs);
        }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError;
}

/**
 * Sleep helper function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Default shouldRetry function for HTTP errors
 * Retries on network errors and 5xx server errors, but not on 4xx client errors
 * @param {Error} error - Error object from fetch or axios
 * @returns {boolean} Whether the error should trigger a retry
 */
export function shouldRetryHttpError(error) {
    // Network errors (no response received)
    if (!error.response && !error.status) {
        return true;
    }

    // HTTP status codes
    const status = error.response?.status || error.status;

    if (!status) return true; // Unknown error, retry

    // Don't retry client errors (4xx) except 429 (rate limit)
    if (status >= 400 && status < 500) {
        return status === 429; // Only retry on rate limit
    }

    // Retry on server errors (5xx)
    if (status >= 500) {
        return true;
    }

    // Default: don't retry
    return false;
}

/**
 * Wrapper for fetch() with retry logic
 * @param {string} url - URL to fetch
 * @param {Object} fetchOptions - Options to pass to fetch()
 * @param {Object} retryOptions - Options for retry logic
 * @returns {Promise<Response>} Response object
 */
export async function fetchWithRetry(url, fetchOptions = {}, retryOptions = {}) {
    return retryWithBackoff(
        async () => {
            const response = await fetch(url, fetchOptions);

            // Check if response is OK (status 200-299)
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                error.response = response;
                throw error;
            }

            return response;
        },
        {
            shouldRetry: shouldRetryHttpError,
            operationName: `Fetch ${url}`,
            ...retryOptions
        }
    );
}
