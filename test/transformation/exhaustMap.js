
const sourceInterval = interval(1000);
const delayedInterval = sourceInterval.pipe(delay(10), take(4));

const exhaustSub = merge(
  // delay 10ms, then start interval emitting 4 values
  delayedInterval,
  // emit immediately
  of(true)
)
  .pipe(exhaustMap(_ => sourceInterval.pipe(take(5))))
  /*
   *  The first emitted value (of(true)) will be mapped
   *  to an interval observable emitting 1 value every
   *  second, completing after 5.
   *  Because the emissions from the delayed interval
   *  fall while this observable is still active they will be ignored.
   *
   *  Contrast this with concatMap which would queue,
   *  switchMap which would switch to a new inner observable each emission,
   *  and mergeMap which would maintain a new subscription for each emitted value.
   */
  // output: 0, 1, 2, 3, 4
  .subscribe(val => console.log(val));

