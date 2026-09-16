import {
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
  inject
} from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Alert, Loader } from '@mbbe/core';
import { SecurePinDisplayProvider } from '@mbbe/core/native/public-api';
import { SecurePinDisplayEventName } from '@mbbe/core/native/types/public-api';
import { SummaryService } from '@mbbe/shared/diy/pages/summary/summary.service';
import { ChallengeTypes, PageNames, SignInService } from '@mbbe/shared/signing';
import { Subscription } from 'rxjs';
import { RiskAssessmentStatusCode } from 'src/app/features/transfers/constants/challenge-codes';
import { CardsDashboardStore } from '../../cards-dashboard.store';
import { CardCategory } from '../../constants/card-category';
import { CardAuthResponseDto } from '../../dto/card-authorization.dto';
import { CardSettingsViewModel } from '../../models/card-settings.model';
import { ShowPinViewModel } from '../../models/show-pin.model';
import { CardsDashboardService } from '../../services/cards-dashboard.service';

// NOTE (R5): pin-block.util.ts has been DELETED. The ISO-4 decryption is performed by
// the SecurePinDisplay native plugin; the plaintext PIN never exists in JS.

@Component({
  selector: 'mbbe-page-cards-dashboard-show-pin',
  templateUrl: './show-pin.modal.html',
  styleUrls: ['./show-pin.modal.scss']
})
export class ShowPinModal implements OnDestroy {
  @ViewChildren('pinBox') public pinBoxes!: QueryList<ElementRef<HTMLElement>>;

  public cardImageStyle: { [key: string]: boolean } = {};
  public cardSettings: CardSettingsViewModel;
  public isPinDisplayActive: boolean = false;
  public pinDigits: string[] = ['', '', '', ''];
  public pinVisible: boolean = false;
  public remainingSeconds: number = 0;
  public showPinViewModel: ShowPinViewModel;

  private _alert = inject(Alert);
  private _loader = inject(Loader);
  private _modal = inject(ModalController);
  private _requestSubscription: Subscription | undefined;
  private _revealSubscription: Subscription | undefined;
  private _securePinDisplay = inject(SecurePinDisplayProvider);
  private _service = inject(CardsDashboardService);
  private _signService = inject(SignInService);
  private _store = inject(CardsDashboardStore);
  private _summaryService = inject(SummaryService);

  constructor() {
    this.cardSettings = new CardSettingsViewModel(
      this._store.state.selectedCard
    );
    this.showPinViewModel = new ShowPinViewModel(
      this._store.state.cardsConfiguration
    );
    this.cardImageStyle = {
      'mb-show-pin__vertical-card':
        this._store.state.selectedCard?.cardType === CardCategory.DebitCard
    };
  }

  public close(): void {
    this._teardownReveal();
    this._modal.dismiss();
  }

  public ngOnDestroy(): void {
    this._teardownReveal();
  }

  public onShowPin(): void {
    const selectedCard = this._store.state.selectedCard;

    if (!selectedCard?.cardId || !selectedCard?.cardHolderId) {
      return;
    }

    this.isPinDisplayActive = true;
    const bubbles = this._loader.show();

    this._requestSubscription = this._service
      .requestPinDisplay(selectedCard)
      .subscribe({
        next: (data) => {
          bubbles.then((el) => el?.dismiss());
          void this._handlePinDisplayAuthorization(data);
        },
        error: () => {
          this.isPinDisplayActive = false;
          bubbles.then((el) => el?.dismiss());
          this._alert.generic();
        }
      });
  }

  private _clearPinDisplaySecrets(): void {
    this._store.patch({
      encryptedPinDisplay: undefined,
      pinDisplaySessionId: undefined
    });
    // Wipe the native key slot too: without it the ciphertext is inert.
    void this._securePinDisplay.clearSession();
  }

  private async _handlePinDisplayAuthorization(
    data: CardAuthResponseDto
  ): Promise<void> {
    if (data.status !== RiskAssessmentStatusCode.Ok) {
      this.isPinDisplayActive = false;
      this._clearPinDisplaySecrets();
      this._alert.generic();
      return;
    }

    if (data.signatureContext[0]?.signatureMeans !== ChallengeTypes.Pin) {
      this.isPinDisplayActive = false;
      this._clearPinDisplaySecrets();
      // T3: tell the user instead of failing silently.
      this._alert.generic();
      return;
    }

    try {
      const request = this._summaryService.getPaymentSigningRequest(data);
      const modal = await this._signService.openSigninModal(
        request,
        PageNames.CardPinDisplay,
        ''
      );
      const dismissData = await modal?.onWillDismiss();
      if (dismissData?.data?.success) {
        await this._revealPin();
      } else {
        this._clearPinDisplaySecrets();
        this.isPinDisplayActive = false;
      }
    } catch (err) {
      this._clearPinDisplaySecrets();
      this.isPinDisplayActive = false;
    }
  }

  /**
   * R5: JS hands the ENCRYPTED blocks to the native plugin, which decrypts with the
   * session key it has kept since prepareSession. No plaintext PIN in JS, none on the
   * bridge. Rects are captured just-in-time so the overlay aligns with the HTML boxes.
   */
  private async _revealPin(): Promise<void> {
    const encryptedPinDisplay = this._store.state.encryptedPinDisplay;
    const sessionId = this._store.state.pinDisplaySessionId;

    if (
      !encryptedPinDisplay?.encryptedPinCode?.pinBlock ||
      !encryptedPinDisplay?.panBlockHex ||
      !sessionId
    ) {
      this._clearPinDisplaySecrets();
      this.isPinDisplayActive = false;
      this._alert.generic();
      return;
    }

    // R12: gate the reveal on runtime integrity. Wire this to the existing
    // jailbreak-detection / raspbinder plugin API before merging; the reveal must not
    // proceed on a compromised device even if the app was allowed to start.
    // TODO(R12): const safe = await this._integrity.assertSafeDevice();
    //            if (!safe) { this._clearPinDisplaySecrets(); ... return; }

    const rects = this.pinBoxes.map((box) => {
      const rect = box.nativeElement.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y
      };
    });

    this._revealSubscription = this._securePinDisplay
      .show({
        devicePixelRatio: window.devicePixelRatio,
        durationSeconds: this.showPinViewModel.durationSeconds,
        encryptedPinBlockHex: encryptedPinDisplay.encryptedPinCode.pinBlock,
        panBlockHex: encryptedPinDisplay.panBlockHex,
        rects,
        sessionId
      })
      .subscribe({
        next: (event) => {
          switch (event.event) {
            case SecurePinDisplayEventName.Shown:
              this.pinVisible = true;
              this.remainingSeconds = this.showPinViewModel.durationSeconds;
              break;
            case SecurePinDisplayEventName.Tick:
              this.remainingSeconds = event.remainingSeconds ?? 0;
              break;
            default:
              this.pinVisible = false;
              this.remainingSeconds = 0;
              break;
          }
        },
        complete: () => {
          this.isPinDisplayActive = false;
          // The ciphertext is single-use: the native key is already wiped.
          this._store.patch({
            encryptedPinDisplay: undefined,
            pinDisplaySessionId: undefined
          });
        },
        error: () => {
          this.isPinDisplayActive = false;
          this.pinVisible = false;
          this.remainingSeconds = 0;
          this._clearPinDisplaySecrets();
          this._alert.generic();
        }
      });
  }

  private _teardownReveal(): void {
    this._requestSubscription?.unsubscribe();
    this._requestSubscription = undefined;
    this._revealSubscription?.unsubscribe();
    this._revealSubscription = undefined;
    this._securePinDisplay.hide();
    this._clearPinDisplaySecrets();
    this.isPinDisplayActive = false;
    this.pinVisible = false;
    this.remainingSeconds = 0;
  }
}
