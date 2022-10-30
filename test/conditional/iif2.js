const r$ = of(`I'm saying R!!`);
const x$ = of(`X's always win!!`);

fromEvent(document, 'mousemove')
  .pipe(
    throttleTime(50),
    filter((move) => move.clientY < 210),
    map((move) => move.clientY),
    mergeMap(yCoord => iif(() => yCoord < 110, r$, x$))
  )
  .subscribe(console.log);

