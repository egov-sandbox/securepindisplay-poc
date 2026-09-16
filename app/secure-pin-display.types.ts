export enum SecurePinDisplayEventName {
  Captured = 'captured',
  Interrupted = 'interrupted',
  Masked = 'masked',
  Shown = 'shown',
  Tick = 'tick'
}

export interface SecurePinDisplayEvent {
  event: SecurePinDisplayEventName;
  remainingSeconds?: number;
}

export interface SecurePinDisplayPreparedSession {
  /** RSA-wrapped AES session key (hex) to send to the backend. The plain key stays native. */
  encryptedSessionKeyHex: string;
  /** Opaque handle matching the native key slot. Not a secret. */
  sessionId: string;
}

export interface SecurePinDisplayDigitRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface SecurePinDisplayShowConfig {
  devicePixelRatio: number;
  durationSeconds: number;
  /** ISO-4 encrypted PIN block from the backend (hex). Useless without the native key. */
  encryptedPinBlockHex: string;
  /** ISO-4 PAN block (hex). */
  panBlockHex: string;
  rects: SecurePinDisplayDigitRect[];
  sessionId: string;
}
