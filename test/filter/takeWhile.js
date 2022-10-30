
//emit 1,2,3,4,5
const source$ = of(1, 2, 3, 4, 5);

//allow values until value from source is greater than 4, then complete
source$
  .pipe(takeWhile(val => val <= 4))
  // log: 1,2,3,4
  .subscribe(val => console.log(val));

