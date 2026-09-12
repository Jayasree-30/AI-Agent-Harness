// Shared configuration for the project.
// Centralize env var names, defaults, and resilience settings so
// consumers stay consistent and behavior is easy to audit.

export const LLM_API_KEY_ENV = "LLM_API_KEY";
export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

/** Max time (ms) to wait for a single LLM API call before timing out. */
export const LLM_TIMEOUT_MS = 30_000;
/** Number of automatic retries for transient LLM failures. */
export const LLM_MAX_RETRIES = 2;
/** Delay (ms) between retries, doubled after each attempt (exponential back-off). */
export const LLM_RETRY_BASE_DELAY_MS = 1_000;

