import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { QuestionsService } from '../../../core/services';
import { IQuestion, IQuestionData, IQuestionProgressShort } from '../../../core/models/question.models';
import { FormGroup, FormBuilder, FormControl } from '@angular/forms';

@Component({
    selector: 'question-view',
    templateUrl: 'question.view.html',
    styleUrls: ['question.view.scss'],
    encapsulation: ViewEncapsulation.None
})
export class QuestionView implements OnInit, OnDestroy {
    private _questionId: number;
    private _unsubscribe$: Subject<void> = new Subject<void>();
    private _question: IQuestion;
    public questionType: string;
    public questionData: IQuestionData[];
    public progressInfoShort: IQuestionProgressShort;
    public questionForm: FormGroup;


    constructor(
        private _activatedRoute: ActivatedRoute,
        private _questionsService: QuestionsService,
        private _router: Router,
        private _fb: FormBuilder
    ) {
        this._checkQueryParams();
        this._handleQuestionProgress();
    }

    ngOnInit() { }

    private _checkQueryParams(): void {
        this._activatedRoute.params
            .pipe(takeUntil(this._unsubscribe$))
            .subscribe((params) => {
                const questionId: string = params.questionId;
                const partId: string = this._activatedRoute.snapshot.queryParamMap.get('partId');
                if (isNaN(Number(questionId))) {
                    this._router.navigate(['/not-found']);
                    return;
                }
                this._questionId = Number(questionId);
                this._question = this._questionsService.getQuestionById(this._questionId, partId);

                if (!this._question) {
                    this._router.navigate(['/not-found']);
                }
                else {
                    this.questionData = this._question.data;
                    this.questionType = this._question.type;
                }
                this._initForm();
            })
    }

    private _handleQuestionProgress(): void {
        this._questionsService.getQuestionProgress()
            .pipe(takeUntil(this._unsubscribe$))
            .subscribe((data) => {
                this.progressInfoShort = {
                    partName: data.activePart.partName,
                    activeQuestionIndex: data.activeQuestionIndex + 1,
                    questionsCount: data.activePart.questions.length
                }
            })
    }

    private _initForm(): void {
        this.questionForm = this._fb.group({});
        this.questionData.map((element, index) => {
            this.questionForm.addControl(`question${index}`, new FormControl());
        })
    }

    public onClickNextQuestion(): void {
        const { nextQuestion, nextPart } = this._questionsService.answerQuestion(this._questionId, {});
        if (!nextQuestion) {
            if (!nextPart) {
                alert('Completed');
            }
            else {
                this._router.navigate(['/main/introduction'], { queryParams: { partId: nextPart.id } });
            }
            return;
        }
        console.log(this.questionForm.value);
        this._router.navigate(['/main/question', nextQuestion.id], { queryParamsHandling: 'merge' })
    }

    ngOnDestroy() {
        this._unsubscribe$.next();
        this._unsubscribe$.complete();
    }
}