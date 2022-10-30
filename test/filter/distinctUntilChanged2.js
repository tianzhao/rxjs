
const sampleObject = { name: 'Test' };

//Objects must be same reference
const source$ = from([sampleObject, sampleObject, sampleObject]);

// only emit distinct objects, based on last emitted value
source$
  .pipe(distinctUntilChanged())
  // output: {name: 'Test'}
  .subscribe(console.log);

