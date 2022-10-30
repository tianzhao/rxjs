
// emit 3, 3, 3, 9, 1, 4, 5, 8, 96, 3, 66, 3, 3, 3
const source$ = of(3, 3, 3, 9, 1, 4, 5, 8, 96, 3, 66, 3, 3, 3);

// allow values until value from source equals 3, then complete
source$
  .pipe(takeWhile(it => it === 3))
  // log: 3, 3, 3
  .subscribe(val => console.log('takeWhile', val));

source$
  .pipe(filter(it => it === 3))
  // log: 3, 3, 3, 3, 3, 3, 3
  .subscribe(val => console.log('filter', val));

