
// switch to new inner observable when source emits, emit result of project function
let subscribe = timer(0, 5000)
  .pipe(
    switchMap(
      _ => interval(2000),
      (outerValue, innerValue, outerIndex, innerIndex) => ({
        outerValue,
        innerValue,
        outerIndex,
        innerIndex
      })
    )
  )
  /*
    Output:
    {outerValue: 0, innerValue: 0, outerIndex: 0, innerIndex: 0}
    {outerValue: 0, innerValue: 1, outerIndex: 0, innerIndex: 1}
    {outerValue: 1, innerValue: 0, outerIndex: 1, innerIndex: 0}
    {outerValue: 1, innerValue: 1, outerIndex: 1, innerIndex: 1}
*/
  .subscribe(console.log);

