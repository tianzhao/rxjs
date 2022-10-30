
const listener = merge(
  fromEvent(document, 'mousedown').pipe(mapTo(false)),
  fromEvent(document, 'mousemove').pipe(mapTo(true))
)
  .pipe(sample(fromEvent(document, 'mouseup')))
  .subscribe(isDragging => {
    console.log('Were you dragging?', isDragging);
  });

