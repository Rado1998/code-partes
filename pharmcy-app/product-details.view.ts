import { Component, OnInit, OnDestroy, Inject, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { MatDialog } from '@angular/material';

import {
    SliderProductsResponse,
    Product,
    Coordinates,
    RouteStep,
    BreadCrump,
    UserLocation
} from '@models/models';

import { AuthService, ToastrService, PlatformService } from '@services/index';
import { ActionModal, ProductOrderModal } from '@modals/index';

import { Subject, Observable, forkJoin, of } from 'rxjs';
import { takeUntil, map, switchMap, finalize } from 'rxjs/operators';

import {
    ProductModel,
    ListStocksModel,
    StoreStockModel,
    StoreStock,
    BasketProduct,
    AnalogueProduct,
    BasketPharm
} from './product-details.models';
import { ProductDetailsService } from './product-details.service';
import { MainService } from '../main.service';
import { GoodStock, SeoData } from '../main.models';

@Component({
    selector: 'product-details-view',
    templateUrl: 'product-details.view.html',
    styleUrls: ['product-details.view.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ProductDetailsView implements OnInit, OnDestroy {
    private _unsubscribe$: Subject<void> = new Subject<void>();
    private _coorinates: Coordinates = {} as Coordinates;
    private _productId: string;
    private _pharmId: string;
    private _productStock: GoodStock;
    public productDetail: ProductModel = {} as ProductModel;
    public countControl: FormControl = new FormControl({ value: 1, disabled: true });
    public analogueProducts: AnalogueProduct[] = [];
    public analogueProductsLoading: boolean = false;
    public skeletionItems: Product[] = [];
    public seenProducts: Product[] = [];
    public storeStocks: StoreStock[] = [];
    public routeSteps: RouteStep[] = [];
    public isOpenStoreStocks: boolean = true;
    public loading: boolean = false;
    public storeStocksLoading: boolean = false;
    public isGetSliderElements: boolean = false;
    public productPrice: number = null;
    public isProductInPharm: boolean = false;
    public isProductOnOrder: boolean = false;

    constructor(
        private _productDetailsService: ProductDetailsService,
        private _mainService: MainService,
        private _authService: AuthService,
        private _activatedRoute: ActivatedRoute,
        @Inject('FILE_URL') public fileUrl: string,
        private _toastrService: ToastrService,
        private _router: Router,
        private _platformService: PlatformService,
        private _title: Title,
        private _meta: Meta,
        private _matDialog: MatDialog
    ) {
        this._initDefultValue();
    }

    ngOnInit() {
        this._getUserLocation();
        this._checkRouteParams();
        this._getSliderProducts();
    }

    private _initDefultValue(): void {
        for (let index = 0; index < 6; index++) {
            this.skeletionItems.push({} as Product);
        }
        this.routeSteps = [
            { label: 'Главная', routerLink: '/' }
        ]
    }

    private _getSliderProducts(): void {
        this.isGetSliderElements = false;
        this._mainService.getSliderProducts([1, 2])
            .pipe(takeUntil(this._unsubscribe$))
            .subscribe((data: SliderProductsResponse) => {
                this.isGetSliderElements = true;
            });

    }

    private _getAnalogueProducts(productId: string): Observable<void> {
        this.analogueProductsLoading = true;
        return this._productDetailsService.getAnalogueProducts(productId)
            .pipe(
                takeUntil(this._unsubscribe$),
                finalize(() => this.analogueProductsLoading = false),
                map((data: AnalogueProduct[]) => {
                    this.analogueProducts = data;
                })
            );
    }

    private _resetProperties(): void {
        this.productDetail = {} as ProductModel;
        this.isOpenStoreStocks = true;
        this.storeStocks = [];
        this.routeSteps = [
            { label: 'Главная', routerLink: '/' }
        ]
        this.countControl.patchValue(1);
    }

    private _saveBasketProducts(pharm?: StoreStock): void {
        let basketProducts: string = '';
        if (this._platformService.isPlatformBrowser) {
            basketProducts = localStorage.getItem('basket_products') || '';
        }
        let parsedProducts: BasketProduct[] = [];
        if (basketProducts) {
            parsedProducts = JSON.parse(basketProducts);
        }
        let productIndex: number = this._checkIsHaveProductOnBasket(parsedProducts, this.productDetail.good);
        if (productIndex != -1) {
            parsedProducts[productIndex].count = this.countControl.value;
        }
        else {
            let basketProductDetail: ProductModel = this.productDetail;
            basketProductDetail.stocks.price = String(this.productPrice);
            let basketProduct: BasketProduct = {
                product: basketProductDetail,
                count: this.countControl.value,
                pharm: {} as BasketPharm
            }
            if (pharm) {
                basketProduct.pharm = {
                    id: pharm.store_id,
                    name: pharm.name,
                    address: pharm.address,
                    lat: pharm.lat,
                    lon: pharm.lon,
                    phoneNumber: pharm.phoneNumber,
                    region: pharm.region,
                    workTime: pharm.workTime
                };
            } else {
                if (this.isProductInPharm) {
                    basketProduct.pharm = {
                        id: this._productStock.store_id,
                        name: this._productStock.name,
                        address: this._productStock.address,
                        lat: this._productStock.lat,
                        lon: this._productStock.lon,
                        phoneNumber: this._productStock.phoneNumber,
                        region: this._productStock.region,
                        workTime: this._productStock.workTime
                    };
                }
            }
            parsedProducts.push(basketProduct);
        }
        this._mainService.changeBasketProducts.next(parsedProducts);
        if (this._platformService.isPlatformBrowser) {
            localStorage.setItem('basket_products', JSON.stringify(parsedProducts));
        }
        this._toastrService.success('Товар добавлен в корзину')
    }

    private _checkIsHaveProductOnBasket(basketProducts: BasketProduct[], product: Product): number {
        let productIndex: number = -1;
        basketProducts.map((element, index) => {
            if (element.product.good.id === product.id) {
                productIndex = index;
            }
        })
        return productIndex;
    }

    private _checkRouteParams(): void {
        this._activatedRoute.params
            .pipe(
                takeUntil(this._unsubscribe$),
                switchMap((params: { productId: string }) => {
                    this._resetProperties();
                    this._productId = params.productId;
                    return this._getProducyById(params.productId);
                })
            )
            .pipe(
                switchMap(() => this._getAnalogueProducts(this._productId))
            )
            .subscribe();
    }

    private _getProducyById(productId: string): Observable<void | unknown> {
        this.loading = true;
        return this._productDetailsService.getProductById(productId, 'id')
            .pipe(
                finalize(() => this.loading = false),
                switchMap((productData) => {
                    const { good } = productData;
                    if (!good) {
                        this._router.navigate(['/not-found']);
                        return of();
                    }
                    this._setProductData(productData);
                    this._pharmId = this._getPharmId();
                    let requests = [this._getListStocks()]
                    if (this._pharmId) {
                        requests.push(this._getProductStocks(this._pharmId, [productData.good.id]))
                    }
                    return forkJoin(requests)
                        .pipe(map((_) => { }));
                })
            )
    }

    private _checkSeenProducts(product: Product): void {
        if (this._platformService.isPlatformBrowser) {
            const seenProducts: string = localStorage.getItem('seenProducts') || '';
            let parsedProducts: Product[] = [];
            product.orig_price = String(this.productPrice);
            if (seenProducts) {
                try {
                    parsedProducts = JSON.parse(seenProducts) || [];
                    let findex: number = parsedProducts.findIndex((element) => element.id === product.id);
                    if (findex == -1) {
                        parsedProducts.push(product);
                        localStorage.setItem('seenProducts', JSON.stringify(parsedProducts))
                    }
                } catch (error) {
                    parsedProducts = [];
                    parsedProducts.push(product)
                    localStorage.setItem('seenProducts', JSON.stringify(parsedProducts))
                }
            }
            else {
                parsedProducts = [];
                parsedProducts.push(product);
                localStorage.setItem('seenProducts', JSON.stringify(parsedProducts))
            }
            this.seenProducts = parsedProducts;
        }
    }

    private _getListStocks(): Observable<void> {
        this.storeStocksLoading = true;
        let params: ListStocksModel = new ListStocksModel();
        params.id = this.productDetail.good.id;
        params.lat = String(this._coorinates.lat);
        params.lon = String(this._coorinates.lon);
        return this._productDetailsService.getListStocks(params)
            .pipe(
                finalize(() => this.storeStocksLoading = false),
                takeUntil(this._unsubscribe$),
                map(
                    (data: StoreStockModel) => {
                        this.storeStocks = data.storestocks;
                        if (!this._pharmId) {
                            if (this.storeStocks && this.storeStocks.length > 0) {
                                let stocks = this.storeStocks;
                                stocks.sort((a, b) => Number(a.ecomPrice) - Number(b.ecomPrice));
                                const productStockPrice = stocks[0].ecomPrice;
                                this.productPrice = Number(productStockPrice);
                            }
                            else {
                                this.productPrice = Number(this.productDetail.stocks.min);
                                this.isProductOnOrder = true;
                            }
                        }
                        this._checkSeenProducts(this.productDetail.good);
                    }
                ))

    }

    private _getUserLocation(): void {
        this._mainService.userLocation
            .pipe(takeUntil(this._unsubscribe$))
            .subscribe((location: UserLocation) => {
                if (location) {
                    this._coorinates = location;
                }
            })
    }

    private _getPharmId(): string {
        let pharmId: string = this._activatedRoute.snapshot.queryParamMap.get('pharmId');
        return pharmId;
    }

    private _getProductStocks(storeId: string, productIds: string[]): Observable<void> {
        return this._mainService.getStoreStocks(storeId, productIds)
            .pipe(
                map((productStocks) => {
                    let productStockPrice: string;
                    if (productStocks && productStocks.goodsstocks) {
                        try {
                            let stocks = productStocks.goodsstocks;
                            stocks.sort((a, b) => Number(b.ecomPrice) - Number(a.ecomPrice));
                            productStockPrice = stocks[0].ecomPrice;
                            this._productStock = stocks[0];
                            this.productPrice = Number(productStockPrice);
                            this.isProductInPharm = true;
                            this.isProductOnOrder = false;
                        }
                        catch (e) {
                            this.isProductInPharm = false;
                            this.isProductOnOrder = true;
                            this.productPrice = Number(this.productDetail.stocks.min);
                        }
                    }
                    else {
                        this.isProductInPharm = false;
                        this.isProductOnOrder = false;
                        this.productPrice = Number(this.productDetail.stocks.min);
                    }
                    return;
                }));
    }

    private _setProductData(productData: ProductModel): void {
        if (productData) {
            this.productDetail = productData;
            const { good } = this.productDetail;
            if (good) {
                const seoData: SeoData = {
                    seo_title: good.seo_title,
                    seo_description: good.seo_description,
                    seo_keywords: good.seo_keywords
                };
                this._mainService.setSeoData(seoData);
                let breadcrumps: BreadCrump[] = productData.good.breadcrump;
                if (breadcrumps && breadcrumps.length > 0) {
                    breadcrumps.map((element, index) => {
                        this.routeSteps.push({
                            label: element.name,
                            routerLink: `/catalog/` + ((element.alias) ? element.alias : element.id)
                        })
                    });
                }
            }
        }
    }

    private _openActionModal(): void {
        this._matDialog.open(ActionModal, {
            width: '550px',
            maxHeight: '80vh',
            maxWidth: '80vw',
            panelClass: ['no-padding-modal']
        });
    }

    private _openProductOrderModal(): void {
        this._matDialog.open(ProductOrderModal, {
            width: '550px',
            maxHeight: '80vh',
            maxWidth: '80vw',
            panelClass: ['no-padding-modal'],
            data: this.productDetail
        });
    }

    public onClickBasket(pharm?: StoreStock): void {
        this._saveBasketProducts(pharm);
    }

    public onClickPrice(): void {
        this.isOpenStoreStocks = !this.isOpenStoreStocks;
    }

    public increment(): void {
        let count: number = this.countControl.value;
        count += 1;
        this.countControl.patchValue(count);
    }

    public decrement(): void {
        let count: number = this.countControl.value;
        if (count == 1) {
            return;
        }
        count = count - 1;
        this.countControl.patchValue(count);

    }

    public onClickProductOrder(): void {
        let isAuthorized: boolean = this._authService.getAuthStateSync();
        if (isAuthorized) {
            this._openProductOrderModal();
        }
        else {
            this._openActionModal();
        }
    }

    get medDrug(): string {
        if (this.productDetail && this.productDetail.good && this.productDetail.good.medDrug) {
            return this.productDetail.good.medDrug;
        }
        else {
            return null;
        }
    }

    ngOnDestroy() {
        this._unsubscribe$.next();
        this._unsubscribe$.complete();
        this._meta.removeTag('description');
    }
}