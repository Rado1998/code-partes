import {
    HttpInterceptor,
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpHeaders,
    HttpParams
} from '@angular/common/http';
import { Inject, Injectable, Optional } from '@angular/core';
import { REQUEST } from '@nguniversal/express-engine/tokens';

import { Observable } from 'rxjs';
import { CookieService } from 'ngx-cookie';
import { MainService } from '../views/main/main.service';

function checkIsFullPath(path: string): boolean {
    return path.includes('assets') || path.startsWith('http://') || path.startsWith('https://F');
}

@Injectable()
export class ApiInterceptor implements HttpInterceptor {

    constructor(
        @Inject('BASE_URL') private _baseUrl: string,
        private _mainService: MainService,
        private _cookieService: CookieService
    ) {
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        let clonedReq = req.clone();
        if (!checkIsFullPath(req.url)) {
            let httpHeaders: HttpHeaders = req.headers;
            let httpParams: HttpParams = req.params;
            const regionCode: string = (this._mainService.currentCity && this._mainService.currentCity.regionCode) ? this._mainService.currentCity.regionCode : null;
            if (regionCode) {
                httpParams = httpParams.set(`filter[region_id]`, regionCode);
            }
            //Angular 12 USE CONTEXT ISTEAD
            if (req.params.get('isAuthorized') === 'true') {
                httpParams = req.params.delete('isAuthorized');
                let token: string = this._cookieService.get('accessToken') || '';
                httpHeaders = httpHeaders.append('Content-Type', 'application/json');
                if (token)
                    httpHeaders = httpHeaders.append('Authorization', token)
            }
            clonedReq = req.clone({
                url: `${this._baseUrl}${req.url}`,
                headers: httpHeaders,
                params: httpParams
            });
        }
        return next.handle(clonedReq);

    }
}