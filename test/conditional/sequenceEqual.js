const expectedSequence = from([4, 5, 6]);

of([1, 2, 3], [4, 5, 6], [7, 8, 9])
  .pipe(switchMap(arr => from(arr).pipe(sequenceEqual(expectedSequence))))
  .subscribe(console.log);

//output: false, true, false

