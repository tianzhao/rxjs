const log = console.log;
const returnCode = request => (Number.isInteger(request) ? 200 : 400);
const fakeRequest = request =>
  of({ code: returnCode(request) }).pipe(
    tap(_ => log(request)),
    delay(1000)
  );

const apiCalls$ = concat(
  fakeRequest(1),
  fakeRequest('invalid payload'),
  fakeRequest(2) //this won't execute as every will return false for previous line
).pipe(
  every(e => e.code === 200),
  tap(e => log(`all request successful: ${e}`))
);

apiCalls$.subscribe();

