
fromEvent(document, 'mousemove')
  .pipe(
    bufferToggle(fromEvent(document, 'mousedown'), _ =>
      fromEvent(document, 'mouseup')
    )
  )
  .subscribe(console.log);
