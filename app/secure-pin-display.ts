import { Injectable, NgZone, inject } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Observable } from 'rxjs';
import {
  SecurePinDisplayEvent,
  SecurePinDisplayEventName,
  SecurePinDisplayPreparedSession,
  SecurePinDisplayShowConfig
} from '../types/secure-pin-display';

export interface SecurePinDisplayPlugin {
  clearSession(success: () => void, failure: (error: unknown) => void): void;

  hide(success: () => void, failure: (error: unknown) => void): void;

  prepareSession(
    success: (session: SecurePinDisplayPreparedSession) => void,
    failure: (error: unknown) => void,
    config: { worldlineKeyBase64: string }
  ): void;

  show(
    success: (event: SecurePinDisplayEvent) => void,
    failure: (error: unknown) => void,
    config: SecurePinDisplayShowConfig
  ): void;
}

declare const SecurePinDisplay: SecurePinDisplayPlugin;

@Injectable({
  providedIn: 'root'
})
export class SecurePinDisplayProvider {
  private _active = false;
  private _platform = inject(Platform);
  private _zone = inject(NgZone);

  public get isSupported(): boolean {
    return this._platform.is('hybrid');
  }

  /** Wipes the native session key (call when signing is cancelled or fails). */
  public clearSession(): Promise<void> {
    if (!this.isSupported) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      SecurePinDisplay.clearSession(
        () => resolve(),
        (error) => reject(error)
      );
    });
  }

  public hide(): Promise<void> {
    if (!this.isSupported || !this._active) {
      return Promise.resolve();
    }

    this._active = false;

    return new Promise((resolve, reject) => {
      SecurePinDisplay.hide(
        () => resolve(),
        (error) => reject(error)
      );
    });
  }

  /**
   * R5/R13: the AES session key is generated and kept in NATIVE memory. JS only ever
   * receives the RSA-wrapped blob (for the backend request) and an opaque sessionId.
   */
  public prepareSession(
    worldlineKeyBase64: string
  ): Promise<SecurePinDisplayPreparedSession> {
    if (!this.isSupported) {
      return Promise.reject(new Error('SECURE_PIN_DISPLAY_UNSUPPORTED'));
    }
    if (!worldlineKeyBase64) {
      // T1: never fall back to an empty key.
      return Promise.reject(new Error('MISSING_WORLDLINE_KEY'));
    }
    return new Promise((resolve, reject) => {
      SecurePinDisplay.prepareSession(
        (session) => resolve(session),
        (error) => reject(error),
        { worldlineKeyBase64 }
      );
    });
  }

  /**
   * Shows the PIN in a native secure overlay. The plaintext PIN never exists in JS:
   * the native side decrypts the ISO-4 block itself using the session key it kept.
   * Emits 'shown', then 'tick' once per second, then a terminal
   * 'masked' | 'interrupted' | 'captured' event which completes the observable.
   */
  public show(
    config: SecurePinDisplayShowConfig
  ): Observable<SecurePinDisplayEvent> {
    return new Observable((subscriber) => {
      if (!this.isSupported) {
        // T2: fail loudly in browser/dev instead of completing silently.
        subscriber.error(new Error('SECURE_PIN_DISPLAY_UNSUPPORTED'));
        return;
      }

      this._active = true;

      // Native callbacks fire outside Angular's zone; re-enter it so change detection runs.
      SecurePinDisplay.show(
        (event) => {
          this._zone.run(() => {
            subscriber.next(event);
            if (
              event.event !== SecurePinDisplayEventName.Shown &&
              event.event !== SecurePinDisplayEventName.Tick
            ) {
              this._active = false;
              subscriber.complete();
            }
          });
        },
        (error) => {
          this._zone.run(() => {
            this._active = false;
            subscriber.error(error);
          });
        },
        config
      );

      return () => {
        this.hide();
      };
    });
  }
}
