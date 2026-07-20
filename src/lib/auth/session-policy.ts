/**
 * NFR-04: session timeout and re-authentication after prolonged inactivity.
 * No specific duration is specified in the source requirements, so these are
 * a reasonable default for an internal work tool — tune here if the business
 * wants a different policy.
 */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8h — expires this long after last activity
export const SESSION_UPDATE_AGE_SECONDS = 15 * 60; // 15m — how often activity extends the session
