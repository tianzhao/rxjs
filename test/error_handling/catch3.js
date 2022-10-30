
const fakeRequest$ = of().pipe(
  tap(_ => console.log('fakeRequest')),
  throwError
);

const iWillContinueListening$ =
  fromEvent(document.getElementById('continued'), 'click')
    .pipe(
      switchMap(_ =>
        fakeRequest$.pipe(
          catchError(_ => of('keep on clicking!!!'))
        ))
    );

const iWillStopListening$ =
  fromEvent(document.getElementById('stopped'), 'click')
    .pipe(
      switchMap(_ => fakeRequest$),
      catchError(_ => of('no more requests!!!'))
    );

iWillContinueListening$.subscribe(console.log);
iWillStopListening$.subscribe(console.log);

