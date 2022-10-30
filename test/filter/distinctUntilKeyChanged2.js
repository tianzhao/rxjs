
const keys$ = fromEvent(document, 'keyup')
  .pipe(
    distinctUntilKeyChanged('code'),
    pluck('key')
  );

keys$.subscribe(console.log);

