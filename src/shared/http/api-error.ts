export interface ApiError {
  code:
    | 'INVALID_REQUEST'
    | 'UNAUTHENTICATED'
    | 'PAYLOAD_TOO_LARGE'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'RATE_LIMITED'
    | 'SERVICE_UNAVAILABLE'
    | 'INTERNAL_ERROR'
    | 'EMAIL_ALREADY_REGISTERED'
    | 'INVALID_CREDENTIALS'
    | 'SUMMARY_CONFLICT'
    | 'STALE_SUMMARY_GENERATION'
    | 'INVALID_SUMMARY_GENERATION';
  message: string;
  details?: { current_summary_generation: number };
}
