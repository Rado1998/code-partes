import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';

import { PlatformService, AuthService, LoadingService, ConfigService } from '@services/index';
import { FinishOrderModal, ForgotPasswordModal } from '@modals/index';
import { checkedCheckboxValidator } from '@validators/checkbox.validator';
import { calendarRu } from '@utils/calendar-ru';

import { BasketProduct } from '../product-details/product-details.models';
import { Pharm } from '../basket/basket.models';

import { MakeOrderService } from './make-order.service';
import { Subject, Observable, throwError, Subscription, of, timer } from 'rxjs';
import { takeUntil, finalize, map, catchError, switchMap } from 'rxjs/operators';
import {
  MakeOrderModel,
  MakeOrderBasketElement,
  DeliveryAddress,
  DeliveryPriceData,
  DeliveryPeriodsData,
  DeliveryPeriodsResponse,
  DeliveryPeriodsTypes,
  DeliveryPeriod,
  DeliveryPricePeriod
} from './make-order.models';
import { User, RouteStep } from '../../../models/models';
import { MainService } from '../main.service';
import { UserRegistrationModel } from '../main.models';
import { UserAddress } from '../personal-area/personal-area.models';

import { emailPattern } from '@core/patterns';


@Component({
  selector: 'make-order-view',
  templateUrl: 'make-order.view.html',
  styleUrls: ['make-order.view.scss']
})
export class MakeOrderView implements OnInit, OnDestroy {
  private _unsubscribe$: Subject<void> = new Subject<void>();
  private _userInfoSubscription: Subscription = new Subscription();
  private _deliveryPriceSubscription: Subscription = new Subscription();
  private _deliveryPrice: number = 0;
  private _deliveryPeriodPrice: number = 0;
  private _isAccepted: boolean = false;
  private _deliveryPeriodsTypes: DeliveryPeriodsTypes = {} as DeliveryPeriodsTypes;
  private _deliveryPricePeriod: DeliveryPricePeriod = {} as DeliveryPricePeriod;
  public payNowPrice: number = 0;
  public payLaterPrice: number = 0;
  public userDeliveryAddresses: UserAddress[] = [];
  public isUserRegistered: boolean = false;
  public bigTotalPrice: boolean = false;
  public deliveryPeriods: DeliveryPeriod[] = [];
  public activeTab: number = 1;
  public isAvailableDelivery: boolean = false;
  public contactForm: FormGroup;
  public shippForm: FormGroup;
  public basketProducts: BasketProduct[] = [];
  public totalPrice: number;
  public totalProductsPrice: number;
  public pharm: Pharm = {} as Pharm;
  public codePrefix: string = '7';
  public paymentFormControl = new FormControl('cash');
  public isShowPassword: boolean = false;
  public isShowRegisterCheckbox: boolean = false;
  public isEmailNotFound: boolean = false;
  public isShowDeliveryPrice: boolean = false;
  public termsOfUseControl = new FormControl(null, [Validators.required, checkedCheckboxValidator]);
  public isRegisterUserControl = new FormControl(null, [checkedCheckboxValidator]);
  public error: string;
  public routeSteps: RouteStep[] = [];
  public calendarRu;
  public isAvailablePeriods: boolean = false;
  public maxDate: Date = new Date();
  public minDate: Date = new Date();


  constructor(
    private _fb: FormBuilder,
    private _platformService: PlatformService,
    private _makeOrderService: MakeOrderService,
    private _authService: AuthService,
    private _toastrService: ToastrService,
    private _router: Router,
    private _mainService: MainService,
    private _matDialog: MatDialog,
    private _loadingService: LoadingService,
    private _configService: ConfigService
  ) {
    this.calendarRu = calendarRu;
    this._setCalendarMinMaxDates();
  }

  ngOnInit() {
    this._formBuilder();
    this._checkUserAuthState();
    this._setRouteSteps();
    this._getSelectedPharm();
    this._getBasketProducts();
    this._countTotalPrice();
    this._getDeliveryPeriods();
    this._getUserInfo();
  }

  private _formBuilder(): void {
    this.contactForm = this._fb.group({
      name: [null, Validators.required],
      email: [null, [Validators.required, Validators.pattern(emailPattern)]],
      phone: [null, Validators.required]
    })

    this.shippForm = this._fb.group({
      city: [null, Validators.required],
      street: [null, Validators.required],
      apartment: [null],
      house: [null],
      porch: [null],
      floor: [null],
      office: [null],
      domaphore: [null],
      comment: [null],
      deliveryDate: [new Date(), Validators.required],
      deliveryTimeInterval: [null, Validators.required],
    })

    this.shippForm.statusChanges
      .pipe(
        takeUntil(this._unsubscribe$),
        switchMap((status: string) => {
          if (status.toLowerCase() === 'valid') {
            return this._getDeliveryPrice(false)
              .pipe(
                map((data) => {
                  if (data && data.period) {
                    const price = data.period.price4client
                    this._deliveryPrice = Number(price);
                    this.isShowDeliveryPrice = true;
                  }
                  else {
                    this.isShowDeliveryPrice = true;
                    this._deliveryPrice = 0;
                  }
                  this._countTotalPrice();
                }),
                catchError((err) => {
                  this.isShowDeliveryPrice = false;
                  this._deliveryPrice = 0;
                  return throwError(err);
                })
              )
          }
          return of();
        }))
      .subscribe();

    this.shippForm.get('deliveryDate').valueChanges
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe((value: Date) => {
        if (value) {
          const today = new Date();
          const compare = value.getDate() - today.getDate();
          if (this._deliveryPeriodsTypes) {
            switch (compare) {
              case 0: {
                this.deliveryPeriods = (this._deliveryPeriodsTypes.today) ? this._deliveryPeriodsTypes.today : [];
                break;
              }
              case 1: {
                this.deliveryPeriods = (this._deliveryPeriodsTypes.tomorrow) ? this._deliveryPeriodsTypes.tomorrow : [];
                break;
              }
              case 2: {
                this.deliveryPeriods = (this._deliveryPeriodsTypes.thedayaftertomorrow) ? this._deliveryPeriodsTypes.thedayaftertomorrow : [];
                break;
              }
            }
          }
          else {
            this.deliveryPeriods = [];
          }
        }
        else {
          this.deliveryPeriods = [];
        }
        this._countPayNowAndPayLaterPrices();

      })
  }

  private _getUserInfo(): void {
    this._userInfoSubscription = this._authService.getUserInfo()
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe((data: User) => {
        if (data) {
          this._setUserData(data);
        }
      })
  }

  private _getUserDeliveryAddresses(): Observable<void> {
    return this._mainService.getUserAddresses()
      .pipe(
        takeUntil(this._unsubscribe$),
        map((data) => {
          const addresses = data.addresses;
          if (addresses && addresses.length > 0) {
            this._addUserDeliveryAddressessControl();
          }
          this.userDeliveryAddresses = addresses;
        })
      )
  }

  private _addUserDeliveryAddressessControl(): void {
    const disabled: boolean = this.shippForm.disabled;
    this.shippForm.addControl('userDeliveryAddress', new FormControl({ value: null, disabled: disabled }));
    this.shippForm.get('userDeliveryAddress').valueChanges
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe((value) => {
        this.shippForm.patchValue({
          city: value.delivery_address_city,
          street: value.delivery_address_street,
          apartment: value.delivery_address_apartment,
          house: value.delivery_address_house,
          porch: value.delivery_address_porch,
          floor: value.delivery_address_floor,
          office: value.delivery_address_office,
          domaphore: value.delivery_address_intercom,
          comment: value.delivery_address_comment
        })
      })
  }


  private _setCalendarMinMaxDates(daysCount: number = 2, minDate = new Date()): void {
    const today: Date = new Date();
    this.minDate = minDate;
    this.maxDate.setDate(today.getDate() + daysCount);
  }

  private _setUserData(user: User): void {
    this.contactForm.patchValue({
      name: user.name,
      phone: user.phone,
      email: user.email
    })
  }

  private _getBasketProducts(): void {
    let parsedProducts: BasketProduct[] = [];
    let basketProducts: string;
    if (this._platformService.isPlatformBrowser) {
      basketProducts = localStorage.getItem('basket_products');
      if (basketProducts) {
        parsedProducts = JSON.parse(basketProducts);
      }
    }
    this.basketProducts = parsedProducts;
    this._checkisAllProductsDeliveryAvailable();
  }

  private _countPayNowAndPayLaterPrices(): void {
    const payType: string = this.paymentFormControl.value;
    if (payType == 'card') {
      this.payNowPrice = this.totalPrice + this._deliveryPeriodPrice;
      this.payLaterPrice = 0;
    }
    else if (payType == 'cash') {
      this.payLaterPrice = this.totalPrice + this._deliveryPeriodPrice;
      this.payNowPrice = 0;
    }
  }

  private _checkUserAuthState(): void {
    this._authService.getAuthState()
      .pipe(
        takeUntil(this._unsubscribe$),
        switchMap((value) => {
          if (value && value.isAuthorized) {
            this._setIsShowPassword(false);
            this.isShowRegisterCheckbox = false;
            this._setIsUserRegistered(true);
            return this._getUserDeliveryAddresses();
          }
          else {
            this.userDeliveryAddresses = [];
            this.onFocutOutInEmail();
            return of();
          }
        })
      )
      .subscribe()
  }

  private _getSelectedPharm(): void {
    let pharm: string;
    let parsedPharm: Pharm = {} as Pharm;
    if (this._platformService.isPlatformBrowser) {
      pharm = localStorage.getItem('selected_pharm');
      if (pharm) {
        try {
          parsedPharm = JSON.parse(pharm);

        } catch (error) {
          this._router.navigate(['/']);
        }
      }
      else {
        this._router.navigate(['/']);
      }
    }
    this.pharm = parsedPharm;
  }

  private _countTotalPrice(): void {
    this.totalPrice = 0;
    this.totalProductsPrice = 0;
    this.bigTotalPrice = false;
    this.basketProducts.map((element: BasketProduct, index: number) => {
      this.totalProductsPrice += element.count * (+element.product.stocks.price);
    })
    if (this.totalProductsPrice >= 10000) {
      this.bigTotalPrice = true;
    }
    this.totalPrice = this.totalProductsPrice + this._deliveryPrice;
  }

  private _makeOrder(): Observable<void> {
    this.error = undefined;
    this._loadingService.showLoading();
    let basketElements: MakeOrderBasketElement[] = [];
    basketElements = this.basketProducts.map((element: BasketProduct, index: number) => {
      return {
        goodsId: element.product.good.id,
        quantity: String(element.count),
      }
    })
    let sendingData: MakeOrderModel = {} as MakeOrderModel;
    sendingData.store_id = this.pharm.id;
    sendingData.delivery_type = "booking";
    sendingData.basket = basketElements;
    sendingData.payment_type = this.paymentFormControl.value;
    sendingData.name = this.contactForm.get('name').value;
    sendingData.phone = this.codePrefix + this.contactForm.get('phone').value;
    sendingData.sums = {
      productsPrice: this.totalProductsPrice,
      totalPrice: this.totalPrice
    };
    if (this.activeTab === 1) {
      sendingData.delivery_type = 'booking';
    }
    if (this.activeTab === 2) {
      sendingData.sums.deliveryPrice = this._deliveryPrice;
      sendingData.delivery_type = 'courier';
      sendingData.delivery_address = this.deliveryAdress;
      sendingData.period = this._deliveryPricePeriod;
    }
    if (this.activeTab == 1 || (this.activeTab == 2 && this._isAccepted)) {
      this._loadingService.showLoading();
      return this._makeOrderService.makeOrder(sendingData)
        .pipe(
          takeUntil(this._unsubscribe$),
          finalize(() => {
            timer(2000).subscribe(() => {
              this._loadingService.hideLoading();
            })
          }),
          map((data) => {
            if (data && data.success) {
              this._toastrService.success('Ваш заказ успешно оформлен !', '', {
                positionClass: 'toast-top-full-width',
                messageClass: 'text-center'
              });
              const isRegister: boolean = this.isRegisterUserControl.value;
              const isAuthorized: boolean = this._authService.getAuthStateSync();
              if (this._platformService.isPlatformBrowser) {
                localStorage.setItem('basket_products', '');
              }
              this._mainService.changeBasketProducts.next([]);
              this.basketProducts = [];
              if (this.isUserRegistered || isRegister || isAuthorized) {
                this._router.navigate(['/personal-area/my-orders'])
              }
              else {
                this._router.navigate(['/']);
              }
            }
          }),
          catchError((err) => {
            let error = err.error;
            this.error = (error) ? error.text : 'Ошибка';
            this._toastrService.error(this.error, '', {
              positionClass: 'toast-top-full-width',
              messageClass: 'text-center'
            });
            this._isAccepted = false;
            return throwError(err);
          })
        )
    }
    if (this.activeTab == 2 && !this._isAccepted) {
      return this._getDeliveryPrice()
        .pipe(
          takeUntil(this._unsubscribe$),
          map((data) => {
            console.log(data);
            const price = data.period.price4client;
            this._deliveryPricePeriod = data.period;
            this._deliveryPrice = Number(price);
            this._openFinishOrderModal();
          })
        )
    }
  }

  private _getDeliveryPrice(isShowLoading: boolean = true): Observable<{ period: DeliveryPricePeriod }> {
    if (isShowLoading) {
      this._loadingService.showLoading();
    }
    let basketElements: MakeOrderBasketElement[] = [];
    basketElements = this.basketProducts.map((element: BasketProduct, index: number) => {
      return {
        goodsId: element.product.good.id,
        quantity: String(element.count),
      }
    })
    const deliveryPriceData: DeliveryPriceData = {
      delivery_address: this.deliveryAdress,
      store_id: this.pharm.id,
      region_id: this._mainService.currentCity.regionCode,
      period: this.shippForm.get('deliveryTimeInterval').value,
      basket: basketElements,
      delivery_type: "courier",
      payment_type: this.paymentFormControl.value,
      sums: {
        productsPrice: this.totalProductsPrice,
      }
    }

    return this._makeOrderService.getDeliveryPrice(deliveryPriceData)
      .pipe(
        finalize(() => this._loadingService.hideLoading()),
        takeUntil(this._unsubscribe$)
      )
  }

  private _setRouteSteps(): void {
    this.routeSteps = [
      { label: 'Главная', routerLink: '/' },
      { label: 'Корзина', routerLink: '/basket' },
      { label: 'Оформить заказ', routerLink: '/make-order' }
    ]
  }

  private _checkisAllProductsDeliveryAvailable(): void {
    let flag: boolean = true;
    this.basketProducts.map((element: BasketProduct, index: number) => {
      if (element.product.good.deliveryAvailable != '1') {
        flag = false;
      }
    })
    this.isAvailableDelivery = flag;
    if (!this.isAvailableDelivery) {
      this.shippForm.disable();
    }
  }

  private _getDeliveryPeriods(): void {
    this._loadingService.showLoading();
    this.isAvailablePeriods = false;
    const regionId: string = this._mainService.currentCity.regionCode;
    const city: string = this._mainService.currentCity.name_ru;
    const deliveryPeriodsData: DeliveryPeriodsData = {
      city,
      region_id: regionId,
      store_id: this.pharm.id,
      sums: {
        productsPrice: this.totalProductsPrice
      }
    }
    this._makeOrderService.getDeliveryPeriods(deliveryPeriodsData)
      .pipe(
        takeUntil(this._unsubscribe$),
        finalize(() => this._loadingService.hideLoading())
      )
      .subscribe((data: DeliveryPeriodsResponse) => {
        this.shippForm.get('deliveryTimeInterval').reset();
        this._deliveryPeriodsTypes = data.periods;
        const today = new Date();
        if (this._deliveryPeriodsTypes) {
          this.isAvailablePeriods = true;
          if (this._deliveryPeriodsTypes.today) {
            this.deliveryPeriods = this._deliveryPeriodsTypes.today;
            this.shippForm.get('deliveryDate').patchValue(new Date(), { emitEvent: false })
          }
          else if (this._deliveryPeriodsTypes.tomorrow) {
            this.deliveryPeriods = this._deliveryPeriodsTypes.tomorrow;
            const day = new Date().setDate(today.getDate() + 1);
            this.shippForm.get('deliveryDate').patchValue(new Date(day), { emitEvent: false });
          }
          else if (this._deliveryPeriodsTypes.thedayaftertomorrow) {
            this.deliveryPeriods = this._deliveryPeriodsTypes.thedayaftertomorrow;
            const day = new Date().setDate(today.getDate() + 2);
            this.shippForm.get('deliveryDate').patchValue(new Date(day), { emitEvent: false });
          }
          else {
            this.deliveryPeriods = [];
          }
        }
        else {
          this.deliveryPeriods = [];
          this.isAvailablePeriods = false;
          this.shippForm.disable();
        }
      })
  }

  private _checkEmail(): void {
    const email: string = this.contactForm.get('email').value;
    this._makeOrderService.checkEmail(email)
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe((data) => {
        this.isEmailNotFound = false;
        if (data.status === 'registered') {
          this._setIsShowPassword(true);
          this._setIsUserRegistered(true);
          this.isShowRegisterCheckbox = false;
        }
        else {
          this._setIsShowPassword(false);
          this._setIsUserRegistered(false);
          this.isShowRegisterCheckbox = true;
        }

      }, (error) => {
        this.isEmailNotFound = true;
        this.isShowRegisterCheckbox = true;
        this._setIsUserRegistered(false);
        this._setIsShowPassword(false);
      })
  }

  private _getTokens(): Observable<any> {
    let request: Observable<any>;
    const email: string = this.contactForm.get('email').value;
    if (this.isUserRegistered) {
      const password: string = this.contactForm.get('password').value;
      this._userInfoSubscription.unsubscribe();
      request = this._mainService.userLogin(email, password, false);
    }
    else {
      const sendingData: UserRegistrationModel = {} as UserRegistrationModel;
      sendingData.email = email;
      sendingData.termOfUse = '1';
      const { phone, name } = this.contactForm.value;

      sendingData.phone = '7' + phone;
      sendingData.name = name;
      const isRegister: boolean = this.isRegisterUserControl.value;
      sendingData.reg_type = (isRegister) ? 'email' : 'none';
      request = this._mainService.userRegistration(sendingData);
    }
    return request
  }

  private _setIsShowPassword(isShow: boolean): void {
    if (isShow) {
      this.contactForm.addControl('password', new FormControl(null, [Validators.required, Validators.minLength(6)]));
    }
    else {
      this.contactForm.removeControl('password');
    }
    this.isShowPassword = isShow;
  }

  private _setIsUserRegistered(isRegistered: boolean): void {
    if (isRegistered) {
      this.termsOfUseControl.setValidators([]);
    }
    else {
      this.termsOfUseControl.setValidators([Validators.required, checkedCheckboxValidator]);
    }
    this.termsOfUseControl.updateValueAndValidity();
    this.isUserRegistered = isRegistered;
  }

  private get deliveryAdress(): DeliveryAddress {
    const deliveryAdress: DeliveryAddress = {
      city: this.shippForm.get('city').value,
      comment: this.shippForm.get('comment').value,
      apartment: this.shippForm.get('apartment').value,
      street: this.shippForm.get('street').value,
      floor: this.shippForm.get('floor').value,
      house: this.shippForm.get('house').value,
      office: this.shippForm.get('office').value,
      intercom: this.shippForm.get('domaphore').value,
      porch: this.shippForm.get('porch').value
    }
    return deliveryAdress;
  }

  private _openFinishOrderModal(): void {
    const dialogRef = this._matDialog.open(FinishOrderModal,
      {
        maxHeight: '80vh',
        maxWidth: '80vw',
        data: {
          totalPrice: this.totalProductsPrice,
          deliveryPrice: this._deliveryPrice,
          payment: this.paymentFormControl.value,
          deliveryPeriodPrice: this._deliveryPeriodPrice
        }
      })
    dialogRef.afterClosed()
      .subscribe((data: { isAccepted: boolean }) => {
        this._isAccepted = (data && data.isAccepted) ? data.isAccepted : false;
        if (data && data.isAccepted) {
          this._makeOrder().subscribe();
        }
        else {
          this._isAccepted = false;
        }
      })
  }

  public onFocutOutInEmail(): void {
    const isValid: boolean = this.contactForm.get('email').valid;
    const isAuthorized: boolean = this._authService.getAuthStateSync();
    if (isValid && !isAuthorized) {
      this._checkEmail();
    }
  }

  public onFocutOutInPassword(): void {
    const isEmailValid: boolean = this.contactForm.get('email').valid;
    const isAuthorized: boolean = this._authService.getAuthStateSync();

    if (isEmailValid && !isAuthorized && this.isUserRegistered) {
      const isPasswordValid: boolean = this.contactForm.get('password').valid;
      if (isPasswordValid) {
        const password: string = this.contactForm.get('password').value;
        const email: string = this.contactForm.get('email').value;
        this._mainService.userLogin(email, password, false).subscribe();
      }
    }
  }


  public onClickTab(tabNumber: number): void {
    this.activeTab = tabNumber;
    if (tabNumber == 1) {
      this._deliveryPeriodPrice = 0;
      this.shippForm.get('deliveryTimeInterval').reset();
    }
  }

  public onClickMakeOrder(): void {
    let isValid: boolean = (this.activeTab === 1) ? this.contactForm.valid : (this.shippForm.valid && this.contactForm.valid);
    if (isValid) {
      const isAuthorized = this._authService.getAuthStateSync();
      if (!isAuthorized) {
        this._getTokens().pipe(
          switchMap((data) => {
            return this._makeOrder()
          }),
          catchError((err) => {
            const error = err.error;
            const message = error.text || 'Ошибка';
            this.error = message;
            return throwError(err);
          })
        ).subscribe();
      }
      else {
        this._makeOrder().subscribe();
      }
    }
  }

  public onClickForgotPassword(): void {
    const { email } = this.contactForm.value;
    this._matDialog.open(ForgotPasswordModal, {
      width: '550px',
      maxHeight: '80vh',
      maxWidth: '80vw',
      panelClass: ['no-padding-modal'],
      data: {
        email: email
      }
    })
  }

  get disabled(): boolean {
    if (this.activeTab == 1) {
      return this.contactForm.invalid || this.contactForm.disabled || this.termsOfUseControl.invalid;
    }
    if (this.activeTab == 2) {
      return this.shippForm.invalid || this.contactForm.invalid || !this.isAvailableDelivery || this.shippForm.disabled || this._loadingService.getLoadingStateSync() || this.termsOfUseControl.invalid;
    }
  }

  get deliveryPrice(): number {
    return this._deliveryPrice;
  }

  get phone(): string {
    const { phone } = this._configService.getStaticConfigSync();
    return phone;
  }

  ngOnDestroy() {
    this._deliveryPriceSubscription.unsubscribe();
    this._unsubscribe$.next();
    this._unsubscribe$.complete();
  }
}