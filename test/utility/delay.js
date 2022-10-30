
const mousedown$ = fromEvent(document, 'mousedown');
const mouseup$ = fromEvent(document, 'mouseup');

mousedown$
  .pipe(mergeMap(event => of(event).pipe(delay(700), takeUntil(mouseup$))))
  .subscribe(event => console.log('Long Press!', event));

