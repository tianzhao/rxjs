
const fakeRequest = of('response').pipe(delay(2000));

// output:
// ['response'],
// ['response','response'],
// ['response','response','response'],
// etc...

interval(1000)
  .pipe(
    mergeMap(_ => fakeRequest),
    scan((all, current) => [...all, current], [])
  )
  .subscribe(console.log);

