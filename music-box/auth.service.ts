import { Injectable } from '@angular/core';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { map, catchError, filter } from 'rxjs/operators';
import { CookieService } from 'ngx-cookie';
import { Router } from '@angular/router';
import { User } from '../models/index';
import { UserRole } from '../models/model';
import { MenuService } from './menu.service';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private _isAuthorized: boolean = false;
    private _authorizationState$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(null);
    private _user: User;
    private _userState$: BehaviorSubject<User> = new BehaviorSubject<User>(null);
    private _userRole: UserRole;

    constructor(
        private _httpClient: HttpClient,
        private _cookieService: CookieService,
        private _menuService: MenuService,
        private _router: Router
    ) { }


    public checkAccessToken(isAuthModuleLoaded: boolean): Observable<boolean> {
        return this._httpClient.get<{ role: UserRole }>('user/about')
            .pipe(
                map((data) => {
                    let role: UserRole = data.role;
                    if (role.toLowerCase() === 'superadmin') {
                        role = 'Admin';
                    }
                    this._cookieService.put('role', role);
                    this.setAuthState(true);
                    this.setUserRole(role);
                    if (isAuthModuleLoaded) {
                        this._router.navigate(['/']);
                        return false;
                    }
                    return true;
                }),
                catchError((err) => {
                    this.setAuthState(false);
                    this._router.navigate(['/auth/login']);
                    return throwError(false);
                })
            );
    }

    public setAuthState(isAuthorized: boolean): void {
        this._isAuthorized = isAuthorized;
        this._authorizationState$.next(isAuthorized);
        if (!isAuthorized) {
            this._cookieService.remove('accessToken');
            this._cookieService.remove('refreshToken');
            this._cookieService.remove('role');
            this.setUser({} as User);
        }
    }

    public setUser(user: User): void {
        this._user = user;
        this._userState$.next(user);
    }

    public setUserRole(role: UserRole): void {
        this._userRole = role;
        this._menuService.setNavItemsByUserRole(role);
    }

    public redirectByRole(role?: UserRole): void {
        const userRole: UserRole = (role) ? role : this._userRole;
        if (userRole.toLowerCase() === 'admin' || userRole.toLowerCase() === 'superadmin') {
            this._router.navigate(['/admins']);
        } else if (userRole.toLowerCase() === 'restaurant') {
            this._router.navigate(['/orders']);
        } else {
            this.setAuthState(false);
            this.setUser({} as User);
            this._router.navigate(['/auth/login']);
        }
    }

    public getAuthState(): Observable<boolean> {
        return this._authorizationState$.asObservable();
    }

    public getUserInfo(role: string): Observable<User> {
        return this._httpClient.get<User>(`${role.toLowerCase()}/info`)
            .pipe(
                map((data) => {
                    this.setUser(data);
                    return data;
                })
            );
    }

    public getAuthStateSync(): boolean {
        return this._isAuthorized;
    }

    public getUser(): Observable<User> {
        return this._userState$.asObservable()
            .pipe(
                filter((value) => value != null)
            );
    }

    public getUserSync(): User {
        return this._user;
    }

    public getUserRoleSync(): UserRole {
        return this._userRole;
    }

}
