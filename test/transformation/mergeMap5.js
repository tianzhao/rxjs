
// emit value every 1s
const source$ = interval(1000);

let subscribe = source$
  .pipe(
    mergeMap(
      // project
      val => interval(5000).pipe(take(2)),
      // resultSelector
      (oVal, iVal, oIndex, iIndex) => [oIndex, oVal, iIndex, iVal],
      // concurrent
      2
    )
  )
  /*
        Output:
        [0, 0, 0, 0] <--1st inner observable
        [1, 1, 0, 0] <--2nd inner observable
        [0, 0, 1, 1] <--1st inner observable
        [1, 1, 1, 1] <--2nd inner observable
        [2, 2, 0, 0] <--3rd inner observable
        [3, 3, 0, 0] <--4th inner observable
*/
  .subscribe(val => console.log(val));

