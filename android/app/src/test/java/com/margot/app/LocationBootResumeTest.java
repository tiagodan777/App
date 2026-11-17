package com.margot.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class LocationBootResumeTest {
    @Test public void bootWithLocationOffRequestsUserRecoveryInsteadOfStartingForbiddenService() {
        assertEquals(LocationResumeReceiver.NOTIFY, LocationResumeReceiver.bootAction(true, true, false));
    }

    @Test public void eligibleBootWithLocationOnStillStartsImmediately() {
        assertEquals(LocationResumeReceiver.START, LocationResumeReceiver.bootAction(true, true, true));
    }

    @Test public void stoppedHiddenRevokedOrSuspendedSharingDoesNotCreateRecoveryNotifications() {
        // hasPendingResume is false when sharing was stopped, hidden, revoked or suspended.
        assertEquals(LocationResumeReceiver.IGNORE, LocationResumeReceiver.bootAction(false, true, false));
        assertEquals(LocationResumeReceiver.IGNORE, LocationResumeReceiver.bootAction(false, true, true));
    }

    @Test public void bootNeverTreatsForegroundPermissionAsBackgroundAuthorization() {
        assertEquals(LocationResumeReceiver.IGNORE, LocationResumeReceiver.bootAction(true, false, true));
        assertEquals(LocationResumeReceiver.IGNORE, LocationResumeReceiver.bootAction(true, false, false));
    }
}
