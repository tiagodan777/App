package com.margot.app;

/** HTTP delivery is only a success after the application acknowledges the sample. */
public final class LocationUploadResult {
    public final int status;
    public final boolean accepted, retryable, authorizationExpired, collectionDisabled;
    public LocationUploadResult(int status, boolean success, boolean sampleAccepted) {
        this(status, success, sampleAccepted, "");
    }
    public LocationUploadResult(int status, boolean success, boolean sampleAccepted, String reason) {
        authorizationExpired = status == 401 || "authorization_revoked".equals(reason);
        collectionDisabled = "collection_disabled".equals(reason);
        this.status = status;
        accepted = status >= 200 && status <= 299 && success && sampleAccepted;
        retryable = status == 0 || status == 408 || status == 429 || status >= 500
            || (status >= 200 && status <= 299 && !success);
    }
}
