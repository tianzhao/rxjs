const eventTime = eventName =>
  fromEvent(document, eventName).pipe(map(() => new Date()));

const mouseClickDuration = zip(
  eventTime('mousedown'),
  eventTime('mouseup')
).pipe(map(([start, end]) => Math.abs(start.getTime() - end.getTime())));

mouseClickDuration.subscribe(console.log);

