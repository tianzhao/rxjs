interval(1000)
  .pipe(
    mergeMap(v =>
      iif(
        () => !!(v % 2),
        of(v)
        // if not supplied defaults to EMPTY
      )
    )
    // output: 1,3,5...
  )
  .subscribe(console.log);

