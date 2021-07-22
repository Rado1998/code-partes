import { Component, OnInit, OnDestroy, ViewEncapsulation, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { QuestionsService } from '../../../../core/services';
import { takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Component({
    selector: 'app-progress',
    templateUrl: 'progress.component.html',
    styleUrls: ['progress.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ProgressComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('progressLine', { static: false }) private _progressLineElement: ElementRef;
    @ViewChild('dot', { static: false }) private _dotElement: ElementRef;
    private _activePartId: number;
    private _unsubscribe$: Subject<void> = new Subject<void>();
    public activePartIndex: number = 1;
    public partsCount: number;
    public partsArr = [];

    constructor(private _questionsService: QuestionsService) {
        this._setParts();
    }

    ngOnInit() {
        this._handlePartProgressEvent();
    }

    ngAfterViewInit() {
        this._setProgressStyle();
    }

    private _setParts(): void {
        const parts = this._questionsService.getQuestionsPartsSync();
        for (let i = 0; i < parts.length; i++) {
            const { id } = parts[i];
            this.partsArr.push(id);
        }
    }

    private _handlePartProgressEvent(): void {
        this._questionsService.getQuestionProgress()
            .pipe(takeUntil(this._unsubscribe$))
            .subscribe((data) => {
                this._activePartId = data.activePart.id;
                this.activePartIndex = this.partsArr.findIndex((id: number) => id === this._activePartId);
                this._setProgressStyle();
            })
    }

    private _setProgressStyle(): void {
        if (this._progressLineElement && this._dotElement) {
            const lineWidth: number = (100 / (this.partsArr.length - 1)) * (this.activePartIndex);
            this._progressLineElement.nativeElement.style.width = `${lineWidth}%`;
            this._dotElement.nativeElement.style.left = (lineWidth) ? `calc(${lineWidth}% - 13px)` : `0`;
        }
    }

    ngOnDestroy() {
        this._unsubscribe$.next();
        this._unsubscribe$.complete();
    }
}