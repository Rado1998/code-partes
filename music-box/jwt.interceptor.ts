import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, map, finalize, switchMap, take, filter } from 'rxjs/operators';
import { CookieService } from 'ngx-cookie';

import { Router } from '@angular/router';
import { TokenResponse } from '../models/auth';
import { environment } from 'src/environments/environment';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
    private _updateTokenEvent$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(null);
    private _updateTokenState: Observable<boolean>;
    private _loading: boolean = false;

    constructor(
        private _httpClient: HttpClient,
        private _cookieService: CookieService,
        private _router: Router
    ) {
        this._updateTokenState = this._updateTokenEvent$.asObservable();
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(req)
            .pipe(
                catchError((err) => {
                    const status: number = err.status;
                    const error = err.error;
                    if ((status === 401 || error.status === 401 || status === 404) && req.url === `${environment.apiUrl}refresh`) { //ToDO fixing
                        return throwError(err);
                    }
                    if (status === 401 || error.status === 401) {
                        if (!this._loading) {
                            this._updateToken();
                        }
                        return this._updateTokenState
                            .pipe(
                                filter(token => token != null),
                                take(1),
                                switchMap((isUpdated) => {
                                    if (!!isUpdated) {
                                        return next.handle(this._setNewHeaders(req));
                                    }
                                    else if (isUpdated === false) {
                                        this._router.navigate(['/auth/login']);
                                        return throwError(false);
                                    }
                                }),
                            )
                    }
                    const message = this._getErrorMessage(error);
                    return throwError({ error: err, message: message });
                })
            );
    }

    private _updateToken(): void {
        let params = new HttpParams();
        let headers = new HttpHeaders();
        const refreshToken = this._cookieService.get('refreshToken');
        params = params.set('authorization', 'false');
        this._loading = true;
        if (refreshToken) {
            headers = headers.append('Authorization', 'Bearer ' + this._cookieService.get('refreshToken'));
            this._httpClient.post<TokenResponse>('refresh', {}, { params, headers })
                .pipe(
                    finalize(() => this._loading = false),
                    map((data: TokenResponse) => {
                        const tokens = data;
                        this._updateCookies(tokens);
                        this._updateTokenEvent$.next(true);
                    }),
                    catchError((err) => {
                        this._router.navigate(['/auth/login']);
                        this._updateTokenEvent$.next(false);
                        return throwError(false);
                    })
                )
                .subscribe();
        }
        else {
            this._loading = false;
            this._router.navigate(['/auth/login']);
        }
    }

    private _updateCookies(data: TokenResponse): void {
        this._cookieService.put('accessToken', data.accessToken);
    }

    private _getErrorMessage(error): string {
        let message: string = 'Something is wrong';
        try {
            message = error.errorMessage[0];
        } catch (error) {
            message = 'Something is wrong';
        }

        return message;
    }

    private _setNewHeaders(req: HttpRequest<any>): HttpRequest<any> {
        let httpHeaders: HttpHeaders = req.headers;
        httpHeaders = httpHeaders.delete('Authorization');
        httpHeaders = httpHeaders.append('Authorization', 'Bearer ' + this._cookieService.get('accessToken') || '')
        const clonedReq = req.clone({
            headers: httpHeaders
        })
        return clonedReq;
    }
}
