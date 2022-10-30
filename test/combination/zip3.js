const documentEvent = eventName =>
  fromEvent(document, eventName).pipe(
    map((e) => ({ x: e.clientX, y: e.clientY }))
  );

zip(documentEvent('mousedown'), documentEvent('mouseup')).subscribe(e =>
  console.log(JSON.stringify(e))
);

