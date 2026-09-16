# SecurePinDisplay v1.1 - Integration guide

Drop-in remediation package for the MyBank BE secure PIN display feature.
Closes R5 (plaintext PIN in JS), R13 (session key in store) and most of R11c
(memory wipe) by moving all secret custody into the native plugin.

## What is in this package

| Path | Replaces (v1.0) | Change |
|---|---|---|
| plugin/plugin.xml | plugin.xml | Honest description, engine pins, Security.framework (iOS) |
| plugin/www/securePinDisplay.js | SecurePinDisplay.js | 4-action API: prepareSession / show / hide / clearSession |
| plugin/src/android/SecurePinDisplay.java | SecurePinDisplay.java | Native key gen + RSA wrap, native ISO-4 decrypt, wiping |
| plugin/src/ios/SecurePinDisplay.h / .m | .h / .m | Same, plus 5 iOS bug/gap fixes (args, secure-layer error, timer mode, initial isCaptured, iOS 26 seam) |
| app/secure-pin-display.ts | secure-pin-display.ts | Provider with the 4 actions, fail-fast |
| app/secure-pin-display.types.ts | types file | PreparedSession + encrypted-only ShowConfig |
| app/cards-dashboard.service.ts | same name | Native prepareSession, sessionId only in state |
| app/cards-dashboard.store.ts | same name | pinDisplaySessionKeyHex REMOVED |
| app/show-pin.modal.ts | same name | Encrypted blocks to show(), R12 seam, clearSession on all exits |

DELETE from the app repo: `pin-block.util.ts` (and its export in public-api.ts).
The aes-js dependency can be removed if nothing else uses it.

## MUST verify before merge (marked TODO(SEC) in the sources)

1. RSA padding for the session-key wrap: PKCS1 assumed in Java
   (`RSA/ECB/PKCS1Padding`) and iOS (`kSecKeyAlgorithmRSAEncryptionPKCS1`).
   Must match byte-for-byte what the deleted session-key.util.ts produced,
   or the backend/Worldline cannot unwrap the key. Switch to OAEP-SHA256 in
   BOTH platforms if that is the contract.
2. Worldline public key wire format: base64 SPKI DER assumed. Adapt the
   decoding on both platforms if the config delivers PEM or modulus/exponent.
3. Wire the R12 integrity gate in show-pin.modal.ts (marked seam) to the
   existing raspbinder / jailbreak-detection API. Merge-blocking.
4. One-line template change (not in this package): add
   [scrollY]="!pinVisible" on the ion-content of show-pin.modal.html.

## Suggested test cases (map to the R-table)

- prepareSession twice: second call invalidates the first slot.
- show with wrong/expired sessionId -> SESSION_INVALID, nothing rendered.
- Tampered pinBlock -> DECRYPT_FAILED, no partial digits.
- iOS: start a screen recording BEFORE tapping Show -> CAPTURE_ACTIVE.
- iOS: simulate nil secure canvas -> SECURE_LAYER_UNAVAILABLE, no "shown".
- Background the app mid-reveal -> interrupted, snapshot shows dots.
- Pen-test (R15): cordova/exec hook and JS heap read must find no PIN
  and no plain key.
