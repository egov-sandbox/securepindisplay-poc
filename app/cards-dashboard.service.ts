import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_ENDPOINT, I18nService } from '@mbbe/core';
import { SecurePinDisplayProvider } from '@mbbe/core/native/public-api';
import { SecurePinDisplayPreparedSession } from '@mbbe/core/native/types/public-api';
import { UserService } from '@mbbe/user';
import {
  forkJoin,
  from,
  map,
  Observable,
  of,
  switchMap,
  tap,
  throwError
} from 'rxjs';
import { CardsDashboardStore } from 'src/app/features/cards-dashboard/cards-dashboard.store';
import { CardOperationType } from '../constants/card-operation-type';
// ... (unchanged imports for DTOs/models kept as in v1.0)
import {
  CardAuthRequestDto,
  CardAuthResponseDto
} from '../dto/card-authorization.dto';
import {
  CardPinDisplayRequestDto,
  CardPinDisplayResponseDto
} from '../dto/card-pin-display.dto';
import {
  CardsDashboardCard,
  CardsDashboardCardList
} from '../models/cards-dashboard.model';

@Injectable()
export class CardsDashboardService {
  private _apiEndpoints = inject(API_ENDPOINT);
  private _http = inject(HttpClient);
  private _i18n = inject(I18nService);
  private _securePinDisplay = inject(SecurePinDisplayProvider);
  private _store = inject(CardsDashboardStore);
  private _user = inject(UserService);

  // ... fetchCardSettingsData / getIndividualCardList / setCard* methods unchanged from v1.0

  /**
   * R5/R13 remediation: the session key is generated and kept NATIVE. JS receives only
   * the RSA-wrapped blob for the API call and an opaque sessionId, which is stored so
   * the reveal step can reference the native key slot. No secret enters the store.
   */
  public requestPinDisplay(
    selectedCard: CardsDashboardCard
  ): Observable<CardAuthResponseDto> {
    const worldlineKey = this._store.state.cardsConfiguration?.worldlineKey;
    this._store.patch({
      encryptedPinDisplay: undefined,
      pinDisplaySessionId: undefined
    });

    if (!worldlineKey) {
      // T1: configuration missing — fail fast, never encrypt under an empty key.
      return throwError(() => new Error('MISSING_WORLDLINE_KEY'));
    }

    return from(this._securePinDisplay.prepareSession(worldlineKey)).pipe(
      switchMap((session: SecurePinDisplayPreparedSession) => {
        this._store.patch({ pinDisplaySessionId: session.sessionId });
        return this._http.post<CardPinDisplayResponseDto>(
          this._apiEndpoints.CardPinDisplayRequest,
          this._getPinDisplayRequest(selectedCard, session)
        );
      }),
      switchMap((res: CardPinDisplayResponseDto) => {
        return this._authorizeCardOperation(
          this._getAuthorizationRequest(
            CardOperationType.CardPinDisplay,
            res.payload?.requestId
          )
        );
      })
    );
  }

  private _authorizeCardOperation(
    request: CardAuthRequestDto
  ): Observable<CardAuthResponseDto> {
    return this._http.post<CardAuthResponseDto>(
      this._apiEndpoints.CardAuthorization,
      request
    );
  }

  private _getAuthorizationRequest(
    operationType: CardOperationType,
    requestId: string | undefined
  ): CardAuthRequestDto {
    const parsedRequestId = Number.parseInt(requestId ?? '', 10);
    return {
      header: {},
      payload: {
        personID: this._user.info.personId,
        operationType,
        operationId: Number.isNaN(parsedRequestId)
          ? ''
          : parsedRequestId.toString()
      }
    };
  }

  private _getPinDisplayRequest(
    selectedCard: CardsDashboardCard,
    session: SecurePinDisplayPreparedSession
  ): CardPinDisplayRequestDto {
    return {
      header: {},
      payload: {
        cardHolderId: selectedCard.cardHolderId,
        cardId: selectedCard.cardId,
        encryptedSessionKey: {
          // Same wire field as v1.0; the value now originates from native code.
          encryptedData: session.encryptedSessionKeyHex
        }
      }
    };
  }
}
