import { inject, Injectable, OnDestroy } from '@angular/core';
import { Store } from '@mbbe/core';
import { UserService } from '@mbbe/user';
import { Subscription } from 'rxjs';
import { CardPinDisplaySignResponseDto } from './dto/card-signing.dto';
import { CardsConfigurationData } from './models/cards-configuration.model';
import {
  CardsDashboardCard,
  CardsDashboardCardList
} from './models/cards-dashboard.model';

/**
 * R13: this store holds NO secrets. encryptedPinDisplay is ciphertext only (useless
 * without the session key, which lives exclusively in native plugin memory) and
 * pinDisplaySessionId is an opaque handle. The previous plain session key hex field
 * (pinDisplaySessionKeyHex) has been removed deliberately — do not reintroduce it.
 */
export interface CardsDashboardState {
  cardList: CardsDashboardCardList | undefined;
  cardsConfiguration: CardsConfigurationData | undefined;
  encryptedPinDisplay: CardPinDisplaySignResponseDto | undefined;
  isTemporaryUnFreeze: boolean | undefined;
  pinDisplaySessionId: string | undefined;
  selectedCard: CardsDashboardCard | undefined;
}

const defaultState: CardsDashboardState = {
  cardList: undefined,
  cardsConfiguration: undefined,
  encryptedPinDisplay: undefined,
  isTemporaryUnFreeze: false,
  pinDisplaySessionId: undefined,
  selectedCard: undefined
};

@Injectable({ providedIn: 'root' })
export class CardsDashboardStore
  extends Store<CardsDashboardState>
  implements OnDestroy
{
  private _logoutSubscription: Subscription;
  private _user = inject(UserService);

  constructor() {
    super(defaultState);
    this._logoutSubscription = this._user.logout$.subscribe(() => {
      this.reset();
    });
  }

  public override ngOnDestroy(): void {
    super.ngOnDestroy();
    this._logoutSubscription.unsubscribe();
  }
}
